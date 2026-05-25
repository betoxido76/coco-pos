import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { PackageCheck, ChevronRight, Check, AlertTriangle, Truck, FileText } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

const ESTADOS = {
    pendiente:  { bg: '#fef9c3', color: '#854d0e', label: 'Pendiente' },
    aprobado:   { bg: '#dbeafe', color: '#1e40af', label: 'Aprobado' },
    alistado:   { bg: '#fff7ed', color: '#c2410c', label: 'Alistado' },
    rechazado:  { bg: '#fee2e2', color: '#991b1b', label: 'Rechazado' },
    facturado:  { bg: '#dcfce7', color: '#166534', label: 'Facturado' },
    despachado: { bg: '#d1fae5', color: '#065f46', label: 'Despachado' },
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
    const [conteos, setConteos] = useState({ alistamiento: 0, porregistrar: 0, despacho: 0 })

    useEffect(() => { cargar(); cargarConteos() }, [tabActiva])

    async function cargarConteos() {
        const eid = perfil.empresa_id
        const [r1, r2, r3] = await Promise.all([
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'aprobado'),
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'alistado'),
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'facturado'),
        ])
        setConteos({ alistamiento: r1.count || 0, porregistrar: r2.count || 0, despacho: r3.count || 0 })
    }

    async function cargar() {
        setLoading(true)
        let estado
        if (tabActiva === 'alistamiento') estado = 'aprobado'
        else if (tabActiva === 'porregistrar') estado = 'alistado'
        else estado = 'facturado'

        const { data } = await supabase
            .from('pedidos')
            .select('*, clientes(nombre, rif, descripcion, direccion_fiscal), usuarios(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('estado', estado)
            .order('created_at', { ascending: false })
        if (data) setPedidos(data)
        setLoading(false)
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
                    { key: 'alistamiento', label: 'Alistamiento',  count: conteos.alistamiento, badgeBg: '#fff7ed', badgeColor: '#c2410c' },
                    { key: 'porregistrar', label: 'Por Registrar', count: conteos.porregistrar, badgeBg: '#fef9c3', badgeColor: '#854d0e' },
                    { key: 'despacho',     label: 'Despacho',      count: conteos.despacho,     badgeBg: '#dcfce7', badgeColor: '#166534' },
                ].map(tab => {
                    const isActive = tabActiva === tab.key
                    return (
                        <button key={tab.key} onClick={() => { setTabActiva(tab.key); setPedidoActual(null); setPedidoVer(null) }}
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

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : pedidos.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                        {tabActiva === 'alistamiento'
                            ? <PackageCheck size={32} style={{ color: '#d1d5db', marginBottom: '12px' }} />
                            : <Truck size={32} style={{ color: '#d1d5db', marginBottom: '12px' }} />}
                        <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
                            {tabActiva === 'alistamiento'
                                ? 'No hay pedidos aprobados pendientes de alistamiento'
                                : tabActiva === 'porregistrar'
                                ? 'No hay pedidos alistados pendientes de facturación'
                                : 'No hay pedidos facturados pendientes de despacho'}
                        </p>
                    </div>
                ) : tabActiva === 'alistamiento' ? (
                    <TablaAlistamiento pedidos={pedidos} onAlistar={p => setPedidoActual(p)} />
                ) : tabActiva === 'porregistrar' ? (
                    <TablaPorRegistrar pedidos={pedidos} onVer={p => setPedidoVer(p)} />
                ) : (
                    <TablaDespacho pedidos={pedidos} onVer={p => setPedidoVer(p)} onDespachado={() => { cargar(); cargarConteos() }} empresaId={perfil.empresa_id} />
                )}
            </div>
        </div>
    )
}

// ── Tabla Alistamiento ─────────────────────────────────────────
function TablaAlistamiento({ pedidos, onAlistar }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Pedido', 'Cliente', 'Vendedor', 'Origen', 'Fecha Prometida', ''].map((h, i) => (
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
                            <button onClick={() => onAlistar(p)}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                <ChevronRight size={13} /> Alistar
                            </button>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}

// ── Tabla Por Registrar ────────────────────────────────────────
function TablaPorRegistrar({ pedidos, onVer }) {
    return (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                    {['Pedido', 'Cliente', 'Vendedor', 'Fecha pedido', 'F. Prometida', 'F. Programada', 'Total', 'Estado', ''].map((h, i) => (
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
                        {['Pedido', 'Cliente', 'Vendedor', 'F. Prometida', 'F. Programada', '', ''].map((h, i) => (
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
        <div style={{ padding: '24px', maxWidth: '720px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                    Pedido {pedido.numero_pedido || '—'}
                </h1>
                <BadgeEstado estado={pedido.estado} />
            </div>

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

            {/* Dirección de entrega */}
            <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px', marginBottom: '20px' }}>
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dirección de entrega</p>
                <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }}>
                    {pedido.direccion_entrega_texto || pedido.clientes?.direccion_fiscal || '—'}
                </p>
            </div>

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
                                {['Producto', 'Cant. pedida', esAlistado ? 'Cant. alistada' : null, 'UM', 'Precio lista', 'Desc. item', 'Subtotal'].filter(Boolean).map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: (i === 0 || h === 'UM') ? 'left' : 'right' }}>{h}</th>
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
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{Number(item.cantidad).toLocaleString('es-VE')}</td>
                                        {esAlistado && (
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, textAlign: 'right', color: cancelado ? '#dc2626' : '#16a34a' }}>
                                                {item.cantidad_alistada != null ? Number(item.cantidad_alistada).toLocaleString('es-VE') : '—'}
                                            </td>
                                        )}
                                        <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280' }}>
                                            {esUM2(item)
                                                ? (item.productos_terminados?.unidad_venta_2 || item.unidad_venta || '—')
                                                : (item.productos_terminados?.unidad_medida || item.unidad_venta || '—')}
                                        </td>
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
