import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Package, AlertTriangle, Search, Filter } from 'lucide-react'

const CATEGORIAS = ['Todas', 'Bebidas', 'Alimentos', 'Helados', 'Aceites']

function BadgeStock({ stock, minimo }) {
    if (stock === 0)
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Sin stock</span>
    if (stock <= minimo)
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Stock bajo</span>
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>
}

export default function Inventario() {
    const [productos, setProductos] = useState([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [categoria, setCategoria] = useState('Todas')

    useEffect(() => {
        cargarProductos()
    }, [])

    async function cargarProductos() {
        setLoading(true)
        const { data, error } = await supabase
            .from('productos_terminados')
            .select('*')
            .eq('activo', true)
            .order('nombre')
        if (!error) setProductos(data)
        setLoading(false)
    }

    const filtrados = productos.filter(p => {
        const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            p.sku?.toLowerCase().includes(busqueda.toLowerCase())
        const coincideCategoria = categoria === 'Todas' || p.categoria_1 === categoria
        return coincideBusqueda && coincideCategoria
    })

    const criticos = productos.filter(p => p.stock_actual <= p.stock_minimo).length
    const sinStock = productos.filter(p => p.stock_actual === 0).length
    const totalUnidades = productos.reduce((sum, p) => sum + (p.stock_actual || 0), 0)

    return (
        <div className="p-6 space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-gray-800">Inventario</h1>
                    <p className="text-sm text-gray-500 mt-0.5">Productos terminados</p>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <p className="text-xs text-gray-500">Total productos</p>
                    <p className="text-2xl font-semibold text-gray-800 mt-1">{productos.length}</p>
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
                    {CATEGORIAS.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setCategoria(cat)}
                            className={`px-3 py-2 rounded-lg text-sm transition-colors
                ${categoria === cat
                                    ? 'bg-green-600 text-white'
                                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-sm text-gray-400">Cargando productos...</div>
                ) : filtrados.length === 0 ? (
                    <div className="p-12 text-center text-sm text-gray-400">No se encontraron productos</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Producto</th>
                                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Código</th>
                                <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Categoría</th>
                                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Stock actual</th>
                                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Mínimo</th>
                                <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Precio</th>
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
                                        <span className="text-xs font-mono text-gray-500">{p.sku}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs text-gray-600">{p.categoria_1}</span>
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
                                        <span className="text-sm text-gray-700">${p.precio_venta?.toFixed(2)}</span>
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
                    <span>{criticos} producto(s) con stock por debajo del mínimo requieren reposición</span>
                </div>
            )}
        </div>
    )
}