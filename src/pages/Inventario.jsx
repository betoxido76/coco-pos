import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Package, AlertTriangle, Search, Layers, Beaker, Truck, ArrowDownLeft, ArrowUpRight, History, Filter, Warehouse, ArrowLeftRight, Plus } from 'lucide-react'

const TIPOS_INVENTARIO = [
    { key: 'todos', label: 'Todo el inventario', icon: Layers },
    { key: 'pt', label: 'Productos Terminados', icon: Package },
    { key: 'mp', label: 'Materias Primas', icon: Beaker },
    { key: 'emp', label: 'Materiales de Empaque', icon: Truck },
    { key: 'con', label: 'Consumibles', icon: Filter },
]

const TIPO_LABEL = {
    producto_terminado: 'PT', materia_prima: 'MP',
    material_empaque: 'ME', consumible: 'CON',
}

function BadgeStock({ stock, minimo }) {
    if (stock === 0)
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Sin stock</span>
    if (stock <= minimo)
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Stock bajo</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
}

export default function Inventario() {
    const [tabActiva, setTabActiva] = useState('stock')

    return (
        <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Inventario</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Gestión unificada de stock y movimientos</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    {[
                        { key: 'stock', label: 'Stock Actual', icon: Package },
                        { key: 'almacenes', label: 'Por Almacén', icon: Warehouse },
                        { key: 'movimientos', label: 'Movimientos', icon: History },
                    ].map(tab => (
                        <button key={tab.key} onClick={() => setTabActiva(tab.key)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                                ${tabActiva === tab.key ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {tabActiva === 'stock' && <VistaStock />}
            {tabActiva === 'almacenes' && <VistaPorAlmacen />}
            {tabActiva === 'movimientos' && <VistaMovimientos />}
        </div>
    )
}

// ─── Vista: Stock Actual ──────────────────────────────────────
const PAGE_SIZE_OPTIONS = [25, 50, 100]

function VistaStock() {
    const { perfil } = useAuth()
    const [inventario, setInventario] = useState([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [tipoFiltro, setTipoFiltro] = useState('todos')
    const [pagina, setPagina] = useState(0)
    const [pageSize, setPageSize] = useState(50)
    const [sortCol, setSortCol] = useState('nombre')
    const [sortDir, setSortDir] = useState('asc')

    useEffect(() => { cargarInventario() }, [tipoFiltro])
    useEffect(() => { setPagina(0) }, [busqueda, tipoFiltro, pageSize])

    function handleSort(col) {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortCol(col); setSortDir('asc') }
        setPagina(0)
    }

    async function cargarInventario() {
        setLoading(true)
        let datos = []
        const sinIVA = (val) => Number(val || 0) / 1.16

        if (tipoFiltro === 'todos' || tipoFiltro === 'pt') {
            const { data } = await supabase.from('productos_terminados').select('*').eq('activo', true).eq('empresa_id', perfil.empresa_id).neq('tipo_producto', 'servicio').limit(5000)
            if (data) datos = [...datos, ...data.map(p => ({ ...p, tipo: 'Producto Terminado', codigo: p.sku, precio: p.aplica_iva ? sinIVA(p.costo_promedio) : Number(p.costo_promedio || 0), vencimiento: null }))]
        }
        if (tipoFiltro === 'todos' || tipoFiltro === 'mp') {
            const { data } = await supabase.from('materias_primas').select('*').eq('activo', true).eq('empresa_id', perfil.empresa_id).limit(5000)
            if (data) datos = [...datos, ...data.map(p => ({ ...p, tipo: 'Materia Prima', codigo: p.codigo, precio: p.aplica_iva ? sinIVA(p.costo_compra_promedio) : Number(p.costo_compra_promedio || 0), vencimiento: p.fecha_vencimiento }))]
        }
        if (tipoFiltro === 'todos' || tipoFiltro === 'emp') {
            const { data } = await supabase.from('materiales_empaque').select('*').eq('activo', true).eq('empresa_id', perfil.empresa_id).limit(5000)
            if (data) datos = [...datos, ...data.map(p => ({ ...p, tipo: 'Material Empaque', codigo: p.codigo, precio: p.aplica_iva ? sinIVA(p.costo_compra_promedio) : Number(p.costo_compra_promedio || 0), vencimiento: p.fecha_vencimiento }))]
        }
        if (tipoFiltro === 'todos' || tipoFiltro === 'con') {
            const { data } = await supabase.from('consumibles').select('*').eq('activo', true).eq('empresa_id', perfil.empresa_id).limit(5000)
            if (data) datos = [...datos, ...data.map(p => ({ ...p, tipo: 'Consumible', codigo: p.codigo, precio: p.aplica_iva ? sinIVA(p.costo_compra_promedio) : Number(p.costo_compra_promedio || 0), vencimiento: p.fecha_vencimiento }))]
        }

        setInventario(datos.sort((a, b) => a.nombre.localeCompare(b.nombre)))
        setLoading(false)
    }

    // filtrados = dataset completo según búsqueda (para KPIs y paginación)
    const filtrados = inventario.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo?.toLowerCase().includes(busqueda.toLowerCase())
    )

    // KPIs siempre sobre el dataset completo filtrado (no sobre la página visible)
    const criticos = filtrados.filter(p => p.stock_actual <= p.stock_minimo).length
    const totalUnidades = filtrados.reduce((sum, p) => sum + (p.stock_actual || 0), 0)
    const valorTotalInventario = filtrados.reduce((sum, p) => sum + ((p.precio || 0) * (p.stock_actual || 0)), 0)

    const ordenados = [...filtrados].sort((a, b) => {
        let av, bv
        switch (sortCol) {
            case 'nombre':     av = a.nombre || '';          bv = b.nombre || '';          break
            case 'codigo':     av = a.codigo || '';          bv = b.codigo || '';          break
            case 'tipo':       av = a.tipo || '';            bv = b.tipo || '';            break
            case 'stock':      av = Number(a.stock_actual || 0);  bv = Number(b.stock_actual || 0);  break
            case 'minimo':     av = Number(a.stock_minimo || 0);  bv = Number(b.stock_minimo || 0);  break
            case 'precio':     av = Number(a.precio || 0);        bv = Number(b.precio || 0);        break
            case 'valorTotal': av = Number(a.precio || 0) * Number(a.stock_actual || 0);
                               bv = Number(b.precio || 0) * Number(b.stock_actual || 0);             break
            default:           return 0
        }
        if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
        return sortDir === 'asc' ? av - bv : bv - av
    })

    const totalPaginas = Math.ceil(filtrados.length / pageSize)
    const paginados = ordenados.slice(pagina * pageSize, (pagina + 1) * pageSize)

    return (
        <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">Total registros</p>
                    <p className="text-2xl font-semibold text-gray-800 mt-1">{filtrados.length}</p>
                </div>
                <div className={`bg-white rounded-xl border p-4 ${criticos > 0 ? 'border-amber-200' : 'border-gray-200'}`}>
                    <p className="text-xs text-gray-500">Stock crítico</p>
                    <p className={`text-2xl font-semibold mt-1 ${criticos > 0 ? 'text-amber-600' : 'text-gray-800'}`}>{criticos}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">Total unidades</p>
                    <p className="text-2xl font-semibold text-gray-800 mt-1">{totalUnidades.toLocaleString()}</p>
                </div>
                <div className="bg-white rounded-xl border border-green-200 p-4">
                    <p className="text-xs text-gray-500">Valor total inventario</p>
                    <p className="text-2xl font-bold text-gray-800 mt-1">
                        ${valorTotalInventario.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-48">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Buscar por nombre o código..."
                        value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {TIPOS_INVENTARIO.map(tipo => (
                        <button key={tipo.key} onClick={() => setTipoFiltro(tipo.key)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                                ${tipoFiltro === tipo.key ? 'bg-green-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                            <tipo.icon size={14} />{tipo.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {loading ? <div className="p-12 text-center text-sm text-gray-400">Cargando inventario...</div>
                    : filtrados.length === 0 ? <div className="p-12 text-center text-sm text-gray-400">No se encontraron registros</div>
                        : (
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50">
                                        {[
                                            { key: 'nombre',     label: 'Nombre',      align: 'left'   },
                                            { key: 'codigo',     label: 'Código',      align: 'left'   },
                                            { key: 'tipo',       label: 'Tipo',        align: 'left'   },
                                            { key: 'stock',      label: 'Stock',       align: 'right'  },
                                            { key: 'minimo',     label: 'Mínimo',      align: 'right'  },
                                            { key: 'precio',     label: 'Valor unit.', align: 'right'  },
                                            { key: 'valorTotal', label: 'Valor total', align: 'right'  },
                                        ].map(col => (
                                            <th key={col.key} onClick={() => handleSort(col.key)}
                                                className={`text-${col.align} text-xs font-medium text-gray-500 px-4 py-3 cursor-pointer select-none hover:text-gray-800 whitespace-nowrap`}>
                                                {col.label}{' '}
                                                <span className={sortCol === col.key ? 'text-green-600' : 'text-gray-300'}>
                                                    {sortCol === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                                                </span>
                                            </th>
                                        ))}
                                        <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginados.map(p => (
                                        <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${p.stock_actual <= p.stock_minimo ? 'bg-amber-50/40' : ''}`}>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    {p.stock_actual <= p.stock_minimo && <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />}
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800">{p.nombre}</p>
                                                        {p.descripcion && <p className="text-xs text-gray-400 truncate max-w-xs">{p.descripcion}</p>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3"><span className="text-xs font-mono text-gray-500">{p.codigo}</span></td>
                                            <td className="px-4 py-3"><span className="text-xs text-gray-600">{p.tipo}</span></td>
                                            <td className="px-4 py-3 text-right">
                                                <span className={`text-sm font-semibold ${p.stock_actual === 0 ? 'text-red-600' : p.stock_actual <= p.stock_minimo ? 'text-amber-600' : 'text-gray-800'}`}>
                                                    {p.stock_actual.toLocaleString()}
                                                </span>
                                                <span className="text-xs text-gray-400 ml-1">{p.unidad_medida}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right"><span className="text-xs text-gray-400">{p.stock_minimo}</span></td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-sm text-gray-700">{p.precio != null ? `$${Number(p.precio).toFixed(2)}` : '—'}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <span className="text-sm font-medium text-gray-800">
                                                    {p.precio != null ? `$${(Number(p.precio) * (p.stock_actual || 0)).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center"><BadgeStock stock={p.stock_actual} minimo={p.stock_minimo} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
            </div>

            {filtrados.length > 0 && (
                <div className="flex items-center justify-between gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                        <span>Filas por página:</span>
                        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPagina(0) }}
                            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <span className="text-gray-500">
                        {pagina * pageSize + 1}–{Math.min((pagina + 1) * pageSize, filtrados.length)} de {filtrados.length}
                    </span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
                            className="px-3 py-1 rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors">←</button>
                        <span className="px-3">Pág. {pagina + 1} / {totalPaginas}</span>
                        <button onClick={() => setPagina(p => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1}
                            className="px-3 py-1 rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors">→</button>
                    </div>
                </div>
            )}

            {criticos > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                    <AlertTriangle size={16} />
                    <span>{criticos} registro(s) con stock por debajo del mínimo requieren atención</span>
                </div>
            )}
        </>
    )
}

// ─── Vista: Por Almacén ───────────────────────────────────────
function VistaPorAlmacen() {
    const { perfil } = useAuth()
    const [almacenes, setAlmacenes] = useState([])
    const [almacenId, setAlmacenId] = useState('')
    const [ubicaciones, setUbicaciones] = useState([])
    const [stock, setStock] = useState([])
    const [loading, setLoading] = useState(false)
    const [busqueda, setBusqueda] = useState('')
    const [tipoFiltro, setTipoFiltro] = useState('todos')
    const [pagina, setPagina] = useState(0)
    const [pageSize, setPageSize] = useState(50)

    // Modal ajuste (editar cantidad existente)
    const [modalAjuste, setModalAjuste] = useState(null)
    const [cantAjuste, setCantAjuste] = useState('')
    const [ubicAjuste, setUbicAjuste] = useState('')
    const [notaAjuste, setNotaAjuste] = useState('')
    const [guardandoAjuste, setGuardandoAjuste] = useState(false)
    const [errorAjuste, setErrorAjuste] = useState('')

    // Modal nuevo stock (agregar producto al almacén)
    const [modalNuevoStock, setModalNuevoStock] = useState(false)
    const [todosInsumos, setTodosInsumos] = useState([])
    const [busqNuevo, setBusqNuevo] = useState('')
    const [itemNuevo, setItemNuevo] = useState(null)
    const [cantNuevo, setCantNuevo] = useState('')
    const [ubicNuevo, setUbicNuevo] = useState('')
    const [notaNuevo, setNotaNuevo] = useState('')
    const [guardandoNuevo, setGuardandoNuevo] = useState(false)
    const [errorNuevo, setErrorNuevo] = useState('')

    // Modal transferencia
    const [modalTransf, setModalTransf] = useState(null)
    const [almacenDestino, setAlmacenDestino] = useState('')
    const [ubicDestino, setUbicDestino] = useState('')
    const [ubicacionesDestino, setUbicacionesDestino] = useState([])
    const [cantTransf, setCantTransf] = useState('')
    const [guardandoTransf, setGuardandoTransf] = useState(false)
    const [errorTransf, setErrorTransf] = useState('')

    useEffect(() => {
        supabase.from('almacenes').select('*')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true)
            .order('es_default', { ascending: false }).order('nombre')
            .then(({ data }) => {
                if (data) {
                    setAlmacenes(data)
                    const def = data.find(a => a.es_default) || data[0]
                    if (def) setAlmacenId(def.id)
                }
            })
    }, [])

    useEffect(() => {
        if (!almacenId) return
        cargarUbicaciones(almacenId)
        cargarStock(almacenId)
    }, [almacenId])

    useEffect(() => { setPagina(0) }, [busqueda, tipoFiltro, pageSize, almacenId])

    async function cargarUbicaciones(aid) {
        const { data } = await supabase.from('almacen_ubicaciones')
            .select('*').eq('almacen_id', aid).eq('activo', true).order('nombre')
        setUbicaciones(data || [])
    }

    async function cargarStock(aid) {
        setLoading(true)
        const { data } = await supabase.from('stock_ubicacion')
            .select('*, almacen_ubicaciones(nombre)')
            .eq('almacen_id', aid)
            .eq('empresa_id', perfil.empresa_id)
            .gt('cantidad', 0)
            .order('tipo_item').order('item_id')
            .limit(5000)
        if (data) setStock(data)
        setLoading(false)
    }

    // Recalcula stock_actual en la tabla del producto sumando todos sus registros en stock_ubicacion
    async function sincronizarStockActual(tipoItem, itemId) {
        const { data } = await supabase.from('stock_ubicacion')
            .select('cantidad')
            .eq('tipo_item', tipoItem)
            .eq('item_id', itemId)
            .eq('empresa_id', perfil.empresa_id)
        const total = (data || []).reduce((s, r) => s + Number(r.cantidad), 0)

        const tablaMap = {
            producto_terminado: 'productos_terminados',
            materia_prima: 'materias_primas',
            material_empaque: 'materiales_empaque',
            consumible: 'consumibles',
        }
        const tabla = tablaMap[tipoItem]
        if (tabla) {
            await supabase.from(tabla).update({ stock_actual: total }).eq('id', itemId)
        }
    }

    async function abrirNuevoStock() {
        // Cargar todos los productos/insumos disponibles
        const [pt, mp, me, con] = await Promise.all([
            supabase.from('productos_terminados').select('id, nombre, sku').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('materias_primas').select('id, nombre, codigo').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('materiales_empaque').select('id, nombre, codigo').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('consumibles').select('id, nombre, codigo').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
        ])
        const todos = [
            ...(pt.data || []).map(i => ({ ...i, tipo_item: 'producto_terminado', codigo: i.sku, label: `[PT] ${i.nombre}` })),
            ...(mp.data || []).map(i => ({ ...i, tipo_item: 'materia_prima', label: `[MP] ${i.nombre}` })),
            ...(me.data || []).map(i => ({ ...i, tipo_item: 'material_empaque', label: `[ME] ${i.nombre}` })),
            ...(con.data || []).map(i => ({ ...i, tipo_item: 'consumible', label: `[CON] ${i.nombre}` })),
        ]
        setTodosInsumos(todos)
        setItemNuevo(null); setBusqNuevo(''); setCantNuevo(''); setUbicNuevo(''); setNotaNuevo(''); setErrorNuevo('')
        setModalNuevoStock(true)
    }

    async function confirmarNuevoStock() {
        if (!itemNuevo) { setErrorNuevo('Selecciona un producto'); return }
        if (!cantNuevo || Number(cantNuevo) <= 0) { setErrorNuevo('Ingresa una cantidad válida'); return }
        setGuardandoNuevo(true); setErrorNuevo('')
        const { data: { user } } = await supabase.auth.getUser()
        const cant = Number(cantNuevo)

        const { error } = await supabase.from('stock_ubicacion').upsert({
            almacen_id: almacenId,
            almacen_ubicacion_id: ubicNuevo || null,
            tipo_item: itemNuevo.tipo_item,
            item_id: itemNuevo.id,
            cantidad: cant,
            empresa_id: perfil.empresa_id,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'almacen_id,almacen_ubicacion_id,tipo_item,item_id' })

        if (error) { setErrorNuevo('Error: ' + error.message); setGuardandoNuevo(false); return }

        await supabase.from('movimientos_inventario').insert({
            tipo_movimiento: 'entrada',
            tipo_item: itemNuevo.tipo_item,
            item_id: itemNuevo.id,
            item_nombre: itemNuevo.nombre,
            item_codigo: itemNuevo.codigo || '',
            cantidad: cant,
            stock_anterior: 0,
            stock_actual: cant,
            origen: 'ajuste_manual',
            almacen_id: almacenId,
            almacen_ubicacion_id: ubicNuevo || null,
            notas: notaNuevo || 'Inventario inicial',
            usuario_id: user.id,
            empresa_id: perfil.empresa_id,
            fecha: new Date().toISOString(),
        })

        setGuardandoNuevo(false)
        setModalNuevoStock(false)
        await sincronizarStockActual(itemNuevo.tipo_item, itemNuevo.id)
        cargarStock(almacenId)
    }

    // Enriquecer stock con nombres de productos
    const [nombresMap, setNombresMap] = useState({})
    useEffect(() => {
        if (stock.length === 0) return
        async function cargarNombres() {
            const [pt, mp, me, con] = await Promise.all([
                supabase.from('productos_terminados').select('id, nombre, sku').eq('empresa_id', perfil.empresa_id),
                supabase.from('materias_primas').select('id, nombre, codigo').eq('empresa_id', perfil.empresa_id),
                supabase.from('materiales_empaque').select('id, nombre, codigo').eq('empresa_id', perfil.empresa_id),
                supabase.from('consumibles').select('id, nombre, codigo').eq('empresa_id', perfil.empresa_id),
            ])
            const mapa = {}
            ;[...(pt.data || []), ...(mp.data || []), ...(me.data || []), ...(con.data || [])].forEach(i => {
                mapa[i.id] = { nombre: i.nombre, codigo: i.sku || i.codigo }
            })
            setNombresMap(mapa)
        }
        cargarNombres()
    }, [stock])

    const stockEnriquecido = stock.map(s => ({
        ...s,
        nombre: nombresMap[s.item_id]?.nombre || '...',
        codigo: nombresMap[s.item_id]?.codigo || '',
        ubicacion_nombre: s.almacen_ubicaciones?.nombre || '—',
    }))

    const filtrados = stockEnriquecido.filter(s => {
        const matchTipo = tipoFiltro === 'todos' || (
            (tipoFiltro === 'pt' && s.tipo_item === 'producto_terminado') ||
            (tipoFiltro === 'mp' && s.tipo_item === 'materia_prima') ||
            (tipoFiltro === 'emp' && s.tipo_item === 'material_empaque') ||
            (tipoFiltro === 'con' && s.tipo_item === 'consumible')
        )
        const matchBusq = s.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            s.codigo?.toLowerCase().includes(busqueda.toLowerCase())
        return matchTipo && matchBusq
    })

    const totalUnidades = filtrados.reduce((s, i) => s + Number(i.cantidad), 0)
    const totalPaginasAlm = Math.ceil(filtrados.length / pageSize)
    const paginados = filtrados.slice(pagina * pageSize, (pagina + 1) * pageSize)

    // ── Ajuste manual ──
    async function confirmarAjuste() {
        if (cantAjuste === '' || cantAjuste === null || cantAjuste === undefined) { setErrorAjuste('Ingresa una cantidad'); return }
        if (Number(cantAjuste) < 0) { setErrorAjuste('La cantidad no puede ser negativa'); return }
        setGuardandoAjuste(true); setErrorAjuste('')
        const { data: { user } } = await supabase.auth.getUser()

        // UPDATE directo por id — evita el problema del upsert con NULL
        const { error } = await supabase.from('stock_ubicacion')
            .update({ cantidad: Number(cantAjuste), updated_at: new Date().toISOString() })
            .eq('id', modalAjuste.id)

        if (error) { setErrorAjuste('Error: ' + error.message); setGuardandoAjuste(false); return }

        // Registrar movimiento
        await supabase.from('movimientos_inventario').insert({
            tipo_movimiento: 'ajuste',
            tipo_item: modalAjuste.tipo_item,
            item_id: modalAjuste.item_id,
            item_nombre: modalAjuste.nombre,
            item_codigo: modalAjuste.codigo,
            cantidad: Number(cantAjuste),
            stock_anterior: Number(modalAjuste.cantidad),
            stock_actual: Number(cantAjuste),
            origen: 'ajuste_manual',
            almacen_id: almacenId,
            almacen_ubicacion_id: modalAjuste.almacen_ubicacion_id || null,
            notas: notaAjuste || null,
            usuario_id: user.id,
            empresa_id: perfil.empresa_id,
            fecha: new Date().toISOString(),
        })

        setGuardandoAjuste(false)
        setModalAjuste(null)
        await sincronizarStockActual(modalAjuste.tipo_item, modalAjuste.item_id)
        cargarStock(almacenId)
    }

    // ── Transferencia ──
    useEffect(() => {
        if (!almacenDestino) return
        supabase.from('almacen_ubicaciones')
            .select('*').eq('almacen_id', almacenDestino).eq('activo', true).order('nombre')
            .then(({ data }) => setUbicacionesDestino(data || []))
    }, [almacenDestino])

    async function confirmarTransferencia() {
        if (!almacenDestino) { setErrorTransf('Selecciona el almacén destino'); return }
        if (!cantTransf || Number(cantTransf) <= 0) { setErrorTransf('Ingresa una cantidad válida'); return }
        const cant = Number(cantTransf)
        if (cant > Number(modalTransf.cantidad)) { setErrorTransf('No hay suficiente stock en este almacén'); return }
        setGuardandoTransf(true); setErrorTransf('')
        const { data: { user } } = await supabase.auth.getUser()

        // ── 1. Descontar origen — UPDATE directo por id ──
        const nuevaCantOrigen = Number(modalTransf.cantidad) - cant
        const { error: errOrigen } = await supabase.from('stock_ubicacion')
            .update({ cantidad: nuevaCantOrigen, updated_at: new Date().toISOString() })
            .eq('id', modalTransf.id)

        if (errOrigen) { setErrorTransf('Error al descontar origen: ' + errOrigen.message); setGuardandoTransf(false); return }

        // ── 2. Buscar si ya existe registro en destino ──
        let qDestino = supabase.from('stock_ubicacion')
            .select('id, cantidad')
            .eq('almacen_id', almacenDestino)
            .eq('tipo_item', modalTransf.tipo_item)
            .eq('item_id', modalTransf.item_id)
            .eq('empresa_id', perfil.empresa_id)

        // Filtrar por ubicacion_id correctamente (null vs valor)
        if (ubicDestino) {
            qDestino = qDestino.eq('almacen_ubicacion_id', ubicDestino)
        } else {
            qDestino = qDestino.is('almacen_ubicacion_id', null)
        }

        const { data: registroDestino } = await qDestino.maybeSingle()

        let errDestino
        if (registroDestino) {
            // Ya existe — sumar
            const { error } = await supabase.from('stock_ubicacion')
                .update({ cantidad: Number(registroDestino.cantidad) + cant, updated_at: new Date().toISOString() })
                .eq('id', registroDestino.id)
            errDestino = error
        } else {
            // No existe — insertar
            const { error } = await supabase.from('stock_ubicacion').insert({
                almacen_id: almacenDestino,
                almacen_ubicacion_id: ubicDestino || null,
                tipo_item: modalTransf.tipo_item,
                item_id: modalTransf.item_id,
                cantidad: cant,
                empresa_id: perfil.empresa_id,
                updated_at: new Date().toISOString(),
            })
            errDestino = error
        }

        if (errDestino) { setErrorTransf('Error al sumar destino: ' + errDestino.message); setGuardandoTransf(false); return }

        const cantDestinoFinal = registroDestino ? Number(registroDestino.cantidad) + cant : cant
        const nombreOrigen = almacenes.find(a => a.id === almacenId)?.nombre || ''
        const nombreDestino = almacenes.find(a => a.id === almacenDestino)?.nombre || ''

        // ── 3. Registrar movimientos ──
        await supabase.from('movimientos_inventario').insert([
            {
                tipo_movimiento: 'salida', tipo_item: modalTransf.tipo_item,
                item_id: modalTransf.item_id, item_nombre: modalTransf.nombre, item_codigo: modalTransf.codigo,
                cantidad: cant,
                stock_anterior: Number(modalTransf.cantidad),
                stock_actual: nuevaCantOrigen,
                origen: 'transferencia',
                almacen_id: almacenId, almacen_ubicacion_id: modalTransf.almacen_ubicacion_id || null,
                notas: `Transferido a ${nombreDestino}`,
                usuario_id: user.id, empresa_id: perfil.empresa_id, fecha: new Date().toISOString()
            },
            {
                tipo_movimiento: 'entrada', tipo_item: modalTransf.tipo_item,
                item_id: modalTransf.item_id, item_nombre: modalTransf.nombre, item_codigo: modalTransf.codigo,
                cantidad: cant,
                stock_anterior: registroDestino ? Number(registroDestino.cantidad) : 0,
                stock_actual: cantDestinoFinal,
                origen: 'transferencia',
                almacen_id: almacenDestino, almacen_ubicacion_id: ubicDestino || null,
                notas: `Recibido desde ${nombreOrigen}`,
                usuario_id: user.id, empresa_id: perfil.empresa_id, fecha: new Date().toISOString()
            },
        ])

        setGuardandoTransf(false)
        setModalTransf(null)
        await sincronizarStockActual(modalTransf.tipo_item, modalTransf.item_id)
        cargarStock(almacenId)
    }

    const inputCls = "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"

    return (
        <>
            {/* Selector de almacén */}
            <div className="flex gap-3 flex-wrap items-center">
                <div className="flex gap-2 flex-wrap">
                    {almacenes.map(a => (
                        <button key={a.id} onClick={() => setAlmacenId(a.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors
                                ${almacenId === a.id ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                            <Warehouse size={14} /> {a.nombre}
                            {a.es_default && <span className="text-xs opacity-70">(principal)</span>}
                        </button>
                    ))}
                </div>
                {almacenes.length === 0 && (
                    <p className="text-sm text-gray-400">No hay almacenes — créalos en Administración → Almacenes</p>
                )}
            </div>

            {almacenId && (
                <>
                    {/* KPIs */}
                    <div className="flex items-start justify-between gap-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 flex-1">
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                                <p className="text-xs text-gray-500">Productos en almacén</p>
                                <p className="text-2xl font-semibold text-gray-800 mt-1">{filtrados.length}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                                <p className="text-xs text-gray-500">Total unidades</p>
                                <p className="text-2xl font-semibold text-gray-800 mt-1">{totalUnidades.toLocaleString()}</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 p-4">
                                <p className="text-xs text-gray-500">Ubicaciones activas</p>
                                <p className="text-2xl font-semibold text-gray-800 mt-1">{ubicaciones.length || '—'}</p>
                            </div>
                        </div>
                        <button onClick={abrirNuevoStock}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap" style={{ marginTop: '0' }}>
                            <Plus size={15} /> Agregar stock
                        </button>
                    </div>

                    {/* Filtros */}
                    <div className="flex gap-3 flex-wrap">
                        <div className="relative flex-1 min-w-48">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input type="text" placeholder="Buscar producto..."
                                value={busqueda} onChange={e => setBusqueda(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {TIPOS_INVENTARIO.map(tipo => (
                                <button key={tipo.key} onClick={() => setTipoFiltro(tipo.key)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                                        ${tipoFiltro === tipo.key ? 'bg-green-600 text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                                    <tipo.icon size={14} />{tipo.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Tabla */}
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        {loading ? (
                            <div className="p-12 text-center text-sm text-gray-400">Cargando...</div>
                        ) : filtrados.length === 0 ? (
                            <div className="p-12 text-center">
                                <p className="text-sm text-gray-400 mb-4">
                                    {stock.length === 0
                                        ? 'Este almacén no tiene stock registrado aún.'
                                        : 'No hay coincidencias con el filtro'}
                                </p>
                                {stock.length === 0 && (
                                    <button onClick={abrirNuevoStock}
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors">
                                        <Plus size={15} /> Agregar primer producto
                                    </button>
                                )}
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-gray-100 bg-gray-50">
                                        {['Producto', 'Código', 'Tipo', 'Ubicación', 'Cantidad', ''].map(h => (
                                            <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginados.map(s => (
                                        <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 text-sm font-medium text-gray-800">{s.nombre}</td>
                                            <td className="px-4 py-3 text-xs font-mono text-gray-500">{s.codigo}</td>
                                            <td className="px-4 py-3">
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                                    {TIPO_LABEL[s.tipo_item] || s.tipo_item}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500">{s.ubicacion_nombre}</td>
                                            <td className="px-4 py-3 text-sm font-semibold text-gray-800">
                                                {Number(s.cantidad).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex gap-2">
                                                    <button onClick={() => {
                                                        setModalAjuste(s); setCantAjuste(String(s.cantidad))
                                                        setUbicAjuste(s.almacen_ubicacion_id || ''); setNotaAjuste('')
                                                        setErrorAjuste('')
                                                    }}
                                                        className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer">
                                                        <Plus size={11} /> Ajuste
                                                    </button>
                                                    <button onClick={() => {
                                                        setModalTransf(s); setAlmacenDestino(''); setUbicDestino('')
                                                        setCantTransf(''); setErrorTransf('')
                                                    }}
                                                        className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 cursor-pointer">
                                                        <ArrowLeftRight size={11} /> Transferir
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {filtrados.length > 0 && (
                        <div className="flex items-center justify-between gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                                <span>Filas por página:</span>
                                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPagina(0) }}
                                    className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                                    {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                            </div>
                            <span className="text-gray-500">
                                {pagina * pageSize + 1}–{Math.min((pagina + 1) * pageSize, filtrados.length)} de {filtrados.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
                                    className="px-3 py-1 rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors">←</button>
                                <span className="px-3">Pág. {pagina + 1} / {totalPaginasAlm}</span>
                                <button onClick={() => setPagina(p => Math.min(totalPaginasAlm - 1, p + 1))} disabled={pagina >= totalPaginasAlm - 1}
                                    className="px-3 py-1 rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors">→</button>
                            </div>
                        </div>
                    )}

                    {/* Botón para agregar stock nuevo */}
                    {stock.length > 0 && (
                        <div className="text-sm text-gray-500 text-center">
                            ¿Falta un producto? Usa <strong>Ajuste</strong> en cualquier fila para corregir cantidades, o agrega stock recibiendo mercancía en el módulo de Compras.
                        </div>
                    )}
                </>
            )}

            {/* Modal Ajuste */}
            {modalAjuste && (
                <>
                    <div onClick={() => setModalAjuste(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '400px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>Ajuste de inventario</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>{modalAjuste.nombre}</p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {ubicaciones.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Ubicación</label>
                                    <select value={ubicAjuste} onChange={e => setUbicAjuste(e.target.value)} className={inputCls}>
                                        <option value="">— Sin ubicación específica —</option>
                                        {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Nueva cantidad total</label>
                                <input type="number" min="0" value={cantAjuste} onChange={e => setCantAjuste(e.target.value)}
                                    className={inputCls} autoFocus />
                                <p style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>
                                    Cantidad actual: {Number(modalAjuste.cantidad).toLocaleString()}
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Nota <span className="font-normal text-gray-400">(opcional)</span></label>
                                <input value={notaAjuste} onChange={e => setNotaAjuste(e.target.value)}
                                    placeholder="Ej: Conteo físico mensual" className={inputCls} />
                            </div>
                        </div>

                        {errorAjuste && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{errorAjuste}</div>}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={confirmarAjuste} disabled={guardandoAjuste}
                                style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoAjuste ? 0.6 : 1 }}>
                                {guardandoAjuste ? 'Guardando...' : 'Confirmar ajuste'}
                            </button>
                            <button onClick={() => setModalAjuste(null)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Modal Transferencia */}
            {modalTransf && (
                <>
                    <div onClick={() => setModalTransf(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '420px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>Transferir entre almacenes</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>{modalTransf.nombre} · Disponible: <strong>{Number(modalTransf.cantidad).toLocaleString()}</strong></p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Almacén destino *</label>
                                <select value={almacenDestino} onChange={e => setAlmacenDestino(e.target.value)} className={inputCls}>
                                    <option value="">Seleccionar...</option>
                                    {almacenes.filter(a => a.id !== almacenId).map(a => (
                                        <option key={a.id} value={a.id}>{a.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            {almacenDestino && ubicacionesDestino.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Ubicación en destino <span className="font-normal text-gray-400">(opcional)</span></label>
                                    <select value={ubicDestino} onChange={e => setUbicDestino(e.target.value)} className={inputCls}>
                                        <option value="">— Sin ubicación específica —</option>
                                        {ubicacionesDestino.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                    </select>
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Cantidad a transferir *</label>
                                <input type="number" min="1" max={modalTransf.cantidad} value={cantTransf}
                                    onChange={e => setCantTransf(e.target.value)} className={inputCls} autoFocus />
                            </div>
                        </div>

                        {errorTransf && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{errorTransf}</div>}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={confirmarTransferencia} disabled={guardandoTransf}
                                style={{ flex: 2, backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoTransf ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                <ArrowLeftRight size={16} /> {guardandoTransf ? 'Transfiriendo...' : 'Confirmar transferencia'}
                            </button>
                            <button onClick={() => setModalTransf(null)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Modal Nuevo Stock */}
            {modalNuevoStock && (
                <>
                    <div onClick={() => setModalNuevoStock(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '460px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>Agregar stock al almacén</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
                            {almacenes.find(a => a.id === almacenId)?.nombre}
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* Buscador de producto */}
                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Producto *</label>
                                {itemNuevo ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 12px' }}>
                                        <div>
                                            <p style={{ fontSize: '14px', fontWeight: 600, color: '#166534', margin: 0 }}>{itemNuevo.nombre}</p>
                                            <p style={{ fontSize: '11px', color: '#16a34a', margin: '2px 0 0', fontFamily: 'monospace' }}>{itemNuevo.label.split(']')[0]}] · {itemNuevo.codigo}</p>
                                        </div>
                                        <button onClick={() => { setItemNuevo(null); setBusqNuevo('') }}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: '12px' }}>
                                            Cambiar
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <div style={{ position: 'relative' }}>
                                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                            <input type="text" placeholder="Buscar por nombre o código..."
                                                value={busqNuevo} onChange={e => setBusqNuevo(e.target.value)}
                                                style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }}
                                                autoFocus />
                                        </div>
                                        {busqNuevo && (
                                            <div style={{ marginTop: '4px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                                                {todosInsumos.filter(i =>
                                                    i.nombre.toLowerCase().includes(busqNuevo.toLowerCase()) ||
                                                    i.codigo?.toLowerCase().includes(busqNuevo.toLowerCase())
                                                ).slice(0, 10).map(i => (
                                                    <div key={`${i.tipo_item}-${i.id}`} onClick={() => { setItemNuevo(i); setBusqNuevo('') }}
                                                        style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}
                                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                        <span style={{ fontWeight: 500, color: '#1f2937' }}>{i.nombre}</span>
                                                        <span style={{ marginLeft: '8px', fontSize: '11px', color: '#9ca3af' }}>{i.label.split(']')[0]}]</span>
                                                        {i.codigo && <span style={{ marginLeft: '6px', fontSize: '11px', fontFamily: 'monospace', color: '#9ca3af' }}>{i.codigo}</span>}
                                                    </div>
                                                ))}
                                                {todosInsumos.filter(i =>
                                                    i.nombre.toLowerCase().includes(busqNuevo.toLowerCase()) ||
                                                    i.codigo?.toLowerCase().includes(busqNuevo.toLowerCase())
                                                ).length === 0 && (
                                                    <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>Sin resultados</div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {ubicaciones.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Ubicación <span className="font-normal text-gray-400">(opcional)</span></label>
                                    <select value={ubicNuevo} onChange={e => setUbicNuevo(e.target.value)} className={inputCls}>
                                        <option value="">— Sin ubicación específica —</option>
                                        {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Cantidad *</label>
                                <input type="number" min="1" value={cantNuevo} onChange={e => setCantNuevo(e.target.value)}
                                    className={inputCls} placeholder="0" />
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1.5">Nota <span className="font-normal text-gray-400">(opcional)</span></label>
                                <input value={notaNuevo} onChange={e => setNotaNuevo(e.target.value)}
                                    placeholder="Ej: Inventario inicial, conteo físico..." className={inputCls} />
                            </div>
                        </div>

                        {errorNuevo && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{errorNuevo}</div>}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={confirmarNuevoStock} disabled={guardandoNuevo}
                                style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoNuevo ? 0.6 : 1 }}>
                                {guardandoNuevo ? 'Guardando...' : 'Agregar stock'}
                            </button>
                            <button onClick={() => setModalNuevoStock(false)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </>
            )}
        </>
    )
}
function VistaMovimientos() {
    const { perfil } = useAuth()
    const [movimientos, setMovimientos] = useState([])
    const [loading, setLoading] = useState(true)
    const [tipoFiltro, setTipoFiltro] = useState('todos')
    const [busqueda, setBusqueda] = useState('')
    const [fechaDesde, setFechaDesde] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]
    })
    const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0])
    const [pagina, setPagina] = useState(0)
    const [pageSize, setPageSize] = useState(50)
    const [totalMov, setTotalMov] = useState(0)

    useEffect(() => { setPagina(0) }, [tipoFiltro, busqueda, fechaDesde, fechaHasta, pageSize])
    useEffect(() => { cargarMovimientos() }, [tipoFiltro, busqueda, fechaDesde, fechaHasta, pagina, pageSize])

    async function cargarMovimientos() {
        setLoading(true)
        let query = supabase
            .from('movimientos_inventario')
            .select('*, almacenes(nombre)', { count: 'exact' })
            .eq('empresa_id', perfil.empresa_id)
            .gte('fecha', `${fechaDesde}T00:00:00`)
            .lte('fecha', `${fechaHasta}T23:59:59`)
            .order('fecha', { ascending: false })
            .range(pagina * pageSize, (pagina + 1) * pageSize - 1)

        if (tipoFiltro !== 'todos') {
            const mapa = { pt: 'producto_terminado', mp: 'materia_prima', emp: 'material_empaque', con: 'consumible' }
            query = query.eq('tipo_item', mapa[tipoFiltro])
        }
        if (busqueda) query = query.or(`item_nombre.ilike.%${busqueda}%,item_codigo.ilike.%${busqueda}%`)

        const { data, count } = await query
        if (data) setMovimientos(data)
        if (count !== null) setTotalMov(count)
        setLoading(false)
    }

    return (
        <>
            <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    <Filter size={14} /> Filtros de consulta
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input type="text" placeholder="Buscar código o nombre..."
                            value={busqueda} onChange={e => setBusqueda(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white">
                        <option value="todos">Todos los tipos</option>
                        <option value="pt">Productos Terminados</option>
                        <option value="mp">Materias Primas</option>
                        <option value="emp">Materiales de Empaque</option>
                        <option value="con">Consumibles</option>
                    </select>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Desde</label>
                        <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Hasta</label>
                        <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-sm text-gray-400">Cargando movimientos...</div>
                ) : movimientos.length === 0 ? (
                    <div className="p-12 text-center text-sm text-gray-400">No hay movimientos en este rango</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                                {['Fecha', 'Tipo', 'Código', 'Producto', 'Movimiento', 'Cantidad', 'Stock Result.', 'Almacén', 'Origen'].map(h => (
                                    <th key={h} className="text-left text-xs font-medium text-gray-500 px-4 py-3">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {movimientos.map(m => (
                                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                                        {new Date(m.fecha).toLocaleDateString('es-VE')}
                                        <span className="text-xs text-gray-400 ml-1">{new Date(m.fecha).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                                            ${m.tipo_item === 'producto_terminado' ? 'bg-blue-50 text-blue-700' :
                                                m.tipo_item === 'materia_prima' ? 'bg-purple-50 text-purple-700' :
                                                m.tipo_item === 'consumible' ? 'bg-gray-50 text-gray-600' : 'bg-orange-50 text-orange-700'}`}>
                                            {TIPO_LABEL[m.tipo_item] || m.tipo_item}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{m.item_codigo}</td>
                                    <td className="px-4 py-3 text-sm font-medium text-gray-800">{m.item_nombre}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                            {m.tipo_movimiento === 'entrada' ? <ArrowDownLeft size={14} className="text-green-600" />
                                                : m.tipo_movimiento === 'salida' ? <ArrowUpRight size={14} className="text-red-600" />
                                                : <Filter size={14} className="text-amber-600" />}
                                            <span className={`text-xs font-medium ${m.tipo_movimiento === 'entrada' ? 'text-green-700' : m.tipo_movimiento === 'salida' ? 'text-red-700' : 'text-amber-700'}`}>
                                                {m.tipo_movimiento}
                                            </span>
                                        </div>
                                    </td>
                                    <td className={`px-4 py-3 text-sm font-semibold ${m.tipo_movimiento === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
                                        {m.tipo_movimiento === 'entrada' ? '+' : '−'}{Number(m.cantidad).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-700">{Number(m.stock_actual).toLocaleString()}</td>
                                    <td className="px-4 py-3 text-xs text-gray-500">{m.almacenes?.nombre || '—'}</td>
                                    <td className="px-4 py-3 text-xs text-gray-500 capitalize">{m.origen?.replace('_', ' ')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {totalMov > 0 && (
                <div className="flex items-center justify-between gap-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                        <span>Filas por página:</span>
                        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPagina(0) }}
                            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <span className="text-gray-500">
                        {pagina * pageSize + 1}–{Math.min((pagina + 1) * pageSize, totalMov)} de {totalMov}
                    </span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
                            className="px-3 py-1 rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors">←</button>
                        <span className="px-3">Pág. {pagina + 1} / {Math.ceil(totalMov / pageSize)}</span>
                        <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * pageSize >= totalMov}
                            className="px-3 py-1 rounded-md border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors">→</button>
                    </div>
                </div>
            )}
        </>
    )
}
