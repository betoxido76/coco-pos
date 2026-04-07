import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Search, Trash2, CheckCircle, FileText, X, AlertTriangle } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

// ─── Componente principal ──────────────────────────────────────
export default function Compras() {
    const [vista, setVista] = useState('lista')
    const [compras, setCompras] = useState([])
    const [compraActual, setCompraActual] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => { cargarCompras() }, [])

    async function cargarCompras() {
        setLoading(true)
        const { data } = await supabase
            .from('compras')
            .select(`*, proveedores(nombre)`)
            .order('created_at', { ascending: false })
            .limit(50)
        if (data) setCompras(data)
        setLoading(false)
    }

    function abrirDetalle(compra) {
        setCompraActual(compra)
        setVista('detalle')
    }

    if (vista === 'nueva')
        return <NuevaCompra
            onCompraCreada={(c) => { cargarCompras(); setCompraActual(c); setVista('detalle') }}
            onCancelar={() => setVista('lista')}
        />

    if (vista === 'detalle')
        return <DetalleCompra
            compra={compraActual}
            onVolver={() => { cargarCompras(); setVista('lista') }}
        />

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Recepción de Inventario</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Historial de compras y entradas</p>
                </div>
                <button
                    onClick={() => setVista('nueva')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}
                >
                    <Plus size={16} /> Nueva recepción
                </button>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : compras.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay compras registradas.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Documento', 'Proveedor', 'Fecha', 'Total', 'Estado', 'Cobro', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', textAlign: i === 3 ? 'right' : 'left', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {compras.map(c => (
                                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{c.numero_doc || 'S/N'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{c.proveedores?.nombre || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{new Date(c.fecha_compra).toLocaleDateString('es-VE')}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(c.total)}</td>
                                    <td style={{ padding: '12px 16px' }}><BadgeEstado estado={c.estado} /></td>
                                    <td style={{ padding: '12px 16px' }}><BadgeCobro estado={c.estado_cobro || 'pendiente'} /></td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <button onClick={() => abrirDetalle(c)}
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
        </div>
    )
}

// ─── Badges ────────────────────────────────────────────────────
function BadgeEstado({ estado }) {
    const estilos = {
        recibida: { bg: '#dcfce7', color: '#166534' },
        pendiente: { bg: '#fef9c3', color: '#854d0e' },
        anulada: { bg: '#fee2e2', color: '#991b1b' },
    }
    const s = estilos[estado] || estilos.pendiente
    return <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{estado}</span>
}

function BadgeCobro({ estado }) {
    const estilos = {
        pendiente: { bg: '#fef9c3', color: '#854d0e' },
        parcial: { bg: '#dbeafe', color: '#1e40af' },
        pagado: { bg: '#dcfce7', color: '#166534' },
    }
    const s = estilos[estado] || estilos.pendiente
    return <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{estado}</span>
}

// ─── Nueva Compra ──────────────────────────────────────────────
function NuevaCompra({ onCompraCreada, onCancelar }) {
    const [proveedores, setProveedores] = useState([])
    const [insumos, setInsumos] = useState([])
    const [proveedorId, setProveedorId] = useState('')
    const [busqueda, setBusqueda] = useState('')
    const [items, setItems] = useState([])
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [mostrarModal, setMostrarModal] = useState(false)

    useEffect(() => {
        supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre')
            .then(({ data }) => setProveedores(data || []))
        
        // Cargar insumos de las 3 tablas
        Promise.all([
            supabase.from('materias_primas').select('id, nombre, codigo, stock_actual, unidad_medida, costo_compra_promedio').eq('activo', true),
            supabase.from('materiales_empaque').select('id, nombre, codigo, stock_actual, unidad_medida, costo_compra_promedio').eq('activo', true),
            supabase.from('productos_terminados').select('id, nombre, sku, stock_actual, unidad_medida, costo_promedio').eq('activo', true)
        ]).then(([mp, emp, pt]) => {
            const unidos = [
                ...(mp.data || []).map(i => ({ ...i, tipo: 'materias_primas', costo: i.costo_compra_promedio })),
                ...(emp.data || []).map(i => ({ ...i, tipo: 'materiales_empaque', costo: i.costo_compra_promedio })),
                ...(pt.data || []).map(i => ({ ...i, tipo: 'productos_terminados', costo: i.costo_promedio, codigo: i.sku }))
            ]
            setInsumos(unidos)
        })
    }, [])

    const insumosFiltrados = insumos.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo?.toLowerCase().includes(busqueda.toLowerCase())
    )

    function agregarInsumo(ins) {
        setItems(prev => {
            const existe = prev.find(i => i.id === ins.id && i.tipo === ins.tipo)
            if (existe) return prev.map(i => (i.id === ins.id && i.tipo === ins.tipo) ? { ...i, cantidad: i.cantidad + 1 } : i)
            return [...prev, { id: ins.id, tipo: ins.tipo, nombre: ins.nombre, codigo: ins.codigo, cantidad: 1, precio_unitario: ins.costo || 0, stock: ins.stock_actual }]
        })
        setBusqueda('')
    }

    function cambiarCantidad(id, tipo, valor) {
        const n = parseInt(valor)
        if (isNaN(n) || n < 1) return
        setItems(prev => prev.map(i => (i.id === id && i.tipo === tipo) ? { ...i, cantidad: n } : i))
    }

    function eliminarItem(id, tipo) {
        setItems(prev => prev.filter(i => !(i.id === id && i.tipo === tipo)))
    }

    const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
    const impuesto = subtotal * 0.16
    const total = subtotal + impuesto

    function abrirConfirmacion() {
        if (!proveedorId) { setError('Selecciona un proveedor'); return }
        if (items.length === 0) { setError('Agrega al menos un insumo'); return }
        setError('')
        setMostrarModal(true)
    }

    async function confirmarCompra(datosPago) {
        setGuardando(true)
        setError('')
        const { data: { user } } = await supabase.auth.getUser()
        const numero = `OC-${Date.now().toString().slice(-6)}`

        const payloadCompra = {
            proveedor_id: proveedorId,
            usuario_id: user.id,
            numero_doc: numero,
            subtotal,
            total,
            estado: 'recibida',
            fecha_compra: new Date().toISOString(),
            ...datosPago
        }

        const { data: compra, error: errCompra } = await supabase.from('compras').insert(payloadCompra).select().single()
        if (errCompra) { setError('Error al crear la compra: ' + errCompra.message); setGuardando(false); return }

        await supabase.from('compra_items').insert(
            items.map(i => ({ compra_id: compra.id, tipo_insumo: i.tipo, insumo_id: i.id, cantidad: i.cantidad, precio_unitario: i.precio_unitario }))
        )

        // Actualizar stock
        for (const item of items) {
            const tabla = item.tipo === 'materias_primas' ? 'materias_primas' : item.tipo === 'materiales_empaque' ? 'materiales_empaque' : 'productos_terminados'
            const { data: actual } = await supabase.from(tabla).select('stock_actual').eq('id', item.id).single()
            await supabase.from(tabla).update({ stock_actual: (actual?.stock_actual || 0) + item.cantidad }).eq('id', item.id)
        }

        setGuardando(false)
        setMostrarModal(false)
        onCompraCreada({ ...compra, proveedores: { nombre: proveedores.find(p => p.id === proveedorId)?.nombre } })
    }

    return (
        <div style={{ padding: '24px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Nueva recepción</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Proveedor</label>
                        <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff' }}>
                            <option value="">Seleccionar proveedor...</option>
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                    </div>

                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Agregar insumos</label>
                        <div style={{ position: 'relative' }}>
                            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                            <input type="text" placeholder="Buscar por nombre o código..." value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                        </div>
                        {busqueda && (
                            <div style={{ marginTop: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                                {insumosFiltrados.length === 0
                                    ? <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>Sin resultados</div>
                                    : insumosFiltrados.map(p => (
                                        <div key={`${p.id}-${p.tipo}`} onClick={() => agregarInsumo(p)}
                                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            <div>
                                                <span style={{ fontWeight: 500, color: '#1f2937' }}>{p.nombre}</span>
                                                <span style={{ color: '#9ca3af', marginLeft: '8px', fontFamily: 'monospace', fontSize: '11px' }}>{p.codigo}</span>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontWeight: 600, color: '#16a34a' }}>{fmt(p.costo)}</div>
                                                <div style={{ fontSize: '11px', color: '#9ca3af' }}>Stock: {p.stock_actual}</div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        )}
                    </div>

                    {items.length > 0 && (
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {['Insumo', 'Tipo', 'Precio', 'Cant.', 'Subtotal', ''].map((h, i) => (
                                            <th key={i} style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={`${item.id}-${item.tipo}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#1f2937' }}>{item.nombre}</td>
                                            <td style={{ padding: '10px 12px', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{item.tipo.replace('_', ' ')}</td>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#6b7280' }}>{fmt(item.precio_unitario)}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input type="number" min="1" value={item.cantidad}
                                                    onChange={e => cambiarCantidad(item.id, item.tipo, e.target.value)}
                                                    style={{ width: '60px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }} />
                                            </td>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{fmt(item.cantidad * item.precio_unitario)}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <button onClick={() => eliminarItem(item.id, item.tipo)}
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
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: '0 0 16px' }}>Resumen de compra</h2>
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
                        {items.length} insumo(s) · {items.reduce((s, i) => s + i.cantidad, 0)} unidades
                    </div>
                    {error && (
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>
                            {error}
                        </div>
                    )}
                    <button onClick={abrirConfirmacion} disabled={guardando || items.length === 0}
                        style={{ width: '100%', backgroundColor: items.length === 0 ? '#d1d5db' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: items.length === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <CheckCircle size={16} />
                        {guardando ? 'Procesando...' : 'Confirmar recepción'}
                    </button>
                </div>
            </div>

            {mostrarModal && (
                <ModalPagoCompra
                    total={total}
                    onCerrar={() => setMostrarModal(false)}
                    onConfirmar={confirmarCompra}
                />
            )}
        </div>
    )
}

// ─── Modal de Pago Compra ──────────────────────────────────────
function ModalPagoCompra({ total, onCerrar, onConfirmar }) {
    const [condicion, setCondicion] = useState('contado')
    const [diasCredito, setDiasCredito] = useState(30)
    const [tasas, setTasas] = useState({ tasa_bbc: 1, tasa_euro: 1, tasa_binance: 1 })
    const [tipoTasa, setTipoTasa] = useState('tasa_bbc')
    const [pagoUsd, setPagoUsd] = useState(total)
    const [pagoBs, setPagoBs] = useState(0)
    const [metodoUsd, setMetodoUsd] = useState('Transferencia USD')
    const [metodoBs, setMetodoBs] = useState('Pago Móvil')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        supabase.from('configuracion').select('clave, valor').then(({ data }) => {
            if (data) {
                const m = {}; data.forEach(r => m[r.clave] = Number(r.valor))
                setTasas({ tasa_bbc: m.tasa_bbc || 1, tasa_euro: m.tasa_euro || 1, tasa_binance: m.tasa_binance || 1 })
            }
        })
    }, [])

    const tasa = tasas[tipoTasa] || 1
    const fechaVenc = condicion === 'credito' ? new Date(Date.now() + diasCredito * 86400000).toISOString().split('T')[0] : null

    function handleUsdChange(val) {
        const n = Math.max(0, Number(val))
        setPagoUsd(n)
        setPagoBs(parseFloat((Math.max(0, total - n) * tasa).toFixed(2)))
    }

    async function confirmar() {
        const abonoEnUsd = pagoUsd + (pagoBs / tasa)
        if (abonoEnUsd < total - 0.01 && condicion === 'contado') {
            setError('El monto pagado no cubre el total para pago contado'); return
        }
        setGuardando(true); setError('')
        await onConfirmar({
            condicion_pago: condicion,
            dias_credito: condicion === 'credito' ? diasCredito : 0,
            fecha_vencimiento_pago: fechaVenc,
            estado_cobro: condicion === 'contado' ? 'pagado' : 'pendiente',
            tasa_cambio: tasa,
            tipo_tasa: tipoTasa,
            pago_usd: pagoUsd,
            pago_bs: pagoBs,
            metodo_usd: metodoUsd,
            metodo_bs: metodoBs
        })
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '460px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Confirmar pago</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Total a pagar</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{fmt(total)}</div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    {['contado', 'credito'].map(c => (
                        <button key={c} onClick={() => setCondicion(c)}
                            style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid', cursor: 'pointer',
                                borderColor: condicion === c ? '#16a34a' : '#e5e7eb', backgroundColor: condicion === c ? '#f0fdf4' : '#fff', color: condicion === c ? '#16a34a' : '#6b7280' }}>
                            {c.charAt(0).toUpperCase() + c.slice(1)}
                        </button>
                    ))}
                </div>

                {condicion === 'credito' && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Días de crédito</label>
                        <input type="number" min="1" value={diasCredito} onChange={e => setDiasCredito(Number(e.target.value))}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Vence: {new Date(fechaVenc).toLocaleDateString('es-VE')}</div>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Pago USD ($)</label>
                        <input type="number" min="0" step="0.01" value={pagoUsd} onChange={e => handleUsdChange(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px', fontWeight: 600, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Vía USD</label>
                        <select value={metodoUsd} onChange={e => setMetodoUsd(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                            {['Transferencia USD', 'Efectivo', 'Zelle', 'Otro'].map(m => <option key={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Pago Bs.</label>
                        <input type="number" min="0" step="1" value={pagoBs} onChange={e => setPagoBs(Math.max(0, Number(e.target.value)))}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px', fontWeight: 600, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Vía Bs.</label>
                        <select value={metodoBs} onChange={e => setMetodoBs(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                            {['Pago Móvil', 'Transferencia', 'Punto de Venta', 'Efectivo Bs.'].map(m => <option key={m}>{m}</option>)}
                        </select>
                    </div>
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

                <button onClick={confirmar} disabled={guardando}
                    style={{ width: '100%', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
                    {guardando ? 'Registrando...' : 'Confirmar recepción y pago'}
                </button>
            </div>
        </>
    )
}

// ─── Detalle Compra ────────────────────────────────────────────
function DetalleCompra({ compra, onVolver }) {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        cargarItems()
    }, [compra.id])

    async function cargarItems() {
        setLoading(true)
        // Nota: Para simplificar, aquí se asume que los items se pueden cargar. 
        // En producción se haría un join o se guardaría el snapshot en compra_items
        const { data } = await supabase.from('compra_items').select('*').eq('compra_id', compra.id)
        if (data) setItems(data)
        setLoading(false)
    }

    return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Detalle de compra</h1>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>Orden de Compra</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{compra.numero_doc}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{new Date(compra.fecha_compra).toLocaleDateString('es-VE')}</div>
                        <div style={{ marginTop: '6px', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <BadgeEstado estado={compra.estado} />
                            <BadgeCobro estado={compra.estado_cobro || 'pendiente'} />
                        </div>
                    </div>
                </div>

                <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proveedor</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{compra.proveedores?.nombre || '—'}</div>
                </div>

                {loading ? <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Cargando items...</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                {['Insumo', 'Tipo', 'Cant.', 'Precio unit.', 'Total'].map((h, i) => (
                                    <th key={i} style={{ padding: '8px 0', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#1f2937' }}>{item.insumo_id}</td>
                                    <td style={{ padding: '10px 0', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{item.tipo_insumo.replace('_', ' ')}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{item.cantidad}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(item.cantidad * item.precio_unitario)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                    {[['Subtotal', fmt(compra.subtotal)], ['IVA (16%)', fmt(compra.subtotal * 0.16)]].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>
                            <span>{l}</span><span>{v}</span>
                        </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#1f2937', marginTop: '8px', paddingTop: '8px', borderTop: '2px solid #e5e7eb' }}>
                        <span>Total</span><span style={{ color: '#16a34a' }}>{fmt(compra.total)}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
