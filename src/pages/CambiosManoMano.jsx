import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Search, Check, X, RefreshCw, Trash2, ArrowRight } from 'lucide-react'

const fmt = (n) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

const MOTIVOS = [
    { key: 'vencido', label: 'Vencido' },
    { key: 'danado', label: 'Dañado' },
    { key: 'mal_estado', label: 'Mal estado' },
    { key: 'otro', label: 'Otro' },
]

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function CambiosManoMano() {
    const { perfil } = useAuth()
    const [tabActiva, setTabActiva] = useState('cambios')
    const [vista, setVista] = useState('lista')

    // Cambios
    const [cambios, setCambios] = useState([])
    const [loadingCambios, setLoadingCambios] = useState(true)

    // Stock reproceso
    const [stockReproceso, setStockReproceso] = useState([])
    const [loadingStock, setLoadingStock] = useState(true)

    useEffect(() => { cargarCambios() }, [])
    useEffect(() => { if (tabActiva === 'reproceso') cargarStock() }, [tabActiva])

    async function cargarCambios() {
        setLoadingCambios(true)
        const { data } = await supabase
            .from('cambios_mano_mano')
            .select(`
                *,
                clientes(nombre),
                productos_terminados(nombre, sku, unidad_medida),
                usuarios!cambios_mano_mano_despachador_id_fkey(nombre)
            `)
            .eq('empresa_id', perfil.empresa_id)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })
        if (data) setCambios(data)
        setLoadingCambios(false)
    }

    async function cargarStock() {
        setLoadingStock(true)
        const { data } = await supabase
            .from('stock_reproceso')
            .select(`
                *,
                productos_terminados(nombre, sku, unidad_medida),
                cambios_mano_mano(numero_cambio, clientes(nombre))
            `)
            .eq('empresa_id', perfil.empresa_id)
            .eq('estado', 'pendiente')
            .order('fecha_entrada', { ascending: false })
        if (data) setStockReproceso(data)
        setLoadingStock(false)
    }

    // KPIs
    const totalCambios = cambios.length
    const unidadesEntregadas = cambios.reduce((s, c) => s + Number(c.cantidad), 0)
    const enReproceso = stockReproceso.length

    if (vista === 'nuevo')
        return <NuevoCambio
            onRegistrado={() => { cargarCambios(); cargarStock(); setVista('lista') }}
            onCancelar={() => setVista('lista')}
        />

    return (
        <div style={{ padding: '24px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Cambios Mano a Mano</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Registro de cambios en anaquel y gestión de stock de reproceso</p>
                </div>
                {tabActiva === 'cambios' && (
                    <button onClick={() => setVista('nuevo')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={16} /> Registrar cambio
                    </button>
                )}
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'Total cambios', valor: totalCambios, color: '#1f2937' },
                    { label: 'Unidades entregadas', valor: fmt(unidadesEntregadas), color: '#1e40af' },
                    { label: 'En stock reproceso', valor: enReproceso, color: enReproceso > 0 ? '#d97706' : '#1f2937' },
                ].map(k => (
                    <div key={k.label} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{k.label}</p>
                        <p style={{ fontSize: '24px', fontWeight: 700, color: k.color, margin: 0 }}>{k.valor}</p>
                    </div>
                ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'cambios', label: 'Cambios registrados' },
                    { key: 'reproceso', label: 'Stock de reproceso', badge: enReproceso },
                ].map(tab => (
                    <button key={tab.key} onClick={() => setTabActiva(tab.key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: tabActiva === tab.key ? '#16a34a' : '#e5e7eb',
                            backgroundColor: tabActiva === tab.key ? '#f0fdf4' : '#fff',
                            color: tabActiva === tab.key ? '#16a34a' : '#6b7280',
                        }}>
                        {tab.label}
                        {tab.badge > 0 && (
                            <span style={{ backgroundColor: '#d97706', color: '#fff', borderRadius: '20px', padding: '1px 7px', fontSize: '11px', fontWeight: 700 }}>
                                {tab.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Cambios */}
            {tabActiva === 'cambios' && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    {loadingCambios ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    ) : cambios.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay cambios registrados</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['N° Cambio', 'Fecha', 'Cliente', 'Despachador', 'Producto', 'Cantidad', 'Motivo', 'Destino'].map((h, i) => (
                                        <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {cambios.map(c => (
                                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{c.numero_cambio}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                            {new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-VE')}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{c.clientes?.nombre || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{c.usuarios?.nombre || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1f2937' }}>
                                            {c.productos_terminados?.nombre || '—'}
                                            {c.productos_terminados?.sku && (
                                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{c.productos_terminados.sku}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                                            {fmt(c.cantidad)} {c.productos_terminados?.unidad_medida}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                                            {MOTIVOS.find(m => m.key === c.motivo)?.label || c.motivo}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{
                                                padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
                                                backgroundColor: c.destino === 'reprocesar' ? '#dbeafe' : '#fee2e2',
                                                color: c.destino === 'reprocesar' ? '#1e40af' : '#991b1b',
                                            }}>
                                                {c.destino === 'reprocesar' ? 'Reprocesar' : 'Desechar'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Tab Stock Reproceso */}
            {tabActiva === 'reproceso' && (
                <TabStockReproceso
                    stock={stockReproceso}
                    loading={loadingStock}
                    onActualizado={cargarStock}
                />
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// TAB STOCK DE REPROCESO
// ══════════════════════════════════════════════════════════════
function TabStockReproceso({ stock, loading, onActualizado }) {
    const { perfil } = useAuth()
    const [modalSalida, setModalSalida] = useState(null)

    async function procesarSalida(item, accion, notas, almacenDestino) {
        const { data: { user } } = await supabase.auth.getUser()

        // Actualizar stock_reproceso
        await supabase.from('stock_reproceso')
            .update({
                estado: accion === 'reprocesar' ? 'reprocesado' : 'desechado',
                fecha_salida: new Date().toISOString().split('T')[0],
                notas_salida: notas || null,
                usuario_salida_id: user.id,
            })
            .eq('id', item.id)

        // Si se reprocesa, devolver al inventario
        if (accion === 'reprocesar') {
            const { data: prod } = await supabase
                .from('productos_terminados').select('stock_actual').eq('id', item.producto_id).single()
            if (prod) {
                const nuevoStock = prod.stock_actual + Number(item.cantidad)
                await supabase.from('productos_terminados')
                    .update({ stock_actual: nuevoStock }).eq('id', item.producto_id)

                // Sumar a stock_ubicacion del almacén destino
                if (almacenDestino) {
                    const { data: su } = await supabase.from('stock_ubicacion')
                        .select('id, cantidad')
                        .eq('almacen_id', almacenDestino)
                        .eq('tipo_item', 'producto_terminado')
                        .eq('item_id', item.producto_id)
                        .eq('empresa_id', perfil.empresa_id)
                        .is('almacen_ubicacion_id', null)
                        .maybeSingle()
                    if (su) {
                        await supabase.from('stock_ubicacion')
                            .update({ cantidad: Number(su.cantidad) + Number(item.cantidad), updated_at: new Date().toISOString() })
                            .eq('id', su.id)
                    } else {
                        await supabase.from('stock_ubicacion').insert({
                            almacen_id: almacenDestino,
                            almacen_ubicacion_id: null,
                            tipo_item: 'producto_terminado',
                            item_id: item.producto_id,
                            cantidad: Number(item.cantidad),
                            empresa_id: perfil.empresa_id,
                            updated_at: new Date().toISOString(),
                        })
                    }
                }

                // Registrar movimiento
                await supabase.from('movimientos_inventario').insert({
                    empresa_id: perfil.empresa_id,
                    tipo_item: 'producto_terminado',
                    item_id: item.producto_id,
                    item_nombre: item.productos_terminados?.nombre || '',
                    item_codigo: item.productos_terminados?.sku || null,
                    tipo_movimiento: 'entrada',
                    cantidad: Number(item.cantidad),
                    stock_anterior: prod.stock_actual,
                    stock_actual: nuevoStock,
                    origen: 'reproceso',
                    almacen_id: almacenDestino || null,
                    fecha: new Date().toISOString()
                })
            }
        }

        // Si se desecha, registrar como merma
        if (accion === 'desechar') {
            await supabase.from('mermas').insert({
                empresa_id: perfil.empresa_id,
                tipo_item: 'producto_terminado',
                item_id: item.producto_id,
                item_nombre: item.productos_terminados?.nombre || '',
                item_codigo: item.productos_terminados?.sku || null,
                unidad_medida: item.productos_terminados?.unidad_medida || null,
                cantidad: Number(item.cantidad),
                tipo_merma: 'inventario',
                motivo: 'Desecho de reproceso',
                descripcion: notas || `Desechado desde stock de reproceso. Origen: ${item.cambios_mano_mano?.numero_cambio}`,
                fecha: new Date().toISOString().split('T')[0],
                usuario_id: user.id,
            })
        }

        setModalSalida(null)
        onActualizado()
    }

    if (loading) return <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>

    if (stock.length === 0) return (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
            No hay productos en stock de reproceso
        </div>
    )

    return (
        <>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                            {['Producto', 'Cantidad', 'Origen', 'Cliente', 'Fecha entrada', ''].map((h, i) => (
                                <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {stock.map(item => (
                            <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>
                                    {item.productos_terminados?.nombre || '—'}
                                    {item.productos_terminados?.sku && (
                                        <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{item.productos_terminados.sku}</span>
                                    )}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#d97706' }}>
                                    {fmt(item.cantidad)} {item.productos_terminados?.unidad_medida}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>
                                    {item.cambios_mano_mano?.numero_cambio || '—'}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                                    {item.cambios_mano_mano?.clientes?.nombre || '—'}
                                </td>
                                <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                    {new Date(item.fecha_entrada + 'T00:00:00').toLocaleDateString('es-VE')}
                                </td>
                                <td style={{ padding: '12px 16px' }}>
                                    <button onClick={() => setModalSalida(item)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                        <ArrowRight size={13} /> Dar salida
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {modalSalida && (
                <ModalSalida
                    item={modalSalida}
                    onConfirmar={(accion, notas, almacenDestino) => procesarSalida(modalSalida, accion, notas, almacenDestino)}
                    onCerrar={() => setModalSalida(null)}
                />
            )}
        </>
    )
}

// ══════════════════════════════════════════════════════════════
// MODAL SALIDA DE REPROCESO
// ══════════════════════════════════════════════════════════════
function ModalSalida({ item, onConfirmar, onCerrar }) {
    const [accion, setAccion] = useState('reprocesar')
    const [notas, setNotas] = useState('')
    const [procesando, setProcesando] = useState(false)
    const [almacenes, setAlmacenes] = useState([])
    const [almacenDestino, setAlmacenDestino] = useState('')
    const { perfil } = useAuth()

    useEffect(() => {
        supabase.from('almacenes').select('id, nombre, es_default')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true)
            .order('es_default', { ascending: false }).order('nombre')
            .then(({ data }) => {
                if (data) {
                    setAlmacenes(data)
                    const def = data.find(a => a.es_default) || data[0]
                    if (def) setAlmacenDestino(def.id)
                }
            })
    }, [])

    async function confirmar() {
        setProcesando(true)
        await onConfirmar(accion, notas, almacenDestino)
        setProcesando(false)
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Dar salida a stock de reproceso</h3>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                {/* Info producto */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>
                        {item.productos_terminados?.nombre}
                    </p>
                    <p style={{ fontSize: '13px', color: '#d97706', fontWeight: 600, margin: '0 0 2px' }}>
                        {fmt(item.cantidad)} {item.productos_terminados?.unidad_medida} en reproceso
                    </p>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>
                        Origen: {item.cambios_mano_mano?.numero_cambio} · {item.cambios_mano_mano?.clientes?.nombre}
                    </p>
                </div>

                {/* Selección de acción */}
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '10px' }}>
                    ¿Qué hacemos con este stock?
                </label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <button onClick={() => setAccion('reprocesar')}
                        style={{
                            flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                            border: '2px solid', cursor: 'pointer',
                            borderColor: accion === 'reprocesar' ? '#1d4ed8' : '#e5e7eb',
                            backgroundColor: accion === 'reprocesar' ? '#eff6ff' : '#fff',
                            color: accion === 'reprocesar' ? '#1d4ed8' : '#6b7280',
                        }}>
                        <RefreshCw size={16} style={{ marginBottom: '6px' }} />
                        <div>Reprocesar</div>
                        <div style={{ fontSize: '11px', fontWeight: 400, marginTop: '2px' }}>Vuelve al inventario normal</div>
                    </button>
                    <button onClick={() => setAccion('desechar')}
                        style={{
                            flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                            border: '2px solid', cursor: 'pointer',
                            borderColor: accion === 'desechar' ? '#dc2626' : '#e5e7eb',
                            backgroundColor: accion === 'desechar' ? '#fef2f2' : '#fff',
                            color: accion === 'desechar' ? '#dc2626' : '#6b7280',
                        }}>
                        <Trash2 size={16} style={{ marginBottom: '6px' }} />
                        <div>Desechar</div>
                        <div style={{ fontSize: '11px', fontWeight: 400, marginTop: '2px' }}>Se registra como merma</div>
                    </button>
                </div>

                {/* Impacto */}
                <div style={{
                    backgroundColor: accion === 'reprocesar' ? '#eff6ff' : '#fef2f2',
                    border: `1px solid ${accion === 'reprocesar' ? '#bfdbfe' : '#fecaca'}`,
                    borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px',
                    color: accion === 'reprocesar' ? '#1e40af' : '#dc2626',
                }}>
                    {accion === 'reprocesar'
                        ? `✓ Se agregarán ${fmt(item.cantidad)} ${item.productos_terminados?.unidad_medida} al inventario normal de ${item.productos_terminados?.nombre}`
                        : `✗ Se registrará como merma y se dará de baja definitivamente`}
                </div>

                {/* Almacén destino — solo al reprocesar */}
                {accion === 'reprocesar' && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Almacén de destino *
                        </label>
                        <select value={almacenDestino} onChange={e => setAlmacenDestino(e.target.value)}
                            style={{ ...inputStyle }}>
                            <option value="">Seleccionar almacén...</option>
                            {almacenes.map(a => (
                                <option key={a.id} value={a.id}>
                                    {a.nombre}{a.es_default ? ' (principal)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Notas */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        Notas <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                        placeholder="Observaciones sobre el reproceso o desecho..."
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onCerrar}
                        style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button onClick={confirmar} disabled={procesando}
                        style={{
                            flex: 2, padding: '11px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                            backgroundColor: accion === 'reprocesar' ? '#1d4ed8' : '#dc2626',
                            color: '#fff', opacity: procesando ? 0.6 : 1,
                        }}>
                        {procesando ? 'Procesando...' : accion === 'reprocesar' ? 'Confirmar reproceso' : 'Confirmar desecho'}
                    </button>
                </div>
            </div>
        </>
    )
}

// ══════════════════════════════════════════════════════════════
// NUEVO CAMBIO
// ══════════════════════════════════════════════════════════════
function NuevoCambio({ onRegistrado, onCancelar }) {
    const { perfil } = useAuth()
    const [clientes, setClientes] = useState([])
    const [despachadores, setDespachadores] = useState([])
    const [productos, setProductos] = useState([])
    const [busqProducto, setBusqProducto] = useState('')
    const [productoSel, setProductoSel] = useState(null)

    const [clienteId, setClienteId] = useState('')
    const [despachadorId, setDespachadorId] = useState('')
    const [cantidad, setCantidad] = useState('')
    const [motivo, setMotivo] = useState('')
    const [destino, setDestino] = useState('reprocesar')
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
    const [notas, setNotas] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    // Almacén de origen
    const [almacenes, setAlmacenes] = useState([])
    const [almacenId, setAlmacenId] = useState('')
    const [stockEnAlmacen, setStockEnAlmacen] = useState(null)

    // Almacén destino del reproceso
    const [almacenReproceso, setAlmacenReproceso] = useState('')

    useEffect(() => {
        supabase.from('clientes').select('id, nombre').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setClientes(data || []))

        supabase.from('usuarios').select('id, nombre').eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setDespachadores(data || []))

        supabase.from('productos_terminados').select('id, nombre, sku, unidad_medida, stock_actual').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setProductos(data || []))

        supabase.from('almacenes').select('id, nombre, es_default')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true)
            .order('es_default', { ascending: false }).order('nombre')
            .then(({ data }) => {
                if (data) {
                    setAlmacenes(data)
                    const def = data.find(a => a.es_default) || data[0]
                    if (def) { setAlmacenId(def.id); setAlmacenReproceso(def.id) }
                }
            })
    }, [])

    // Cargar stock del producto en el almacén seleccionado
    useEffect(() => {
        if (!productoSel || !almacenId) { setStockEnAlmacen(null); return }
        supabase.from('stock_ubicacion')
            .select('cantidad')
            .eq('almacen_id', almacenId)
            .eq('tipo_item', 'producto_terminado')
            .eq('item_id', productoSel.id)
            .eq('empresa_id', perfil.empresa_id)
            .is('almacen_ubicacion_id', null)
            .maybeSingle()
            .then(({ data }) => setStockEnAlmacen(data ? Number(data.cantidad) : 0))
    }, [productoSel, almacenId])

    const productosFiltrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqProducto.toLowerCase()) ||
        p.sku?.toLowerCase().includes(busqProducto.toLowerCase())
    )

    async function guardar() {
        if (!clienteId) { setError('Selecciona el cliente'); return }
        if (!despachadorId) { setError('Selecciona el despachador'); return }
        if (!productoSel) { setError('Selecciona el producto'); return }
        if (!cantidad || Number(cantidad) <= 0) { setError('Ingresa una cantidad válida'); return }
        if (!motivo) { setError('Selecciona el motivo'); return }
        if (!almacenId) { setError('Selecciona el almacén de origen'); return }
        if (stockEnAlmacen !== null && Number(cantidad) > stockEnAlmacen) {
            setError(`Stock insuficiente en ese almacén. Disponible: ${stockEnAlmacen} ${productoSel.unidad_medida}`)
            return
        }

        setGuardando(true); setError('')
        const { data: { user } } = await supabase.auth.getUser()
        const numero = `CMM-${Date.now().toString().slice(-6)}`

        // 1. Registrar el cambio
        const { data: cambio, error: errCambio } = await supabase.from('cambios_mano_mano').insert({
            empresa_id: perfil.empresa_id,
            numero_cambio: numero,
            cliente_id: clienteId,
            despachador_id: despachadorId,
            producto_id: productoSel.id,
            cantidad: Number(cantidad),
            motivo,
            destino,
            fecha,
            notas: notas.trim() || null,
            usuario_id: user.id,
            almacen_id: almacenId,
        }).select().single()

        if (errCambio) { setError('Error: ' + errCambio.message); setGuardando(false); return }

        // 2. Descontar stock global
        const nuevoStock = productoSel.stock_actual - Number(cantidad)
        await supabase.from('productos_terminados')
            .update({ stock_actual: nuevoStock })
            .eq('id', productoSel.id)

        // 3. Descontar stock_ubicacion del almacén origen
        const { data: su } = await supabase.from('stock_ubicacion')
            .select('id, cantidad')
            .eq('almacen_id', almacenId)
            .eq('tipo_item', 'producto_terminado')
            .eq('item_id', productoSel.id)
            .eq('empresa_id', perfil.empresa_id)
            .is('almacen_ubicacion_id', null)
            .maybeSingle()
        if (su) {
            await supabase.from('stock_ubicacion')
                .update({ cantidad: Math.max(0, Number(su.cantidad) - Number(cantidad)), updated_at: new Date().toISOString() })
                .eq('id', su.id)
        }

        // 4. Registrar movimiento de salida
        await supabase.from('movimientos_inventario').insert({
            empresa_id: perfil.empresa_id,
            tipo_item: 'producto_terminado',
            item_id: productoSel.id,
            item_nombre: productoSel.nombre,
            item_codigo: productoSel.sku || null,
            tipo_movimiento: 'salida',
            cantidad: Number(cantidad),
            stock_anterior: productoSel.stock_actual,
            stock_actual: nuevoStock,
            origen: 'cambio_mano_mano',
            almacen_id: almacenId,
            fecha: new Date().toISOString()
        })

        // 5. Si destino = reprocesar, agregar a stock_reproceso
        if (destino === 'reprocesar') {
            await supabase.from('stock_reproceso').insert({
                empresa_id: perfil.empresa_id,
                producto_id: productoSel.id,
                cantidad: Number(cantidad),
                cambio_id: cambio.id,
                estado: 'pendiente',
                fecha_entrada: fecha,
                almacen_id: almacenReproceso || null,
            })
        }

        // 6. Si destino = desechar, registrar como merma
        if (destino === 'desechar') {
            await supabase.from('mermas').insert({
                empresa_id: perfil.empresa_id,
                tipo_item: 'producto_terminado',
                item_id: productoSel.id,
                item_nombre: productoSel.nombre,
                item_codigo: productoSel.sku || null,
                unidad_medida: productoSel.unidad_medida || null,
                cantidad: Number(cantidad),
                tipo_merma: 'inventario',
                motivo: 'Desecho de cambio mano a mano',
                descripcion: `Cambio ${numero} · Motivo: ${MOTIVOS.find(m => m.key === motivo)?.label}${notas ? ' · ' + notas : ''}`,
                fecha,
                usuario_id: user.id,
                almacen_id: almacenId,
            })
        }

        setGuardando(false)
        onRegistrado()
    }

    return (
        <div style={{ padding: '24px', maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Registrar cambio mano a mano</h1>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Cliente y Despachador */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Cliente *</label>
                        <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={inputStyle}>
                            <option value="">Seleccionar cliente...</option>
                            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Despachador *</label>
                        <select value={despachadorId} onChange={e => setDespachadorId(e.target.value)} style={inputStyle}>
                            <option value="">Seleccionar despachador...</option>
                            {despachadores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                        </select>
                    </div>
                </div>

                {/* Producto */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Producto *</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input type="text" placeholder="Buscar producto por nombre o código..."
                            value={busqProducto}
                            onChange={e => { setBusqProducto(e.target.value); setProductoSel(null) }}
                            style={{ ...inputStyle, paddingLeft: '32px' }} />
                    </div>

                    {busqProducto && !productoSel && (
                        <div style={{ marginTop: '4px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                            {productosFiltrados.length === 0
                                ? <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>Sin resultados</div>
                                : productosFiltrados.map(p => (
                                    <div key={p.id} onClick={() => { setProductoSel(p); setBusqProducto(p.nombre) }}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <div>
                                            <span style={{ fontWeight: 500, color: '#1f2937' }}>{p.nombre}</span>
                                            {p.sku && <span style={{ color: '#9ca3af', marginLeft: '8px', fontFamily: 'monospace', fontSize: '11px' }}>{p.sku}</span>}
                                        </div>
                                        <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>
                                            Stock: {fmt(p.stock_actual)} {p.unidad_medida}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    )}

                    {productoSel && (
                        <div style={{ marginTop: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>{productoSel.nombre}</span>
                                <span style={{ fontSize: '12px', color: '#16a34a', marginLeft: '8px' }}>
                                    Stock disponible: {fmt(productoSel.stock_actual)} {productoSel.unidad_medida}
                                </span>
                            </div>
                            <button onClick={() => { setProductoSel(null); setBusqProducto('') }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}>
                                <X size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Almacén de origen */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>
                        Almacén de origen *
                    </label>
                    <select value={almacenId} onChange={e => setAlmacenId(e.target.value)} style={inputStyle}>
                        <option value="">Seleccionar almacén...</option>
                        {almacenes.map(a => (
                            <option key={a.id} value={a.id}>
                                {a.nombre}{a.es_default ? ' (principal)' : ''}
                            </option>
                        ))}
                    </select>
                    {productoSel && almacenId && stockEnAlmacen !== null && (
                        <p style={{ fontSize: '12px', margin: '6px 0 0', color: stockEnAlmacen <= 0 ? '#dc2626' : '#6b7280' }}>
                            Stock en este almacén: <strong style={{ color: stockEnAlmacen <= 0 ? '#dc2626' : '#374151' }}>
                                {stockEnAlmacen} {productoSel.unidad_medida}
                            </strong>
                        </p>
                    )}
                </div>

                {/* Cantidad y Fecha */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Cantidad * {productoSel ? `(${productoSel.unidad_medida})` : ''}
                        </label>
                        <input type="number" min="0.001" step="0.001" value={cantidad}
                            onChange={e => setCantidad(e.target.value)}
                            style={{ ...inputStyle, borderColor: productoSel && cantidad && Number(cantidad) > productoSel.stock_actual ? '#f87171' : '#d1d5db' }} />
                        {productoSel && cantidad && Number(cantidad) > productoSel.stock_actual && (
                            <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 0' }}>
                                Supera el stock disponible ({fmt(productoSel.stock_actual)})
                            </p>
                        )}
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Fecha *</label>
                        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
                    </div>
                </div>

                {/* Motivo */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Motivo del retiro *</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {MOTIVOS.map(m => (
                            <button key={m.key} onClick={() => setMotivo(m.key)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                    border: '1px solid', cursor: 'pointer',
                                    borderColor: motivo === m.key ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: motivo === m.key ? '#f0fdf4' : '#fff',
                                    color: motivo === m.key ? '#16a34a' : '#6b7280',
                                }}>
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Destino del producto retirado */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Destino del producto retirado *</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setDestino('reprocesar')}
                            style={{
                                flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                                border: '2px solid', cursor: 'pointer', textAlign: 'center',
                                borderColor: destino === 'reprocesar' ? '#1d4ed8' : '#e5e7eb',
                                backgroundColor: destino === 'reprocesar' ? '#eff6ff' : '#fff',
                                color: destino === 'reprocesar' ? '#1d4ed8' : '#6b7280',
                            }}>
                            <div>♻️ Reprocesar</div>
                            <div style={{ fontSize: '11px', fontWeight: 400, marginTop: '4px' }}>Entra a stock de reproceso</div>
                        </button>
                        <button onClick={() => setDestino('desechar')}
                            style={{
                                flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                                border: '2px solid', cursor: 'pointer', textAlign: 'center',
                                borderColor: destino === 'desechar' ? '#dc2626' : '#e5e7eb',
                                backgroundColor: destino === 'desechar' ? '#fef2f2' : '#fff',
                                color: destino === 'desechar' ? '#dc2626' : '#6b7280',
                            }}>
                            <div>🗑️ Desechar</div>
                            <div style={{ fontSize: '11px', fontWeight: 400, marginTop: '4px' }}>Se registra como merma</div>
                        </button>
                    </div>
                </div>

                {/* Almacén destino del reproceso */}
                {destino === 'reprocesar' && (
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Almacén donde entra el reproceso *
                        </label>
                        <select value={almacenReproceso} onChange={e => setAlmacenReproceso(e.target.value)} style={inputStyle}>
                            <option value="">Seleccionar almacén...</option>
                            {almacenes.map(a => (
                                <option key={a.id} value={a.id}>
                                    {a.nombre}{a.es_default ? ' (principal)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Resumen */}
                {productoSel && cantidad && Number(cantidad) > 0 && motivo && (
                    <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px' }}>
                        <p style={{ fontSize: '12px', color: '#6b7280', fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Resumen del cambio
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>Sale del inventario:</span>
                            <span>{fmt(cantidad)} {productoSel.unidad_medida} de {productoSel.nombre}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151' }}>
                            <span style={{ color: destino === 'reprocesar' ? '#1d4ed8' : '#dc2626', fontWeight: 600 }}>
                                {destino === 'reprocesar' ? 'Entra a reproceso:' : 'Se desecha:'}
                            </span>
                            <span>{fmt(cantidad)} {productoSel.unidad_medida} retiradas del cliente</span>
                        </div>
                    </div>
                )}

                {/* Notas */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        Notas <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                        placeholder="Observaciones adicionales sobre el cambio..."
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.7 : 1 }}>
                        <Check size={16} /> {guardando ? 'Registrando...' : 'Confirmar cambio'}
                    </button>
                    <button onClick={onCancelar}
                        style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    )
}
