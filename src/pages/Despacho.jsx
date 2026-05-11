import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { PackageCheck, ChevronRight, Check, AlertTriangle } from 'lucide-react'

export default function Despacho() {
    const { perfil } = useAuth()
    const [pedidos, setPedidos] = useState([])
    const [loading, setLoading] = useState(true)
    const [pedidoActual, setPedidoActual] = useState(null)

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase
            .from('pedidos')
            .select('*, clientes(nombre, rif), usuarios(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('estado', 'aprobado')
            .order('created_at', { ascending: false })
        if (data) setPedidos(data)
        setLoading(false)
    }

    if (pedidoActual)
        return <AlistarPedido
            pedido={pedidoActual}
            onAlistado={() => { setPedidoActual(null); cargar() }}
            onCancelar={() => setPedidoActual(null)}
        />

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Despacho</h1>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Pedidos aprobados pendientes de alistamiento</p>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : pedidos.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center' }}>
                        <PackageCheck size={32} style={{ color: '#d1d5db', marginBottom: '12px' }} />
                        <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>No hay pedidos aprobados pendientes</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Pedido', 'Cliente', 'Vendedor', 'Origen', 'Entrega', ''].map((h, i) => (
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
                                        <button onClick={() => setPedidoActual(p)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                            <ChevronRight size={13} /> Alistar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

function AlistarPedido({ pedido, onAlistado, onCancelar }) {
    const { perfil } = useAuth()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [procesando, setProcesando] = useState(false)
    const [error, setError] = useState('')

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
            .update({ estado: 'alistado' })
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Cliente', valor: pedido.clientes?.nombre || '—' },
                    { label: 'Vendedor', valor: pedido.usuarios?.nombre || '—' },
                    { label: 'Entrega', valor: pedido.fecha_entrega ? new Date(pedido.fecha_entrega + 'T00:00:00').toLocaleDateString('es-VE') : '—' },
                ].map(f => (
                    <div key={f.label} style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px' }}>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }}>{f.valor}</p>
                    </div>
                ))}
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
