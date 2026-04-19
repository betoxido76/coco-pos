import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Check, Search, MapPin, X, Star } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const VACIO = {
    nombre: '', rif: '', telefono: '', email: '',
    condicion_pago: 'contado', dias_credito: 0, activo: true,
    contribuyente_especial: false, tipo_cliente_id: '',
    direccion_fiscal: '',
}

const VACIO_DIR = {
    nombre: '', direccion: '', ciudad: '', estado_region: '',
    contacto: '', telefono: '', es_principal: false, activo: true,
}

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

export default function Clientes() {
    const { perfil } = useAuth()
    const [clientes, setClientes] = useState([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [vista, setVista] = useState('lista')
    const [editando, setEditando] = useState(null)
    const [form, setForm] = useState(VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [exito, setExito] = useState('')
    const [tiposCliente, setTiposCliente] = useState([])

    // Direcciones
    const [direcciones, setDirecciones] = useState([])
    const [modalDir, setModalDir] = useState(null) // null | 'nuevo' | { id, ...}
    const [formDir, setFormDir] = useState(VACIO_DIR)
    const [guardandoDir, setGuardandoDir] = useState(false)
    const [errorDir, setErrorDir] = useState('')

    useEffect(() => {
        cargar()
        supabase.from('perfilamiento_clientes').select('id, nombre')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setTiposCliente(data || []))
    }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase.from('clientes').select('*')
            .eq('empresa_id', perfil.empresa_id).order('nombre')
        if (data) setClientes(data)
        setLoading(false)
    }

    async function cargarDirecciones(clienteId) {
        const { data } = await supabase.from('direcciones_entrega')
            .select('*')
            .eq('cliente_id', clienteId)
            .eq('empresa_id', perfil.empresa_id)
            .order('es_principal', { ascending: false })
            .order('nombre')
        if (data) setDirecciones(data)
    }

    function abrirNuevo() {
        setEditando(null); setForm(VACIO); setDirecciones([])
        setError(''); setVista('form')
    }

    function abrirEditar(c) {
        setEditando(c.id)
        setForm({
            codigo: c.codigo || '',
            nombre: c.nombre || '',
            rif: c.rif || '',
            telefono: c.telefono || '',
            email: c.email || '',
            condicion_pago: c.condicion_pago || 'contado',
            dias_credito: c.dias_credito ?? 0,
            activo: c.activo ?? true,
            contribuyente_especial: c.contribuyente_especial ?? false,
            tipo_cliente_id: c.tipo_cliente_id || '',
        })
        cargarDirecciones(c.id)
        setError(''); setVista('form')
    }

    function campo(k, v) { setForm(prev => ({ ...prev, [k]: v })) }
    function campoDir(k, v) { setFormDir(prev => ({ ...prev, [k]: v })) }

    async function guardar() {
        if (!form.nombre.trim()) { setError('El nombre es obligatorio'); return }
        setGuardando(true); setError('')

        const payload = {
            nombre: form.nombre.trim(),
            rif: form.rif.trim() || null,
            telefono: form.telefono.trim() || null,
            email: form.email.trim() || null,
            condicion_pago: form.condicion_pago,
            dias_credito: form.condicion_pago === 'credito' ? Number(form.dias_credito) : 0,
            activo: form.activo,
            contribuyente_especial: form.contribuyente_especial,
            tipo_cliente_id: form.tipo_cliente_id || null,
            direccion_fiscal: form.direccion_fiscal.trim() || null, // 👈 INCLUIR EN PAYLOAD
        }

        let nuevoClienteId = editando

        // Guardar cliente (usamos .select() para obtener el ID si es nuevo)
        const { data, error: err } = editando
            ? await supabase.from('clientes').update(payload).eq('id', editando)
            : await supabase.from('clientes').insert({ ...payload, empresa_id: perfil.empresa_id }).select()

        if (err) { setGuardando(false); setError('Error: ' + err.message); return }

        // Si es cliente nuevo, guardar también las direcciones temporales
        if (!editando && data && data.length > 0) {
            nuevoClienteId = data[0].id
            if (direcciones.length > 0) {
                // Preparamos las direcciones para insertar en BD
                const direccionesParaGuardar = direcciones.map(d => ({
                    ...d,
                    cliente_id: nuevoClienteId,
                    empresa_id: perfil.empresa_id,
                    id: undefined // Eliminamos IDs temporales si los hubiera
                }))
                await supabase.from('direcciones_entrega').insert(direccionesParaGuardar)
            }
        }

        setGuardando(false)
        setExito(editando ? 'Cliente actualizado' : 'Cliente creado')
        setTimeout(() => setExito(''), 3000)
        await cargar()
        setVista('lista')
    }

    // ── Gestión de direcciones ──
    function abrirNuevaDir() {
        setFormDir({ ...VACIO_DIR, es_principal: direcciones.length === 0 })
        setErrorDir('')
        setModalDir('nuevo')
    }

    function abrirEditarDir(dir) {
        setFormDir({
            nombre: dir.nombre || '',
            direccion: dir.direccion || '',
            ciudad: dir.ciudad || '',
            estado_region: dir.estado_region || '',
            contacto: dir.contacto || '',
            telefono: dir.telefono || '',
            es_principal: dir.es_principal,
            activo: dir.activo,
        })
        setErrorDir('')
        setModalDir(dir)
    }

    async function guardarDir() {
        if (!formDir.nombre.trim()) { setErrorDir('El nombre es obligatorio'); return }
        if (!formDir.direccion.trim()) { setErrorDir('La dirección es obligatoria'); return }

        setGuardandoDir(true); setErrorDir('')

        const payload = {
            nombre: formDir.nombre.trim(),
            direccion: formDir.direccion.trim(),
            ciudad: formDir.ciudad.trim() || null,
            estado_region: formDir.estado_region.trim() || null,
            contacto: formDir.contacto.trim() || null,
            telefono: formDir.telefono.trim() || null,
            es_principal: formDir.es_principal,
            activo: formDir.activo,
        }

        // Si es cliente NUEVO, solo agregamos a la lista local
        if (!editando) {
            setDirecciones(prev => [...prev, { ...payload, id: `temp_${Date.now()}` }]) // ID temporal
            setGuardandoDir(false)
            setModalDir(null)
            return
        }

        // Lógica normal para clientes EXISTENTES
        if (formDir.es_principal) {
            await supabase.from('direcciones_entrega')
                .update({ es_principal: false })
                .eq('cliente_id', editando)
        }

        const { error: err } = modalDir === 'nuevo'
            ? await supabase.from('direcciones_entrega').insert({ ...payload, cliente_id: editando, empresa_id: perfil.empresa_id })
            : await supabase.from('direcciones_entrega').update(payload).eq('id', modalDir.id)

        setGuardandoDir(false)
        if (err) { setErrorDir('Error: ' + err.message); return }

        await cargarDirecciones(editando)
        setModalDir(null)
    }

    async function toggleActivarDir(dir) {
        await supabase.from('direcciones_entrega')
            .update({ activo: !dir.activo })
            .eq('id', dir.id)
        await cargarDirecciones(editando)
    }

    const filtrados = clientes.filter(c =>
        c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        c.rif?.toLowerCase().includes(busqueda.toLowerCase())
    )

    // ── FORMULARIO ──
    if (vista === 'form') return (
        <div style={{ padding: '24px', maxWidth: '700px' }}> {/* Ancho aumentado un poco */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={() => setVista('lista')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{editando ? 'Editar cliente' : 'Nuevo cliente'}</h1>
            </div>

            {/* Datos del cliente */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px' }}>Datos generales</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Campo label="Nombre *" span={2}><input value={form.nombre} onChange={e => campo('nombre', e.target.value)} style={inputStyle} /></Campo>
                    <Campo label="RIF / Cédula "><input value={form.rif} onChange={e => campo('rif', e.target.value)} placeholder="J-12345678-9" style={inputStyle} /></Campo>
                    <Campo label="Teléfono "><input value={form.telefono} onChange={e => campo('telefono', e.target.value)} placeholder="0414-000-0000" style={inputStyle} /></Campo>
                    <Campo label="Email " span={2}><input type="email" value={form.email} onChange={e => campo('email', e.target.value)} placeholder="correo@empresa.com" style={inputStyle} /></Campo>

                    {/* 👈 NUEVO CAMPO: DIRECCIÓN FISCAL */}
                    <Campo label="Dirección Fiscal" span={2}>
                        <textarea
                            value={form.direccion_fiscal}
                            onChange={e => campo('direccion_fiscal', e.target.value)}
                            placeholder="Domicilio fiscal completo..."
                            rows={2}
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                        />
                    </Campo>

                    {editando && (
                        <Campo label="Código de cliente" span={2}>
                            <input value={form.codigo || '—'} disabled style={{ ...inputStyle, backgroundColor: '#f9fafb', color: '#6b7280' }} />
                        </Campo>
                    )}
                    <Campo label="Condición de pago ">
                        <select value={form.condicion_pago} onChange={e => campo('condicion_pago', e.target.value)} style={inputStyle}>
                            <option value="contado">Contado</option>
                            <option value="credito">Crédito</option>
                        </select>
                    </Campo>
                    <Campo label="Días de crédito ">
                        <input type="number" min="0" value={form.dias_credito}
                            onChange={e => campo('dias_credito', e.target.value)}
                            disabled={form.condicion_pago === 'contado'}
                            placeholder="Ej: 30"
                            style={{ ...inputStyle, backgroundColor: form.condicion_pago === 'contado' ? '#f9fafb' : '#fff', color: form.condicion_pago === 'contado' ? '#9ca3af' : '#374151' }} />
                    </Campo>
                    <Campo label="Tipo de cliente" span={2}>
                        <select value={form.tipo_cliente_id} onChange={e => campo('tipo_cliente_id', e.target.value)} style={inputStyle}>
                            <option value="">— Sin clasificar —</option>
                            {tiposCliente.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                    </Campo>
                    <div style={{ gridColumn: 'span 2', display: 'flex', gap: '20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" id="activo" checked={form.activo} onChange={e => campo('activo', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                            <label htmlFor="activo" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Cliente activo</label>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" id="contribuyente_especial" checked={form.contribuyente_especial} onChange={e => campo('contribuyente_especial', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                            <label htmlFor="contribuyente_especial" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Contribuyente Especial</label>
                        </div>
                    </div>
                </div>
            </div>

            {/* 👈 SECCIÓN DE DIRECCIONES (AHORA VISIBLE SIEMPRE) */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MapPin size={16} style={{ color: '#6b7280' }} />
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                            Direcciones de entrega
                        </p>
                    </div>
                    <button onClick={abrirNuevaDir}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={13} /> Agregar
                    </button>
                </div>

                {direcciones.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db' }}>
                        Sin direcciones registradas — agrega la primera
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {direcciones.map((dir, idx) => (
                            <div key={dir.id || idx} style={{
                                backgroundColor: dir.activo ? '#f9fafb' : '#fafafa',
                                borderRadius: '10px', border: '1px solid #e5e7eb',
                                padding: '12px 14px', opacity: dir.activo ? 1 : 0.6,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>{dir.nombre}</span>
                                            {dir.es_principal && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px', backgroundColor: '#fef9c3', color: '#854d0e', padding: '1px 7px', borderRadius: '20px', border: '1px solid #fde68a' }}>
                                                    <Star size={10} /> Principal
                                                </span>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 2px' }}>{dir.direccion}</p>
                                        {(dir.ciudad || dir.estado_region) && (
                                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 2px' }}>
                                                {[dir.ciudad, dir.estado_region].filter(Boolean).join(', ')}
                                            </p>
                                        )}
                                    </div>
                                    {/* Botones de edición solo si estamos editando un cliente existente */}
                                    {editando && (
                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                                            <button onClick={() => abrirEditarDir(dir)}
                                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Pencil size={11} /> Editar
                                            </button>
                                            <button onClick={() => toggleActivarDir(dir)}
                                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: dir.activo ? '#dc2626' : '#16a34a', cursor: 'pointer' }}>
                                                {dir.activo ? 'Desactivar' : 'Activar'}
                                            </button>
                                            {/* Opción para borrar dirección temporal */}
                                            {!editando && (
                                                <button onClick={() => setDirecciones(prev => prev.filter((_, i) => i !== idx))}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                                                    <Trash2 size={12} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                        <Check size={16} />{guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button onClick={() => setVista('lista')} style={{ backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
                </div>
            </div>

            {/* Modal de dirección (Sin cambios) */}
            {modalDir && (
                <>
                    <div onClick={() => setModalDir(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '500px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                                {modalDir === 'nuevo' ? 'Nueva dirección' : 'Editar dirección'}
                            </h3>
                            <button onClick={() => setModalDir(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                            <CampoDir label="Nombre del punto *" span={2}>
                                <input value={formDir.nombre} onChange={e => campoDir('nombre', e.target.value)} placeholder="Ej: Sede Principal" style={inputStyle} />
                            </CampoDir>
                            <CampoDir label="Dirección *" span={2}>
                                <textarea value={formDir.direccion} onChange={e => campoDir('direccion', e.target.value)} placeholder="Dirección completa" rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                            </CampoDir>
                            <CampoDir label="Ciudad ">
                                <input value={formDir.ciudad} onChange={e => campoDir('ciudad', e.target.value)} placeholder="Caracas" style={inputStyle} />
                            </CampoDir>
                            <CampoDir label="Estado ">
                                <input value={formDir.estado_region} onChange={e => campoDir('estado_region', e.target.value)} placeholder="Miranda" style={inputStyle} />
                            </CampoDir>
                            <CampoDir label="Persona de contacto ">
                                <input value={formDir.contacto} onChange={e => campoDir('contacto', e.target.value)} placeholder="Nombre del receptor" style={inputStyle} />
                            </CampoDir>
                            <CampoDir label="Teléfono de contacto ">
                                <input value={formDir.telefono} onChange={e => campoDir('telefono', e.target.value)} placeholder="0414-000-0000" style={inputStyle} />
                            </CampoDir>
                            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="checkbox" id="dir_principal" checked={formDir.es_principal} onChange={e => campoDir('es_principal', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                    <label htmlFor="dir_principal" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Dirección principal</label>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="checkbox" id="dir_activa" checked={formDir.activo} onChange={e => campoDir('activo', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                    <label htmlFor="dir_activa" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Activa</label>
                                </div>
                            </div>
                        </div>

                        {errorDir && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{errorDir}</div>}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={guardarDir} disabled={guardandoDir}
                                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoDir ? 0.6 : 1 }}>
                                <Check size={16} /> {guardandoDir ? 'Guardando...' : 'Guardar dirección'}
                            </button>
                            <button onClick={() => setModalDir(null)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )

    // ── LISTA ──
    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Clientes</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>{clientes.length} clientes registrados</p>
                </div>
                <button onClick={abrirNuevo}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Nuevo cliente
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
                                {['Código', 'Nombre', 'RIF', 'Teléfono', 'Condición', 'Días crédito', 'Estado', ''].map(h => (
                                    <th key={h} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map(c => (
                                <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', fontFamily: 'monospace', color: '#6b7280' }}>{c.codigo || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{c.nombre}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', fontFamily: 'monospace' }}>{c.rif || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{c.telefono || '—'}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, backgroundColor: c.condicion_pago === 'credito' ? '#dbeafe' : '#f3f4f6', color: c.condicion_pago === 'credito' ? '#1e40af' : '#6b7280' }}>
                                            {c.condicion_pago || 'contado'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'center' }}>
                                        {c.condicion_pago === 'credito' ? `${c.dias_credito} días` : '—'}
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, backgroundColor: c.activo ? '#dcfce7' : '#f3f4f6', color: c.activo ? '#166534' : '#9ca3af' }}>
                                            {c.activo ? 'activo' : 'inactivo'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <button onClick={() => abrirEditar(c)}
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

function CampoDir({ label, children, span = 1 }) {
    return (
        <div style={{ gridColumn: `span ${span}` }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>{label}</label>
            {children}
        </div>
    )
}
