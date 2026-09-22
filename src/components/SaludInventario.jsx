// Salud del inventario.
//
// Contrasta lo que dice el catálogo (stock_actual) contra lo que hay repartido
// en almacenes (suma de stock_ubicacion). Deben ser iguales: es la invariante
// del sistema (CLAUDE.md §15). Cuando no lo son, el mismo producto muestra un
// número distinto según la pantalla en la que se mire, y nadie se entera.
//
// Lee la vista v_inventario_descuadre, creada en la fase 6 con
// security_invoker, así que cada empresa ve solo sus ítems.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { ShieldCheck } from 'lucide-react'

const TIPO_LABEL = {
    producto_terminado: 'PT', materia_prima: 'MP',
    material_empaque: 'ME', consumible: 'CON',
}

const TIPOS = [
    { key: 'todos', label: 'Todo' },
    { key: 'producto_terminado', label: 'Productos Terminados' },
    { key: 'materia_prima', label: 'Materias Primas' },
    { key: 'material_empaque', label: 'Materiales de Empaque' },
    { key: 'consumible', label: 'Consumibles' },
]

const fmt = n => Number(n || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })

export default function SaludInventario() {
    const { perfil } = useAuth()
    const [filas, setFilas] = useState([])
    const [loading, setLoading] = useState(true)
    const [tipo, setTipo] = useState('todos')

    useEffect(() => {
        if (!perfil?.empresa_id) return
        let cancel = false
        supabase.from('v_inventario_descuadre')
            .select('tipo_item, item_id, codigo, nombre, stock_catalogo, stock_almacenes, diferencia')
            .eq('empresa_id', perfil.empresa_id)
            .then(({ data }) => {
                if (cancel) return
                setFilas(data || [])
                setLoading(false)
            })
        return () => { cancel = true }
    }, [perfil?.empresa_id])

    if (loading) return <div className="text-center text-gray-400 text-sm py-16">Cargando...</div>

    if (filas.length === 0) return (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <ShieldCheck size={44} className="text-green-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-gray-800">El inventario cuadra</h3>
            <p className="text-sm text-gray-500 mt-1.5 max-w-lg mx-auto leading-relaxed">
                Para cada ítem, lo que dice el catálogo coincide con la suma de lo que hay
                en los almacenes. No hay nada que corregir.
            </p>
        </div>
    )

    const visibles = tipo === 'todos' ? filas : filas.filter(f => f.tipo_item === tipo)
    const ordenadas = [...visibles].sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
    const deMas = visibles.filter(f => f.diferencia > 0).reduce((s, f) => s + Number(f.diferencia), 0)
    const deMenos = visibles.filter(f => f.diferencia < 0).reduce((s, f) => s + Number(f.diferencia), 0)

    const kpis = [
        { label: 'Ítems descuadrados', valor: visibles.length, color: 'text-gray-800' },
        { label: 'Unidades de más en el catálogo', valor: fmt(deMas), color: 'text-amber-600' },
        { label: 'Unidades de menos en el catálogo', valor: fmt(Math.abs(deMenos)), color: 'text-red-600' },
    ]

    return (
        <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 leading-relaxed">
                <strong>{visibles.length} {visibles.length === 1 ? 'ítem no cuadra' : 'ítems no cuadran'}.</strong>{' '}
                El catálogo y los almacenes dicen cosas distintas del mismo producto, así que el
                número depende de la pantalla en la que estés. Estas diferencias vienen de
                movimientos viejos: se corrigen con un conteo físico y un ajuste por almacén,
                no se arreglan solas.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {kpis.map(k => (
                    <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
                        <p className="text-xs text-gray-400 uppercase tracking-wide">{k.label}</p>
                        <p className={'text-2xl font-semibold mt-1 ' + k.color}>{k.valor}</p>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap bg-gray-100 p-1 rounded-lg w-fit">
                {TIPOS.map(t => {
                    const n = t.key === 'todos' ? filas.length : filas.filter(f => f.tipo_item === t.key).length
                    if (n === 0 && t.key !== 'todos') return null
                    const activo = tipo === t.key
                    return (
                        <button key={t.key} onClick={() => setTipo(t.key)}
                            className={'px-3 py-1.5 rounded-md text-sm font-medium transition-all ' +
                                (activo ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                            {t.label} <span className="text-gray-400">({n})</span>
                        </button>
                    )
                })}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Tipo</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Código</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ítem</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Dice el catálogo</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Hay en almacenes</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Diferencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        {ordenadas.map(f => (
                            <tr key={f.tipo_item + '-' + f.item_id} className="border-b border-gray-50 last:border-0">
                                <td className="px-4 py-2.5 text-xs text-gray-500">{TIPO_LABEL[f.tipo_item] || f.tipo_item}</td>
                                <td className="px-4 py-2.5 text-sm font-mono text-gray-600">{f.codigo || '—'}</td>
                                <td className="px-4 py-2.5 text-sm text-gray-800">{f.nombre}</td>
                                <td className="px-4 py-2.5 text-sm text-gray-700 text-right">{fmt(f.stock_catalogo)}</td>
                                <td className="px-4 py-2.5 text-sm text-gray-700 text-right">{fmt(f.stock_almacenes)}</td>
                                <td className={'px-4 py-2.5 text-sm font-semibold text-right ' +
                                    (f.diferencia > 0 ? 'text-amber-600' : 'text-red-600')}>
                                    {f.diferencia > 0 ? '+' : ''}{fmt(f.diferencia)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed">
                Diferencia positiva: el catálogo dice más de lo que está repartido en almacenes.
                Negativa: dice menos. Para corregir, cuenta físicamente y carga el resultado en
                Inventario → Por Almacén → Ajustar, que deja su movimiento.
            </p>
        </div>
    )
}
