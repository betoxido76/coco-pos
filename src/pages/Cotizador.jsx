import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { Search, Share2, ShoppingCart, Car, Tag, ChevronDown } from 'lucide-react'

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
        vehiculos_match: [],
        productos_terminados: pt,
    }))
}

export default function Cotizador() {
    const { perfil } = useAuth()
    const navigate = useNavigate()
    const [modo, setModo] = useState('parte')

    // Búsqueda por parte
    const [queryParte, setQueryParte] = useState('')
    const [queryExtra, setQueryExtra] = useState('')
    const [categoriaFiltro, setCategoriaFiltro] = useState('')
    const [categorias, setCategorias] = useState([])

    // Búsqueda por vehículo — dropdowns dinámicos
    const [marcas, setMarcas] = useState([])
    const [modelos, setModelos] = useState([])
    const [marcaV, setMarcaV] = useState('')
    const [modeloV, setModeloV] = useState('')
    const [anioV, setAnioV] = useState('')

    const [resultados, setResultados] = useState(null)
    const [buscando, setBuscando] = useState(false)
    const [error, setError] = useState('')

    // Cargar categorías
    useEffect(() => {
        if (!perfil?.empresa_id) return
        supabase.from('productos_terminados')
            .select('categoria_1').eq('empresa_id', perfil.empresa_id).eq('activo', true)
            .not('categoria_1', 'is', null)
            .then(({ data }) => {
                const unicas = [...new Set((data || []).map(p => p.categoria_1).filter(Boolean))].sort()
                setCategorias(unicas)
            })
    }, [perfil?.empresa_id])

    // Cargar marcas de vehículos
    useEffect(() => {
        if (!perfil?.empresa_id) return
        supabase.from('vehiculos').select('marca').eq('empresa_id', perfil.empresa_id).order('marca')
            .then(({ data }) => {
                const unicas = [...new Set((data || []).map(v => v.marca))].sort()
                setMarcas(unicas)
            })
    }, [perfil?.empresa_id])

    // Cargar modelos al cambiar marca
    useEffect(() => {
        if (!marcaV || !perfil?.empresa_id) { setModelos([]); setModeloV(''); return }
        supabase.from('vehiculos').select('modelo')
            .eq('empresa_id', perfil.empresa_id).eq('marca', marcaV).order('modelo')
            .then(({ data }) => {
                const unicos = [...new Set((data || []).map(v => v.modelo))].sort()
                setModelos(unicos)
                setModeloV('')
            })
    }, [marcaV, perfil?.empresa_id])

    // ── Búsqueda por parte / descripción ──────────────────────────
    async function buscarPorParte() {
        const tieneParte = queryParte.trim()
        const tieneExtra = queryExtra.trim()
        if (!tieneParte && !tieneExtra && !categoriaFiltro) return

        setBuscando(true); setError(''); setResultados(null)

        if (tieneParte) {
            let ptIds = null
            if (tieneExtra || categoriaFiltro) {
                let ptQ = supabase.from('productos_terminados').select('id')
                    .eq('empresa_id', perfil.empresa_id).eq('activo', true)
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

            setResultados((data || []).filter(r => r.productos_terminados?.activo !== false).map(r => ({
                producto_id: r.producto_id,
                nro_parte: r.nro_parte,
                marca: r.marca,
                vehiculos_match: [],
                productos_terminados: r.productos_terminados,
            })))
        } else {
            let ptQ = supabase.from('productos_terminados')
                .select('id, nombre, sku, descripcion, stock_actual, precio_venta, activo, categoria_1')
                .eq('empresa_id', perfil.empresa_id).eq('activo', true)
            if (categoriaFiltro) ptQ = ptQ.eq('categoria_1', categoriaFiltro)
            if (tieneExtra) ptQ = ptQ.or(`nombre.ilike.%${tieneExtra}%,sku.ilike.%${tieneExtra}%,descripcion.ilike.%${tieneExtra}%`)
            const { data, error: err } = await ptQ
            if (err) { setError('Error en búsqueda: ' + err.message); setBuscando(false); return }
            setResultados(await enriquecerConAutopartes(data || []))
        }

        setBuscando(false)
    }

    // ── Búsqueda por vehículo (nueva lógica con vehiculos + producto_vehiculo) ──
    async function buscarPorVehiculo() {
        if (!marcaV) return
        setBuscando(true); setError(''); setResultados(null)

        // 1. Obtener ids de vehículos que coinciden con marca/modelo
        let vQ = supabase.from('vehiculos').select('id, marca, modelo')
            .eq('empresa_id', perfil.empresa_id).eq('marca', marcaV)
        if (modeloV) vQ = vQ.eq('modelo', modeloV)
        const { data: vData, error: vErr } = await vQ
        if (vErr) { setError('Error: ' + vErr.message); setBuscando(false); return }
        const vehiculoIds = (vData || []).map(v => v.id)
        const vehiculoMap = {}
        ;(vData || []).forEach(v => { vehiculoMap[v.id] = v })
        if (vehiculoIds.length === 0) { setResultados([]); setBuscando(false); return }

        // 2. Obtener producto_vehiculo para esos vehículos
        const { data: pvData, error: pvErr } = await supabase.from('producto_vehiculo')
            .select('producto_id, vehiculo_id, año_inicio, año_fin, posicion')
            .eq('empresa_id', perfil.empresa_id)
            .in('vehiculo_id', vehiculoIds)
        if (pvErr) { setError('Error: ' + pvErr.message); setBuscando(false); return }

        // 3. Filtrar por año en JS
        let pvFiltrado = pvData || []
        if (anioV.trim()) {
            const y = Number(anioV)
            pvFiltrado = pvFiltrado.filter(pv => y >= pv.año_inicio && y <= pv.año_fin)
        }

        // 4. Agrupar por producto_id acumulando info de vehículos
        const productoMatchMap = {}
        pvFiltrado.forEach(pv => {
            if (!productoMatchMap[pv.producto_id]) productoMatchMap[pv.producto_id] = []
            const v = vehiculoMap[pv.vehiculo_id]
            productoMatchMap[pv.producto_id].push({
                marca: v?.marca, modelo: v?.modelo,
                año_inicio: pv.año_inicio, año_fin: pv.año_fin,
                posicion: pv.posicion,
            })
        })

        let ids = Object.keys(productoMatchMap)
        if (ids.length === 0) { setResultados([]); setBuscando(false); return }

        // 5. Filtros adicionales sobre productos_terminados
        if (queryExtra.trim() || categoriaFiltro) {
            let ptQ = supabase.from('productos_terminados').select('id')
                .eq('empresa_id', perfil.empresa_id).eq('activo', true).in('id', ids)
            if (categoriaFiltro) ptQ = ptQ.eq('categoria_1', categoriaFiltro)
            if (queryExtra.trim()) ptQ = ptQ.or(`nombre.ilike.%${queryExtra.trim()}%,sku.ilike.%${queryExtra.trim()}%`)
            const { data: ptFiltrado } = await ptQ
            ids = (ptFiltrado || []).map(p => p.id)
            if (ids.length === 0) { setResultados([]); setBuscando(false); return }
        }

        const { data: ptData, error: ptErr } = await supabase.from('productos_terminados')
            .select('id, nombre, sku, descripcion, stock_actual, precio_venta, activo, categoria_1')
            .eq('activo', true).in('id', ids)
        if (ptErr) { setError('Error: ' + ptErr.message); setBuscando(false); return }

        const enriched = await enriquecerConAutopartes(ptData || [])
        setResultados(enriched.map(item => ({
            ...item,
            vehiculos_match: productoMatchMap[item.producto_id] || [],
        })))
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
        const vehiculoInfo = item.vehiculos_match?.length > 0
            ? item.vehiculos_match.map(v => `${v.marca} ${v.modelo} ${v.año_inicio}–${v.año_fin}${v.posicion ? ' (' + v.posicion + ')' : ''}`).join(', ')
            : null
        const lines = [
            `*Cotización — ${pt.nombre}*`,
            item.nro_parte ? `N° Parte: ${item.nro_parte}` : '',
            item.marca ? `Marca repuesto: ${item.marca}` : '',
            vehiculoInfo ? `Aplica para: ${vehiculoInfo}` : '',
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

            {/* Panel de búsqueda */}
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
                            <BotonesAccion hayFiltros={hayFiltros} buscando={buscando} onLimpiar={limpiarFiltros} onBuscar={handleBuscar} />
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {/* Fila principal: marca → modelo → año */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '5px' }}>
                                    Marca del vehículo *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <select value={marcaV} onChange={e => setMarcaV(e.target.value)} style={{ ...inputStyle, appearance: 'none', paddingRight: '30px' }}>
                                        <option value="">— Selecciona marca —</option>
                                        {marcas.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                                </div>
                                {marcas.length === 0 && (
                                    <p style={{ fontSize: '11px', color: '#d97706', margin: '4px 0 0' }}>
                                        Sin vehículos en catálogo — agrégalos en Administración → Vehículos
                                    </p>
                                )}
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '5px' }}>
                                    Modelo {marcaV ? '' : <span style={{ fontWeight: 400, color: '#9ca3af' }}>(selecciona marca primero)</span>}
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <select value={modeloV} onChange={e => setModeloV(e.target.value)}
                                        disabled={!marcaV || modelos.length === 0}
                                        style={{ ...inputStyle, appearance: 'none', paddingRight: '30px', opacity: !marcaV ? 0.5 : 1 }}>
                                        <option value="">— Todos los modelos —</option>
                                        {modelos.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                    <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }} />
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '5px' }}>Año</label>
                                <input type="number" value={anioV} onChange={e => setAnioV(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                                    placeholder="2015" style={inputStyle} />
                            </div>
                        </div>
                        {/* Filtros adicionales */}
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
                                    <option value="">— Todas —</option>
                                    {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <BotonesAccion hayFiltros={hayFiltros} buscando={buscando} onLimpiar={limpiarFiltros} onBuscar={handleBuscar} disabled={!marcaV} />
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
                        No se encontraron repuestos para esa búsqueda
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
                                    <div key={i} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
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
                                                {/* Vehículos compatibles */}
                                                {item.vehiculos_match?.length > 0 && (
                                                    <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {item.vehiculos_match.map((v, vi) => (
                                                            <span key={vi} style={{ fontSize: '11px', backgroundColor: '#eff6ff', color: '#1e40af', padding: '2px 8px', borderRadius: '20px', border: '1px solid #bfdbfe' }}>
                                                                <Car size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '3px' }} />
                                                                {v.marca} {v.modelo} {v.año_inicio}–{v.año_fin}
                                                                {v.posicion && ` · ${v.posicion}`}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end', flexShrink: 0 }}>
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

function BotonesAccion({ hayFiltros, buscando, onLimpiar, onBuscar, disabled = false }) {
    return (
        <div style={{ display: 'flex', gap: '8px' }}>
            {hayFiltros && (
                <button onClick={onLimpiar}
                    style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
                    Limpiar
                </button>
            )}
            <button onClick={onBuscar} disabled={buscando || disabled}
                style={{ backgroundColor: disabled ? '#d1d5db' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 24px', fontSize: '14px', fontWeight: 500, cursor: disabled ? 'default' : 'pointer', opacity: buscando ? 0.6 : 1 }}>
                {buscando ? 'Buscando...' : 'Buscar'}
            </button>
        </div>
    )
}
