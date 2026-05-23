import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Search, Trash2, Check, CheckCircle, FileText, RotateCcw, AlertTriangle, ClipboardList, ChevronRight, Edit, X, MapPin, Star } from 'lucide-react'


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
export default function Ventas() {
    const { perfil } = useAuth()
    // flujo_ventas: 'retail' → venta directa | 'manufactura' (default) → pedido → alistamiento → factura
    const esRetail = perfil?.empresas?.flujo_ventas === 'retail'

    const [tabActiva, setTabActiva] = useState('ventas')
    const [vista, setVista] = useState('lista')
    const [ventas, setVentas] = useState([])
    const [ventaActual, setVentaActual] = useState(null)
    const [loading, setLoading] = useState(true)
    const [pedidosAprobados, setPedidosAprobados] = useState([])
    const [loadingPedidos, setLoadingPedidos] = useState(false)
    const [pedidoActual, setPedidoActual] = useState(null)
    const [pagina, setPagina] = useState(0)
    const [pageSize, setPageSize] = useState(50)
    const [sortCol, setSortCol] = useState('fecha')
    const [sortDir, setSortDir] = useState('desc')

    useEffect(() => { cargarVentas() }, [])
    useEffect(() => { if (tabActiva === 'pedidos') cargarPedidosAprobados() }, [tabActiva])

    async function cargarVentas() {
        setLoading(true)
        const { data } = await supabase
            .from('ventas')
            .select(`*, clientes(nombre), devoluciones(id)`)
            .eq('empresa_id', perfil.empresa_id)
            .limit(5000)
        if (data) setVentas(data)
        setLoading(false)
    }

    async function cargarPedidosAprobados() {
        setLoadingPedidos(true)
        const { data } = await supabase
            .from('pedidos')
            .select('*, clientes(nombre, rif), usuarios(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            // retail no usa este tab, manufactura busca 'alistado'
            .eq('estado', 'alistado')
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

    function handleSort(col) {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortCol(col); setSortDir('asc') }
        setPagina(0)
    }

    const ventasOrdenadas = [...ventas].sort((a, b) => {
        let va, vb
        if (sortCol === 'numero_factura') { va = a.numero_factura || ''; vb = b.numero_factura || '' }
        else if (sortCol === 'nro_referencia') { va = a.nro_referencia || ''; vb = b.nro_referencia || '' }
        else if (sortCol === 'cliente') { va = a.clientes?.nombre || ''; vb = b.clientes?.nombre || '' }
        else if (sortCol === 'fecha') { va = new Date(a.fecha_venta || a.created_at); vb = new Date(b.fecha_venta || b.created_at) }
        else if (sortCol === 'total') { va = Number(a.total || 0); vb = Number(b.total || 0) }
        else if (sortCol === 'estado') { va = a.estado_cobro || ''; vb = b.estado_cobro || '' }
        else { va = ''; vb = '' }
        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
        return sortDir === 'asc' ? va - vb : vb - va
    })
    const totalVentas = ventasOrdenadas.length
    const ventasPaginadas = ventasOrdenadas.slice(pagina * pageSize, (pagina + 1) * pageSize)

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Ventas</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                        {esRetail ? 'Historial de notas de entrega' : 'Historial de notas y pedidos por registrar'}
                    </p>
                </div>
                {tabActiva === 'ventas' && (
                    <button onClick={() => setVista('nueva')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={16} /> Nueva venta
                    </button>
                )}
            </div>

            {/* Tabs — la pestaña de pedidos solo aparece en flujo manufactura */}
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
                {!esRetail && (
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
                )}
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
                                    {[
                                        { label: 'Nota de Entrega', col: 'numero_factura' },
                                        { label: 'Referencia', col: 'nro_referencia' },
                                        { label: 'Cliente', col: 'cliente' },
                                        { label: 'Fecha', col: 'fecha' },
                                        { label: 'Total', col: 'total', right: true },
                                        { label: 'Estado', col: 'estado' },
                                        { label: '', col: null },
                                    ].map(({ label, col, right }) => (
                                        <th key={label || 'acc'} onClick={col ? () => handleSort(col) : undefined}
                                            style={{ padding: '10px 16px', textAlign: right ? 'right' : 'left', fontSize: '12px', fontWeight: 500, color: col && sortCol === col ? '#16a34a' : '#6b7280', cursor: col ? 'pointer' : 'default', userSelect: 'none', whiteSpace: 'nowrap' }}>
                                            {label}{col && <span style={{ marginLeft: '4px', fontSize: '10px' }}>{sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}</span>}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {ventasPaginadas.map(v => (
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
                    {totalVentas > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid #e5e7eb', backgroundColor: '#f9fafb' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                    {pagina * pageSize + 1}–{Math.min((pagina + 1) * pageSize, totalVentas)} de {totalVentas}
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
                                <span style={{ fontSize: '13px', color: '#6b7280' }}>Pág {pagina + 1} / {Math.ceil(totalVentas / pageSize)}</span>
                                <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * pageSize >= totalVentas}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: (pagina + 1) * pageSize >= totalVentas ? '#d1d5db' : '#374151', cursor: (pagina + 1) * pageSize >= totalVentas ? 'default' : 'pointer' }}>
                                    →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Tab Pedidos por facturar (solo manufactura) */}
            {!esRetail && tabActiva === 'pedidos' && (
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

// ─── Facturar desde pedido (solo flujo manufactura) ────────────
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
            .select('*, productos_terminados(nombre, sku, stock_actual, aplica_iva)')
            .eq('pedido_id', pedido.id)
            .then(({ data }) => {
                if (data) {
                    const activos = data
                        .filter(i => i.cantidad_alistada === null || Number(i.cantidad_alistada) > 0)
                        .map(i => ({
                            ...i,
                            cantidad: i.cantidad_alistada != null ? Number(i.cantidad_alistada) : Number(i.cantidad),
                        }))
                    setItems(activos)
                }
                setLoading(false)
            })
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

    // Recalcular Bs cuando cambia la tasa (mantiene el monto USD como base)
    useEffect(() => {
        const tasa = tasas[tipoTasa] || 0
        if (!tasa || !pagoUsd) return
        const complemento = (total - Number(pagoUsd)) * tasa
        setPagoBs(complemento > 0 ? complemento.toFixed(2) : '0')
    }, [tipoTasa, tasas])

    function handleUsdChange(val) {
        setPagoUsd(val)
        const tasa = tasas[tipoTasa] || 0
        if (!tasa) return
        const usd = Number(val) || 0
        const complemento = (total - usd) * tasa
        setPagoBs(complemento > 0 ? complemento.toFixed(2) : '0')
    }

    function handleBsChange(val) {
        setPagoBs(val)
        const tasa = tasas[tipoTasa] || 0
        if (!tasa) return
        const bs = Number(val) || 0
        const complemento = total - bs / tasa
        setPagoUsd(complemento > 0 ? complemento.toFixed(2) : '0')
    }

    const descGlobal = Number(pedido.descuento_global || 0)
    const discountFactor = 1 - descGlobal / 100
    const total = items.reduce((s, i) => s + Number(i.cantidad) * Number(i.precio_unitario) * (1 - Number(i.descuento_item || 0) / 100), 0) * discountFactor
    const subtotal = items.reduce((s, i) => {
        const lineTotal = Number(i.cantidad) * Number(i.precio_unitario) * (1 - Number(i.descuento_item || 0) / 100) * discountFactor
        return s + (i.productos_terminados?.aplica_iva ? lineTotal / 1.16 : lineTotal)
    }, 0)
    const iva = total - subtotal
    const descGlobalMonto = discountFactor < 1 ? total / discountFactor - total : 0

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
            d.setDate(d.getDate() + Number(diasCredito))
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
                aplica_iva: i.productos_terminados?.aplica_iva ?? true,
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
                // item.cantidad fue remapeado a cantidad_alistada al cargar los items
                const cantPrimaria = Number(item.cantidad)
                const nuevoStock = prod.stock_actual - cantPrimaria
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
                                const subtotalItem = Number(item.cantidad) * Number(item.precio_unitario) * (1 - Number(item.descuento_item || 0) / 100)
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
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(subtotalItem)}</td>
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
                        <span>-{fmt(descGlobalMonto)}</span>
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
                                <input type="number" min="0" step="0.01" value={pagoUsd} onChange={e => handleUsdChange(e.target.value)} placeholder="0.00"
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
                                <input type="number" min="0" step="0.01" value={pagoBs} onChange={e => handleBsChange(e.target.value)} placeholder="0.00"
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

function tiempoDesde(ts) {
    const mins = Math.floor((Date.now() - ts) / 60000)
    if (mins < 1) return 'hace un momento'
    if (mins < 60) return `hace ${mins} min`
    return `hace ${Math.floor(mins / 60)}h`
}

// ─── Nueva Venta (flujo dual: retail = venta directa | manufactura = pedido) ──
function NuevaVenta({ onVentaCreada, onCancelar }) {
    const { perfil } = useAuth()
    const esAutopartes = perfil?.empresas?.perfil_negocio === 'autopartes'
    // FLUJO DUAL: retail descuenta stock al confirmar; manufactura crea un pedido
    const esRetail = perfil?.empresas?.flujo_ventas === 'retail'
    console.log('DEBUG flujo:', perfil?.empresas?.flujo_ventas, '| esRetail:', esRetail)

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
    const [marcaV, setMarcaV] = useState('')
    const [modeloV, setModeloV] = useState('')
    const [anioV, setAnioV] = useState('')
    const [marcasV, setMarcasV] = useState([])
    const [modelosV, setModelosV] = useState([])
    const [resultadosAvanzados, setResultadosAvanzados] = useState(null)
    const [buscandoAvanzado, setBuscandoAvanzado] = useState(false)

    const [listas, setListas] = useState([])
    const [listaId, setListaId] = useState('')
    const [listasClienteIds, setListasClienteIds] = useState(null) // null = sin restricción
    const [descuentoGlobal, setDescuentoGlobal] = useState('')

    // ── Estados exclusivos flujo RETAIL ──
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

    // ── Estados exclusivos flujo MANUFACTURA ──
    const [notas, setNotas] = useState('')

    const [mostrarNuevoProducto, setMostrarNuevoProducto] = useState(false)
    const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false)
    const [borradorGuardado, setBorradorGuardado] = useState(null)

    const DRAFT_KEY = `mipos_borrador_venta_${perfil.empresa_id}`

    useEffect(() => {
        supabase.from('clientes').select('id, nombre, rif, descripcion, condicion_pago, dias_credito').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setClientes(data || []))
        supabase.from('listas_precio').select('id, nombre, es_default').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => {
                if (data && data.length > 0) {
                    setListas(data)
                    const def = data.find(l => l.es_default)
                    setListaId(def ? def.id : data[0].id)
                }
            })
        // Tasas y cuentas bancarias solo se necesitan en retail (cobro inmediato)
        if (esRetail) {
            supabase.from('configuracion').select('clave, valor').eq('empresa_id', perfil.empresa_id)
                .then(({ data }) => { if (data) { const t = {}; data.forEach(r => { t[r.clave] = Number(r.valor) }); setTasas(t) } })
            supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda').eq('empresa_id', perfil.empresa_id).eq('activa', true)
                .then(({ data }) => setCuentasBancarias(data || []))
        }
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
    }, [perfil.empresa_id, esRetail, esAutopartes])

    useEffect(() => {
        if (!perfil?.empresa_id) return
        if (!listaId) {
            supabase.from('productos_terminados').select('id, nombre, sku, precio_venta, stock_actual, unidad_medida, aplica_iva, unidad_venta_2, factor_conversion_2').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
                .then(({ data }) => setProductos(data || []))
            return
        }
        supabase.from('producto_precios')
            .select('precio, productos_terminados(id, nombre, sku, stock_actual, unidad_medida, aplica_iva, unidad_venta_2, factor_conversion_2)')
            .eq('lista_id', listaId).eq('empresa_id', perfil.empresa_id)
            .then(({ data }) => {
                if (data) setProductos(data.filter(p => p.productos_terminados).map(p => ({ ...p.productos_terminados, precio_venta: p.precio })))
            })
    }, [listaId, perfil.empresa_id])

    useEffect(() => {
        if (!marcaV || !perfil?.empresa_id) { setModelosV([]); setModeloV(''); return }
        supabase.from('vehiculos').select('modelo')
            .eq('empresa_id', perfil.empresa_id).eq('marca', marcaV).order('modelo')
            .then(({ data }) => { setModelosV([...new Set((data || []).map(v => v.modelo))].sort()); setModeloV('') })
    }, [marcaV, perfil.empresa_id])

    // Leer borrador al montar (máx 24h de antigüedad)
    useEffect(() => {
        const raw = localStorage.getItem(DRAFT_KEY)
        if (!raw) return
        try {
            const d = JSON.parse(raw)
            if ((d.items?.length > 0 || d.clienteId) && d.ts > Date.now() - 86400000)
                setBorradorGuardado(d)
            else
                localStorage.removeItem(DRAFT_KEY)
        } catch { localStorage.removeItem(DRAFT_KEY) }
    }, [])

    // Auto-guardar borrador cuando el carrito o el cliente cambian
    useEffect(() => {
        if (items.length === 0 && !clienteId) return
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            clienteId, items, listaId, descuentoGlobal, notas, nroReferencia, diasCredito, ts: Date.now()
        }))
    }, [items, clienteId, descuentoGlobal, notas, nroReferencia])

    async function seleccionarCliente(id) {
        setClienteId(id)
        setDireccionId('')
        setDirecciones([])
        if (!id) {
            if (esRetail) setCondicion('credito')
            setListasClienteIds(null)
            return
        }
        if (esRetail) {
            const cliente = clientes.find(c => c.id === id)
            setCondicion(cliente?.condicion_pago || 'credito')
            setDiasCredito(Number(cliente?.dias_credito) || 0)
        }
        const [{ data: dirs }, { data: listasCli }] = await Promise.all([
            supabase.from('direcciones_entrega')
                .select('*').eq('cliente_id', id).eq('empresa_id', perfil.empresa_id)
                .eq('activo', true).order('es_principal', { ascending: false }).order('nombre'),
            supabase.from('cliente_listas_precio')
                .select('lista_precio_id, es_default')
                .eq('cliente_id', id).eq('empresa_id', perfil.empresa_id),
        ])
        if (dirs) {
            setDirecciones(dirs)
            const principal = dirs.find(d => d.es_principal)
            if (principal) setDireccionId(principal.id)
            else if (dirs.length === 1) setDireccionId(dirs[0].id)
        }
        if (listasCli && listasCli.length > 0) {
            setListasClienteIds(new Set(listasCli.map(l => l.lista_precio_id)))
            const def = listasCli.find(l => l.es_default)
            const defaultId = def?.lista_precio_id || listasCli[0].lista_precio_id
            setListaId(defaultId)
        } else {
            setListasClienteIds(null)
        }
    }

    async function buscarAvanzado() {
        const tieneNroParte = filtroNroParte.trim()
        const tieneAutoparteFilter = tieneNroParte || filtroMarca || filtroTipo
        const tieneVehiculoFilter = !!marcaV
        if (!tieneAutoparteFilter && !tieneVehiculoFilter && !filtroCat && !busqueda.trim()) return
        setBuscandoAvanzado(true); setResultadosAvanzados(null)

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

        if (tieneAutoparteFilter || tieneVehiculoFilter) {
            let apQ = supabase.from('productos_autopartes')
                .select('nro_parte, marca, tipo, producto_id, productos_terminados!inner(id, nombre, sku, precio_venta, stock_actual, categoria_1, aplica_iva, unidad_venta_2, factor_conversion_2)')
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
            let ptQ = supabase.from('productos_terminados')
                .select('id, nombre, sku, precio_venta, stock_actual, categoria_1, aplica_iva, unidad_venta_2, factor_conversion_2')
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
                    ; (apData || []).forEach(ap => { apMap[ap.producto_id] = ap })
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
        const precioLista = productos.find(p => p.id === producto.id)?.precio_venta ?? producto.precio_venta
        setItems(prev => {
            const existe = prev.find(i => i.producto_id === producto.id)
            if (existe) return prev.map(i => i.producto_id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i)
            return [...prev, {
                producto_id: producto.id, nombre: producto.nombre, sku: producto.sku,
                cantidad: 1, precio_unitario: precioLista, precio_original: precioLista,
                stock: producto.stock_actual, aplica_iva: producto.aplica_iva, descuento_item: '',
                unidad_medida: producto.unidad_medida || 'unidad',
                unidad_venta_2: producto.unidad_venta_2 || null,
                factor_conversion_2: producto.factor_conversion_2 || 1,
                unidadVenta: '1',
            }]
        })
        setBusqueda('')
    }

    function cambiarUnidad(id) {
        setItems(prev => prev.map(i => {
            if (i.producto_id !== id || !i.unidad_venta_2) return i
            const nueva = i.unidadVenta === '1' ? '2' : '1'
            const factor = i.factor_conversion_2 || 1
            return {
                ...i,
                unidadVenta: nueva,
                precio_unitario: nueva === '2' ? i.precio_original * factor : i.precio_original,
            }
        }))
    }

    function cambiarCantidad(id, valor) {
        const n = parseInt(valor)
        if (isNaN(n) || n < 1) return
        setItems(prev => prev.map(i => i.producto_id === id ? { ...i, cantidad: n } : i))
    }

    function eliminarItem(id) {
        setItems(prev => prev.filter(i => i.producto_id !== id))
    }

    function limpiarBorrador() {
        localStorage.removeItem(DRAFT_KEY)
        setBorradorGuardado(null)
    }

    async function restaurarBorrador() {
        const d = borradorGuardado
        setBorradorGuardado(null)
        if (d.descuentoGlobal) setDescuentoGlobal(d.descuentoGlobal)
        if (d.notas) setNotas(d.notas)
        if (d.nroReferencia) setNroReferencia(d.nroReferencia)
        if (d.clienteId) await seleccionarCliente(d.clienteId)
        if (d.listaId) setListaId(d.listaId)
        if (d.diasCredito) setDiasCredito(Number(d.diasCredito))
        if (d.items?.length) setItems(d.items)
    }

    function cambiarPrecio(id, valor) {
        setItems(prev => prev.map(i => i.producto_id === id ? { ...i, precio_unitario: parseFloat(valor) || 0 } : i))
    }

    async function aplicarActualizacionPrecios(actualizar) {
        if (actualizar) {
            for (const item of ventaPendiente.cambiados) {
                await supabase.from('productos_terminados')
                    .update({ precio_venta: Number(item.precio_unitario) })
                    .eq('id', item.producto_id)
                    .eq('empresa_id', perfil.empresa_id)
            }
        }
        const ventaObj = ventaPendiente.ventaObj
        setVentaPendiente(null)
        limpiarBorrador()
        onVentaCreada(ventaObj)
    }

    function setDescItem(id, val) {
        setItems(prev => prev.map(i => i.producto_id === id ? { ...i, descuento_item: val } : i))
    }

    const totalBruto = items.reduce((s, i) => s + i.cantidad * i.precio_unitario * (1 - Number(i.descuento_item || 0) / 100), 0)
    const total = totalBruto * (1 - Number(descuentoGlobal || 0) / 100)
    const subtotal = items.reduce((s, i) => {
        const line = i.cantidad * i.precio_unitario * (1 - Number(i.descuento_item || 0) / 100) * (1 - Number(descuentoGlobal || 0) / 100)
        return s + (i.aplica_iva ? line / 1.16 : line)
    }, 0)
    const impuesto = total - subtotal

    // ── HANDLER UNIFICADO: bifurca internamente según flujo ──
    async function procesar() {
        if (!clienteId) { setError('Selecciona un cliente'); return }
        if (items.length === 0) { setError('Agrega al menos un producto'); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()

        if (esRetail) {
            // ── FLUJO RETAIL: venta directa con descuento inmediato de inventario ──
            const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_ventas_numero', {
                p_empresa_id: perfil.empresa_id
            })
            const numero = numeroConsecutivo || 'NE-000001'

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

            const descGlobal = Number(descuentoGlobal) || 0
            await supabase.from('venta_items').insert(
                items.map(i => ({
                    venta_id: venta.id, producto_id: i.producto_id, cantidad: i.cantidad,
                    precio_unitario: i.precio_unitario * (1 - Number(i.descuento_item || 0) / 100) * (1 - descGlobal / 100),
                    aplica_iva: i.aplica_iva ?? true, empresa_id: perfil.empresa_id,
                    unidad_venta: i.unidadVenta === '2' ? i.unidad_venta_2 : i.unidad_medida,
                    cantidad_primaria: i.unidadVenta === '2' ? i.cantidad * (i.factor_conversion_2 || 1) : i.cantidad,
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

            // Descuento inmediato de inventario
            for (const item of items) {
                const prod = productos.find(p => p.id === item.producto_id)
                const cantPrimaria = item.unidadVenta === '2' ? item.cantidad * (item.factor_conversion_2 || 1) : item.cantidad
                const nuevoStock = prod.stock_actual - cantPrimaria
                await supabase.from('productos_terminados')
                    .update({ stock_actual: nuevoStock })
                    .eq('id', item.producto_id)

                await supabase.from('movimientos_inventario').insert({
                    empresa_id: perfil.empresa_id,
                    tipo_item: 'producto_terminado',
                    item_id: item.producto_id,
                    item_nombre: item.nombre,
                    item_codigo: item.sku,
                    tipo_movimiento: 'salida',
                    cantidad: cantPrimaria,
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
            limpiarBorrador()
            onVentaCreada({ ...venta, clientes: { nombre: clientes.find(c => c.id === clienteId)?.nombre }, items })

        } else {
            // ── FLUJO MANUFACTURA: crea un pedido sin tocar inventario ──
            const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_pedidos_numero', { p_empresa_id: perfil.empresa_id })
            const numero = numeroConsecutivo || 'PED-000001'
            const requiereAprobacion = perfil?.empresas?.aprobacion_pedido ?? true

            const { data: pedido, error: errPedido } = await supabase.from('pedidos').insert({
                empresa_id: perfil.empresa_id,
                cliente_id: clienteId,
                vendedor_id: user.id,
                lista_precio_id: listaId || null,
                descuento_global: Number(descuentoGlobal) || 0,
                estado: requiereAprobacion ? 'pendiente' : 'aprobado',
                origen: 'oficina',
                fecha_pedido: new Date().toISOString(),
                numero_pedido: numero,
                notas: notas.trim() || null,
                direccion_entrega_id: direccionId || null,
                direccion_entrega_texto: direccionId ? direcciones.find(d => d.id === direccionId)?.direccion || null : null,
            }).select().single()

            if (errPedido) { setError('Error: ' + errPedido.message); setGuardando(false); return }

            await supabase.from('pedido_items').insert(
                items.map(i => ({
                    pedido_id: pedido.id, empresa_id: perfil.empresa_id,
                    producto_id: i.producto_id, nombre_producto: i.nombre,
                    cantidad: i.cantidad,
                    precio_unitario: i.precio_unitario,
                    descuento_item: Number(i.descuento_item) || 0,
                    subtotal: i.cantidad * i.precio_unitario * (1 - Number(i.descuento_item || 0) / 100),
                    unidad_venta: i.unidadVenta === '2' ? i.unidad_venta_2 : i.unidad_medida,
                    cantidad_primaria: i.unidadVenta === '2' ? i.cantidad * (i.factor_conversion_2 || 1) : i.cantidad,
                }))
            )

            setGuardando(false)
            limpiarBorrador()
            onVentaCreada({ numero_pedido: pedido.numero_pedido, cliente: clientes.find(c => c.id === clienteId)?.nombre })
        }
    }

    const clienteSeleccionado = clientes.find(c => c.id === clienteId) || null
    const clientesFiltrados = !clienteId && busquedaCliente.trim()
        ? clientes.filter(c => {
            const q = busquedaCliente.toLowerCase()
            return c.nombre.toLowerCase().includes(q) ||
                (c.rif || '').toLowerCase().includes(q) ||
                (c.descripcion || '').toLowerCase().includes(q)
        }).slice(0, 20)
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
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                    {esRetail ? 'Nueva venta' : 'Nuevo pedido'}
                </h1>
            </div>

            {borradorGuardado && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #d97706', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ fontSize: '13px', color: '#92400e' }}>
                        <span style={{ fontWeight: 600 }}>Borrador guardado</span>
                        <span style={{ marginLeft: '8px' }}>
                            {tiempoDesde(borradorGuardado.ts)}
                            {borradorGuardado.items?.length > 0 && ` · ${borradorGuardado.items.length} producto${borradorGuardado.items.length !== 1 ? 's' : ''}`}
                            {borradorGuardado.clienteId && clientes.find(c => c.id === borradorGuardado.clienteId) && ` · ${clientes.find(c => c.id === borradorGuardado.clienteId).nombre}`}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button onClick={restaurarBorrador}
                            style={{ fontSize: '13px', fontWeight: 600, color: '#d97706', backgroundColor: '#fff', border: '1px solid #d97706', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer' }}>
                            Restaurar
                        </button>
                        <button onClick={limpiarBorrador}
                            style={{ fontSize: '13px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', padding: '5px 8px' }}>
                            Descartar ×
                        </button>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Cliente</label>
                            <button type="button" onClick={() => setMostrarNuevoCliente(true)}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 500, color: '#d97706', backgroundColor: '#fffbeb', border: '1px solid #d97706', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer' }}>
                                <Plus size={12} /> Nuevo cliente
                            </button>
                        </div>
                        <div style={{ position: 'relative' }}>
                            {clienteSeleccionado ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', border: '1px solid #16a34a', borderRadius: '8px', backgroundColor: '#f0fdf4' }}>
                                    <div style={{ flex: 1, fontSize: '14px', color: '#1f2937' }}>
                                        <span style={{ fontFamily: 'monospace', color: '#6b7280', fontSize: '13px' }}>{clienteSeleccionado.rif}</span>
                                        <span style={{ margin: '0 6px', color: '#9ca3af' }}>·</span>
                                        <span style={{ fontWeight: 500 }}>{clienteSeleccionado.nombre}</span>
                                        {clienteSeleccionado.descripcion && <span style={{ color: '#9ca3af', marginLeft: '6px', fontSize: '13px' }}>— {clienteSeleccionado.descripcion}</span>}
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
                                                    {c.descripcion && <span style={{ color: '#9ca3af', marginLeft: '6px' }}>— {c.descripcion}</span>}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {listas.length > 0 && (
                                    <select value={listaId} onChange={e => setListaId(e.target.value)}
                                        style={{ padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', color: '#374151', backgroundColor: '#fff' }}>
                                        {(listasClienteIds ? listas.filter(l => listasClienteIds.has(l.id)) : listas)
                                            .map(l => <option key={l.id} value={l.id}>{l.nombre}{l.es_default ? ' ★' : ''}</option>)}
                                    </select>
                                )}
                                <button onClick={() => setMostrarNuevoProducto(true)}
                                    style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #d97706', cursor: 'pointer', backgroundColor: '#fffbeb', color: '#d97706', fontWeight: 500 }}>
                                    + Crear nuevo
                                </button>
                                {esAutopartes && (
                                    <button onClick={() => { setModoAvanzado(m => !m); setResultadosAvanzados(null); setBusqueda('') }}
                                        style={{
                                            fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid', cursor: 'pointer',
                                            borderColor: modoAvanzado ? '#1d4ed8' : '#d1d5db',
                                            backgroundColor: modoAvanzado ? '#eff6ff' : '#f9fafb',
                                            color: modoAvanzado ? '#1d4ed8' : '#6b7280', fontWeight: 500
                                        }}>
                                        {modoAvanzado ? 'Búsqueda simple' : 'Búsqueda avanzada'}
                                    </button>
                                )}
                            </div>
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
                                    <div style={{ marginTop: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '300px', overflowY: 'auto' }}>
                                        {productosFiltrados.length === 0 ? (
                                            <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                                Sin resultados
                                                <button onClick={() => setMostrarNuevoProducto(true)}
                                                    style={{ fontSize: '12px', color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                                                    + Crear "{busqueda}"
                                                </button>
                                            </div>
                                        ) : productosFiltrados.map(p => (
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
                                        {['Producto', 'Precio', 'Desc.%', 'Cant.', 'Subtotal', ''].map((h, i) => (
                                            <th key={i} style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={item.producto_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#1f2937', maxWidth: '320px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.nombre}>{item.nombre}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input type="number" min="0" step="0.01" value={item.precio_unitario}
                                                    onChange={e => cambiarPrecio(item.producto_id, e.target.value)}
                                                    style={{ width: '80px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input type="number" min="0" max="100" step="0.1"
                                                    value={item.descuento_item || ''}
                                                    onChange={e => setDescItem(item.producto_id, e.target.value)}
                                                    placeholder="0"
                                                    style={{ width: '60px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }} />
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <input type="number" min="1" max={item.stock} value={item.cantidad}
                                                        onChange={e => cambiarCantidad(item.producto_id, e.target.value)}
                                                        style={{ width: '60px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }} />
                                                    {item.unidad_venta_2 && (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                            <button onClick={() => item.unidadVenta !== '1' && cambiarUnidad(item.producto_id)}
                                                                style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', border: '1px solid', cursor: item.unidadVenta !== '1' ? 'pointer' : 'default', backgroundColor: item.unidadVenta === '1' ? '#16a34a' : '#f9fafb', color: item.unidadVenta === '1' ? '#fff' : '#6b7280', borderColor: item.unidadVenta === '1' ? '#16a34a' : '#d1d5db', whiteSpace: 'nowrap' }}>
                                                                {item.unidad_medida}
                                                            </button>
                                                            <button onClick={() => item.unidadVenta !== '2' && cambiarUnidad(item.producto_id)}
                                                                style={{ padding: '3px 10px', fontSize: '11px', fontWeight: 600, borderRadius: '6px', border: '1px solid', cursor: item.unidadVenta !== '2' ? 'pointer' : 'default', backgroundColor: item.unidadVenta === '2' ? '#16a34a' : '#f9fafb', color: item.unidadVenta === '2' ? '#fff' : '#6b7280', borderColor: item.unidadVenta === '2' ? '#16a34a' : '#d1d5db', whiteSpace: 'nowrap' }}>
                                                                {item.unidad_venta_2}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                                                {fmt(item.cantidad * item.precio_unitario * (1 - Number(item.descuento_item || 0) / 100))}
                                            </td>
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

                {/* Panel lateral de resumen y confirmación */}
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', height: 'fit-content', position: 'sticky', top: '24px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: '0 0 16px' }}>Resumen</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {[['Subtotal', fmt(subtotal)], ['IVA (16%)', fmt(impuesto)]].map(([l, v]) => (
                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280' }}>
                                <span>{l}</span><span>{v}</span>
                            </div>
                        ))}
                        {(Number(descuentoGlobal) > 0 || items.some(i => Number(i.descuento_item) > 0)) && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#16a34a' }}>
                                <span>Descuentos</span>
                                <span>-{fmt(totalBruto - total)}</span>
                            </div>
                        )}
                        <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>
                            <span>Total</span><span style={{ color: '#16a34a' }}>{fmt(total)}</span>
                        </div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>
                        {items.length} producto(s) · {items.reduce((s, i) => s + i.cantidad, 0)} unidades
                    </div>

                    {/* Descuento global */}
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Descuento global %</label>
                        <input type="number" min="0" max="100" step="0.1"
                            value={descuentoGlobal} onChange={e => setDescuentoGlobal(e.target.value)}
                            placeholder="0"
                            style={{ width: '100px', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '14px', fontWeight: 600, textAlign: 'center' }} />
                    </div>

                    {/* ── PANEL RETAIL: condición de pago + cobro inmediato ── */}
                    {esRetail && (
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
                            {/* N° de referencia (solo retail) */}
                            <div style={{ marginTop: '10px' }}>
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
                        </div>
                    )}

                    {/* ── PANEL MANUFACTURA: solo notas ── */}
                    {!esRetail && (
                        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px', marginBottom: '14px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                                Notas <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                            </label>
                            <textarea value={notas} onChange={e => setNotas(e.target.value)}
                                placeholder="Instrucciones de entrega, observaciones..."
                                rows={3}
                                style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical', color: '#374151' }} />
                        </div>
                    )}

                    {error && (
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>
                            {error}
                        </div>
                    )}

                    {/* Botón de acción — diferente según flujo */}
                    <button
                        onClick={procesar}
                        disabled={guardando || items.length === 0}
                        style={{ width: '100%', backgroundColor: items.length === 0 ? '#d1d5db' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: items.length === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <CheckCircle size={16} />
                        {guardando ? 'Procesando...' : esRetail ? 'Confirmar venta' : 'Registrar pedido'}
                    </button>

                    {!esRetail && (
                        <p style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', margin: '8px 0 0' }}>
                            El pedido pasa a {(perfil?.empresas?.aprobacion_pedido ?? true) ? 'aprobación' : 'despacho'} automáticamente
                        </p>
                    )}
                </div>
            </div>

            {mostrarNuevoProducto && (
                <ModalNuevoProductoVenta
                    perfil={perfil}
                    onCerrar={() => setMostrarNuevoProducto(false)}
                    onCreado={producto => {
                        setProductos(prev => [...prev, producto])
                        agregarProducto(producto)
                        setMostrarNuevoProducto(false)
                    }}
                />
            )}

            {mostrarNuevoCliente && (
                <ModalNuevoCliente
                    perfil={perfil}
                    onCerrar={() => setMostrarNuevoCliente(false)}
                    onCreado={nuevo => {
                        setClientes(prev => [...prev, { id: nuevo.id, nombre: nuevo.nombre, rif: nuevo.rif, descripcion: nuevo.descripcion, condicion_pago: nuevo.condicion_pago, dias_credito: nuevo.dias_credito }].sort((a, b) => a.nombre.localeCompare(b.nombre)))
                        elegirCliente({ id: nuevo.id, nombre: nuevo.nombre, rif: nuevo.rif, descripcion: nuevo.descripcion, condicion_pago: nuevo.condicion_pago, dias_credito: nuevo.dias_credito })
                        setMostrarNuevoCliente(false)
                    }}
                />
            )}

            {/* Modal de actualización de precios (solo retail) */}
            {esRetail && ventaPendiente && (
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
// ─── Modal Nuevo Producto (desde NuevaVenta) ──────────────────
const UNIDADES_VENTA = ['unidad', 'kg', 'g', 'litro', 'ml', 'caja', 'bolsa', 'rollo', 'metro', 'paquete', 'par', 'juego']
const TIPOS_PRODUCTO_VTA = ['producido', 'comprado']

function ModalNuevoProductoVenta({ perfil, onCreado, onCerrar }) {
    const [proveedores, setProveedores] = useState([])
    const [nombre, setNombre] = useState('')
    const [sku, setSku] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [tipoProducto, setTipoProducto] = useState('producido')
    const [unidad, setUnidad] = useState('unidad')
    const [precioVenta, setPrecioVenta] = useState('')
    const [costo, setCosto] = useState('')
    const [stockActual, setStockActual] = useState('')
    const [stockMinimo, setStockMinimo] = useState('')
    const [vidaUtilDias, setVidaUtilDias] = useState('')
    const [proveedorId, setProveedorId] = useState('')
    const [cat1, setCat1] = useState('')
    const [cat2, setCat2] = useState('')
    const [cat3, setCat3] = useState('')
    const [cat4, setCat4] = useState('')
    const [unidadVenta2, setUnidadVenta2] = useState('')
    const [factorConversion2, setFactorConversion2] = useState('')
    const [aplicaIva, setAplicaIva] = useState(true)
    const [activo, setActivo] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const esAutopartes = perfil?.empresas?.perfil_negocio === 'autopartes'
    const [formAuto, setFormAuto] = useState({ marca: '', nro_parte: '', tipo: '', barras_2: '', barras_3: '' })
    const [compats, setCompats] = useState([])
    const [nuevoCompat, setNuevoCompat] = useState({ marca_vehiculo: '', modelo: '', anio_desde: '', anio_hasta: '', posicion: '' })
    const [editandoCompatIdx, setEditandoCompatIdx] = useState(null)
    const [vehiculosData, setVehiculosData] = useState([])

    const marcasDisp = [...new Set(vehiculosData.map(v => v.marca))].sort()
    const modelosDisp = vehiculosData
        .filter(v => v.marca === nuevoCompat.marca_vehiculo)
        .map(v => v.modelo)
        .filter((m, i, a) => a.indexOf(m) === i)
        .sort()

    useEffect(() => {
        supabase.from('proveedores').select('id, nombre').eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => { if (data) setProveedores(data) })
        if (esAutopartes) {
            supabase.from('vehiculos').select('marca, modelo').eq('empresa_id', perfil.empresa_id).order('marca').order('modelo')
                .then(({ data }) => setVehiculosData(data || []))
        }
    }, [perfil.empresa_id])

    async function guardar() {
        if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
        if (!sku.trim()) { setError('El SKU es obligatorio'); return }
        setGuardando(true); setError('')

        const skuNorm = sku.trim().toUpperCase()
        const payload = {
            empresa_id: perfil.empresa_id,
            nombre: nombre.trim(),
            sku: skuNorm,
            descripcion: descripcion.trim() || null,
            tipo_producto: tipoProducto,
            unidad_medida: unidad,
            precio_venta: precioVenta !== '' ? Number(precioVenta) : null,
            costo_promedio: costo !== '' ? Number(costo) : null,
            stock_actual: stockActual !== '' ? Number(stockActual) : 0,
            stock_minimo: stockMinimo !== '' ? Number(stockMinimo) : null,
            vida_util_dias: vidaUtilDias !== '' ? Number(vidaUtilDias) : null,
            proveedor_preferido_id: proveedorId || null,
            categoria_1: cat1.trim() || null,
            categoria_2: cat2.trim() || null,
            categoria_3: cat3.trim() || null,
            categoria_4: cat4.trim() || null,
            unidad_venta_2: unidadVenta2.trim() || null,
            factor_conversion_2: factorConversion2 !== '' ? Number(factorConversion2) : null,
            aplica_iva: aplicaIva,
            activo,
        }

        const { data, error: err } = await supabase.from('productos_terminados').insert(payload).select('id').single()
        if (err) {
            setGuardando(false)
            setError(err.code === '23505' ? `El SKU "${skuNorm}" ya existe. Elige otro.` : 'Error: ' + err.message)
            return
        }

        if (esAutopartes) {
            await supabase.from('productos_autopartes').insert({
                producto_id: data.id, empresa_id: perfil.empresa_id,
                marca: formAuto.marca.trim() || null, nro_parte: formAuto.nro_parte.trim() || null,
                tipo: formAuto.tipo.trim() || null, barras_2: formAuto.barras_2.trim() || null,
                barras_3: formAuto.barras_3.trim() || null,
            })
            for (const c of compats) {
                if (!c.marca_vehiculo.trim() || !c.modelo.trim()) continue
                const { data: existing } = await supabase.from('vehiculos').select('id')
                    .eq('empresa_id', perfil.empresa_id).eq('marca', c.marca_vehiculo.trim()).eq('modelo', c.modelo.trim()).maybeSingle()
                let vehiculoId = existing?.id
                if (!vehiculoId) {
                    const { data: newV } = await supabase.from('vehiculos').insert({
                        empresa_id: perfil.empresa_id, marca: c.marca_vehiculo.trim(), modelo: c.modelo.trim(),
                    }).select('id').single()
                    vehiculoId = newV?.id
                }
                if (!vehiculoId) continue
                await supabase.from('producto_vehiculo').insert({
                    empresa_id: perfil.empresa_id, producto_id: data.id, vehiculo_id: vehiculoId,
                    año_inicio: parseInt(c.anio_desde) || 0, año_fin: parseInt(c.anio_hasta) || 9999,
                    posicion: c.posicion?.trim() || null,
                })
            }
        }

        onCreado({
            id: data.id,
            nombre: nombre.trim(),
            sku: skuNorm,
            precio_venta: precioVenta !== '' ? Number(precioVenta) : 0,
            stock_actual: stockActual !== '' ? Number(stockActual) : 0,
            aplica_iva: aplicaIva,
            unidad_medida: unidad,
            unidad_venta_2: unidadVenta2.trim() || null,
            factor_conversion_2: factorConversion2 !== '' ? Number(factorConversion2) : null,
        })
    }

    const inStyle = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box' }
    const labelStyle = { fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }
    const sectionStyle = { fontSize: '11px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '4px 0 10px', borderBottom: '1px solid #e5e7eb', paddingBottom: '4px' }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '560px', maxHeight: '90vh', overflowY: 'auto', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Nuevo producto terminado</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <p style={sectionStyle}>Información básica</p>

                    <div>
                        <label style={labelStyle}>Nombre *</label>
                        <input value={nombre} onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: Agua de Coco Natural 500ml" style={inStyle} autoFocus />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={labelStyle}>SKU *</label>
                            <input value={sku} onChange={e => setSku(e.target.value)}
                                placeholder="Ej: ACN-500" style={inStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Tipo de producto</label>
                            <select value={tipoProducto} onChange={e => setTipoProducto(e.target.value)} style={inStyle}>
                                {TIPOS_PRODUCTO_VTA.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label style={labelStyle}>Descripción</label>
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                            placeholder="Descripción opcional..." rows={2}
                            style={{ ...inStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                    </div>

                    <p style={sectionStyle}>Precios y costos</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={labelStyle}>Unidad de medida</label>
                            <select value={unidad} onChange={e => setUnidad(e.target.value)} style={inStyle}>
                                {UNIDADES_VENTA.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={labelStyle}>Precio de venta ($)</label>
                            <input type="number" min="0" step="0.01" value={precioVenta}
                                onChange={e => setPrecioVenta(e.target.value)} placeholder="0.00" style={inStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Costo promedio ($)</label>
                            <input type="number" min="0" step="0.01" value={costo}
                                onChange={e => setCosto(e.target.value)} placeholder="0.00" style={inStyle} />
                        </div>
                    </div>

                    <p style={sectionStyle}>Inventario</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={labelStyle}>Stock inicial</label>
                            <input type="number" min="0" step="0.01" value={stockActual}
                                onChange={e => setStockActual(e.target.value)} placeholder="0" style={inStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Stock mínimo</label>
                            <input type="number" min="0" step="0.01" value={stockMinimo}
                                onChange={e => setStockMinimo(e.target.value)} placeholder="0" style={inStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Vida útil (días)</label>
                            <input type="number" min="0" step="1" value={vidaUtilDias}
                                onChange={e => setVidaUtilDias(e.target.value)} placeholder="—" style={inStyle} />
                        </div>
                    </div>

                    <p style={sectionStyle}>Unidad de venta secundaria</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={labelStyle}>Unidad 2 (ej: caja)</label>
                            <input value={unidadVenta2} onChange={e => setUnidadVenta2(e.target.value)}
                                placeholder="Ej: caja" style={inStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Factor de conversión</label>
                            <input type="number" min="0" step="0.001" value={factorConversion2}
                                onChange={e => setFactorConversion2(e.target.value)} placeholder="Ej: 12" style={inStyle} />
                        </div>
                    </div>

                    <p style={sectionStyle}>Clasificación</p>

                    <div>
                        <label style={labelStyle}>Proveedor preferido</label>
                        <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} style={inStyle}>
                            <option value="">— Sin proveedor —</option>
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={labelStyle}>Categoría 1</label>
                            <input value={cat1} onChange={e => setCat1(e.target.value)} placeholder="Ej: Bebidas" style={inStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Categoría 2</label>
                            <input value={cat2} onChange={e => setCat2(e.target.value)} placeholder="Ej: Naturales" style={inStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Categoría 3</label>
                            <input value={cat3} onChange={e => setCat3(e.target.value)} placeholder="Ej: Sin azúcar" style={inStyle} />
                        </div>
                        <div>
                            <label style={labelStyle}>Categoría 4</label>
                            <input value={cat4} onChange={e => setCat4(e.target.value)} placeholder="" style={inStyle} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '20px', padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                            <input type="checkbox" checked={aplicaIva} onChange={e => setAplicaIva(e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }} />
                            Aplica IVA (16%)
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                            <input type="checkbox" checked={activo} onChange={e => setActivo(e.target.checked)}
                                style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }} />
                            Activo
                        </label>
                    </div>

                    {esAutopartes && (
                        <>
                            <p style={sectionStyle}>Datos de autoparte</p>
                            <div style={{ padding: '14px 16px', backgroundColor: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                    {[
                                        { key: 'marca', label: 'Marca', placeholder: 'Ej: Bosch' },
                                        { key: 'nro_parte', label: 'N° de parte', placeholder: 'Ej: 0001-234-567' },
                                        { key: 'tipo', label: 'Tipo', placeholder: 'Ej: Original, Aftermarket...' },
                                        { key: 'barras_2', label: 'Código barras 2', placeholder: 'Opcional' },
                                        { key: 'barras_3', label: 'Código barras 3', placeholder: 'Opcional' },
                                    ].map(f => (
                                        <div key={f.key}>
                                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                                            <input value={formAuto[f.key]} onChange={e => setFormAuto(p => ({ ...p, [f.key]: e.target.value }))}
                                                placeholder={f.placeholder} style={inStyle} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ padding: '14px 16px', backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                                <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', margin: '0 0 12px' }}>Compatibilidades de vehículos</p>
                                {marcasDisp.length === 0 && (
                                    <p style={{ fontSize: '12px', color: '#d97706', margin: '0 0 10px', padding: '8px 10px', backgroundColor: '#fffbeb', borderRadius: '6px', border: '1px solid #fde68a' }}>
                                        Sin vehículos en catálogo — agrégalos en Administración → Vehículos primero.
                                    </p>
                                )}
                                {compats.length > 0 && (
                                    <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {compats.map((c, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: editandoCompatIdx === i ? '#eff6ff' : '#fff', borderRadius: '8px', border: `1px solid ${editandoCompatIdx === i ? '#93c5fd' : '#e5e7eb'}` }}>
                                                <span style={{ flex: 1, fontSize: '13px', color: '#374151' }}>
                                                    {c.marca_vehiculo} {c.modelo}
                                                    {(c.anio_desde || c.anio_hasta) && ` (${c.anio_desde || ''}${c.anio_hasta ? ' – ' + c.anio_hasta : ''})`}
                                                    {c.posicion && <span style={{ marginLeft: '6px', fontSize: '11px', backgroundColor: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '10px' }}>{c.posicion}</span>}
                                                </span>
                                                <button onClick={() => { setNuevoCompat({ ...c }); setEditandoCompatIdx(i) }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: '2px' }}>
                                                    <Edit size={14} />
                                                </button>
                                                <button onClick={() => { setCompats(prev => prev.filter((_, j) => j !== i)); if (editandoCompatIdx === i) { setEditandoCompatIdx(null); setNuevoCompat({ marca_vehiculo: '', modelo: '', anio_desde: '', anio_hasta: '', posicion: '' }) } }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: '2px' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px 60px 1fr auto', gap: '8px', alignItems: 'end' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Marca *</label>
                                        <select value={nuevoCompat.marca_vehiculo} onChange={e => setNuevoCompat(p => ({ ...p, marca_vehiculo: e.target.value, modelo: '' }))}
                                            style={{ ...inStyle, fontSize: '13px', padding: '6px 8px' }}>
                                            <option value="">— Marca —</option>
                                            {marcasDisp.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Modelo *</label>
                                        <select value={nuevoCompat.modelo} onChange={e => setNuevoCompat(p => ({ ...p, modelo: e.target.value }))}
                                            disabled={!nuevoCompat.marca_vehiculo}
                                            style={{ ...inStyle, fontSize: '13px', padding: '6px 8px', opacity: !nuevoCompat.marca_vehiculo ? 0.5 : 1 }}>
                                            <option value="">— Modelo —</option>
                                            {modelosDisp.map(m => <option key={m} value={m}>{m}</option>)}
                                        </select>
                                    </div>
                                    {[{ key: 'anio_desde', label: 'Desde', ph: '2010' }, { key: 'anio_hasta', label: 'Hasta', ph: '2024' }].map(f => (
                                        <div key={f.key}>
                                            <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                                            <input type="number" value={nuevoCompat[f.key]} onChange={e => setNuevoCompat(p => ({ ...p, [f.key]: e.target.value }))}
                                                placeholder={f.ph} style={{ ...inStyle, fontSize: '13px', padding: '6px 8px' }} />
                                        </div>
                                    ))}
                                    <div>
                                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Posición</label>
                                        <select value={nuevoCompat.posicion} onChange={e => setNuevoCompat(p => ({ ...p, posicion: e.target.value }))}
                                            style={{ ...inStyle, fontSize: '13px', padding: '6px 8px' }}>
                                            <option value="">— Todas —</option>
                                            <option value="delantera">Delantera</option>
                                            <option value="trasera">Trasera</option>
                                            <option value="delantera izquierda">Del. Izq.</option>
                                            <option value="delantera derecha">Del. Der.</option>
                                            <option value="trasera izquierda">Tras. Izq.</option>
                                            <option value="trasera derecha">Tras. Der.</option>
                                            <option value="izquierda">Izquierda</option>
                                            <option value="derecha">Derecha</option>
                                        </select>
                                    </div>
                                    <button onClick={() => {
                                        if (!nuevoCompat.marca_vehiculo.trim() || !nuevoCompat.modelo.trim()) return
                                        if (editandoCompatIdx !== null) {
                                            setCompats(prev => prev.map((c, j) => j === editandoCompatIdx ? { ...nuevoCompat } : c))
                                            setEditandoCompatIdx(null)
                                        } else {
                                            setCompats(prev => [...prev, { ...nuevoCompat }])
                                        }
                                        setNuevoCompat({ marca_vehiculo: '', modelo: '', anio_desde: '', anio_hasta: '', posicion: '' })
                                    }} style={{ backgroundColor: editandoCompatIdx !== null ? '#d97706' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        {editandoCompatIdx !== null ? 'Actualizar' : '+ Agregar'}
                                    </button>
                                </div>
                                {editandoCompatIdx !== null && (
                                    <div style={{ marginTop: '6px', textAlign: 'right' }}>
                                        <button onClick={() => { setEditandoCompatIdx(null); setNuevoCompat({ marca_vehiculo: '', modelo: '', anio_desde: '', anio_hasta: '', posicion: '' }) }}
                                            style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
                                            Cancelar edición
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {error && (
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                        <button onClick={guardar} disabled={guardando}
                            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1 }}>
                            <Check size={16} /> {guardando ? 'Guardando...' : 'Crear y agregar'}
                        </button>
                        <button onClick={onCerrar}
                            style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}

// ─── Modal Nuevo Cliente (en NuevaVenta) ────────────────────────────────────
const VACIO_CLI = {
    nombre: '', rif: '', telefono: '', email: '', descripcion: '',
    condicion_pago: 'contado', dias_credito: 0, limite_credito: 0,
    activo: true, contribuyente_especial: false, tipo_cliente_id: '',
    direccion_fiscal: '', cat1_id: '', cat2_id: '', cat3_id: '', cat4_id: '',
}
const VACIO_DIR_CLI = {
    nombre: '', direccion: '', ciudad: '', estado_region: '',
    contacto: '', telefono: '', es_principal: false, activo: true,
}
const inpStyle = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }

function ModalNuevoCliente({ perfil, onCreado, onCerrar }) {
    const [form, setForm] = useState(VACIO_CLI)
    const [tiposCliente, setTiposCliente] = useState([])
    const [cats1, setCats1] = useState([])
    const [cats2, setCats2] = useState([])
    const [cats3, setCats3] = useState([])
    const [cats4, setCats4] = useState([])
    const [listasEmpresa, setListasEmpresa] = useState([])
    const [listasSeleccionadas, setListasSeleccionadas] = useState(new Set())
    const [listaDefaultId, setListaDefaultId] = useState('')
    const [direcciones, setDirecciones] = useState([])
    const [modalDir, setModalDir] = useState(null)
    const [formDir, setFormDir] = useState(VACIO_DIR_CLI)
    const [guardandoDir, setGuardandoDir] = useState(false)
    const [errorDir, setErrorDir] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        supabase.from('perfilamiento_clientes').select('id, nombre')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setTiposCliente(data || []))
        supabase.from('categorias_clientes').select('id, nombre, nivel, padre_id, activo')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nivel').order('nombre')
            .then(({ data }) => {
                const d = data || []
                setCats1(d.filter(c => c.nivel === 1))
                setCats2(d.filter(c => c.nivel === 2))
                setCats3(d.filter(c => c.nivel === 3))
                setCats4(d.filter(c => c.nivel === 4))
            })
        supabase.from('listas_precio').select('id, nombre, es_default')
            .eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setListasEmpresa(data || []))
    }, [])

    const campo = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
    const campoDir = (k, v) => setFormDir(prev => ({ ...prev, [k]: v }))

    function abrirNuevaDir() {
        setFormDir({ ...VACIO_DIR_CLI, es_principal: direcciones.length === 0 })
        setErrorDir(''); setModalDir('nuevo')
    }

    function guardarDirLocal() {
        if (!formDir.nombre.trim()) { setErrorDir('El nombre es obligatorio'); return }
        if (!formDir.direccion.trim()) { setErrorDir('La dirección es obligatoria'); return }
        const dir = {
            nombre: formDir.nombre.trim(), direccion: formDir.direccion.trim(),
            ciudad: formDir.ciudad.trim() || null, estado_region: formDir.estado_region.trim() || null,
            contacto: formDir.contacto.trim() || null, telefono: formDir.telefono.trim() || null,
            es_principal: formDir.es_principal, activo: formDir.activo,
            id: modalDir === 'nuevo' ? `temp_${Date.now()}` : modalDir.id,
        }
        if (modalDir === 'nuevo') {
            setDirecciones(prev => [...prev, dir])
        } else {
            setDirecciones(prev => prev.map(d => d.id === dir.id ? dir : d))
        }
        setModalDir(null)
    }

    async function guardar() {
        if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
        setGuardando(true); setError('')
        const payload = {
            nombre: form.nombre.trim(),
            rif: form.rif.trim() || null,
            telefono: form.telefono.trim() || null,
            email: form.email.trim() || null,
            descripcion: form.descripcion.trim() || null,
            condicion_pago: form.condicion_pago,
            dias_credito: form.condicion_pago === 'credito' ? Number(form.dias_credito) : 0,
            limite_credito: Number(form.limite_credito) || 0,
            activo: form.activo,
            contribuyente_especial: form.contribuyente_especial,
            tipo_cliente_id: form.tipo_cliente_id || null,
            direccion_fiscal: form.direccion_fiscal.trim() || null,
            cat1_id: form.cat1_id || null,
            cat2_id: form.cat2_id || null,
            cat3_id: form.cat3_id || null,
            cat4_id: form.cat4_id || null,
            empresa_id: perfil.empresa_id,
        }
        const { data, error: err } = await supabase.from('clientes').insert(payload).select()
        if (err) { setGuardando(false); setError('Error: ' + err.message); return }
        const nuevoId = data[0].id
        if (direcciones.length > 0) {
            await supabase.from('direcciones_entrega').insert(
                direcciones.map(d => ({ ...d, id: undefined, cliente_id: nuevoId, empresa_id: perfil.empresa_id }))
            )
        }
        if (listasSeleccionadas.size > 0) {
            await supabase.from('cliente_listas_precio').insert(
                Array.from(listasSeleccionadas).map(lid => ({
                    empresa_id: perfil.empresa_id,
                    cliente_id: nuevoId,
                    lista_precio_id: lid,
                    es_default: lid === listaDefaultId,
                }))
            )
        }
        setGuardando(false)
        onCreado({ id: nuevoId, nombre: payload.nombre, rif: payload.rif, descripcion: payload.descripcion, condicion_pago: payload.condicion_pago, dias_credito: payload.dias_credito })
    }

    const secStyle = { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '16px' }
    const secTitle = { fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 14px' }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '620px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Nuevo cliente</h3>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                {/* Datos generales */}
                <div style={secStyle}>
                    <p style={secTitle}>Datos generales</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Nombre *</label>
                            <input value={form.nombre} onChange={e => campo('nombre', e.target.value)} style={inpStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>RIF / Cédula</label>
                            <input value={form.rif} onChange={e => campo('rif', e.target.value)} placeholder="J-12345678-9" style={inpStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Teléfono</label>
                            <input value={form.telefono} onChange={e => campo('telefono', e.target.value)} placeholder="0414-000-0000" style={inpStyle} />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Email</label>
                            <input type="email" value={form.email} onChange={e => campo('email', e.target.value)} placeholder="correo@empresa.com" style={inpStyle} />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Descripción</label>
                            <textarea value={form.descripcion} onChange={e => campo('descripcion', e.target.value)} placeholder="Breve descripción del cliente..." rows={2} style={{ ...inpStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                        </div>
                        <div style={{ gridColumn: 'span 2' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Dirección Fiscal</label>
                            <textarea value={form.direccion_fiscal} onChange={e => campo('direccion_fiscal', e.target.value)} placeholder="Domicilio fiscal completo..." rows={2} style={{ ...inpStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Condición de pago</label>
                            <select value={form.condicion_pago} onChange={e => campo('condicion_pago', e.target.value)} style={inpStyle}>
                                <option value="contado">Contado</option>
                                <option value="credito">Crédito</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Días de crédito</label>
                            <input type="number" min="0" value={form.dias_credito} onChange={e => campo('dias_credito', e.target.value)} disabled={form.condicion_pago === 'contado'} placeholder="Ej: 30" style={{ ...inpStyle, backgroundColor: form.condicion_pago === 'contado' ? '#f9fafb' : '#fff', color: form.condicion_pago === 'contado' ? '#9ca3af' : '#374151' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Límite de crédito (USD)</label>
                            <input type="number" min="0" step="0.01" value={form.limite_credito} onChange={e => campo('limite_credito', e.target.value)} placeholder="Ej: 5000" style={inpStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Tipo de cliente</label>
                            <select value={form.tipo_cliente_id} onChange={e => campo('tipo_cliente_id', e.target.value)} style={inpStyle}>
                                <option value="">— Sin clasificar —</option>
                                {tiposCliente.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                            </select>
                        </div>
                        <div style={{ gridColumn: 'span 2', display: 'flex', gap: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" id="nc_activo" checked={form.activo} onChange={e => campo('activo', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                <label htmlFor="nc_activo" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Cliente activo</label>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" id="nc_contrib" checked={form.contribuyente_especial} onChange={e => campo('contribuyente_especial', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                <label htmlFor="nc_contrib" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Contribuyente Especial</label>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Clasificación */}
                {(cats1.length > 0 || cats2.length > 0 || cats3.length > 0 || cats4.length > 0) && (
                    <div style={secStyle}>
                        <p style={secTitle}>Clasificación</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                            {[
                                { label: 'Categoría 1', key: 'cat1_id', lista: cats1 },
                                { label: 'Categoría 2', key: 'cat2_id', lista: cats2 },
                                { label: 'Categoría 3', key: 'cat3_id', lista: cats3 },
                                { label: 'Categoría 4', key: 'cat4_id', lista: cats4 },
                            ].map(({ label, key, lista }) => lista.length > 0 && (
                                <div key={key}>
                                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>{label}</label>
                                    <select value={form[key]} onChange={e => campo(key, e.target.value)} style={inpStyle}>
                                        <option value="">— Sin categoría —</option>
                                        {lista.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Listas de precio */}
                {listasEmpresa.length > 0 && (
                    <div style={secStyle}>
                        <p style={{ ...secTitle, margin: '0 0 4px' }}>Listas de precio</p>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 12px' }}>Marca las listas disponibles para este cliente. La marcada como default se pre-selecciona en ventas.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {listasEmpresa.map(l => {
                                const checked = listasSeleccionadas.has(l.id)
                                const isDefault = listaDefaultId === l.id
                                return (
                                    <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '8px', backgroundColor: checked ? '#f0fdf4' : '#f9fafb', border: `1px solid ${checked ? '#bbf7d0' : '#e5e7eb'}` }}>
                                        <input type="checkbox" id={`ncl_${l.id}`} checked={checked}
                                            onChange={e => {
                                                const next = new Set(listasSeleccionadas)
                                                if (e.target.checked) next.add(l.id)
                                                else { next.delete(l.id); if (listaDefaultId === l.id) setListaDefaultId('') }
                                                setListasSeleccionadas(next)
                                            }}
                                            style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }} />
                                        <label htmlFor={`ncl_${l.id}`} style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: '#1f2937', cursor: 'pointer' }}>
                                            {l.nombre}
                                            {l.es_default && <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>(global default)</span>}
                                        </label>
                                        {checked && (
                                            <button type="button" onClick={() => setListaDefaultId(isDefault ? '' : l.id)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, border: '1px solid', cursor: 'pointer', borderColor: isDefault ? '#16a34a' : '#d1d5db', backgroundColor: isDefault ? '#16a34a' : '#fff', color: isDefault ? '#fff' : '#9ca3af' }}>
                                                {isDefault ? '★ Default' : '☆ Default'}
                                            </button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* Direcciones de entrega */}
                <div style={secStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPin size={15} style={{ color: '#6b7280' }} />
                            <p style={secTitle}>Direcciones de entrega</p>
                        </div>
                        <button onClick={abrirNuevaDir}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '5px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                            <Plus size={12} /> Agregar
                        </button>
                    </div>
                    {direcciones.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '16px', color: '#9ca3af', fontSize: '13px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db' }}>Sin direcciones — opcional, puedes agregar después</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {direcciones.map((dir, idx) => (
                                <div key={dir.id || idx} style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '10px 14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>{dir.nombre}</span>
                                                {dir.es_principal && (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', backgroundColor: '#fef9c3', color: '#854d0e', padding: '1px 7px', borderRadius: '20px', border: '1px solid #fde68a' }}>
                                                        <Star size={10} /> Principal
                                                    </span>
                                                )}
                                            </div>
                                            <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>{dir.direccion}</p>
                                            {(dir.ciudad || dir.estado_region) && <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0' }}>{[dir.ciudad, dir.estado_region].filter(Boolean).join(', ')}</p>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                                            <button onClick={() => { setFormDir({ nombre: dir.nombre, direccion: dir.direccion, ciudad: dir.ciudad || '', estado_region: dir.estado_region || '', contacto: dir.contacto || '', telefono: dir.telefono || '', es_principal: dir.es_principal, activo: dir.activo }); setErrorDir(''); setModalDir(dir) }}
                                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                Editar
                                            </button>
                                            <button onClick={() => setDirecciones(prev => prev.filter((_, i) => i !== idx))}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '3px 4px' }}>
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '14px' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        <Check size={16} /> {guardando ? 'Guardando...' : 'Crear cliente'}
                    </button>
                    <button onClick={onCerrar} style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
                </div>

                {/* Modal de dirección anidado */}
                {modalDir && (
                    <>
                        <div onClick={() => setModalDir(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
                        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '500px', zIndex: 70, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{modalDir === 'nuevo' ? 'Nueva dirección' : 'Editar dirección'}</h3>
                                <button onClick={() => setModalDir(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Nombre del punto *</label>
                                    <input value={formDir.nombre} onChange={e => campoDir('nombre', e.target.value)} placeholder="Ej: Sede Principal" style={inpStyle} />
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Dirección *</label>
                                    <textarea value={formDir.direccion} onChange={e => campoDir('direccion', e.target.value)} placeholder="Dirección completa" rows={2} style={{ ...inpStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Ciudad</label>
                                    <input value={formDir.ciudad} onChange={e => campoDir('ciudad', e.target.value)} placeholder="Caracas" style={inpStyle} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Estado</label>
                                    <input value={formDir.estado_region} onChange={e => campoDir('estado_region', e.target.value)} placeholder="Miranda" style={inpStyle} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Persona de contacto</label>
                                    <input value={formDir.contacto} onChange={e => campoDir('contacto', e.target.value)} placeholder="Nombre del receptor" style={inpStyle} />
                                </div>
                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Teléfono de contacto</label>
                                    <input value={formDir.telefono} onChange={e => campoDir('telefono', e.target.value)} placeholder="0414-000-0000" style={inpStyle} />
                                </div>
                                <div style={{ gridColumn: 'span 2', display: 'flex', gap: '20px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="checkbox" id="dir_nc_princ" checked={formDir.es_principal} onChange={e => campoDir('es_principal', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                        <label htmlFor="dir_nc_princ" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Dirección principal</label>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <input type="checkbox" id="dir_nc_activa" checked={formDir.activo} onChange={e => campoDir('activo', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                        <label htmlFor="dir_nc_activa" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Activa</label>
                                    </div>
                                </div>
                            </div>
                            {errorDir && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{errorDir}</div>}
                            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                <button onClick={guardarDirLocal} disabled={guardandoDir}
                                    style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                                    <Check size={16} /> Guardar dirección
                                </button>
                                <button onClick={() => setModalDir(null)} style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    )
}

function Factura({ venta, onVolver, onDevolucionCreada }) {
    const { perfil } = useAuth()
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

    const subtotal = venta.subtotal != null ? venta.subtotal : items.reduce((s, i) => {
        const lineTotal = i.cantidad * i.precio_unitario
        return s + ((i.aplica_iva ?? true) ? lineTotal / 1.16 : lineTotal)
    }, 0)
    const total = venta.total != null ? venta.total : subtotal
    const impuesto = total - subtotal
    const puedeDevolver = venta.estado_cobro !== 'anulado'
    const [refEditando, setRefEditando] = useState(false)
    const [refValor, setRefValor] = useState(venta.nro_referencia || '')

    async function guardarRef() {
        const { error } = await supabase.from('ventas').update({ nro_referencia: refValor.trim() || null }).eq('id', venta.id)
        if (!error) {
            setRefEditando(false)
        } else {
            alert('Error al guardar la referencia')
        }
    }

    const numeroDoc = venta.numero_factura ? venta.numero_factura.replace('FAC-', 'NE-') : ''

    if (mostrarDevolucion)
        return <FormDevolucion
            venta={venta}
            items={items}
            onCancelar={() => setMostrarDevolucion(false)}
            onConfirmada={() => { onDevolucionCreada() }}
        />

    return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>

            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .print-target, .print-target * { visibility: visible; }
                    .print-target {
                        position: absolute; left: 0; top: 0; width: 100%;
                        margin: 0; padding: 20px !important;
                        border: none !important; box-shadow: none !important; background: white !important;
                    }
                    .no-print { display: none !important; }
                }
            `}</style>

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

            <div className="print-target" style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>{perfil?.empresas?.nombre || 'Mi Empresa'}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>RIF: {perfil?.empresas?.rif || ''}</div>
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
