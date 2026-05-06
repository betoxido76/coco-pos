import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Search, Trash2, CheckCircle, FileText, RotateCcw, AlertTriangle, ClipboardList, ChevronRight, Edit } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

function semaforo(stock) {
    if (stock <= 0) return { color: '#dc2626', bg: '#fef2f2', label: 'Sin stock' }
    if (stock < 10) return { color: '#d97706', bg: '#fffbeb', label: `${stock} uds.` }
    return { color: '#16a34a', bg: '#f0fdf4', label: `${stock} uds.` }
}

const METODOS_USD = ['Efectivo', 'Zelle', 'Transferencia USD', 'Otros']
const METODOS_BS = ['Pago Móvil', 'Transferencia', 'Punto de Venta', 'Efectivo Bs.']
const OPCIONES_TASA = [
    { key: 'tasa_bcv', label: 'USD · BCV' },
    { key: 'tasa_euro', label: 'EUR · BCV' },
    { key: 'tasa_binance', label: 'USD · Binance' },
]

// ─── Componente principal ──────────────────────────────────────
const PAGE_SIZE = 50

export default function Ventas() {
    const { perfil } = useAuth()
    const [tabActiva, setTabActiva] = useState('ventas')
    const [vista, setVista] = useState('lista')
    const [ventas, setVentas] = useState([])
    const [ventaActual, setVentaActual] = useState(null)
    const [loading, setLoading] = useState(true)
    const [pedidosAprobados, setPedidosAprobados] = useState([])
    const [loadingPedidos, setLoadingPedidos] = useState(false)
    const [pedidoActual, setPedidoActual] = useState(null)
    const [pagina, setPagina] = useState(0)
    const [totalVentas, setTotalVentas] = useState(0)

    useEffect(() => { cargarVentas() }, [pagina])
    useEffect(() => { if (tabActiva === 'pedidos') cargarPedidosAprobados() }, [tabActiva])

    async function cargarVentas() {
        setLoading(true)
        const { data, count } = await supabase
            .from('ventas')
            .select(`*, clientes(nombre), devoluciones(id)`, { count: 'exact' })
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })
            .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1)
        if (data) setVentas(data)
        if (count !== null) setTotalVentas(count)
        setLoading(false)
    }

    async function cargarPedidosAprobados() {
        setLoadingPedidos(true)
        const { data } = await supabase
            .from('pedidos')
            .select('*, clientes(nombre, rif), usuarios(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('estado', 'aprobado')
            .order('created_at', { ascending: false })
        if (data) setPedidosAprobados(data)
        setLoadingPedidos(false)
    }

    function abrirFactura(venta) {
        setVentaActual(venta)
        setVista('factura')
    }

    if (vista === 'nueva')
        return <NuevaVenta
            onVentaCreada={(v) => { cargarVentas(); setVentaActual(v); setVista('factura') }}
            onCancelar={() => setVista('lista')}
        />

    if (vista === 'factura')
        return <Factura
            venta={ventaActual}
            onVolver={() => { cargarVentas(); setVista('lista') }}
            onDevolucionCreada={() => { cargarVentas(); setVista('lista') }}
        />

    if (vista === 'facturar_pedido' && pedidoActual)
        return <FacturarPedido
            pedido={pedidoActual}
            onFacturado={() => { cargarVentas(); cargarPedidosAprobados(); setVista('lista'); setTabActiva('ventas') }}
            onCancelar={() => setVista('lista')}
        />

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Ventas</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Historial de notas y pedidos por registrar</p>
                </div>
                {tabActiva === 'ventas' && (
                    <button onClick={() => setVista('nueva')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={16} /> Nueva venta
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <button onClick={() => setTabActiva('ventas')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                        border: '1px solid', cursor: 'pointer',
                        borderColor: tabActiva === 'ventas' ? '#16a34a' : '#e5e7eb',
                        backgroundColor: tabActiva === 'ventas' ? '#f0fdf4' : '#fff',
                        color: tabActiva === 'ventas' ? '#16a34a' : '#6b7280',
                    }}>
                    <FileText size={14} /> Notas de Entrega
                </button>
                <button onClick={() => setTabActiva('pedidos')}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                        border: '1px solid', cursor: 'pointer',
                        borderColor: tabActiva === 'pedidos' ? '#16a34a' : '#e5e7eb',
                        backgroundColor: tabActiva === 'pedidos' ? '#f0fdf4' : '#fff',
                        color: tabActiva === 'pedidos' ? '#16a34a' : '#6b7280',
                    }}>
                    <ClipboardList size={14} /> Pedidos por registrar
                    {pedidosAprobados.length > 0 && (
                        <span style={{ backgroundColor: '#16a34a', color: '#fff', borderRadius: '20px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 }}>
                            {pedidosAprobados.length}
                        </span>
                    )}
                </button>
            </div>

            {/* Tab Ventas */}
            {tabActiva === 'ventas' && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    ) : ventas.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay ventas registradas.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['Nota de Entrega', 'Referencia', 'Cliente', 'Fecha', 'Total', 'Estado', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '10px 16px', textAlign: i === 4 ? 'right' : 'left', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {ventas.map(v => (
                                    <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {v.numero_factura}
                                                {v.devoluciones?.length > 0 && (
                                                    <span style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: '20px', fontFamily: 'sans-serif' }}>
                                                        Con devolución
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: v.nro_referencia ? '#374151' : '#d1d5db' }}>
                                            {v.nro_referencia || '—'}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{v.clientes?.nombre || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{new Date(v.fecha_venta || v.created_at).toLocaleDateString('es-VE')}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(v.total)}</td>
                                        <td style={{ padding: '12px 16px' }}><BadgeCobro estado={v.estado_cobro} /></td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <button onClick={() => abrirFactura(v)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                <FileText size={13} /> Ver
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {totalVentas > PAGE_SIZE && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                Mostrando {pagina * PAGE_SIZE + 1}–{Math.min((pagina + 1) * PAGE_SIZE, totalVentas)} de {totalVentas}
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setPagina(p => p - 1)} disabled={pagina === 0}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: pagina === 0 ? '#d1d5db' : '#374151', cursor: pagina === 0 ? 'default' : 'pointer' }}>
                                    ← Anterior
                                </button>
                                <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * PAGE_SIZE >= totalVentas}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: (pagina + 1) * PAGE_SIZE >= totalVentas ? '#d1d5db' : '#374151', cursor: (pagina + 1) * PAGE_SIZE >= totalVentas ? 'default' : 'pointer' }}>
                                    Siguiente →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Tab Pedidos por facturar */}
            {tabActiva === 'pedidos' && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    {loadingPedidos ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    ) : pedidosAprobados.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay pedidos aprobados pendientes de facturar</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['Pedido', 'Cliente', 'Vendedor', 'Entrega', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {pedidosAprobados.map(p => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{p.numero_pedido || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
                                            {p.clientes?.nombre || '—'}
                                            {p.clientes?.rif && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.clientes.rif}</div>}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.usuarios?.nombre || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                                            {p.fecha_entrega ? new Date(p.fecha_entrega + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <button onClick={() => { setPedidoActual(p); setVista('facturar_pedido') }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                                <ChevronRight size={13} /> Registrar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Facturar desde pedido ─────────────────────────────────────
function FacturarPedido({ pedido, onFacturado, onCancelar }) {
    const { perfil } = useAuth()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [procesando, setProcesando] = useState(false)
    const [error, setError] = useState('')
    const [nroReferencia, setNroReferencia] = useState('')
    const [condicion, setCondicion] = useState('credito')
    const [tasas, setTasas] = useState({})
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [pagoUsd, setPagoUsd] = useState('')
    const [metodoUsd, setMetodoUsd] = useState('Efectivo')
    const [pagoBs, setPagoBs] = useState('')
    const [metodoBs, setMetodoBs] = useState('Pago Móvil')
    const [notaCobro, setNotaCobro] = useState('')
    const [diasCredito, setDiasCredito] = useState(0)
    const [cuentasBancarias, setCuentasBancarias] = useState([])
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')

    useEffect(() => {
        supabase.from('pedido_items')
            .select('*, productos_terminados(nombre, sku, stock_actual)')
            .eq('pedido_id', pedido.id)
            .then(({ data }) => { if (data) setItems(data); setLoading(false) })
        supabase.from('clientes').select('condicion_pago, dias_credito').eq('id', pedido.cliente_id).single()
            .then(({ data }) => {
                if (data) {
                    setCondicion(data.condicion_pago || 'credito')
                    setDiasCredito(Number(data.dias_credito) || 0)
                }
            })
        supabase.from('configuracion').select('clave, valor').eq('empresa_id', perfil.empresa_id)
            .then(({ data }) => { if (data) { const t = {}; data.forEach(r => { t[r.clave] = Number(r.valor) }); setTasas(t) } })
        supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda').eq('empresa_id', perfil.empresa_id).eq('activa', true)
            .then(({ data }) => setCuentasBancarias(data || []))
    }, [pedido.id])

    const descGlobal = Number(pedido.descuento_global || 0)
    const totalConDescItems = items.reduce((s, i) => s + Number(i.cantidad) * Number(i.precio_unitario) * (1 - Number(i.descuento_item || 0) / 100), 0)
    const totalConIVA = totalConDescItems * (1 - descGlobal / 100)
    const subtotal = totalConIVA / 1.16
    const iva = totalConIVA - subtotal
    const total = totalConIVA

    async function facturar() {
        setProcesando(true); setError('')
        const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_ventas_numero', {
            p_empresa_id: perfil.empresa_id
        })
        const numero = numeroConsecutivo || 'NE-000001'
        const { data: { user } } = await supabase.auth.getUser()

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
                subtotal,
                total,
                estado_cobro: condicion === 'contado' ? 'pagado' : 'pendiente',
                empresa_id: perfil.empresa_id,
                nro_referencia: nroReferencia.trim() || null,
                fecha_vencimiento_pago: fechaVencimiento,
            })
            .select().single()

        if (errVenta) { setError('Error: ' + errVenta.message); setProcesando(false); return }

        await supabase.from('venta_items').insert(
            items.map(i => ({
                venta_id: venta.id,
                producto_id: i.producto_id,
                cantidad: i.cantidad,
                precio_unitario: Number(i.precio_unitario) * (1 - Number(i.descuento_item || 0) / 100) * (1 - descGlobal / 100),
                empresa_id: perfil.empresa_id,
            }))
        )

        if (condicion === 'contado') {
            const tasa = tasas[tipoTasa] || 1
            await supabase.from('cobros').insert({
                venta_id: venta.id,
                monto_usd: Number(pagoUsd) || 0,
                monto_bs: Number(pagoBs) || 0,
                tasa_cambio: tasa,
                tipo_tasa: tipoTasa,
                metodo_usd: Number(pagoUsd) > 0 ? metodoUsd : null,
                metodo_bs: Number(pagoBs) > 0 ? metodoBs : null,
                nota: notaCobro || null,
                cuenta_bancaria_id: cuentaBancariaId || null,
                usuario_id: user.id,
                empresa_id: perfil.empresa_id,
            })
        }

        for (const item of items) {
            const prod = item.productos_terminados
            if (prod) {
                const nuevoStock = prod.stock_actual - Number(item.cantidad)
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
                    cantidad: Number(item.cantidad),
                    stock_actual: nuevoStock,
                    origen: 'pedido_facturado',
                    fecha: new Date().toISOString()
                })
            }
        }

        await supabase.from('pedidos')
            .update({ estado: 'facturado', venta_id: venta.id })
            .eq('id', pedido.id)

        setProcesando(false)
        onFacturado()
    }

    return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Registrar pedido {pedido.numero_pedido}</h1>
            </div>

            {/* Info */}
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

            {pedido.notas && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', color: '#d97706', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas del vendedor</p>
                    <p style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>{pedido.notas}</p>
                </div>
            )}

            {/* Items */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                {loading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Cargando items...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Producto', 'Cant.', 'Precio', 'Desc.', 'Subtotal'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i > 0 ? 'right' : 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => {
                                const subtotal = Number(item.cantidad) * Number(item.precio_unitario) * (1 - Number(item.descuento_item || 0) / 100)
                                return (
                                    <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
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
                {descGlobal > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#16a34a', marginBottom: '6px' }}>
                        <span>Descuento global ({descGlobal}%)</span>
                        <span>-{fmt(subtotalConDescItems - subtotalFinal)}</span>
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>
                    <span>IVA (16%)</span><span>{fmt(iva)}</span>
                </div>
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

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                    N° de referencia <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                </label>
                <input
                    type="text"
                    value={nroReferencia}
                    onChange={e => setNroReferencia(e.target.value)}
                    placeholder="Ej: REF-001, NP-2024..."
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }}
                />
            </div>

            {/* Condición de pago */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '20px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '10px' }}>Condición de pago</label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: condicion === 'contado' ? '14px' : '0' }}>
                    {['contado', 'credito'].map(c => (
                        <button key={c} onClick={() => setCondicion(c)}
                            style={{
                                flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                border: '1px solid', cursor: 'pointer',
                                borderColor: condicion === c ? '#16a34a' : '#e5e7eb',
                                backgroundColor: condicion === c ? '#f0fdf4' : '#fff',
                                color: condicion === c ? '#166534' : '#6b7280',
                            }}>
                            {c === 'contado' ? 'Contado' : 'Crédito'}
                        </button>
                    ))}
                </div>
                {condicion === 'contado' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Tasa de cambio</label>
                            <select value={tipoTasa} onChange={e => setTipoTasa(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }}>
                                {OPCIONES_TASA.map(o => (
                                    <option key={o.key} value={o.key}>{o.label}{tasas[o.key] ? ` (${tasas[o.key]})` : ''}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Monto USD</label>
                                <input type="number" min="0" step="0.01" value={pagoUsd} onChange={e => setPagoUsd(e.target.value)} placeholder="0.00"
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Método USD</label>
                                <select value={metodoUsd} onChange={e => setMetodoUsd(e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '12px', color: '#374151', backgroundColor: '#fff' }}>
                                    {METODOS_USD.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Monto Bs.</label>
                                <input type="number" min="0" step="0.01" value={pagoBs} onChange={e => setPagoBs(e.target.value)} placeholder="0.00"
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Método Bs.</label>
                                <select value={metodoBs} onChange={e => setMetodoBs(e.target.value)}
                                    style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '12px', color: '#374151', backgroundColor: '#fff' }}>
                                    {METODOS_BS.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Nota <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
                            <input type="text" value={notaCobro} onChange={e => setNotaCobro(e.target.value)} placeholder="Ej: Efectivo recibido en caja..."
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                        </div>
                        {cuentasBancarias.length > 0 && (
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Cuenta bancaria <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
                                <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }}>
                                    <option value="">— Efectivo / sin cuenta —</option>
                                    {cuentasBancarias
                                        .filter(c => Number(pagoUsd) > 0 && Number(pagoBs) > 0 ? true : Number(pagoUsd) > 0 ? c.moneda !== 'Bs' : c.moneda === 'Bs')
                                        .map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.banco} · {c.moneda})</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={facturar} disabled={procesando || loading}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: procesando ? 0.6 : 1 }}>
                    <CheckCircle size={16} /> {procesando ? 'Registrando...' : 'Confirmar y registrar'}
                </button>
                <button onClick={onCancelar}
                    style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                    Cancelar
                </button>
            </div>
        </div>
    )
}

// ─── Badge cobro ───────────────────────────────────────────────
function BadgeCobro({ estado }) {
    const estilos = {
        pendiente: { bg: '#fef9c3', color: '#854d0e' },
        parcial: { bg: '#dbeafe', color: '#1e40af' },
        pagado: { bg: '#dcfce7', color: '#166534' },
        anulado: { bg: '#fee2e2', color: '#991b1b' },
    }
    const s = estilos[estado] || estilos.pendiente
    return (
        <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>
            {estado}
        </span>
    )
}

// ─── Nueva Venta ───────────────────────────────────────────────
function NuevaVenta({ onVentaCreada, onCancelar }) {
    const { perfil } = useAuth()
    const esAutopartes = perfil?.empresas?.perfil_negocio === 'autopartes'

    const [clientes, setClientes] = useState([])
    const [productos, setProductos] = useState([])
    const [clienteId, setClienteId] = useState('')
    const [busquedaCliente, setBusquedaCliente] = useState('')
    const [direcciones, setDirecciones] = useState([])
    const [direccionId, setDireccionId] = useState('')
    const [busqueda, setBusqueda] = useState('')
    const [items, setItems] = useState([])
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    // Búsqueda avanzada (solo autopartes)
    const [modoAvanzado, setModoAvanzado] = useState(false)
    const [filtroNroParte, setFiltroNroParte] = useState('')
    const [filtroMarca, setFiltroMarca] = useState('')
    const [filtroTipo, setFiltroTipo] = useState('')
    const [filtroCat, setFiltroCat] = useState('')
    const [marcasRepuesto, setMarcasRepuesto] = useState([])
    const [tiposRepuesto, setTiposRepuesto] = useState([])
    const [categoriasRepuesto, setCategoriasRepuesto] = useState([])
    // Filtros por vehículo dentro de búsqueda avanzada
    const [marcaV, setMarcaV] = useState('')
    const [modeloV, setModeloV] = useState('')
    const [anioV, setAnioV] = useState('')
    const [marcasV, setMarcasV] = useState([])
    const [modelosV, setModelosV] = useState([])
    const [resultadosAvanzados, setResultadosAvanzados] = useState(null)
    const [buscandoAvanzado, setBuscandoAvanzado] = useState(false)
    const [nroReferencia, setNroReferencia] = useState('')
    const [condicion, setCondicion] = useState('credito')
    const [tasas, setTasas] = useState({})
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [pagoUsd, setPagoUsd] = useState('')
    const [metodoUsd, setMetodoUsd] = useState('Efectivo')
    const [pagoBs, setPagoBs] = useState('')
    const [metodoBs, setMetodoBs] = useState('Pago Móvil')
    const [notaCobro, setNotaCobro] = useState('')
    const [ventaPendiente, setVentaPendiente] = useState(null)
    const [diasCredito, setDiasCredito] = useState(0)
    const [cuentasBancarias, setCuentasBancarias] = useState([])
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')

    useEffect(() => {
        supabase.from('clientes').select('id, nombre, rif, condicion_pago, dias_credito').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setClientes(data || []))
        supabase.from('productos_terminados').select('id, nombre, sku, precio_venta, stock_actual, unidad_medida').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setProductos(data || []))
        supabase.from('configuracion').select('clave, valor').eq('empresa_id', perfil.empresa_id)
            .then(({ data }) => { if (data) { const t = {}; data.forEach(r => { t[r.clave] = Number(r.valor) }); setTasas(t) } })
        supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda').eq('empresa_id', perfil.empresa_id).eq('activa', true)
            .then(({ data }) => setCuentasBancarias(data || []))
        if (esAutopartes) {
            supabase.from('productos_autopartes').select('marca').eq('empresa_id', perfil.empresa_id).not('marca', 'is', null)
                .then(({ data }) => setMarcasRepuesto([...new Set((data || []).map(p => p.marca).filter(Boolean))].sort()))
            supabase.from('productos_autopartes').select('tipo').eq('empresa_id', perfil.empresa_id).not('tipo', 'is', null)
                .then(({ data }) => setTiposRepuesto([...new Set((data || []).map(p => p.tipo).filter(Boolean))].sort()))
            supabase.from('productos_terminados').select('categoria_1').eq('empresa_id', perfil.empresa_id).eq('activo', true).not('categoria_1', 'is', null)
                .then(({ data }) => setCategoriasRepuesto([...new Set((data || []).map(p => p.categoria_1).filter(Boolean))].sort()))
            supabase.from('vehiculos').select('marca').eq('empresa_id', perfil.empresa_id).order('marca')
                .then(({ data }) => setMarcasV([...new Set((data || []).map(v => v.marca).filter(Boolean))].sort()))
        }
    }, [])

    useEffect(() => {
        if (!marcaV || !perfil?.empresa_id) { setModelosV([]); setModeloV(''); return }
        supabase.from('vehiculos').select('modelo')
            .eq('empresa_id', perfil.empresa_id).eq('marca', marcaV).order('modelo')
            .then(({ data }) => { setModelosV([...new Set((data || []).map(v => v.modelo))].sort()); setModeloV('') })
    }, [marcaV])

    async function seleccionarCliente(id) {
        setClienteId(id)
        setDireccionId('')
        setDirecciones([])
        if (!id) { setCondicion('credito'); return }
        const cliente = clientes.find(c => c.id === id)
        setCondicion(cliente?.condicion_pago || 'credito')
        setDiasCredito(Number(cliente?.dias_credito) || 0)
        const { data } = await supabase.from('direcciones_entrega')
            .select('*')
            .eq('cliente_id', id)
            .eq('empresa_id', perfil.empresa_id)
            .eq('activo', true)
            .order('es_principal', { ascending: false })
            .order('nombre')
        if (data) {
            setDirecciones(data)
            const principal = data.find(d => d.es_principal)
            if (principal) setDireccionId(principal.id)
            else if (data.length === 1) setDireccionId(data[0].id)
        }
    }

    async function buscarAvanzado() {
        const tieneNroParte = filtroNroParte.trim()
        const tieneAutoparteFilter = tieneNroParte || filtroMarca || filtroTipo
        const tieneVehiculoFilter = !!marcaV
        if (!tieneAutoparteFilter && !tieneVehiculoFilter && !filtroCat && !busqueda.trim()) return
        setBuscandoAvanzado(true); setResultadosAvanzados(null)

        // 1. IDs compatibles con el vehículo buscado
        let ptIds = null
        if (tieneVehiculoFilter) {
            let vQ = supabase.from('vehiculos').select('id')
                .eq('empresa_id', perfil.empresa_id).eq('marca', marcaV)
            if (modeloV) vQ = vQ.eq('modelo', modeloV)
            const { data: vData } = await vQ
            const vehiculoIds = (vData || []).map(v => v.id)
            if (vehiculoIds.length === 0) { setResultadosAvanzados([]); setBuscandoAvanzado(false); return }

            const { data: pvData } = await supabase.from('producto_vehiculo')
                .select('producto_id, año_inicio, año_fin')
                .eq('empresa_id', perfil.empresa_id)
                .in('vehiculo_id', vehiculoIds)
            let pvFiltrado = pvData || []
            if (anioV.trim()) {
                const y = Number(anioV)
                pvFiltrado = pvFiltrado.filter(pv => y >= pv.año_inicio && y <= pv.año_fin)
            }
            ptIds = [...new Set(pvFiltrado.map(pv => pv.producto_id))]
            if (ptIds.length === 0) { setResultadosAvanzados([]); setBuscandoAvanzado(false); return }
        }

        // 2. Consulta final
        if (tieneAutoparteFilter || tieneVehiculoFilter) {
            // Filtros de descripción/categoría se aplican directamente sobre el recurso embebido
            let apQ = supabase.from('productos_autopartes')
                .select('nro_parte, marca, tipo, producto_id, productos_terminados!inner(id, nombre, sku, precio_venta, stock_actual, categoria_1)')
                .eq('empresa_id', perfil.empresa_id)
                .eq('productos_terminados.activo', true)
            if (tieneNroParte) apQ = apQ.ilike('nro_parte', `%${tieneNroParte}%`)
            if (filtroMarca) apQ = apQ.eq('marca', filtroMarca)
            if (filtroTipo) apQ = apQ.eq('tipo', filtroTipo)
            if (ptIds !== null) apQ = apQ.in('producto_id', ptIds)
            if (filtroCat) apQ = apQ.eq('productos_terminados.categoria_1', filtroCat)
            if (busqueda.trim()) apQ = apQ.or(
                `nombre.ilike.%${busqueda.trim()}%,sku.ilike.%${busqueda.trim()}%,descripcion.ilike.%${busqueda.trim()}%`,
                { referencedTable: 'productos_terminados' }
            )
            const { data, error: err } = await apQ
            if (err) { setBuscandoAvanzado(false); return }
            setResultadosAvanzados((data || []).map(r => ({
                producto_id: r.producto_id, nro_parte: r.nro_parte, marca: r.marca, tipo: r.tipo, pt: r.productos_terminados,
            })))
        } else {
            // Solo filtros de descripción/categoría — consultar PT y enriquecer con datos de autopartes
            let ptQ = supabase.from('productos_terminados')
                .select('id, nombre, sku, precio_venta, stock_actual, categoria_1')
                .eq('empresa_id', perfil.empresa_id).eq('activo', true)
            if (filtroCat) ptQ = ptQ.eq('categoria_1', filtroCat)
            if (busqueda.trim()) ptQ = ptQ.or(`nombre.ilike.%${busqueda.trim()}%,sku.ilike.%${busqueda.trim()}%,descripcion.ilike.%${busqueda.trim()}%`)
            const { data: ptData } = await ptQ
            const ids = (ptData || []).map(p => p.id)
            const apMap = {}
            if (ids.length > 0) {
                const { data: apData } = await supabase.from('productos_autopartes')
                    .select('producto_id, nro_parte, marca, tipo')
                    .eq('empresa_id', perfil.empresa_id)
                    .in('producto_id', ids)
                ;(apData || []).forEach(ap => { apMap[ap.producto_id] = ap })
            }
            setResultadosAvanzados((ptData || []).map(p => ({
                producto_id: p.id,
                nro_parte: apMap[p.id]?.nro_parte ?? null,
                marca: apMap[p.id]?.marca ?? null,
                tipo: apMap[p.id]?.tipo ?? null,
                pt: p,
            })))
        }
        setBuscandoAvanzado(false)
    }

    const productosFiltrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.sku?.toLowerCase().includes(busqueda.toLowerCase())
    )

    function agregarProducto(producto) {
        setItems(prev => {
            const existe = prev.find(i => i.producto_id === producto.id)
            if (existe) return prev.map(i => i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i)
            return [...prev, { producto_id: producto.id, nombre: producto.nombre, sku: producto.sku, cantidad: 1, precio_unitario: producto.precio_venta, precio_original: producto.precio_venta, stock: producto.stock_actual }]
        })
        setBusqueda('')
    }

    function cambiarCantidad(id, valor) {
        const n = parseInt(valor)
        if (isNaN(n) || n < 1) return
        setItems(prev => prev.map(i => i.producto_id === id ? { ...i, cantidad: n } : i))
    }

    function eliminarItem(id) {
        setItems(prev => prev.filter(i => i.producto_id !== id))
    }

    function cambiarPrecio(id, valor) {
        setItems(prev => prev.map(i => i.producto_id === id ? { ...i, precio_unitario: parseFloat(valor) || 0 } : i))
    }

    const totalConIVA = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
    const subtotal = totalConIVA / 1.16
    const impuesto = totalConIVA - subtotal
    const total = totalConIVA

    async function confirmarVenta() {
        if (!clienteId) { setError('Selecciona un cliente'); return }
        if (items.length === 0) { setError('Agrega al menos un producto'); return }
        setGuardando(true)
        setError('')

        const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_ventas_numero', {
            p_empresa_id: perfil.empresa_id
        })
        const numero = numeroConsecutivo || 'NE-000001' // Fallback por si falla
        const { data: { user } } = await supabase.auth.getUser()

        const clienteObj = clientes.find(c => c.id === clienteId)
        let fechaVencimiento = null
        if (condicion === 'credito' && diasCredito > 0) {
            const d = new Date()
            d.setDate(d.getDate() + Number(diasCredito))
            fechaVencimiento = d.toISOString().split('T')[0]
        }

        const { data: venta, error: errVenta } = await supabase
            .from('ventas')
            .insert({
                cliente_id: clienteId, usuario_id: user.id, numero_factura: numero,
                subtotal, total,
                estado_cobro: condicion === 'contado' ? 'pagado' : 'pendiente',
                empresa_id: perfil.empresa_id,
                nro_referencia: nroReferencia.trim() || null,
                fecha_vencimiento_pago: fechaVencimiento,
                direccion_entrega_id: direccionId || null,
                direccion_entrega_texto: direccionId
                    ? direcciones.find(d => d.id === direccionId)?.direccion || null
                    : null,
            })
            .select()
            .single()

        if (errVenta) { setError('Error al crear la venta: ' + errVenta.message); setGuardando(false); return }

        await supabase.from('venta_items').insert(
            items.map(i => ({ venta_id: venta.id, producto_id: i.producto_id, cantidad: i.cantidad, precio_unitario: i.precio_unitario, empresa_id: perfil.empresa_id }))
        )

        if (condicion === 'contado') {
            const tasa = tasas[tipoTasa] || 1
            await supabase.from('cobros').insert({
                venta_id: venta.id,
                monto_usd: Number(pagoUsd) || 0,
                monto_bs: Number(pagoBs) || 0,
                tasa_cambio: tasa,
                tipo_tasa: tipoTasa,
                metodo_usd: Number(pagoUsd) > 0 ? metodoUsd : null,
                metodo_bs: Number(pagoBs) > 0 ? metodoBs : null,
                nota: notaCobro || null,
                cuenta_bancaria_id: cuentaBancariaId || null,
                usuario_id: user.id,
                empresa_id: perfil.empresa_id,
            })
        }

        for (const item of items) {
            const prod = productos.find(p => p.id === item.producto_id)
            const nuevoStock = prod.stock_actual - item.cantidad
            await supabase.from('productos_terminados')
                .update({ stock_actual: prod.stock_actual - item.cantidad })
                .eq('id', item.producto_id)

            await supabase.from('movimientos_inventario').insert({
                empresa_id: perfil.empresa_id,
                tipo_item: 'producto_terminado',
                item_id: item.producto_id,
                item_nombre: item.nombre,
                item_codigo: item.sku,
                tipo_movimiento: 'salida',
                cantidad: item.cantidad,
                stock_actual: nuevoStock,
                origen: 'venta',
                fecha: new Date().toISOString()
            })
        }

        const cambiados = items.filter(i => Number(i.precio_unitario) !== Number(i.precio_original))
        if (cambiados.length > 0) {
            setVentaPendiente({ ventaObj: { ...venta, clientes: { nombre: clientes.find(c => c.id === clienteId)?.nombre }, items }, cambiados })
            setGuardando(false)
            return
        }
        onVentaCreada({ ...venta, clientes: { nombre: clientes.find(c => c.id === clienteId)?.nombre }, items })
    }

    async function aplicarActualizacionPrecios(actualizar) {
        if (actualizar) {
            for (const item of ventaPendiente.cambiados) {
                await supabase.from('productos_terminados')
                    .update({ precio_venta: item.precio_unitario })
                    .eq('id', item.producto_id)
                    .eq('empresa_id', perfil.empresa_id)
            }
        }
        const datos = ventaPendiente.ventaObj
        setVentaPendiente(null)
        onVentaCreada(datos)
    }

    const clienteSeleccionado = clientes.find(c => c.id === clienteId) || null
    const clientesFiltrados = !clienteId && busquedaCliente.trim()
        ? clientes.filter(c =>
            c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
            (c.rif || '').toLowerCase().includes(busquedaCliente.toLowerCase())
          ).slice(0, 20)
        : []

    function elegirCliente(c) {
        setBusquedaCliente('')
        seleccionarCliente(c.id)
    }

    function limpiarCliente() {
        setBusquedaCliente('')
        seleccionarCliente('')
    }

    return (
        <div style={{ padding: '24px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Nueva venta</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Cliente</label>
                        <div style={{ position: 'relative' }}>
                            {clienteSeleccionado ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #16a34a', borderRadius: '8px', backgroundColor: '#f0fdf4' }}>
                                    <div style={{ flex: 1, fontSize: '14px', color: '#1f2937' }}>
                                        <span style={{ fontFamily: 'monospace', color: '#6b7280', fontSize: '13px' }}>{clienteSeleccionado.rif}</span>
                                        <span style={{ margin: '0 6px', color: '#9ca3af' }}>·</span>
                                        <span style={{ fontWeight: 500 }}>{clienteSeleccionado.nombre}</span>
                                    </div>
                                    <button onClick={limpiarCliente}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '16px', lineHeight: 1, padding: '0 2px' }}
                                        title="Cambiar cliente">×</button>
                                </div>
                            ) : (
                                <>
                                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', zIndex: 1 }} />
                                    <input
                                        value={busquedaCliente}
                                        onChange={e => setBusquedaCliente(e.target.value)}
                                        placeholder="Buscar por RIF o nombre..."
                                        style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', boxSizing: 'border-box' }} />
                                    {clientesFiltrados.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginTop: '4px', maxHeight: '220px', overflowY: 'auto' }}>
                                            {clientesFiltrados.map(c => (
                                                <div key={c.id} onClick={() => elegirCliente(c)}
                                                    style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <span style={{ fontFamily: 'monospace', color: '#6b7280', marginRight: '8px' }}>{c.rif || '—'}</span>
                                                    <span style={{ fontWeight: 500, color: '#1f2937' }}>{c.nombre}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Selector de dirección */}
                        {direcciones.length > 1 && (
                            <div style={{ marginTop: '12px' }}>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Dirección de entrega</label>
                                <select value={direccionId} onChange={e => setDireccionId(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff' }}>
                                    <option value="">— Sin dirección específica —</option>
                                    {direcciones.map(d => (
                                        <option key={d.id} value={d.id}>
                                            {d.nombre}{d.es_principal ? ' ★' : ''} — {d.direccion}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {direcciones.length === 1 && (
                            <div style={{ marginTop: '10px', backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#166534' }}>
                                📍 {direcciones[0].nombre} — {direcciones[0].direccion}
                            </div>
                        )}
                    </div>

                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Agregar productos</label>
                            {esAutopartes && (
                                <button onClick={() => { setModoAvanzado(m => !m); setResultadosAvanzados(null); setBusqueda('') }}
                                    style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid', cursor: 'pointer',
                                        borderColor: modoAvanzado ? '#1d4ed8' : '#d1d5db',
                                        backgroundColor: modoAvanzado ? '#eff6ff' : '#f9fafb',
                                        color: modoAvanzado ? '#1d4ed8' : '#6b7280', fontWeight: 500 }}>
                                    {modoAvanzado ? 'Búsqueda simple' : 'Búsqueda avanzada'}
                                </button>
                            )}
                        </div>

                        {!modoAvanzado ? (
                            <>
                                <div style={{ position: 'relative' }}>
                                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                    <input type="text" placeholder="Buscar por nombre o código..." value={busqueda}
                                        onChange={e => setBusqueda(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                                {busqueda && (
                                    <div style={{ marginTop: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                                        {productosFiltrados.length === 0
                                            ? <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>Sin resultados</div>
                                            : productosFiltrados.map(p => (
                                                <div key={p.id} onClick={() => agregarProducto(p)}
                                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <div>
                                                        <span style={{ fontWeight: 500, color: '#1f2937' }}>{p.nombre}</span>
                                                        <span style={{ color: '#9ca3af', marginLeft: '8px', fontFamily: 'monospace', fontSize: '11px' }}>{p.sku}</span>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontWeight: 600, color: '#16a34a' }}>{fmt(p.precio_venta)}</div>
                                                        <div style={{ fontSize: '11px', color: '#9ca3af' }}>Stock: {p.stock_actual}</div>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            /* ── Panel de búsqueda avanzada (autopartes) ── */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {/* Filtros de repuesto: N° parte, Marca, Tipo, Categoría */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '3px' }}>N° de parte</label>
                                        <input value={filtroNroParte} onChange={e => setFiltroNroParte(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && buscarAvanzado()}
                                            placeholder="Ej: 0001-234..."
                                            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '3px' }}>Marca repuesto</label>
                                        <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)}
                                            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }}>
                                            <option value="">— Todas —</option>
                                            {marcasRepuesto.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '3px' }}>Tipo</label>
                                        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                                            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }}>
                                            <option value="">— Todos —</option>
                                            {tiposRepuesto.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '3px' }}>Categoría</label>
                                        <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
                                            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }}>
                                            <option value="">— Todas —</option>
                                            {categoriasRepuesto.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                </div>
                                {/* Filtros de vehículo: Marca, Modelo, Año */}
                                <div style={{ padding: '8px 10px', backgroundColor: '#f0f9ff', borderRadius: '7px', border: '1px solid #bae6fd' }}>
                                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#0369a1', margin: '0 0 6px' }}>Vehículo compatible</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '8px' }}>
                                        <div>
                                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '3px' }}>Marca</label>
                                            <select value={marcaV} onChange={e => setMarcaV(e.target.value)}
                                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }}>
                                                <option value="">— Todas —</option>
                                                {marcasV.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '3px' }}>Modelo</label>
                                            <select value={modeloV} onChange={e => setModeloV(e.target.value)}
                                                disabled={!marcaV}
                                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff', opacity: !marcaV ? 0.5 : 1 }}>
                                                <option value="">— Todos —</option>
                                                {modelosV.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '3px' }}>Año</label>
                                            <input type="number" value={anioV} onChange={e => setAnioV(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && buscarAvanzado()}
                                                placeholder="2015"
                                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && buscarAvanzado()}
                                            placeholder="Descripción o SKU (opcional)..."
                                            style={{ width: '100%', padding: '7px 10px 7px 28px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }} />
                                    </div>
                                    <button onClick={buscarAvanzado} disabled={buscandoAvanzado}
                                        style={{ padding: '7px 16px', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', opacity: buscandoAvanzado ? 0.6 : 1 }}>
                                        {buscandoAvanzado ? 'Buscando...' : 'Buscar'}
                                    </button>
                                    {(filtroNroParte || filtroMarca || filtroTipo || filtroCat || marcaV || busqueda) && (
                                        <button onClick={() => { setFiltroNroParte(''); setFiltroMarca(''); setFiltroTipo(''); setFiltroCat(''); setMarcaV(''); setModeloV(''); setAnioV(''); setBusqueda(''); setResultadosAvanzados(null) }}
                                            style={{ padding: '7px 10px', backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>
                                            Limpiar
                                        </button>
                                    )}
                                </div>

                                {/* Resultados avanzados */}
                                {resultadosAvanzados !== null && (
                                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '260px', overflowY: 'auto' }}>
                                        {resultadosAvanzados.length === 0 ? (
                                            <div style={{ padding: '16px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>Sin resultados</div>
                                        ) : resultadosAvanzados.map((item, i) => {
                                            const pt = item.pt
                                            const sem = semaforo(pt.stock_actual ?? 0)
                                            return (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pt.nombre}</div>
                                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                                            <span style={{ fontFamily: 'monospace' }}>{pt.sku}</span>
                                                            {item.nro_parte && <span>N° {item.nro_parte}</span>}
                                                            {item.marca && <span>{item.marca}</span>}
                                                            {item.tipo && <span style={{ backgroundColor: '#f3f4f6', padding: '0 5px', borderRadius: '4px' }}>{item.tipo}</span>}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a' }}>{fmt(pt.precio_venta)}</div>
                                                        <div style={{ fontSize: '11px', fontWeight: 500, color: sem.color, backgroundColor: sem.bg, padding: '1px 6px', borderRadius: '10px', marginTop: '2px' }}>{sem.label}</div>
                                                    </div>
                                                    <button onClick={() => agregarProducto(pt)}
                                                        style={{ padding: '5px 10px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                                                        +
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {items.length > 0 && (
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {['Producto', 'Precio', 'Cant.', 'Subtotal', ''].map((h, i) => (
                                            <th key={i} style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={item.producto_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#1f2937' }}>{item.nombre}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={item.precio_unitario}
                                                    onChange={e => cambiarPrecio(item.producto_id, e.target.value)}
                                                    style={{
                                                        width: '80px',
                                                        padding: '4px 8px',
                                                        border: '1px solid #d1d5db',
                                                        borderRadius: '6px',
                                                        fontSize: '13px',
                                                        textAlign: 'right'
                                                    }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input type="number" min="1" max={item.stock} value={item.cantidad}
                                                    onChange={e => cambiarCantidad(item.producto_id, e.target.value)}
                                                    style={{ width: '60px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }} />
                                            </td>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{fmt(item.cantidad * item.precio_unitario)}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <button onClick={() => eliminarItem(item.producto_id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', height: 'fit-content', position: 'sticky', top: '24px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: '0 0 16px' }}>Resumen</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {[['Subtotal', fmt(subtotal)], ['IVA (16%)', fmt(impuesto)]].map(([l, v]) => (
                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280' }}>
                                <span>{l}</span><span>{v}</span>
                            </div>
                        ))}
                        <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>
                            <span>Total</span><span style={{ color: '#16a34a' }}>{fmt(total)}</span>
                        </div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '16px' }}>
                        {items.length} producto(s) · {items.reduce((s, i) => s + i.cantidad, 0)} unidades
                    </div>

                    {/* Condición de pago */}
                    <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px', marginBottom: '14px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Condición de pago</label>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                            {['contado', 'credito'].map(c => (
                                <button key={c} onClick={() => setCondicion(c)}
                                    style={{
                                        flex: 1, padding: '7px', borderRadius: '7px', fontSize: '12px', fontWeight: 500,
                                        border: '1px solid', cursor: 'pointer',
                                        borderColor: condicion === c ? '#16a34a' : '#e5e7eb',
                                        backgroundColor: condicion === c ? '#f0fdf4' : '#fff',
                                        color: condicion === c ? '#166534' : '#6b7280',
                                    }}>
                                    {c === 'contado' ? 'Contado' : 'Crédito'}
                                </button>
                            ))}
                        </div>
                        {condicion === 'credito' && (
                            <div style={{ marginBottom: '10px' }}>
                                <label style={{ fontSize: '11px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Días de crédito</label>
                                <input type="number" min="0" value={diasCredito}
                                    onChange={e => setDiasCredito(Number(e.target.value) || 0)}
                                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px', boxSizing: 'border-box' }} />
                                {diasCredito > 0 && (() => {
                                    const d = new Date(); d.setDate(d.getDate() + diasCredito)
                                    return <p style={{ fontSize: '11px', color: '#6b7280', margin: '4px 0 0' }}>Vence: {d.toLocaleDateString('es-VE')}</p>
                                })()}
                            </div>
                        )}
                        {condicion === 'contado' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Tasa de cambio</label>
                                    <select value={tipoTasa} onChange={e => {
                                        const t = e.target.value
                                        setTipoTasa(t)
                                        const tasa = tasas[t] || 1
                                        const usd = parseFloat(pagoUsd) || 0
                                        const restBs = Math.max(0, (total - usd) * tasa)
                                        setPagoBs(restBs > 0 ? restBs.toFixed(2) : '')
                                    }}
                                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px', color: '#374151', backgroundColor: '#fff' }}>
                                        {OPCIONES_TASA.map(o => (
                                            <option key={o.key} value={o.key}>{o.label}{tasas[o.key] ? ` (${tasas[o.key]})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Monto USD</label>
                                        <input type="number" min="0" step="0.01" value={pagoUsd} onChange={e => {
                                            const v = e.target.value
                                            const usd = parseFloat(v) || 0
                                            setPagoUsd(v)
                                            const tasa = tasas[tipoTasa] || 1
                                            const restBs = Math.max(0, (total - usd) * tasa)
                                            setPagoBs(restBs > 0 ? restBs.toFixed(2) : '')
                                        }} placeholder="0.00"
                                            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Método</label>
                                        <select value={metodoUsd} onChange={e => setMetodoUsd(e.target.value)}
                                            style={{ width: '100%', padding: '7px 6px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '11px', color: '#374151', backgroundColor: '#fff' }}>
                                            {METODOS_USD.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Monto Bs.</label>
                                        <input type="number" min="0" step="0.01" value={pagoBs} onChange={e => {
                                            const v = e.target.value
                                            const bs = parseFloat(v) || 0
                                            setPagoBs(v)
                                            const tasa = tasas[tipoTasa] || 1
                                            const restUsd = Math.max(0, total - bs / tasa)
                                            setPagoUsd(restUsd > 0 ? restUsd.toFixed(2) : '')
                                        }} placeholder="0.00"
                                            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px', boxSizing: 'border-box' }} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Método</label>
                                        <select value={metodoBs} onChange={e => setMetodoBs(e.target.value)}
                                            style={{ width: '100%', padding: '7px 6px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '11px', color: '#374151', backgroundColor: '#fff' }}>
                                            {METODOS_BS.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Nota <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
                                    <input type="text" value={notaCobro} onChange={e => setNotaCobro(e.target.value)} placeholder="Ej: Efectivo recibido en caja..."
                                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px', boxSizing: 'border-box' }} />
                                </div>
                                {cuentasBancarias.length > 0 && (
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Cuenta bancaria <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
                                        <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)}
                                            style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px', color: '#374151', backgroundColor: '#fff' }}>
                                            <option value="">— Efectivo / sin cuenta —</option>
                                            {cuentasBancarias
                                                .filter(c => Number(pagoUsd) > 0 && Number(pagoBs) > 0 ? true : Number(pagoUsd) > 0 ? c.moneda !== 'Bs' : c.moneda === 'Bs')
                                                .map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.banco} · {c.moneda})</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            N° de referencia <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                        </label>
                        <input
                            type="text"
                            value={nroReferencia}
                            onChange={e => setNroReferencia(e.target.value)}
                            placeholder="Ej: REF-001, NP-2024..."
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }}
                        />
                    </div>
                    {error && (
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>
                            {error}
                        </div>
                    )}
                    <button onClick={confirmarVenta} disabled={guardando || items.length === 0}
                        style={{ width: '100%', backgroundColor: items.length === 0 ? '#d1d5db' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: items.length === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <CheckCircle size={16} />
                        {guardando ? 'Procesando...' : 'Confirmar venta'}
                    </button>
                </div>
            </div>

            {ventaPendiente && (
                <>
                    <div onClick={() => aplicarActualizacionPrecios(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '480px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '80vh', overflowY: 'auto' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>Actualizar precios en catálogo</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 18px' }}>Se modificaron los siguientes precios de venta. ¿Deseas actualizar el catálogo?</p>
                        <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                            {ventaPendiente.cambiados.map(item => (
                                <div key={item.producto_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f3f4f6' }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{item.nombre}</div>
                                        {item.sku && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{item.sku}</div>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                        <span style={{ color: '#9ca3af', textDecoration: 'line-through' }}>{fmt(item.precio_original)}</span>
                                        <span style={{ color: '#6b7280' }}>→</span>
                                        <span style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(item.precio_unitario)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => aplicarActualizacionPrecios(true)}
                                style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                                Sí, actualizar catálogo
                            </button>
                            <button onClick={() => aplicarActualizacionPrecios(false)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                No, continuar
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Factura + Devolución ──────────────────────────────────────
// ─── Factura + Devolución (CORREGIDO PARA IMPRESIÓN) ──────────────────────
function Factura({ venta, onVolver, onDevolucionCreada }) {
    const [items, setItems] = useState(venta.items || [])
    const [devoluciones, setDevoluciones] = useState([])
    const [mostrarDevolucion, setMostrarDevolucion] = useState(false)
    const [loadingItems, setLoadingItems] = useState(false)

    useEffect(() => {
        cargarItems()
        cargarDevoluciones()
    }, [venta.id])

    async function cargarItems() {
        if (venta.items) return
        setLoadingItems(true)
        const { data } = await supabase
            .from('venta_items')
            .select(`*, productos_terminados(nombre, sku)`)
            .eq('venta_id', venta.id)
        if (data) setItems(data)
        setLoadingItems(false)
    }

    async function cargarDevoluciones() {
        const { data } = await supabase
            .from('devoluciones')
            .select(`*, devolucion_items(*, productos_terminados(nombre))`)
            .eq('venta_id', venta.id)
            .order('fecha', { ascending: false })
        if (data) setDevoluciones(data)
    }

    const subtotal = venta.subtotal || items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
    const impuesto = subtotal * 0.16
    const total = venta.total || subtotal + impuesto
    const puedeDevolver = venta.estado_cobro !== 'anulado'
    const [refEditando, setRefEditando] = useState(false)
    const [refValor, setRefValor] = useState(venta.nro_referencia || '')

    async function guardarRef() {
        const { error } = await supabase.from('ventas').update({ nro_referencia: refValor.trim() || null }).eq('id', venta.id)
        if (!error) {
            setRefEditando(false)
            // Actualiza el estado local si es necesario, o recarga
        } else {
            alert('Error al guardar la referencia')
        }
    }

    // Lógica para mostrar NE- en lugar de FAC-
    const numeroDoc = venta.numero_factura ? venta.numero_factura.replace('FAC-', 'NE-') : '';

    if (mostrarDevolucion)
        return <FormDevolucion
            venta={venta}
            items={items}
            onCancelar={() => setMostrarDevolucion(false)}
            onConfirmada={() => { onDevolucionCreada(); }}
        />

    return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>

            {/* 🖨️ ESTILOS PARA IMPRESIÓN */}
            <style>{`
                @media print {
                    /* Ocultar todo el body por defecto */
                    body * { visibility: hidden; }
                    
                    /* Hacer visible solo el documento */
                    .print-target, .print-target * { visibility: visible; }
                    
                    /* Ajustar posición y márgenes del documento para impresión */
                    .print-target {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        padding: 20px !important;
                        border: none !important;
                        box-shadow: none !important;
                        background: white !important;
                    }
                    
                    /* Asegurar que elementos ocultos no ocupen espacio */
                    .no-print { display: none !important; }
                }
            `}</style>

            {/* Encabezado de la App (Se oculta al imprimir) */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Nota de Entrega</h1>

                <button onClick={() => window.print()}
                    style={{ marginLeft: 'auto', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                    🖨️ Imprimir
                </button>

                {puedeDevolver && (
                    <button onClick={() => setMostrarDevolucion(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                        <RotateCcw size={14} /> Registrar devolución
                    </button>
                )}
            </div>

            {/* Documento (Lo único que se imprime) */}
            <div className="print-target" style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                    <div>
                        <div style={{ fontSize: '22px', marginBottom: '4px' }}>🥥</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>Empresa de Cocos</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>RIF: J-00000000-0</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>Nota de Entrega</div>
                        <div style={{ fontSize: '20px', fontWeight: 700, color: '#16a34a', fontFamily: 'monospace' }}>{numeroDoc}</div>

                        <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {refEditando ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px', padding: '2px 6px' }}>
                                    <input
                                        value={refValor}
                                        onChange={e => setRefValor(e.target.value)}
                                        style={{ border: 'none', outline: 'none', fontSize: '12px', width: '120px', fontFamily: 'monospace' }}
                                        autoFocus
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') guardarRef()
                                            if (e.key === 'Escape') { setRefValor(venta.nro_referencia || ''); setRefEditando(false) }
                                        }}
                                    />
                                    <button onClick={guardarRef} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}>OK</button>
                                    <button onClick={() => { setRefValor(venta.nro_referencia || ''); setRefEditando(false) }} style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '11px', cursor: 'pointer' }}>X</button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'monospace', color: refValor ? '#374151' : '#9ca3af' }}>
                                    <span>Ref: {refValor || '—'}</span>
                                    <button onClick={() => { setRefValor(venta.nro_referencia || ''); setRefEditando(true) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '2px' }}>
                                        <Edit size={12} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                            {new Date(venta.fecha_venta || Date.now()).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </div>
                        <div style={{ marginTop: '6px' }}>
                            <BadgeCobro estado={venta.estado_cobro} />
                        </div>
                    </div>
                </div>

                <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cliente</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{venta.clientes?.nombre || '—'}</div>
                </div>

                {loadingItems ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>Cargando items...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                {['Producto', 'Cant.', 'Precio unit.', 'Total'].map((h, i) => (
                                    <th key={i} style={{ padding: '8px 0', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i > 0 ? 'right' : 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#1f2937' }}>
                                        {item.productos_terminados?.nombre || item.nombre}
                                        <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>
                                            {item.productos_terminados?.sku || item.sku}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{item.cantidad}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(item.cantidad * item.precio_unitario)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                    {[['Subtotal', fmt(subtotal)], ['IVA (16%)', fmt(impuesto)]].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>
                            <span>{l}</span> <span>{v}</span>
                        </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#1f2937', marginTop: '8px', paddingTop: '8px', borderTop: '2px solid #e5e7eb' }}>
                        <span>Total</span> <span style={{ color: '#16a34a' }}>{fmt(total)}</span>
                    </div>
                </div>

                <div style={{ marginTop: '32px', textAlign: 'center', fontSize: '12px', color: '#d1d5db' }}>Gracias por su compra</div>
            </div>

            {/* Historial de devoluciones */}
            {devoluciones.length > 0 && (
                <div style={{ backgroundColor: '#fffbeb', borderRadius: '12px', border: '1px solid #fde68a', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
                        <AlertTriangle size={15} style={{ color: '#d97706' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>Devoluciones registradas</span>
                    </div>
                    {devoluciones.map(dev => (
                        <div key={dev.id} style={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #fde68a', padding: '12px', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                    {new Date(dev.fecha).toLocaleDateString('es-VE')} · {dev.tipo_devolucion.replace('_', ' ')}
                                </div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>−{fmt(dev.monto_devuelto)}</div>
                            </div>
                            <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
                                <strong>Motivo:</strong> {dev.motivo}
                            </div>
                            {dev.devolucion_items?.map((di, i) => (
                                <div key={i} style={{ fontSize: '12px', color: '#6b7280' }}>
                                    · {di.productos_terminados?.nombre} — {di.cantidad_devuelta} unid.
                                </div>
                            ))}
                            {dev.es_total && (
                                <div style={{ marginTop: '6px' }}>
                                    <span style={{ fontSize: '11px', backgroundColor: '#fee2e2', color: '#991b1b', padding: '1px 8px', borderRadius: '20px' }}>Devolución total</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ─── Formulario de Devolución ──────────────────────────────────
function FormDevolucion({ venta, items, onCancelar, onConfirmada }) {
    const { perfil } = useAuth()
    const [seleccion, setSeleccion] = useState(
        items.map(i => ({ ...i, devolver: false, cantidad_devuelta: 1 }))
    )
    const [motivo, setMotivo] = useState('')
    const [tipoDevolucion, setTipoDevolucion] = useState('reposicion_stock')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    function toggleItem(idx) {
        setSeleccion(prev => prev.map((i, j) => j === idx ? { ...i, devolver: !i.devolver } : i))
    }

    function setCantidad(idx, valor) {
        const n = parseInt(valor)
        if (isNaN(n) || n < 1) return
        const max = seleccion[idx].cantidad
        setSeleccion(prev => prev.map((i, j) => j === idx ? { ...i, cantidad_devuelta: Math.min(n, max) } : i))
    }

    const itemsADevolver = seleccion.filter(i => i.devolver)
    const montoDevuelto = itemsADevolver.reduce((s, i) => s + i.cantidad_devuelta * i.precio_unitario, 0)
    const esTotal = itemsADevolver.length === items.length &&
        itemsADevolver.every((i, idx) => i.cantidad_devuelta === i.cantidad)

    async function confirmar() {
        if (itemsADevolver.length === 0) { setError('Selecciona al menos un producto a devolver'); return }
        if (!motivo.trim()) { setError('Ingresa el motivo de la devolución'); return }
        setGuardando(true)
        setError('')

        const { data: { user } } = await supabase.auth.getUser()

        const { data: dev, error: errDev } = await supabase
            .from('devoluciones')
            .insert({ venta_id: venta.id, usuario_id: user.id, motivo, tipo_devolucion: tipoDevolucion, monto_devuelto: montoDevuelto, es_total: esTotal, empresa_id: perfil.empresa_id })
            .select()
            .single()

        if (errDev) { setError('Error: ' + errDev.message); setGuardando(false); return }

        await supabase.from('devolucion_items').insert(
            itemsADevolver.map(i => ({
                devolucion_id: dev.id,
                producto_id: i.producto_id || i.productos_terminados?.id || i.id,
                cantidad_devuelta: i.cantidad_devuelta,
                precio_unitario: i.precio_unitario,
                empresa_id: perfil.empresa_id,
            }))
        )

        // Reponer stock
        for (const item of itemsADevolver) {
            const prodId = item.producto_id || item.productos_terminados?.id
            const { data: prod } = await supabase.from('productos_terminados').select('stock_actual').eq('id', prodId).single()

            if (prod) {
                const nuevoStock = prod.stock_actual + item.cantidad_devuelta

                await supabase.from('productos_terminados')
                    .update({ stock_actual: nuevoStock })
                    .eq('id', prodId)

                // REGISTRAR MOVIMIENTO ✅
                await supabase.from('movimientos_inventario').insert({
                    empresa_id: perfil.empresa_id,
                    tipo_item: 'producto_terminado',
                    item_id: prodId,
                    item_nombre: item.productos_terminados?.nombre || item.nombre,
                    item_codigo: item.productos_terminados?.sku || item.sku || '',
                    tipo_movimiento: 'entrada',
                    cantidad: item.cantidad_devuelta,
                    stock_actual: nuevoStock,
                    origen: 'devolucion',
                    fecha: new Date().toISOString()
                })
            }
        }

        // Actualizar estado de la venta
        const nuevoEstado = esTotal ? 'anulado' : venta.estado_cobro
        await supabase.from('ventas').update({ estado_cobro: nuevoEstado }).eq('id', venta.id)

        onConfirmada()
    }

    return (
        <div style={{ padding: '24px', maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Cancelar</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Registrar devolución</h1>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '4px' }}>Nota de Entrega</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', fontFamily: 'monospace' }}>{venta.numero_factura}</div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '2px' }}>{venta.clientes?.nombre}</div>
            </div>

            {/* Selección de productos */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '16px' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                    Selecciona los productos a devolver
                </div>
                {seleccion.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: '1px solid #f3f4f6', backgroundColor: item.devolver ? '#f0fdf4' : 'transparent' }}>
                        <input type="checkbox" checked={item.devolver} onChange={() => toggleItem(idx)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#16a34a' }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
                                {item.productos_terminados?.nombre || item.nombre}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                Vendido: {item.cantidad} unid. · {fmt(item.precio_unitario)} c/u
                            </div>
                        </div>
                        {item.devolver && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '12px', color: '#6b7280' }}>Cant. a devolver:</span>
                                <input type="number" min="1" max={item.cantidad} value={item.cantidad_devuelta}
                                    onChange={e => setCantidad(idx, e.target.value)}
                                    style={{ width: '60px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }} />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Tipo y motivo */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Tipo de devolución</label>
                    <select value={tipoDevolucion} onChange={e => setTipoDevolucion(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff' }}>
                        <option value="reposicion_stock">Reposición a inventario</option>
                        <option value="nota_credito">Nota de crédito</option>
                        <option value="reembolso">Reembolso al cliente</option>
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Motivo</label>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                        placeholder="Ej: Producto vencido, error en pedido, producto en mal estado..."
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                </div>
            </div>

            {/* Resumen */}
            {itemsADevolver.length > 0 && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#374151' }}>
                        <span>{itemsADevolver.length} producto(s) · {itemsADevolver.reduce((s, i) => s + i.cantidad_devuelta, 0)} unidades</span>
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>−{fmt(montoDevuelto)}</span>
                    </div>
                    {esTotal && (
                        <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
                            Devolución total — la factura quedará como anulada
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>
                    {error}
                </div>
            )}

            <button onClick={confirmar} disabled={guardando}
                style={{ width: '100%', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: guardando ? 0.6 : 1 }}>
                <RotateCcw size={16} />
                {guardando ? 'Procesando...' : 'Confirmar devolución'}
            </button>
        </div>
    )
}