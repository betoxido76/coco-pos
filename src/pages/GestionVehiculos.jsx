import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Search, Pencil, Trash2, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const VACIO = { marca: '', modelo: '', submodelo: '', tipo: '' }
const TIPOS = ['sedan', 'camioneta', 'SUV', 'moto', 'camión', 'van', 'otro']

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

export default function GestionVehiculos() {
    const { perfil } = useAuth()
    const [vehiculos, setVehiculos] = useState([])
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
        const { data } = await supabase.from('vehiculos')
            .select('*').eq('empresa_id', perfil.empresa_id)
            .order('marca').order('modelo')
        if (data) setVehiculos(data)
        setLoading(false)
    }

    function abrirNuevo() {
        setEditando(null); setForm(VACIO); setError(''); setVista('form')
    }

    function abrirEditar(v) {
        setEditando(v.id)
        setForm({ marca: v.marca || '', modelo: v.modelo || '', submodelo: v.submodelo || '', tipo: v.tipo || '' })
        setError(''); setVista('form')
    }

    async function guardar() {
        if (!form.marca.trim()) { setError('La marca es obligatoria'); return }
        if (!form.modelo.trim()) { setError('El modelo es obligatorio'); return }
        setGuardando(true); setError('')
        const payload = {
            marca: form.marca.trim(), modelo: form.modelo.trim(),
            submodelo: form.submodelo.trim() || null, tipo: form.tipo || null,
        }
        const { error: err } = editando
            ? await supabase.from('vehiculos').update(payload).eq('id', editando)
            : await supabase.from('vehiculos').insert({ ...payload, empresa_id: perfil.empresa_id })
        setGuardando(false)
        if (err) { setError('Error: ' + err.message); return }
        setExito(editando ? 'Vehículo actualizado' : 'Vehículo registrado')
        setTimeout(() => setExito(''), 3000)
        await cargar(); setVista('lista')
    }

    async function eliminar(v) {
        if (!window.confirm(`¿Eliminar ${v.marca} ${v.modelo}? Se perderán las compatibilidades asociadas a este vehículo.`)) return
        await supabase.from('vehiculos').delete().eq('id', v.id)
        cargar()
    }

    const filtrados = vehiculos.filter(v =>
        v.marca.toLowerCase().includes(busqueda.toLowerCase()) ||
        v.modelo.toLowerCase().includes(busqueda.toLowerCase()) ||
        (v.submodelo || '').toLowerCase().includes(busqueda.toLowerCase())
    )

    const marcasUnicas = [...new Set(vehiculos.map(v => v.marca))].sort()

    if (vista === 'form') return (
        <div style={{ padding: '24px', maxWidth: '560px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={() => setVista('lista')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{editando ? 'Editar vehículo' : 'Nuevo vehículo'}</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Marca *</label>
                    <input value={form.marca} onChange={e => setForm(p => ({ ...p, marca: e.target.value }))}
                        placeholder="Toyota, Chevrolet, Ford..." style={inputStyle} />
                </div>
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Modelo *</label>
                    <input value={form.modelo} onChange={e => setForm(p => ({ ...p, modelo: e.target.value }))}
                        placeholder="Corolla, Spark, F-150..." style={inputStyle} />
                </div>
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        Submódelo <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opcional)</span>
                    </label>
                    <input value={form.submodelo} onChange={e => setForm(p => ({ ...p, submodelo: e.target.value }))}
                        placeholder="LE, SE, LTZ..." style={inputStyle} />
                </div>
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Tipo</label>
                    <select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))} style={inputStyle}>
                        <option value="">— Sin clasificar —</option>
                        {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            {error && <div style={{ marginTop: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}

            <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <button onClick={guardar} disabled={guardando}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                    <Check size={16} />{guardando ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => setVista('lista')}
                    style={{ backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>
                    Cancelar
                </button>
            </div>
        </div>
    )

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Catálogo de Vehículos</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                        {vehiculos.length} vehículos · {marcasUnicas.length} marcas
                    </p>
                </div>
                <button onClick={abrirNuevo}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Nuevo vehículo
                </button>
            </div>

            {exito && <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', marginBottom: '16px' }}>{exito}</div>}

            <div style={{ position: 'relative', marginBottom: '16px', maxWidth: '360px' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input type="text" placeholder="Buscar por marca o modelo..."
                    value={busqueda} onChange={e => setBusqueda(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: '32px' }} />
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : filtrados.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                        {busqueda ? 'Sin resultados para esa búsqueda' : 'No hay vehículos registrados. Agrega el primero o se crearán automáticamente al guardar compatibilidades en Productos.'}
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Marca', 'Modelo', 'Submódelo', 'Tipo', ''].map(h => (
                                    <th key={h} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map(v => (
                                <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{v.marca}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{v.modelo}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{v.submodelo || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280', textTransform: 'capitalize' }}>{v.tipo || '—'}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button onClick={() => abrirEditar(v)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                <Pencil size={12} /> Editar
                                            </button>
                                            <button onClick={() => eliminar(v)}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}>
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
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
