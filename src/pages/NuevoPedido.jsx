import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Search, Plus, Minus, Trash2, Check, ChevronRight, ChevronLeft, X, Clock, Package } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`


// ══════════════════════════════════════════════════════════════
// ESTILOS BASE MÓVIL
// ══════════════════════════════════════════════════════════════
const s = {
    container: {
        maxWidth: '480px',
        margin: '0 auto',
        backgroundColor: '#f9fafb',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    header: {
        backgroundColor: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '16px',
        position: 'sticky',
        top: 0,
        zIndex: 10,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        padding: '16px',
        marginBottom: '12px',
    },
    input: {
        width: '100%',
        padding: '12px 14px',
        border: '1px solid #d1d5db',
        borderRadius: '10px',
        fontSize: '16px',
        color: '#374151',
        backgroundColor: '#fff',
        boxSizing: 'border-box',
        outline: 'none',
    },
    btnPrimary: {
        width: '100%',
        backgroundColor: '#16a34a',
        color: '#fff',
        border: 'none',
        borderRadius: '12px',
        padding: '16px',
        fontSize: '16px',
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
    },
    btnSecondary: {
        width: '100%',
        backgroundColor: '#fff',
        color: '#374151',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '14px',
        fontSize: '15px',
        fontWeight: 500,
        cursor: 'pointer',
    },
    label: {
        fontSize: '12px',
        fontWeight: 600,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        marginBottom: '8px',
        display: 'block',
    },
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function NuevoPedido({ onPedidoCreado, onCancelar }) {
    const { perfil } = useAuth()
    const [paso, setPaso] = useState(1)

    // Paso 1 — Cliente
    const [clientes, setClientes] = useState([])
    const [busqCliente, setBusqCliente] = useState('')
    const [clienteSel, setClienteSel] = useState(null)

    // Paso 2 — Productos
    const [listas, setListas] = useState([])
    const [listaId, setListaId] = useState('')
    const [productos, setProductos] = useState([])
    const [busqProducto, setBusqProducto] = useState('')
    const [items, setItems] = useState([])
    const [descuentoGlobal, setDescuentoGlobal] = useState('')

    // Paso 3 — Confirmar
    const [fechaEntrega, setFechaEntrega] = useState('')
    const [notas, setNotas] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [pedidoCreado, setPedidoCreado] = useState(null)

    // Historial cliente
    const [verHistorial, setVerHistorial] = useState(false)
    const [historial, setHistorial] = useState([])

    useEffect(() => {
        supabase.from('clientes')
            .select('id, nombre, rif, condicion_pago, dias_credito')
            .eq('activo', true)
            .eq('empresa_id', perfil.empresa_id)
            .order('nombre')
            .then(({ data }) => setClientes(data || []))

        supabase.from('listas_precio')
            .select('id, nombre, es_default')
            .eq('activo', true)
            .eq('empresa_id', perfil.empresa_id)
            .order('nombre')
            .then(({ data }) => {
                if (data) {
                    setListas(data)
                    const def = data.find(l => l.es_default)
                    if (def) setListaId(def.id)
                    else if (data.length > 0) setListaId(data[0].id)
                }
            })
    }, [])

    // Cargar productos cuando cambia la lista
    useEffect(() => {
        if (!listaId) return
        supabase.from('producto_precios')
            .select('precio, productos_terminados(id, nombre, sku, unidad_medida)')
            .eq('lista_id', listaId)
            .eq('empresa_id', perfil.empresa_id)
            .then(({ data }) => {
                if (data) {
                    const prods = data
                        .filter(p => p.productos_terminados)
                        .map(p => ({
                            id: p.productos_terminados.id,
                            nombre: p.productos_terminados.nombre,
                            sku: p.productos_terminados.sku,
                            unidad_medida: p.productos_terminados.unidad_medida,
                            precio: Number(p.precio),
                        }))
                    setProductos(prods)
                }
            })
    }, [listaId])

    // Cargar historial del cliente
    async function cargarHistorial(clienteId) {
        const { data } = await supabase.from('pedidos')
            .select('numero_pedido, fecha_pedido, estado')
            .eq('cliente_id', clienteId)
            .eq('empresa_id', perfil.empresa_id)
            .order('fecha_pedido', { ascending: false })
            .limit(10)
        if (data) setHistorial(data)
        setVerHistorial(true)
    }

    const clientesFiltrados = clientes.filter(c =>
        c.nombre.toLowerCase().includes(busqCliente.toLowerCase()) ||
        c.rif?.toLowerCase().includes(busqCliente.toLowerCase())
    )

    const productosFiltrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqProducto.toLowerCase()) ||
        p.sku?.toLowerCase().includes(busqProducto.toLowerCase())
    )

    function agregarProducto(prod) {
        setItems(prev => {
            const existe = prev.find(i => i.id === prod.id)
            if (existe) return prev.map(i => i.id === prod.id ? { ...i, cantidad: i.cantidad + 1 } : i)
            return [...prev, { ...prod, cantidad: 1, descuento_item: '' }]
        })
        setBusqProducto('')
    }

    function cambiarCantidad(id, delta) {
        setItems(prev => prev.map(i => i.id === id
            ? { ...i, cantidad: Math.max(1, i.cantidad + delta) }
            : i
        ))
    }

    function setCantidadDirecta(id, valor) {
        const n = parseInt(valor)
        if (isNaN(n) || n < 1) return
        setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad: n } : i))
    }

    function setDescItem(id, desc) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, descuento_item: desc } : i))
    }

    function eliminarItem(id) {
        setItems(prev => prev.filter(i => i.id !== id))
    }

    // Cálculos
    const subtotalBruto = items.reduce((s, i) => s + i.cantidad * i.precio, 0)
    const subtotalConDescItems = items.reduce((s, i) => s + i.cantidad * i.precio * (1 - Number(i.descuento_item || 0) / 100), 0)
    const subtotalFinal = subtotalConDescItems * (1 - Number(descuentoGlobal || 0) / 100)
    const iva = subtotalFinal * 0.16
    const total = subtotalFinal + iva

    async function guardar() {
        setGuardando(true); setError('')
        const { data: { user } } = await supabase.auth.getUser()
        const numero = `PED-${Date.now().toString().slice(-6)}`

        const { data: pedido, error: errPedido } = await supabase.from('pedidos').insert({
            empresa_id: perfil.empresa_id,
            cliente_id: clienteSel.id,
            vendedor_id: user.id,
            lista_precio_id: listaId || null,
            descuento_global: descuentoGlobal,
            estado: 'pendiente',
            fecha_pedido: new Date().toISOString(),
            fecha_entrega: fechaEntrega || null,
            notas: notas.trim() || null,
            numero_pedido: numero,
        }).select().single()

        if (errPedido) { setError('Error: ' + errPedido.message); setGuardando(false); return }

        await supabase.from('pedido_items').insert(
            items.map(i => ({
                pedido_id: pedido.id,
                empresa_id: perfil.empresa_id,
                producto_id: i.id,
                nombre_producto: i.nombre,
                cantidad: i.cantidad,
                precio_unitario: i.precio,
                descuento_item: i.descuento_item,
                subtotal: i.cantidad * i.precio * (1 - i.descuento_item / 100),
            }))
        )

        setGuardando(false)
        setPedidoCreado(pedido)
    }

    // ── PANTALLA DE ÉXITO ──
    if (pedidoCreado) return (
        <div style={{ ...s.container, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px' }}>
            <div style={{ width: '72px', height: '72px', backgroundColor: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                <Check size={36} style={{ color: '#16a34a' }} />
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', margin: '0 0 8px', textAlign: 'center' }}>¡Pedido enviado!</h2>
            <p style={{ fontSize: '15px', color: '#6b7280', margin: '0 0 6px', textAlign: 'center' }}>
                {pedidoCreado.numero_pedido}
            </p>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 32px', textAlign: 'center' }}>
                El pedido está pendiente de aprobación en la oficina
            </p>
            <button onClick={() => {
                setPedidoCreado(null); setPaso(1); setClienteSel(null)
                setBusqCliente(''); setItems([]); setNotas(''); setFechaEntrega('')
                setDescuentoGlobal('')
            }} style={s.btnPrimary}>
                <Plus size={18} /> Nuevo pedido
            </button>
            {onCancelar && (
                <button onClick={onCancelar} style={{ ...s.btnSecondary, marginTop: '10px' }}>
                    Volver al inicio
                </button>
            )}
        </div>
    )

    // ── PASO 1: CLIENTE ──
    if (paso === 1) return (
        <div style={s.container}>
            <div style={s.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    {onCancelar && (
                        <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                            <X size={20} />
                        </button>
                    )}
                    <div>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Paso 1 de 3</p>
                        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Seleccionar cliente</h1>
                    </div>
                </div>
                {/* Barra de progreso */}
                <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3].map(n => (
                        <div key={n} style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: n <= paso ? '#16a34a' : '#e5e7eb' }} />
                    ))}
                </div>
            </div>

            <div style={{ padding: '16px' }}>
                {/* Buscador */}
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" placeholder="Buscar cliente por nombre o RIF..."
                        value={busqCliente} onChange={e => setBusqCliente(e.target.value)}
                        style={{ ...s.input, paddingLeft: '42px' }} autoFocus />
                </div>

                {/* Cliente seleccionado */}
                {clienteSel && (
                    <div style={{ backgroundColor: '#f0fdf4', border: '2px solid #16a34a', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ fontSize: '16px', fontWeight: 700, color: '#166534', margin: '0 0 2px' }}>{clienteSel.nombre}</p>
                                {clienteSel.rif && <p style={{ fontSize: '12px', color: '#16a34a', margin: '0 0 4px', fontFamily: 'monospace' }}>{clienteSel.rif}</p>}
                                <p style={{ fontSize: '12px', color: '#16a34a', margin: 0 }}>
                                    {clienteSel.condicion_pago === 'credito' ? `Crédito ${clienteSel.dias_credito} días` : 'Contado'}
                                </p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <button onClick={() => cargarHistorial(clienteSel.id)}
                                    style={{ background: 'none', border: '1px solid #16a34a', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={12} /> Historial
                                </button>
                                <button onClick={() => setClienteSel(null)}
                                    style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#6b7280', cursor: 'pointer' }}>
                                    Cambiar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Lista de clientes */}
                {!clienteSel && (
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        {clientesFiltrados.length === 0 ? (
                            <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                                {busqCliente ? 'Sin resultados' : 'Escribe para buscar'}
                            </div>
                        ) : clientesFiltrados.slice(0, 15).map(c => (
                            <div key={c.id} onClick={() => { setClienteSel(c); setBusqCliente('') }}
                                style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                onTouchStart={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                onTouchEnd={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <div>
                                    <p style={{ fontSize: '15px', fontWeight: 500, color: '#1f2937', margin: '0 0 2px' }}>{c.nombre}</p>
                                    {c.rif && <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{c.rif}</p>}
                                </div>
                                <ChevronRight size={16} style={{ color: '#d1d5db' }} />
                            </div>
                        ))}
                    </div>
                )}

                {/* Historial modal */}
                {verHistorial && (
                    <>
                        <div onClick={() => setVerHistorial(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 40 }} />
                        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '24px', zIndex: 50, maxHeight: '60vh', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Historial de pedidos</h3>
                                <button onClick={() => setVerHistorial(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                            </div>
                            {historial.length === 0 ? (
                                <p style={{ fontSize: '14px', color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>Sin pedidos anteriores</p>
                            ) : historial.map(h => (
                                <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                                    <div>
                                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: '0 0 2px', fontFamily: 'monospace' }}>{h.numero_pedido}</p>
                                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{new Date(h.fecha_pedido).toLocaleDateString('es-VE')}</p>
                                    </div>
                                    <span style={{ backgroundColor: ESTADOS[h.estado]?.bg, color: ESTADOS[h.estado]?.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>
                                        {ESTADOS[h.estado]?.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Footer con botón siguiente */}
            <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', backgroundColor: '#fff', borderTop: '1px solid #e5e7eb', padding: '16px' }}>
                <button onClick={() => setPaso(2)} disabled={!clienteSel}
                    style={{ ...s.btnPrimary, opacity: clienteSel ? 1 : 0.4 }}>
                    Siguiente — Productos <ChevronRight size={18} />
                </button>
            </div>
            <div style={{ height: '80px' }} />
        </div>
    )

    // ── PASO 2: PRODUCTOS ──
    if (paso === 2) return (
        <div style={s.container}>
            <div style={s.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <button onClick={() => setPaso(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                        <ChevronLeft size={20} />
                    </button>
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Paso 2 de 3 · {clienteSel.nombre}</p>
                        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Agregar productos</h1>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                    {[1, 2, 3].map(n => (
                        <div key={n} style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: n <= paso ? '#16a34a' : '#e5e7eb' }} />
                    ))}
                </div>
                {/* Selector de lista */}
                <select value={listaId} onChange={e => setListaId(e.target.value)}
                    style={{ ...s.input, fontSize: '14px', padding: '10px 12px' }}>
                    {listas.map(l => <option key={l.id} value={l.id}>{l.nombre}{l.es_default ? ' (default)' : ''}</option>)}
                </select>
            </div>

            <div style={{ padding: '16px' }}>
                {/* Buscador de productos */}
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" placeholder="Buscar producto por nombre o código..."
                        value={busqProducto} onChange={e => setBusqProducto(e.target.value)}
                        style={{ ...s.input, paddingLeft: '42px' }} />
                </div>

                {/* Resultados búsqueda */}
                {busqProducto && (
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '16px' }}>
                        {productosFiltrados.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Sin resultados</div>
                        ) : productosFiltrados.slice(0, 8).map(p => (
                            <div key={p.id} onClick={() => agregarProducto(p)}
                                style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <div>
                                    <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: '0 0 2px' }}>{p.nombre}</p>
                                    {p.sku && <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{p.sku}</p>}
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a', margin: 0 }}>{fmt(p.precio)}</p>
                                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{p.unidad_medida}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Items agregados */}
                {items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                        <Package size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
                        <p style={{ fontSize: '14px', margin: 0 }}>Busca y agrega productos al pedido</p>
                    </div>
                ) : (
                    <>
                        {items.map(item => (
                            <div key={item.id} style={s.card}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: '0 0 2px' }}>{item.nombre}</p>
                                        <p style={{ fontSize: '13px', color: '#16a34a', margin: 0, fontWeight: 500 }}>{fmt(item.precio)} / {item.unidad_medida}</p>
                                    </div>
                                    <button onClick={() => eliminarItem(item.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', marginLeft: '8px' }}>
                                        <Trash2 size={18} />
                                    </button>
                                </div>

                                {/* Cantidad */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                                    <button onClick={() => cambiarCantidad(item.id, -1)}
                                        style={{ width: '40px', height: '40px', borderRadius: '10px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151' }}>
                                        <Minus size={16} />
                                    </button>
                                    <input type="number" min="1" value={item.cantidad}
                                        onChange={e => setCantidadDirecta(item.id, e.target.value)}
                                        style={{ flex: 1, textAlign: 'center', padding: '8px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '18px', fontWeight: 700, color: '#1f2937' }} />
                                    <button onClick={() => cambiarCantidad(item.id, 1)}
                                        style={{ width: '40px', height: '40px', borderRadius: '10px', border: '1px solid #16a34a', backgroundColor: '#f0fdf4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
                                        <Plus size={16} />
                                    </button>
                                </div>

                                {/* Descuento por item */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>Desc. item %:</span>
                                    <input type="number" min="0" max="100" step="0.1"
                                        value={item.descuento_item}
                                        onChange={e => setDescItem(item.id, e.target.value)}
                                        placeholder="0"
                                        style={{ width: '80px', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', textAlign: 'center' }} />
                                </div>

                                {/* Subtotal del item */}
                                <div style={{ marginTop: '10px', textAlign: 'right' }}>
                                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937' }}>
                                        {fmt(item.cantidad * item.precio * (1 - item.descuento_item / 100))}
                                    </span>
                                </div>
                            </div>
                        ))}

                        {/* Descuento global */}
                        <div style={{ ...s.card, backgroundColor: '#f9fafb' }}>
                            <label style={s.label}>Descuento global al pedido %</label>
                            <input type="number" min="0" max="100" step="0.1"
                                value={descuentoGlobal}
                                onChange={e => setDescuentoGlobal(e.target.value)}
                                placeholder="0"
                                style={{ width: '120px', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '16px', fontWeight: 600, textAlign: 'center' }} />
                        </div>
                    </>
                )}
            </div>

            {/* Footer con resumen y botón */}
            <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', backgroundColor: '#fff', borderTop: '1px solid #e5e7eb', padding: '12px 16px' }}>
                {items.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>{items.length} producto(s) · {items.reduce((s, i) => s + i.cantidad, 0)} unidades</span>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: '#16a34a' }}>{fmt(total)}</span>
                    </div>
                )}
                <button onClick={() => setPaso(3)} disabled={items.length === 0}
                    style={{ ...s.btnPrimary, opacity: items.length > 0 ? 1 : 0.4 }}>
                    Siguiente — Confirmar <ChevronRight size={18} />
                </button>
            </div>
            <div style={{ height: '100px' }} />
        </div>
    )

    // ── PASO 3: CONFIRMAR ──
    return (
        <div style={s.container}>
            <div style={s.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <button onClick={() => setPaso(2)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                        <ChevronLeft size={20} />
                    </button>
                    <div>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Paso 3 de 3</p>
                        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Confirmar pedido</h1>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3].map(n => (
                        <div key={n} style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: n <= paso ? '#16a34a' : '#e5e7eb' }} />
                    ))}
                </div>
            </div>

            <div style={{ padding: '16px' }}>
                {/* Resumen cliente */}
                <div style={s.card}>
                    <label style={s.label}>Cliente</label>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937', margin: '0 0 2px' }}>{clienteSel.nombre}</p>
                    {clienteSel.rif && <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{clienteSel.rif}</p>}
                </div>

                {/* Resumen items */}
                <div style={s.card}>
                    <label style={s.label}>Productos ({items.length})</label>
                    {items.map(item => (
                        <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', marginBottom: '8px', borderBottom: '1px solid #f3f4f6' }}>
                            <div>
                                <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: '0 0 2px' }}>{item.nombre}</p>
                                <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                                    {item.cantidad} × {fmt(item.precio)}
                                    {item.descuento_item > 0 && ` · -${item.descuento_item}%`}
                                </p>
                            </div>
                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                                {fmt(item.cantidad * item.precio * (1 - item.descuento_item / 100))}
                            </span>
                        </div>
                    ))}

                    {/* Totales */}
                    <div style={{ marginTop: '8px' }}>
                        {descuentoGlobal > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#16a34a', marginBottom: '4px' }}>
                                <span>Descuento global ({descuentoGlobal}%)</span>
                                <span>-{fmt(subtotalConDescItems - subtotalFinal)}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
                            <span>IVA (16%)</span><span>{fmt(iva)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#1f2937', paddingTop: '8px', borderTop: '2px solid #e5e7eb' }}>
                            <span>Total</span><span style={{ color: '#16a34a' }}>{fmt(total)}</span>
                        </div>
                    </div>
                </div>

                {/* Fecha entrega */}
                <div style={s.card}>
                    <label style={s.label}>Fecha de entrega prometida</label>
                    <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)}
                        style={s.input} min={new Date().toISOString().split('T')[0]} />
                </div>

                {/* Notas */}
                <div style={s.card}>
                    <label style={s.label}>Notas <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                    <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
                        placeholder="Instrucciones especiales, condiciones de entrega..."
                        style={{ ...s.input, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', fontSize: '14px', color: '#dc2626', marginBottom: '12px' }}>
                        {error}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', backgroundColor: '#fff', borderTop: '1px solid #e5e7eb', padding: '16px' }}>
                <button onClick={guardar} disabled={guardando}
                    style={{ ...s.btnPrimary, opacity: guardando ? 0.7 : 1 }}>
                    <Check size={18} /> {guardando ? 'Enviando pedido...' : 'Confirmar y enviar pedido'}
                </button>
            </div>
            <div style={{ height: '80px' }} />
        </div>
    )
}

const ESTADOS = {
    pendiente:  { bg: '#fef9c3', color: '#854d0e',  label: 'Pendiente' },
    aprobado:   { bg: '#dbeafe', color: '#1e40af',  label: 'Aprobado' },
    rechazado:  { bg: '#fee2e2', color: '#991b1b',  label: 'Rechazado' },
    facturado:  { bg: '#dcfce7', color: '#166534',  label: 'Facturado' },
}
