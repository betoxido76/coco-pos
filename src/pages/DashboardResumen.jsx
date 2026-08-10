// Dashboard → tab "Resumen". Replica los reportes de la hoja RESUMEN del libro
// de ventas del cliente, sin la columna Kg (no se mide en el sistema).
//
// Fuentes: `ventas` para facturación y número de NE; `venta_items` para unidades
// (cantidad_primaria, ya normalizada a la unidad primaria). Se excluyen las
// ventas anuladas.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { fmt, fmtNum, GRIS_OTROS, colorCategoria } from '../lib/dataviz'

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
    'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE']

const SIN_CAT = 'Sin categoría'
const PAGE = 1000

// Variación relativa. null cuando la base es 0: un crecimiento porcentual sobre
// cero no significa nada y mostrar "∞" o "100%" engañaría.
// Equivalente en USD de un cobro y del pago directo asentado en la venta.
// Mismo criterio que CuentasCobrar: las ventas de contado y las migradas del POS
// anterior no tienen filas en `cobros`, su pago vive en la propia venta.
const cobroEnUsd = (c) => Number(c.monto_usd || 0) + Number(c.monto_bs || 0) / Number(c.tasa_cambio || 1)
const pagoDirectoEnUsd = (v) => Number(v.pagoUsd || 0) + Number(v.pagoBs || 0) / Number(v.tasaCambio || 1)

const variacion = (nuevo, viejo) => (!viejo || viejo === 0) ? null : (nuevo - viejo) / viejo

const th = { padding: '9px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', whiteSpace: 'nowrap' }
const td = { padding: '9px 14px', fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' }
const selectStyle = { padding: '8px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }
const card = { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '24px' }

function Titulo({ children, sub }) {
    return (
        <div style={{ marginBottom: '10px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{children}</h3>
            {sub && <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>{sub}</p>}
        </div>
    )
}

// Celda de variación: verde si crece, rojo si cae, gris si no hay base
function Var({ v }) {
    if (v == null) return <span style={{ color: '#d1d5db' }}>—</span>
    const color = v > 0.0001 ? '#16a34a' : v < -0.0001 ? '#e34948' : '#6b7280'
    return <span style={{ color, fontWeight: 600 }}>{v > 0 ? '+' : ''}{(v * 100).toFixed(1)}%</span>
}

export default function TabResumen() {
    const { perfil } = useAuth()
    const anioActual = new Date().getFullYear()

    const [anio, setAnio] = useState(anioActual)
    const [mesBase, setMesBase] = useState(new Date().getMonth()) // 0-11
    const [ventas, setVentas] = useState([])       // { anio, mes, total, cat1 }
    const [unidades, setUnidades] = useState({})   // { venta_id: unidades }
    const [cobros, setCobros] = useState({})       // { venta_id: cobrado USD }
    const [items, setItems] = useState([])         // líneas de venta, para el detalle por producto
    const [pagProd, setPagProd] = useState(0)
    const [pagCli, setPagCli] = useState(0)
    const [tamCli, setTamCli] = useState(25)
    const [tamProd, setTamProd] = useState(25)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Se cargan dos años: el seleccionado y el anterior, que hace falta para YOY y YTD
    useEffect(() => {
        if (!perfil?.empresa_id) return
        let cancel = false
        async function cargar() {
            setLoading(true); setError('')
            try {
                const desde = `${anio - 1}-01-01T00:00:00`
                const hasta = `${anio}-12-31T23:59:59.999`

                const { data: cats } = await supabase.from('categorias_clientes')
                    .select('id, nombre').eq('empresa_id', perfil.empresa_id)
                const cm = {}; (cats || []).forEach(c => { cm[c.id] = c.nombre })

                let from = 0, vAll = []
                while (true) {
                    const { data, error: e } = await supabase.from('ventas')
                        .select('id, created_at, total, estado_cobro, fecha_vencimiento_pago, pago_usd, pago_bs, tasa_cambio, cliente_id, clientes(nombre, cat1_id)')
                        .eq('empresa_id', perfil.empresa_id)
                        .gte('created_at', desde).lte('created_at', hasta)
                        .range(from, from + PAGE - 1)
                    if (e) throw e
                    vAll = vAll.concat(data || [])
                    if (!data || data.length < PAGE) break
                    from += PAGE
                }

                let ifrom = 0, iAll = []
                while (true) {
                    const { data, error: e } = await supabase.from('venta_items')
                        .select('venta_id, producto_id, cantidad, cantidad_primaria, precio_unitario, ventas!inner(created_at, estado_cobro), productos_terminados(nombre, sku)')
                        .eq('empresa_id', perfil.empresa_id)
                        .gte('ventas.created_at', desde).lte('ventas.created_at', hasta)
                        .range(ifrom, ifrom + PAGE - 1)
                    if (e) throw e
                    iAll = iAll.concat(data || [])
                    if (!data || data.length < PAGE) break
                    ifrom += PAGE
                }

                if (cancel) return
                // Línea a línea: hace falta el detalle por producto además del
                // total de unidades por venta.
                const lineas = iAll
                    .filter(i => i.ventas?.estado_cobro !== 'anulado')
                    .map(i => {
                        const d = new Date(i.ventas.created_at)
                        const cant = Number(i.cantidad || 0)
                        return {
                            ventaId: i.venta_id,
                            anio: d.getFullYear(), mes: d.getMonth(),
                            productoId: i.producto_id,
                            nombre: i.productos_terminados?.nombre || 'Sin nombre',
                            sku: i.productos_terminados?.sku || '',
                            unidades: i.cantidad_primaria != null ? Number(i.cantidad_primaria) : cant,
                            facturacion: cant * Number(i.precio_unitario || 0),
                        }
                    })
                // Cobros de las ventas del año elegido (los del año anterior no
                // hacen falta: cobranzas solo reporta el año del filtro).
                const idsAnio = vAll
                    .filter(v => new Date(v.created_at).getFullYear() === anio && v.estado_cobro !== 'anulado')
                    .map(v => v.id)
                const cob = {}
                for (let i = 0; i < idsAnio.length; i += 300) {
                    const { data: cs } = await supabase.from('cobros')
                        .select('venta_id, monto_usd, monto_bs, tasa_cambio')
                        .in('venta_id', idsAnio.slice(i, i + 300))
                    cs?.forEach(c => { cob[c.venta_id] = (cob[c.venta_id] || 0) + cobroEnUsd(c) })
                }
                setCobros(cob)

                const u = {}
                lineas.forEach(l => { u[l.ventaId] = (u[l.ventaId] || 0) + l.unidades })
                setItems(lineas)
                setUnidades(u)
                setVentas(vAll
                    .filter(v => v.estado_cobro !== 'anulado')
                    .map(v => {
                        const d = new Date(v.created_at)
                        return {
                            id: v.id, anio: d.getFullYear(), mes: d.getMonth(),
                            total: Number(v.total || 0),
                            estadoCobro: v.estado_cobro,
                            fechaVenc: v.fecha_vencimiento_pago,
                            pagoUsd: v.pago_usd, pagoBs: v.pago_bs, tasaCambio: v.tasa_cambio,
                            clienteId: v.cliente_id,
                            cliente: v.clientes?.nombre || 'Sin cliente',
                            cat1: v.clientes?.cat1_id ? (cm[v.clientes.cat1_id] || SIN_CAT) : SIN_CAT,
                        }
                    }))
            } catch (e) {
                if (!cancel) { console.error('Error cargando resumen:', e); setError(e.message || 'Error cargando datos') }
            } finally { if (!cancel) setLoading(false) }
        }
        cargar()
        return () => { cancel = true }
    }, [perfil?.empresa_id, anio])

    // ─── Agregados por (año, mes) ───
    const porMes = useMemo(() => {
        const m = {}
        ventas.forEach(v => {
            const k = `${v.anio}-${v.mes}`
            const a = m[k] || (m[k] = { unidades: 0, facturacion: 0, pedidos: 0 })
            a.unidades += unidades[v.id] || 0
            a.facturacion += v.total
            a.pedidos += 1
        })
        return m
    }, [ventas, unidades])

    const celda = (a, mes) => porMes[`${a}-${mes}`] || { unidades: 0, facturacion: 0, pedidos: 0 }
    const acumulado = (a, hastaMes) => {
        let unidades = 0, facturacion = 0
        for (let i = 0; i <= hastaMes; i++) { const c = celda(a, i); unidades += c.unidades; facturacion += c.facturacion }
        return { unidades, facturacion }
    }
    const ticket = (c) => c.unidades > 0 ? c.facturacion / c.unidades : 0

    // ─── Tabla 1: ventas del año ───
    const filasAnio = useMemo(() => MESES.map((nombre, i) => ({ nombre, ...celda(anio, i) })), [porMes, anio])
    const totalAnio = filasAnio.reduce((s, f) => ({
        unidades: s.unidades + f.unidades, facturacion: s.facturacion + f.facturacion,
    }), { unidades: 0, facturacion: 0 })

    // ─── Crecimiento ───
    const mesPrevio = mesBase === 0 ? 11 : mesBase - 1
    const anioPrevioMes = mesBase === 0 ? anio - 1 : anio
    const comparativos = [
        {
            clave: 'MOM', titulo: 'Mes contra mes (MOM)',
            sub: `${MESES[mesPrevio]} ${anioPrevioMes} → ${MESES[mesBase]} ${anio}`,
            etiquetaVieja: `${MESES[mesPrevio]} ${anioPrevioMes}`, etiquetaNueva: `${MESES[mesBase]} ${anio}`,
            viejo: celda(anioPrevioMes, mesPrevio), nuevo: celda(anio, mesBase),
        },
        {
            clave: 'YOY', titulo: 'Año contra año (YOY)',
            sub: `mismo mes del año anterior`,
            etiquetaVieja: `${MESES[mesBase]} ${anio - 1}`, etiquetaNueva: `${MESES[mesBase]} ${anio}`,
            viejo: celda(anio - 1, mesBase), nuevo: celda(anio, mesBase),
        },
        {
            clave: 'YTD', titulo: 'Acumulado del año (YTD)',
            sub: `enero–${MESES[mesBase].toLowerCase()} contra el mismo período`,
            etiquetaVieja: `${anio - 1} (ene–${MESES[mesBase].slice(0, 3).toLowerCase()})`,
            etiquetaNueva: `${anio} (ene–${MESES[mesBase].slice(0, 3).toLowerCase()})`,
            viejo: acumulado(anio - 1, mesBase), nuevo: acumulado(anio, mesBase),
        },
    ]

    // ─── Tablas por Categoría 1 ───
    const categorias = useMemo(() => {
        const set = new Set()
        ventas.filter(v => v.anio === anio).forEach(v => set.add(v.cat1))
        return [...set].sort((a, b) => a.localeCompare(b))
    }, [ventas, anio])

    const porMesCat = useMemo(() => {
        const m = {}
        ventas.filter(v => v.anio === anio).forEach(v => {
            const k = `${v.mes}|${v.cat1}`
            const a = m[k] || (m[k] = { pedidos: 0, facturacion: 0 })
            a.pedidos += 1
            a.facturacion += v.total
        })
        return m
    }, [ventas, anio])

    const celdaCat = (mes, cat) => porMesCat[`${mes}|${cat}`] || { pedidos: 0, facturacion: 0 }

    // Totales del año por categoría, para las tortas
    const totalPorCat = (campo) => categorias.map(c => ({
        name: c,
        value: MESES.reduce((s, _, i) => s + celdaCat(i, c)[campo], 0),
    })).filter(e => e.value > 0)

    // Un solo mapa de color para las dos tablas y las dos tortas. El ranking
    // canónico es por facturación del año: así una categoría conserva su color
    // aunque en pedidos ocupe otra posición. El color sigue a la entidad, no al
    // ranking de la métrica que se esté mirando.
    const colorPorCat = useMemo(() => {
        const facturado = {}
        totalPorCat('facturacion').forEach(e => { facturado[e.name] = e.value })
        const orden = [...categorias].sort((a, b) => (facturado[b] || 0) - (facturado[a] || 0) || a.localeCompare(b))
        const m = {}
        orden.forEach((nombre, i) => { m[nombre] = colorCategoria(i) })
        return m
    }, [porMesCat, categorias])

    // Las categorías que exceden el máximo de hues caen a "Otros" en gris.
    const agrupar = (campo) => {
        const entradas = totalPorCat(campo)
        const conColor = entradas.filter(e => colorPorCat[e.name] !== GRIS_OTROS)
        const sobrantes = entradas.filter(e => colorPorCat[e.name] === GRIS_OTROS)
        const base = conColor.sort((a, b) => b.value - a.value)
        if (sobrantes.length === 0) return base
        return [...base, { name: 'Otros', value: sobrantes.reduce((s, e) => s + e.value, 0), _otros: true }]
    }
    const pieP = useMemo(() => agrupar('pedidos'), [porMesCat, categorias, colorPorCat])
    const pieF = useMemo(() => agrupar('facturacion'), [porMesCat, categorias, colorPorCat])

    // ─── Facturación por producto del mes seleccionado ───
    const productos = useMemo(() => {
        const m = {}
        items.filter(l => l.anio === anio && l.mes === mesBase).forEach(l => {
            const a = m[l.productoId] || (m[l.productoId] = { nombre: l.nombre, sku: l.sku, unidades: 0, facturacion: 0 })
            a.unidades += l.unidades
            a.facturacion += l.facturacion
        })
        return Object.values(m).sort((a, b) => b.facturacion - a.facturacion)
    }, [items, anio, mesBase])

    const totalProd = productos.reduce((s, p) => ({
        unidades: s.unidades + p.unidades, facturacion: s.facturacion + p.facturacion,
    }), { unidades: 0, facturacion: 0 })
    const paginaProd = productos.slice(pagProd * tamProd, (pagProd + 1) * tamProd)
    const maxPagProd = Math.max(0, Math.ceil(productos.length / tamProd) - 1)

    // Al cambiar de mes o año la página vuelve al inicio
    useEffect(() => { setPagProd(0) }, [anio, mesBase, tamProd])

    // ─── Cobranzas del año seleccionado ───
    // El saldo se deriva igual que en CxC: una venta 'pagado' tiene saldo 0
    // aunque no tenga cobros registrados (contado y ventas migradas).
    const cobranzas = useMemo(() => {
        const ahora = new Date()
        const total = { facturado: 0, cobrado: 0, porCobrar: 0, vigente: 0, vencido: 0 }
        const porCliente = {}

        ventas.filter(v => v.anio === anio).forEach(v => {
            const registrado = (cobros[v.id] || 0) + pagoDirectoEnUsd(v)
            const pagada = v.estadoCobro === 'pagado'
            const cobrado = pagada ? Math.max(registrado, v.total) : Math.min(registrado, v.total)
            const saldo = pagada ? 0 : Math.max(0, v.total - cobrado)
            // Sin fecha de vencimiento no se puede decir que esté vencida
            const vencida = saldo > 0.01 && v.fechaVenc && new Date(v.fechaVenc) < ahora

            total.facturado += v.total
            total.cobrado += cobrado
            total.porCobrar += saldo
            if (vencida) total.vencido += saldo; else total.vigente += saldo

            const c = porCliente[v.clienteId] || (porCliente[v.clienteId] = {
                nombre: v.cliente, facturado: 0, cobrado: 0, porCobrar: 0, vigente: 0, vencido: 0,
            })
            c.facturado += v.total
            c.cobrado += cobrado
            c.porCobrar += saldo
            if (vencida) c.vencido += saldo; else c.vigente += saldo
        })

        return {
            total,
            clientes: Object.values(porCliente).sort((a, b) => b.facturado - a.facturado),
        }
    }, [ventas, cobros, anio])

    const cbz = cobranzas.total
    const pctPorCobrar = cbz.facturado > 0 ? cbz.porCobrar / cbz.facturado : 0
    const pctVencido = cbz.porCobrar > 0 ? cbz.vencido / cbz.porCobrar : 0
    const pctVigente = cbz.porCobrar > 0 ? cbz.vigente / cbz.porCobrar : 0

    const paginaCli = cobranzas.clientes.slice(pagCli * tamCli, (pagCli + 1) * tamCli)
    const maxPagCli = Math.max(0, Math.ceil(cobranzas.clientes.length / tamCli) - 1)
    useEffect(() => { setPagCli(0) }, [anio, tamCli])

    const aniosDisponibles = Array.from({ length: 5 }, (_, i) => anioActual - i)

    if (loading) return <div style={{ padding: '64px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando…</div>

    return (
        <div>
            {/* Filtros */}
            <div style={{ position: 'sticky', top: 0, zIndex: 30, backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Año</label>
                    <select value={anio} onChange={e => setAnio(Number(e.target.value))} style={selectStyle}>
                        {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Mes base (comparativos)</label>
                    <select value={mesBase} onChange={e => setMesBase(Number(e.target.value))} style={selectStyle}>
                        {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
                    </select>
                </div>
                <div style={{ fontSize: '12px', color: '#9ca3af', paddingBottom: '9px' }}>
                    Excluye ventas anuladas · unidades en unidad primaria
                </div>
            </div>

            {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#dc2626', marginBottom: '16px' }}>{error}</div>}

            {/* ─── 1. Ventas del año ─── */}
            <Titulo sub={`Facturación y unidades por mes · ticket promedio = facturación / unidades`}>Ventas {anio}</Titulo>
            <div style={{ ...card, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '520px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ ...th, textAlign: 'left' }}>Mes</th>
                            <th style={{ ...th, textAlign: 'right' }}>Unidades</th>
                            <th style={{ ...th, textAlign: 'right' }}>Facturación (USD)</th>
                            <th style={{ ...th, textAlign: 'right' }}>Ticket promedio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filasAnio.map(f => {
                            const vacio = f.unidades === 0 && f.facturacion === 0
                            return (
                                <tr key={f.nombre} style={{ borderBottom: '1px solid #f3f4f6', opacity: vacio ? 0.45 : 1 }}>
                                    <td style={{ ...td, textAlign: 'left' }}>{f.nombre}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{fmtNum(f.unidades)}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#1f2937' }}>{fmt(f.facturacion)}</td>
                                    <td style={{ ...td, textAlign: 'right' }}>{f.unidades > 0 ? fmt(ticket(f)) : '—'}</td>
                                </tr>
                            )
                        })}
                        <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                            <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>TOTALES</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNum(totalAnio.unidades)}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#1f2937' }}>{fmt(totalAnio.facturacion)}</td>
                            <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{totalAnio.unidades > 0 ? fmt(ticket(totalAnio)) : '—'}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ─── 2. Crecimiento ─── */}
            <Titulo sub={`Base: ${MESES[mesBase].toLowerCase()} ${anio}`}>Crecimiento</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {comparativos.map(c => (
                    <div key={c.clave} style={{ ...card, marginBottom: 0 }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{c.titulo}</div>
                            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{c.sub}</div>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ ...th, textAlign: 'left' }}>Período</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Unidades</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Facturación</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Ticket</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[[c.etiquetaVieja, c.viejo], [c.etiquetaNueva, c.nuevo]].map(([et, d]) => (
                                    <tr key={et} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ ...td, textAlign: 'left' }}>{et}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{fmtNum(d.unidades)}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{fmt(d.facturacion)}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{d.unidades > 0 ? fmt(ticket(d)) : '—'}</td>
                                    </tr>
                                ))}
                                <tr style={{ backgroundColor: '#f9fafb' }}>
                                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{c.clave}</td>
                                    <td style={{ ...td, textAlign: 'right' }}><Var v={variacion(c.nuevo.unidades, c.viejo.unidades)} /></td>
                                    <td style={{ ...td, textAlign: 'right' }}><Var v={variacion(c.nuevo.facturacion, c.viejo.facturacion)} /></td>
                                    <td style={{ ...td, textAlign: 'right' }}><Var v={variacion(ticket(c.nuevo), ticket(c.viejo))} /></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>

            {/* ─── 3 y 4. Por categoría de cliente ─── */}
            <TablaCategoria
                titulo={`Cantidad de pedidos por categoría de cliente · ${anio}`}
                sub="Número de notas de entrega emitidas, por Categoría 1 del cliente"
                categorias={categorias} celdaCat={celdaCat} campo="pedidos" colorPorCat={colorPorCat}
                formato={fmtNum} pieData={pieP} pieTitulo="Participación en número de pedidos"
            />

            {/* ─── Cobranzas ─── */}
            <Titulo sub={`Sobre las notas de entrega del año ${anio}, no del mes · el vencido se mide contra la fecha de vencimiento de cada factura`}>
                Cobranzas {anio}
            </Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <div style={{ ...card, marginBottom: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            {[
                                { l: 'Facturación', v: fmt(cbz.facturado), b: true },
                                { l: 'Cobrado', v: fmt(cbz.cobrado), c: '#16a34a' },
                                { l: 'Por cobrar', v: fmt(cbz.porCobrar), c: '#e34948', b: true },
                                { l: '% Por cobrar', v: `${(pctPorCobrar * 100).toFixed(1)}%`, c: '#6b7280' },
                            ].map(f => (
                                <tr key={f.l} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ ...td, textAlign: 'left', color: '#6b7280' }}>{f.l}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: f.b ? 700 : 600, color: f.c || '#1f2937' }}>{f.v}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ ...card, marginBottom: 0 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: '12px', color: '#6b7280' }}>
                        Composición de lo por cobrar
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            {[
                                { l: 'Vigente', m: cbz.vigente, pc: pctVigente, c: '#16a34a' },
                                { l: 'Vencido', m: cbz.vencido, pc: pctVencido, c: '#e34948' },
                            ].map(f => (
                                <tr key={f.l} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ ...td, textAlign: 'left', color: '#6b7280' }}>{f.l}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: f.c }}>{fmt(f.m)}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: f.c }}>{(f.pc * 100).toFixed(1)}%</td>
                                </tr>
                            ))}
                            <tr style={{ backgroundColor: '#f9fafb' }}>
                                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>Total por cobrar</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(cbz.porCobrar)}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#6b7280' }}>100%</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Cobranzas por cliente */}
            <Titulo sub="Ordenado de mayor a menor facturación del año">Cobranzas por cliente · {anio}</Titulo>
            <div style={card}>
                <div style={{ overflowX: 'auto' }}>
                    {cobranzas.clientes.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                            No hay ventas registradas en {anio}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ ...th, textAlign: 'left' }}>Cliente</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Facturado</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Cobrado</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Por cobrar</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Vigente</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Vencido</th>
                                    <th style={{ ...th, textAlign: 'right' }}>% por cobrar</th>
                                    <th style={{ ...th, textAlign: 'right' }}>% del total x cobrar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginaCli.map((c, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', color: '#1f2937', fontWeight: 500 }}>{c.nombre}</td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(c.facturado)}</td>
                                        <td style={{ ...td, textAlign: 'right', color: '#16a34a' }}>{fmt(c.cobrado)}</td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: c.porCobrar > 0.01 ? '#e34948' : '#9ca3af' }}>{fmt(c.porCobrar)}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{fmt(c.vigente)}</td>
                                        <td style={{ ...td, textAlign: 'right', color: c.vencido > 0.01 ? '#e34948' : '#9ca3af' }}>{fmt(c.vencido)}</td>
                                        <td style={{ ...td, textAlign: 'right', color: '#9ca3af' }}>
                                            {c.facturado > 0 ? `${(c.porCobrar / c.facturado * 100).toFixed(1)}%` : '—'}
                                        </td>
                                        <td style={{ ...td, textAlign: 'right', color: '#9ca3af' }}>
                                            {cbz.porCobrar > 0 ? `${(c.porCobrar / cbz.porCobrar * 100).toFixed(1)}%` : '—'}
                                        </td>
                                    </tr>
                                ))}
                                <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>TOTALES ({cobranzas.clientes.length} clientes)</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(cbz.facturado)}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmt(cbz.cobrado)}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#e34948' }}>{fmt(cbz.porCobrar)}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(cbz.vigente)}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#e34948' }}>{fmt(cbz.vencido)}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>{(pctPorCobrar * 100).toFixed(1)}%</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>100%</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
                {cobranzas.clientes.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                {pagCli * tamCli + 1}–{Math.min((pagCli + 1) * tamCli, cobranzas.clientes.length)} de {cobranzas.clientes.length}
                            </span>
                            <select value={tamCli} onChange={e => setTamCli(Number(e.target.value))}
                                style={{ ...selectStyle, padding: '5px 8px', fontSize: '12px' }}>
                                {[25, 50, 100].map(n => <option key={n} value={n}>{n} / pág.</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setPagCli(x => Math.max(0, x - 1))} disabled={pagCli === 0}
                                style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: pagCli === 0 ? '#d1d5db' : '#374151', cursor: pagCli === 0 ? 'default' : 'pointer' }}>
                                ← Anterior
                            </button>
                            <button onClick={() => setPagCli(x => Math.min(maxPagCli, x + 1))} disabled={pagCli >= maxPagCli}
                                style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: pagCli >= maxPagCli ? '#d1d5db' : '#374151', cursor: pagCli >= maxPagCli ? 'default' : 'pointer' }}>
                                Siguiente →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ─── Facturación por producto ─── */}
            <Titulo sub={`Ordenado de mayor a menor facturación · los % son sobre el total del mes`}>
                Facturación por producto · {MESES[mesBase]} {anio}
            </Titulo>
            <div style={card}>
                <div style={{ overflowX: 'auto' }}>
                    {productos.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                            No hay ventas en {MESES[mesBase].toLowerCase()} de {anio}
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ ...th, textAlign: 'left' }}>Producto</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Unidades</th>
                                    <th style={{ ...th, textAlign: 'right' }}>% Unidades</th>
                                    <th style={{ ...th, textAlign: 'right' }}>Facturación (USD)</th>
                                    <th style={{ ...th, textAlign: 'right' }}>% Facturación</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginaProd.map((p, i) => (
                                    <tr key={p.sku || i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}>
                                            {p.nombre}
                                            {p.sku && <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{p.sku}</span>}
                                        </td>
                                        <td style={{ ...td, textAlign: 'right' }}>{fmtNum(p.unidades)}</td>
                                        <td style={{ ...td, textAlign: 'right', color: '#9ca3af' }}>
                                            {totalProd.unidades > 0 ? `${(p.unidades / totalProd.unidades * 100).toFixed(1)}%` : '—'}
                                        </td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#1f2937' }}>{fmt(p.facturacion)}</td>
                                        <td style={{ ...td, textAlign: 'right', color: '#9ca3af' }}>
                                            {totalProd.facturacion > 0 ? `${(p.facturacion / totalProd.facturacion * 100).toFixed(1)}%` : '—'}
                                        </td>
                                    </tr>
                                ))}
                                <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>TOTALES ({productos.length} productos)</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtNum(totalProd.unidades)}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>100%</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#1f2937' }}>{fmt(totalProd.facturacion)}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>100%</td>
                                </tr>
                            </tbody>
                        </table>
                    )}
                </div>
                {productos.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                {pagProd * tamProd + 1}–{Math.min((pagProd + 1) * tamProd, productos.length)} de {productos.length}
                            </span>
                            <select value={tamProd} onChange={e => setTamProd(Number(e.target.value))}
                                style={{ ...selectStyle, padding: '5px 8px', fontSize: '12px' }}>
                                {[25, 50, 100].map(n => <option key={n} value={n}>{n} / pág.</option>)}
                            </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setPagProd(p => Math.max(0, p - 1))} disabled={pagProd === 0}
                                style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: pagProd === 0 ? '#d1d5db' : '#374151', cursor: pagProd === 0 ? 'default' : 'pointer' }}>
                                ← Anterior
                            </button>
                            <button onClick={() => setPagProd(p => Math.min(maxPagProd, p + 1))} disabled={pagProd >= maxPagProd}
                                style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: pagProd >= maxPagProd ? '#d1d5db' : '#374151', cursor: pagProd >= maxPagProd ? 'default' : 'pointer' }}>
                                Siguiente →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <TablaCategoria
                titulo={`Facturación por categoría de cliente · ${anio}`}
                sub="USD facturados en notas de entrega, por Categoría 1 del cliente"
                categorias={categorias} celdaCat={celdaCat} campo="facturacion" colorPorCat={colorPorCat}
                formato={fmt} pieData={pieF} pieTitulo="Participación en facturación"
            />
        </div>
    )
}

// Tabla mes × categoría con totales y participación, más su torta.
// La tabla es también la "vista de tabla" que la guía de dataviz exige cuando el
// contraste de algún color queda por debajo de 3:1 contra el fondo.
function TablaCategoria({ titulo, sub, categorias, celdaCat, campo, formato, pieData, pieTitulo, colorPorCat }) {
    const filas = MESES.map((nombre, i) => {
        const valores = categorias.map(c => celdaCat(i, c)[campo])
        return { nombre, valores, total: valores.reduce((s, v) => s + v, 0) }
    })
    const totales = categorias.map((_, ci) => filas.reduce((s, f) => s + f.valores[ci], 0))
    const totalGeneral = totales.reduce((s, v) => s + v, 0)

    const colorDe = (nombre) => colorPorCat[nombre] || GRIS_OTROS

    if (categorias.length === 0) {
        return (
            <>
                <Titulo sub={sub}>{titulo}</Titulo>
                <div style={{ ...card, padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                    No hay ventas registradas en este año
                </div>
            </>
        )
    }

    return (
        <>
            <Titulo sub={sub}>{titulo}</Titulo>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: '16px', marginBottom: '24px', alignItems: 'start' }}>
                <div style={{ ...card, marginBottom: 0, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${240 + categorias.length * 150}px` }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ ...th, textAlign: 'left' }}>Mes</th>
                                {categorias.map(c => (
                                    <th key={c} style={{ ...th, textAlign: 'right' }}>
                                        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', backgroundColor: colorDe(c), marginRight: '6px' }} />
                                        {c}
                                    </th>
                                ))}
                                <th style={{ ...th, textAlign: 'right' }}>Total mes</th>
                                {categorias.map(c => <th key={`p-${c}`} style={{ ...th, textAlign: 'right' }}>% {c}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map(f => (
                                <tr key={f.nombre} style={{ borderBottom: '1px solid #f3f4f6', opacity: f.total === 0 ? 0.45 : 1 }}>
                                    <td style={{ ...td, textAlign: 'left' }}>{f.nombre}</td>
                                    {f.valores.map((v, i) => <td key={i} style={{ ...td, textAlign: 'right' }}>{formato(v)}</td>)}
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#1f2937' }}>{formato(f.total)}</td>
                                    {f.valores.map((v, i) => (
                                        <td key={`p${i}`} style={{ ...td, textAlign: 'right', color: '#9ca3af' }}>
                                            {f.total > 0 ? `${(v / f.total * 100).toFixed(1)}%` : '—'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            <tr style={{ backgroundColor: '#f9fafb', borderTop: '2px solid #e5e7eb' }}>
                                <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>TOTALES</td>
                                {totales.map((v, i) => <td key={i} style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{formato(v)}</td>)}
                                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#1f2937' }}>{formato(totalGeneral)}</td>
                                {totales.map((v, i) => (
                                    <td key={`pt${i}`} style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#6b7280' }}>
                                        {totalGeneral > 0 ? `${(v / totalGeneral * 100).toFixed(1)}%` : '—'}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div style={{ ...card, marginBottom: 0, padding: '16px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937', marginBottom: '4px' }}>{pieTitulo}</div>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '8px' }}>Total del año</div>
                    <div style={{ height: '260px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={80}
                                    stroke="#fff" strokeWidth={2}
                                    label={({ percent }) => percent >= 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                                    labelLine={false}>
                                    {pieData.map((d, i) => <Cell key={i} fill={d._otros ? GRIS_OTROS : colorDe(d.name)} />)}
                                </Pie>
                                <Tooltip formatter={(v, n) => [formato(v), n]} />
                                <Legend verticalAlign="bottom" height={36} iconType="circle"
                                    wrapperStyle={{ fontSize: '11px', color: '#6b7280' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </>
    )
}
