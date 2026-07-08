// Dashboard.jsx — shell de tabs. Tab "Comercial": analítica de ventas y cartera
// reutilizando la lógica de CuentasCobrar (días calle, saldo, vencidas).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

// ─── Formato ───────────────────────────────────────────────────
const fmt = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtNum = n => Number(n || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })
// Equivalente USD de un cobro (idéntico a CuentasCobrar.jsx)
const cobroEnUsd = (c) => Number(c.monto_usd || 0) + Number(c.monto_bs || 0) / Number(c.tasa_cambio || 1)

// ─── Paleta dataviz (CVD-safe, modo claro) ─────────────────────
const COLORES = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948', '#e87ba4', '#eb6834']
const GRIS_OTROS = '#898781'
const ROJO = '#e34948'

const COLOR_ESTATUS = { 'Pagado': COLORES[0], 'Pendiente sin vencer': COLORES[1], 'Pendiente vencido': ROJO }
const COLOR_VENCIDA = { '≤ 7 días': COLORES[0], '8–15 días': COLORES[1], '16–30 días': COLORES[2], '> 30 días': ROJO }
const COLOR_ANTIG = { '0–15 días': COLORES[0], '16–30 días': COLORES[1], '31–60 días': COLORES[2], '> 60 días': ROJO }

// ─── Helpers de fecha ──────────────────────────────────────────
const DIA = 86400000
const toYMD = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const floorDias = (ms) => Math.floor(ms / DIA)

// ═══════════════════════════════════════════════════════════════
export default function Dashboard() {
    const [tab, setTab] = useState('comercial')

    const tabs = [
        ['comercial', 'Comercial'],
        ['resumen', 'Resumen'],
    ]

    return (
        <div style={{ padding: '24px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Dashboard</h1>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>Indicadores del negocio</p>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {tabs.map(([val, lbl]) => (
                    <button key={val} onClick={() => setTab(val)}
                        style={{
                            padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: tab === val ? '#16a34a' : '#e5e7eb',
                            backgroundColor: tab === val ? '#f0fdf4' : '#fff',
                            color: tab === val ? '#16a34a' : '#6b7280',
                        }}>
                        {lbl}
                    </button>
                ))}
            </div>

            {tab === 'comercial' && <TabComercial />}
            {tab === 'resumen' && (
                <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                    Próximamente los KPIs aquí
                </div>
            )}
        </div>
    )
}

// ═══════════════════════════════════════════════════════════════
// Tab Comercial
// ═══════════════════════════════════════════════════════════════
function TabComercial() {
    const { perfil } = useAuth()

    // Rango por defecto: primer día del mes actual → hoy
    const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
    const primerDiaMes = useMemo(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1), [hoy])

    const [desde, setDesde] = useState(toYMD(primerDiaMes))
    const [hasta, setHasta] = useState(toYMD(hoy))

    const [rawLineas, setRawLineas] = useState([])   // líneas crudas del servidor
    const [cobradoMap, setCobradoMap] = useState({}) // { venta_id: cobradoUsd }
    const [catMap, setCatMap] = useState({})         // { cat1_id: nombre }
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    // Filtros client-side
    const [fProducto, setFProducto] = useState('')
    const [fCliente, setFCliente] = useState('')
    const [fCanal, setFCanal] = useState('')

    // Tabla
    const [sort, setSort] = useState({ col: 'fecha', dir: 'desc' })
    const [pageSize, setPageSize] = useState(25)
    const [page, setPage] = useState(0)

    // ─── Carga desde servidor (rango de fechas en .gte/.lte) ───
    useEffect(() => {
        if (!perfil?.empresa_id) return
        let cancel = false
        async function cargar() {
            setLoading(true); setError('')
            try {
                // Categorías de cliente → mapa id:nombre (para "Canal")
                const { data: cats } = await supabase.from('categorias_clientes')
                    .select('id, nombre').eq('empresa_id', perfil.empresa_id)
                const cm = {}; (cats || []).forEach(c => { cm[c.id] = c.nombre })

                // Líneas de venta con su factura y cliente (paginado por 1000)
                const SELECT = 'cantidad, precio_unitario, producto_id, venta_id, ' +
                    'productos_terminados(sku, nombre), ' +
                    'ventas!inner(id, numero_factura, created_at, fecha_vencimiento_pago, total, estado_cobro, cliente_id, clientes(nombre, codigo, cat1_id))'
                const PAGE = 1000
                let from = 0, all = []
                while (true) {
                    const { data, error: e } = await supabase.from('venta_items')
                        .select(SELECT)
                        .eq('empresa_id', perfil.empresa_id)
                        .gte('ventas.created_at', desde + 'T00:00:00')
                        .lte('ventas.created_at', hasta + 'T23:59:59.999')
                        .range(from, from + PAGE - 1)
                    if (e) throw e
                    all = all.concat(data || [])
                    if (!data || data.length < PAGE) break
                    from += PAGE
                }

                // Cobros solo de facturas 'parcial' (mismo criterio que CuentasCobrar
                // para no saturar el .in con miles de IDs).
                const parcialIds = [...new Set(all
                    .filter(r => r.ventas?.estado_cobro === 'parcial')
                    .map(r => r.venta_id))]
                const cobrado = {}
                for (let i = 0; i < parcialIds.length; i += 300) {
                    const chunk = parcialIds.slice(i, i + 300)
                    const { data: cobros } = await supabase.from('cobros')
                        .select('venta_id, monto_usd, monto_bs, tasa_cambio').in('venta_id', chunk)
                    cobros?.forEach(c => { cobrado[c.venta_id] = (cobrado[c.venta_id] || 0) + cobroEnUsd(c) })
                }

                if (cancel) return
                setCatMap(cm)
                setRawLineas(all)
                setCobradoMap(cobrado)
            } catch (e) {
                if (!cancel) { console.error('Error cargando dashboard comercial:', e); setError(e.message || 'Error cargando datos') }
            } finally {
                if (!cancel) setLoading(false)
            }
        }
        cargar()
        return () => { cancel = true }
    }, [perfil?.empresa_id, desde, hasta])

    // Reset de página al cambiar filtros/orden/tamaño
    useEffect(() => { setPage(0) }, [fProducto, fCliente, fCanal, sort, pageSize, desde, hasta])

    // ─── Aplanado de líneas (independiente de filtros client-side) ───
    const lineas = useMemo(() => rawLineas.map(r => {
        const v = r.ventas || {}
        const cli = v.clientes || {}
        const prod = r.productos_terminados || {}
        const cobrado = cobradoMap[r.venta_id] || 0
        const saldo = v.estado_cobro === 'pagado' ? 0 : Math.max(0, Number(v.total || 0) - cobrado)
        const fecha = v.created_at ? new Date(v.created_at) : null
        const fechaVenc = v.fecha_vencimiento_pago ? new Date(v.fecha_vencimiento_pago + 'T00:00:00') : null
        const canal = cli.cat1_id ? (catMap[cli.cat1_id] || 'Sin categoría') : 'Sin categoría'
        const cantidad = Number(r.cantidad || 0)
        const precio = Number(r.precio_unitario || 0)
        // Estatus factura: parcial cuenta como pendiente
        let estatus = 'sin_vencer'
        if (v.estado_cobro === 'pagado') estatus = 'pagado'
        else if (fechaVenc && fechaVenc < hoy) estatus = 'vencido'
        return {
            ventaId: r.venta_id,
            numeroFactura: v.numero_factura || '—',
            fecha, fechaVenc,
            ventaTotal: Number(v.total || 0),
            estadoCobro: v.estado_cobro,
            saldo, cobrado,
            clienteId: v.cliente_id,
            clienteNombre: cli.nombre || '—',
            clienteCodigo: cli.codigo || '',
            canal,
            productoId: r.producto_id,
            productoSku: prod.sku || '',
            productoNombre: prod.nombre || '—',
            cantidad, precio,
            lineaTotal: cantidad * precio,
            diasCredito: (fecha && fechaVenc) ? Math.max(0, floorDias(fechaVenc - fecha)) : null,
            estatus,
        }
    }), [rawLineas, cobradoMap, catMap, hoy])

    // Opciones de selects (derivadas del rango cargado)
    const opcProductos = useMemo(() => {
        const m = new Map()
        lineas.forEach(l => { if (l.productoId) m.set(l.productoId, `${l.productoSku ? l.productoSku + ' · ' : ''}${l.productoNombre}`) })
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
    }, [lineas])
    const opcClientes = useMemo(() => {
        const m = new Map()
        lineas.forEach(l => { if (l.clienteId) m.set(l.clienteId, `${l.clienteCodigo ? l.clienteCodigo + ' · ' : ''}${l.clienteNombre}`) })
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
    }, [lineas])
    const opcCanales = useMemo(() =>
        [...new Set(lineas.map(l => l.canal))].sort((a, b) => a.localeCompare(b))
    , [lineas])

    // ─── Filtrado client-side ───
    const lineasFiltradas = useMemo(() => lineas.filter(l =>
        (!fProducto || l.productoId === fProducto) &&
        (!fCliente || l.clienteId === fCliente) &&
        (!fCanal || l.canal === fCanal)
    ), [lineas, fProducto, fCliente, fCanal])

    // Facturas únicas dentro del set filtrado (nivel factura)
    const facturas = useMemo(() => {
        const m = new Map()
        lineasFiltradas.forEach(l => {
            if (!m.has(l.ventaId)) m.set(l.ventaId, {
                id: l.ventaId, total: l.ventaTotal, estadoCobro: l.estadoCobro,
                fecha: l.fecha, fechaVenc: l.fechaVenc, saldo: l.saldo, estatus: l.estatus,
            })
        })
        return [...m.values()]
    }, [lineasFiltradas])

    // ─── Ventas totales + Días calle ponderado ───
    const ventasTotales = useMemo(() => lineasFiltradas.reduce((s, l) => s + l.lineaTotal, 0), [lineasFiltradas])
    const diasCalle = useMemo(() => {
        const sumSaldo = facturas.reduce((s, f) => s + f.saldo, 0)
        if (sumSaldo <= 0) return '0.0'
        const num = facturas.reduce((s, f) => {
            const d = f.fecha ? Math.max(0, floorDias(hoy - f.fecha)) : 0
            return s + d * f.saldo
        }, 0)
        return (num / sumSaldo).toFixed(1)
    }, [facturas, hoy])

    // ─── Datos de tortas fila 1 (por monto, nivel línea) ───
    const pieCanal = useMemo(() => topN(agrupar(lineasFiltradas, l => l.canal, l => l.lineaTotal)), [lineasFiltradas])
    const pieProducto = useMemo(() => topN(agrupar(lineasFiltradas, l => `${l.productoSku ? l.productoSku + ' · ' : ''}${l.productoNombre}`, l => l.lineaTotal)), [lineasFiltradas])
    const pieCliente = useMemo(() => topN(agrupar(lineasFiltradas, l => `${l.clienteCodigo ? l.clienteCodigo + ' · ' : ''}${l.clienteNombre}`, l => l.lineaTotal)), [lineasFiltradas])

    // ─── Datos de tortas fila 2 (nivel factura) ───
    // Estatus: ponderado por TOTAL facturado (para que "Pagado" no desaparezca)
    const pieEstatus = useMemo(() => {
        const acc = { 'Pagado': 0, 'Pendiente sin vencer': 0, 'Pendiente vencido': 0 }
        facturas.forEach(f => {
            if (f.estatus === 'pagado') acc['Pagado'] += f.total
            else if (f.estatus === 'vencido') acc['Pendiente vencido'] += f.total
            else acc['Pendiente sin vencer'] += f.total
        })
        return Object.entries(acc).map(([name, value]) => ({ name, value }))
    }, [facturas])

    // Cartera vencida por antigüedad (solo vencidas, ponderado por saldo)
    const pieVencida = useMemo(() => {
        const acc = { '≤ 7 días': 0, '8–15 días': 0, '16–30 días': 0, '> 30 días': 0 }
        facturas.forEach(f => {
            if (f.estatus !== 'vencido' || f.saldo <= 0 || !f.fechaVenc) return
            const dv = floorDias(hoy - f.fechaVenc)
            if (dv <= 7) acc['≤ 7 días'] += f.saldo
            else if (dv <= 15) acc['8–15 días'] += f.saldo
            else if (dv <= 30) acc['16–30 días'] += f.saldo
            else acc['> 30 días'] += f.saldo
        })
        return Object.entries(acc).map(([name, value]) => ({ name, value }))
    }, [facturas, hoy])

    // Saldo en calle por antigüedad (días desde emisión, ponderado por saldo)
    const pieAntig = useMemo(() => {
        const acc = { '0–15 días': 0, '16–30 días': 0, '31–60 días': 0, '> 60 días': 0 }
        facturas.forEach(f => {
            if (f.saldo <= 0) return
            const d = f.fecha ? Math.max(0, floorDias(hoy - f.fecha)) : 0
            if (d <= 15) acc['0–15 días'] += f.saldo
            else if (d <= 30) acc['16–30 días'] += f.saldo
            else if (d <= 60) acc['31–60 días'] += f.saldo
            else acc['> 60 días'] += f.saldo
        })
        return Object.entries(acc).map(([name, value]) => ({ name, value }))
    }, [facturas, hoy])

    // ─── Tabla: orden + paginación ───
    const lineasOrdenadas = useMemo(() => {
        const arr = [...lineasFiltradas]
        const { col, dir } = sort
        const numericas = new Set(['cantidad', 'precio', 'lineaTotal', 'saldo', 'diasCredito'])
        arr.sort((a, b) => {
            let va = a[col], vb = b[col]
            let cmp
            if (col === 'fecha') { cmp = (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0) }
            else if (numericas.has(col)) { cmp = (Number(va) || 0) - (Number(vb) || 0) }
            else { cmp = String(va ?? '').localeCompare(String(vb ?? '')) }
            return dir === 'asc' ? cmp : -cmp
        })
        return arr
    }, [lineasFiltradas, sort])

    const totalLineas = lineasOrdenadas.length
    const pageStart = page * pageSize
    const lineasPagina = lineasOrdenadas.slice(pageStart, pageStart + pageSize)
    const maxPage = Math.max(0, Math.ceil(totalLineas / pageSize) - 1)

    function toggleSort(col) {
        setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
    }

    function limpiar() {
        setDesde(toYMD(primerDiaMes)); setHasta(toYMD(hoy))
        setFProducto(''); setFCliente(''); setFCanal('')
    }

    const COLS = [
        { key: 'fecha', label: 'Fecha' },
        { key: 'numeroFactura', label: 'Factura' },
        { key: 'clienteNombre', label: 'Cliente' },
        { key: 'productoNombre', label: 'Producto' },
        { key: 'cantidad', label: 'Cantidad', num: true },
        { key: 'precio', label: 'Precio', num: true },
        { key: 'lineaTotal', label: 'Total', num: true },
        { key: 'saldo', label: 'Saldo', num: true },
        { key: 'estatus', label: 'Estatus' },
        { key: 'diasCredito', label: 'Días créd.', num: true },
    ]

    const selectStyle = { padding: '8px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }

    return (
        <div>
            {/* ─── Barra de filtros ─── */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Desde</label>
                        <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={selectStyle} />
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Hasta</label>
                        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={selectStyle} />
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Producto</label>
                        <select value={fProducto} onChange={e => setFProducto(e.target.value)} style={{ ...selectStyle, maxWidth: '220px' }}>
                            <option value="">Todos</option>
                            {opcProductos.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Cliente</label>
                        <select value={fCliente} onChange={e => setFCliente(e.target.value)} style={{ ...selectStyle, maxWidth: '220px' }}>
                            <option value="">Todos</option>
                            {opcClientes.map(([id, lbl]) => <option key={id} value={id}>{lbl}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Canal (categoría cliente)</label>
                        <select value={fCanal} onChange={e => setFCanal(e.target.value)} style={selectStyle}>
                            <option value="">Todos</option>
                            {opcCanales.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <button onClick={limpiar}
                        style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', color: '#374151', cursor: 'pointer' }}>
                        Limpiar
                    </button>
                </div>
                <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f3f4f6', fontSize: '13px', color: '#374151' }}>
                    <strong>{totalLineas.toLocaleString('es-VE')}</strong> líneas ·{' '}
                    Ventas totales: <strong>{fmt(ventasTotales)}</strong> ·{' '}
                    Días calle ponderado: <strong style={{ color: '#d97706' }}>{diasCalle} días</strong>
                </div>
            </div>

            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#dc2626', marginBottom: '16px' }}>{error}</div>
            )}

            {loading ? (
                <div style={{ padding: '64px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando…</div>
            ) : (
                <>
                    {/* ─── Tabla de detalle ─── */}
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '24px' }}>
                        <div style={{ overflowX: 'auto' }}>
                            {totalLineas === 0 ? (
                                <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay ventas para los filtros seleccionados</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                            {COLS.map(c => (
                                                <th key={c.key} onClick={() => toggleSort(c.key)}
                                                    style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: c.num ? 'right' : 'left', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>
                                                    {c.label}{sort.col === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lineasPagina.map((l, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '10px 14px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>{l.fecha ? l.fecha.toLocaleDateString('es-VE') : '—'}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{l.numeroFactura}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '13px', color: '#1f2937' }}>{l.clienteNombre}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '13px', color: '#374151' }}>{l.productoNombre}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '13px', color: '#374151', textAlign: 'right' }}>{fmtNum(l.cantidad)}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '13px', color: '#374151', textAlign: 'right' }}>{fmt(l.precio)}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(l.lineaTotal)}</td>
                                                <td style={{ padding: '10px 14px', fontSize: '13px', color: l.saldo > 0.01 ? '#ef4444' : '#16a34a', textAlign: 'right' }}>{fmt(l.saldo)}</td>
                                                <td style={{ padding: '10px 14px' }}><BadgeEstatus estatus={l.estatus} /></td>
                                                <td style={{ padding: '10px 14px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{l.diasCredito != null ? l.diasCredito : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        {totalLineas > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                        Mostrando {pageStart + 1}–{Math.min(pageStart + pageSize, totalLineas)} de {totalLineas}
                                    </span>
                                    <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}
                                        style={{ padding: '5px 8px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e5e7eb', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                                        {[25, 50, 100].map(n => <option key={n} value={n}>{n} / pág.</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                                        style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page === 0 ? '#d1d5db' : '#374151', cursor: page === 0 ? 'default' : 'pointer' }}>
                                        ← Anterior
                                    </button>
                                    <button onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page >= maxPage}
                                        style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: page >= maxPage ? '#d1d5db' : '#374151', cursor: page >= maxPage ? 'default' : 'pointer' }}>
                                        Siguiente →
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ─── Fila 1: composición de ventas por monto ─── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                        <PieCard title="Ventas por Canal" data={pieCanal} colorFn={(d, i) => d._otros ? GRIS_OTROS : COLORES[i % COLORES.length]} />
                        <PieCard title="Ventas por Producto" data={pieProducto} showLegend={false} colorFn={(d, i) => d._otros ? GRIS_OTROS : COLORES[i % COLORES.length]} />
                        <PieCard title="Ventas por Cliente" data={pieCliente} showLegend={false} colorFn={(d, i) => d._otros ? GRIS_OTROS : COLORES[i % COLORES.length]} />
                    </div>

                    {/* ─── Fila 2: cartera ─── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                        <PieCard title="Ventas por Estatus" subtitle="por monto facturado" data={pieEstatus} colorFn={d => COLOR_ESTATUS[d.name] || GRIS_OTROS} />
                        <PieCard title="Cartera vencida por antigüedad" subtitle="por saldo, solo vencidas" data={pieVencida} colorFn={d => COLOR_VENCIDA[d.name] || GRIS_OTROS} />
                        <PieCard title="Saldo en calle por antigüedad" subtitle="por saldo, días desde emisión" data={pieAntig} colorFn={d => COLOR_ANTIG[d.name] || GRIS_OTROS} />
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Agrupar y Top 8 + Otros ───────────────────────────────────
function agrupar(items, keyFn, valFn) {
    const m = {}
    items.forEach(it => { const k = keyFn(it) || 'Sin dato'; m[k] = (m[k] || 0) + valFn(it) })
    return m
}
function topN(map, n = 8) {
    const arr = Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    if (arr.length <= n) return arr
    const top = arr.slice(0, n)
    const otros = arr.slice(n).reduce((s, d) => s + d.value, 0)
    if (otros > 0) top.push({ name: 'Otros', value: otros, _otros: true })
    return top
}

// ─── Torta reutilizable ────────────────────────────────────────
function PieCard({ title, subtitle, data, colorFn, showLegend = true }) {
    const filtered = (data || []).filter(d => d.value > 0.0001)
    const total = filtered.reduce((s, d) => s + d.value, 0)
    return (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{title}</h3>
            {subtitle && <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{subtitle}</p>}
            {filtered.length === 0 ? (
                <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '13px' }}>Sin datos</div>
            ) : (
                <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                        <Pie data={filtered} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={1}>
                            {filtered.map((d, i) => <Cell key={i} fill={colorFn(d, i)} />)}
                        </Pie>
                        <Tooltip content={<PieTooltip total={total} />} />
                        {showLegend && <Legend wrapperStyle={{ fontSize: '11px' }} />}
                    </PieChart>
                </ResponsiveContainer>
            )}
        </div>
    )
}

function PieTooltip({ active, payload, total }) {
    if (!active || !payload?.length) return null
    const p = payload[0]
    const pct = total > 0 ? (p.value / total * 100).toFixed(1) : '0.0'
    return (
        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
            <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: '2px' }}>{p.name}</div>
            <div style={{ color: '#374151' }}>{fmt(p.value)} · {pct}%</div>
        </div>
    )
}

// ─── Badge de estatus (nivel factura) ──────────────────────────
function BadgeEstatus({ estatus }) {
    const map = {
        pagado: { label: 'Pagado', color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
        sin_vencer: { label: 'Sin vencer', color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
        vencido: { label: 'Vencido', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
    }
    const s = map[estatus] || map.sin_vencer
    return (
        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, color: s.color, backgroundColor: s.bg, border: `1px solid ${s.border}`, whiteSpace: 'nowrap' }}>
            {s.label}
        </span>
    )
}
