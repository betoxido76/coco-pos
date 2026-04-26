import { useState } from 'react'
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

export default function Cotizador() {
    const { perfil } = useAuth()
    const navigate = useNavigate()
    const [modo, setModo] = useState('parte')   // 'parte' | 'vehiculo'

    // Búsqueda por parte
    const [queryParte, setQueryParte] = useState('')

    // Búsqueda por vehículo
    const [marcaV, setMarcaV] = useState('')
    const [modeloV, setModeloV] = useState('')
    const [anioV, setAnioV] = useState('')

    const [resultados, setResultados] = useState(null)   // null = no buscado aún
    const [buscando, setBuscando] = useState(false)
    const [error, setError] = useState('')

    async function buscarPorParte() {
        if (!queryParte.trim()) return
        setBuscando(true); setError(''); setResultados(null)
        const { data, error: err } = await supabase
            .from('productos_autopartes')
            .select('*, productos_terminados!inner(id, nombre, sku, stock_actual, precio_venta, activo)')
            .eq('empresa_id', perfil.empresa_id)
            .or(`nro_parte.ilike.%${queryParte.trim()}%,marca.ilike.%${queryParte.trim()}%`)
            .eq('productos_terminados.activo', true)
        if (err) { setError('Error en búsqueda: ' + err.message); setBuscando(false); return }
        setResultados(data || [])
        setBuscando(false)
    }

    async function buscarPorVehiculo() {
        if (!marcaV.trim() && !modeloV.trim()) return
        setBuscando(true); setError(''); setResultados(null)

        let q = supabase.from('compatibilidades_vehiculo')
            .select('producto_id, marca_vehiculo, modelo, anio_desde, anio_hasta')
            .eq('empresa_id', perfil.empresa_id)
        if (marcaV.trim()) q = q.ilike('marca_vehiculo', `%${marcaV.trim()}%`)
        if (modeloV.trim()) q = q.ilike('modelo', `%${modeloV.trim()}%`)

        const { data: cvData, error: cvErr } = await q
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

        const ids = [...new Set(cvFiltrado.map(c => c.producto_id))]
        if (ids.length === 0) { setResultados([]); setBuscando(false); return }

        const { data: apData, error: apErr } = await supabase
            .from('productos_autopartes')
            .select('*, productos_terminados!inner(id, nombre, sku, stock_actual, precio_venta, activo)')
            .in('producto_id', ids)
            .eq('productos_terminados.activo', true)
        if (apErr) { setError('Error en búsqueda: ' + apErr.message); setBuscando(false); return }

        setResultados(apData || [])
        setBuscando(false)
    }

    function handleBuscar() {
        if (modo === 'parte') buscarPorParte()
        else buscarPorVehiculo()
    }

    function compartirWhatsApp(item) {
        const pt = item.productos_terminados
        const stock = pt.stock_actual ?? 0
        const sem = semaforo(stock)
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

    return (
        <div style={{ padding: '24px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Cotizador</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Busca repuestos por número de parte o por vehículo</p>
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
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                            <input value={queryParte} onChange={e => setQueryParte(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                                placeholder="Ej: Bosch, 0001-234, filtro..."
                                style={{ width: '100%', padding: '10px 12px 10px 32px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }} />
                        </div>
                        <button onClick={handleBuscar} disabled={buscando}
                            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', opacity: buscando ? 0.6 : 1 }}>
                            {buscando ? 'Buscando...' : 'Buscar'}
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        {[
                            { val: marcaV, set: setMarcaV, placeholder: 'Marca (Toyota, Ford...)' },
                            { val: modeloV, set: setModeloV, placeholder: 'Modelo (Corolla, F-150...)' },
                            { val: anioV, set: setAnioV, placeholder: 'Año (opcional)', type: 'number' },
                        ].map((f, i) => (
                            <input key={i} type={f.type || 'text'} value={f.val} onChange={e => f.set(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                                placeholder={f.placeholder}
                                style={{ flex: i < 2 ? 2 : 1, minWidth: '140px', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }} />
                        ))}
                        <button onClick={handleBuscar} disabled={buscando}
                            style={{ backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer', opacity: buscando ? 0.6 : 1 }}>
                            {buscando ? 'Buscando...' : 'Buscar'}
                        </button>
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
                        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '12px' }}>{resultados.length} resultado{resultados.length !== 1 ? 's' : ''}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {resultados.map((item, i) => {
                                const pt = item.productos_terminados
                                const stock = pt.stock_actual ?? 0
                                const sem = semaforo(stock)
                                return (
                                    <div key={i} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', marginBottom: '4px' }}>{pt.nombre}</div>
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
