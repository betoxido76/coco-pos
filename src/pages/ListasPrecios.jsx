import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Save, Check, Search } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

const inputStyle = {
    width: '100%', padding: '7px 10px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box', textAlign: 'right',
}

export default function ListasPrecios() {
    const { perfil } = useAuth()
    const [listas, setListas] = useState([])
    const [listaId, setListaId] = useState('')
    const [productos, setProductos] = useState([])
    const [precios, setPrecios] = useState({}) // { producto_id: precio }
    const [busqueda, setBusqueda] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [exito, setExito] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    // Cargar listas
    useEffect(() => {
        supabase.from('listas_precio')
            .select('id, nombre, es_default')
            .eq('activo', true)
            .eq('empresa_id', perfil.empresa_id)
            .order('nombre')
            .then(({ data }) => {
                if (data) {
                    setListas(data)
                    const def = data.find(l => l.es_default) || data[0]
                    if (def) setListaId(def.id)
                }
            })
    }, [])

    // Cargar productos y precios existentes cuando cambia la lista
    useEffect(() => {
        if (!listaId) return
        cargarProductosYPrecios()
    }, [listaId])

    async function cargarProductosYPrecios() {
        setLoading(true)
        setExito(false)
        setError('')

        const [{ data: prods }, { data: preciosExistentes }] = await Promise.all([
            supabase.from('productos_terminados')
                .select('id, nombre, sku, unidad_medida, precio_venta')
                .eq('activo', true)
                .eq('empresa_id', perfil.empresa_id)
                .order('nombre'),
            supabase.from('producto_precios')
                .select('producto_id, precio')
                .eq('lista_id', listaId)
                .eq('empresa_id', perfil.empresa_id),
        ])

        if (prods) setProductos(prods)

        // Construir mapa de precios existentes
        const mapa = {}
        if (preciosExistentes) {
            preciosExistentes.forEach(p => { mapa[p.producto_id] = String(p.precio) })
        }
        // Para productos sin precio en esta lista, dejar vacío
        if (prods) {
            prods.forEach(p => {
                if (!(p.id in mapa)) mapa[p.id] = ''
            })
        }
        setPrecios(mapa)
        setLoading(false)
    }

    function cambiarPrecio(productoId, valor) {
        setPrecios(prev => ({ ...prev, [productoId]: valor }))
    }

    async function guardar() {
        setGuardando(true); setError(''); setExito(false)

        // Solo guardar los que tienen precio definido
        const conPrecio = productos.filter(p => precios[p.id] !== '' && Number(precios[p.id]) > 0)

        if (conPrecio.length === 0) {
            setError('Ingresa al menos un precio')
            setGuardando(false)
            return
        }

        const payload = conPrecio.map(p => ({
            lista_id: listaId,
            producto_id: p.id,
            precio: Number(precios[p.id]),
            empresa_id: perfil.empresa_id,
        }))

        // Upsert — inserta o actualiza según lista_id + producto_id
        const { error: err } = await supabase
            .from('producto_precios')
            .upsert(payload, { onConflict: 'lista_id,producto_id' })

        // Eliminar los que quedaron en blanco (se borraron)
        const sinPrecio = productos.filter(p => precios[p.id] === '' || Number(precios[p.id]) <= 0)
        if (sinPrecio.length > 0) {
            await supabase.from('producto_precios')
                .delete()
                .eq('lista_id', listaId)
                .in('producto_id', sinPrecio.map(p => p.id))
        }

        setGuardando(false)
        if (err) { setError('Error al guardar: ' + err.message); return }
        setExito(true)
        setTimeout(() => setExito(false), 3000)
    }

    const listaActual = listas.find(l => l.id === listaId)
    const productosFiltrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.sku?.toLowerCase().includes(busqueda.toLowerCase())
    )
    const conPrecio = productos.filter(p => precios[p.id] !== '' && Number(precios[p.id]) > 0).length
    const sinPrecio = productos.length - conPrecio

    return (
        <div style={{ padding: '24px' }}>

            {/* Header */}
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Listas de Precio</h1>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Define los precios de cada producto por lista</p>
            </div>

            {/* Selector de lista */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {listas.map(l => (
                    <button key={l.id} onClick={() => setListaId(l.id)}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: listaId === l.id ? '#16a34a' : '#e5e7eb',
                            backgroundColor: listaId === l.id ? '#f0fdf4' : '#fff',
                            color: listaId === l.id ? '#16a34a' : '#6b7280',
                        }}>
                        {l.nombre}
                        {l.es_default && (
                            <span style={{ marginLeft: '6px', fontSize: '10px', backgroundColor: '#dcfce7', color: '#166534', padding: '1px 6px', borderRadius: '20px' }}>
                                default
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* KPIs */}
            {!loading && productos.length > 0 && (
                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '10px 16px', fontSize: '13px', color: '#166534' }}>
                        <strong>{conPrecio}</strong> productos con precio
                    </div>
                    {sinPrecio > 0 && (
                        <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: '10px', padding: '10px 16px', fontSize: '13px', color: '#854d0e' }}>
                            <strong>{sinPrecio}</strong> productos sin precio en esta lista
                        </div>
                    )}
                </div>
            )}

            {/* Buscador */}
            <div style={{ position: 'relative', marginBottom: '16px', maxWidth: '360px' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input type="text" placeholder="Buscar producto..."
                    value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    style={{ ...inputStyle, textAlign: 'left', paddingLeft: '32px' }} />
            </div>

            {/* Tabla */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Producto', 'SKU', 'Unidad', 'Precio venta base', `Precio en ${listaActual?.nombre || '—'}`].map((h, i) => (
                                    <th key={i} style={{
                                        padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280',
                                        textAlign: i >= 3 ? 'right' : 'left', whiteSpace: 'nowrap'
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {productosFiltrados.map(p => {
                                const precioActual = precios[p.id]
                                const tienePrecio = precioActual !== '' && Number(precioActual) > 0
                                return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{p.nombre}</td>
                                        <td style={{ padding: '10px 16px', fontSize: '12px', color: '#9ca3af', fontFamily: 'monospace' }}>{p.sku || '—'}</td>
                                        <td style={{ padding: '10px 16px', fontSize: '13px', color: '#6b7280' }}>{p.unidad_medida}</td>
                                        <td style={{ padding: '10px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>
                                            {p.precio_venta ? fmt(p.precio_venta) : '—'}
                                        </td>
                                        <td style={{ padding: '8px 16px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                <span style={{ fontSize: '13px', color: '#6b7280' }}>$</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={precioActual}
                                                    onChange={e => cambiarPrecio(p.id, e.target.value)}
                                                    placeholder="0.00"
                                                    style={{
                                                        ...inputStyle,
                                                        width: '120px',
                                                        borderColor: tienePrecio ? '#16a34a' : '#d1d5db',
                                                        backgroundColor: tienePrecio ? '#f0fdf4' : '#fff',
                                                        color: tienePrecio ? '#166534' : '#9ca3af',
                                                        fontWeight: tienePrecio ? 600 : 400,
                                                    }}
                                                />
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Mensajes */}
            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>
                    {error}
                </div>
            )}

            {/* Botón guardar */}
            <button onClick={guardar} disabled={guardando || loading}
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    backgroundColor: exito ? '#166534' : '#16a34a',
                    color: '#fff', border: 'none', borderRadius: '8px',
                    padding: '11px 24px', fontSize: '14px', fontWeight: 600,
                    cursor: 'pointer', transition: 'background 0.2s',
                    opacity: guardando ? 0.6 : 1,
                }}>
                {exito ? <><Check size={16} /> Guardado</> : <><Save size={16} /> {guardando ? 'Guardando...' : 'Guardar precios'}</>}
            </button>

            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '10px' }}>
                Los productos sin precio no aparecerán disponibles en esta lista al tomar pedidos. Deja el campo vacío para excluir un producto de la lista.
            </p>
        </div>
    )
}
