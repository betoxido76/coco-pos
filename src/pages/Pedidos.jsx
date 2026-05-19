import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Check, X, FileText, ChevronRight, Clock, Search, Bell } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

const ESTADOS = {
    pendiente: { bg: '#fef9c3', color: '#854d0e', label: 'Pendiente' },
    aprobado: { bg: '#dbeafe', color: '#1e40af', label: 'Aprobado' },
    alistado: { bg: '#fff7ed', color: '#c2410c', label: 'Alistado' },
    rechazado: { bg: '#fee2e2', color: '#991b1b', label: 'Rechazado' },
    facturado: { bg: '#dcfce7', color: '#166534', label: 'Facturado' },
}

function BadgeEstado({ estado }) {
    const e = ESTADOS[estado] || ESTADOS.pendiente
    return (
        <span style={{ backgroundColor: e.bg, color: e.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>
            {e.label}
        </span>
    )
}

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Pedidos() {
    const { perfil } = useAuth()
    const [tabActiva, setTabActiva] = useState('pendientes')
    const [pedidos, setPedidos] = useState([])
    const [loading, setLoading] = useState(true)
    const [pedidoActual, setPedidoActual] = useState(null)
    const [busqueda, setBusqueda] = useState('')
    const [filtroVendedor, setFiltroVendedor] = useState('')
    const [vendedores, setVendedores] = useState([])
    const [toasts, setToasts] = useState([])
    const [reloadKey, setReloadKey] = useState(0)

    useEffect(() => { cargar() }, [tabActiva, reloadKey])

    useEffect(() => {
        if (!perfil?.empresa_id) return
        const channel = supabase
            .channel(`pedidos_backoffice_${perfil.empresa_id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'pedidos',
                filter: `empresa_id=eq.${perfil.empresa_id}`
            }, (payload) => {
                const nuevo = payload.new
                const id = Date.now()
                setToasts(prev => [...prev, { id, pedido: nuevo }])
                setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
                setReloadKey(k => k + 1)
            })
            .subscribe()
        return () => supabase.removeChannel(channel)
    }, [perfil?.empresa_id])

    useEffect(() => {
        supabase.from('usuarios')
            .select('id, nombre')
            .eq('empresa_id', perfil.empresa_id)
            .eq('rol', 'vendedor')
            .order('nombre')
            .then(({ data }) => setVendedores(data || []))
    }, [])

    async function cargar() {
        setLoading(true)
        let q = supabase
            .from('pedidos')
            .select(`
                *,
                clientes(nombre, rif),
                usuarios(nombre)
            `)
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })

        if (tabActiva === 'pendientes') q = q.eq('estado', 'pendiente')
        else if (tabActiva === 'aprobados') q = q.eq('estado', 'aprobado')
        else if (tabActiva === 'alistados') q = q.eq('estado', 'alistado')
        else if (tabActiva === 'historial') q = q.in('estado', ['rechazado', 'facturado'])

        const { data } = await q
        if (data) setPedidos(data)
        setLoading(false)
    }

    const filtrados = pedidos.filter(p => {
        const matchBusqueda =
            p.clientes?.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
            p.numero_pedido?.toLowerCase().includes(busqueda.toLowerCase()) ||
            p.usuarios?.nombre?.toLowerCase().includes(busqueda.toLowerCase())
        const matchVendedor = filtroVendedor ? p.vendedor_id === filtroVendedor : true
        return matchBusqueda && matchVendedor
    })

    // KPIs
    const pendientesCount = pedidos.filter(p => p.estado === 'pendiente').length

    if (pedidoActual)
        return <DetallePedido
            pedido={pedidoActual}
            onVolver={() => { setPedidoActual(null); cargar() }}
        />

    return (
        <div style={{ padding: '24px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Pedidos</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Gestión de pedidos de la fuerza de ventas</p>
                </div>
                {pendientesCount > 0 && (
                    <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} style={{ color: '#d97706' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#854d0e' }}>
                            {pendientesCount} pedido{pendientesCount > 1 ? 's' : ''} pendiente{pendientesCount > 1 ? 's' : ''} de revisión
                        </span>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'pendientes', label: 'Pendientes' },
                    { key: 'aprobados', label: 'Aprobados' },
                    { key: 'alistados', label: 'Alistados' },
                    { key: 'historial', label: 'Historial' },
                ].map(tab => (
                    <button key={tab.key} onClick={() => { setTabActiva(tab.key); setBusqueda(''); setFiltroVendedor('') }}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: tabActiva === tab.key ? '#16a34a' : '#e5e7eb',
                            backgroundColor: tabActiva === tab.key ? '#f0fdf4' : '#fff',
                            color: tabActiva === tab.key ? '#16a34a' : '#6b7280',
                        }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" placeholder="Buscar por cliente, pedido o vendedor..."
                        value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: '32px' }} />
                </div>
                <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                    style={{ ...inputStyle, width: 'auto', minWidth: '180px' }}>
                    <option value="">Todos los vendedores</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
            </div>

            {/* Tabla */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : filtrados.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                        No hay pedidos en este estado
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Pedido', 'Cliente', 'Vendedor', 'Fecha pedido', 'Entrega', 'Total', 'Estado', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151', fontWeight: 600 }}>
                                        {p.numero_pedido || '—'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
                                        {p.clientes?.nombre || '—'}
                                        {p.clientes?.rif && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.clientes.rif}</div>}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.usuarios?.nombre || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                        {new Date(p.fecha_pedido).toLocaleDateString('es-VE')}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                        {p.fecha_entrega ? new Date(p.fecha_entrega + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                                        <TotalPedido pedidoId={p.id} descuentoGlobal={p.descuento_global} />
                                    </td>
                                    <td style={{ padding: '12px 16px' }}><BadgeEstado estado={p.estado} /></td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <button onClick={() => setPedidoActual(p)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                            <FileText size={13} /> Ver
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Toasts de nuevo pedido */}
            <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {toasts.map((toast, idx) => (
                    <div key={toast.id} style={{
                        backgroundColor: '#fff', border: '1px solid #bbf7d0', borderRadius: '12px',
                        padding: '14px 16px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                        display: 'flex', alignItems: 'center', gap: '12px', minWidth: '280px',
                        animation: 'slideIn 0.2s ease',
                    }}>
                        <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '8px', flexShrink: 0 }}>
                            <Bell size={18} color="#16a34a" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937', margin: '0 0 2px' }}>Nuevo pedido recibido</p>
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontFamily: 'monospace' }}>
                                {toast.pedido.numero_pedido || 'Sin número'}
                            </p>
                        </div>
                        <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '2px', lineHeight: 1 }}>
                            ✕
                        </button>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Total calculado desde items ────────────────────────────────
function TotalPedido({ pedidoId, descuentoGlobal }) {
    const [total, setTotal] = useState(null)
    useEffect(() => {
        supabase.from('pedido_items').select('cantidad, precio_unitario, descuento_item, productos_terminados(aplica_iva)')
            .eq('pedido_id', pedidoId)
            .then(({ data }) => {
                if (!data) return
                const total = data.reduce((s, i) => {
                    const precio = Number(i.precio_unitario)
                    const desc = Number(i.descuento_item || 0)
                    const linea = Number(i.cantidad) * precio * (1 - desc / 100) * (1 - Number(descuentoGlobal || 0) / 100)
                    return s + ((i.productos_terminados?.aplica_iva ?? true) ? linea * 1.16 : linea)
                }, 0)
                setTotal(total)
            })
    }, [pedidoId])
    return <span>{total !== null ? fmt(total) : '—'}</span>
}

// ══════════════════════════════════════════════════════════════
// DETALLE DEL PEDIDO
// ══════════════════════════════════════════════════════════════
function DetallePedido({ pedido, onVolver }) {
    const { perfil } = useAuth()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [procesando, setProcesando] = useState(false)
    const [modalRechazo, setModalRechazo] = useState(false)
    const [motivoRechazo, setMotivoRechazo] = useState('')
    const [error, setError] = useState('')
    const [exito, setExito] = useState('')

    useEffect(() => {
        supabase.from('pedido_items')
            .select('*, productos_terminados(nombre, sku, aplica_iva)')
            .eq('pedido_id', pedido.id)
            .then(({ data }) => { if (data) setItems(data); setLoading(false) })
    }, [pedido.id])

    const descGlobal = Number(pedido.descuento_global || 0)
    const subtotalConDescItems = items.reduce((s, i) => {
        const desc = Number(i.descuento_item || 0)
        return s + Number(i.cantidad) * Number(i.precio_unitario) * (1 - desc / 100)
    }, 0)
    const subtotalBruto = subtotalConDescItems
    const subtotalFinal = subtotalConDescItems * (1 - descGlobal / 100)
    const iva = items.reduce((s, i) => {
        if (!(i.productos_terminados?.aplica_iva ?? true)) return s
        const desc = Number(i.descuento_item || 0)
        return s + Number(i.cantidad) * Number(i.precio_unitario) * (1 - desc / 100) * (1 - descGlobal / 100) * 0.16
    }, 0)
    const total = subtotalFinal + iva

    async function aprobar() {
        setProcesando(true); setError('')
        const { error: err } = await supabase.from('pedidos')
            .update({ estado: 'aprobado' })
            .eq('id', pedido.id)
        setProcesando(false)
        if (err) { setError('Error: ' + err.message); return }
        setExito('Pedido aprobado correctamente')
        setTimeout(() => onVolver(), 1500)
    }

    async function rechazar() {
        if (!motivoRechazo.trim()) { setError('Ingresa el motivo de rechazo'); return }
        setProcesando(true); setError('')
        const { error: err } = await supabase.from('pedidos')
            .update({ estado: 'rechazado', motivo_rechazo: motivoRechazo.trim() })
            .eq('id', pedido.id)
        setProcesando(false)
        if (err) { setError('Error: ' + err.message); return }
        setExito('Pedido rechazado')
        setTimeout(() => onVolver(), 1500)
    }

    async function convertirEnFactura() {
        setProcesando(true); setError('')

        const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_ventas_numero', {
            p_empresa_id: perfil.empresa_id
        })
        const numero = numeroConsecutivo || 'NE-000001'
        const { data: { user } } = await supabase.auth.getUser()

        const { data: venta, error: errVenta } = await supabase
            .from('ventas')
            .insert({
                cliente_id: pedido.cliente_id,
                usuario_id: user.id,
                numero_factura: numero,
                subtotal: subtotalFinal,
                total,
                estado_cobro: 'pendiente',
                empresa_id: perfil.empresa_id,
            })
            .select()
            .single()

        if (errVenta) { setError('Error al crear factura: ' + errVenta.message); setProcesando(false); return }

        await supabase.from('venta_items').insert(
            items.map(i => ({
                venta_id: venta.id,
                producto_id: i.producto_id,
                cantidad: i.cantidad,
                precio_unitario: Number(i.precio_unitario) * (1 - Number(i.descuento_item || 0) / 100) * (1 - descGlobal / 100),
                empresa_id: perfil.empresa_id,
            }))
        )

        await supabase.from('pedidos')
            .update({ estado: 'facturado', venta_id: venta.id })
            .eq('id', pedido.id)

        setProcesando(false)
        setExito('Factura creada correctamente')
        setTimeout(() => onVolver(), 1500)
    }

    return (
        <div style={{ padding: '24px', maxWidth: '720px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                    Pedido {pedido.numero_pedido || '—'}
                </h1>
                <BadgeEstado estado={pedido.estado} />
            </div>

            {exito && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#166534', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={16} /> {exito}
                </div>
            )}

            {/* Info cabecera */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Cliente', valor: pedido.clientes?.nombre || '—' },
                    { label: 'Vendedor', valor: pedido.usuarios?.nombre || '—' },
                    { label: 'Fecha pedido', valor: new Date(pedido.fecha_pedido).toLocaleDateString('es-VE') },
                    { label: 'Entrega prometida', valor: pedido.fecha_entrega ? new Date(pedido.fecha_entrega + 'T00:00:00').toLocaleDateString('es-VE') : '—' },
                ].map(f => (
                    <div key={f.label} style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px' }}>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }}>{f.valor}</p>
                    </div>
                ))}
            </div>

            {/* Notas */}
            {pedido.notas && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', color: '#d97706', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Notas del vendedor</p>
                    <p style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>{pedido.notas}</p>
                </div>
            )}

            {/* Motivo rechazo */}
            {pedido.estado === 'rechazado' && pedido.motivo_rechazo && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', color: '#dc2626', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Motivo de rechazo</p>
                    <p style={{ fontSize: '13px', color: '#991b1b', margin: 0 }}>{pedido.motivo_rechazo}</p>
                </div>
            )}

            {/* Items */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                {loading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando items...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Producto', 'Cant.', 'Precio lista', 'Desc. item', 'Subtotal'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i > 0 ? 'right' : 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => {
                                const precioConDesc = Number(item.precio_unitario) * (1 - Number(item.descuento_item || 0) / 100)
                                const subtotal = Number(item.cantidad) * precioConDesc
                                return (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1f2937', fontWeight: 500 }}>
                                            {item.nombre_producto || item.productos_terminados?.nombre || '—'}
                                            {item.productos_terminados?.sku && (
                                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{item.productos_terminados.sku}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{Number(item.cantidad).toLocaleString('es-VE')}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'right' }}>
                                            {Number(item.descuento_item || 0) > 0
                                                ? <span style={{ color: '#16a34a', fontWeight: 500 }}>-{item.descuento_item}%</span>
                                                : <span style={{ color: '#9ca3af' }}>—</span>}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(subtotal)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Totales */}
            <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: '20px' }}>
                {[
                    { label: 'Subtotal bruto', valor: fmt(subtotalBruto) },
                    descGlobal > 0 && { label: `Descuento global (${descGlobal}%)`, valor: `-${fmt(subtotalConDescItems - subtotalFinal)}`, color: '#16a34a' },
                    { label: 'IVA (16%)', valor: fmt(iva) },
                ].filter(Boolean).map((f, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: f.color || '#6b7280', marginBottom: '6px' }}>
                        <span>{f.label}</span><span>{f.valor}</span>
                    </div>
                ))}
                <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '10px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>
                    <span>Total</span><span style={{ color: '#16a34a' }}>{fmt(total)}</span>
                </div>
            </div>

            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            {/* Acciones */}
            {pedido.estado === 'pendiente' && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={aprobar} disabled={procesando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: procesando ? 0.6 : 1 }}>
                        <Check size={16} /> {procesando ? 'Procesando...' : 'Aprobar pedido'}
                    </button>
                    <button onClick={() => setModalRechazo(true)} disabled={procesando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', padding: '11px 20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <X size={16} /> Rechazar
                    </button>
                </div>
            )}

            {pedido.estado === 'aprobado' && (
                <button onClick={convertirEnFactura} disabled={procesando}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: procesando ? 0.6 : 1 }}>
                    <ChevronRight size={16} /> {procesando ? 'Creando factura...' : 'Convertir en factura'}
                </button>
            )}

            {/* Modal rechazo */}
            {modalRechazo && (
                <>
                    <div onClick={() => setModalRechazo(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '420px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 16px' }}>Rechazar pedido</h3>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Motivo de rechazo *</label>
                        <textarea value={motivoRechazo} onChange={e => setMotivoRechazo(e.target.value)} rows={3}
                            placeholder="Explica el motivo del rechazo al vendedor..."
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: '16px' }} />
                        {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => { setModalRechazo(false); setError('') }}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                            <button onClick={rechazar} disabled={procesando}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                                {procesando ? 'Rechazando...' : 'Confirmar rechazo'}
                            </button>
                        </div>
                    </div>
                </>
            )}

        </div>
    )
}
