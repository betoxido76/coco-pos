// Emisión manual de notas de crédito y catálogo de motivos.
//
// Vive en CxC (no en Ventas) porque una NC es dinero que sale y ahí está el
// control de cartera. El flujo SDR de Ventas sigue siendo el emisor de la NC
// por devolución física; esto cubre lo que ese flujo no puede expresar:
// descuento promocional, vencimiento desechado en cliente, diferencia de
// precio — casos sin mercancía de vuelta y a veces sin factura de referencia.
//
// El catálogo de motivos se gestiona aquí mismo, siguiendo el precedente de
// `tipos_gastos`, que se administra dentro de Gastos.jsx y no en Administración.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { X, Plus, Trash2, Search } from 'lucide-react'
import { crearNotaCredito, calcularTotalesNC } from '../lib/notasCredito'
import { itemAplicaIva } from '../lib/iva'
import SelectorFechaTasa, { useTasasFecha, hoyYMD } from './SelectorFechaTasa'

export const fmt = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Mismos roles que ya pueden anular notas de entrega en CxC.
export const ROLES_APROBADORES = ['admin', 'finanzas', 'superadmin']
export const esAprobadorNC = (perfil) => ROLES_APROBADORES.includes(perfil?.rol)

// Umbral de aprobación de la empresa. Vacío o cero = control apagado, que es
// como nace: sin configurarlo el flujo es idéntico al de antes de la Fase 4.
export async function leerUmbralNC(empresaId) {
    const { data } = await supabase.from('configuracion')
        .select('valor').eq('empresa_id', empresaId).eq('clave', 'umbral_aprobacion_nc').maybeSingle()
    return Number(data?.valor) || 0
}

export const inputStyle = {
    width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '14px', color: '#1f2937', backgroundColor: '#fff', boxSizing: 'border-box',
}
export const labelStyle = {
    fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block',
    marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em',
}
export const seccionStyle = {
    fontSize: '12px', fontWeight: 600, color: '#374151', margin: '0 0 12px',
    paddingBottom: '8px', borderBottom: '1px solid #e5e7eb',
}

// ── Modal: emitir NC ───────────────────────────────────────────
export function ModalEmitirNC({ onCerrar, onEmitida }) {
    const { perfil } = useAuth()

    const [clientes, setClientes] = useState([])
    const [motivos, setMotivos] = useState([])
    const [almacenes, setAlmacenes] = useState([])

    const [clienteId, setClienteId] = useState('')
    const [motivoId, setMotivoId] = useState('')
    const [nota, setNota] = useState('')
    const [afectaInventario, setAfectaInventario] = useState(false)
    const [generaCredito, setGeneraCredito] = useState(true)
    const [almacenId, setAlmacenId] = useState('')
    const [referenciaFiscal, setReferenciaFiscal] = useState('')

    const [ventas, setVentas] = useState([])
    const [ventaId, setVentaId] = useState('')
    const [itemsFactura, setItemsFactura] = useState([])
    const [cargandoFactura, setCargandoFactura] = useState(false)

    const [lineas, setLineas] = useState([])
    const [busqueda, setBusqueda] = useState('')
    const [resultados, setResultados] = useState([])
    const [buscando, setBuscando] = useState(false)

    const [fecha, setFecha] = useState(hoyYMD())
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const { tasasFecha, cargandoTasas } = useTasasFecha(perfil?.empresa_id, fecha)
    const tasaDia = Number(tasasFecha?.[tipoTasa]) || 0
    const sinTasa = !cargandoTasas && tasaDia <= 0

    const [umbral, setUmbral] = useState(0)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    // Maestros
    useEffect(() => {
        if (!perfil?.empresa_id) return
        const eid = perfil.empresa_id
        supabase.from('clientes').select('id, nombre').eq('empresa_id', eid).order('nombre')
            .then(({ data }) => setClientes(data || []))
        leerUmbralNC(eid).then(setUmbral)
        supabase.from('motivos_nc')
            .select('id, nombre, descripcion, afecta_inventario_default, genera_credito_default')
            .eq('empresa_id', eid).eq('activo', true).order('orden')
            .then(({ data }) => setMotivos(data || []))
        supabase.from('almacenes').select('id, nombre, es_default')
            .eq('empresa_id', eid).eq('activo', true).order('nombre')
            .then(({ data }) => {
                setAlmacenes(data || [])
                const def = (data || []).find(a => a.es_default) || (data || [])[0]
                if (def) setAlmacenId(def.id)
            })
    }, [perfil?.empresa_id])

    // Facturas del cliente, para la referencia opcional
    useEffect(() => {
        setVentaId(''); setItemsFactura([]); setVentas([])
        if (!clienteId || !perfil?.empresa_id) return
        supabase.from('ventas')
            .select('id, numero_factura, fecha_venta, total')
            .eq('empresa_id', perfil.empresa_id).eq('cliente_id', clienteId)
            .neq('estado_cobro', 'anulado')
            .order('fecha_venta', { ascending: false }).limit(100)
            .then(({ data }) => setVentas(data || []))
    }, [clienteId, perfil?.empresa_id])

    // Ítems de la factura elegida, con el tope de lo que aún se puede acreditar.
    useEffect(() => {
        setItemsFactura([])
        if (!ventaId) return
        setCargandoFactura(true)
        async function cargar() {
            const [{ data: items }, { data: previas }] = await Promise.all([
                supabase.from('venta_items')
                    .select('producto_id, cantidad, precio_unitario, aplica_iva, productos_terminados(nombre, sku, aplica_iva)')
                    .eq('venta_id', ventaId),
                supabase.from('devoluciones').select('devolucion_items(producto_id, cantidad_devuelta)')
                    .eq('venta_id', ventaId),
            ])
            // Lo ya acreditado por producto, para no devolver más de lo facturado.
            const devueltas = {}
            for (const d of previas || []) {
                for (const di of d.devolucion_items || []) {
                    if (!di.producto_id) continue
                    devueltas[di.producto_id] = (devueltas[di.producto_id] || 0) + Number(di.cantidad_devuelta || 0)
                }
            }
            setItemsFactura((items || []).map(i => ({
                producto_id: i.producto_id,
                nombre: i.productos_terminados?.nombre || '—',
                sku: i.productos_terminados?.sku || '',
                precio_unitario: Number(i.precio_unitario || 0),
                aplica_iva: itemAplicaIva(i),
                disponible: Math.max(0, Number(i.cantidad || 0) - (devueltas[i.producto_id] || 0)),
            })))
            setCargandoFactura(false)
        }
        cargar()
    }, [ventaId])

    // Búsqueda en catálogo, para líneas sin factura de referencia
    useEffect(() => {
        const q = busqueda.trim()
        if (q.length < 2 || !perfil?.empresa_id) { setResultados([]); return }
        setBuscando(true)
        const t = setTimeout(async () => {
            const { data } = await supabase.from('productos_terminados')
                .select('id, nombre, sku, precio_venta, aplica_iva')
                .eq('empresa_id', perfil.empresa_id).eq('activo', true)
                .or(`nombre.ilike.%${q}%,sku.ilike.%${q}%`)
                .order('nombre').limit(20)
            setResultados(data || [])
            setBuscando(false)
        }, 250)
        return () => clearTimeout(t)
    }, [busqueda, perfil?.empresa_id])

    const motivo = motivos.find(m => m.id === motivoId)

    function elegirMotivo(id) {
        setMotivoId(id)
        const m = motivos.find(x => x.id === id)
        if (m) {
            setAfectaInventario(!!m.afecta_inventario_default)
            setGeneraCredito(!!m.genera_credito_default)
        }
    }

    function agregarDeFactura(it) {
        if (it.disponible <= 0) return
        setLineas(prev => [...prev, {
            key: `${it.producto_id}-${Date.now()}`,
            tipo_linea: 'producto',
            producto_id: it.producto_id,
            nombre: it.nombre, sku: it.sku,
            cantidad: 1, max: it.disponible,
            precio_unitario: it.precio_unitario,
            aplica_iva: it.aplica_iva,
        }])
    }

    function agregarDeCatalogo(p) {
        setLineas(prev => [...prev, {
            key: `${p.id}-${Date.now()}`,
            tipo_linea: 'producto',
            producto_id: p.id,
            nombre: p.nombre, sku: p.sku || '',
            cantidad: 1, max: null,
            precio_unitario: Number(p.precio_venta || 0),
            aplica_iva: p.aplica_iva ?? true,
        }])
        setBusqueda(''); setResultados([])
    }

    function agregarConcepto() {
        setLineas(prev => [...prev, {
            key: `valor-${Date.now()}`,
            tipo_linea: 'valor',
            concepto: '', cantidad: 1, max: null,
            precio_unitario: 0, aplica_iva: false,
        }])
    }

    const setLinea = (key, campo, valor) =>
        setLineas(prev => prev.map(l => l.key === key ? { ...l, [campo]: valor } : l))
    const quitarLinea = (key) => setLineas(prev => prev.filter(l => l.key !== key))

    const totales = useMemo(() => calcularTotalesNC(lineas), [lineas])
    const hayProductos = lineas.some(l => l.tipo_linea === 'producto')

    // Quien ya es aprobador se auto-aprueba: en una operación donde el admin
    // emite, exigir un segundo usuario trabaría el sistema. El umbral solo
    // frena a quien no tiene ese rol.
    const puedeAprobar = esAprobadorNC(perfil)
    const requiereAprobacion = umbral > 0 && totales.total > umbral && !puedeAprobar

    // Una línea de valor sin concepto viola el CHECK de devolucion_items.
    const lineasInvalidas = lineas.some(l =>
        (l.tipo_linea === 'valor' && !String(l.concepto || '').trim()) ||
        Number(l.cantidad) <= 0 ||
        (l.max != null && Number(l.cantidad) > l.max)
    )

    async function emitir() {
        if (!clienteId) { setError('Selecciona el cliente'); return }
        if (!motivoId) { setError('Selecciona el motivo'); return }
        if (!lineas.length) { setError('Agrega al menos una línea'); return }
        if (lineasInvalidas) { setError('Revisa las líneas: falta concepto o la cantidad no es válida'); return }
        if (totales.total <= 0) { setError('El monto de la nota debe ser mayor a cero'); return }
        if (afectaInventario && !almacenId) { setError('Selecciona el almacén destino'); return }
        if (afectaInventario && !hayProductos) { setError('No hay líneas de producto que reingresar al almacén'); return }
        if (sinTasa) { setError('No hay tasa registrada para la fecha de emisión'); return }

        setGuardando(true); setError('')
        const { data: { user } } = await supabase.auth.getUser()

        const { error: err } = await crearNotaCredito({
            empresaId: perfil.empresa_id,
            usuarioId: user.id,
            clienteId,
            ventaId: ventaId || null,
            origen: 'manual',
            motivo: motivo?.nombre + (nota.trim() ? ` — ${nota.trim()}` : ''),
            motivoTipoId: motivoId,
            tipoDevolucion: generaCredito ? 'nota_credito' : 'reposicion_stock',
            afectaInventario,
            generaCredito,
            almacenId: afectaInventario ? almacenId : null,
            referenciaFiscal: referenciaFiscal.trim() || null,
            fechaEmision: fecha,
            tasaCambio: tasaDia,
            tipoTasa,
            estadoInicial: requiereAprobacion ? 'en_revision' : 'pendiente',
            aprobadaPor: requiereAprobacion ? null : (puedeAprobar ? user.id : null),
            lineas,
        })

        setGuardando(false)
        if (err) { setError('Error al emitir: ' + err.message); return }
        onEmitida()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', width: '760px', maxWidth: '95vw', maxHeight: '92vh', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 28px 16px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Emitir nota de crédito</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                <div style={{ padding: '0 28px', overflowY: 'auto', flex: 1 }}>

                    {/* ── Cliente y motivo ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                        <div>
                            <label style={labelStyle}>Cliente *</label>
                            <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={inputStyle}>
                                <option value="">Selecciona…</option>
                                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Motivo *</label>
                            <select value={motivoId} onChange={e => elegirMotivo(e.target.value)} style={inputStyle}>
                                <option value="">Selecciona…</option>
                                {motivos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                            </select>
                        </div>
                    </div>
                    {motivo?.descripcion && (
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: '-6px 0 16px' }}>{motivo.descripcion}</p>
                    )}

                    {/* ── Comportamiento del documento ── */}
                    <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', marginBottom: '18px' }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
                            <input type="checkbox" checked={generaCredito} onChange={e => setGeneraCredito(e.target.checked)} style={{ marginTop: '3px' }} />
                            <span style={{ fontSize: '13px', color: '#374151' }}>
                                <strong>Genera crédito aplicable</strong>
                                <span style={{ display: 'block', fontSize: '12px', color: '#6b7280' }}>
                                    Recibe N° de NC y queda disponible para descontar de facturas del cliente. Desmárcalo si al cliente ya se le compensó con mercancía de reposición.
                                </span>
                            </span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={afectaInventario} onChange={e => setAfectaInventario(e.target.checked)} style={{ marginTop: '3px' }} />
                            <span style={{ fontSize: '13px', color: '#374151' }}>
                                <strong>Reingresa mercancía al almacén</strong>
                                <span style={{ display: 'block', fontSize: '12px', color: '#6b7280' }}>
                                    Déjalo sin marcar cuando el producto no vuelve — por ejemplo vencimiento desechado en el cliente, o un descuento sin devolución.
                                </span>
                            </span>
                        </label>
                        {afectaInventario && (
                            <div style={{ marginTop: '12px' }}>
                                <label style={labelStyle}>Almacén destino *</label>
                                <select value={almacenId} onChange={e => setAlmacenId(e.target.value)} style={inputStyle}>
                                    {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* ── Factura de referencia ── */}
                    <p style={seccionStyle}>Factura de referencia (opcional)</p>
                    <select value={ventaId} onChange={e => setVentaId(e.target.value)} disabled={!clienteId}
                        style={{ ...inputStyle, marginBottom: '12px', opacity: clienteId ? 1 : 0.5 }}>
                        <option value="">Sin referencia — a cuenta del cliente</option>
                        {ventas.map(v => (
                            <option key={v.id} value={v.id}>
                                {v.numero_factura || v.id.slice(0, 8)} · {new Date(v.fecha_venta).toLocaleDateString('es-VE')} · {fmt(v.total)}
                            </option>
                        ))}
                    </select>

                    {cargandoFactura && <p style={{ fontSize: '13px', color: '#9ca3af' }}>Cargando ítems…</p>}
                    {itemsFactura.length > 0 && (
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '18px', maxHeight: '180px', overflowY: 'auto' }}>
                            {itemsFactura.map(it => (
                                <div key={it.producto_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: '1px solid #f3f4f6' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', color: '#1f2937' }}>{it.nombre}</div>
                                        <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{it.sku} · {fmt(it.precio_unitario)}</div>
                                    </div>
                                    <span style={{ fontSize: '11px', color: it.disponible > 0 ? '#6b7280' : '#dc2626' }}>
                                        {it.disponible > 0 ? `${it.disponible} acreditables` : 'ya acreditado'}
                                    </span>
                                    <button onClick={() => agregarDeFactura(it)} disabled={it.disponible <= 0}
                                        style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: it.disponible > 0 ? '#374151' : '#d1d5db', cursor: it.disponible > 0 ? 'pointer' : 'default' }}>
                                        Agregar
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Líneas ── */}
                    <p style={seccionStyle}>Líneas de la nota</p>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                                placeholder="Buscar producto por nombre o SKU…"
                                style={{ ...inputStyle, paddingLeft: '30px' }} />
                            {(resultados.length > 0 || buscando) && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto', zIndex: 10 }}>
                                    {buscando && <div style={{ padding: '10px 12px', fontSize: '13px', color: '#9ca3af' }}>Buscando…</div>}
                                    {resultados.map(p => (
                                        <div key={p.id} onClick={() => agregarDeCatalogo(p)}
                                            style={{ padding: '8px 12px', fontSize: '13px', color: '#1f2937', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>
                                            {p.nombre}
                                            <span style={{ display: 'block', fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.sku} · {fmt(p.precio_venta)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={agregarConcepto}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <Plus size={14} /> Concepto
                        </button>
                    </div>

                    {lineas.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px', border: '1px dashed #e5e7eb', borderRadius: '8px', marginBottom: '18px' }}>
                            Agrega productos o un concepto de valor (ej. "Descuento promocional Q3")
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '18px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb' }}>
                                    {['Descripción', 'Cant.', 'P. Unit.', 'IVA', 'Subtotal', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '8px 10px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: i >= 1 && i <= 4 ? 'right' : 'left' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {lineas.map(l => {
                                    const excede = l.max != null && Number(l.cantidad) > l.max
                                    return (
                                        <tr key={l.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '8px 10px' }}>
                                                {l.tipo_linea === 'valor' ? (
                                                    <input value={l.concepto} onChange={e => setLinea(l.key, 'concepto', e.target.value)}
                                                        placeholder="Concepto…"
                                                        style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', borderColor: String(l.concepto || '').trim() ? '#d1d5db' : '#fca5a5' }} />
                                                ) : (
                                                    <div>
                                                        <div style={{ fontSize: '13px', color: '#1f2937' }}>{l.nombre}</div>
                                                        <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>
                                                            {l.sku}{l.max != null ? ` · máx ${l.max}` : ''}
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                                <input type="number" min="0" step="any" value={l.cantidad}
                                                    onChange={e => setLinea(l.key, 'cantidad', e.target.value === '' ? '' : Number(e.target.value))}
                                                    style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', width: '70px', textAlign: 'right', borderColor: excede ? '#fca5a5' : '#d1d5db' }} />
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                                <input type="number" min="0" step="0.01" value={l.precio_unitario}
                                                    onChange={e => setLinea(l.key, 'precio_unitario', e.target.value === '' ? '' : Number(e.target.value))}
                                                    style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', width: '90px', textAlign: 'right' }} />
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                                <input type="checkbox" checked={!!l.aplica_iva}
                                                    onChange={e => setLinea(l.key, 'aplica_iva', e.target.checked)} />
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                                                {fmt(Number(l.cantidad || 0) * Number(l.precio_unitario || 0))}
                                            </td>
                                            <td style={{ padding: '8px 10px' }}>
                                                <button onClick={() => quitarLinea(l.key)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}

                    {/* ── Fecha, tasa y referencia ── */}
                    <p style={seccionStyle}>Emisión</p>
                    <SelectorFechaTasa
                        fecha={fecha} onFecha={setFecha}
                        tasasFecha={tasasFecha} cargandoTasas={cargandoTasas}
                        tipoTasa={tipoTasa} onTipoTasa={setTipoTasa}
                        label="Fecha de emisión" />

                    <div style={{ marginBottom: '16px' }}>
                        <label style={labelStyle}>Referencia fiscal</label>
                        <input value={referenciaFiscal} onChange={e => setReferenciaFiscal(e.target.value)}
                            placeholder="N° de la factura fiscal externa que afecta (opcional)" style={inputStyle} />
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <label style={labelStyle}>Nota</label>
                        <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2}
                            placeholder="Detalle adicional del motivo (opcional)"
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                    </div>
                </div>

                {/* ── Totales y acciones ── */}
                <div style={{ borderTop: '1px solid #e5e7eb', padding: '16px 28px 24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '28px', marginBottom: '14px', fontSize: '13px' }}>
                        <span style={{ color: '#6b7280' }}>Base <strong style={{ color: '#374151' }}>{fmt(totales.subtotal)}</strong></span>
                        <span style={{ color: '#6b7280' }}>IVA <strong style={{ color: '#374151' }}>{fmt(totales.iva)}</strong></span>
                        <span style={{ color: '#6b7280' }}>Total <strong style={{ color: '#1f2937', fontSize: '15px' }}>{fmt(totales.total)}</strong></span>
                    </div>

                    {requiereAprobacion && (
                        <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '9px 12px', fontSize: '12px', color: '#1e40af', marginBottom: '12px' }}>
                            Supera el umbral de aprobación de {fmt(umbral)}: la nota quedará <strong>por aprobar</strong> y no será crédito aplicable hasta que finanzas la autorice.
                        </div>
                    )}
                    {!generaCredito && lineas.length > 0 && (
                        <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '9px 12px', fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                            Este documento no lleva N° de NC ni podrá aplicarse a facturas: queda solo como registro de la devolución.
                        </div>
                    )}
                    {error && (
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={onCerrar} style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
                        <button onClick={emitir} disabled={guardando}
                            style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: '#d97706', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
                            {guardando ? 'Emitiendo…' : requiereAprobacion ? 'Enviar a aprobación' : 'Emitir nota de crédito'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}

// ── Modal: catálogo de motivos ─────────────────────────────────
export function ModalMotivosNC({ onCerrar }) {
    const { perfil } = useAuth()
    const [motivos, setMotivos] = useState([])
    const [loading, setLoading] = useState(true)
    const [nuevo, setNuevo] = useState({ nombre: '', descripcion: '', afecta: false, credito: true })
    const [editando, setEditando] = useState(null)
    const [error, setError] = useState('')
    const [umbral, setUmbral] = useState('')
    const [guardandoUmbral, setGuardandoUmbral] = useState(false)
    const [umbralOk, setUmbralOk] = useState(false)

    async function cargar() {
        const { data } = await supabase.from('motivos_nc')
            .select('*').eq('empresa_id', perfil.empresa_id).order('orden')
        setMotivos(data || []); setLoading(false)
    }
    useEffect(() => {
        if (!perfil?.empresa_id) return
        cargar()
        leerUmbralNC(perfil.empresa_id).then(u => setUmbral(u > 0 ? String(u) : ''))
    }, [perfil?.empresa_id])

    // Vacío o cero desactiva el control. Se guarda en `configuracion`, que es
    // donde el proyecto lleva los ajustes clave/valor por empresa.
    async function guardarUmbral() {
        setGuardandoUmbral(true); setError(''); setUmbralOk(false)
        // `configuracion` no tiene id: su PK es (clave, empresa_id), y `valor` es
        // numeric NOT NULL. El upsert va sobre esa clave compuesta.
        const valor = Number(umbral) > 0 ? Number(umbral) : 0
        const { error: err } = await supabase.from('configuracion').upsert({
            empresa_id: perfil.empresa_id,
            clave: 'umbral_aprobacion_nc',
            valor,
            actualizado_at: new Date().toISOString(),
        }, { onConflict: 'clave,empresa_id' })
        setGuardandoUmbral(false)
        if (err) { setError(err.message); return }
        setUmbralOk(true)
        setTimeout(() => setUmbralOk(false), 2500)
    }

    async function agregar() {
        if (!nuevo.nombre.trim()) return
        setError('')
        const { error: err } = await supabase.from('motivos_nc').insert({
            empresa_id: perfil.empresa_id,
            nombre: nuevo.nombre.trim(),
            descripcion: nuevo.descripcion.trim() || null,
            afecta_inventario_default: nuevo.afecta,
            genera_credito_default: nuevo.credito,
            orden: (motivos[motivos.length - 1]?.orden || 0) + 1,
        })
        if (err) { setError(err.message); return }
        setNuevo({ nombre: '', descripcion: '', afecta: false, credito: true })
        cargar()
    }

    async function guardarEdicion() {
        if (!editando.nombre.trim()) return
        setError('')
        const { error: err } = await supabase.from('motivos_nc').update({
            nombre: editando.nombre.trim(),
            descripcion: editando.descripcion?.trim() || null,
            afecta_inventario_default: editando.afecta_inventario_default,
            genera_credito_default: editando.genera_credito_default,
        }).eq('id', editando.id)
        if (err) { setError(err.message); return }
        setEditando(null); cargar()
    }

    // Un motivo ya usado por alguna NC no se borra: se desactiva, para no
    // romper la referencia de los documentos históricos.
    async function eliminar(m) {
        setError('')
        const { count } = await supabase.from('devoluciones')
            .select('id', { count: 'exact', head: true }).eq('motivo_tipo_id', m.id)
        if (count > 0) {
            await supabase.from('motivos_nc').update({ activo: false }).eq('id', m.id)
        } else {
            const { error: err } = await supabase.from('motivos_nc').delete().eq('id', m.id)
            if (err) { setError(err.message); return }
        }
        cargar()
    }

    const reactivar = async (m) => {
        await supabase.from('motivos_nc').update({ activo: true }).eq('id', m.id)
        cargar()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', width: '640px', maxWidth: '95vw', maxHeight: '88vh', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 28px 12px' }}>
                    <div>
                        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Motivos y aprobación</h2>
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: '4px 0 0' }}>
                            Cada motivo precarga el comportamiento del documento al emitirlo.
                        </p>
                    </div>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                <div style={{ padding: '0 28px', overflowY: 'auto', flex: 1 }}>
                    {/* Umbral de aprobación */}
                    <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', marginBottom: '18px' }}>
                        <label style={labelStyle}>Umbral de aprobación</label>
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 10px' }}>
                            Las NC por encima de este monto quedan <strong>por aprobar</strong> y no son crédito
                            aplicable hasta que las autorice un usuario con rol admin o finanzas. Déjalo vacío
                            para desactivar el control: quien emite, emite directo.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '14px', color: '#6b7280' }}>$</span>
                            <input type="number" min="0" step="0.01" value={umbral}
                                onChange={e => setUmbral(e.target.value)} placeholder="Sin umbral"
                                style={{ ...inputStyle, width: '140px' }} />
                            <button onClick={guardarUmbral} disabled={guardandoUmbral}
                                style={{ padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', backgroundColor: '#374151', color: '#fff', cursor: 'pointer', opacity: guardandoUmbral ? 0.6 : 1 }}>
                                {guardandoUmbral ? 'Guardando…' : 'Guardar'}
                            </button>
                            {umbralOk && <span style={{ fontSize: '13px', color: '#16a34a', fontWeight: 500 }}>✓ Guardado</span>}
                        </div>
                    </div>

                    <p style={seccionStyle}>Motivos</p>
                    {loading ? <p style={{ color: '#9ca3af', fontSize: '13px' }}>Cargando…</p> : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb' }}>
                                    {['Motivo', 'Repone stock', 'Da crédito', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '8px 10px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: i === 0 ? 'left' : 'center' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {motivos.map(m => editando?.id === m.id ? (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: '#fffbeb' }}>
                                        <td style={{ padding: '8px 10px' }}>
                                            <input value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                                                style={{ ...inputStyle, padding: '6px 8px', fontSize: '13px', marginBottom: '4px' }} />
                                            <input value={editando.descripcion || ''} onChange={e => setEditando({ ...editando, descripcion: e.target.value })}
                                                placeholder="Descripción" style={{ ...inputStyle, padding: '6px 8px', fontSize: '12px' }} />
                                        </td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                            <input type="checkbox" checked={editando.afecta_inventario_default}
                                                onChange={e => setEditando({ ...editando, afecta_inventario_default: e.target.checked })} />
                                        </td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                            <input type="checkbox" checked={editando.genera_credito_default}
                                                onChange={e => setEditando({ ...editando, genera_credito_default: e.target.checked })} />
                                        </td>
                                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                            <button onClick={guardarEdicion} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', border: 'none', backgroundColor: '#16a34a', color: '#fff', cursor: 'pointer', marginRight: '4px' }}>OK</button>
                                            <button onClick={() => setEditando(null)} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}>✕</button>
                                        </td>
                                    </tr>
                                ) : (
                                    <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: m.activo ? 1 : 0.5 }}>
                                        <td style={{ padding: '10px' }}>
                                            <div style={{ fontSize: '13px', color: '#1f2937' }}>
                                                {m.nombre}
                                                {!m.activo && <span style={{ fontSize: '11px', color: '#9ca3af' }}> (inactivo)</span>}
                                            </div>
                                            {m.descripcion && <div style={{ fontSize: '11px', color: '#9ca3af' }}>{m.descripcion}</div>}
                                        </td>
                                        <td style={{ padding: '10px', textAlign: 'center', fontSize: '13px' }}>{m.afecta_inventario_default ? '✓' : '—'}</td>
                                        <td style={{ padding: '10px', textAlign: 'center', fontSize: '13px' }}>{m.genera_credito_default ? '✓' : '—'}</td>
                                        <td style={{ padding: '10px', whiteSpace: 'nowrap' }}>
                                            {m.activo ? (<>
                                                <button onClick={() => setEditando(m)} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', cursor: 'pointer', marginRight: '4px' }}>Editar</button>
                                                <button onClick={() => eliminar(m)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px' }}><Trash2 size={14} /></button>
                                            </>) : (
                                                <button onClick={() => reactivar(m)} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}>Reactivar</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Alta */}
                    <div style={{ borderTop: '1px solid #e5e7eb', marginTop: '16px', paddingTop: '16px' }}>
                        <label style={labelStyle}>Nuevo motivo</label>
                        <input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })}
                            placeholder="Nombre" style={{ ...inputStyle, marginBottom: '8px' }} />
                        <input value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })}
                            placeholder="Descripción (opcional)" style={{ ...inputStyle, marginBottom: '10px' }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '12px', fontSize: '13px', color: '#374151' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={nuevo.afecta} onChange={e => setNuevo({ ...nuevo, afecta: e.target.checked })} />
                                Repone stock
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={nuevo.credito} onChange={e => setNuevo({ ...nuevo, credito: e.target.checked })} />
                                Da crédito aplicable
                            </label>
                        </div>
                        {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '10px' }}>{error}</div>}
                        <button onClick={agregar} disabled={!nuevo.nombre.trim()}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', backgroundColor: '#d97706', color: '#fff', cursor: nuevo.nombre.trim() ? 'pointer' : 'default', opacity: nuevo.nombre.trim() ? 1 : 0.5 }}>
                            <Plus size={14} /> Agregar motivo
                        </button>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #e5e7eb', padding: '14px 28px' }}>
                    <button onClick={onCerrar} style={{ width: '100%', padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>Cerrar</button>
                </div>
            </div>
        </>
    )
}
