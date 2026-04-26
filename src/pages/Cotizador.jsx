import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Search, Share2, ShoppingCart, Car, Tag } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

function semaforo(stock) {
    if (stock <= 0) return { color: '#dc2626', bg: '#fef2f2', label: 'Sin stock' }
    if (stock < 10) return { color: '#d97706', bg: '#fffbeb', label: `${stock} disponibles` }
    return { color: '#16a34a', bg: '#f0fdf4', label: `${stock} disponibles` }
}

const inputStyle = {
    padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box',
    width: '100%',
}

// Enriquece una lista de productos_terminados con datos de autopartes (opcional).
// Si la tabla productos_autopartes no tiene data o la query falla, los productos
// se muestran igual sin nro_parte / marca.
async function enriquecerConAutopartes(productos) {
    if (!productos || productos.length === 0) return []
    const ids = productos.map(p => p.id)
    const { data: apData } = await supabase
        .from('productos_autopartes')
        .select('producto_id, nro_parte, marca')
        .in('producto_id', ids)
    const apMap = {}
    ;(apData || []).forEach(ap => { apMap[ap.producto_id] = ap })
    return productos.map(pt => ({
        producto_id: pt.id,
        nro_parte: apMap[pt.id]?.nro_parte ?? null,
        marca: apMap[pt.id]?.marca ?? null,
        productos_terminados: pt,
    }))
}

export default function Cotizador() {
    const { perfil } = useAuth()
    const navigate = useNavigate()
    const [modo, setModo] = useState('parte')

    const [queryParte, setQueryParte] = useState('')
    const [marcaV, setMarcaV] = useState('')
    const [modeloV, setModeloV] = useState('')
    const [anioV, setAnioV] = useState('')
    const [queryExtra, setQueryExtra] = useState('')
    const [categoriaFiltro, setCategoriaFiltro] = useState('')
    const [categorias, setCategorias] = useState([])

    const [resultados, setResultados] = useState(null)
    const [buscando, setBuscando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        supabase.from('productos_terminados')
            .select('categoria_1')
            .eq('empresa_id', perfil.empresa_id)
            .eq('activo', true)
            .not('categoria_1', 'is', null)
            .then(({ data }) => {
                const unicas = [...new Set((data || []).map(p => p.categoria_1).filter(Boolean))].sort()
                setCategorias(unicas)
            })
    }, [])

    // ── Búsqueda por parte / descripción ──────────────────────────
    async function buscarPorParte() {
        const tieneParte = queryParte.trim()
        const tieneExtra = queryExtra.trim()
        if (!tieneParte && !tieneExtra && !categoriaFiltro) return

        setBuscando(true); setError(''); setResultados(null)

        if (tieneParte) {
            // Búsqueda desde productos_autopartes (nro_parte / marca)
            // Luego intersecta con filtros de producto si los hay.
            let ptIds = null
            if (tieneExtra || categoriaFiltro) {
                let ptQ = supabase.from('productos_terminados')
                    .select('id')
                    .eq('empresa_id', perfil.empresa_id)
                    .eq('activo', true)
                if (categoriaFiltro) ptQ = ptQ.eq('categoria_1', categoriaFiltro)
                if (tieneExtra) ptQ = ptQ.or(`nombre.ilike.%${tieneExtra}%,sku.ilike.%${tieneExtra}%,descripcion.ilike.%${tieneExtra}%`)
                const { data: ptData } = await ptQ
                ptIds = (ptData || []).map(p => p.id)
                if (ptIds.length === 0) { setResultados([]); setBuscando(false); return }
            }

            let apQ = supabase.from('productos_autopartes')
                .select('nro_parte, marca, producto_id, productos_terminados!inner(id, nombre, sku, descripcion, stock_actual, precio_venta, activo, categoria_1)')
                .eq('empresa_id', perfil.empresa_id)
                .eq('productos_terminados.activo', true)
                .or(`nro_parte.ilike.%${tieneParte}%,marca.ilike.%${tieneParte}%`)
            if (ptIds !== null) apQ = apQ.in('producto_id', ptIds)

            const { data, error: err } = await apQ
            if (err) { setError('Error en búsqueda: ' + err.message); setBuscando(false); return }

            // Aplanar al formato uniforme
            const res = (data || []).filter(r => r.productos_terminados?.activo !== false).map(r => ({
                producto_id: r.producto_id,
                nro_parte: r.nro_parte,
                marca: r.marca,
                productos_terminados: r.productos_terminados,
            }))
            setResultados(res)
        } else {
            // Sin nro_parte: busca directo desde productos_terminados.
            // No incluye join a productos_autopartes aquí para evitar que un problema
            // de RLS o datos faltantes en esa tabla bloquee toda la búsqueda.
            let ptQ = supabase.from('productos_terminados')
                .select('id, nombre, sku, descripcion, stock_actual, precio_venta, activo, categoria_1')
                .eq('empresa_id', perfil.empresa_id)
                .eq('activo', true)
            if (categoriaFiltro) ptQ = ptQ.eq('categoria_1', categoriaFiltro)
            if (tieneExtra) ptQ = ptQ.or(`nombre.ilike.%${tieneExtra}%,sku.ilike.%${tieneExtra}%,descripcion.ilike.%${tieneExtra}%`)

            const { data, error: err } = await ptQ
            if (err) { setError('Error en búsqueda: ' + err.message); setBuscando(false); return }
            setResultados(await enriquecerConAutopartes(data || []))
        }

        setBuscando(false)
    }

    // ── Búsqueda por vehículo ──────────────────────────────────────
    async function buscarPorVehiculo() {
        if (!marcaV.trim() && !modeloV.trim()) return
        setBuscando(true); setError(''); setResultados(null)

        let cvQ = supabase.from('compatibilidades_vehiculo')
            .select('producto_id, anio_desde, anio_hasta')
            .eq('empresa_id', perfil.empresa_id)
        if (marcaV.trim()) cvQ = cvQ.ilike('marca_vehiculo', `%${marcaV.trim()}%`)
        if (modeloV.trim()) cvQ = cvQ.ilike('modelo', `%${modeloV.trim()}%`)

        const { data: cvData, error: cvErr } = await cvQ
        if (cvErr) { setError('Error en búsqueda: ' + cvErr.message); setBuscando(false); return }

        let cvFiltrado = cvData || []
        if (anioV.trim()) {
            const y = Number(anioV)
            cvFiltrado = cvFiltrado.filter(c => {
                const desde = c.anio_desde ? Number(c.anio_desde) : 0
                const hasta = c.anio_hasta ? Number(c.anio_hasta) : 9999
                return y >= desde && y <= hasta
            })
        }

        let ids = [...new Set(cvFiltrado.map(c => c.producto_id))]
        if (ids.length === 0) { setResultados([]); setBuscando(false); return }

        // Filtros adicionales sobre productos_terminados
        if (queryExtra.trim() || categoriaFiltro) {
            let ptQ = supabase.from('productos_terminados')
                .select('id')
                .eq('empresa_id', perfil.empresa_id)
                .eq('activo', true)
                .in('id', ids)
            if (categoriaFiltro) ptQ = ptQ.eq('categoria_1', categoriaFiltro)
            if (queryExtra.trim()) ptQ = ptQ.or(`nombre.ilike.%${queryExtra.trim()}%,sku.ilike.%${queryExtra.trim()}%,descripcion.ilike.%${queryExtra.trim()}%`)
            const { data: ptData } = await ptQ
            ids = (ptData || []).map(p => p.id)
            if (ids.length === 0) { setResultados([]); setBuscando(false); return }
        }

        // Obtener datos completos desde productos_terminados (sin join a autopartes)
        const { data: ptData, error: ptErr } = await supabase
            .from('productos_terminados')
            .select('id, nombre, sku, descripcion, stock_actual, precio_venta, activo, categoria_1')
            .eq('activo', true)
            .in('id', ids)
        if (ptErr) { setError('Error en búsqueda: ' + ptErr.message); setBuscando(false); return }

        setResultados(await enriquecerConAutopartes(ptData || []))
        setBuscando(false)
    }

    function handleBuscar() {
        if (modo === 'parte') buscarPorParte()
        else buscarPorVehiculo()
    }

    function limpiarFiltros() {
        setQueryParte(''); setQueryExtra(''); setCategoriaFiltro('')
        setMarcaV(''); setModeloV(''); setAnioV('')
        setResultados(null); setError('')
    }

    function compartirWhatsApp(item) {
        const pt = item.productos_terminados
        const sem = semaforo(pt.stock_actual ?? 0)
        const lines = [
            `*Cotización — ${pt.nombre}*`,
            item.nro_parte ? `N° Parte: ${item.nro_parte}` : '',
            item.marca ? `Marca: ${item.marca}` : '',
            `SKU: ${pt.sku}`,
            `Precio: ${fmt(pt.precio_venta)}`,
            `Disponibilidad: ${sem.label}`,
        ].filter(Boolean).join('\n')
        window.open(`https://wa.me/?text=${encodeURIComponent(lines)}`, '_blank')
    }

    const hayFiltros = queryParte || queryExtra || categoriaFiltro || marcaV || modeloV || anioV

    return (
        <div style={{ padding: '24px', maxWidth: '960px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Cotizador</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Busca repuestos por número de parte, descripción o vehículo</p>
                </div>
                <button onClick={() => navigate('/ventas')}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                    <ShoppingCart size={15} /> Ir a Ventas
                </button>
            </div>

            {/* Selector de modo */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'parte', label: 'Por número de parte / marca', icon: Tag },
                    { key: 'vehiculo', label: 'Por vehículo', icon: Car },
                ].map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => { setModo(key); setResultados(null); setError('') }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: modo === key ? '#1d4ed8' : '#e5e7eb',
                            backgroundColor: modo === key ? '#eff6ff' : '#fff',
                            color: modo === key ? '#1d4ed8' : '#6b7280',
                        }}>
                        <Icon size={14} /> {label}
                    </button>
                ))}
            </div>

            {/* Panel búsqueda */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
                {modo === 'parte' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '5px' }}>
                                    N° de parte / Marca <span style={{ fontWeight: 400 }}>(opcional)</span>
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                    <input value={queryParte} onChange={e => setQueryParte(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                                        placeholder="Ej: Bosch, 0001-234..."
                                        style={{ ...inputStyle, paddingLeft: '32px' }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '5px' }}>
                                    Descripción / Código SKU <span style={{ fontWeight: 400 }}>(opcional)</span>
                                </label>
                                <input value={queryExtra} onChange={e => setQueryExtra(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                                    placeholder="Ej: pastilla, filtro, ACE-001..."
                                    style={inputStyle} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '5px' }}>Categoría</label>
                                <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)} style={inputStyle}>
                                    <option value="">— Todas las categorías —</option>
                                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {hayFiltros && (
                                    <button onClick={limpiarFiltros}
                                        style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
                                        Limpiar
                                    </button>
                                )}
                                <button onClick={handleBuscar} disabled={buscando}
                                    style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', opacity: buscando ? 0.6 : 1 }}>
                                    {buscando ? 'Buscando...' : 'Buscar'}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '10px' }}>
                            {[
                                { val: marcaV, set: setMarcaV, label: 'Marca del vehículo', placeholder: 'Toyota, Ford...' },
                                { val: modeloV, set: setModeloV, label: 'Modelo', placeholder: 'Corolla, F-150...' },
                                { val: anioV, set: setAnioV, label: 'Año', placeholder: '2015', type: 'number' },
                            ].map((f, i) => (
                                <div key={i}>
                                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '5px' }}>{f.label}</label>
                                    <input type={f.type || 'text'} value={f.val} onChange={e => f.set(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                                        placeholder={f.placeholder} style={inputStyle} />
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '5px' }}>
                                    Descripción / Código SKU <span style={{ fontWeight: 400 }}>(opcional)</span>
                                </label>
                                <input value={queryExtra} onChange={e => setQueryExtra(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                                    placeholder="Filtrar dentro de resultados..."
                                    style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '5px' }}>
                                    Categoría <span style={{ fontWeight: 400 }}>(opcional)</span>
                                </label>
                                <select value={categoriaFiltro} onChange={e => setCategoriaFiltro(e.target.value)} style={inputStyle}>
                                    <option value="">— Todas las categorías —</option>
                                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            {hayFiltros && (
                                <button onClick={limpiarFiltros}
                                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
                                    Limpiar
                                </button>
                            )}
                            <button onClick={handleBuscar} disabled={buscando}
                                style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', opacity: buscando ? 0.6 : 1 }}>
                                {buscando ? 'Buscando...' : 'Buscar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Resultados */}
            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#dc2626', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            {resultados !== null && (
                resultados.length === 0 ? (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db', padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                        No se encontraron productos para esa búsqueda
                    </div>
                ) : (
                    <div>
                        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>
                            {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {resultados.map((item, i) => {
                                const pt = item.productos_terminados
                                const stock = pt.stock_actual ?? 0
                                const sem = semaforo(stock)
                                return (
                                    <div key={i} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{pt.nombre}</span>
                                                {pt.categoria_1 && (
                                                    <span style={{ fontSize: '11px', backgroundColor: '#f3f4f6', color: '#6b7280', padding: '2px 8px', borderRadius: '20px' }}>
                                                        {pt.categoria_1}
                                                    </span>
                                                )}
                                            </div>
                                            {pt.descripcion && (
                                                <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px', maxWidth: '500px' }}>{pt.descripcion}</div>
                                            )}
                                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: '#6b7280' }}>
                                                <span>SKU: <strong style={{ fontFamily: 'monospace', color: '#374151' }}>{pt.sku}</strong></span>
                                                {item.nro_parte && <span>Parte: <strong style={{ color: '#374151' }}>{item.nro_parte}</strong></span>}
                                                {item.marca && <span>Marca: <strong style={{ color: '#374151' }}>{item.marca}</strong></span>}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                                            <div style={{ fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>{fmt(pt.precio_venta)}</div>
                                            <div style={{ fontSize: '12px', fontWeight: 500, color: sem.color, backgroundColor: sem.bg, padding: '3px 10px', borderRadius: '20px' }}>
                                                {sem.label}
                                            </div>
                                            <button onClick={() => compartirWhatsApp(item)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '5px', backgroundColor: '#25d366', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', marginTop: '2px' }}>
                                                <Share2 size={13} /> WhatsApp
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )
            )}
        </div>
    )
}
