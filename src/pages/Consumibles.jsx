import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Search, Pencil, Check, AlertTriangle, ToggleLeft, ToggleRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const UNIDADES = ['unidad', 'kg', 'g', 'litro', 'ml', 'caja', 'rollo', 'par', 'juego', 'otro']

const VACIO = {
    nombre: '', codigo: '', descripcion: '', unidad_medida: 'unidad',
    costo_compra_promedio: '', stock_actual: '', stock_minimo: '',
    categoria_1: '', categoria_2: '', categoria_3: '', categoria_4: '',
    aplica_iva: true, activo: true
}

export default function Consumibles() {
    const { perfil } = useAuth()
    const [items, setItems] = useState([])
    const [proveedores, setProveedores] = useState([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [filtrocat, setFiltrocat] = useState('Todas')
    const [vista, setVista] = useState('lista')
    const [editando, setEditando] = useState(null)
    const [form, setForm] = useState(VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [exito, setExito] = useState('')

    useEffect(() => {
        cargar()
        supabase.from('proveedores').select('id, nombre')
            .eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setProveedores(data || []))
    }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase.from('consumibles').select('*')
            .eq('empresa_id', perfil.empresa_id).order('nombre')
        if (data) setItems(data)
        setLoading(false)
    }

    function abrirNuevo() {
        setEditando(null); setForm(VACIO); setError(''); setVista('form')
    }

    function abrirEditar(item) {
        setEditando(item.id)
        setForm({
            nombre: item.nombre || '',
            codigo: item.codigo || '',
            descripcion: item.descripcion || '',
            unidad_medida: item.unidad_medida || 'unidad',
            costo_compra_promedio: item.costo_compra_promedio ?? '',
            stock_actual: item.stock_actual ?? '',
            stock_minimo: item.stock_minimo ?? '',
            categoria_1: item.categoria_1 || '',
            categoria_2: item.categoria_2 || '',
            categoria_3: item.categoria_3 || '',
            categoria_4: item.categoria_4 || '',
            aplica_iva: item.aplica_iva ?? true,
            activo: item.activo ?? true
        })
        setError(''); setVista('form')
    }

    function campo(key, valor) { setForm(prev => ({ ...prev, [key]: valor })) }

    async function guardar() {
        if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
        setGuardando(true); setError('')

        const payload = {
            nombre: form.nombre.trim(),
            codigo: form.codigo.trim() || null,
            descripcion: form.descripcion.trim() || null,
            unidad_medida: form.unidad_medida,
            costo_compra_promedio: form.costo_compra_promedio !== '' ? Number(form.costo_compra_promedio) : null,
            stock_actual: form.stock_actual !== '' ? Number(form.stock_actual) : 0,
            stock_minimo: form.stock_minimo !== '' ? Number(form.stock_minimo) : 0,
            categoria_1: form.categoria_1 || null,
            categoria_2: form.categoria_2 || null,
            categoria_3: form.categoria_3 || null,
            categoria_4: form.categoria_4 || null,
            aplica_iva: form.aplica_iva,
            activo: form.activo
        }

        let err
        if (editando) {
            ; ({ error: err } = await supabase.from('consumibles').update(payload).eq('id', editando))
        } else {
            ; ({ error: err } = await supabase.from('consumibles').insert({ ...payload, empresa_id: perfil.empresa_id }))
        }

        setGuardando(false)
        if (err) { setError(err.code === '23505' ? `El código "${payload.codigo}" ya existe en el catálogo. Por favor elige otro código.` : 'Error al guardar: ' + err.message); return }

        setExito(editando ? 'Consumible actualizado' : 'Consumible creado')
        setTimeout(() => setExito(''), 3000)
        await cargar()
        setVista('lista')
    }

    async function toggleActivo(item) {
        await supabase.from('consumibles').update({ activo: !item.activo }).eq('id', item.id)
        cargar()
    }

    const categorias = [...new Set(items.filter(p => p.categoria_1).map(p => p.categoria_1))].sort()

    const filtrados = items.filter(p => {
        const q = busqueda.toLowerCase()
        const coincide = p.nombre.toLowerCase().includes(q) || p.codigo?.toLowerCase().includes(q)
        const cat = filtrocat === 'Todas' || p.categoria_1 === filtrocat
        return coincide && cat
    })

    const criticos = items.filter(i => i.activo && i.stock_actual <= i.stock_minimo).length

    // ── FORMULARIO ──────────────────────────────────────────────
    if (vista === 'form') return (
        <div style={{ padding: '24px', maxWidth: '760px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={() => setVista('lista')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>
                    ← Volver
                </button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                    {editando ? 'Editar consumible' : 'Nuevo consumible'}
                </h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                <Campo label="Nombre *" span={2}>
                    <input value={form.nombre} onChange={e => campo('nombre', e.target.value)}
                        placeholder="Ej: Guantes de nitrilo" style={inputStyle} />
                </Campo>

                <Campo label="Código">
                    <input value={form.codigo} onChange={e => campo('codigo', e.target.value)}
                        placeholder="Ej: CON-001" style={inputStyle} />
                </Campo>

                <Campo label="Unidad de medida">
                    <select value={form.unidad_medida} onChange={e => campo('unidad_medida', e.target.value)} style={inputStyle}>
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </Campo>

                <Campo label="Descripción" span={2}>
                    <textarea value={form.descripcion} onChange={e => campo('descripcion', e.target.value)}
                        rows={2} placeholder="Descripción opcional..." style={{ ...inputStyle, resize: 'vertical' }} />
                </Campo>

                <Campo label="Costo de compra promedio ($)">
                    <input type="number" min="0" step="0.01" value={form.costo_compra_promedio}
                        onChange={e => campo('costo_compra_promedio', e.target.value)}
                        placeholder="0.00" style={inputStyle} />
                </Campo>

                <Campo label="Proveedor preferido">
                    <select value={form.proveedor_preferido_id} onChange={e => campo('proveedor_preferido_id', e.target.value)} style={inputStyle}>
                        <option value="">— Sin asignar —</option>
                        {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                </Campo>

                <Campo label="Stock actual">
                    <input type="number" min="0" value={form.stock_actual}
                        onChange={e => campo('stock_actual', e.target.value)}
                        placeholder="0" style={inputStyle} />
                </Campo>

                <Campo label="Stock mínimo (alerta)">
                    <input type="number" min="0" value={form.stock_minimo}
                        onChange={e => campo('stock_minimo', e.target.value)}
                        placeholder="0" style={inputStyle} />
                </Campo>

                <div style={{ gridColumn: 'span 2' }}>
                    <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', marginBottom: '10px' }}>Clasificación</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                        {[1, 2, 3, 4].map(n => (
                            <div key={n}>
                                <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>
                                    Categoría {n}
                                </label>
                                {n === 1 ? (
                                    <>
                                        <input list="cats-con" value={form.categoria_1}
                                            onChange={e => campo('categoria_1', e.target.value)}
                                            placeholder="Escribe o selecciona..." style={inputStyle} />
                                        <datalist id="cats-con">
                                            {categorias.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </>
                                ) : (
                                    <input value={form[`categoria_${n}`]}
                                        onChange={e => campo(`categoria_${n}`, e.target.value)}
                                        placeholder={`Nivel ${n}...`} style={inputStyle} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="checkbox" id="activo" checked={form.activo}
                        onChange={e => campo('activo', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                    <label htmlFor="activo" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>
                        Consumible activo (visible en compras e inventario)
                    </label>
                </div>

                <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                    <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Aplica IVA (16%)</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Activa si este consumible está gravado con IVA</div>
                    </div>
                    <input type="checkbox" checked={form.aplica_iva}
                        onChange={e => campo('aplica_iva', e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: 'pointer' }} />
                </div>

            </div>

            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                        {error}
                    </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                        <Check size={16} /> {guardando ? 'Guardando...' : 'Guardar'}
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
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Consumibles</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                        {items.length} registros · {items.filter(i => i.activo).length} activos
                        {criticos > 0 && <span style={{ color: '#d97706', marginLeft: '8px' }}>· {criticos} con stock bajo</span>}
                    </p>
                </div>
                <button onClick={abrirNuevo}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Nuevo consumible
                </button>
            </div>

            {exito && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Check size={14} /> {exito}
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" placeholder="Buscar por nombre o código..."
                        value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        style={{ ...inputStyle, paddingLeft: '32px', width: '100%', boxSizing: 'border-box' }} />
                </div>
                {categorias.length > 0 && (
                    <select value={filtrocat} onChange={e => setFiltrocat(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                        <option value="Todas">Todas las categorías</option>
                        {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                )}
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : filtrados.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay consumibles registrados</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Nombre', 'Código', 'Unidad', 'Costo', 'Stock', 'Mín.', 'IVA', 'Categoría', 'Estado', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map(item => (
                                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 14px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{item.nombre}</div>
                                        {item.descripcion && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.descripcion}</div>}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', fontFamily: 'monospace', color: '#6b7280' }}>{item.codigo || '—'}</td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>{item.unidad_medida}</td>
                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>
                                        {item.costo_compra_promedio ? `$${Number(item.costo_compra_promedio).toFixed(2)}` : '—'}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: item.stock_actual <= item.stock_minimo ? '#d97706' : '#1f2937' }}>
                                            {item.stock_actual ?? 0}
                                        </span>
                                        {item.stock_actual <= item.stock_minimo && <AlertTriangle size={12} style={{ color: '#d97706', marginLeft: '4px', verticalAlign: 'middle' }} />}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#9ca3af' }}>{item.stock_minimo}</td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                        <span style={{ fontSize: '11px', backgroundColor: item.aplica_iva ? '#dcfce7' : '#f3f4f6', color: item.aplica_iva ? '#166534' : '#6b7280', padding: '2px 8px', borderRadius: '20px' }}>
                                            {item.aplica_iva ? 'Sí' : 'No'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>{item.categoria_1 || '—'}</td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <button onClick={() => toggleActivo(item)}
                                            style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer', backgroundColor: item.activo ? '#dcfce7' : '#f3f4f6', color: item.activo ? '#166534' : '#9ca3af' }}>
                                            {item.activo ? 'activo' : 'inactivo'}
                                        </button>
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <button onClick={() => abrirEditar(item)}
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