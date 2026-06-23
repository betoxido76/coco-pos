import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Check, X, FileText, ChevronRight, Clock, Search, Bell, Ban, Pencil } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

const ESTADOS = {
    pendiente:  { bg: '#fef9c3', color: '#854d0e', label: 'Pendiente' },
    aprobado:   { bg: '#dbeafe', color: '#1e40af', label: 'Aprobado' },
    alistado:   { bg: '#fff7ed', color: '#c2410c', label: 'Alistado' },
    rechazado:  { bg: '#fee2e2', color: '#991b1b', label: 'Rechazado' },
    facturado:  { bg: '#dcfce7', color: '#166534', label: 'Facturado' },
    despachado: { bg: '#d1fae5', color: '#065f46', label: 'Despachado' },
    anulado:    { bg: '#f3f4f6', color: '#6b7280', label: 'Anulado' },
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
    const [conteos, setConteos] = useState({ pendiente: 0, aprobado: 0, alistado: 0, facturado: 0 })
    const [clientes, setClientes] = useState([])
    const [filtroCliente, setFiltroCliente] = useState('')
    const [fechaDesde, setFechaDesde] = useState('')
    const [fechaHasta, setFechaHasta] = useState('')
    const [filtroSku, setFiltroSku] = useState('')
    const [skuMatch, setSkuMatch] = useState(null) // Set de pedido_id que contienen el SKU/producto, o null si no hay filtro
    const [pagina, setPagina] = useState(0)
    const [pageSize, setPageSize] = useState(50)

    useEffect(() => { cargar(); cargarConteos() }, [tabActiva, reloadKey])

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
        if (!perfil?.empresa_id) return
        supabase.from('pedidos')
            .select('vendedor_id, usuarios(id, nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .not('vendedor_id', 'is', null)
            .then(({ data }) => {
                if (!data) return
                const seen = new Set()
                const unicos = data
                    .filter(p => p.usuarios && !seen.has(p.vendedor_id) && seen.add(p.vendedor_id))
                    .map(p => ({ id: p.vendedor_id, nombre: p.usuarios.nombre }))
                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                setVendedores(unicos)
            })
    }, [perfil?.empresa_id])

    useEffect(() => {
        if (!perfil?.empresa_id) return
        supabase.from('clientes').select('id, nombre').eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setClientes(data || []))
    }, [perfil?.empresa_id])

    // Resolver el filtro por SKU/producto a un conjunto de pedido_id
    useEffect(() => {
        const term = filtroSku.trim()
        if (!term) { setSkuMatch(null); return }
        let cancel = false
        ;(async () => {
            const { data: prods } = await supabase.from('productos_terminados')
                .select('id').eq('empresa_id', perfil.empresa_id)
                .or(`sku.ilike.%${term}%,nombre.ilike.%${term}%`)
            const prodIds = (prods || []).map(p => p.id)
            if (prodIds.length === 0) { if (!cancel) setSkuMatch(new Set()); return }
            const { data: its } = await supabase.from('pedido_items').select('pedido_id').in('producto_id', prodIds)
            if (!cancel) setSkuMatch(new Set((its || []).map(r => r.pedido_id)))
        })()
        return () => { cancel = true }
    }, [filtroSku, perfil?.empresa_id])

    // Resetear a la primera página cuando cambian tab o filtros
    useEffect(() => { setPagina(0) }, [tabActiva, busqueda, filtroVendedor, filtroCliente, fechaDesde, fechaHasta, filtroSku])

    async function cargarConteos() {
        const eid = perfil.empresa_id
        const [r1, r2, r3, r4] = await Promise.all([
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'pendiente'),
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'aprobado'),
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'alistado'),
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'facturado'),
        ])
        setConteos({ pendiente: r1.count || 0, aprobado: r2.count || 0, alistado: r3.count || 0, facturado: r4.count || 0 })
    }

    async function cargar() {
        setLoading(true)
        let q = supabase
            .from('pedidos')
            .select(`
                *,
                clientes(nombre, rif, descripcion, direccion_fiscal),
                usuarios(nombre)
            `)
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })

        if (tabActiva === 'pendientes') q = q.eq('estado', 'pendiente')
        else if (tabActiva === 'aprobados') q = q.eq('estado', 'aprobado')
        else if (tabActiva === 'alistados') q = q.eq('estado', 'alistado')
        else if (tabActiva === 'pordespachar') q = q.eq('estado', 'facturado')
        else if (tabActiva === 'historial') q = q.in('estado', ['rechazado', 'despachado'])
        else if (tabActiva === 'anulados') q = q.eq('estado', 'anulado')

        const { data } = await q
        if (data) setPedidos(data)
        setLoading(false)
    }

    const filtrados = pedidos.filter(p => {
        const q = busqueda.toLowerCase()
        const matchBusqueda = !q ||
            p.clientes?.nombre?.toLowerCase().includes(q) ||
            p.clientes?.descripcion?.toLowerCase().includes(q) ||
            p.numero_pedido?.toLowerCase().includes(q) ||
            p.usuarios?.nombre?.toLowerCase().includes(q)
        const matchVendedor = filtroVendedor ? p.vendedor_id === filtroVendedor : true
        const matchCliente = filtroCliente ? p.cliente_id === filtroCliente : true
        const fp = (p.fecha_pedido || '').slice(0, 10)
        const matchDesde = !fechaDesde || (fp && fp >= fechaDesde)
        const matchHasta = !fechaHasta || (fp && fp <= fechaHasta)
        const matchSku = !skuMatch || skuMatch.has(p.id)
        return matchBusqueda && matchVendedor && matchCliente && matchDesde && matchHasta && matchSku
    })
    const totalFiltrados = filtrados.length
    const paginados = filtrados.slice(pagina * pageSize, (pagina + 1) * pageSize)

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
                {conteos.pendiente > 0 && (
                    <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} style={{ color: '#d97706' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#854d0e' }}>
                            {conteos.pendiente} pedido{conteos.pendiente > 1 ? 's' : ''} pendiente{conteos.pendiente > 1 ? 's' : ''} de revisión
                        </span>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {[
                    { key: 'pendientes',   label: 'Pendientes por Aprobación', estado: 'pendiente',  badgeBg: '#fef9c3', badgeColor: '#854d0e' },
                    { key: 'aprobados',    label: 'Por Alistar',               estado: 'aprobado',   badgeBg: '#dbeafe', badgeColor: '#1e40af' },
                    { key: 'alistados',    label: 'Por Registrar',             estado: 'alistado',   badgeBg: '#fff7ed', badgeColor: '#c2410c' },
                    { key: 'pordespachar', label: 'Por Despachar',             estado: 'facturado',  badgeBg: '#dcfce7', badgeColor: '#166534' },
                    { key: 'historial',    label: 'Completados',               estado: null },
                    { key: 'anulados',     label: 'Anulados',                  estado: null,         badgeBg: '#f3f4f6', badgeColor: '#6b7280' },
                ].map(tab => {
                    const count = tab.estado ? conteos[tab.estado] : 0
                    const isActive = tabActiva === tab.key
                    const hasItems = count > 0
                    return (
                        <button key={tab.key} onClick={() => { setTabActiva(tab.key); setBusqueda(''); setFiltroVendedor(''); setFiltroCliente(''); setFechaDesde(''); setFechaHasta(''); setFiltroSku('') }}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                border: '1px solid', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                borderColor: isActive ? '#16a34a' : hasItems ? tab.badgeColor + '66' : '#e5e7eb',
                                backgroundColor: isActive ? '#f0fdf4' : '#fff',
                                color: isActive ? '#16a34a' : '#6b7280',
                            }}>
                            {tab.label}
                            {hasItems && (
                                <span style={{
                                    backgroundColor: isActive ? '#16a34a' : tab.badgeBg,
                                    color: isActive ? '#fff' : tab.badgeColor,
                                    fontSize: '11px', fontWeight: 700,
                                    padding: '1px 7px', borderRadius: '10px', lineHeight: '18px',
                                }}>
                                    {count}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" placeholder="Buscar por cliente, pedido o vendedor..."
                        value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: '32px' }} />
                </div>
                <input type="text" placeholder="SKU o producto..."
                    value={filtroSku} onChange={e => setFiltroSku(e.target.value)}
                    style={{ ...inputStyle, width: 'auto', minWidth: '160px' }} />
                <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
                    style={{ ...inputStyle, width: 'auto', minWidth: '180px' }}>
                    <option value="">Todos los clientes</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                    style={{ ...inputStyle, width: 'auto', minWidth: '180px' }}>
                    <option value="">Todos los vendedores</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Desde</span>
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                        style={{ ...inputStyle, width: 'auto' }} />
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>Hasta</span>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                        style={{ ...inputStyle, width: 'auto' }} />
                </div>
            </div>

            {/* Tabla */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : filtrados.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                        No hay pedidos en este estado
                    </div>
                ) : tabActiva === 'anulados' ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Pedido', 'O/C Cliente', 'Cliente', 'Vendedor', 'Fecha pedido', 'Motivo anulación', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginados.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600, color: '#9ca3af' }}>{p.numero_pedido || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: p.oc_cliente ? '#9ca3af' : '#d1d5db' }}>{p.oc_cliente || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                                        {p.clientes?.nombre || '—'}
                                        {p.clientes?.rif && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.clientes.rif}</div>}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.usuarios?.nombre || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                        {new Date(p.fecha_pedido).toLocaleDateString('es-VE')}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#dc2626', maxWidth: '280px' }}>
                                        {p.motivo_anulacion || '—'}
                                    </td>
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
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Pedido', 'O/C Cliente', 'Cliente', 'Vendedor', 'Fecha pedido', 'F. Prometida', 'F. Programada', 'Total', 'Estado', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {paginados.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151', fontWeight: 600 }}>
                                        {p.numero_pedido || '—'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: p.oc_cliente ? '#374151' : '#d1d5db' }}>
                                        {p.oc_cliente || '—'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
                                        {p.clientes?.nombre || '—'}
                                        {p.clientes?.descripcion && <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: '6px', fontSize: '12px' }}>— {p.clientes.descripcion}</span>}
                                        {p.clientes?.rif && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.clientes.rif}</div>}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.usuarios?.nombre || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                        {new Date(p.fecha_pedido).toLocaleDateString('es-VE')}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                        {p.fecha_entrega ? new Date(p.fecha_entrega + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', whiteSpace: 'nowrap', color: p.fecha_despacho ? '#1f2937' : '#d1d5db', fontWeight: p.fecha_despacho ? 500 : 400 }}>
                                        {p.fecha_despacho ? new Date(p.fecha_despacho + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                                        <TotalPedido pedidoId={p.id} descuentoGlobal={p.descuento_global} estado={p.estado} />
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
                {!loading && totalFiltrados > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                {pagina * pageSize + 1}–{Math.min((pagina + 1) * pageSize, totalFiltrados)} de {totalFiltrados}
                            </span>
                            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPagina(0) }}
                                style={{ fontSize: '13px', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                                <option value={25}>25 / pág</option>
                                <option value={50}>50 / pág</option>
                                <option value={100}>100 / pág</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button onClick={() => setPagina(p => p - 1)} disabled={pagina === 0}
                                style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: pagina === 0 ? '#d1d5db' : '#374151', cursor: pagina === 0 ? 'default' : 'pointer' }}>
                                ←
                            </button>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>Pág {pagina + 1} / {Math.ceil(totalFiltrados / pageSize)}</span>
                            <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * pageSize >= totalFiltrados}
                                style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: (pagina + 1) * pageSize >= totalFiltrados ? '#d1d5db' : '#374151', cursor: (pagina + 1) * pageSize >= totalFiltrados ? 'default' : 'pointer' }}>
                                →
                            </button>
                        </div>
                    </div>
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
function TotalPedido({ pedidoId, descuentoGlobal, estado }) {
    const [total, setTotal] = useState(null)
    const usarAlistada = ['alistado', 'facturado', 'despachado'].includes(estado)
    useEffect(() => {
        supabase.from('pedido_items').select('cantidad, cantidad_alistada, precio_unitario, descuento_item, unidad_venta, productos_terminados(aplica_iva, unidad_venta_2, factor_conversion_2)')
            .eq('pedido_id', pedidoId)
            .then(({ data }) => {
                if (!data) return
                // precio_unitario ya incluye IVA → el total es la suma directa de líneas
                const total = data.reduce((s, i) => {
                    let cant = usarAlistada ? Number(i.cantidad_alistada ?? i.cantidad) : Number(i.cantidad)
                    if (cant === 0) return s
                    if (usarAlistada) {
                        const uv = i.unidad_venta
                        const uv2 = i.productos_terminados?.unidad_venta_2
                        const factor = Number(i.productos_terminados?.factor_conversion_2 || 1)
                        const esSecundaria = uv === '2' || (uv2 && uv === uv2)
                        if (esSecundaria && factor > 1) cant = cant / factor
                    }
                    const precio = Number(i.precio_unitario)
                    const desc = Number(i.descuento_item || 0)
                    const linea = cant * precio * (1 - desc / 100) * (1 - Number(descuentoGlobal || 0) / 100)
                    return s + linea
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
    const [editando, setEditando] = useState(false)
    const [itemsEdit, setItemsEdit] = useState([])
    const [descGlobalEdit, setDescGlobalEdit] = useState('')
    const [descGlobalActual, setDescGlobalActual] = useState(Number(pedido.descuento_global || 0))
    const [guardandoEdit, setGuardandoEdit] = useState(false)

    useEffect(() => {
        supabase.from('pedido_items')
            .select('*, productos_terminados(nombre, sku, aplica_iva, factor_conversion_2, unidad_medida, unidad_venta_2)')
            .eq('pedido_id', pedido.id)
            .then(({ data }) => { if (data) setItems(data); setLoading(false) })
    }, [pedido.id])

    const descGlobal = descGlobalActual
    const esAlistado = ['alistado', 'facturado', 'despachado'].includes(pedido.estado)
    // NuevoPedido guarda unidad_venta='2'; Ventas guarda el nombre (ej: 'caja').
    // Ambos casos indican unidad secundaria si coincide con unidad_venta_2 del producto.
    const esUM2 = (item) => {
        const uv = item.unidad_venta
        const uv2 = item.productos_terminados?.unidad_venta_2
        return uv === '2' || (uv2 && uv === uv2)
    }
    // cantidad_alistada está en unidades primarias → convertir a unidad de venta
    const cantFn = (item) => {
        if (!esAlistado) return Number(item.cantidad)
        const cantAlistada = Number(item.cantidad_alistada ?? item.cantidad)
        const factor = Number(item.productos_terminados?.factor_conversion_2 || 1)
        return (esUM2(item) && factor > 1) ? cantAlistada / factor : cantAlistada
    }
    // cantidad en unidades primarias para mostrar en columna principal
    const cantPrimaria = (item) => {
        if (esAlistado) return Number(item.cantidad_alistada ?? item.cantidad)
        if (item.cantidad_primaria != null) return Number(item.cantidad_primaria)
        const factor = Number(item.productos_terminados?.factor_conversion_2 || 1)
        return (esUM2(item) && factor > 1) ? Number(item.cantidad) * factor : Number(item.cantidad)
    }
    // cantidad en unidades secundarias (null si el item no tiene UM2)
    const cantSecundaria = (item) => {
        const factor = Number(item.productos_terminados?.factor_conversion_2 || 0)
        if (factor <= 1 || !item.productos_terminados?.unidad_venta_2) return null
        return cantPrimaria(item) / factor
    }
    const tieneUM2 = items.some(i => Number(i.productos_terminados?.factor_conversion_2 || 0) > 1 && i.productos_terminados?.unidad_venta_2)
    // precio_unitario ya incluye IVA para items con aplica_iva=true → extraer base
    const subtotalConDescItems = items.reduce((s, i) => {
        const desc = Number(i.descuento_item || 0)
        const precio = Number(i.precio_unitario) * (1 - desc / 100)
        const aplica = i.productos_terminados?.aplica_iva ?? true
        return s + cantFn(i) * (aplica ? precio / 1.16 : precio)
    }, 0)
    const subtotalBruto = subtotalConDescItems
    const subtotalFinal = subtotalConDescItems * (1 - descGlobal / 100)
    const iva = items.reduce((s, i) => {
        if (!(i.productos_terminados?.aplica_iva ?? true)) return s
        const desc = Number(i.descuento_item || 0)
        const base = cantFn(i) * Number(i.precio_unitario) / 1.16 * (1 - desc / 100) * (1 - descGlobal / 100)
        return s + base * 0.16
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

    function iniciarEdicion() {
        setItemsEdit(items.map(i => ({
            ...i,
            _precio: String(Number(i.precio_unitario).toFixed(4)),
            _descuento: String(Number(i.descuento_item || 0)),
        })))
        setDescGlobalEdit(String(descGlobalActual))
        setEditando(true)
        setExito('')
        setError('')
    }

    async function guardarEdicion() {
        setGuardandoEdit(true); setError('')
        for (const item of itemsEdit) {
            const { error: err } = await supabase.from('pedido_items').update({
                precio_unitario: Math.max(0, Number(item._precio) || 0),
                descuento_item: Math.min(100, Math.max(0, Number(item._descuento) || 0)),
            }).eq('id', item.id)
            if (err) { setError('Error al guardar: ' + err.message); setGuardandoEdit(false); return }
        }
        const nuevoDescGlobal = Math.min(100, Math.max(0, Number(descGlobalEdit) || 0))
        await supabase.from('pedidos').update({ descuento_global: nuevoDescGlobal }).eq('id', pedido.id)
        const { data } = await supabase.from('pedido_items')
            .select('*, productos_terminados(nombre, sku, aplica_iva, factor_conversion_2, unidad_medida, unidad_venta_2)')
            .eq('pedido_id', pedido.id)
        if (data) setItems(data)
        setDescGlobalActual(nuevoDescGlobal)
        setGuardandoEdit(false)
        setEditando(false)
        setExito('Pedido actualizado correctamente')
        setTimeout(() => setExito(''), 3000)
    }

    async function convertirEnFactura() {
        setProcesando(true); setError('')

        const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_ventas_numero', {
            p_empresa_id: perfil.empresa_id
        })
        const numero = numeroConsecutivo || 'NE-000001'
        const { data: { user } } = await supabase.auth.getUser()

        const { data: clienteData } = await supabase
            .from('clientes')
            .select('condicion_pago, dias_credito')
            .eq('id', pedido.cliente_id)
            .single()

        const condicion = clienteData?.condicion_pago || 'credito'
        const diasCredito = Number(clienteData?.dias_credito) || 0

        if (condicion === 'credito' && diasCredito <= 0) {
            setProcesando(false)
            setError('El cliente tiene condición de crédito pero no tiene días de crédito configurados. Corrígelo en Administración → Clientes antes de facturar.')
            return
        }

        let fechaVencimiento = null
        if (condicion === 'credito' && diasCredito > 0) {
            const d = new Date()
            d.setDate(d.getDate() + diasCredito)
            fechaVencimiento = d.toISOString().split('T')[0]
        }

        const { data: venta, error: errVenta } = await supabase
            .from('ventas')
            .insert({
                cliente_id: pedido.cliente_id,
                usuario_id: user.id,
                numero_factura: numero,
                subtotal: subtotalFinal,
                total,
                estado_cobro: condicion === 'contado' ? 'pagado' : 'pendiente',
                empresa_id: perfil.empresa_id,
                fecha_vencimiento_pago: fechaVencimiento,
                oc_cliente: pedido.oc_cliente || null,
                direccion_entrega_id: pedido.direccion_entrega_id || null,
                direccion_entrega_texto: pedido.direccion_entrega_texto || null,
                direccion_entrega_nombre: pedido.direccion_entrega_nombre || null,
                pedido_id: pedido.id,
            })
            .select()
            .single()

        if (errVenta) { setError('Error al crear factura: ' + errVenta.message); setProcesando(false); return }

        const itemsDespachar = items.filter(i => Number(i.cantidad_alistada ?? i.cantidad) > 0)

        await supabase.from('venta_items').insert(
            itemsDespachar.map(i => {
                const cantAlistada = Number(i.cantidad_alistada ?? i.cantidad)
                const factor = Number(i.productos_terminados?.factor_conversion_2 || 1)
                const cantidad = (esUM2(i) && factor > 1) ? cantAlistada / factor : cantAlistada
                return {
                    venta_id: venta.id,
                    producto_id: i.producto_id,
                    cantidad,
                    precio_unitario: Number(i.precio_unitario) * (1 - Number(i.descuento_item || 0) / 100) * (1 - descGlobal / 100),
                    empresa_id: perfil.empresa_id,
                }
            })
        )

        // Descontar stock — usar cantidad_alistada (unidades primarias reales despachadas)
        for (const item of itemsDespachar) {
            const cantPrimaria = Number(item.cantidad_alistada ?? item.cantidad)
            const { data: prod } = await supabase
                .from('productos_terminados')
                .select('stock_actual, nombre, sku')
                .eq('id', item.producto_id)
                .single()
            if (!prod) continue
            const nuevoStock = Math.max(0, prod.stock_actual - cantPrimaria)
            await supabase.from('productos_terminados')
                .update({ stock_actual: nuevoStock })
                .eq('id', item.producto_id)
            await supabase.from('movimientos_inventario').insert({
                empresa_id: perfil.empresa_id,
                tipo_item: 'producto_terminado',
                item_id: item.producto_id,
                item_nombre: prod.nombre,
                item_codigo: prod.sku,
                tipo_movimiento: 'salida',
                cantidad: cantPrimaria,
                stock_actual: nuevoStock,
                origen: 'pedido_facturado',
                fecha: new Date().toISOString()
            })
        }

        await supabase.from('pedidos')
            .update({ estado: 'facturado', venta_id: venta.id })
            .eq('id', pedido.id)

        setProcesando(false)
        setExito('Factura creada correctamente')
        setTimeout(() => onVolver(), 1500)
    }

    return (
        <div className="print-target" style={{ padding: '24px', maxWidth: '720px' }}>
            <style>{`@media print { body * { visibility: hidden; } .print-target, .print-target * { visibility: visible; } .print-target { position: fixed; top: 0; left: 0; width: 100% !important; max-width: none !important; margin: 0; padding: 20px !important; border: none !important; box-shadow: none !important; background: white !important; } .no-print { display: none !important; } }`}</style>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                    Pedido {pedido.numero_pedido || '—'}
                </h1>
                <BadgeEstado estado={pedido.estado} />
                <button onClick={() => window.print()} style={{ marginLeft: 'auto', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>🖨️ Imprimir</button>
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
                    ...(pedido.oc_cliente ? [{ label: 'O/C del Cliente', valor: pedido.oc_cliente }] : []),
                ].map(f => (
                    <div key={f.label} style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px' }}>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }}>{f.valor}</p>
                    </div>
                ))}
            </div>

            {/* Dirección de entrega */}
            <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px', marginBottom: '20px' }}>
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dirección de entrega</p>
                {pedido.direccion_entrega_nombre
                    ? <>
                        <p style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', margin: '0 0 2px' }}>{pedido.direccion_entrega_nombre}</p>
                        <p style={{ fontSize: '14px', fontWeight: 400, color: '#1f2937', margin: 0 }}>{pedido.direccion_entrega_texto}</p>
                      </>
                    : <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }}>{pedido.direccion_entrega_texto || pedido.clientes?.direccion_fiscal || '—'}</p>
                }
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

            {/* Motivo anulación */}
            {pedido.estado === 'anulado' && pedido.motivo_anulacion && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <Ban size={16} color="#dc2626" style={{ marginTop: '1px', flexShrink: 0 }} />
                    <div>
                        <p style={{ fontSize: '11px', color: '#dc2626', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Motivo de anulación</p>
                        <p style={{ fontSize: '13px', color: '#991b1b', margin: 0 }}>{pedido.motivo_anulacion}</p>
                    </div>
                </div>
            )}

            {/* Items — modo edición */}
            {editando && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '2px solid #d97706', overflow: 'hidden', marginBottom: '20px' }}>
                    <div style={{ backgroundColor: '#fffbeb', padding: '10px 16px', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Pencil size={14} color="#d97706" />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>Modo edición — modifica precios y descuentos, luego guarda</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
                                {['Producto', 'Cantidad', 'Precio unit.', 'Desc. (%)', 'Subtotal'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#92400e', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {itemsEdit.map((item, idx) => {
                                const precio = Math.max(0, Number(item._precio) || 0)
                                const desc = Math.min(100, Math.max(0, Number(item._descuento) || 0))
                                const cant = Number(item.cantidad)
                                const subtotal = cant * precio * (1 - desc / 100)
                                return (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1f2937', fontWeight: 500 }}>
                                            {item.nombre_producto || item.productos_terminados?.nombre || '—'}
                                            {item.productos_terminados?.sku && (
                                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{item.productos_terminados.sku}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{cant}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                            <input type="number" min="0" step="0.0001" value={item._precio}
                                                onChange={e => setItemsEdit(prev => prev.map((it, i) => i === idx ? { ...it, _precio: e.target.value } : it))}
                                                style={{ width: '110px', padding: '6px 8px', border: '1px solid #d97706', borderRadius: '6px', fontSize: '13px', textAlign: 'right', fontWeight: 600, color: '#1f2937' }} />
                                        </td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                            <input type="number" min="0" max="100" step="0.1" value={item._descuento}
                                                onChange={e => setItemsEdit(prev => prev.map((it, i) => i === idx ? { ...it, _descuento: e.target.value } : it))}
                                                style={{ width: '70px', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'right', color: '#374151' }} />
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(subtotal)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                    <div style={{ padding: '12px 16px', borderTop: '1px solid #fde68a', backgroundColor: '#fffbeb', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 500 }}>Descuento global (%):</span>
                        <input type="number" min="0" max="100" step="0.1" value={descGlobalEdit}
                            onChange={e => setDescGlobalEdit(e.target.value)}
                            style={{ width: '80px', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />
                    </div>
                </div>
            )}

            {/* Items — modo lectura */}
            {!editando && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                    {loading ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando items...</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['Producto', esAlistado ? 'Cant. alistada' : 'Cant. pedida', tieneUM2 ? 'Cant. (2)' : null, 'Precio lista', 'Desc. item', 'Subtotal'].filter(Boolean).map((h, i) => (
                                        <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => {
                                    const precioConDesc = Number(item.precio_unitario) * (1 - Number(item.descuento_item || 0) / 100)
                                    const cantUsada = cantFn(item)
                                    const cancelado = esAlistado && Number(item.cantidad_alistada) === 0
                                    const subtotal = cantUsada * precioConDesc
                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6', opacity: cancelado ? 0.5 : 1 }}>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1f2937', fontWeight: 500 }}>
                                                {item.nombre_producto || item.productos_terminados?.nombre || '—'}
                                                {item.productos_terminados?.sku && (
                                                    <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{item.productos_terminados.sku}</span>
                                                )}
                                                {cancelado && <span style={{ fontSize: '11px', color: '#dc2626', marginLeft: '8px', fontWeight: 600 }}>CANCELADO</span>}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: esAlistado ? 600 : 400, textAlign: 'right', color: cancelado ? '#dc2626' : esAlistado ? '#16a34a' : '#6b7280' }}>
                                                {cantPrimaria(item).toLocaleString('es-VE')}
                                            </td>
                                            {tieneUM2 && (
                                                <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'right', color: '#6b7280' }}>
                                                    {(() => { const c2 = cantSecundaria(item); return c2 != null ? c2.toLocaleString('es-VE', { maximumFractionDigits: 2 }) : '—' })()}
                                                </td>
                                            )}
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', textAlign: 'right' }}>
                                                {Number(item.descuento_item || 0) > 0
                                                    ? <span style={{ color: '#16a34a', fontWeight: 500 }}>-{item.descuento_item}%</span>
                                                    : <span style={{ color: '#9ca3af' }}>—</span>}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{cancelado ? '—' : fmt(subtotal)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

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
            {pedido.estado === 'pendiente' && !editando && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={aprobar} disabled={procesando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: procesando ? 0.6 : 1 }}>
                        <Check size={16} /> {procesando ? 'Procesando...' : 'Aprobar pedido'}
                    </button>
                    <button onClick={() => setModalRechazo(true)} disabled={procesando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', padding: '11px 20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <X size={16} /> Rechazar
                    </button>
                    <button onClick={iniciarEdicion} disabled={procesando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', color: '#d97706', border: '1px solid #fde68a', borderRadius: '8px', padding: '11px 20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <Pencil size={16} /> Editar pedido
                    </button>
                </div>
            )}

            {editando && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button onClick={guardarEdicion} disabled={guardandoEdit}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoEdit ? 0.6 : 1 }}>
                        <Check size={16} /> {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
                    </button>
                    <button onClick={() => setEditando(false)} disabled={guardandoEdit}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '11px 20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <X size={16} /> Cancelar edición
                    </button>
                </div>
            )}

            {pedido.estado === 'alistado' && (
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
