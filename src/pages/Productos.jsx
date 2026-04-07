import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Search, Pencil, X, Check, AlertTriangle } from 'lucide-react'

const CATEGORIAS = ['Bebidas', 'Alimentos', 'Helados', 'Aceites', 'Otros']
const TIPOS = ['producido', 'comprado']
const UNIDADES = ['unidad', 'kg', 'g', 'litro', 'ml', 'caja', 'bolsa']

const VACIO = {
    nombre: '', sku: '', descripcion: '', unidad_medida: 'unidad',
    precio_venta: '', costo_promedio: '', stock_actual: '', stock_minimo: '',
    categoria_1: '', categoria_2: '', categoria_3: '', categoria_4: '',
    tipo_producto: 'producido', vida_util_dias: '', activo: true,
}

export default function Productos() {
    const [productos, setProductos] = useState([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [filtrocat, setFiltrocat] = useState('Todas')
    const [vista, setVista] = useState('lista')   // 'lista' | 'form'
    const [editando, setEditando] = useState(null)      // null = nuevo
    const [form, setForm] = useState(VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [exito, setExito] = useState('')

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase
            .from('productos_terminados')
            .select('*')
            .order('nombre')
        if (data) setProductos(data)
        setLoading(false)
    }

    function abrirNuevo() {
        setEditando(null)
        setForm(VACIO)
        setError('')
        setVista('form')
    }

    function abrirEditar(p) {
        setEditando(p.id)
        setForm({
            nombre: p.nombre || '',
            sku: p.sku || '',
            descripcion: p.descripcion || '',
            unidad_medida: p.unidad_medida || 'unidad',
            precio_venta: p.precio_venta ?? '',
            costo_promedio: p.costo_promedio ?? '',
            stock_actual: p.stock_actual ?? '',
            stock_minimo: p.stock_minimo ?? '',
            categoria_1: p.categoria_1 || '',
            categoria_2: p.categoria_2 || '',
            categoria_3: p.categoria_3 || '',
            categoria_4: p.categoria_4 || '',
            tipo_producto: p.tipo_producto || 'producido',
            vida_util_dias: p.vida_util_dias ?? '',
            activo: p.activo ?? true,
        })
        setError('')
        setVista('form')
    }

    function campo(key, valor) {
        setForm(prev => ({ ...prev, [key]: valor }))
    }

    async function guardar() {
        if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
        if (!form.sku.trim()) { setError('El código SKU es obligatorio'); return }
        setGuardando(true)
        setError('')

        const payload = {
            nombre: form.nombre.trim(),
            sku: form.sku.trim().toUpperCase(),
            descripcion: form.descripcion.trim() || null,
            unidad_medida: form.unidad_medida,
            precio_venta: form.precio_venta !== '' ? Number(form.precio_venta) : null,
            costo_promedio: form.costo_promedio !== '' ? Number(form.costo_promedio) : null,
            stock_actual: form.stock_actual !== '' ? Number(form.stock_actual) : 0,
            stock_minimo: form.stock_minimo !== '' ? Number(form.stock_minimo) : 0,
            categoria_1: form.categoria_1 || null,
            categoria_2: form.categoria_2 || null,
            categoria_3: form.categoria_3 || null,
            categoria_4: form.categoria_4 || null,
            tipo_producto: form.tipo_producto,
            vida_util_dias: form.vida_util_dias !== '' ? Number(form.vida_util_dias) : null,
            activo: form.activo,
        }

        let err
        if (editando) {
            ; ({ error: err } = await supabase.from('productos_terminados').update(payload).eq('id', editando))
        } else {
            ; ({ error: err } = await supabase.from('productos_terminados').insert(payload))
        }

        setGuardando(false)
        if (err) { setError('Error al guardar: ' + err.message); return }

        setExito(editando ? 'Producto actualizado' : 'Producto creado')
        setTimeout(() => setExito(''), 3000)
        await cargar()
        setVista('lista')
    }

    async function toggleActivo(p) {
        await supabase.from('productos_terminados').update({ activo: !p.activo }).eq('id', p.id)
        cargar()
    }

    const filtrados = productos.filter(p => {
        const q = busqueda.toLowerCase()
        const coincide = p.nombre.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q)
        const cat = filtrocat === 'Todas' || p.categoria_1 === filtrocat
        return coincide && cat
    })

    // ── FORMULARIO ──────────────────────────────────────────────
    if (vista === 'form') return (
        <div style={{ padding: '24px', maxWidth: '760px' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={() => setVista('lista')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>
                    ← Volver
                </button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                    {editando ? 'Editar producto' : 'Nuevo producto'}
                </h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                {/* Nombre */}
                <Campo label="Nombre *" span={2}>
                    <input value={form.nombre} onChange={e => campo('nombre', e.target.value)}
                        placeholder="Ej: Agua de Coco Natural 500ml" style={inputStyle} />
                </Campo>

                {/* SKU */}
                <Campo label="Código SKU *">
                    <input value={form.sku} onChange={e => campo('sku', e.target.value)}
                        placeholder="Ej: ACN-500" style={inputStyle} />
                </Campo>

                {/* Tipo */}
                <Campo label="Tipo de producto">
                    <select value={form.tipo_producto} onChange={e => campo('tipo_producto', e.target.value)} style={inputStyle}>
                        {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </Campo>

                {/* Descripción */}
                <Campo label="Descripción" span={2}>
                    <textarea value={form.descripcion} onChange={e => campo('descripcion', e.target.value)}
                        rows={2} placeholder="Descripción opcional..." style={{ ...inputStyle, resize: 'vertical' }} />
                </Campo>

                {/* Precio venta */}
                <Campo label="Precio de venta ($)">
                    <input type="number" min="0" step="0.01" value={form.precio_venta}
                        onChange={e => campo('precio_venta', e.target.value)}
                        placeholder="0.00" style={inputStyle} />
                </Campo>

                {/* Costo compra */}
                <Campo label="Costo de compra ($)">
                    <input type="number" min="0" step="0.01" value={form.costo_promedio}
                        onChange={e => campo('costo_promedio', e.target.value)}
                        placeholder="0.00" style={inputStyle} />
                </Campo>

                {/* Stock actual */}
                <Campo label="Stock actual">
                    <input type="number" min="0" value={form.stock_actual}
                        onChange={e => campo('stock_actual', e.target.value)}
                        placeholder="0" style={inputStyle} />
                </Campo>

                {/* Stock mínimo */}
                <Campo label="Stock mínimo (alerta)">
                    <input type="number" min="0" value={form.stock_minimo}
                        onChange={e => campo('stock_minimo', e.target.value)}
                        placeholder="0" style={inputStyle} />
                </Campo>

                {/* Unidad */}
                <Campo label="Unidad de medida">
                    <select value={form.unidad_medida} onChange={e => campo('unidad_medida', e.target.value)} style={inputStyle}>
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </Campo>

                {/* Vida útil */}
                <Campo label="Vida útil (días)">
                    <input type="number" min="0" value={form.vida_util_dias}
                        onChange={e => campo('vida_util_dias', e.target.value)}
                        placeholder="Ej: 30" style={inputStyle} />
                </Campo>

                {/* Categorías */}
                <div style={{ gridColumn: 'span 2' }}>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '10px' }}>Clasificación</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                        {[1, 2, 3, 4].map(n => (
                            <div key={n}>
                                <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                                    Categoría {n}
                                </label>
                                {n === 1 ? (
                                    <select value={form.categoria_1} onChange={e => campo('categoria_1', e.target.value)} style={inputStyle}>
                                        <option value="">— Sin categoría —</option>
                                        {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                ) : (
                                    <input value={form[`categoria_${n}`]}
                                        onChange={e => campo(`categoria_${n}`, e.target.value)}
                                        placeholder={`Nivel ${n}...`} style={inputStyle} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Activo */}
                <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="checkbox" id="activo" checked={form.activo}
                        onChange={e => campo('activo', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                    <label htmlFor="activo" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>
                        Producto activo (visible en ventas)
                    </label>
                </div>

            </div>

            {/* Error / botones */}
            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                        {error}
                    </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                        <Check size={16} /> {guardando ? 'Guardando...' : 'Guardar producto'}
                    </button>
                    <button onClick={() => setVista('lista')}
                        style={{ backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    )

    // ── LISTA ────────────────────────────────────────────────────
    return (
        <div style={{ padding: '24px' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Productos</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                        {productos.length} productos · {productos.filter(p => p.activo).length} activos
                    </p>
                </div>
                <button onClick={abrirNuevo}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Nuevo producto
                </button>
            </div>

            {exito && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={14} /> {exito}
                </div>
            )}

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" placeholder="Buscar por nombre o SKU..."
                        value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: '32px', width: '100%', boxSizing: 'border-box' }} />
                </div>
                {['Todas', ...CATEGORIAS].map(c => (
                    <button key={c} onClick={() => setFiltrocat(c)}
                        style={{
                            padding: '8px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid', cursor: 'pointer',
                            borderColor: filtrocat === c ? '#16a34a' : '#e5e7eb',
                            backgroundColor: filtrocat === c ? '#16a34a' : '#fff',
                            color: filtrocat === c ? '#fff' : '#6b7280'
                        }}>
                        {c}
                    </button>
                ))}
            </div>

            {/* Tabla */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : filtrados.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No se encontraron productos</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Producto', 'SKU', 'Tipo', 'Precio', 'Costo', 'Stock', 'Categoría', 'Estado', ''].map(h => (
                                    <th key={h} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 14px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{p.nombre}</div>
                                        {p.descripcion && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descripcion}</div>}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#6b7280' }}>{p.sku}</td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>{p.tipo_producto}</td>
                                    <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>
                                        {p.precio_venta != null ? `$${Number(p.precio_venta).toFixed(2)}` : '—'}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>
                                        {p.costo_promedio != null ? `$${Number(p.costo_promedio).toFixed(2)}` : '—'}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: p.stock_actual <= p.stock_minimo ? '#d97706' : '#1f2937' }}>
                                            {p.stock_actual ?? 0}
                                        </span>
                                        {p.stock_actual <= p.stock_minimo && <AlertTriangle size={12} style={{ color: '#d97706', marginLeft: '4px', verticalAlign: 'middle' }} />}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>{p.categoria_1 || '—'}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <button onClick={() => toggleActivo(p)}
                                            style={{
                                                padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer',
                                                backgroundColor: p.activo ? '#dcfce7' : '#f3f4f6',
                                                color: p.activo ? '#166534' : '#9ca3af'
                                            }}>
                                            {p.activo ? 'activo' : 'inactivo'}
                                        </button>
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <button onClick={() => abrirEditar(p)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                            <Pencil size={12} /> Editar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

// ─── Helpers ──────────────────────────────────────────────────
function Campo({ label, children, span = 1 }) {
    return (
        <div style={{ gridColumn: `span ${span}` }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>{label}</label>
            {children}
        </div>
    )
}

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box',
}