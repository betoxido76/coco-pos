import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import {
    Search, Plus, Minus, Trash2, Check, ChevronRight, ChevronLeft,
    X, Clock, Package, ShoppingCart, DollarSign, Users, AlertCircle,
    TrendingUp, FileText, MapPin, Phone, Building2, CreditCard,
    RotateCcw, ArrowRight, Calendar, ChevronDown, RefreshCw, WifiOff, Eye
} from 'lucide-react'

// ── Cache localStorage ──────────────────────────────────────
const CACHE_TTL = 60 * 60 * 1000 // 1 hora

function cacheSet(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })) } catch {}
}
function cacheGet(key) {
    try {
        const raw = localStorage.getItem(key)
        if (!raw) return null
        const { data, ts } = JSON.parse(raw)
        return Date.now() - ts < CACHE_TTL ? data : null
    } catch { return null }
}

// ── Cola de pedidos offline ──────────────────────────────────
function getPendingQueue() {
    try { return JSON.parse(localStorage.getItem('mipos_offline_queue') || '[]') } catch { return [] }
}
function savePendingQueue(q) {
    try { localStorage.setItem('mipos_offline_queue', JSON.stringify(q)) } catch {}
}

// ── Hook conectividad ────────────────────────────────────────
function useOnline() {
    const [online, setOnline] = useState(navigator.onLine)
    useEffect(() => {
        const up = () => setOnline(true)
        const dn = () => setOnline(false)
        window.addEventListener('online', up)
        window.addEventListener('offline', dn)
        return () => { window.removeEventListener('online', up); window.removeEventListener('offline', dn) }
    }, [])
    return online
}

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`
const fmtBs = (n, tasa) => tasa ? `${(Number(n || 0) * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.` : '—'
const fmtFecha = (f) => f ? new Date(f).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const diasDesde = (f) => f ? Math.floor((Date.now() - new Date(f)) / 86400000) : null

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

const ESTADOS_PEDIDO = {
    pendiente: { bg: '#fef9c3', color: '#854d0e', label: 'Pendiente' },
    aprobado: { bg: '#dbeafe', color: '#1e40af', label: 'Aprobado' },
    rechazado: { bg: '#fee2e2', color: '#991b1b', label: 'Rechazado' },
    facturado: { bg: '#dcfce7', color: '#166534', label: 'Facturado' },
}

const TOAST_ESTADOS = {
    aprobado:  { bg: '#dcfce7', border: '#86efac', color: '#166534', titulo: '¡Pedido aprobado!', icon: Check },
    rechazado: { bg: '#fee2e2', border: '#fca5a5', color: '#991b1b', titulo: 'Pedido rechazado',  icon: X },
    facturado: { bg: '#dbeafe', border: '#93c5fd', color: '#1e40af', titulo: 'Pedido facturado',  icon: Package },
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL — controla la vista activa
// ══════════════════════════════════════════════════════════════
export default function NuevoPedido({ onCancelar }) {
    const { perfil } = useAuth()
    const [vista, setVista] = useState('home')
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
    const [itemsARepetir, setItemsARepetir] = useState(null)
    const online = useOnline()
    const [pendingCount, setPendingCount] = useState(() => getPendingQueue().length)
    const [syncing, setSyncing] = useState(false)
    const [toasts, setToasts] = useState([])
    const [homeRefreshKey, setHomeRefreshKey] = useState(0)

    useEffect(() => {
        if (online) sincronizar()
    }, [online])

    // Suscripción Realtime — escucha cambios de estado en los pedidos del vendedor
    useEffect(() => {
        if (!perfil) return
        let channel
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return
            channel = supabase.channel(`pedidos_vendedor_${user.id}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'pedidos',
                    filter: `vendedor_id=eq.${user.id}`,
                }, ({ new: nuevo, old: viejo }) => {
                    if (nuevo.estado !== viejo.estado && TOAST_ESTADOS[nuevo.estado]) {
                        const id = Date.now()
                        setToasts(prev => [...prev, { id, pedido: nuevo }])
                        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
                        setHomeRefreshKey(k => k + 1)
                    }
                })
                .subscribe()
        })
        return () => { if (channel) supabase.removeChannel(channel) }
    }, [perfil])

    async function sincronizar() {
        if (!perfil || getPendingQueue().length === 0) return
        setSyncing(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            const queue = getPendingQueue()
            let updated = [...queue]
            for (const p of queue) {
                try {
                    const { data: num } = await supabase.rpc('obtener_siguiente_pedidos_numero', { p_empresa_id: p.empresa_id })
                    const { data: pedido, error } = await supabase.from('pedidos').insert({
                        empresa_id: p.empresa_id, cliente_id: p.cliente_id, vendedor_id: user.id,
                        lista_precio_id: p.lista_precio_id, descuento_global: p.descuento_global,
                        estado: 'pendiente',
                        origen: 'campo',
                        fecha_pedido: p.fecha_pedido, fecha_entrega: p.fecha_entrega,
                        notas: p.notas, numero_pedido: num || p.tempId,
                        direccion_entrega_id: p.direccion_entrega_id, direccion_entrega_texto: p.direccion_entrega_texto,
                    }).select().single()
                    if (!error && pedido) {
                        await supabase.from('pedido_items').insert(
                            p.items.map(i => ({ ...i, pedido_id: pedido.id, empresa_id: p.empresa_id }))
                        )
                        updated = updated.filter(x => x.tempId !== p.tempId)
                    }
                } catch {}
            }
            savePendingQueue(updated)
            setPendingCount(updated.length)
        } finally { setSyncing(false) }
    }

    function irAPedido(cliente, items = null) {
        setClienteSeleccionado(cliente)
        setItemsARepetir(items)
        setVista('pedido')
    }

    function irAFicha(cliente) {
        setClienteSeleccionado(cliente)
        setVista('ficha')
    }

    const bannerStyle = { position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', zIndex: 100, padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: 600, justifyContent: 'center' }

    let content
    if (vista === 'home') content = (
        <HomeVendedor onNuevoPedido={() => setVista('clientes')} onVerClientes={() => setVista('clientes')} onCancelar={onCancelar} refreshKey={homeRefreshKey} />
    )
    else if (vista === 'clientes') content = (
        <ListaClientes onVerFicha={irAFicha} onNuevoPedido={irAPedido} onVolver={() => setVista('home')} />
    )
    else if (vista === 'ficha') content = (
        <FichaCliente cliente={clienteSeleccionado} onNuevoPedido={(items) => irAPedido(clienteSeleccionado, items)} onVolver={() => setVista('clientes')} />
    )
    else content = (
        <FlujoPedido clienteInicial={clienteSeleccionado} itemsIniciales={itemsARepetir}
            onPedidoCreado={() => { setItemsARepetir(null); setPendingCount(getPendingQueue().length); setVista('home') }}
            onCancelar={() => { setItemsARepetir(null); setVista(clienteSeleccionado ? 'ficha' : 'home') }}
        />
    )

    return (
        <>
            {!online && (
                <div style={{ ...bannerStyle, backgroundColor: '#fef3c7', borderBottom: '1px solid #fde68a', color: '#92400e' }}>
                    <WifiOff size={13} />
                    {pendingCount > 0 ? `Sin conexión · ${pendingCount} pedido(s) pendientes de envío` : 'Sin conexión · usando datos guardados'}
                </div>
            )}
            {online && syncing && (
                <div style={{ ...bannerStyle, backgroundColor: '#dbeafe', borderBottom: '1px solid #93c5fd', color: '#1e40af' }}>
                    <RefreshCw size={13} /> Sincronizando {pendingCount} pedido(s) offline...
                </div>
            )}
            {content}

            {/* Toasts de cambio de estado */}
            {toasts.map((toast, idx) => {
                const cfg = TOAST_ESTADOS[toast.pedido.estado]
                if (!cfg) return null
                const Icon = cfg.icon
                return (
                    <div key={toast.id} style={{
                        position: 'fixed', bottom: `${20 + idx * 88}px`,
                        left: '50%', transform: 'translateX(-50%)',
                        width: 'calc(100% - 32px)', maxWidth: '448px', zIndex: 200,
                        backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
                        borderRadius: '14px', padding: '14px 16px',
                        display: 'flex', alignItems: 'center', gap: '12px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    }}>
                        <div style={{ width: '38px', height: '38px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon size={18} color={cfg.color} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '14px', fontWeight: 700, color: cfg.color, margin: '0 0 2px' }}>{cfg.titulo}</p>
                            <p style={{ fontSize: '12px', color: cfg.color, margin: 0, opacity: 0.75 }}>
                                Pedido {toast.pedido.numero_pedido}
                            </p>
                        </div>
                        <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: cfg.color, opacity: 0.5, padding: '4px', flexShrink: 0 }}>
                            <X size={16} />
                        </button>
                    </div>
                )
            })}
        </>
    )
}

// ══════════════════════════════════════════════════════════════
// PANTALLA 1: HOME DEL VENDEDOR
// ══════════════════════════════════════════════════════════════
function HomeVendedor({ onNuevoPedido, onVerClientes, onCancelar, refreshKey }) {
    const { perfil } = useAuth()
    const [stats, setStats] = useState({ pedidosHoy: 0, montoHoy: 0, clientesHoy: 0, visitasHoy: 0 })
    const [pedidosRecientes, setPedidosRecientes] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => { cargar() }, [])
    useEffect(() => { if (refreshKey) cargar() }, [refreshKey])

    async function cargar() {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        const hoy = new Date().toISOString().split('T')[0]

        const { data: pedidosHoy } = await supabase
            .from('pedidos')
            .select('id, cliente_id, numero_pedido, fecha_pedido, estado, pedido_items(subtotal, descuento_item, cantidad)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('vendedor_id', user.id)
            .gte('fecha_pedido', hoy + 'T00:00:00')
            .order('fecha_pedido', { ascending: false })

        const { data: recientes } = await supabase
            .from('pedidos')
            .select('id, numero_pedido, fecha_pedido, estado, clientes(nombre), pedido_items(subtotal, descuento_item, cantidad)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('vendedor_id', user.id)
            .order('fecha_pedido', { ascending: false })
            .limit(5)

        const { data: visitasHoyData } = await supabase
            .from('visitas_comerciales')
            .select('id')
            .eq('empresa_id', perfil.empresa_id)
            .eq('vendedor_id', user.id)
            .gte('fecha_visita', hoy + 'T00:00:00')

        if (pedidosHoy) {
            const montoHoy = pedidosHoy.reduce((sum, p) => {
                const totalPedido = (p.pedido_items || []).reduce((s, i) => s + Number(i.subtotal || 0), 0)
                return sum + totalPedido
            }, 0)
            const clientesUnicos = new Set(pedidosHoy.map(p => p.cliente_id)).size
            setStats({ pedidosHoy: pedidosHoy.length, montoHoy, clientesHoy: clientesUnicos, visitasHoy: visitasHoyData?.length || 0 })
        }
        if (recientes) setPedidosRecientes(recientes)
        setLoading(false)
    }

    const hora = new Date().getHours()
    const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches'
    const nombreVendedor = perfil?.nombre?.split(' ')[0] || 'Vendedor'

    return (
        <div style={s.container}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', padding: '24px 20px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.75)', margin: '0 0 2px' }}>{saludo},</p>
                        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>{nombreVendedor}</h1>
                        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', margin: 0 }}>
                            {new Date().toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </div>
                    <button onClick={cargar} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '38px', height: '38px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <RefreshCw size={16} color="#fff" />
                    </button>
                </div>

                {/* Stats del día */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>
                    {[
                        { label: 'Pedidos hoy', value: stats.pedidosHoy, icon: ShoppingCart },
                        { label: 'Monto hoy', value: fmt(stats.montoHoy), icon: DollarSign, small: true },
                        { label: 'Clientes', value: stats.clientesHoy, icon: Users },
                        { label: 'Visitas hoy', value: stats.visitasHoy, icon: MapPin },
                    ].map(({ label, value, icon: Icon, small }) => (
                        <div key={label} style={{ backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                            <Icon size={18} color="rgba(255,255,255,0.8)" style={{ marginBottom: '6px' }} />
                            <p style={{ fontSize: small ? '14px' : '20px', fontWeight: 700, color: '#fff', margin: '0 0 2px' }}>{loading ? '—' : value}</p>
                            <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.65)', margin: 0 }}>{label}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ padding: '16px' }}>
                {/* Acciones rápidas */}
                <p style={s.label}>Acciones rápidas</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                    <button onClick={onNuevoPedido}
                        style={{ backgroundColor: '#fff', border: '2px solid #16a34a', borderRadius: '14px', padding: '18px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#16a34a' }}>
                        <div style={{ width: '44px', height: '44px', backgroundColor: '#f0fdf4', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Plus size={22} color="#16a34a" />
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>Nuevo pedido</span>
                        <span style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>Tomar pedido a un cliente</span>
                    </button>

                    <button onClick={onVerClientes}
                        style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '18px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '44px', height: '44px', backgroundColor: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Users size={22} color="#3b82f6" />
                        </div>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937' }}>Mis clientes</span>
                        <span style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center' }}>Ver ficha y estado de cuenta</span>
                    </button>
                </div>

                {/* Pedidos recientes */}
                <p style={s.label}>Mis pedidos recientes</p>
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ padding: '28px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    ) : pedidosRecientes.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center' }}>
                            <ShoppingCart size={32} color="#d1d5db" style={{ marginBottom: '8px' }} />
                            <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>Aún no has tomado pedidos</p>
                        </div>
                    ) : pedidosRecientes.map(p => {
                        const total = (p.pedido_items || []).reduce((s, i) => s + Number(i.subtotal || 0), 0)
                        const est = ESTADOS_PEDIDO[p.estado] || ESTADOS_PEDIDO.pendiente
                        return (
                            <div key={p.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: '0 0 2px' }}>{p.clientes?.nombre}</p>
                                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 4px', fontFamily: 'monospace' }}>{p.numero_pedido}</p>
                                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{fmtFecha(p.fecha_pedido)}</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>{fmt(total)}</p>
                                    <span style={{ backgroundColor: est.bg, color: est.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>
                                        {est.label}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// PANTALLA 2: LISTA DE CLIENTES
// ══════════════════════════════════════════════════════════════
function ListaClientes({ onVerFicha, onNuevoPedido, onVolver }) {
    const { perfil } = useAuth()
    const [clientes, setClientes] = useState([])
    const [busq, setBusq] = useState('')
    const [loading, setLoading] = useState(true)
    const [clientesConDeuda, setClientesConDeuda] = useState(new Set())

    useEffect(() => {
        const cacheKey = `mipos_clientes_${perfil.empresa_id}`
        const cached = cacheGet(cacheKey)
        if (cached) { setClientes(cached); setLoading(false) }

        Promise.all([
            supabase.from('clientes')
                .select('id, nombre, rif, descripcion, condicion_pago, dias_credito, telefono, limite_credito')
                .eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('ventas')
                .select('cliente_id')
                .eq('empresa_id', perfil.empresa_id)
                .in('estado_cobro', ['pendiente', 'parcial'])
        ]).then(([{ data: clientesData }, { data: ventasData }]) => {
            if (clientesData) { setClientes(clientesData); cacheSet(cacheKey, clientesData) }
            if (ventasData) setClientesConDeuda(new Set(ventasData.map(v => v.cliente_id)))
            setLoading(false)
        }).catch(() => setLoading(false))
    }, [])

    const filtrados = clientes.filter(c => {
        const q = busq.toLowerCase()
        return c.nombre.toLowerCase().includes(q) ||
            c.rif?.toLowerCase().includes(q) ||
            c.descripcion?.toLowerCase().includes(q)
    })

    return (
        <div style={s.container}>
            <div style={s.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                        <ChevronLeft size={22} />
                    </button>
                    <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Clientes</h1>
                </div>
                <div style={{ position: 'relative' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input autoFocus type="text" placeholder="Buscar por nombre o RIF..."
                        value={busq} onChange={e => setBusq(e.target.value)}
                        style={{ ...s.input, paddingLeft: '42px', fontSize: '15px' }} />
                </div>
            </div>

            <div style={{ padding: '12px 16px' }}>
                {loading ? (
                    <p style={{ textAlign: 'center', color: '#9ca3af', padding: '40px 0', fontSize: '14px' }}>Cargando clientes...</p>
                ) : (
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        {filtrados.length === 0 ? (
                            <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                                {busq ? 'Sin resultados' : 'Escribe para buscar'}
                            </div>
                        ) : filtrados.map(c => (
                            <div key={c.id}
                                style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                onTouchStart={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                onTouchEnd={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <div style={{ flex: 1 }} onClick={() => onVerFicha(c)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                        <p style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{c.nombre}</p>
                                        {c.descripcion && <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 400 }}>— {c.descripcion}</span>}
                                        {clientesConDeuda.has(c.id) && (
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block', flexShrink: 0 }} />
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {c.rif && <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{c.rif}</span>}
                                        <span style={{
                                            fontSize: '10px', fontWeight: 500, padding: '1px 6px', borderRadius: '8px',
                                            backgroundColor: c.condicion_pago === 'credito' ? '#dbeafe' : '#f0fdf4',
                                            color: c.condicion_pago === 'credito' ? '#1e40af' : '#166534'
                                        }}>
                                            {c.condicion_pago === 'credito' ? `Crédito ${c.dias_credito}d` : 'Contado'}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <button onClick={() => onNuevoPedido(c)}
                                        style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#16a34a', fontWeight: 600 }}>
                                        <Plus size={13} /> Pedido
                                    </button>
                                    <button onClick={() => onVerFicha(c)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '4px' }}>
                                        <ChevronRight size={20} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

const TIPOS_VISITA = {
    presencial: 'Presencial',
    llamada: 'Llamada',
    whatsapp: 'WhatsApp',
}
const RESULTADOS_VISITA = {
    pedido_tomado: { label: 'Pedido tomado', bg: '#dcfce7', color: '#166534' },
    sin_pedido: { label: 'Sin pedido', bg: '#f3f4f6', color: '#6b7280' },
    cliente_ausente: { label: 'Ausente', bg: '#fef9c3', color: '#854d0e' },
    cerrado: { label: 'Cerrado', bg: '#fee2e2', color: '#991b1b' },
}

// ══════════════════════════════════════════════════════════════
// PANTALLA 3: FICHA DEL CLIENTE
// ══════════════════════════════════════════════════════════════
const VISITAS_PAGE = 10

function FichaCliente({ cliente, onNuevoPedido, onVolver }) {
    const { perfil } = useAuth()
    const [tabActiva, setTabActiva] = useState('resumen')
    const [datos, setDatos] = useState(null)
    const [loading, setLoading] = useState(true)
    const [modalVisita, setModalVisita] = useState(false)
    const [visitaForm, setVisitaForm] = useState({ tipo: 'presencial', resultado: 'sin_pedido', notas: '' })
    const [guardandoVisita, setGuardandoVisita] = useState(false)
    const [pedidoDetalle, setPedidoDetalle] = useState(null)
    const [paginaVisitas, setPaginaVisitas] = useState(0)
    const [totalVisitas, setTotalVisitas] = useState(0)

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        const [
            { data: ventas },
            { data: cobrosData },
            { data: pedidos },
            { data: config },
            { data: visitasData },
            { count: visitasTotal },
        ] = await Promise.all([
            supabase.from('ventas')
                .select('id, numero_factura, fecha_venta, total, pago_usd, pago_bs, tasa_cambio, estado_cobro, fecha_vencimiento_pago')
                .eq('cliente_id', cliente.id)
                .eq('empresa_id', perfil.empresa_id)
                .in('estado_cobro', ['pendiente', 'parcial'])
                .order('fecha_vencimiento_pago', { ascending: true }),

            supabase.from('cobros')
                .select('id, fecha_cobro, monto_usd, monto_bs, tasa_cambio, tipo_tasa, ventas!inner(cliente_id)')
                .eq('ventas.cliente_id', cliente.id)
                .eq('empresa_id', perfil.empresa_id)
                .order('fecha_cobro', { ascending: false })
                .limit(5),

            supabase.from('pedidos')
                .select('id, numero_pedido, fecha_pedido, estado, pedido_items(producto_id, nombre_producto, cantidad, precio_unitario, descuento_item, subtotal)')
                .eq('cliente_id', cliente.id)
                .eq('empresa_id', perfil.empresa_id)
                .order('fecha_pedido', { ascending: false })
                .limit(10),

            supabase.from('configuracion')
                .select('tasa_bcv')
                .eq('empresa_id', perfil.empresa_id)
                .single(),

            supabase.from('visitas_comerciales')
                .select('id, fecha_visita, tipo, resultado, notas')
                .eq('cliente_id', cliente.id)
                .eq('empresa_id', perfil.empresa_id)
                .order('fecha_visita', { ascending: false })
                .range(0, VISITAS_PAGE - 1),

            supabase.from('visitas_comerciales')
                .select('*', { count: 'exact', head: true })
                .eq('cliente_id', cliente.id)
                .eq('empresa_id', perfil.empresa_id),
        ])

        setPaginaVisitas(0)
        setTotalVisitas(visitasTotal || 0)

        const ventasConSaldo = (ventas || []).map(v => {
            const pagadoUsd = Number(v.pago_usd || 0)
            const pagadoBsEnUsd = v.tasa_cambio ? Number(v.pago_bs || 0) / Number(v.tasa_cambio) : 0
            const saldo_pendiente = Math.max(0, Number(v.total) - pagadoUsd - pagadoBsEnUsd)
            return { ...v, saldo_pendiente }
        })

        setDatos({
            cxc: ventasConSaldo,
            cobros: cobrosData || [],
            pedidos: pedidos || [],
            tasa: config?.tasa_bcv || null,
            visitas: visitasData || [],
        })
        setLoading(false)
    }

    async function cargarVisitas(pag) {
        const { data } = await supabase.from('visitas_comerciales')
            .select('id, fecha_visita, tipo, resultado, notas')
            .eq('cliente_id', cliente.id)
            .eq('empresa_id', perfil.empresa_id)
            .order('fecha_visita', { ascending: false })
            .range(pag * VISITAS_PAGE, (pag + 1) * VISITAS_PAGE - 1)
        if (data) setDatos(prev => ({ ...prev, visitas: data }))
    }

    async function guardarVisita() {
        setGuardandoVisita(true)
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase.from('visitas_comerciales').insert({
            empresa_id: perfil.empresa_id,
            vendedor_id: user.id,
            cliente_id: cliente.id,
            fecha_visita: new Date().toISOString(),
            tipo: visitaForm.tipo,
            resultado: visitaForm.resultado,
            notas: visitaForm.notas.trim() || null,
        })
        setGuardandoVisita(false)
        if (!error) {
            setModalVisita(false)
            setVisitaForm({ tipo: 'presencial', resultado: 'sin_pedido', notas: '' })
            setTotalVisitas(t => t + 1)
            setPaginaVisitas(0)
            cargarVisitas(0)
        }
    }

    const totalCxC = datos?.cxc?.reduce((s, v) => s + Number(v.saldo_pendiente || 0), 0) || 0
    const hoy = new Date()
    const facturasVencidas = datos?.cxc?.filter(v => v.fecha_vencimiento_pago && new Date(v.fecha_vencimiento_pago) < hoy) || []
    const montoVencido = facturasVencidas.reduce((s, v) => s + Number(v.saldo_pendiente || 0), 0)
    const ultimoPedido = datos?.pedidos?.[0]

    const TABS = [
        { key: 'resumen', label: 'Resumen' },
        { key: 'cxc', label: `CxC${datos?.cxc?.length ? ` (${datos.cxc.length})` : ''}` },
        { key: 'pedidos', label: 'Pedidos' },
        { key: 'visitas', label: `Visitas${totalVisitas > 0 ? ` (${totalVisitas})` : ''}` },
    ]

    return (
        <div style={s.container}>
            {/* Header */}
            <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb', padding: '16px', position: 'sticky', top: 0, zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                        <ChevronLeft size={22} />
                    </button>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0, lineHeight: 1.2 }}>{cliente.nombre}</h1>
                        {cliente.rif && <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>{cliente.rif}</p>}
                    </div>
                    <button onClick={() => onNuevoPedido()}
                        style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                        <Plus size={14} /> Pedido
                    </button>
                </div>

                {/* Alerta saldo vencido */}
                {!loading && montoVencido > 0 && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '10px 12px', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                        <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626', margin: 0 }}>Tiene {facturasVencidas.length} factura(s) vencida(s)</p>
                            <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>Monto vencido: {fmt(montoVencido)}</p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f3f4f6', borderRadius: '10px', padding: '3px' }}>
                    {TABS.map(t => (
                        <button key={t.key} onClick={() => setTabActiva(t.key)}
                            style={{ flex: 1, padding: '8px 2px', fontSize: '11px', fontWeight: 500, border: 'none', cursor: 'pointer', borderRadius: '8px', transition: 'all 0.15s',
                                backgroundColor: tabActiva === t.key ? '#fff' : 'transparent',
                                color: tabActiva === t.key ? '#1f2937' : '#6b7280',
                                boxShadow: tabActiva === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                            }}>
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando ficha...</div>
            ) : (
                <div style={{ padding: '16px' }}>
                    {/* ── TAB RESUMEN ── */}
                    {tabActiva === 'resumen' && (
                        <>
                            {/* Semáforo financiero */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: `2px solid ${montoVencido > 0 ? '#fecaca' : '#e5e7eb'}`, padding: '14px' }}>
                                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 6px' }}>Saldo total CxC</p>
                                    <p style={{ fontSize: '20px', fontWeight: 800, color: totalCxC > 0 ? '#dc2626' : '#16a34a', margin: '0 0 2px' }}>{fmt(totalCxC)}</p>
                                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{datos.cxc.length} factura(s) pendiente(s)</p>
                                </div>
                                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: `2px solid ${montoVencido > 0 ? '#fecaca' : '#e5e7eb'}`, padding: '14px' }}>
                                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', margin: '0 0 6px' }}>Monto vencido</p>
                                    <p style={{ fontSize: '20px', fontWeight: 800, color: montoVencido > 0 ? '#dc2626' : '#16a34a', margin: '0 0 2px' }}>{fmt(montoVencido)}</p>
                                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{facturasVencidas.length} factura(s) vencida(s)</p>
                                </div>
                            </div>

                            {/* Uso de crédito — solo si es cliente a crédito con límite definido */}
                            {cliente.condicion_pago === 'credito' && cliente.limite_credito > 0 && (() => {
                                const limite = Number(cliente.limite_credito)
                                const usado = totalCxC
                                const disponible = Math.max(0, limite - usado)
                                const pct = Math.min(100, (usado / limite) * 100)
                                const barColor = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a'
                                const agotado = disponible <= 0
                                return (
                                    <div style={{ ...s.card, marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <p style={s.label}>Límite de crédito</p>
                                            <span style={{ fontSize: '12px', fontWeight: 600, color: barColor }}>{pct.toFixed(0)}% usado</span>
                                        </div>
                                        <div style={{ height: '8px', backgroundColor: '#f3f4f6', borderRadius: '4px', marginBottom: '10px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: '4px', transition: 'width 0.3s' }} />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                            {[
                                                { label: 'Límite total', value: fmt(limite), color: '#1f2937' },
                                                { label: 'Usado', value: fmt(usado), color: usado > 0 ? '#dc2626' : '#6b7280' },
                                                { label: 'Disponible', value: fmt(disponible), color: agotado ? '#dc2626' : '#16a34a' },
                                            ].map(({ label, value, color }) => (
                                                <div key={label} style={{ textAlign: 'center' }}>
                                                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 2px' }}>{label}</p>
                                                    <p style={{ fontSize: '13px', fontWeight: 700, color, margin: 0 }}>{value}</p>
                                                </div>
                                            ))}
                                        </div>
                                        {agotado && (
                                            <div style={{ marginTop: '10px', backgroundColor: '#fef2f2', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#dc2626', fontWeight: 600, textAlign: 'center' }}>
                                                Crédito agotado — solo contado
                                            </div>
                                        )}
                                    </div>
                                )
                            })()}

                            {/* Info del cliente */}
                            <div style={{ ...s.card }}>
                                <p style={s.label}>Datos del cliente</p>
                                {[
                                    { icon: Building2, label: 'Condición de pago', value: cliente.condicion_pago === 'credito' ? `Crédito a ${cliente.dias_credito} días` : 'Contado' },
                                    { icon: Phone, label: 'Teléfono', value: cliente.telefono || 'No registrado' },
                                ].map(({ icon: Icon, label, value }) => (
                                    <div key={label} style={{ display: 'flex', gap: '12px', alignItems: 'center', paddingBottom: '12px', marginBottom: '12px', borderBottom: '1px solid #f3f4f6' }}>
                                        <div style={{ width: '36px', height: '36px', backgroundColor: '#f3f4f6', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Icon size={16} color="#6b7280" />
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 1px' }}>{label}</p>
                                            <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }}>{value}</p>
                                        </div>
                                    </div>
                                ))}

                                {/* Último pedido */}
                                {ultimoPedido && (
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                        <div style={{ width: '36px', height: '36px', backgroundColor: '#f3f4f6', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <ShoppingCart size={16} color="#6b7280" />
                                        </div>
                                        <div>
                                            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 1px' }}>Último pedido</p>
                                            <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }}>
                                                {fmtFecha(ultimoPedido.fecha_pedido)}
                                                <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 400, color: '#9ca3af' }}>
                                                    hace {diasDesde(ultimoPedido.fecha_pedido)} días
                                                </span>
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Acceso rápido a las otras tabs */}
                            {totalCxC > 0 && (
                                <button onClick={() => setTabActiva('cxc')}
                                    style={{ ...s.btnSecondary, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#374151' }}>
                                        <CreditCard size={16} color="#dc2626" /> Ver estado de cuenta detallado
                                    </span>
                                    <ArrowRight size={16} color="#9ca3af" />
                                </button>
                            )}

                            <button onClick={() => onNuevoPedido()} style={s.btnPrimary}>
                                <Plus size={18} /> Tomar pedido
                            </button>
                        </>
                    )}

                    {/* ── TAB CxC ── */}
                    {tabActiva === 'cxc' && (
                        <>
                            {/* Resumen totales */}
                            <div style={{ ...s.card, backgroundColor: totalCxC > 0 ? '#fef2f2' : '#f0fdf4', border: `1px solid ${totalCxC > 0 ? '#fecaca' : '#bbf7d0'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <p style={{ fontSize: '12px', fontWeight: 600, color: totalCxC > 0 ? '#dc2626' : '#16a34a', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Saldo pendiente total
                                        </p>
                                        <p style={{ fontSize: '26px', fontWeight: 800, color: totalCxC > 0 ? '#dc2626' : '#16a34a', margin: 0 }}>{fmt(totalCxC)}</p>
                                        {datos.tasa && <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>{fmtBs(totalCxC, datos.tasa)} @ BCV</p>}
                                    </div>
                                    {montoVencido > 0 && (
                                        <div style={{ textAlign: 'right' }}>
                                            <p style={{ fontSize: '11px', color: '#dc2626', margin: '0 0 2px', fontWeight: 600 }}>Vencido</p>
                                            <p style={{ fontSize: '18px', fontWeight: 700, color: '#dc2626', margin: 0 }}>{fmt(montoVencido)}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Lista de facturas */}
                            {datos.cxc.length === 0 ? (
                                <div style={{ ...s.card, textAlign: 'center', padding: '40px' }}>
                                    <Check size={36} color="#16a34a" style={{ marginBottom: '10px' }} />
                                    <p style={{ fontSize: '15px', fontWeight: 600, color: '#166534', margin: '0 0 4px' }}>Al día</p>
                                    <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>No tiene facturas pendientes</p>
                                </div>
                            ) : (
                                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '12px' }}>
                                    <div style={{ padding: '10px 14px', backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            {datos.cxc.length} factura(s) con saldo pendiente
                                        </p>
                                    </div>
                                    {datos.cxc.map(v => {
                                        const vencidaV = v.fecha_vencimiento_pago && new Date(v.fecha_vencimiento_pago) < hoy
                                        const diasVencidaV = vencidaV ? diasDesde(v.fecha_vencimiento_pago) : null
                                        const diasRestantesV = !vencidaV && v.fecha_vencimiento_pago
                                            ? Math.ceil((new Date(v.fecha_vencimiento_pago) - hoy) / 86400000)
                                            : null
                                        return (
                                            <div key={v.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', borderLeft: `4px solid ${vencidaV ? '#ef4444' : '#16a34a'}` }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: 0, fontFamily: 'monospace' }}>{v.numero_factura}</p>
                                                    <p style={{ fontSize: '15px', fontWeight: 700, color: vencidaV ? '#dc2626' : '#1f2937', margin: 0 }}>{fmt(v.saldo_pendiente)}</p>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                                                        Emitida: {fmtFecha(v.fecha_venta)}
                                                    </p>
                                                    {vencidaV ? (
                                                        <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}>
                                                            Vencida hace {diasVencidaV} días
                                                        </span>
                                                    ) : diasRestantesV !== null ? (
                                                        <span style={{ backgroundColor: diasRestantesV <= 7 ? '#fef9c3' : '#f0fdf4', color: diasRestantesV <= 7 ? '#854d0e' : '#166534', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600 }}>
                                                            Vence en {diasRestantesV} días
                                                        </span>
                                                    ) : (
                                                        <span style={{ backgroundColor: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: '8px', fontSize: '11px' }}>
                                                            Contado
                                                        </span>
                                                    )}
                                                </div>
                                                {datos.tasa && (
                                                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>
                                                        ≈ {fmtBs(v.saldo_pendiente, datos.tasa)} @ BCV
                                                    </p>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                            {/* Cobros recientes */}
                            {datos.cobros.length > 0 && (
                                <>
                                    <p style={{ ...s.label, marginTop: '4px' }}>Últimos cobros registrados</p>
                                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                        {datos.cobros.map(c => {
                                            const montoTotal = Number(c.monto_usd || 0) + (c.monto_bs && c.tasa_cambio ? Number(c.monto_bs) / Number(c.tasa_cambio) : 0)
                                            return (
                                                <div key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <p style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937', margin: '0 0 2px' }}>Cobro recibido</p>
                                                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{fmtFecha(c.fecha_cobro)}</p>
                                                    </div>
                                                    <p style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a', margin: 0 }}>{fmt(montoTotal)}</p>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* ── TAB PEDIDOS ── */}
                    {tabActiva === 'pedidos' && (
                        <>
                            {datos.pedidos.length === 0 ? (
                                <div style={{ ...s.card, textAlign: 'center', padding: '40px' }}>
                                    <ShoppingCart size={36} color="#d1d5db" style={{ marginBottom: '10px' }} />
                                    <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>Sin pedidos registrados</p>
                                </div>
                            ) : (
                                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '12px' }}>
                                    {datos.pedidos.map(p => {
                                        const total = (p.pedido_items || []).reduce((s, i) => s + Number(i.subtotal || 0), 0)
                                        const est = ESTADOS_PEDIDO[p.estado] || ESTADOS_PEDIDO.pendiente
                                        return (
                                            <div key={p.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937', margin: '0 0 2px', fontFamily: 'monospace' }}>{p.numero_pedido}</p>
                                                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>{fmtFecha(p.fecha_pedido)}</p>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <p style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>{fmt(total)}</p>
                                                    <span style={{ backgroundColor: est.bg, color: est.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 500 }}>
                                                        {est.label}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                                    <button onClick={() => setPedidoDetalle(p)}
                                                        style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#2563eb', fontWeight: 600 }}>
                                                        <Eye size={12} /> Ver
                                                    </button>
                                                    <button onClick={() => onNuevoPedido(p.pedido_items)}
                                                        style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#16a34a', fontWeight: 600 }}>
                                                        <RotateCcw size={12} /> Repetir
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                            <button onClick={() => onNuevoPedido()} style={s.btnPrimary}>
                                <Plus size={18} /> Tomar nuevo pedido
                            </button>
                        </>
                    )}

                    {/* ── TAB VISITAS ── */}
                    {tabActiva === 'visitas' && (
                        <>
                            <button onClick={() => setModalVisita(true)} style={{ ...s.btnPrimary, marginBottom: '12px' }}>
                                <MapPin size={18} /> Registrar visita
                            </button>
                            {datos.visitas.length === 0 ? (
                                <div style={{ ...s.card, textAlign: 'center', padding: '40px' }}>
                                    <MapPin size={36} color="#d1d5db" style={{ marginBottom: '10px' }} />
                                    <p style={{ fontSize: '14px', color: '#9ca3af', margin: 0 }}>Sin visitas registradas</p>
                                </div>
                            ) : (
                                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                    {datos.visitas.map(v => {
                                        const res = RESULTADOS_VISITA[v.resultado] || RESULTADOS_VISITA.sin_pedido
                                        return (
                                            <div key={v.id} style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: v.notas ? '6px' : 0 }}>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                                                            {TIPOS_VISITA[v.tipo] || v.tipo}
                                                        </span>
                                                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', backgroundColor: res.bg, color: res.color }}>
                                                            {res.label}
                                                        </span>
                                                    </div>
                                                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{fmtFecha(v.fecha_visita)}</p>
                                                </div>
                                                {v.notas && (
                                                    <p style={{ fontSize: '12px', color: '#6b7280', margin: 0, fontStyle: 'italic' }}>"{v.notas}"</p>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                            {totalVisitas > VISITAS_PAGE && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', marginTop: '8px' }}>
                                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                                        {paginaVisitas * VISITAS_PAGE + 1}–{Math.min((paginaVisitas + 1) * VISITAS_PAGE, totalVisitas)} de {totalVisitas}
                                    </span>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button
                                            onClick={() => { const p = paginaVisitas - 1; setPaginaVisitas(p); cargarVisitas(p) }}
                                            disabled={paginaVisitas === 0}
                                            style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: paginaVisitas === 0 ? '#d1d5db' : '#374151' }}>
                                            ←
                                        </button>
                                        <button
                                            onClick={() => { const p = paginaVisitas + 1; setPaginaVisitas(p); cargarVisitas(p) }}
                                            disabled={(paginaVisitas + 1) * VISITAS_PAGE >= totalVisitas}
                                            style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: (paginaVisitas + 1) * VISITAS_PAGE >= totalVisitas ? '#d1d5db' : '#374151' }}>
                                            →
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* ── MODAL DETALLE PEDIDO ── */}
            {pedidoDetalle && (() => {
                const est = ESTADOS_PEDIDO[pedidoDetalle.estado] || ESTADOS_PEDIDO.pendiente
                const items = pedidoDetalle.pedido_items || []
                const total = items.reduce((s, i) => s + Number(i.subtotal || 0), 0)
                return (
                    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                        onClick={e => { if (e.target === e.currentTarget) setPedidoDetalle(null) }}>
                        <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '480px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                            {/* Header */}
                            <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <p style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px', fontFamily: 'monospace' }}>{pedidoDetalle.numero_pedido}</p>
                                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{fmtFecha(pedidoDetalle.fecha_pedido)}</p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ backgroundColor: est.bg, color: est.color, padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 600 }}>{est.label}</span>
                                        <button onClick={() => setPedidoDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
                                            <X size={22} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {/* Items */}
                            <div style={{ overflowY: 'auto', flex: 1, padding: '12px 20px' }}>
                                {items.length === 0 ? (
                                    <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: '14px', padding: '24px 0' }}>Sin ítems</p>
                                ) : items.map((item, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                                        <div style={{ flex: 1, paddingRight: '12px' }}>
                                            <p style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: '0 0 2px' }}>{item.nombre_producto}</p>
                                            <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                                                {item.cantidad} × {fmt(item.precio_unitario)}
                                                {Number(item.descuento_item) > 0 && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>−{item.descuento_item}%</span>}
                                            </p>
                                        </div>
                                        <p style={{ fontSize: '14px', fontWeight: 700, color: '#1f2937', margin: 0, flexShrink: 0 }}>{fmt(item.subtotal)}</p>
                                    </div>
                                ))}
                            </div>
                            {/* Footer total */}
                            <div style={{ padding: '16px 20px 32px', borderTop: '1px solid #e5e7eb', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <span style={{ fontSize: '15px', fontWeight: 600, color: '#6b7280' }}>Total</span>
                                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#1f2937' }}>{fmt(total)}</span>
                                </div>
                                <button onClick={() => { setPedidoDetalle(null); onNuevoPedido(items) }}
                                    style={{ ...s.btnPrimary }}>
                                    <RotateCcw size={16} /> Repetir este pedido
                                </button>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* ── MODAL REGISTRAR VISITA ── */}
            {modalVisita && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) setModalVisita(false) }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '24px 20px 36px', width: '100%', maxWidth: '480px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Registrar visita</h2>
                            <button onClick={() => setModalVisita(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
                                <X size={22} />
                            </button>
                        </div>

                        <label style={s.label}>Tipo de contacto</label>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                            {Object.entries(TIPOS_VISITA).map(([key, label]) => (
                                <button key={key} onClick={() => setVisitaForm(f => ({ ...f, tipo: key }))}
                                    style={{ flex: 1, padding: '10px 6px', borderRadius: '10px', border: `2px solid ${visitaForm.tipo === key ? '#16a34a' : '#e5e7eb'}`, backgroundColor: visitaForm.tipo === key ? '#f0fdf4' : '#fff', color: visitaForm.tipo === key ? '#16a34a' : '#6b7280', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        <label style={s.label}>Resultado</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '20px' }}>
                            {Object.entries(RESULTADOS_VISITA).map(([key, { label }]) => (
                                <button key={key} onClick={() => setVisitaForm(f => ({ ...f, resultado: key }))}
                                    style={{ padding: '10px', borderRadius: '10px', border: `2px solid ${visitaForm.resultado === key ? '#16a34a' : '#e5e7eb'}`, backgroundColor: visitaForm.resultado === key ? '#f0fdf4' : '#fff', color: visitaForm.resultado === key ? '#16a34a' : '#6b7280', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                                    {label}
                                </button>
                            ))}
                        </div>

                        <label style={s.label}>Notas <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(opcional)</span></label>
                        <textarea value={visitaForm.notas} onChange={e => setVisitaForm(f => ({ ...f, notas: e.target.value }))}
                            rows={3} placeholder="Observaciones de la visita..."
                            style={{ ...s.input, resize: 'none', fontFamily: 'inherit', marginBottom: '20px' }} />

                        <button onClick={guardarVisita} disabled={guardandoVisita}
                            style={{ ...s.btnPrimary, opacity: guardandoVisita ? 0.7 : 1 }}>
                            <Check size={18} /> {guardandoVisita ? 'Guardando...' : 'Guardar visita'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// PANTALLA 4: FLUJO DE PEDIDO (igual al original, refactorizado)
// ══════════════════════════════════════════════════════════════
function FlujoPedido({ clienteInicial, itemsIniciales, onPedidoCreado, onCancelar }) {
    const { perfil } = useAuth()
    const [paso, setPaso] = useState(clienteInicial ? 2 : 1)

    // Paso 1 — Cliente
    const [clientes, setClientes] = useState([])
    const [busqCliente, setBusqCliente] = useState('')
    const [clienteSel, setClienteSel] = useState(clienteInicial || null)
    const [direcciones, setDirecciones] = useState([])
    const [direccionId, setDireccionId] = useState('')
    const [cxcVencido, setCxcVencido] = useState(0)
    const [ultimaCompra, setUltimaCompra] = useState({})

    // Paso 2 — Productos
    const [listas, setListas] = useState([])
    const [listaId, setListaId] = useState('')
    const [listasClienteIds, setListasClienteIds] = useState(null) // null = sin restricción
    const [listaClienteDefaultId, setListaClienteDefaultId] = useState(null)
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

    async function cargarDatosCliente(clienteId) {
        const [{ data: dirs }, { data: ventas }, { data: ultimosPedidos }, { data: listasCli }] = await Promise.all([
            supabase.from('direcciones_entrega')
                .select('*').eq('cliente_id', clienteId).eq('empresa_id', perfil.empresa_id)
                .eq('activo', true).order('es_principal', { ascending: false }).order('nombre'),
            supabase.from('ventas')
                .select('total, pago_usd, pago_bs, tasa_cambio, fecha_vencimiento_pago')
                .eq('cliente_id', clienteId).eq('empresa_id', perfil.empresa_id)
                .in('estado_cobro', ['pendiente', 'parcial']),
            supabase.from('pedidos')
                .select('fecha_pedido, pedido_items(producto_id, cantidad)')
                .eq('cliente_id', clienteId).eq('empresa_id', perfil.empresa_id)
                .order('fecha_pedido', { ascending: false }).limit(1),
            supabase.from('cliente_listas_precio')
                .select('lista_precio_id, es_default')
                .eq('cliente_id', clienteId).eq('empresa_id', perfil.empresa_id)
        ])
        if (dirs) {
            setDirecciones(dirs)
            const p = dirs.find(d => d.es_principal)
            if (p) setDireccionId(p.id)
            else if (dirs.length === 1) setDireccionId(dirs[0].id)
        } else setDirecciones([])
        if (ventas) {
            const hoy = new Date()
            const vencido = ventas
                .filter(v => v.fecha_vencimiento_pago && new Date(v.fecha_vencimiento_pago) < hoy)
                .reduce((sum, v) => {
                    const pagadoUsd = Number(v.pago_usd || 0)
                    const pagadoBsEnUsd = v.tasa_cambio ? Number(v.pago_bs || 0) / Number(v.tasa_cambio) : 0
                    return sum + Math.max(0, Number(v.total) - pagadoUsd - pagadoBsEnUsd)
                }, 0)
            setCxcVencido(vencido)
        }
        if (ultimosPedidos?.[0]?.pedido_items) {
            const map = {}
            ultimosPedidos[0].pedido_items.forEach(i => {
                map[i.producto_id] = { cantidad: i.cantidad, fecha: ultimosPedidos[0].fecha_pedido }
            })
            setUltimaCompra(map)
        }
        if (listasCli && listasCli.length > 0) {
            setListasClienteIds(new Set(listasCli.map(l => l.lista_precio_id)))
            const def = listasCli.find(l => l.es_default)
            setListaClienteDefaultId(def?.lista_precio_id || listasCli[0].lista_precio_id)
        } else {
            setListasClienteIds(null)
            setListaClienteDefaultId(null)
        }
    }

    useEffect(() => {
        const cacheClientes = `mipos_clientes_${perfil.empresa_id}`
        const cachedClientes = cacheGet(cacheClientes)
        if (cachedClientes) setClientes(cachedClientes)

        supabase.from('clientes')
            .select('id, nombre, rif, descripcion, condicion_pago, dias_credito, limite_credito')
            .eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => { if (data) { setClientes(data); cacheSet(cacheClientes, data) } })

        const cacheListas = `mipos_listas_${perfil.empresa_id}`
        const cachedListas = cacheGet(cacheListas)
        if (cachedListas) {
            setListas(cachedListas)
            const def = cachedListas.find(l => l.es_default)
            if (def) setListaId(def.id)
            else if (cachedListas.length > 0) setListaId(cachedListas[0].id)
        }

        supabase.from('listas_precio')
            .select('id, nombre, es_default')
            .eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => {
                if (data) {
                    setListas(data)
                    cacheSet(cacheListas, data)
                    if (!listaId) {
                        const def = data.find(l => l.es_default)
                        if (def) setListaId(def.id)
                        else if (data.length > 0) setListaId(data[0].id)
                    }
                }
            })

        if (clienteInicial) cargarDatosCliente(clienteInicial.id)
    }, [])

    // Auto-seleccionar lista default del cliente cuando cambia
    useEffect(() => {
        if (!listaClienteDefaultId) return
        const existe = listas.find(l => l.id === listaClienteDefaultId)
        if (existe) setListaId(listaClienteDefaultId)
    }, [listaClienteDefaultId, listas])

    const itemsPreloaded = useRef(false)

    useEffect(() => {
        if (!listaId) return
        const cacheKey = `mipos_productos_${perfil.empresa_id}_${listaId}`

        function aplicarProductos(prods) {
            setProductos(prods)
            if (itemsIniciales && !itemsPreloaded.current) {
                const preloaded = itemsIniciales
                    .map(ii => { const prod = prods.find(p => p.id === ii.producto_id); if (!prod) return null; return { ...prod, cantidad: ii.cantidad, descuento_item: String(ii.descuento_item || '') } })
                    .filter(Boolean)
                if (preloaded.length > 0) { setItems(preloaded); itemsPreloaded.current = true }
            }
        }

        const cached = cacheGet(cacheKey)
        if (cached) aplicarProductos(cached)

        supabase.from('producto_precios')
            .select('precio, productos_terminados(id, nombre, sku, unidad_medida, stock_actual, aplica_iva, unidad_venta_2, factor_conversion_2)')
            .eq('lista_id', listaId).eq('empresa_id', perfil.empresa_id)
            .then(({ data }) => {
                if (data) {
                    const prods = data.filter(p => p.productos_terminados).map(p => ({
                        id: p.productos_terminados.id,
                        nombre: p.productos_terminados.nombre,
                        sku: p.productos_terminados.sku,
                        unidad_medida: p.productos_terminados.unidad_medida,
                        precio: Number(p.precio),
                        stock: Number(p.productos_terminados.stock_actual || 0),
                        aplica_iva: p.productos_terminados.aplica_iva ?? true,
                        unidad_venta_2: p.productos_terminados.unidad_venta_2 || null,
                        factor_conversion_2: p.productos_terminados.factor_conversion_2 || null,
                    }))
                    cacheSet(cacheKey, prods)
                    aplicarProductos(prods)
                }
            })
    }, [listaId])

    async function seleccionarCliente(c) {
        setClienteSel(c); setBusqCliente(''); setDireccionId('')
        setCxcVencido(0); setUltimaCompra({})
        await cargarDatosCliente(c.id)
    }

    const clientesFiltrados = clientes.filter(c => {
        const q = busqCliente.toLowerCase()
        return c.nombre.toLowerCase().includes(q) ||
            c.rif?.toLowerCase().includes(q) ||
            c.descripcion?.toLowerCase().includes(q)
    })
    const productosFiltrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqProducto.toLowerCase()) ||
        p.sku?.toLowerCase().includes(busqProducto.toLowerCase())
    )

    function semaforo(stock) {
        if (stock <= 0) return { color: '#dc2626', bg: '#fee2e2', label: 'Sin stock' }
        if (stock < 10) return { color: '#d97706', bg: '#fef3c7', label: 'Poco stock' }
        return { color: '#16a34a', bg: '#dcfce7', label: 'Disponible' }
    }

    function agregarProducto(prod) {
        setItems(prev => {
            const existe = prev.find(i => i.id === prod.id)
            if (existe) return prev.map(i => i.id === prod.id ? { ...i, cantidad: i.cantidad + 1 } : i)
            return [...prev, { ...prod, cantidad: 1, descuento_item: '', unidadVenta: '1', precioBase: prod.precio }]
        })
        setBusqProducto('')
    }

    function cambiarUnidad(id) {
        setItems(prev => prev.map(i => {
            if (i.id !== id || !i.unidad_venta_2) return i
            const nueva = i.unidadVenta === '1' ? '2' : '1'
            const factor = i.factor_conversion_2 || 1
            return { ...i, unidadVenta: nueva, precio: nueva === '2' ? i.precioBase * factor : i.precioBase }
        }))
    }

    function cambiarCantidad(id, delta) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad: Math.max(1, i.cantidad + delta) } : i))
    }

    function setCantidadDirecta(id, valor) {
        const n = parseInt(valor)
        if (isNaN(n) || n < 1) return
        setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad: n } : i))
    }

    function setDescItem(id, desc) {
        setItems(prev => prev.map(i => i.id === id ? { ...i, descuento_item: desc } : i))
    }

    function eliminarItem(id) { setItems(prev => prev.filter(i => i.id !== id)) }

    const totalConDescItems = items.reduce((s, i) => s + i.cantidad * i.precio * (1 - Number(i.descuento_item || 0) / 100), 0)
    const total = totalConDescItems * (1 - Number(descuentoGlobal || 0) / 100)
    const subtotal = items.reduce((s, i) => {
        const linea = i.cantidad * i.precio * (1 - Number(i.descuento_item || 0) / 100) * (1 - Number(descuentoGlobal || 0) / 100)
        return s + ((i.aplica_iva ?? true) ? linea / 1.16 : linea)
    }, 0)
    const iva = total - subtotal

    async function guardar() {
        setGuardando(true); setError('')

        if (!navigator.onLine) {
            const tempId = `TEMP-${Date.now()}`
            const pedidoOffline = {
                tempId,
                empresa_id: perfil.empresa_id,
                cliente_id: clienteSel.id,
                lista_precio_id: listaId || null,
                descuento_global: Number(descuentoGlobal) || 0,
                origen: 'campo',
                fecha_pedido: new Date().toISOString(),
                fecha_entrega: fechaEntrega || null,
                notas: notas.trim() || null,
                direccion_entrega_id: direccionId || null,
                direccion_entrega_texto: direccionId ? direcciones.find(d => d.id === direccionId)?.direccion || null : null,
                items: items.map(i => ({
                    producto_id: i.id, nombre_producto: i.nombre, cantidad: i.cantidad,
                    precio_unitario: (i.aplica_iva ?? true) ? i.precio / 1.16 : i.precio, descuento_item: Number(i.descuento_item) || 0,
                    subtotal: i.cantidad * i.precio * (1 - Number(i.descuento_item || 0) / 100),
                    unidad_venta: i.unidadVenta === '2' ? i.unidad_venta_2 : (i.unidad_medida || 'unidad'),
                    cantidad_primaria: i.unidadVenta === '2' ? i.cantidad * (i.factor_conversion_2 || 1) : i.cantidad,
                })),
            }
            savePendingQueue([...getPendingQueue(), pedidoOffline])
            setGuardando(false)
            setPedidoCreado({ numero_pedido: tempId, offline: true })
            return
        }

        const { data: { user } } = await supabase.auth.getUser()
        const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_pedidos_numero', { p_empresa_id: perfil.empresa_id })
        const numero = numeroConsecutivo || 'PED-000001'

        const { data: pedido, error: errPedido } = await supabase.from('pedidos').insert({
            empresa_id: perfil.empresa_id,
            cliente_id: clienteSel.id,
            vendedor_id: user.id,
            lista_precio_id: listaId || null,
            descuento_global: Number(descuentoGlobal) || 0,
            estado: 'pendiente',
            origen: 'campo',
            fecha_pedido: new Date().toISOString(),
            fecha_entrega: fechaEntrega || null,
            notas: notas.trim() || null,
            numero_pedido: numero,
            direccion_entrega_id: direccionId || null,
            direccion_entrega_texto: direccionId ? direcciones.find(d => d.id === direccionId)?.direccion || null : null,
        }).select().single()

        if (errPedido) { setError('Error: ' + errPedido.message); setGuardando(false); return }

        await supabase.from('pedido_items').insert(
            items.map(i => ({
                pedido_id: pedido.id, empresa_id: perfil.empresa_id,
                producto_id: i.id, nombre_producto: i.nombre,
                cantidad: i.cantidad, precio_unitario: (i.aplica_iva ?? true) ? i.precio / 1.16 : i.precio,
                descuento_item: Number(i.descuento_item) || 0,
                subtotal: i.cantidad * i.precio * (1 - Number(i.descuento_item || 0) / 100),
                unidad_venta: i.unidadVenta === '2' ? i.unidad_venta_2 : (i.unidad_medida || 'unidad'),
                cantidad_primaria: i.unidadVenta === '2' ? i.cantidad * (i.factor_conversion_2 || 1) : i.cantidad,
            }))
        )
        setGuardando(false); setPedidoCreado(pedido)
    }

    const pasoTotal = clienteInicial ? 2 : 3
    const pasoActual = clienteInicial ? paso - 1 : paso

    // ── ÉXITO ──
    if (pedidoCreado) return (
        <div style={{ ...s.container, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 24px', minHeight: '100vh' }}>
            <div style={{ width: '72px', height: '72px', backgroundColor: pedidoCreado.offline ? '#fef3c7' : '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                {pedidoCreado.offline ? <Clock size={36} color="#d97706" /> : <Check size={36} color="#16a34a" />}
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', margin: '0 0 8px', textAlign: 'center' }}>
                {pedidoCreado.offline ? '¡Pedido guardado!' : '¡Pedido enviado!'}
            </h2>
            <p style={{ fontSize: '15px', color: '#6b7280', margin: '0 0 6px', textAlign: 'center' }}>
                {pedidoCreado.offline ? 'Guardado localmente' : pedidoCreado.numero_pedido}
            </p>
            <p style={{ fontSize: '13px', color: '#9ca3af', margin: '0 0 32px', textAlign: 'center' }}>
                {pedidoCreado.offline
                    ? 'Se enviará automáticamente cuando recuperes la conexión'
                    : 'El pedido está pendiente de aprobación en la oficina'}
            </p>
            <button onClick={onPedidoCreado} style={{ ...s.btnPrimary, maxWidth: '280px' }}>
                <Check size={18} /> Volver al inicio
            </button>
        </div>
    )

    // ── PASO 1: CLIENTE ──
    if (paso === 1) return (
        <div style={s.container}>
            <div style={s.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                        <X size={20} />
                    </button>
                    <div>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Paso 1 de {pasoTotal}</p>
                        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Seleccionar cliente</h1>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {Array.from({ length: pasoTotal }, (_, i) => (
                        <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: (i + 1) <= pasoActual ? '#16a34a' : '#e5e7eb' }} />
                    ))}
                </div>
            </div>

            <div style={{ padding: '16px' }}>
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" placeholder="Buscar cliente por nombre o RIF..."
                        value={busqCliente} onChange={e => setBusqCliente(e.target.value)}
                        style={{ ...s.input, paddingLeft: '42px' }} autoFocus />
                </div>

                {clienteSel && (
                    <div style={{ backgroundColor: '#f0fdf4', border: '2px solid #16a34a', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: direcciones.length > 0 ? '12px' : 0 }}>
                            <div>
                                <p style={{ fontSize: '16px', fontWeight: 700, color: '#166534', margin: '0 0 2px' }}>{clienteSel.nombre}</p>
                                {clienteSel.rif && <p style={{ fontSize: '12px', color: '#16a34a', margin: '0 0 4px', fontFamily: 'monospace' }}>{clienteSel.rif}</p>}
                                <p style={{ fontSize: '12px', color: '#16a34a', margin: 0 }}>
                                    {clienteSel.condicion_pago === 'credito' ? `Crédito ${clienteSel.dias_credito} días` : 'Contado'}
                                </p>
                            </div>
                            <button onClick={() => { setClienteSel(null); setDirecciones([]); setDireccionId('') }}
                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', color: '#6b7280', cursor: 'pointer' }}>
                                Cambiar
                            </button>
                        </div>
                        {direcciones.length > 1 && (
                            <div>
                                <p style={{ fontSize: '12px', fontWeight: 600, color: '#166534', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dirección de entrega</p>
                                <select value={direccionId} onChange={e => setDireccionId(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #bbf7d0', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff', color: '#374151' }}>
                                    <option value="">— Sin dirección específica —</option>
                                    {direcciones.map(d => <option key={d.id} value={d.id}>{d.nombre}{d.es_principal ? ' ★' : ''} — {d.direccion}</option>)}
                                </select>
                            </div>
                        )}
                        {direcciones.length === 1 && (
                            <div style={{ backgroundColor: '#dcfce7', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#166534' }}>
                                📍 {direcciones[0].nombre} — {direcciones[0].direccion}
                            </div>
                        )}
                    </div>
                )}

                {!clienteSel && (
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        {clientesFiltrados.length === 0 ? (
                            <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                                {busqCliente ? 'Sin resultados' : 'Escribe para buscar'}
                            </div>
                        ) : clientesFiltrados.slice(0, 15).map(c => (
                            <div key={c.id} onClick={() => seleccionarCliente(c)}
                                style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                onTouchStart={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                onTouchEnd={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <div>
                                    <p style={{ fontSize: '15px', fontWeight: 500, color: '#1f2937', margin: '0 0 2px' }}>
                                        {c.nombre}
                                        {c.descripcion && <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 400, marginLeft: '6px' }}>— {c.descripcion}</span>}
                                    </p>
                                    {c.rif && <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{c.rif}</p>}
                                </div>
                                <ChevronRight size={16} color="#d1d5db" />
                            </div>
                        ))}
                    </div>
                )}
            </div>

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
                    <button onClick={() => clienteInicial ? onCancelar() : setPaso(1)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                        <ChevronLeft size={20} />
                    </button>
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Paso {pasoActual} de {pasoTotal} · {clienteSel.nombre}</p>
                        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Agregar productos</h1>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                    {Array.from({ length: pasoTotal }, (_, i) => (
                        <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: (i + 1) <= pasoActual ? '#16a34a' : '#e5e7eb' }} />
                    ))}
                </div>
                <select value={listaId} onChange={e => setListaId(e.target.value)}
                    style={{ ...s.input, fontSize: '14px', padding: '10px 12px' }}>
                    {(listasClienteIds ? listas.filter(l => listasClienteIds.has(l.id)) : listas)
                        .map(l => <option key={l.id} value={l.id}>{l.nombre}{l.es_default ? ' (default)' : ''}</option>)}
                </select>
            </div>

            <div style={{ padding: '16px' }}>
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" placeholder="Buscar producto por nombre o código..."
                        value={busqProducto} onChange={e => setBusqProducto(e.target.value)}
                        style={{ ...s.input, paddingLeft: '42px' }} />
                </div>

                {busqProducto && (
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '16px' }}>
                        {productosFiltrados.length === 0 ? (
                            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Sin resultados</div>
                        ) : productosFiltrados.slice(0, 8).map(p => {
                            const sem = semaforo(p.stock)
                            const uc = ultimaCompra[p.id]
                            return (
                                <div key={p.id} onClick={() => agregarProducto(p)}
                                    style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}
                                    onTouchStart={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                    onTouchEnd={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: '0 0 4px' }}>{p.nombre}</p>
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            {p.sku && <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.sku}</span>}
                                            <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '8px', backgroundColor: sem.bg, color: sem.color }}>{sem.label}</span>
                                            {uc && <span style={{ fontSize: '10px', color: '#9ca3af' }}>última: {uc.cantidad} u · {diasDesde(uc.fecha)}d</span>}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <p style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a', margin: 0 }}>{fmt(p.precio)}</p>
                                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{p.unidad_medida}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}

                {items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9ca3af' }}>
                        <Package size={40} style={{ marginBottom: '12px', opacity: 0.4 }} />
                        <p style={{ fontSize: '14px', margin: 0 }}>Busca y agrega productos al pedido</p>
                    </div>
                ) : items.map(item => (
                    <div key={item.id} style={s.card}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div style={{ flex: 1 }}>
                                <p style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: '0 0 2px' }}>{item.nombre}</p>
                                <p style={{ fontSize: '13px', color: '#16a34a', margin: 0, fontWeight: 500 }}>{fmt(item.precio)} / {item.unidadVenta === '2' ? item.unidad_venta_2 : item.unidad_medida}</p>
                            </div>
                            <button onClick={() => eliminarItem(item.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', marginLeft: '8px' }}>
                                <Trash2 size={18} />
                            </button>
                        </div>
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
                            {item.unidad_venta_2 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <button onClick={() => item.unidadVenta !== '1' && cambiarUnidad(item.id)}
                                        style={{ padding: '5px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '8px', border: '1px solid', cursor: item.unidadVenta !== '1' ? 'pointer' : 'default', backgroundColor: item.unidadVenta === '1' ? '#16a34a' : '#f9fafb', color: item.unidadVenta === '1' ? '#fff' : '#6b7280', borderColor: item.unidadVenta === '1' ? '#16a34a' : '#d1d5db', whiteSpace: 'nowrap' }}>
                                        {item.unidad_medida}
                                    </button>
                                    <button onClick={() => item.unidadVenta !== '2' && cambiarUnidad(item.id)}
                                        style={{ padding: '5px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '8px', border: '1px solid', cursor: item.unidadVenta !== '2' ? 'pointer' : 'default', backgroundColor: item.unidadVenta === '2' ? '#16a34a' : '#f9fafb', color: item.unidadVenta === '2' ? '#fff' : '#6b7280', borderColor: item.unidadVenta === '2' ? '#16a34a' : '#d1d5db', whiteSpace: 'nowrap' }}>
                                        {item.unidad_venta_2}
                                    </button>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>Desc. item %:</span>
                            <input type="number" min="0" max="100" step="0.1"
                                value={item.descuento_item} onChange={e => setDescItem(item.id, e.target.value)}
                                placeholder="0"
                                style={{ width: '80px', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', textAlign: 'center' }} />
                        </div>
                        <div style={{ marginTop: '10px', textAlign: 'right' }}>
                            <span style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937' }}>
                                {fmt(item.cantidad * item.precio * (1 - Number(item.descuento_item || 0) / 100))}
                            </span>
                        </div>
                    </div>
                ))}

                {items.length > 0 && (
                    <div style={{ ...s.card, backgroundColor: '#f9fafb' }}>
                        <label style={s.label}>Descuento global al pedido %</label>
                        <input type="number" min="0" max="100" step="0.1"
                            value={descuentoGlobal} onChange={e => setDescuentoGlobal(e.target.value)}
                            placeholder="0"
                            style={{ width: '120px', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '16px', fontWeight: 600, textAlign: 'center' }} />
                    </div>
                )}
            </div>

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
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Paso {pasoTotal} de {pasoTotal}</p>
                        <h1 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Confirmar pedido</h1>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                    {Array.from({ length: pasoTotal }, (_, i) => (
                        <div key={i} style={{ flex: 1, height: '4px', borderRadius: '2px', backgroundColor: '#16a34a' }} />
                    ))}
                </div>
            </div>

            <div style={{ padding: '16px' }}>
                <div style={s.card}>
                    <label style={s.label}>Cliente</label>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937', margin: '0 0 2px' }}>{clienteSel.nombre}</p>
                    {clienteSel.rif && <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0, fontFamily: 'monospace' }}>{clienteSel.rif}</p>}
                    {direcciones.length > 1 && (
                        <div style={{ marginTop: '10px' }}>
                            <p style={{ fontSize: '12px', fontWeight: 600, color: '#374151', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dirección de entrega</p>
                            <select value={direccionId} onChange={e => setDireccionId(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff', color: '#374151' }}>
                                <option value="">— Sin dirección específica —</option>
                                {direcciones.map(d => <option key={d.id} value={d.id}>{d.nombre}{d.es_principal ? ' ★' : ''} — {d.direccion}</option>)}
                            </select>
                        </div>
                    )}
                    {direcciones.length === 1 && (
                        <div style={{ marginTop: '8px', backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: '#166534' }}>
                            📍 {direcciones[0].nombre} — {direcciones[0].direccion}
                        </div>
                    )}
                </div>

                {cxcVencido > 0 && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                        <AlertCircle size={20} color="#dc2626" style={{ flexShrink: 0 }} />
                        <div>
                            <p style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', margin: '0 0 2px' }}>Cliente con deuda vencida</p>
                            <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>{fmt(cxcVencido)} pendientes de cobro</p>
                        </div>
                    </div>
                )}
                {clienteSel?.condicion_pago === 'credito' && clienteSel?.limite_credito > 0 && (() => {
                    const disponible = Math.max(0, Number(clienteSel.limite_credito) - cxcVencido)
                    const excede = total > disponible
                    if (!excede) return null
                    return (
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 16px', display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                            <AlertCircle size={20} color="#dc2626" style={{ flexShrink: 0 }} />
                            <div>
                                <p style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', margin: '0 0 2px' }}>Este pedido excede el crédito disponible</p>
                                <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>Disponible: {fmt(disponible)} · Pedido: {fmt(total)}</p>
                            </div>
                        </div>
                    )
                })()}

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
                                {fmt(item.cantidad * item.precio * (1 - Number(item.descuento_item || 0) / 100))}
                            </span>
                        </div>
                    ))}
                    <div style={{ marginTop: '8px' }}>
                        {descuentoGlobal > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#16a34a', marginBottom: '4px' }}>
                                <span>Descuento global ({descuentoGlobal}%)</span>
                                <span>-{fmt(totalConDescItems - totalConIVA)}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
                            <span>Subtotal (sin IVA)</span><span>{fmt(subtotal)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>
                            <span>IVA (16%)</span><span>{fmt(iva)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#1f2937', paddingTop: '8px', borderTop: '2px solid #e5e7eb' }}>
                            <span>Total</span><span style={{ color: '#16a34a' }}>{fmt(total)}</span>
                        </div>
                    </div>
                </div>

                <div style={s.card}>
                    <label style={s.label}>Fecha de entrega prometida</label>
                    <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)}
                        style={s.input} min={new Date().toISOString().split('T')[0]} />
                </div>

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
