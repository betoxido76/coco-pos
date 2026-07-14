import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, ChevronRight, X, AlertTriangle, Check, FlaskConical, Package, Search } from 'lucide-react'

const fmt = (n, dec = 2) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: dec, maximumFractionDigits: dec })

const PAGE_SIZE_OPTIONS = [25, 50, 100]

// ── Colores y labels por estado ────────────────────────────────
const ESTADO = {
    borrador: { bg: '#f3f4f6', color: '#6b7280', label: 'Borrador' },
    confirmada: { bg: '#dbeafe', color: '#1e40af', label: 'Confirmada' },
    en_proceso: { bg: '#fef9c3', color: '#854d0e', label: 'En proceso' },
    cerrada: { bg: '#dcfce7', color: '#166534', label: 'Cerrada' },
    anulada: { bg: '#fee2e2', color: '#991b1b', label: 'Anulada' },
}

function BadgeEstado({ estado }) {
    const e = ESTADO[estado] || ESTADO.borrador
    return (
        <span style={{ backgroundColor: e.bg, color: e.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>
            {e.label}
        </span>
    )
}

function getNombreSalida(o) {
    if (o.tipo_salida === 'materia_prima') return o.materias_primas?.nombre || '—'
    return o.productos_terminados?.nombre || '—'
}
function getSkuSalida(o) {
    if (o.tipo_salida === 'materia_prima') return o.materias_primas?.codigo || ''
    return o.productos_terminados?.sku || ''
}
function getUnidadSalida(o) {
    if (o.tipo_salida === 'materia_prima') return o.materias_primas?.unidad_medida || ''
    return o.productos_terminados?.unidad_medida || ''
}

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Produccion() {
    const { perfil } = useAuth()
    const [vista, setVista] = useState('lista')
    const [ordenActual, setOrdenActual] = useState(null)
    const [ordenes, setOrdenes] = useState([])
    const [loading, setLoading] = useState(true)
    const [filtroEstado, setFiltroEstado] = useState('todos')
    const [busqueda, setBusqueda] = useState('')
    const [fechaDesde, setFechaDesde] = useState('')
    const [fechaHasta, setFechaHasta] = useState('')
    const [pagina, setPagina] = useState(0)
    const [pageSize, setPageSize] = useState(50)
    const [sortCol, setSortCol] = useState('')
    const [sortDir, setSortDir] = useState('asc')

    useEffect(() => { cargar() }, [filtroEstado])
    useEffect(() => { setPagina(0) }, [busqueda, fechaDesde, fechaHasta, filtroEstado, pageSize])

    function handleSort(col) {
        if (!col) return
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortCol(col); setSortDir('asc') }
        setPagina(0)
    }

    async function cargar() {
        setLoading(true)
        let q = supabase
            .from('ordenes_produccion')
            .select('*, productos_terminados(nombre, sku, unidad_medida), materias_primas!mp_salida_id(nombre, codigo, unidad_medida)')
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })
        if (filtroEstado !== 'todos') q = q.eq('estado', filtroEstado)
        const { data } = await q
        if (data) setOrdenes(data)
        setLoading(false)
    }

    function abrirDetalle(orden) {
        setOrdenActual(orden)
        setVista('detalle')
    }

    if (vista === 'nueva')
        return <NuevaOrden
            onCreada={(o) => { cargar(); setOrdenActual(o); setVista('detalle') }}
            onCancelar={() => setVista('lista')}
        />

    if (vista === 'detalle')
        return <DetalleOrden
            orden={ordenActual}
            onVolver={() => { cargar(); setVista('lista') }}
            onActualizada={(o) => setOrdenActual(o)}
        />

    // KPIs
    const enProceso = ordenes.filter(o => o.estado === 'en_proceso').length
    const confirmadas = ordenes.filter(o => o.estado === 'confirmada').length
    const cerradasHoy = ordenes.filter(o => {
        if (o.estado !== 'cerrada' || !o.fecha_cierre) return false
        return new Date(o.fecha_cierre).toDateString() === new Date().toDateString()
    }).length

    // Filtros: búsqueda por SKU/descripción + rango sobre fecha_planificada
    const filtrados = ordenes.filter(o => {
        if (busqueda.trim()) {
            const q = busqueda.toLowerCase()
            if (!getNombreSalida(o).toLowerCase().includes(q) && !getSkuSalida(o).toLowerCase().includes(q)) return false
        }
        if (fechaDesde && (!o.fecha_planificada || o.fecha_planificada < fechaDesde)) return false
        if (fechaHasta && (!o.fecha_planificada || o.fecha_planificada > fechaHasta)) return false
        return true
    })

    const ordenados = sortCol ? [...filtrados].sort((a, b) => {
        let av, bv
        switch (sortCol) {
            case 'numero':   av = a.numero_orden || '';               bv = b.numero_orden || '';               break
            case 'lote':     av = a.numero_lote || '';                bv = b.numero_lote || '';                break
            case 'producto': av = getNombreSalida(a);                 bv = getNombreSalida(b);                  break
            case 'planif':   av = Number(a.cantidad_planificada || 0); bv = Number(b.cantidad_planificada || 0); break
            case 'real':     av = Number(a.cantidad_real || 0);        bv = Number(b.cantidad_real || 0);        break
            case 'fecha':    av = a.fecha_planificada || '';          bv = b.fecha_planificada || '';          break
            case 'estado':   av = a.estado || '';                     bv = b.estado || '';                     break
            default:         return 0
        }
        if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
        return sortDir === 'asc' ? av - bv : bv - av
    }) : filtrados

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / pageSize))
    const paginaSegura = Math.min(pagina, totalPaginas - 1)
    const paginados = ordenados.slice(paginaSegura * pageSize, (paginaSegura + 1) * pageSize)

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Producción</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Órdenes de producción</p>
                </div>
                <button onClick={() => setVista('nueva')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Nueva orden
                </button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'En proceso', valor: enProceso, color: '#854d0e', bg: '#fef9c3' },
                    { label: 'Confirmadas', valor: confirmadas, color: '#1e40af', bg: '#dbeafe' },
                    { label: 'Cerradas hoy', valor: cerradasHoy, color: '#166534', bg: '#dcfce7' },
                ].map(k => (
                    <div key={k.label} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{k.label}</p>
                        <p style={{ fontSize: '28px', fontWeight: 700, color: k.color, margin: 0 }}>{k.valor}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[['todos', 'Todas'], ...Object.entries(ESTADO).map(([k, v]) => [k, v.label])].map(([val, lbl]) => (
                    <button key={val} onClick={() => setFiltroEstado(val)}
                        style={{
                            padding: '7px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid', cursor: 'pointer',
                            borderColor: filtroEstado === val ? '#16a34a' : '#e5e7eb',
                            backgroundColor: filtroEstado === val ? '#16a34a' : '#fff',
                            color: filtroEstado === val ? '#fff' : '#6b7280'
                        }}>
                        {lbl}
                    </button>
                ))}
            </div>

            {/* Filtros: búsqueda + rango de fechas */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, minWidth: '220px' }}>
                    <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Buscar por SKU o descripción</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
                            placeholder="SKU o nombre del producto..."
                            style={{ ...inputStyle, paddingLeft: '32px' }} />
                    </div>
                </div>
                <div>
                    <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Fecha planif. desde</label>
                    <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                        style={{ ...inputStyle, width: 'auto' }} />
                </div>
                <div>
                    <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Fecha planif. hasta</label>
                    <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                        style={{ ...inputStyle, width: 'auto' }} />
                </div>
                {(busqueda || fechaDesde || fechaHasta) && (
                    <button onClick={() => { setBusqueda(''); setFechaDesde(''); setFechaHasta('') }}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
                        <X size={13} /> Limpiar
                    </button>
                )}
            </div>

            {/* Tabla */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading
                    ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    : filtrados.length === 0
                        ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                            {ordenes.length === 0 ? 'No hay órdenes en este estado' : 'No hay órdenes que coincidan con los filtros'}
                          </div>
                        : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {[
                                            { key: 'numero',   label: 'N° Orden' },
                                            { key: 'lote',     label: 'Lote' },
                                            { key: 'producto', label: 'Producto' },
                                            { key: 'planif',   label: 'Cant. planif.' },
                                            { key: 'real',     label: 'Cant. real' },
                                            { key: 'fecha',    label: 'Fecha planif.' },
                                            { key: 'estado',   label: 'Estado' },
                                            { key: '',         label: '' },
                                        ].map(col => (
                                            <th key={col.key || 'acc'} onClick={() => handleSort(col.key)}
                                                style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap', cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}>
                                                {col.label}{col.key && ' '}
                                                {col.key && (
                                                    <span style={{ color: sortCol === col.key ? '#16a34a' : '#d1d5db' }}>
                                                        {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                                                    </span>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginados.map(o => (
                                        <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace', color: '#374151', fontWeight: 600 }}>{o.numero_orden}</td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', color: '#374151' }}>
                                                {o.numero_lote
                                                    ? <span style={{ fontFamily: 'monospace' }}>{o.numero_lote}</span>
                                                    : <span style={{ color: '#d97706', fontSize: '12px' }}>⚠ Sin lote</span>}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', color: '#1f2937', fontWeight: 500 }}>
                                                {getNombreSalida(o)}
                                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{getSkuSalida(o)}</span>
                                                {o.tipo_salida === 'materia_prima' && (
                                                    <span style={{ fontSize: '10px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '1px 6px', marginLeft: '6px' }}>semi</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>
                                                {fmt(o.cantidad_planificada, 0)} {getUnidadSalida(o)}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', color: o.cantidad_real ? '#166534' : '#9ca3af', fontWeight: o.cantidad_real ? 600 : 400 }}>
                                                {o.cantidad_real ? `${fmt(o.cantidad_real, 0)} ${getUnidadSalida(o)}` : '—'}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>
                                                {o.fecha_planificada ? new Date(o.fecha_planificada + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}><BadgeEstado estado={o.estado} /></td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <button onClick={() => abrirDetalle(o)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                    Ver <ChevronRight size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
            </div>

            {/* Paginación */}
            {!loading && filtrados.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginTop: '16px', fontSize: '13px', color: '#6b7280', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>Filas por página:</span>
                        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPagina(0) }}
                            style={{ border: '1px solid #d1d5db', borderRadius: '6px', padding: '4px 8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }}>
                            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <span style={{ color: '#9ca3af' }}>
                        {paginaSegura * pageSize + 1}–{Math.min((paginaSegura + 1) * pageSize, filtrados.length)} de {filtrados.length}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={paginaSegura === 0}
                            style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', cursor: paginaSegura === 0 ? 'default' : 'pointer', opacity: paginaSegura === 0 ? 0.4 : 1 }}>←</button>
                        <span style={{ padding: '0 12px' }}>Pág. {paginaSegura + 1} / {totalPaginas}</span>
                        <button onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} disabled={paginaSegura >= totalPaginas - 1}
                            style={{ padding: '4px 12px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', cursor: paginaSegura >= totalPaginas - 1 ? 'default' : 'pointer', opacity: paginaSegura >= totalPaginas - 1 ? 0.4 : 1 }}>→</button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// NUEVA ORDEN — formulario en 2 pasos
// ══════════════════════════════════════════════════════════════
function NuevaOrden({ onCreada, onCancelar }) {
    const { perfil } = useAuth()
    const [paso, setPaso] = useState(1)
    const [productos, setProductos] = useState([])
    const [mpsProducidas, setMpsProducidas] = useState([])
    const [tipoSalida, setTipoSalida] = useState('producto_terminado')
    const [productoId, setProductoId] = useState('')
    const [mpSalidaId, setMpSalidaId] = useState('')
    const [cantPlanif, setCantPlanif] = useState('')
    const [fechaPlan, setFechaPlan] = useState('')
    const [numeroLote, setNumeroLote] = useState('')
    const [observ, setObserv] = useState('')
    const [consumos, setConsumos] = useState([])  // insumos escalados de la receta
    const [insumosMp, setInsumosMp] = useState([])
    const [insumosMe, setInsumosMe] = useState([])

    // Almacenes para selección de origen
    const [almacenes, setAlmacenes] = useState([])
    const [stockPorAlmacen, setStockPorAlmacen] = useState({}) // { item_id: [{ almacen_id, nombre, cantidad }] }
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [alertaLote, setAlertaLote] = useState(false)

    useEffect(() => {
        supabase.from('productos_terminados').select('id, nombre, sku, unidad_medida, vida_util_dias').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setProductos(data || []))
        supabase.from('materias_primas').select('id, nombre, codigo, unidad_medida, vida_util_dias')
            .eq('activo', true).eq('empresa_id', perfil.empresa_id).eq('tipo_producto', 'producido').order('nombre')
            .then(({ data }) => setMpsProducidas(data || []))
        supabase.from('materias_primas').select('id, nombre, codigo, unidad_medida, stock_actual').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setInsumosMp(data || []))
        supabase.from('materiales_empaque').select('id, nombre, codigo, unidad_medida, stock_actual').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setInsumosMe(data || []))

        // Cargar almacenes
        supabase.from('almacenes').select('id, nombre, es_default')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true)
            .order('es_default', { ascending: false }).order('nombre')
            .then(({ data }) => setAlmacenes(data || []))

        // Cargar stock por almacén para todos los insumos
        supabase.from('stock_ubicacion')
            .select('item_id, tipo_item, cantidad, almacen_id, almacenes(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .in('tipo_item', ['materia_prima', 'material_empaque'])
            .gt('cantidad', 0)
            .then(({ data }) => {
                if (!data) return
                const mapa = {}
                data.forEach(s => {
                    if (!mapa[s.item_id]) mapa[s.item_id] = []
                    mapa[s.item_id].push({
                        almacen_id: s.almacen_id,
                        nombre: s.almacenes?.nombre || '—',
                        cantidad: Number(s.cantidad),
                    })
                })
                setStockPorAlmacen(mapa)
            })
    }, [])

    async function cargarReceta() {
        const idSalida = tipoSalida === 'materia_prima' ? mpSalidaId : productoId
        if (!idSalida || !cantPlanif || Number(cantPlanif) <= 0) {
            setError('Selecciona un producto e ingresa una cantidad válida'); return
        }
        setError('')
        // Buscar receta activa del producto
        let recetaQ = supabase
            .from('recetas')
            .select('id, rinde_unidades, receta_items(id, tipo_insumo, insumo_id, cantidad, unidad)')
            .eq('activo', true)
        recetaQ = tipoSalida === 'materia_prima'
            ? recetaQ.eq('mp_id', mpSalidaId)
            : recetaQ.eq('producto_id', productoId)
        const { data: receta } = await recetaQ.maybeSingle()

        if (!receta || !receta.receta_items?.length) {
            // Sin receta — crear consumos vacíos para que el usuario agregue manualmente
            setConsumos([])
            setPaso(2)
            return
        }

        const factor = Number(cantPlanif) / (receta.rinde_unidades || 1)

        // Resolver nombres de insumos
        const itemsConNombre = await Promise.all(receta.receta_items.map(async item => {
            let nombre = '', stock = 0, unidadMedida = item.unidad
            if (item.tipo_insumo === 'materia_prima') {
                const mp = insumosMp.find(m => m.id === item.insumo_id)
                nombre = mp?.nombre || ''; stock = mp?.stock_actual || 0; unidadMedida = mp?.unidad_medida || item.unidad
            } else {
                const me = insumosMe.find(m => m.id === item.insumo_id)
                nombre = me?.nombre || ''; stock = me?.stock_actual || 0; unidadMedida = me?.unidad_medida || item.unidad
            }
            return {
                _key: item.id,
                tipo_insumo: item.tipo_insumo,
                insumo_id: item.insumo_id,
                nombre,
                stock_disponible: stock,
                unidad_medida: unidadMedida,
                cantidad_sugerida: parseFloat((item.cantidad * factor).toFixed(4)),
                cantidad_real: parseFloat((item.cantidad * factor).toFixed(4)),
                es_nuevo: false,
                almacen_id: '', // se asigna abajo
                stock_disponible_almacen: 0,
            }
        }))

        // Asignar almacén por defecto y stock en ese almacén
        const defAlmacen = almacenes.find(a => a.es_default)?.id || almacenes[0]?.id || ''
        const itemsConAlmacen = itemsConNombre.map(c => {
            const stockEnAlmacen = (stockPorAlmacen[c.insumo_id] || []).find(s => s.almacen_id === defAlmacen)?.cantidad || 0
            return { ...c, almacen_id: defAlmacen, stock_disponible_almacen: stockEnAlmacen }
        })

        setConsumos(itemsConAlmacen)
        setPaso(2)
    }

    function cambiarAlmacenConsumo(key, nuevoAlmacenId) {
        setConsumos(prev => prev.map(c => {
            if (c._key !== key) return c
            const stockEnAlmacen = (stockPorAlmacen[c.insumo_id] || []).find(s => s.almacen_id === nuevoAlmacenId)?.cantidad || 0
            return { ...c, almacen_id: nuevoAlmacenId, stock_disponible_almacen: stockEnAlmacen }
        }))
    }

    function actualizarConsumo(key, campo, valor) {
        setConsumos(prev => prev.map(c => c._key === key ? { ...c, [campo]: valor } : c))
    }

    function eliminarConsumo(key) {
        setConsumos(prev => prev.filter(c => c._key !== key))
    }

    function agregarInsumo() {
        const defAlmacen = almacenes.find(a => a.es_default)?.id || almacenes[0]?.id || ''
        setConsumos(prev => [...prev, {
            _key: `nuevo-${Date.now()}`,
            tipo_insumo: 'materia_prima',
            insumo_id: '',
            nombre: '',
            stock_disponible: 0,
            unidad_medida: '',
            cantidad_sugerida: 0,
            cantidad_real: '',
            es_nuevo: true,
            almacen_id: defAlmacen,
        }])
    }

    function handleInsumoSelect(key, tipo, id) {
        const lista = tipo === 'materia_prima' ? insumosMp : insumosMe
        const insumo = lista.find(i => i.id === id)
        const defAlmacen = almacenes.find(a => a.es_default)?.id || almacenes[0]?.id || ''
        const stockEnAlmacen = (stockPorAlmacen[id] || []).find(s => s.almacen_id === defAlmacen)?.cantidad || 0
        setConsumos(prev => prev.map(c => c._key === key ? {
            ...c,
            tipo_insumo: tipo,
            insumo_id: id,
            nombre: insumo?.nombre || '',
            stock_disponible: insumo?.stock_actual || 0,
            unidad_medida: insumo?.unidad_medida || '',
            almacen_id: defAlmacen,
            stock_disponible_almacen: stockEnAlmacen,
        } : c))
    }

    const productoActual = tipoSalida === 'materia_prima'
        ? mpsProducidas.find(p => p.id === mpSalidaId)
        : productos.find(p => p.id === productoId)

    // Alertas de stock insuficiente
    // Alertas de stock insuficiente — basadas en el almacén seleccionado
    const alertasStock = consumos.filter(c => {
        if (!c.insumo_id) return false
        const stockRef = c.almacen_id ? (c.stock_disponible_almacen || 0) : c.stock_disponible
        return Number(c.cantidad_real) > stockRef
    })

    async function confirmarOrden() {
        if (!numeroLote.trim()) {
            setAlertaLote(true)
            return
        }
        await crearOrden()
    }

    async function crearOrdenSinLote() {
        setAlertaLote(false)
        await crearOrden()
    }

    async function crearOrden() {
        setGuardando(true); setError('')

        // Generar número de orden
        const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_op_numero', {
            p_empresa_id: perfil.empresa_id
        })
        const numero = numeroConsecutivo || 'OP-000001' // Fallback por si falla

        // Buscar receta
        const idSalida = tipoSalida === 'materia_prima' ? mpSalidaId : productoId
        let recetaQ2 = supabase.from('recetas').select('id').eq('activo', true)
        recetaQ2 = tipoSalida === 'materia_prima'
            ? recetaQ2.eq('mp_id', mpSalidaId)
            : recetaQ2.eq('producto_id', productoId)
        const { data: receta } = await recetaQ2.maybeSingle()

        const { data: orden, error: errOrden } = await supabase
            .from('ordenes_produccion')
            .insert({
                numero_orden: numero,
                numero_lote: numeroLote.trim() || null,
                producto_id: tipoSalida === 'producto_terminado' ? productoId : null,
                mp_salida_id: tipoSalida === 'materia_prima' ? mpSalidaId : null,
                tipo_salida: tipoSalida,
                receta_id: receta?.id || null,
                cantidad_planificada: Number(cantPlanif),
                estado: 'confirmada',
                fecha_planificada: fechaPlan || null,
                observaciones: observ || null,
                alerta_lote_vacio: !numeroLote.trim(),
                usuario_id: (await supabase.auth.getUser()).data.user.id,
                empresa_id: perfil.empresa_id,
            })
            .select()
            .single()

        if (errOrden) { setError('Error al crear la orden: ' + errOrden.message); setGuardando(false); return }

        // Guardar consumos planificados para preservar cantidades editadas por el usuario
        const consumosAGuardar = consumos.filter(c => c.insumo_id)
        if (consumosAGuardar.length > 0) {
            const { error: errPlan } = await supabase.from('lote_consumos').insert(
                consumosAGuardar.map(c => ({
                    orden_id: orden.id,
                    lote_id: null,
                    tipo_insumo: c.tipo_insumo === 'empaque' ? 'material_empaque' : c.tipo_insumo,
                    insumo_id: c.insumo_id,
                    insumo_nombre: c.nombre,
                    cantidad_sugerida: Number(c.cantidad_sugerida) || 0,
                    cantidad_consumida: Number(c.cantidad_real) || Number(c.cantidad_sugerida) || 0,
                    nota: null,
                    empresa_id: perfil.empresa_id,
                }))
            )
            if (errPlan) {
                setError('Orden creada, pero error al guardar consumos: ' + errPlan.message)
                setGuardando(false)
                onCreada(orden)
                return
            }
        }

        setGuardando(false)
        onCreada(orden)
    }

    // ── PASO 1 ──
    if (paso === 1) return (
        <div style={{ padding: '24px', maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Nueva orden de producción</h1>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#16a34a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700 }}>1</div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Definir producto y cantidad</span>
                </div>

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Tipo de salida *</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {[
                            { val: 'producto_terminado', label: 'Producto terminado (PT)', desc: 'Sale directamente a venta' },
                            { val: 'materia_prima', label: 'Semiterminado / MP producida', desc: 'Insumo para otra orden de producción' },
                        ].map(opt => (
                            <button key={opt.val}
                                onClick={() => { setTipoSalida(opt.val); setProductoId(''); setMpSalidaId('') }}
                                style={{
                                    flex: 1, padding: '10px 14px', borderRadius: '10px', border: '2px solid', cursor: 'pointer', textAlign: 'left',
                                    borderColor: tipoSalida === opt.val ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: tipoSalida === opt.val ? '#f0fdf4' : '#fff',
                                }}>
                                <p style={{ fontSize: '13px', fontWeight: 600, color: tipoSalida === opt.val ? '#166534' : '#374151', margin: '0 0 2px' }}>{opt.label}</p>
                                <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{opt.desc}</p>
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        {tipoSalida === 'materia_prima' ? 'Materia prima / semiterminado a producir *' : 'Producto terminado a producir *'}
                    </label>
                    {tipoSalida === 'producto_terminado' ? (
                        <select value={productoId} onChange={e => setProductoId(e.target.value)} style={inputStyle}>
                            <option value="">Seleccionar producto...</option>
                            {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.sku ? `(${p.sku})` : ''}</option>)}
                        </select>
                    ) : (
                        <>
                            <select value={mpSalidaId} onChange={e => setMpSalidaId(e.target.value)} style={inputStyle}>
                                <option value="">Seleccionar materia prima...</option>
                                {mpsProducidas.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.codigo ? `(${p.codigo})` : ''}</option>)}
                            </select>
                            {mpsProducidas.length === 0 && (
                                <p style={{ fontSize: '12px', color: '#d97706', margin: '6px 0 0' }}>
                                    No hay materias primas con tipo "Producido". Créala en Administración → Materias Primas.
                                </p>
                            )}
                        </>
                    )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Cantidad planificada * {productoActual ? `(${productoActual.unidad_medida})` : ''}
                        </label>
                        <input type="number" min="1" value={cantPlanif} onChange={e => setCantPlanif(e.target.value)}
                            placeholder="Ej: 100" style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Fecha planificada</label>
                        <input type="date" value={fechaPlan} onChange={e => setFechaPlan(e.target.value)} style={inputStyle} />
                    </div>
                </div>

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        Número de lote <span style={{ color: '#9ca3af', fontWeight: 400 }}>(recomendado)</span>
                    </label>
                    <input value={numeroLote} onChange={e => setNumeroLote(e.target.value)}
                        placeholder="Ej: LOTE-2024-001" style={inputStyle} />
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: '4px 0 0' }}>Puedes definirlo ahora o más adelante. Sin número de lote no habrá trazabilidad completa.</p>
                </div>

                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Observaciones</label>
                    <textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2}
                        placeholder="Notas opcionales..." style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}

                <button onClick={cargarReceta}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                    Siguiente — revisar insumos <ChevronRight size={16} />
                </button>
            </div>
        </div>
    )

    // ── PASO 2 ──
    return (
        <div style={{ padding: '24px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={() => setPaso(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Atrás</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Revisar insumos</h1>
            </div>

            {/* Resumen */}
            <div style={{ backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #bbf7d0', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '32px', alignItems: 'center' }}>
                <div>
                    <p style={{ fontSize: '11px', color: '#16a34a', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Producto</p>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{productoActual?.nombre}</p>
                </div>
                <div>
                    <p style={{ fontSize: '11px', color: '#16a34a', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cantidad planificada</p>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{fmt(cantPlanif, 0)} {productoActual?.unidad_medida}</p>
                </div>
                {numeroLote && (
                    <div>
                        <p style={{ fontSize: '11px', color: '#16a34a', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lote</p>
                        <p style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937', margin: 0, fontFamily: 'monospace' }}>{numeroLote}</p>
                    </div>
                )}
            </div>

            {/* Alertas de stock */}
            {alertasStock.length > 0 && (
                <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={16} style={{ color: '#d97706', marginTop: '1px', flexShrink: 0 }} />
                    <div>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#854d0e', margin: '0 0 4px' }}>Stock insuficiente en {alertasStock.length} insumo(s)</p>
                        {alertasStock.map(a => (
                            <p key={a._key} style={{ fontSize: '12px', color: '#854d0e', margin: '2px 0' }}>
                                • {a.nombre}: necesitas {fmt(a.cantidad_real)} pero hay {fmt(a.almacen_id ? (a.stock_disponible_almacen || 0) : a.stock_disponible)} disponibles{a.almacen_id ? ' en el almacén seleccionado' : ''}
                            </p>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabla de insumos */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '16px' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FlaskConical size={16} style={{ color: '#6b7280' }} />
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Insumos a consumir</span>
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>{consumos.length} ítem(s)</span>
                    </div>
                    <button onClick={agregarInsumo}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                        <Plus size={13} /> Agregar insumo
                    </button>
                </div>

                {consumos.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                        No hay receta cargada. Agrega los insumos manualmente.
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Tipo', 'Insumo', 'Stock disp.', 'Almacén origen', 'Stock en almacén', 'Cant. sugerida', 'Cant. a consumir', 'Unidad', ''].map(h => (
                                    <th key={h} style={{ padding: '9px 12px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {consumos.map(c => (
                                <tr key={c._key} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: c.insumo_id && c.almacen_id && Number(c.cantidad_real) > (c.stock_disponible_almacen || 0) ? '#fffbeb' : 'transparent' }}>
                                    <td style={{ padding: '10px 12px' }}>
                                        {c.es_nuevo ? (
                                            <select value={c.tipo_insumo} onChange={e => handleInsumoSelect(c._key, e.target.value, c.insumo_id)}
                                                style={{ ...inputStyle, width: '120px', fontSize: '13px', padding: '5px 8px' }}>
                                                <option value="materia_prima">MP</option>
                                                <option value="material_empaque">Empaque</option>
                                            </select>
                                        ) : (
                                            <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', backgroundColor: c.tipo_insumo === 'materia_prima' ? '#dbeafe' : '#fae8ff', color: c.tipo_insumo === 'materia_prima' ? '#1e40af' : '#7e22ce' }}>
                                                {c.tipo_insumo === 'materia_prima' ? 'MP' : 'Empaque'}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        {c.es_nuevo ? (
                                            <select value={c.insumo_id}
                                                onChange={e => handleInsumoSelect(c._key, c.tipo_insumo, e.target.value)}
                                                style={{ ...inputStyle, fontSize: '13px', padding: '5px 8px', minWidth: '180px' }}>
                                                <option value="">Seleccionar...</option>
                                                {(c.tipo_insumo === 'materia_prima' ? insumosMp : insumosMe).map(i => (
                                                    <option key={i.id} value={i.id}>{i.nombre}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{c.nombre}</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <span style={{ fontSize: '13px', color: Number(c.cantidad_real) > c.stock_disponible ? '#ef4444' : '#16a34a', fontWeight: 500 }}>
                                            {c.insumo_id ? fmt(c.stock_disponible) : '—'}
                                        </span>
                                    </td>
                                    {/* Selector de almacén */}
                                    <td style={{ padding: '10px 12px' }}>
                                        {c.insumo_id ? (
                                            <select value={c.almacen_id || ''}
                                                onChange={e => cambiarAlmacenConsumo(c._key, e.target.value)}
                                                style={{ ...inputStyle, fontSize: '12px', padding: '4px 8px', minWidth: '140px' }}>
                                                <option value="">— Almacén —</option>
                                                {(stockPorAlmacen[c.insumo_id] || []).map(s => (
                                                    <option key={s.almacen_id} value={s.almacen_id}>
                                                        {s.nombre} ({fmt(s.cantidad)})
                                                    </option>
                                                ))}
                                                {/* Si no hay en stock_ubicacion, mostrar todos los almacenes */}
                                                {!(stockPorAlmacen[c.insumo_id]?.length) && almacenes.map(a => (
                                                    <option key={a.id} value={a.id}>{a.nombre} (0)</option>
                                                ))}
                                            </select>
                                        ) : <span style={{ color: '#9ca3af', fontSize: '13px' }}>—</span>}
                                    </td>
                                    {/* Stock disponible en almacén seleccionado */}
                                    <td style={{ padding: '10px 12px' }}>
                                        {c.insumo_id && c.almacen_id ? (
                                            <span style={{
                                                fontSize: '13px', fontWeight: 600,
                                                color: Number(c.cantidad_real) > (c.stock_disponible_almacen || 0) ? '#ef4444' : '#16a34a'
                                            }}>
                                                {fmt(c.stock_disponible_almacen || 0)}
                                            </span>
                                        ) : <span style={{ color: '#9ca3af', fontSize: '13px' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '10px 12px', fontSize: '13px', color: '#9ca3af' }}>
                                        {c.cantidad_sugerida ? fmt(c.cantidad_sugerida) : '—'}
                                    </td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <input type="number" min="0" step="0.001" value={c.cantidad_real}
                                            onChange={e => actualizarConsumo(c._key, 'cantidad_real', e.target.value)}
                                            style={{
                                                ...inputStyle, width: '100px', padding: '5px 8px', fontSize: '13px', fontWeight: 600,
                                                borderColor: c.insumo_id && c.almacen_id && Number(c.cantidad_real) > (c.stock_disponible_almacen || 0) ? '#f87171' : '#d1d5db'
                                            }} />
                                    </td>
                                    <td style={{ padding: '10px 12px', fontSize: '13px', color: '#6b7280' }}>{c.unidad_medida}</td>
                                    <td style={{ padding: '10px 12px' }}>
                                        <button onClick={() => eliminarConsumo(c._key)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                                            <X size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

            {/* Modal alerta lote vacío */}
            {alertaLote && (
                <>
                    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '420px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <AlertTriangle size={40} style={{ color: '#d97706', marginBottom: '12px' }} />
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 8px' }}>¿Continuar sin número de lote?</h3>
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Sin número de lote no tendrás trazabilidad completa sobre este lote de producción. Puedes definirlo después, pero se registrará la alerta.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => setAlertaLote(false)}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer', fontWeight: 500 }}>
                                Volver y definir lote
                            </button>
                            <button onClick={crearOrdenSinLote} disabled={guardando}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#d97706', color: '#fff', fontSize: '14px', cursor: 'pointer', fontWeight: 600 }}>
                                {guardando ? 'Creando...' : 'Continuar sin lote'}
                            </button>
                        </div>
                    </div>
                </>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={confirmarOrden} disabled={guardando}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                    <Check size={16} /> {guardando ? 'Creando orden...' : 'Confirmar y crear orden'}
                </button>
                <button onClick={onCancelar}
                    style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                    Cancelar
                </button>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// DETALLE DE ORDEN
// ══════════════════════════════════════════════════════════════
function DetalleOrden({ orden, onVolver, onActualizada }) {
    const [consumos, setConsumos] = useState([])
    const [consumosDeReceta, setConsumosDeReceta] = useState(false)
    const [loading, setLoading] = useState(true)
    const [modalCierre, setModalCierre] = useState(false)
    const [procesando, setProcesando] = useState(false)
    const [producto, setProducto] = useState(null)

    useEffect(() => { cargarDetalle() }, [orden.id])

    async function cargarDetalle() {
        setLoading(true)
        const { data: cons } = await supabase.from('lote_consumos').select('*').eq('orden_id', orden.id)

        if (cons && cons.length > 0) {
            setConsumos(cons)
            setConsumosDeReceta(false)
        } else if (orden.receta_id) {
            // Sin consumos registrados — cargar ingredientes de la receta como referencia
            const { data: receta } = await supabase
                .from('recetas')
                .select('rinde_unidades, receta_items(tipo_insumo, insumo_id, cantidad)')
                .eq('id', orden.receta_id)
                .single()

            if (receta?.receta_items?.length) {
                const factor = Number(orden.cantidad_planificada) / (receta.rinde_unidades || 1)
                const mpIds = receta.receta_items.filter(i => i.tipo_insumo === 'materia_prima').map(i => i.insumo_id)
                const meIds = receta.receta_items.filter(i => i.tipo_insumo !== 'materia_prima').map(i => i.insumo_id)

                const [{ data: mps }, { data: mes }] = await Promise.all([
                    mpIds.length ? supabase.from('materias_primas').select('id, nombre').in('id', mpIds) : Promise.resolve({ data: [] }),
                    meIds.length ? supabase.from('materiales_empaque').select('id, nombre').in('id', meIds) : Promise.resolve({ data: [] }),
                ])

                const mpMap = Object.fromEntries((mps || []).map(m => [m.id, m.nombre]))
                const meMap = Object.fromEntries((mes || []).map(m => [m.id, m.nombre]))

                setConsumos(receta.receta_items.map((item, idx) => ({
                    id: `receta-${idx}`,
                    tipo_insumo: item.tipo_insumo === 'empaque' ? 'material_empaque' : item.tipo_insumo,
                    insumo_id: item.insumo_id,
                    insumo_nombre: item.tipo_insumo === 'materia_prima' ? (mpMap[item.insumo_id] || '—') : (meMap[item.insumo_id] || '—'),
                    cantidad_sugerida: parseFloat((item.cantidad * factor).toFixed(4)),
                    cantidad_consumida: parseFloat((item.cantidad * factor).toFixed(4)),
                })))
                setConsumosDeReceta(true)
            } else {
                setConsumos([])
                setConsumosDeReceta(false)
            }
        } else {
            setConsumos([])
            setConsumosDeReceta(false)
        }

        if (orden.tipo_salida === 'materia_prima' && orden.mp_salida_id) {
            const { data: mp } = await supabase.from('materias_primas')
                .select('nombre, codigo, unidad_medida, vida_util_dias').eq('id', orden.mp_salida_id).single()
            if (mp) setProducto({ nombre: mp.nombre, sku: mp.codigo, unidad_medida: mp.unidad_medida, vida_util_dias: mp.vida_util_dias })
        } else if (orden.producto_id) {
            const { data: prod } = await supabase.from('productos_terminados')
                .select('nombre, sku, unidad_medida, vida_util_dias').eq('id', orden.producto_id).single()
            if (prod) setProducto(prod)
        }
        setLoading(false)
    }

    async function avanzarEstado() {
        const siguiente = orden.estado === 'confirmada' ? 'en_proceso' : null
        if (!siguiente) return
        setProcesando(true)
        const update = { estado: siguiente }
        if (siguiente === 'en_proceso') update.fecha_inicio = new Date().toISOString()
        const { data } = await supabase.from('ordenes_produccion').update(update).eq('id', orden.id).select().single()
        if (data) onActualizada(data)
        setProcesando(false)
    }

    async function anularOrden() {
        if (!confirm('¿Seguro que deseas anular esta orden? El inventario no se ha modificado en este punto.')) return
        setProcesando(true)

        // Eliminar consumos planificados (el stock no fue descontado aún — se descuenta solo al cerrar)
        await supabase.from('lote_consumos').delete().eq('orden_id', orden.id)

        const { data } = await supabase.from('ordenes_produccion')
            .update({ estado: 'anulada' }).eq('id', orden.id).select().single()
        if (data) onActualizada(data)
        setProcesando(false)
    }

    const puedeAvanzar = ['confirmada'].includes(orden.estado)
    const puedeCerrar = orden.estado === 'en_proceso'
    const puedeAnular = ['confirmada', 'en_proceso'].includes(orden.estado)

    return (
        <div className="print-target" style={{ padding: '24px', maxWidth: '820px' }}>
            <style>{`@media print { body * { visibility: hidden; } .print-target, .print-target * { visibility: visible; } .print-target { position: fixed; top: 0; left: 0; width: 100% !important; max-width: none !important; margin: 0; padding: 20px !important; border: none !important; box-shadow: none !important; background: white !important; } .no-print { display: none !important; } }`}</style>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Orden {orden.numero_orden}</h1>
                <BadgeEstado estado={orden.estado} />
                {orden.alerta_lote_vacio && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#d97706', backgroundColor: '#fef9c3', padding: '2px 8px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                        <AlertTriangle size={12} /> Sin número de lote
                    </span>
                )}
                <button onClick={() => window.print()} style={{ marginLeft: 'auto', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>🖨️ Imprimir</button>
            </div>

            {/* Info cabecera */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Producto', valor: producto?.nombre || '—' },
                    { label: 'Lote', valor: orden.numero_lote || '—', mono: true },
                    { label: 'Cant. planificada', valor: `${fmt(orden.cantidad_planificada, 0)} ${producto?.unidad_medida || ''}` },
                    { label: 'Cant. producida', valor: orden.cantidad_real ? `${fmt(orden.cantidad_real, 0)} ${producto?.unidad_medida || ''}` : '—', color: orden.cantidad_real ? '#166534' : undefined },
                ].map(f => (
                    <div key={f.label} style={{ backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px' }}>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: f.color || '#1f2937', margin: 0, fontFamily: f.mono ? 'monospace' : 'inherit' }}>{f.valor}</p>
                    </div>
                ))}
            </div>

            {/* Fechas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Fecha planificada', valor: orden.fecha_planificada ? new Date(orden.fecha_planificada + 'T00:00:00').toLocaleDateString('es-VE') : '—' },
                    { label: 'Inicio real', valor: orden.fecha_inicio ? new Date(orden.fecha_inicio).toLocaleString('es-VE') : '—' },
                    { label: 'Fecha cierre', valor: orden.fecha_cierre ? new Date(orden.fecha_cierre).toLocaleString('es-VE') : '—' },
                ].map(f => (
                    <div key={f.label} style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '12px 16px' }}>
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{f.label}</p>
                        <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>{f.valor}</p>
                    </div>
                ))}
            </div>

            {/* Consumos */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <FlaskConical size={16} style={{ color: '#6b7280' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Insumos</span>
                    {consumosDeReceta && (
                        <span style={{ fontSize: '11px', color: '#d97706', backgroundColor: '#fef9c3', padding: '2px 8px', borderRadius: '12px', border: '1px solid #fde68a' }}>
                            Cantidades según receta — sin consumos registrados
                        </span>
                    )}
                </div>
                {loading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : consumos.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No se registraron consumos</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                <th style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>Tipo</th>
                                <th style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>Insumo</th>
                                <th style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{consumosDeReceta ? 'Cant. planificada' : 'Cant. sugerida'}</th>
                                {!consumosDeReceta && <th style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>Cant. consumida</th>}
                                {!consumosDeReceta && <th style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>Diferencia</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {consumos.map(c => {
                                const diff = Number(c.cantidad_consumida) - Number(c.cantidad_sugerida || c.cantidad_consumida)
                                const diffPct = c.cantidad_sugerida ? (diff / c.cantidad_sugerida) * 100 : 0
                                return (
                                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '10px 14px' }}>
                                            <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '12px', backgroundColor: c.tipo_insumo === 'materia_prima' ? '#dbeafe' : '#fae8ff', color: c.tipo_insumo === 'materia_prima' ? '#1e40af' : '#7e22ce' }}>
                                                {c.tipo_insumo === 'materia_prima' ? 'MP' : 'Empaque'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{c.insumo_nombre || c.insumo_id}</td>
                                        <td style={{ padding: '10px 14px', fontSize: '13px', color: '#6b7280' }}>{c.cantidad_sugerida ? fmt(c.cantidad_sugerida) : '—'}</td>
                                        {!consumosDeReceta && (
                                            <td style={{ padding: '10px 14px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{fmt(c.cantidad_consumida)}</td>
                                        )}
                                        {!consumosDeReceta && (
                                            <td style={{ padding: '10px 14px' }}>
                                                {c.cantidad_sugerida ? (
                                                    <span style={{ fontSize: '12px', fontWeight: 500, color: Math.abs(diffPct) > 10 ? '#dc2626' : Math.abs(diffPct) > 0 ? '#d97706' : '#16a34a' }}>
                                                        {diff > 0 ? '+' : ''}{fmt(diff)} ({diff > 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                                                    </span>
                                                ) : <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>}
                                            </td>
                                        )}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Observaciones */}
            {orden.observaciones && (
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', padding: '14px 16px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Observaciones</p>
                    <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>{orden.observaciones}</p>
                </div>
            )}

            {/* Acciones */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {puedeAvanzar && (
                    <button onClick={avanzarEstado} disabled={procesando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                        <ChevronRight size={16} /> {procesando ? 'Procesando...' : 'Iniciar producción'}
                    </button>
                )}
                {puedeCerrar && (
                    <button onClick={() => setModalCierre(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                        <Package size={16} /> Cerrar orden y registrar {orden.tipo_salida === 'materia_prima' ? 'MP' : 'PT'}
                    </button>
                )}
                {puedeAnular && (
                    <button onClick={anularOrden} disabled={procesando}
                        style={{ backgroundColor: '#fff', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>
                        Anular orden
                    </button>
                )}
            </div>

            {/* Modal de cierre */}
            {modalCierre && (
                <ModalCierre
                    orden={orden}
                    producto={producto}
                    onCerrar={() => setModalCierre(false)}
                    onCerrada={(o) => { onActualizada(o); setModalCierre(false); cargarDetalle() }}
                />
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// MODAL DE CIERRE
// ══════════════════════════════════════════════════════════════
function ModalCierre({ orden, producto, onCerrar, onCerrada }) {
    const { perfil } = useAuth()
    const [cantReal, setCantReal] = useState(orden.cantidad_planificada)
    const [fechaVenc, setFechaVenc] = useState(() => {
        if (producto?.vida_util_dias) {
            const d = new Date()
            d.setDate(d.getDate() + producto.vida_util_dias)
            return d.toISOString().split('T')[0]
        }
        return ''
    })
    const [numeroLote, setNumeroLote] = useState(orden.numero_lote || '')
    const [observ, setObserv] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    // Almacén destino del PT/MP producido
    const [almacenes, setAlmacenes] = useState([])
    const [almacenId, setAlmacenId] = useState('')

    // Consumo de insumos
    const [consumoItems, setConsumoItems] = useState([])
    const [insumosMp, setInsumosMp] = useState([])
    const [insumosMe, setInsumosMe] = useState([])
    const [loadingInsumos, setLoadingInsumos] = useState(true)

    useEffect(() => { cargarDatos() }, [])

    async function cargarDatos() {
        const [
            { data: alms },
            { data: mps },
            { data: mes },
        ] = await Promise.all([
            supabase.from('almacenes').select('id, nombre, es_default').eq('empresa_id', perfil.empresa_id).eq('activo', true).order('es_default', { ascending: false }).order('nombre'),
            supabase.from('materias_primas').select('id, nombre, codigo, unidad_medida, stock_actual').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('materiales_empaque').select('id, nombre, codigo, unidad_medida, stock_actual').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
        ])

        setAlmacenes(alms || [])
        const def = (alms || []).find(a => a.es_default) || (alms || [])[0]
        if (def) setAlmacenId(def.id)
        setInsumosMp(mps || [])
        setInsumosMe(mes || [])

        const defAlmId = def?.id || ''
        const allInsumos = [...(mps || []), ...(mes || [])]

        // Cargar lote_consumos existentes (planificados) o la receta como fallback
        const { data: existingConsumos } = await supabase.from('lote_consumos').select('*').eq('orden_id', orden.id)

        if (existingConsumos && existingConsumos.length > 0) {
            setConsumoItems(existingConsumos.map(c => ({
                _key: c.id,
                tipo_insumo: c.tipo_insumo,
                insumo_id: c.insumo_id,
                insumo_nombre: c.insumo_nombre,
                cantidad_sugerida: Number(c.cantidad_sugerida),
                cantidad_real: String(c.cantidad_consumida),
                almacen_id: c.almacen_id || defAlmId,
            })))
        } else if (orden.receta_id) {
            const { data: receta } = await supabase.from('recetas')
                .select('rinde_unidades, receta_items(tipo_insumo, insumo_id, cantidad)')
                .eq('id', orden.receta_id).single()
            if (receta?.receta_items?.length) {
                const factor = Number(orden.cantidad_planificada) / (receta.rinde_unidades || 1)
                setConsumoItems(receta.receta_items.map((item, idx) => {
                    const ins = allInsumos.find(i => i.id === item.insumo_id)
                    const qty = parseFloat((item.cantidad * factor).toFixed(4))
                    const tipoNorm = item.tipo_insumo === 'empaque' ? 'material_empaque' : item.tipo_insumo
                    return {
                        _key: `receta-${idx}`,
                        tipo_insumo: tipoNorm,
                        insumo_id: item.insumo_id,
                        insumo_nombre: ins?.nombre || '—',
                        cantidad_sugerida: qty,
                        cantidad_real: String(qty),
                        almacen_id: defAlmId,
                    }
                }))
            }
        }

        setLoadingInsumos(false)
    }

    function actualizarConsumo(key, campo, valor) {
        setConsumoItems(prev => prev.map(c => c._key === key ? { ...c, [campo]: valor } : c))
    }

    function seleccionarInsumo(key, tipoYId) {
        if (!tipoYId) return
        const [tipo, id] = tipoYId.split(':')
        const lista = tipo === 'materia_prima' ? insumosMp : insumosMe
        const ins = lista.find(i => i.id === id)
        setConsumoItems(prev => prev.map(c => c._key === key ? { ...c, tipo_insumo: tipo, insumo_id: id, insumo_nombre: ins?.nombre || '' } : c))
    }

    function agregarInsumo() {
        const defAlmId = almacenes.find(a => a.es_default)?.id || almacenes[0]?.id || ''
        setConsumoItems(prev => [...prev, { _key: `nuevo-${Date.now()}`, tipo_insumo: 'materia_prima', insumo_id: '', insumo_nombre: '', cantidad_sugerida: 0, cantidad_real: '', almacen_id: defAlmId }])
    }

    async function cerrar() {
        if (!cantReal || Number(cantReal) <= 0) { setError('Ingresa la cantidad real producida'); return }
        if (!almacenId) { setError('Selecciona el almacén de ingreso del producto terminado'); return }
        setGuardando(true); setError('')

        // 1. Cerrar la orden
        const { data: ordenCerrada, error: errOrden } = await supabase
            .from('ordenes_produccion')
            .update({
                estado: 'cerrada',
                cantidad_real: Number(cantReal),
                fecha_cierre: new Date().toISOString(),
                fecha_vencimiento_lote: fechaVenc || null,
                numero_lote: numeroLote || orden.numero_lote || null,
                observaciones: observ || orden.observaciones || null,
                alerta_lote_vacio: !numeroLote && !orden.numero_lote,
                usuario_cierre_id: (await supabase.auth.getUser()).data.user.id,
            })
            .eq('id', orden.id).select().single()

        if (errOrden) { setError('Error: ' + errOrden.message); setGuardando(false); return }

        // 2. Crear el lote de producción primero (solo PT; para MP se deja null)
        let loteId = null
        if (orden.tipo_salida !== 'materia_prima') {
            const userId = (await supabase.auth.getUser()).data.user.id
            const { data: lote, error: errLote } = await supabase.from('lotes_produccion').insert({
                orden_id: orden.id, producto_id: orden.producto_id,
                usuario_id: userId,
                numero_lote: numeroLote || orden.numero_lote || null,
                cantidad_producida: Number(cantReal),
                fecha_produccion: new Date().toISOString().split('T')[0],
                fecha_vencimiento: fechaVenc || null,
                observaciones: observ || null,
                empresa_id: perfil.empresa_id
            }).select('id').single()
            if (errLote) { setError('Error al crear lote: ' + errLote.message); setGuardando(false); return }
            loteId = lote.id
        }

        // 3. Registrar consumo real y descontar stock de insumos
        const consumosValidos = consumoItems.filter(c => c.insumo_id && Number(c.cantidad_real) > 0)

        if (consumosValidos.length > 0) {
            // Eliminar planificados (guardados al crear la orden) antes de insertar los reales
            await supabase.from('lote_consumos').delete().eq('orden_id', orden.id)

            const { error: errConsumos } = await supabase.from('lote_consumos').insert(
                consumosValidos.map(c => ({
                    orden_id: orden.id, lote_id: loteId,
                    tipo_insumo: c.tipo_insumo, insumo_id: c.insumo_id,
                    insumo_nombre: c.insumo_nombre,
                    cantidad_sugerida: c.cantidad_sugerida || Number(c.cantidad_real),
                    cantidad_consumida: Number(c.cantidad_real),
                    nota: null, empresa_id: perfil.empresa_id,
                }))
            )
            if (errConsumos) { setError('Error al guardar consumos: ' + errConsumos.message); setGuardando(false); return }

            for (const c of consumosValidos) {
                const tabla = c.tipo_insumo === 'materia_prima' ? 'materias_primas' : 'materiales_empaque'
                const tipoItem = c.tipo_insumo === 'materia_prima' ? 'materia_prima' : 'material_empaque'
                const { data: insumo } = await supabase.from(tabla)
                    .select('stock_actual, nombre, codigo').eq('id', c.insumo_id).single()
                if (!insumo) continue

                const nuevoStock = Math.max(0, insumo.stock_actual - Number(c.cantidad_real))
                await supabase.from(tabla).update({ stock_actual: nuevoStock }).eq('id', c.insumo_id)

                if (c.almacen_id) {
                    // Repartir el descuento entre las filas del almacen (NULL primero, luego ubicaciones)
                    const { data: filasSU } = await supabase.from('stock_ubicacion')
                        .select('id, cantidad')
                        .eq('almacen_id', c.almacen_id).eq('tipo_item', tipoItem)
                        .eq('item_id', c.insumo_id).eq('empresa_id', perfil.empresa_id)
                        .gt('cantidad', 0)
                        .order('almacen_ubicacion_id', { ascending: true, nullsFirst: true })
                    let restante = Number(c.cantidad_real)
                    for (const fila of (filasSU || [])) {
                        if (restante <= 0) break
                        const desc = Math.min(Number(fila.cantidad), restante)
                        await supabase.from('stock_ubicacion')
                            .update({ cantidad: Number(fila.cantidad) - desc, updated_at: new Date().toISOString() })
                            .eq('id', fila.id)
                        restante -= desc
                    }
                }

                await supabase.from('movimientos_inventario').insert({
                    empresa_id: perfil.empresa_id, tipo_item: tipoItem,
                    item_id: c.insumo_id, item_nombre: c.insumo_nombre || insumo.nombre,
                    item_codigo: insumo.codigo || '', tipo_movimiento: 'salida',
                    cantidad: Number(c.cantidad_real), stock_anterior: insumo.stock_actual,
                    stock_actual: nuevoStock, origen: 'produccion_consumo',
                    almacen_id: c.almacen_id || null, fecha: new Date().toISOString()
                })
            }
        }

        // 3. Agregar PT/MP producido al stock
        if (orden.tipo_salida === 'materia_prima') {
            const { data: mp } = await supabase.from('materias_primas').select('stock_actual').eq('id', orden.mp_salida_id).single()
            if (mp) {
                const nuevoStock = mp.stock_actual + Number(cantReal)
                await supabase.from('materias_primas').update({ stock_actual: nuevoStock }).eq('id', orden.mp_salida_id)
                const { data: su } = await supabase.from('stock_ubicacion').select('id, cantidad').eq('almacen_id', almacenId).eq('tipo_item', 'materia_prima').eq('item_id', orden.mp_salida_id).eq('empresa_id', perfil.empresa_id).is('almacen_ubicacion_id', null).maybeSingle()
                if (su) {
                    await supabase.from('stock_ubicacion').update({ cantidad: Number(su.cantidad) + Number(cantReal), updated_at: new Date().toISOString() }).eq('id', su.id)
                } else {
                    await supabase.from('stock_ubicacion').insert({ almacen_id: almacenId, almacen_ubicacion_id: null, tipo_item: 'materia_prima', item_id: orden.mp_salida_id, cantidad: Number(cantReal), empresa_id: perfil.empresa_id, updated_at: new Date().toISOString() })
                }
                await supabase.from('movimientos_inventario').insert({ empresa_id: perfil.empresa_id, tipo_item: 'materia_prima', item_id: orden.mp_salida_id, item_nombre: producto?.nombre, item_codigo: producto?.sku || '', tipo_movimiento: 'entrada', cantidad: Number(cantReal), stock_anterior: mp.stock_actual, stock_actual: nuevoStock, origen: 'produccion_cierre', almacen_id: almacenId, fecha: new Date().toISOString() })
            }
        } else {
            const { data: pt } = await supabase.from('productos_terminados').select('stock_actual').eq('id', orden.producto_id).single()
            if (pt) {
                const nuevoStock = pt.stock_actual + Number(cantReal)
                await supabase.from('productos_terminados').update({ stock_actual: nuevoStock }).eq('id', orden.producto_id)
                const { data: su } = await supabase.from('stock_ubicacion').select('id, cantidad').eq('almacen_id', almacenId).eq('tipo_item', 'producto_terminado').eq('item_id', orden.producto_id).eq('empresa_id', perfil.empresa_id).is('almacen_ubicacion_id', null).maybeSingle()
                if (su) {
                    await supabase.from('stock_ubicacion').update({ cantidad: Number(su.cantidad) + Number(cantReal), updated_at: new Date().toISOString() }).eq('id', su.id)
                } else {
                    await supabase.from('stock_ubicacion').insert({ almacen_id: almacenId, almacen_ubicacion_id: null, tipo_item: 'producto_terminado', item_id: orden.producto_id, cantidad: Number(cantReal), empresa_id: perfil.empresa_id, updated_at: new Date().toISOString() })
                }
                await supabase.from('movimientos_inventario').insert({ empresa_id: perfil.empresa_id, tipo_item: 'producto_terminado', item_id: orden.producto_id, item_nombre: producto?.nombre, item_codigo: producto?.sku || '', tipo_movimiento: 'entrada', cantidad: Number(cantReal), stock_anterior: pt.stock_actual, stock_actual: nuevoStock, origen: 'produccion_cierre', almacen_id: almacenId, fecha: new Date().toISOString() })
            }
        }

        setGuardando(false)
        onCerrada(ordenCerrada)
    }

    const eficiencia = orden.cantidad_planificada > 0
        ? ((Number(cantReal) / orden.cantidad_planificada) * 100).toFixed(1)
        : 0

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '560px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '92vh', overflowY: 'auto' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Cerrar orden de producción</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                {/* Resumen */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                        <span style={{ color: '#6b7280' }}>Producto</span>
                        <span style={{ fontWeight: 600, color: '#1f2937' }}>{producto?.nombre}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: '#6b7280' }}>Cantidad planificada</span>
                        <span style={{ color: '#1f2937' }}>{fmt(orden.cantidad_planificada, 0)} {producto?.unidad_medida}</span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>

                    {/* Almacén destino */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Almacén de ingreso del {orden.tipo_salida === 'materia_prima' ? 'MP' : 'PT'} *</label>
                        {almacenes.length === 0 ? (
                            <p style={{ fontSize: '13px', color: '#ef4444', margin: 0 }}>No hay almacenes configurados</p>
                        ) : (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {almacenes.map(a => (
                                    <button key={a.id} onClick={() => setAlmacenId(a.id)}
                                        style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid', cursor: 'pointer', borderColor: almacenId === a.id ? '#16a34a' : '#e5e7eb', backgroundColor: almacenId === a.id ? '#f0fdf4' : '#fff', color: almacenId === a.id ? '#16a34a' : '#6b7280' }}>
                                        {a.nombre}{a.es_default && <span style={{ fontSize: '10px', marginLeft: '5px', opacity: 0.6 }}>(principal)</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Cantidad real */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Cantidad real producida * ({producto?.unidad_medida})</label>
                        <input type="number" min="0" step="1" value={cantReal} onChange={e => setCantReal(e.target.value)} style={inputStyle} />
                        {cantReal && orden.cantidad_planificada > 0 && (
                            <p style={{ fontSize: '12px', margin: '4px 0 0', color: Number(eficiencia) >= 95 ? '#16a34a' : Number(eficiencia) >= 80 ? '#d97706' : '#ef4444' }}>
                                Eficiencia: {eficiencia}% de lo planificado
                            </p>
                        )}
                    </div>

                    {/* Insumos consumidos */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Insumos consumidos</label>
                            <button onClick={agregarInsumo} style={{ fontSize: '12px', color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>+ Agregar</button>
                        </div>
                        {loadingInsumos ? (
                            <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Cargando insumos...</p>
                        ) : consumoItems.length === 0 ? (
                            <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '10px 14px', border: '1px solid #e5e7eb', fontSize: '13px', color: '#9ca3af' }}>
                                Sin insumos registrados — haz clic en "+ Agregar" para agregar manualmente
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {consumoItems.map(c => (
                                    <div key={c._key} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', backgroundColor: '#fafafa' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 80px 28px', gap: '6px', alignItems: 'center' }}>
                                            <select value={c.insumo_id ? `${c.tipo_insumo}:${c.insumo_id}` : ''} onChange={e => seleccionarInsumo(c._key, e.target.value)}
                                                style={{ fontSize: '12px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#fff' }}>
                                                <option value="">Seleccionar insumo...</option>
                                                {insumosMp.length > 0 && <optgroup label="Materias primas">
                                                    {insumosMp.map(i => <option key={i.id} value={`materia_prima:${i.id}`}>{i.nombre}</option>)}
                                                </optgroup>}
                                                {insumosMe.length > 0 && <optgroup label="Materiales de empaque">
                                                    {insumosMe.map(i => <option key={i.id} value={`material_empaque:${i.id}`}>{i.nombre}</option>)}
                                                </optgroup>}
                                            </select>
                                            <select value={c.almacen_id} onChange={e => actualizarConsumo(c._key, 'almacen_id', e.target.value)}
                                                style={{ fontSize: '12px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: '#fff' }}>
                                                <option value="">Sin almacén</option>
                                                {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                            </select>
                                            <input type="number" min="0" step="0.001" value={c.cantidad_real}
                                                onChange={e => actualizarConsumo(c._key, 'cantidad_real', e.target.value)}
                                                placeholder="Cant."
                                                style={{ fontSize: '12px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #d1d5db', textAlign: 'right' }} />
                                            <button onClick={() => setConsumoItems(prev => prev.filter(x => x._key !== c._key))}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', display: 'flex', alignItems: 'center' }}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                        {c.cantidad_sugerida > 0 && (
                                            <p style={{ margin: '3px 0 0', fontSize: '11px', color: '#9ca3af' }}>Planificado: {fmt(c.cantidad_sugerida)}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Número de lote */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Número de lote {!orden.numero_lote && <span style={{ color: '#d97706' }}>(sin definir — recomendado completar ahora)</span>}
                        </label>
                        <input value={numeroLote} onChange={e => setNumeroLote(e.target.value)} placeholder="Ej: LOTE-2024-001" style={inputStyle} />
                    </div>

                    {/* Fecha vencimiento */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Fecha de vencimiento del lote
                            {producto?.vida_util_dias && <span style={{ color: '#9ca3af', fontWeight: 400 }}> (calculada: {producto.vida_util_dias} días)</span>}
                        </label>
                        <input type="date" value={fechaVenc} onChange={e => setFechaVenc(e.target.value)} style={inputStyle} />
                    </div>

                    {/* Observaciones cierre */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Observaciones de cierre</label>
                        <textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2}
                            placeholder="Notas del cierre..." style={{ ...inputStyle, resize: 'vertical' }} />
                    </div>
                </div>

                {/* Impacto en inventario */}
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                    <p style={{ fontSize: '12px', color: '#16a34a', margin: '0 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impacto en inventario al confirmar</p>
                    <p style={{ fontSize: '13px', color: '#166534', margin: '0 0 2px' }}>
                        ✓ Se sumarán <strong>{fmt(cantReal, 0)} {producto?.unidad_medida}</strong> al stock de <strong>{producto?.nombre}</strong>
                    </p>
                    {consumoItems.filter(c => c.insumo_id && Number(c.cantidad_real) > 0).length > 0 && (
                        <p style={{ fontSize: '12px', color: '#166534', margin: '2px 0 0' }}>
                            ✓ Se descontarán {consumoItems.filter(c => c.insumo_id && Number(c.cantidad_real) > 0).length} insumo(s) del inventario
                        </p>
                    )}
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

                <button onClick={cerrar} disabled={guardando}
                    style={{ width: '100%', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>
                    {guardando ? 'Cerrando orden...' : `✓ Confirmar cierre y registrar ${orden.tipo_salida === 'materia_prima' ? 'MP' : 'PT'}`}
                </button>
            </div>
        </>
    )
}