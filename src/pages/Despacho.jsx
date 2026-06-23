import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { PackageCheck, ChevronRight, Check, AlertTriangle, Truck, FileText, Ban, RotateCcw, Search, Plus, X } from 'lucide-react'

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

export default function Despacho() {
    const { perfil } = useAuth()
    const [tabActiva, setTabActiva] = useState('alistamiento')
    const [pedidos, setPedidos] = useState([])
    const [loading, setLoading] = useState(true)
    const [pedidoActual, setPedidoActual] = useState(null)
    const [pedidoVer, setPedidoVer] = useState(null)
    const [conteos, setConteos] = useState({ alistamiento: 0, porregistrar: 0, despacho: 0, devoluciones: 0 })
    const [modalAnulacion, setModalAnulacion] = useState(null)
    const [motivoAnulacion, setMotivoAnulacion] = useState('')
    const [anulando, setAnulando] = useState(false)
    const [errorAnulacion, setErrorAnulacion] = useState('')
    const [clientes, setClientes] = useState([])
    const [filtroCliente, setFiltroCliente] = useState('')
    const [fechaDesde, setFechaDesde] = useState('')
    const [fechaHasta, setFechaHasta] = useState('')
    const [filtroSku, setFiltroSku] = useState('')
    const [skuMatch, setSkuMatch] = useState(null) // Set de pedido_id que contienen el SKU/producto, o null
    const [pagina, setPagina] = useState(0)
    const [pageSize, setPageSize] = useState(50)

    useEffect(() => { cargar(); cargarConteos() }, [tabActiva])

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
    useEffect(() => { setPagina(0) }, [tabActiva, filtroCliente, fechaDesde, fechaHasta, filtroSku])

    const inputStyle = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }

    async function cargarConteos() {
        const eid = perfil.empresa_id
        const [r1, r2, r3, r4] = await Promise.all([
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'aprobado'),
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'alistado'),
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'facturado'),
            supabase.from('solicitudes_devolucion').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'recibida'),
        ])
        setConteos({ alistamiento: r1.count || 0, porregistrar: r2.count || 0, despacho: r3.count || 0, devoluciones: r4.count || 0 })
    }

    async function cargar() {
        if (tabActiva === 'devoluciones') { setLoading(false); return }
        setLoading(true)
        let q = supabase
            .from('pedidos')
            .select('*, clientes(nombre, rif, descripcion, direccion_fiscal), usuarios(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })

        if (tabActiva === 'alistamiento') q = q.eq('estado', 'aprobado')
        else if (tabActiva === 'porregistrar') q = q.eq('estado', 'alistado')
        else if (tabActiva === 'despacho') q = q.eq('estado', 'facturado')
        else if (tabActiva === 'completados') q = q.in('estado', ['rechazado', 'despachado'])
        else q = q.eq('estado', 'anulado')

        const { data } = await q
        if (data) setPedidos(data)
        setLoading(false)
    }

    // Filtros (cliente, rango de fecha, sku) aplicados en cliente + paginación
    const filtrados = pedidos.filter(p => {
        const matchCliente = filtroCliente ? p.cliente_id === filtroCliente : true
        const fp = (p.fecha_pedido || '').slice(0, 10)
        const matchDesde = !fechaDesde || (fp && fp >= fechaDesde)
        const matchHasta = !fechaHasta || (fp && fp <= fechaHasta)
        const matchSku = !skuMatch || skuMatch.has(p.id)
        return matchCliente && matchDesde && matchHasta && matchSku
    })
    const totalFiltrados = filtrados.length
    const paginados = filtrados.slice(pagina * pageSize, (pagina + 1) * pageSize)

    async function anularPedido() {
        if (!motivoAnulacion.trim()) { setErrorAnulacion('El motivo de anulación es obligatorio'); return }
        setAnulando(true); setErrorAnulacion('')
        const { error } = await supabase.from('pedidos')
            .update({ estado: 'anulado', motivo_anulacion: motivoAnulacion.trim() })
            .eq('id', modalAnulacion.id)
        setAnulando(false)
        if (error) { setErrorAnulacion('Error: ' + error.message); return }
        setModalAnulacion(null)
        setMotivoAnulacion('')
        cargar()
        cargarConteos()
    }

    if (pedidoVer)
        return <VerPedido
            pedido={pedidoVer}
            onVolver={() => { setPedidoVer(null); cargar() }}
        />

    if (pedidoActual && tabActiva === 'alistamiento')
        return <AlistarPedido
            pedido={pedidoActual}
            onAlistado={() => { setPedidoActual(null); cargar(); cargarConteos() }}
            onCancelar={() => setPedidoActual(null)}
        />

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Alistamiento y Despacho</h1>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Gestión de alistamiento y salida de pedidos</p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                {[
                    { key: 'alistamiento',  label: 'Por Alistar',    count: conteos.alistamiento,  badgeBg: '#fff7ed', badgeColor: '#c2410c' },
                    { key: 'porregistrar',  label: 'Por Registrar',  count: conteos.porregistrar,  badgeBg: '#fef9c3', badgeColor: '#854d0e' },
                    { key: 'despacho',      label: 'Por Despachar',  count: conteos.despacho,      badgeBg: '#dcfce7', badgeColor: '#166534' },
                    { key: 'completados',   label: 'Completados',    count: 0,                     badgeBg: '#f3f4f6', badgeColor: '#6b7280' },
                    { key: 'anulados',      label: 'Anulados',       count: 0,                     badgeBg: '#f3f4f6', badgeColor: '#6b7280' },
                    { key: 'devoluciones',  label: 'Devoluciones',   count: conteos.devoluciones,  badgeBg: '#fce7f3', badgeColor: '#9d174d' },
                ].map(tab => {
                    const isActive = tabActiva === tab.key
                    return (
                        <button key={tab.key} onClick={() => { setTabActiva(tab.key); setPedidoActual(null); setPedidoVer(null); setFiltroCliente(''); setFechaDesde(''); setFechaHasta(''); setFiltroSku('') }}
                            style={{
                                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                border: '1px solid', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                borderColor: isActive ? '#16a34a' : tab.count > 0 ? tab.badgeColor + '66' : '#e5e7eb',
                                backgroundColor: isActive ? '#f0fdf4' : '#fff',
                                color: isActive ? '#16a34a' : '#6b7280',
                            }}>
                            {tab.label}
                            {tab.count > 0 && (
                                <span style={{
                                    backgroundColor: isActive ? '#16a34a' : tab.badgeBg,
                                    color: isActive ? '#fff' : tab.badgeColor,
                                    fontSize: '11px', fontWeight: 700,
                                    padding: '1px 7px', borderRadius: '10px', lineHeight: '18px',
                                }}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Filtros (no aplican al tab de devoluciones, que tiene su propia gestión) */}
            {tabActiva !== 'devoluciones' && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input type="text" placeholder="SKU o producto..."
                        value={filtroSku} onChange={e => setFiltroSku(e.target.value)}
                        style={{ ...inputStyle, minWidth: '160px' }} />
                    <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
                        style={{ ...inputStyle, minWidth: '180px' }}>
                        <option value="">Todos los clientes</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>Desde</span>
                        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={inputStyle} />
                        <span style={{ fontSize: '12px', color: '#6b7280' }}>Hasta</span>
                        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={inputStyle} />
                    </div>
                </div>
            )}

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {tabActiva === 'devoluciones' ? (
                    <TablaDevoluciones onConteoChange={cargarConteos} />
                ) : loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : totalFiltrados === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                        {tabActiva === 'alistamiento'
                            ? <PackageCheck size={32} style={{ color: '#d1d5db', marginBottom: '12px' }} />
                            : <Truck size={32} style={{ color: '#d1d5db', marginBottom: '12px' }} />}
                        <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
                            {pedidos.length > 0
                                ? 'No hay pedidos que coincidan con los filtros'
                                : tabActiva === 'alistamiento'
                                ? 'No hay pedidos aprobados pendientes de alistamiento'
                                : tabActiva === 'porregistrar'
                                ? 'No hay pedidos alistados pendientes de facturación'
                                : tabActiva === 'despacho'
                                ? 'No hay pedidos facturados pendientes de despacho'
                                : tabActiva === 'completados'
                                ? 'No hay pedidos completados'
                                : 'No hay pedidos anulados'}
                        </p>
                    </div>
                ) : tabActiva === 'alistamiento' ? (
                    <TablaAlistamiento pedidos={paginados} onVer={p => setPedidoVer(p)} onAlistar={p => setPedidoActual(p)} onAnular={p => { setModalAnulacion(p); setMotivoAnulacion(''); setErrorAnulacion('') }} />
                ) : tabActiva === 'porregistrar' ? (
                    <TablaPorRegistrar pedidos={paginados} onVer={p => setPedidoVer(p)} onAnular={p => { setModalAnulacion(p); setMotivoAnulacion(''); setErrorAnulacion('') }} />
                ) : tabActiva === 'despacho' ? (
                    <TablaDespacho pedidos={paginados} onVer={p => setPedidoVer(p)} onDespachado={() => { cargar(); cargarConteos() }} empresaId={perfil.empresa_id} />
                ) : tabActiva === 'completados' ? (
                    <TablaCompletados pedidos={paginados} onVer={p => setPedidoVer(p)} />
                ) : (
                    <TablaAnulados pedidos={paginados} onVer={p => setPedidoVer(p)} />
                )}
                {tabActiva !== 'devoluciones' && !loading && totalFiltrados > 0 && (
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

            {/* Modal Anulación */}
            {modalAnulacion && (
                <>
                    <div onClick={() => setModalAnulacion(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', backgroundColor: '#fef2f2', borderRadius: '12px', margin: '0 auto 16px' }}>
                            <Ban size={22} color="#dc2626" />
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px', textAlign: 'center' }}>Anular pedido</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 2px', textAlign: 'center' }}>
                            Pedido <strong style={{ fontFamily: 'monospace', color: '#374151' }}>{modalAnulacion.numero_pedido}</strong>
                        </p>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px', textAlign: 'center' }}>{modalAnulacion.clientes?.nombre}</p>
                        <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Motivo de anulación <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <textarea
                            value={motivoAnulacion}
                            onChange={e => setMotivoAnulacion(e.target.value)}
                            placeholder="Describe el motivo por el cual se anula este pedido..."
                            rows={3}
                            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                            autoFocus
                        />
                        {errorAnulacion && (
                            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#dc2626', marginTop: '10px' }}>
                                {errorAnulacion}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={() => setModalAnulacion(null)}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                            <button onClick={anularPedido} disabled={anulando}
                                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: anulando ? 0.6 : 1 }}>
                                <Ban size={15} /> {anulando ? 'Anulando...' : 'Confirmar anulación'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

// ── Tabla Alistamiento ─────────────────────────────────────────
function TablaAlistamiento({ pedidos, onAlistar, onAnular, onVer }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Pedido', 'O/C Cliente', 'Cliente', 'Vendedor', 'Origen', 'Fecha Prometida', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {pedidos.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{p.numero_pedido || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: p.oc_cliente ? '#374151' : '#d1d5db' }}>{p.oc_cliente || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
                            {p.clientes?.nombre || '—'}
                            {p.clientes?.rif && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.clientes.rif}</div>}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.usuarios?.nombre || '—'}</td>
                        <td style={{ padding: '12px 16px' }}>
                            <span style={{
                                fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px',
                                backgroundColor: p.origen === 'campo' ? '#fef3c7' : '#eff6ff',
                                color: p.origen === 'campo' ? '#92400e' : '#1e40af',
                            }}>
                                {p.origen === 'campo' ? 'Campo' : 'Oficina'}
                            </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                            {p.fecha_entrega ? new Date(p.fecha_entrega + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => onVer(p)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                    <FileText size={13} /> Ver
                                </button>
                                <button onClick={() => onAlistar(p)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                    <ChevronRight size={13} /> Alistar
                                </button>
                                <button onClick={() => onAnular(p)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #fca5a5', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}>
                                    <Ban size={12} /> Anular
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

// ── Tabla Por Registrar ────────────────────────────────────────
function TablaPorRegistrar({ pedidos, onVer, onAnular }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Pedido', 'O/C Cliente', 'Cliente', 'Vendedor', 'Fecha pedido', 'F. Prometida', 'F. Programada', 'Total', 'Estado', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {pedidos.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151', fontWeight: 600 }}>
                            {p.numero_pedido || '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: p.oc_cliente ? '#374151' : '#d1d5db' }}>{p.oc_cliente || '—'}</td>
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
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => onVer(p)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                    <FileText size={13} /> Ver
                                </button>
                                <button onClick={() => onAnular(p)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #fca5a5', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}>
                                    <Ban size={12} /> Anular
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

// ── Tabla Despacho ─────────────────────────────────────────────
function TablaDespacho({ pedidos, onVer, onDespachado, empresaId }) {
    const [procesando, setProcesando] = useState(null)
    const [confirmando, setConfirmando] = useState(null)
    const [error, setError] = useState('')

    async function confirmarDespacho(pedido) {
        setProcesando(pedido.id); setError('')
        const { error: err } = await supabase.from('pedidos')
            .update({ estado: 'despachado' })
            .eq('id', pedido.id)
        setProcesando(null)
        if (err) { setError('Error: ' + err.message); return }
        setConfirmando(null)
        onDespachado()
    }

    return (
        <>
            {error && (
                <div style={{ margin: '12px 16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                    {error}
                </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        {['Pedido', 'O/C Cliente', 'Cliente', 'Vendedor', 'F. Prometida', 'F. Programada', '', ''].map((h, i) => (
                            <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {pedidos.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                            <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{p.numero_pedido || '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: p.oc_cliente ? '#374151' : '#d1d5db' }}>{p.oc_cliente || '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
                                {p.clientes?.nombre || '—'}
                                {p.clientes?.rif && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.clientes.rif}</div>}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.usuarios?.nombre || '—'}</td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                {p.fecha_entrega ? new Date(p.fecha_entrega + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: '13px', whiteSpace: 'nowrap', color: p.fecha_despacho ? '#1f2937' : '#d1d5db', fontWeight: p.fecha_despacho ? 500 : 400 }}>
                                {p.fecha_despacho ? new Date(p.fecha_despacho + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                                <button onClick={() => onVer(p)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                    <FileText size={13} /> Ver
                                </button>
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                                <button onClick={() => setConfirmando(p)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                    <Truck size={13} /> Despachar
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Modal confirmación */}
            {confirmando && (
                <>
                    <div onClick={() => setConfirmando(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '400px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', backgroundColor: '#f0fdf4', borderRadius: '12px', margin: '0 auto 16px' }}>
                            <Truck size={22} color="#16a34a" />
                        </div>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 8px', textAlign: 'center' }}>
                            Confirmar despacho
                        </h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 6px', textAlign: 'center' }}>
                            Pedido <strong style={{ fontFamily: 'monospace', color: '#374151' }}>{confirmando.numero_pedido}</strong>
                        </p>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 24px', textAlign: 'center' }}>
                            {confirmando.clientes?.nombre}
                        </p>
                        <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 20px', textAlign: 'center', backgroundColor: '#f9fafb', borderRadius: '8px', padding: '10px' }}>
                            El pedido pasará a <strong>Completados</strong>. Esta acción no puede deshacerse.
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setConfirmando(null)}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                            <button onClick={() => confirmarDespacho(confirmando)} disabled={procesando === confirmando.id}
                                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: procesando === confirmando.id ? 0.6 : 1 }}>
                                <Check size={15} /> {procesando === confirmando.id ? 'Confirmando...' : 'Confirmar despacho'}
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    )
}

// ── Tabla Anulados ─────────────────────────────────────────────
function TablaAnulados({ pedidos, onVer }) {
    if (pedidos.length === 0)
        return (
            <div style={{ padding: '48px', textAlign: 'center' }}>
                <Ban size={32} style={{ color: '#d1d5db', marginBottom: '12px' }} />
                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No hay pedidos anulados</p>
            </div>
        )
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Pedido', 'O/C Cliente', 'Cliente', 'Vendedor', 'Fecha pedido', 'Motivo anulación', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {pedidos.map(p => (
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
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#dc2626', maxWidth: '260px' }}>
                            {p.motivo_anulacion || '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                            <button onClick={() => onVer(p)}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                <FileText size={13} /> Ver
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

// ── Tabla Completados (despachados + rechazados) ───────────────
function TablaCompletados({ pedidos, onVer }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Pedido', 'O/C Cliente', 'Cliente', 'Vendedor', 'Fecha pedido', 'F. Programada', 'Total', 'Estado', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {pedidos.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{p.numero_pedido || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: p.oc_cliente ? '#374151' : '#d1d5db' }}>{p.oc_cliente || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
                            {p.clientes?.nombre || '—'}
                            {p.clientes?.rif && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.clientes.rif}</div>}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.usuarios?.nombre || '—'}</td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                            {p.fecha_pedido ? new Date(p.fecha_pedido).toLocaleDateString('es-VE') : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', whiteSpace: 'nowrap', color: p.fecha_despacho ? '#1f2937' : '#d1d5db', fontWeight: p.fecha_despacho ? 500 : 400 }}>
                            {p.fecha_despacho ? new Date(p.fecha_despacho + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                            <TotalPedido pedidoId={p.id} descuentoGlobal={p.descuento_global} estado={p.estado} />
                        </td>
                        <td style={{ padding: '12px 16px' }}><BadgeEstado estado={p.estado} /></td>
                        <td style={{ padding: '12px 16px' }}>
                            <button onClick={() => onVer(p)}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                <FileText size={13} /> Ver
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
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
                const t = data.reduce((s, i) => {
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
                setTotal(t)
            })
    }, [pedidoId])
    return <span>{total !== null ? fmt(total) : '—'}</span>
}

// ── Ver Pedido (solo lectura) ──────────────────────────────────
function VerPedido({ pedido, onVolver }) {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.from('pedido_items')
            .select('*, productos_terminados(nombre, sku, aplica_iva, factor_conversion_2, unidad_medida, unidad_venta_2)')
            .eq('pedido_id', pedido.id)
            .then(({ data }) => { if (data) setItems(data); setLoading(false) })
    }, [pedido.id])

    const descGlobal = Number(pedido.descuento_global || 0)
    const esAlistado = ['alistado', 'facturado', 'despachado'].includes(pedido.estado)

    const esUM2 = (item) => {
        const uv = item.unidad_venta
        const uv2 = item.productos_terminados?.unidad_venta_2
        return uv === '2' || (uv2 && uv === uv2)
    }
    const cantFn = (item) => {
        if (!esAlistado) return Number(item.cantidad)
        const cantAlistada = Number(item.cantidad_alistada ?? item.cantidad)
        const factor = Number(item.productos_terminados?.factor_conversion_2 || 1)
        return (esUM2(item) && factor > 1) ? cantAlistada / factor : cantAlistada
    }
    const cantPrimaria = (item) => {
        if (esAlistado) return Number(item.cantidad_alistada ?? item.cantidad)
        if (item.cantidad_primaria != null) return Number(item.cantidad_primaria)
        const factor = Number(item.productos_terminados?.factor_conversion_2 || 1)
        return (esUM2(item) && factor > 1) ? Number(item.cantidad) * factor : Number(item.cantidad)
    }
    const cantSecundaria = (item) => {
        const factor = Number(item.productos_terminados?.factor_conversion_2 || 0)
        if (factor <= 1 || !item.productos_terminados?.unidad_venta_2) return null
        return cantPrimaria(item) / factor
    }
    const tieneUM2 = items.some(i => Number(i.productos_terminados?.factor_conversion_2 || 0) > 1 && i.productos_terminados?.unidad_venta_2)

    const subtotalConDescItems = items.reduce((s, i) => {
        const desc = Number(i.descuento_item || 0)
        const precio = Number(i.precio_unitario) * (1 - desc / 100)
        const aplica = i.productos_terminados?.aplica_iva ?? true
        return s + cantFn(i) * (aplica ? precio / 1.16 : precio)
    }, 0)
    const subtotalFinal = subtotalConDescItems * (1 - descGlobal / 100)
    const iva = items.reduce((s, i) => {
        if (!(i.productos_terminados?.aplica_iva ?? true)) return s
        const desc = Number(i.descuento_item || 0)
        const base = cantFn(i) * Number(i.precio_unitario) / 1.16 * (1 - desc / 100) * (1 - descGlobal / 100)
        return s + base * 0.16
    }, 0)
    const total = subtotalFinal + iva

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

            {/* Motivo anulación */}
            {pedido.motivo_anulacion && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <Ban size={16} color="#dc2626" style={{ marginTop: '1px', flexShrink: 0 }} />
                    <div>
                        <p style={{ fontSize: '11px', color: '#dc2626', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Motivo de anulación</p>
                        <p style={{ fontSize: '13px', color: '#991b1b', margin: 0 }}>{pedido.motivo_anulacion}</p>
                    </div>
                </div>
            )}

            {/* Notas */}
            {pedido.notas && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', color: '#d97706', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Notas del vendedor</p>
                    <p style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>{pedido.notas}</p>
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

            {/* Totales */}
            <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                {[
                    { label: 'Subtotal bruto', valor: fmt(subtotalConDescItems) },
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
        </div>
    )
}

// ── Alistar Pedido ─────────────────────────────────────────────
function AlistarPedido({ pedido, onAlistado, onCancelar }) {
    const { perfil } = useAuth()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [procesando, setProcesando] = useState(false)
    const [error, setError] = useState('')
    const [fechaDespacho, setFechaDespacho] = useState('')

    useEffect(() => {
        supabase.from('pedido_items')
            .select('*, productos_terminados(nombre, sku, stock_actual)')
            .eq('pedido_id', pedido.id)
            .then(({ data }) => {
                if (data) setItems(data.map(i => ({
                    ...i,
                    cantidad_alistar: Number(i.cantidad_primaria ?? i.cantidad),
                })))
                setLoading(false)
            })
    }, [pedido.id])

    function setCantAlistar(id, val) {
        const n = parseFloat(val)
        setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad_alistar: isNaN(n) ? '' : Math.max(0, n) } : i))
    }

    async function confirmar() {
        const itemsValidos = items.filter(i => Number(i.cantidad_alistar) > 0 || Number(i.cantidad_alistar) === 0)
        if (itemsValidos.length === 0) { setError('Confirma al menos un ítem'); return }
        setProcesando(true); setError('')

        for (const item of items) {
            const { error: errItem } = await supabase.from('pedido_items')
                .update({ cantidad_alistada: Number(item.cantidad_alistar) })
                .eq('id', item.id)
            if (errItem) { setError('Error en ítem: ' + errItem.message); setProcesando(false); return }
        }

        const { error: errPedido } = await supabase.from('pedidos')
            .update({ estado: 'alistado', ...(fechaDespacho ? { fecha_despacho: fechaDespacho } : {}) })
            .eq('id', pedido.id)

        if (errPedido) { setError('Error al confirmar: ' + errPedido.message); setProcesando(false); return }

        setProcesando(false)
        onAlistado()
    }

    const totalItems = items.length
    const itemsConStock = items.filter(i => (i.productos_terminados?.stock_actual ?? 0) >= Number(i.cantidad_primaria ?? i.cantidad))

    return (
        <div style={{ padding: '24px', maxWidth: '760px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Alistar pedido {pedido.numero_pedido}</h1>
            </div>

            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Cliente', valor: pedido.clientes?.nombre || '—' },
                    { label: 'Vendedor', valor: pedido.usuarios?.nombre || '—' },
                    { label: 'Fecha Prometida', valor: pedido.fecha_entrega ? new Date(pedido.fecha_entrega + 'T00:00:00').toLocaleDateString('es-VE') : '—' },
                ].map(f => (
                    <div key={f.label} style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px' }}>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }}>{f.valor}</p>
                    </div>
                ))}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px' }}>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha Programada</p>
                    <input type="date" value={fechaDespacho} onChange={e => setFechaDespacho(e.target.value)}
                        style={{ width: '100%', border: 'none', background: 'transparent', fontSize: '14px', fontWeight: 500, color: '#1f2937', padding: 0, cursor: 'pointer', boxSizing: 'border-box' }} />
                </div>
            </div>

            {pedido.notas && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', color: '#d97706', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas</p>
                    <p style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>{pedido.notas}</p>
                </div>
            )}

            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                Confirma las cantidades a despachar. Pon 0 para cancelar un ítem.
            </p>

            {/* Items */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                {loading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Producto', 'Pedido', 'Stock', 'A despachar'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i > 0 ? 'right' : 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => {
                                const stock = item.productos_terminados?.stock_actual ?? 0
                                const cantPedida = Number(item.cantidad_primaria ?? item.cantidad)
                                const sinStock = stock < cantPedida
                                return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: item.cantidad_alistar === 0 ? '#fef2f2' : 'transparent' }}>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
                                            {item.nombre_producto || item.productos_terminados?.nombre || '—'}
                                            {item.productos_terminados?.sku && (
                                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{item.productos_terminados.sku}</span>
                                            )}
                                            {item.unidad_venta && item.unidad_venta !== 'unidad' && (
                                                <span style={{ fontSize: '11px', color: '#6b7280', marginLeft: '6px' }}>({item.unidad_venta})</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{cantPedida}</td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <span style={{
                                                fontSize: '12px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
                                                backgroundColor: sinStock ? '#fef2f2' : '#f0fdf4',
                                                color: sinStock ? '#dc2626' : '#16a34a',
                                            }}>
                                                {sinStock && <AlertTriangle size={11} style={{ display: 'inline', marginRight: '3px', verticalAlign: 'middle' }} />}
                                                {stock}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={item.cantidad_alistar}
                                                onChange={e => setCantAlistar(item.id, e.target.value)}
                                                style={{
                                                    width: '80px', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px',
                                                    fontSize: '13px', textAlign: 'right', fontWeight: 600,
                                                    borderColor: item.cantidad_alistar === 0 ? '#fca5a5' : '#d1d5db',
                                                    backgroundColor: item.cantidad_alistar === 0 ? '#fef2f2' : '#fff',
                                                }}
                                            />
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {itemsConStock < totalItems && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#92400e', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={14} />
                    Algunos productos tienen stock insuficiente. Ajusta las cantidades antes de confirmar.
                </div>
            )}

            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={confirmar} disabled={procesando || loading}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: procesando ? 0.6 : 1 }}>
                    <Check size={16} /> {procesando ? 'Confirmando...' : 'Confirmar alistamiento'}
                </button>
                <button onClick={onCancelar}
                    style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                    Cancelar
                </button>
            </div>
        </div>
    )
}

// ── Badges de estado solicitud ─────────────────────────────────
const BADGE_SOL = {
    recibida:   { bg: '#fef9c3', color: '#854d0e',  label: 'Recibida' },
    autorizada: { bg: '#dcfce7', color: '#166534',  label: 'Autorizada' },
    rechazada:  { bg: '#fee2e2', color: '#991b1b',  label: 'Rechazada' },
}

// ── Tab Devoluciones (Almacén) ─────────────────────────────────
function TablaDevoluciones({ onConteoChange }) {
    const { perfil } = useAuth()
    const [vista, setVista] = useState('lista')
    const [solicitudes, setSolicitudes] = useState([])
    const [loading, setLoading] = useState(true)
    const [filtroEstado, setFiltroEstado] = useState('todas')

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase
            .from('solicitudes_devolucion')
            .select('*, ventas(numero_factura), clientes(nombre), almacenes(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })
        if (data) setSolicitudes(data)
        setLoading(false)
    }

    if (vista === 'nueva')
        return <RegistrarDevolucion
            onGuardado={() => { setVista('lista'); cargar(); onConteoChange() }}
            onCancelar={() => setVista('lista')}
        />

    const filtradas = filtroEstado === 'todas' ? solicitudes : solicitudes.filter(s => s.estado === filtroEstado)

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {['todas', 'recibida', 'autorizada', 'rechazada'].map(e => (
                        <button key={e} onClick={() => setFiltroEstado(e)}
                            style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: '1px solid', borderColor: filtroEstado === e ? '#374151' : '#e5e7eb', backgroundColor: filtroEstado === e ? '#374151' : '#fff', color: filtroEstado === e ? '#fff' : '#6b7280' }}>
                            {e === 'todas' ? 'Todas' : BADGE_SOL[e].label}
                        </button>
                    ))}
                </div>
                <button onClick={() => setVista('nueva')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={14} /> Registrar devolución recibida
                </button>
            </div>
            {loading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
            ) : filtradas.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center' }}>
                    <RotateCcw size={32} style={{ color: '#d1d5db', marginBottom: '12px', display: 'block', margin: '0 auto 12px' }} />
                    <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No hay solicitudes de devolución registradas</p>
                </div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            {['Nro. Solicitud', 'Nro. Pedido', 'Nota de Entrega', 'Cliente', 'Almacén', 'Estado', 'Fecha'].map(h => (
                                <th key={h} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {filtradas.map(s => {
                            const badge = BADGE_SOL[s.estado] || BADGE_SOL.recibida
                            return (
                                <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{s.numero_solicitud}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: s.numero_pedido ? '#374151' : '#d1d5db' }}>{s.numero_pedido || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: '#374151' }}>{s.ventas?.numero_factura || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{s.clientes?.nombre || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{s.almacenes?.nombre || '—'}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ backgroundColor: badge.bg, color: badge.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{badge.label}</span>
                                        {s.estado === 'rechazada' && s.motivo_rechazo && (
                                            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{s.motivo_rechazo.length > 40 ? s.motivo_rechazo.slice(0, 40) + '...' : s.motivo_rechazo}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#9ca3af' }}>
                                        {s.fecha_recepcion ? new Date(s.fecha_recepcion + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            )}
        </div>
    )
}

// ── Registrar devolución recibida ──────────────────────────────
function RegistrarDevolucion({ onGuardado, onCancelar }) {
    const { perfil } = useAuth()
    const [busqueda, setBusqueda] = useState('')
    const [buscando, setBuscando] = useState(false)
    const [resultados, setResultados] = useState([])
    const [ventaSel, setVentaSel] = useState(null)
    const [items, setItems] = useState([])
    const [cargandoItems, setCargandoItems] = useState(false)
    const [almacenes, setAlmacenes] = useState([])
    const [almacenId, setAlmacenId] = useState('')
    const [notasAlmacen, setNotasAlmacen] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        supabase.from('almacenes').select('id, nombre').eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => { if (data) { setAlmacenes(data); if (data.length === 1) setAlmacenId(data[0].id) } })
    }, [])

    async function buscar() {
        if (!busqueda.trim()) return
        setBuscando(true)
        const eid = perfil.empresa_id
        const termino = busqueda.trim()

        const { data: byFactura } = await supabase
            .from('ventas').select('id, numero_factura, pedido_id, fecha_venta, cliente_id, clientes(nombre)')
            .eq('empresa_id', eid).ilike('numero_factura', `%${termino}%`).limit(5)

        const { data: pedidosMatch } = await supabase
            .from('pedidos').select('id, numero_pedido')
            .eq('empresa_id', eid).ilike('numero_pedido', `%${termino}%`).limit(10)

        let byPedido = []
        if (pedidosMatch?.length) {
            const { data: vbp } = await supabase
                .from('ventas').select('id, numero_factura, pedido_id, fecha_venta, cliente_id, clientes(nombre)')
                .eq('empresa_id', eid).in('pedido_id', pedidosMatch.map(p => p.id))
            byPedido = vbp || []
        }

        const all = [...(byFactura || []), ...byPedido]
        const seen = new Set()
        const unique = all.filter(v => { if (seen.has(v.id)) return false; seen.add(v.id); return true })

        const pedidoMap = {}
        ;(pedidosMatch || []).forEach(p => { pedidoMap[p.id] = p.numero_pedido })
        const missingIds = unique.filter(v => v.pedido_id && !pedidoMap[v.pedido_id]).map(v => v.pedido_id)
        if (missingIds.length) {
            const { data: extras } = await supabase.from('pedidos').select('id, numero_pedido').in('id', missingIds)
            ;(extras || []).forEach(p => { pedidoMap[p.id] = p.numero_pedido })
        }

        setResultados(unique.map(v => ({ ...v, numero_pedido: pedidoMap[v.pedido_id] || null })))
        setBuscando(false)
    }

    async function seleccionar(venta) {
        setVentaSel(venta); setResultados([]); setCargandoItems(true)
        const { data } = await supabase
            .from('venta_items').select('*, productos_terminados(nombre, sku, unidad_medida, aplica_iva)')
            .eq('venta_id', venta.id)
        setItems((data || []).map(i => ({ ...i, cantidad_recibida: '' })))
        setCargandoItems(false)
    }

    function setCantRecibida(id, val) {
        const n = parseFloat(val)
        setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad_recibida: isNaN(n) ? '' : Math.max(0, n) } : i))
    }

    async function guardar() {
        if (!almacenId) { setError('Selecciona el almacén de destino'); return }
        const validos = items.filter(i => Number(i.cantidad_recibida) > 0)
        if (!validos.length) { setError('Ingresa al menos un ítem con cantidad mayor a cero'); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()
        const { data: numData } = await supabase.rpc('obtener_siguiente_solicitud_devolucion_numero', { p_empresa_id: perfil.empresa_id })

        const { data: sol, error: errSol } = await supabase.from('solicitudes_devolucion').insert({
            empresa_id: perfil.empresa_id,
            numero_solicitud: numData || 'SDR-000001',
            numero_pedido: ventaSel.numero_pedido || null,
            venta_id: ventaSel.id,
            pedido_id: ventaSel.pedido_id || null,
            cliente_id: ventaSel.cliente_id,
            almacen_id: almacenId,
            notas_almacen: notasAlmacen.trim() || null,
            usuario_almacen_id: user.id,
            fecha_recepcion: new Date().toISOString().split('T')[0],
        }).select().single()
        if (errSol) { setError('Error: ' + errSol.message); setGuardando(false); return }

        const { error: errItems } = await supabase.from('solicitud_devolucion_items').insert(
            validos.map(i => ({
                solicitud_id: sol.id,
                empresa_id: perfil.empresa_id,
                producto_id: i.producto_id,
                cantidad_recibida: Number(i.cantidad_recibida),
                precio_unitario: Number(i.precio_unitario),
                aplica_iva: i.productos_terminados?.aplica_iva ?? true,
            }))
        )
        if (errItems) { setError('Error en ítems: ' + errItems.message); setGuardando(false); return }

        setGuardando(false); onGuardado()
    }

    const inp = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', boxSizing: 'border-box' }

    return (
        <div style={{ padding: '24px', maxWidth: '760px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Registrar devolución recibida</h1>
            </div>

            {!ventaSel && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Buscar por número de pedido o nota de entrega</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
                            placeholder="Ej: PED-000123 o NE-000456" style={{ ...inp, flex: 1 }} />
                        <button onClick={buscar} disabled={buscando || !busqueda.trim()}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', opacity: (!busqueda.trim() || buscando) ? 0.6 : 1 }}>
                            <Search size={14} /> {buscando ? 'Buscando...' : 'Buscar'}
                        </button>
                    </div>
                    {resultados.length > 0 && (
                        <div style={{ marginTop: '12px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
                            {resultados.map(v => (
                                <div key={v.id} onClick={() => seleccionar(v)}
                                    style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fff'}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', fontFamily: 'monospace' }}>
                                            {v.numero_factura}
                                            {v.numero_pedido && <span style={{ marginLeft: '10px', color: '#6b7280', fontWeight: 400 }}>{v.numero_pedido}</span>}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{v.clientes?.nombre}</div>
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                                        {v.fecha_venta ? new Date(v.fecha_venta).toLocaleDateString('es-VE') : ''}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {!buscando && resultados.length === 0 && busqueda && (
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '8px 0 0' }}>Sin resultados para "{busqueda}"</p>
                    )}
                </div>
            )}

            {ventaSel && (
                <>
                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'monospace', color: '#374151' }}>{ventaSel.numero_factura}</span>
                                {ventaSel.numero_pedido && <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#6b7280' }}>{ventaSel.numero_pedido}</span>}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{ventaSel.clientes?.nombre}</div>
                        </div>
                        <button onClick={() => { setVentaSel(null); setItems([]) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
                            <X size={16} />
                        </button>
                    </div>

                    {cargandoItems ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Cargando ítems...</div>
                    ) : (
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '16px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {['Producto', 'Cant. facturada', 'Cant. recibida'].map(h => (
                                            <th key={h} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(i => (
                                        <tr key={i.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{i.productos_terminados?.nombre}</div>
                                                {i.productos_terminados?.sku && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{i.productos_terminados.sku}</div>}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{Number(i.cantidad)} {i.productos_terminados?.unidad_medida}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <input type="number" min="0" max={Number(i.cantidad)} step="0.001"
                                                    value={i.cantidad_recibida} onChange={e => setCantRecibida(i.id, e.target.value)}
                                                    style={{ width: '100px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />
                                                <span style={{ fontSize: '12px', color: '#9ca3af', marginLeft: '6px' }}>{i.productos_terminados?.unidad_medida}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '16px' }}>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Almacén de destino <span style={{ color: '#dc2626' }}>*</span></label>
                            <select value={almacenId} onChange={e => setAlmacenId(e.target.value)} style={inp}>
                                <option value="">— Seleccionar almacén —</option>
                                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Observaciones (opcional)</label>
                            <textarea value={notasAlmacen} onChange={e => setNotasAlmacen(e.target.value)}
                                placeholder="Estado de la mercancía, condiciones de recepción..." rows={3}
                                style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
                        </div>
                    </div>

                    {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={onCancelar} style={{ padding: '10px 20px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
                        <button onClick={guardar} disabled={guardando}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                            <Check size={15} /> {guardando ? 'Guardando...' : 'Registrar devolución recibida'}
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}
