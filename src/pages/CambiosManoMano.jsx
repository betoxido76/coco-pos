import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Search, Check, X, RefreshCw, Trash2, ArrowRight, ClipboardList, Eye } from 'lucide-react'

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
const PAGE_SIZE = 50

export default function CambiosManoMano() {
    const { perfil } = useAuth()
    const [tabActiva, setTabActiva] = useState('cambios')
    const [vista, setVista] = useState('lista')
    const [cambioVer, setCambioVer] = useState(null)

    // Cambios
    const [cambios, setCambios] = useState([])
    const [kpiCambios, setKpiCambios] = useState([])
    const [loadingCambios, setLoadingCambios] = useState(true)
    const [paginaCambios, setPaginaCambios] = useState(0)
    const [totalCambiosCount, setTotalCambiosCount] = useState(0)

    // Stock reproceso
    const [stockReproceso, setStockReproceso] = useState([])
    const [loadingStock, setLoadingStock] = useState(true)

    // Solicitudes de campo
    const [solicitudes, setSolicitudes] = useState([])
    const [loadingSolicitudes, setLoadingSolicitudes] = useState(false)
    const [totalSolicitudes, setTotalSolicitudes] = useState(0)
    const [solicitudAProcesar, setSolicitudAProcesar] = useState(null)

    useEffect(() => { cargarCambios(); cargarSolicitudes() }, [paginaCambios])
    useEffect(() => {
        if (tabActiva === 'reproceso') cargarStock()
        if (tabActiva === 'solicitudes') cargarSolicitudes()
    }, [tabActiva])

    async function cargarCambios() {
        setLoadingCambios(true)

        const [{ data: kpi }, { data, count }] = await Promise.all([
            supabase.from('cambios_mano_mano')
                .select('cantidad')
                .eq('empresa_id', perfil.empresa_id)
                .eq('estado', 'ejecutado'),
            supabase.from('cambios_mano_mano')
                .select(`*, clientes(nombre), productos_terminados(nombre, sku, unidad_medida), usuarios!cambios_mano_mano_despachador_id_fkey(nombre), almacenes(nombre)`, { count: 'exact' })
                .eq('empresa_id', perfil.empresa_id)
                .eq('estado', 'ejecutado')
                .order('fecha', { ascending: false })
                .order('created_at', { ascending: false })
                .range(paginaCambios * PAGE_SIZE, (paginaCambios + 1) * PAGE_SIZE - 1),
        ])

        if (kpi) setKpiCambios(kpi)
        if (data) setCambios(data)
        if (count !== null) setTotalCambiosCount(count)
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

    async function cargarSolicitudes() {
        setLoadingSolicitudes(true)
        const { data, count } = await supabase
            .from('cambios_mano_mano')
            .select(`*, clientes(nombre), productos_terminados(nombre, sku, unidad_medida)`, { count: 'exact' })
            .eq('empresa_id', perfil.empresa_id)
            .eq('estado', 'solicitado')
            .order('created_at', { ascending: false })
        setSolicitudes(data || [])
        setTotalSolicitudes(count || 0)
        setLoadingSolicitudes(false)
    }

    // KPIs — totalCambios y unidades calculados desde query completa (kpiCambios)
    const totalCambios = kpiCambios.length
    const unidadesEntregadas = kpiCambios.reduce((s, c) => s + Number(c.cantidad), 0)
    const enReproceso = stockReproceso.length

    if (vista === 'ver')
        return <DocumentoCambio
            cambio={cambioVer}
            onVolver={() => { setCambioVer(null); setVista('lista') }}
        />

    if (vista === 'nuevo')
        return <NuevoCambio
            onRegistrado={() => { cargarCambios(); cargarStock(); setVista('lista') }}
            onCancelar={() => setVista('lista')}
        />

    if (vista === 'procesar_solicitud')
        return <ProcesarSolicitud
            solicitud={solicitudAProcesar}
            onProcesada={() => { cargarCambios(); cargarSolicitudes(); cargarStock(); setVista('lista') }}
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
                {tabActiva === 'solicitudes' && totalSolicitudes > 0 && (
                    <span style={{ fontSize: '13px', color: '#d97706', fontWeight: 500 }}>
                        {totalSolicitudes} solicitud(es) pendiente(s) de procesamiento
                    </span>
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
                    { key: 'solicitudes', label: 'Solicitudes de campo', badge: totalSolicitudes },
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
                                    {['N° Cambio', 'Fecha', 'Cliente', 'Despachador', 'Producto', 'Cantidad', 'Motivo', 'Destino', ''].map((h, i) => (
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
                                                backgroundColor: c.destino === 'reprocesar' ? '#dbeafe' : c.destino === 'desechar' ? '#fee2e2' : '#f3f4f6',
                                                color: c.destino === 'reprocesar' ? '#1e40af' : c.destino === 'desechar' ? '#991b1b' : '#6b7280',
                                            }}>
                                                {c.destino === 'reprocesar' ? 'Reprocesar' : c.destino === 'desechar' ? 'Desechar' : 'Pendiente'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <button onClick={() => { setCambioVer(c); setVista('ver') }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                                                <Eye size={13} /> Ver
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {tabActiva === 'cambios' && totalCambiosCount > PAGE_SIZE && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', marginTop: '8px' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                        Mostrando {paginaCambios * PAGE_SIZE + 1}–{Math.min((paginaCambios + 1) * PAGE_SIZE, totalCambiosCount)} de {totalCambiosCount}
                    </span>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => setPaginaCambios(p => p - 1)} disabled={paginaCambios === 0}
                            style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: paginaCambios === 0 ? '#d1d5db' : '#374151', cursor: paginaCambios === 0 ? 'default' : 'pointer' }}>
                            ← Anterior
                        </button>
                        <button onClick={() => setPaginaCambios(p => p + 1)} disabled={(paginaCambios + 1) * PAGE_SIZE >= totalCambiosCount}
                            style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: (paginaCambios + 1) * PAGE_SIZE >= totalCambiosCount ? '#d1d5db' : '#374151', cursor: (paginaCambios + 1) * PAGE_SIZE >= totalCambiosCount ? 'default' : 'pointer' }}>
                            Siguiente →
                        </button>
                    </div>
                </div>
            )}

            {/* Tab Solicitudes de campo */}
            {tabActiva === 'solicitudes' && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    {loadingSolicitudes ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    ) : solicitudes.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                            <ClipboardList size={36} style={{ marginBottom: '10px', display: 'block', margin: '0 auto 10px' }} />
                            No hay solicitudes pendientes
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#fffbeb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['N° Cambio', 'Fecha', 'Cliente', 'Producto', 'Cantidad', 'Motivo', '', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {solicitudes.map(s => (
                                    <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fffbeb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{s.numero_cambio}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                            {new Date(s.fecha + 'T00:00:00').toLocaleDateString('es-VE')}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{s.clientes?.nombre || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1f2937' }}>
                                            {s.productos_terminados?.nombre || '—'}
                                            {s.productos_terminados?.sku && (
                                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{s.productos_terminados.sku}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>
                                            {fmt(s.cantidad)} {s.productos_terminados?.unidad_medida}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>
                                            {MOTIVOS.find(m => m.key === s.motivo)?.label || s.motivo}
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <button onClick={() => { setCambioVer(s); setVista('ver') }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                                                <Eye size={13} /> Ver
                                            </button>
                                        </td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <button onClick={() => { setSolicitudAProcesar(s); setVista('procesar_solicitud') }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                                                <ArrowRight size={13} /> Procesar
                                            </button>
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
    const [error, setError] = useState('')
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
        if (accion === 'reprocesar' && !almacenDestino) {
            setError('Selecciona el almacén de destino para el reproceso')
            return
        }
        setError('')
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

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>
                        {error}
                    </div>
                )}

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
// PROCESAR SOLICITUD DE CAMPO
// ══════════════════════════════════════════════════════════════
function ProcesarSolicitud({ solicitud, onProcesada, onCancelar }) {
    const { perfil } = useAuth()
    const [despachadorId, setDespachadorId] = useState('')
    const [destino, setDestino] = useState('reprocesar')
    const [almacenId, setAlmacenId] = useState('')
    const [almacenReproceso, setAlmacenReproceso] = useState('')
    const [despachadores, setDespachadores] = useState([])
    const [almacenes, setAlmacenes] = useState([])
    const [stockEnAlmacen, setStockEnAlmacen] = useState(null)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    const producto = solicitud.productos_terminados

    useEffect(() => {
        supabase.from('usuarios').select('id, nombre').eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setDespachadores(data || []))
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

    useEffect(() => {
        if (!almacenId) { setStockEnAlmacen(null); return }
        // Sumar TODAS las filas del almacén+producto: el stock puede estar repartido
        // en varias ubicaciones (almacen_ubicacion_id distinto, incluido NULL).
        supabase.from('stock_ubicacion')
            .select('cantidad')
            .eq('almacen_id', almacenId)
            .eq('tipo_item', 'producto_terminado')
            .eq('item_id', solicitud.producto_id)
            .eq('empresa_id', perfil.empresa_id)
            .then(({ data }) => setStockEnAlmacen((data || []).reduce((s, r) => s + Number(r.cantidad), 0)))
    }, [almacenId])

    async function confirmar() {
        if (!despachadorId) { setError('Selecciona el despachador'); return }
        if (!almacenId) { setError('Selecciona el almacén de origen'); return }
        if (stockEnAlmacen !== null && solicitud.cantidad > stockEnAlmacen) {
            setError(`Stock insuficiente. Disponible: ${stockEnAlmacen} ${producto?.unidad_medida}`)
            return
        }
        setGuardando(true); setError('')
        const { data: { user } } = await supabase.auth.getUser()

        // 1. Actualizar la solicitud a ejecutado
        const { error: errUpd } = await supabase.from('cambios_mano_mano').update({
            estado: 'ejecutado',
            despachador_id: despachadorId,
            almacen_id: almacenId,
            destino,
        }).eq('id', solicitud.id)
        if (errUpd) { setError('Error: ' + errUpd.message); setGuardando(false); return }

        // 2. Descontar stock global
        const { data: prodActual } = await supabase.from('productos_terminados')
            .select('stock_actual').eq('id', solicitud.producto_id).single()
        const stockAnterior = Number(prodActual?.stock_actual || 0)
        const nuevoStock = stockAnterior - Number(solicitud.cantidad)
        await supabase.from('productos_terminados')
            .update({ stock_actual: nuevoStock }).eq('id', solicitud.producto_id)

        // 3. Descontar stock_ubicacion — repartir el descuento entre las filas del
        //    almacén (el stock puede estar en varias ubicaciones). Se consume primero
        //    la fila sin ubicación (NULL) y luego las ubicaciones con saldo.
        const { data: filasSU } = await supabase.from('stock_ubicacion')
            .select('id, cantidad')
            .eq('almacen_id', almacenId).eq('tipo_item', 'producto_terminado')
            .eq('item_id', solicitud.producto_id).eq('empresa_id', perfil.empresa_id)
            .gt('cantidad', 0)
            .order('almacen_ubicacion_id', { ascending: true, nullsFirst: true })
        let restante = Number(solicitud.cantidad)
        for (const fila of (filasSU || [])) {
            if (restante <= 0) break
            const descontar = Math.min(Number(fila.cantidad), restante)
            await supabase.from('stock_ubicacion')
                .update({ cantidad: Number(fila.cantidad) - descontar, updated_at: new Date().toISOString() })
                .eq('id', fila.id)
            restante -= descontar
        }

        // 4. Movimiento de inventario
        await supabase.from('movimientos_inventario').insert({
            empresa_id: perfil.empresa_id,
            tipo_item: 'producto_terminado',
            item_id: solicitud.producto_id,
            item_nombre: producto?.nombre || '',
            item_codigo: producto?.sku || null,
            tipo_movimiento: 'salida',
            cantidad: Number(solicitud.cantidad),
            stock_anterior: stockAnterior,
            stock_actual: nuevoStock,
            origen: 'cambio_mano_mano',
            almacen_id: almacenId,
            fecha: new Date().toISOString(),
        })

        // 5. Si reprocesar → stock_reproceso
        if (destino === 'reprocesar') {
            await supabase.from('stock_reproceso').insert({
                empresa_id: perfil.empresa_id,
                producto_id: solicitud.producto_id,
                cantidad: Number(solicitud.cantidad),
                cambio_id: solicitud.id,
                estado: 'pendiente',
                fecha_entrada: solicitud.fecha,
                almacen_id: almacenReproceso || null,
            })
        }

        // 6. Si desechar → merma
        if (destino === 'desechar') {
            await supabase.from('mermas').insert({
                empresa_id: perfil.empresa_id,
                tipo_item: 'producto_terminado',
                item_id: solicitud.producto_id,
                item_nombre: producto?.nombre || '',
                item_codigo: producto?.sku || null,
                unidad_medida: producto?.unidad_medida || null,
                cantidad: Number(solicitud.cantidad),
                tipo_merma: 'inventario',
                motivo: 'Desecho de cambio mano a mano',
                descripcion: `Cambio ${solicitud.numero_cambio} · Motivo: ${MOTIVOS.find(m => m.key === solicitud.motivo)?.label}${solicitud.notas ? ' · ' + solicitud.notas : ''}`,
                fecha: solicitud.fecha,
                usuario_id: user.id,
                almacen_id: almacenId,
            })
        }

        setGuardando(false)
        onProcesada()
    }

    return (
        <div style={{ padding: '24px', maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Procesar solicitud de cambio</h1>
                    <p style={{ fontSize: '13px', color: '#9ca3af', margin: '2px 0 0' }}>{solicitud.numero_cambio}</p>
                </div>
            </div>

            {/* Resumen de la solicitud (solo lectura) */}
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Solicitud del vendedor</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
                    <div>
                        <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Cliente</p>
                        <p style={{ fontWeight: 600, color: '#1f2937', margin: 0 }}>{solicitud.clientes?.nombre || '—'}</p>
                    </div>
                    <div>
                        <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Fecha solicitud</p>
                        <p style={{ fontWeight: 600, color: '#1f2937', margin: 0 }}>{new Date(solicitud.fecha + 'T00:00:00').toLocaleDateString('es-VE')}</p>
                    </div>
                    <div>
                        <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Producto</p>
                        <p style={{ fontWeight: 600, color: '#1f2937', margin: 0 }}>{producto?.nombre || '—'}</p>
                        {producto?.sku && <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0', fontFamily: 'monospace' }}>{producto.sku}</p>}
                    </div>
                    <div>
                        <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Cantidad</p>
                        <p style={{ fontWeight: 600, color: '#dc2626', margin: 0 }}>{fmt(solicitud.cantidad)} {producto?.unidad_medida}</p>
                    </div>
                    <div>
                        <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Motivo</p>
                        <p style={{ fontWeight: 600, color: '#1f2937', margin: 0 }}>{MOTIVOS.find(m => m.key === solicitud.motivo)?.label || solicitud.motivo}</p>
                    </div>
                    {solicitud.notas && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Notas</p>
                            <p style={{ fontWeight: 500, color: '#374151', margin: 0, fontStyle: 'italic' }}>"{solicitud.notas}"</p>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Despachador */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Despachador *</label>
                    <select value={despachadorId} onChange={e => setDespachadorId(e.target.value)} style={inputStyle}>
                        <option value="">Seleccionar despachador...</option>
                        {despachadores.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
                    </select>
                </div>

                {/* Almacén de origen */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Almacén de origen *</label>
                    <select value={almacenId} onChange={e => setAlmacenId(e.target.value)} style={inputStyle}>
                        <option value="">Seleccionar almacén...</option>
                        {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}{a.es_default ? ' (principal)' : ''}</option>)}
                    </select>
                    {almacenId && stockEnAlmacen !== null && (
                        <p style={{ fontSize: '12px', margin: '6px 0 0', color: stockEnAlmacen <= 0 ? '#dc2626' : '#6b7280' }}>
                            Stock disponible: <strong style={{ color: stockEnAlmacen <= 0 ? '#dc2626' : '#374151' }}>{stockEnAlmacen} {producto?.unidad_medida}</strong>
                        </p>
                    )}
                </div>

                {/* Destino */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Destino del producto retirado *</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setDestino('reprocesar')}
                            style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, border: '2px solid', cursor: 'pointer', textAlign: 'center', borderColor: destino === 'reprocesar' ? '#1d4ed8' : '#e5e7eb', backgroundColor: destino === 'reprocesar' ? '#eff6ff' : '#fff', color: destino === 'reprocesar' ? '#1d4ed8' : '#6b7280' }}>
                            <div>♻️ Reprocesar</div>
                            <div style={{ fontSize: '11px', fontWeight: 400, marginTop: '4px' }}>Entra a stock de reproceso</div>
                        </button>
                        <button onClick={() => setDestino('desechar')}
                            style={{ flex: 1, padding: '12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, border: '2px solid', cursor: 'pointer', textAlign: 'center', borderColor: destino === 'desechar' ? '#dc2626' : '#e5e7eb', backgroundColor: destino === 'desechar' ? '#fef2f2' : '#fff', color: destino === 'desechar' ? '#dc2626' : '#6b7280' }}>
                            <div>🗑️ Desechar</div>
                            <div style={{ fontSize: '11px', fontWeight: 400, marginTop: '4px' }}>Se registra como merma</div>
                        </button>
                    </div>
                </div>

                {/* Almacén destino reproceso */}
                {destino === 'reprocesar' && (
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Almacén donde entra el reproceso *</label>
                        <select value={almacenReproceso} onChange={e => setAlmacenReproceso(e.target.value)} style={inputStyle}>
                            <option value="">Seleccionar almacén...</option>
                            {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}{a.es_default ? ' (principal)' : ''}</option>)}
                        </select>
                    </div>
                )}

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={confirmar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.7 : 1 }}>
                        <Check size={16} /> {guardando ? 'Procesando...' : 'Confirmar procesamiento'}
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

// ══════════════════════════════════════════════════════════════
// DOCUMENTO CAMBIO MANO A MANO (Vista imprimible)
// ══════════════════════════════════════════════════════════════
function DocumentoCambio({ cambio, onVolver }) {
    const { perfil } = useAuth()
    const producto = cambio.productos_terminados
    const fecha = new Date(cambio.fecha + 'T00:00:00').toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' })
    const motivoLabel = MOTIVOS.find(m => m.key === cambio.motivo)?.label || cambio.motivo
    const destinoLabel = cambio.destino === 'reprocesar' ? 'Reprocesar' : cambio.destino === 'desechar' ? 'Desechar' : 'Pendiente'

    return (
        <div style={{ padding: '24px', maxWidth: '720px' }}>
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
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Cambio Mano a Mano</h1>
                <button onClick={() => window.print()}
                    style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                    🖨️ Imprimir
                </button>
            </div>

            <div className="print-target" style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px', marginBottom: '16px' }}>

                {/* Encabezado del documento */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                    <div>
                        <p style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>{perfil?.empresas?.nombre}</p>
                        {perfil?.empresas?.rif && (
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>RIF: {perfil.empresas.rif}</p>
                        )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Cambio Mano a Mano</p>
                        <p style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937', fontFamily: 'monospace', margin: '0 0 4px' }}>{cambio.numero_cambio}</p>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{fecha}</p>
                    </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 24px' }} />

                {/* Datos del cambio */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '28px' }}>
                    <div>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Cliente</p>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{cambio.clientes?.nombre || '—'}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Despachador</p>
                        <p style={{ fontSize: '14px', color: '#374151', margin: 0 }}>{cambio.usuarios?.nombre || '—'}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Almacén origen</p>
                        <p style={{ fontSize: '14px', color: '#374151', margin: 0 }}>{cambio.almacenes?.nombre || '—'}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Motivo del retiro</p>
                        <p style={{ fontSize: '14px', color: '#374151', margin: 0 }}>{motivoLabel}</p>
                    </div>
                    <div>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Destino del producto</p>
                        <p style={{ fontSize: '14px', color: '#374151', margin: 0 }}>{destinoLabel}</p>
                    </div>
                    {cambio.notas && (
                        <div style={{ gridColumn: '1 / -1' }}>
                            <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Notas</p>
                            <p style={{ fontSize: '14px', color: '#374151', margin: 0, fontStyle: 'italic' }}>{cambio.notas}</p>
                        </div>
                    )}
                </div>

                {/* Tabla de productos */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                            {['Producto', 'Código', 'UM', 'Cantidad', 'Precio unit.', 'Total'].map((h, i) => (
                                <th key={i} style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 600, color: '#6b7280', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{producto?.nombre || '—'}</td>
                            <td style={{ padding: '12px', fontSize: '12px', fontFamily: 'monospace', color: '#6b7280' }}>{producto?.sku || '—'}</td>
                            <td style={{ padding: '12px', fontSize: '13px', color: '#6b7280' }}>{producto?.unidad_medida || '—'}</td>
                            <td style={{ padding: '12px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(cambio.cantidad)}</td>
                            <td style={{ padding: '12px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>$0.00</td>
                            <td style={{ padding: '12px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>$0.00</td>
                        </tr>
                    </tbody>
                </table>

                {/* Totales */}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ width: '260px' }}>
                        {[
                            { label: 'Subtotal', valor: '$0.00' },
                            { label: 'IVA (16%)', valor: '$0.00' },
                        ].map(({ label, valor }) => (
                            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '13px', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>
                                <span>{label}</span><span>{valor}</span>
                            </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 5px', fontSize: '15px', fontWeight: 700, color: '#1f2937' }}>
                            <span>Total</span><span>$0.00</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
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

        // Obtener consecutivo secuencial desde la BD (independiente por empresa)
        const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_cambio_numero', {
            p_empresa_id: perfil.empresa_id
        })
        const numero = numeroConsecutivo || 'CMM-000001' // Fallback por si falla

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
