import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { PackageCheck, ChevronRight, Check, AlertTriangle, Truck } from 'lucide-react'

export default function Despacho() {
    const { perfil } = useAuth()
    const [tabActiva, setTabActiva] = useState('alistamiento')
    const [pedidos, setPedidos] = useState([])
    const [loading, setLoading] = useState(true)
    const [pedidoActual, setPedidoActual] = useState(null)
    const [conteos, setConteos] = useState({ alistamiento: 0, despacho: 0 })

    useEffect(() => { cargar(); cargarConteos() }, [tabActiva])

    async function cargarConteos() {
        const eid = perfil.empresa_id
        const [r1, r2] = await Promise.all([
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'aprobado'),
            supabase.from('pedidos').select('*', { count: 'exact', head: true }).eq('empresa_id', eid).eq('estado', 'facturado'),
        ])
        setConteos({ alistamiento: r1.count || 0, despacho: r2.count || 0 })
    }

    async function cargar() {
        setLoading(true)
        const estado = tabActiva === 'alistamiento' ? 'aprobado' : 'facturado'
        const { data } = await supabase
            .from('pedidos')
            .select('*, clientes(nombre, rif), usuarios(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('estado', estado)
            .order('created_at', { ascending: false })
        if (data) setPedidos(data)
        setLoading(false)
    }

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
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'alistamiento', label: 'Alistamiento', count: conteos.alistamiento, badgeBg: '#fff7ed', badgeColor: '#c2410c' },
                    { key: 'despacho',     label: 'Despacho',     count: conteos.despacho,     badgeBg: '#dcfce7', badgeColor: '#166534' },
                ].map(tab => {
                    const isActive = tabActiva === tab.key
                    return (
                        <button key={tab.key} onClick={() => { setTabActiva(tab.key); setPedidoActual(null) }}
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
                                : 'No hay pedidos facturados pendientes de despacho'}
                        </p>
                    </div>
                ) : tabActiva === 'alistamiento' ? (
                    <TablaAlistamiento pedidos={pedidos} onAlistar={p => setPedidoActual(p)} />
                ) : (
                    <TablaDespacho pedidos={pedidos} onDespachado={() => { cargar(); cargarConteos() }} empresaId={perfil.empresa_id} />
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

// ── Tabla Despacho ─────────────────────────────────────────────
function TablaDespacho({ pedidos, onDespachado, empresaId }) {
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
                        {['Pedido', 'Cliente', 'Vendedor', 'F. Prometida', 'F. Programada', ''].map((h, i) => (
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
