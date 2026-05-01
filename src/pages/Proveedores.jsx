import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Check, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const VACIO = {
    nombre: '', rif: '', telefono: '', contacto: '', tipo: '', codigo: '', activo: true, direccion_fiscal: '',
    condicion_pago: 'contado', dias_credito: 0,
}

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

export default function Proveedores() {
    const { perfil } = useAuth()
    const [proveedores, setProveedores] = useState([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [vista, setVista] = useState('lista')
    const [editando, setEditando] = useState(null)
    const [form, setForm] = useState(VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [exito, setExito] = useState('')

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase.from('proveedores').select('*')
            .eq('empresa_id', perfil.empresa_id).order('nombre')
        if (data) setProveedores(data)
        setLoading(false)
    }

    function abrirNuevo() {
        setEditando(null); setForm(VACIO); setError(''); setVista('form')
    }

    function abrirEditar(p) {
        setEditando(p.id)
        setForm({
            nombre: p.nombre || '',
            rif: p.rif || '',
            telefono: p.telefono || '',
            contacto: p.contacto || '',
            direccion_fiscal: p.direccion_fiscal || '',
            tipo: p.tipo || '',
            codigo: p.codigo || '',
            activo: p.activo ?? true,
            condicion_pago: p.condicion_pago || 'contado',
            dias_credito: p.dias_credito || 0,
        })
        setError(''); setVista('form')
    }

    function campo(k, v) { setForm(prev => ({ ...prev, [k]: v })) }

    async function guardar() {
        if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
        setGuardando(true); setError('')
        const payload = {
            nombre: form.nombre.trim(),
            rif: form.rif.trim() || null,
            telefono: form.telefono.trim() || null,
            contacto: form.contacto.trim() || null,
            direccion_fiscal: form.direccion_fiscal.trim() || null,
            tipo: form.tipo || null,
            activo: form.activo,
            condicion_pago: form.condicion_pago,
            dias_credito: form.condicion_pago === 'credito' ? (form.dias_credito || 0) : 0,
        }
        const { error: err } = editando
            ? await supabase.from('proveedores').update(payload).eq('id', editando)
            : await supabase.from('proveedores').insert({ ...payload, empresa_id: perfil.empresa_id })
        setGuardando(false)
        if (err) { setError('Error: ' + err.message); return }
        setExito(editando ? 'Proveedor actualizado' : 'Proveedor creado')
        setTimeout(() => setExito(''), 3000)
        await cargar(); setVista('lista')
    }

    const filtrados = proveedores.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.rif?.toLowerCase().includes(busqueda.toLowerCase())
    )

    // ── FORMULARIO ──
    if (vista === 'form') return (
        <div style={{ padding: '24px', maxWidth: '600px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={() => setVista('lista')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{editando ? 'Editar proveedor' : 'Nuevo proveedor'}</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Campo label="Nombre *" span={2}><input value={form.nombre} onChange={e => campo('nombre', e.target.value)} style={inputStyle} /></Campo>
                <Campo label="RIF / Cédula"><input value={form.rif} onChange={e => campo('rif', e.target.value)} placeholder="J-12345678-9" style={inputStyle} /></Campo>
                <Campo label="Teléfono"><input value={form.telefono} onChange={e => campo('telefono', e.target.value)} placeholder="0212-000-0000" style={inputStyle} /></Campo>
                <Campo label="Persona de contacto" span={2}><input value={form.contacto} onChange={e => campo('contacto', e.target.value)} placeholder="Nombre del contacto" style={inputStyle} /></Campo>
                <Campo label="Dirección Fiscal" span={2}>
                    <textarea
                        value={form.direccion_fiscal}
                        onChange={e => campo('direccion_fiscal', e.target.value)}
                        placeholder="Dirección completa para facturación / domicilio fiscal..."
                        rows={2}
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                    />
                </Campo>
                <Campo label="Tipo de proveedor" span={2}>
                    <select value={form.tipo} onChange={e => campo('tipo', e.target.value)} style={inputStyle}>
                        <option value="">— Sin clasificar —</option>
                        <option value="producto_terminado">Producto terminado</option>
                        <option value="materia_prima">Materia prima</option>
                        <option value="material_empaque">Material de empaque</option>
                        <option value="consumibles">Consumibles</option>
                        <option value="servicios">Servicios</option>
                    </select>
                </Campo>

                <Campo label="Condición de pago" span={2}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {['contado', 'credito'].map(c => (
                            <button key={c} type="button" onClick={() => campo('condicion_pago', c)}
                                style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid', cursor: 'pointer', borderColor: form.condicion_pago === c ? '#16a34a' : '#e5e7eb', backgroundColor: form.condicion_pago === c ? '#f0fdf4' : '#fff', color: form.condicion_pago === c ? '#16a34a' : '#6b7280' }}>
                                {c.charAt(0).toUpperCase() + c.slice(1)}
                            </button>
                        ))}
                    </div>
                </Campo>
                {form.condicion_pago === 'credito' && (
                    <Campo label="Días de crédito" span={2}>
                        <input type="number" min="1" value={form.dias_credito} onChange={e => campo('dias_credito', Number(e.target.value))} style={inputStyle} />
                    </Campo>
                )}

                <Campo label="Código" span={2}>
                    <input value={form.codigo || 'Se genera automáticamente'} disabled
                        style={{ ...inputStyle, backgroundColor: '#f9fafb', color: '#6b7280' }} />
                </Campo>

                <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="checkbox" id="activo" checked={form.activo} onChange={e => campo('activo', e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                    <label htmlFor="activo" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Proveedor activo</label>
                </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                        <Check size={16} />{guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={() => setVista('lista')} style={{ backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
                </div>
            </div>
        </div>
    )

    // ── LISTA ──
    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Proveedores</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>{proveedores.length} proveedores registrados</p>
                </div>
                <button onClick={abrirNuevo}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Nuevo proveedor
                </button>
            </div>

            {exito && <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', marginBottom: '16px' }}>{exito}</div>}

            <div style={{ position: 'relative', marginBottom: '16px', maxWidth: '360px' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input type="text" placeholder="Buscar por nombre o RIF..."
                    value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: '32px' }} />
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Código', 'Nombre', 'RIF', 'Tipo', 'Condición', 'Teléfono', 'Contacto', 'Estado', ''].map(h => (
                                    <th key={h} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: '#6b7280' }}>{p.codigo || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{p.nombre}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>{p.rif || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280' }}>
                                        {p.tipo ? p.tipo.replace(/_/g, ' ') : '—'}
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, backgroundColor: p.condicion_pago === 'credito' ? '#dbeafe' : '#f3f4f6', color: p.condicion_pago === 'credito' ? '#1e40af' : '#6b7280' }}>
                                            {p.condicion_pago === 'credito' ? `crédito ${p.dias_credito || 0}d` : 'contado'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.telefono || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.contacto || '—'}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{
                                            padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500,
                                            backgroundColor: p.activo ? '#dcfce7' : '#f3f4f6',
                                            color: p.activo ? '#166534' : '#9ca3af'
                                        }}>
                                            {p.activo ? 'activo' : 'inactivo'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
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

function Campo({ label, children, span = 1 }) {
    return (
        <div style={{ gridColumn: `span ${span}` }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>{label}</label>
            {children}
        </div>
    )
}
