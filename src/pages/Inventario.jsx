import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Package, AlertTriangle, Search, Layers, Beaker, Truck } from 'lucide-react'

const TIPOS_INVENTARIO = [
    { key: 'todos', label: 'Todo el inventario', icon: Layers },
    { key: 'pt', label: 'Productos Terminados', icon: Package },
    { key: 'mp', label: 'Materias Primas', icon: Beaker },
    { key: 'emp', label: 'Materiales de Empaque', icon: Truck },
]

function BadgeStock({ stock, minimo }) {
    if (stock === 0)
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Sin stock</span>
    if (stock <= minimo)
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Stock bajo</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
}

export default function Inventario() {
    const [inventario, setInventario] = useState([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [tipoFiltro, setTipoFiltro] = useState('todos')

    useEffect(() => {
        cargarInventario()
    }, [tipoFiltro])

    async function cargarInventario() {
        setLoading(true)
        let datos = []

        if (tipoFiltro === 'todos' || tipoFiltro === 'pt') {
            const { data } = await supabase.from('productos_terminados').select('*').eq('activo', true)
            if (data) datos = [...datos, ...data.map(p => ({ ...p, tipo: 'Producto Terminado', codigo: p.sku, precio: p.precio_venta, vencimiento: null }))]
        }
        if (tipoFiltro === 'todos' || tipoFiltro === 'mp') {
            const { data } = await supabase.from('materias_primas').select('*').eq('activo', true)
            if (data) datos = [...datos, ...data.map(p => ({ ...p, tipo: 'Materia Prima', codigo: p.codigo, precio: p.costo_compra_promedio, vencimiento: p.fecha_vencimiento }))]
        }
        if (tipoFiltro === 'todos' || tipoFiltro === 'emp') {
            const { data } = await supabase.from('materiales_empaque').select('*').eq('activo', true)
            if (data) datos = [...datos, ...data.map(p => ({ ...p, tipo: 'Material Empaque', codigo: p.codigo, precio: p.costo_compra_promedio, vencimiento: p.fecha_vencimiento }))]
        }

        setInventario(datos.sort((a, b) => a.nombre.localeCompare(b.nombre)))
        setLoading(false)
    }

    const filtrados = inventario.filter(p => {
        const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            p.codigo?.toLowerCase().includes(busqueda.toLowerCase())
        return coincideBusqueda
    })

    const criticos = filtrados.filter(p => p.stock_actual <= p.stock_minimo).length
    const sinStock = filtrados.filter(p => p.stock_actual === 0).length
    const totalUnidades = filtrados.reduce((sum, p) => sum + (p.stock_actual || 0), 0)

    return (
        <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Inventario</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Gestión unificada de stock</p>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">Total registros</p>
                    <p className="text-2xl font-semibold text-gray-800 mt-1">{filtrados.length}</p>
                </div>
                <div className={`bg-white rounded-xl border p-4 ${criticos > 0 ? 'border-amber-200' : 'border-gray-200'}`}>
                    <p className="text-xs text-gray-500">Stock crítico</p>
                    <p className={`text-2xl font-semibold mt-1 ${criticos > 0 ? 'text-amber-600' : 'text-gray-800'}`}>
                        {criticos}
                    </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">Total unidades</p>
                    <p className="text-2xl font-semibold text-gray-800 mt-1">{totalUnidades.toLocaleString()}</p>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-48">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre o código..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {TIPOS_INVENTARIO.map(tipo => (
                        <button
                            key={tipo.key}
                            onClick={() => setTipoFiltro(tipo.key)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors
                ${tipoFiltro === tipo.key
                                    ? 'bg-green-600 text-white'
                                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                        >
                            <tipo.icon size={14} />
                            {tipo.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-sm text-gray-400">Cargando inventario...</div>
                ) : filtrados.length === 0 ? (
                    <div className="p-12 text-center text-sm text-gray-400">No se encontraron registros</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Nombre</th>
                                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Código</th>
                                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Tipo</th>
                                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Stock</th>
                                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Mínimo</th>
                                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Valor</th>
                                <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map((p, i) => (
                                <tr
                                    key={p.id}
                                    className={`border-b border-gray-50 hover:bg-gray-50 transition-colors
                    ${p.stock_actual <= p.stock_minimo ? 'bg-amber-50/40' : ''}`}
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {p.stock_actual <= p.stock_minimo && (
                                                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                                            )}
                                            <div>
                                                <p className="text-sm font-medium text-gray-800">{p.nombre}</p>
                                                {p.descripcion && (
                                                    <p className="text-xs text-gray-400 truncate max-w-xs">{p.descripcion}</p>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-mono text-gray-500">{p.codigo}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs text-gray-600">{p.tipo}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className={`text-sm font-semibold
                      ${p.stock_actual === 0 ? 'text-red-600' :
                                                p.stock_actual <= p.stock_minimo ? 'text-amber-600' : 'text-gray-800'}`}>
                                            {p.stock_actual.toLocaleString()}
                                        </span>
                                        <span className="text-xs text-gray-400 ml-1">{p.unidad_medida}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className="text-xs text-gray-400">{p.stock_minimo}</span>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <span className="text-sm text-gray-700">
                                            {p.precio != null ? `$${Number(p.precio).toFixed(2)}` : '—'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <BadgeStock stock={p.stock_actual} minimo={p.stock_minimo} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer con alertas */}
            {criticos > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
                    <AlertTriangle size={16} />
                    <span>{criticos} registro(s) con stock por debajo del mínimo requieren atención</span>
                </div>
            )}
        </div>
    )
}
