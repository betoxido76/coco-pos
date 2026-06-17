import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Check, Search, MapPin, X, Star, Trash2, AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const VACIO = {
    nombre: '', rif: '', telefono: '', email: '',
    descripcion: '',
    condicion_pago: 'contado', dias_credito: 0, limite_credito: 0, activo: true,
    contribuyente_especial: false, tipo_cliente_id: '',
    direccion_fiscal: '',
    cat1_id: '', cat2_id: '', cat3_id: '', cat4_id: '',
    contacto_comercial: '', email_comercial: '', telefono_comercial: '',
    contacto_administrativo: '', email_administrativo: '', telefono_administrativo: '',
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
    const [vista, setVista] = useState('lista') // 'lista' | 'form' | 'categorias'
    const [editando, setEditando] = useState(null)
    const [form, setForm] = useState(VACIO)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [exito, setExito] = useState('')
    const [tiposCliente, setTiposCliente] = useState([])
    const [tab, setTab] = useState('clientes') // 'clientes' | 'categorias'

    // Categorías
    const [categorias, setCategorias] = useState([]) // todas las categorías planas
    const [cats1, setCats1] = useState([])
    const [cats2, setCats2] = useState([])
    const [cats3, setCats3] = useState([])
    const [cats4, setCats4] = useState([])

    // Listas de precio
    const [listasEmpresa, setListasEmpresa] = useState([])
    const [listasSeleccionadas, setListasSeleccionadas] = useState(new Set())
    const [listaDefaultId, setListaDefaultId] = useState('')

    // Direcciones
    const [direcciones, setDirecciones] = useState([])
    const [modalDir, setModalDir] = useState(null)
    const [formDir, setFormDir] = useState(VACIO_DIR)
    const [guardandoDir, setGuardandoDir] = useState(false)
    const [errorDir, setErrorDir] = useState('')

    useEffect(() => {
        cargar()
        supabase.from('perfilamiento_clientes').select('id, nombre')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setTiposCliente(data || []))
        cargarCategorias()
        supabase.from('listas_precio').select('id, nombre, es_default')
            .eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setListasEmpresa(data || []))
    }, [])

    async function cargarCategorias() {
        const { data } = await supabase.from('categorias_clientes')
            .select('id, nombre, nivel, padre_id, activo')
            .eq('empresa_id', perfil.empresa_id)
            .eq('activo', true)
            .order('nivel').order('nombre')
        if (data) {
            setCategorias(data)
            setCats1(data.filter(c => c.nivel === 1))
            setCats2(data.filter(c => c.nivel === 2))
            setCats3(data.filter(c => c.nivel === 3))
            setCats4(data.filter(c => c.nivel === 4))
        }
    }

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
        setListasSeleccionadas(new Set()); setListaDefaultId('')
        setError(''); setVista('form')
    }

    async function abrirEditar(c) {
        setEditando(c.id)
        setForm({
            codigo: c.codigo || '',
            nombre: c.nombre || '',
            rif: c.rif || '',
            telefono: c.telefono || '',
            email: c.email || '',
            descripcion: c.descripcion || '',
            condicion_pago: c.condicion_pago || 'contado',
            dias_credito: c.dias_credito ?? 0,
            limite_credito: c.limite_credito ?? 0,
            activo: c.activo ?? true,
            contribuyente_especial: c.contribuyente_especial ?? false,
            tipo_cliente_id: c.tipo_cliente_id || '',
            direccion_fiscal: c.direccion_fiscal || '',
            cat1_id: c.cat1_id || '',
            cat2_id: c.cat2_id || '',
            cat3_id: c.cat3_id || '',
            cat4_id: c.cat4_id || '',
            contacto_comercial: c.contacto_comercial || '',
            email_comercial: c.email_comercial || '',
            telefono_comercial: c.telefono_comercial || '',
            contacto_administrativo: c.contacto_administrativo || '',
            email_administrativo: c.email_administrativo || '',
            telefono_administrativo: c.telefono_administrativo || '',
        })
        cargarDirecciones(c.id)

        const { data: listasCli } = await supabase.from('cliente_listas_precio')
            .select('lista_precio_id, es_default')
            .eq('cliente_id', c.id).eq('empresa_id', perfil.empresa_id)
        if (listasCli && listasCli.length > 0) {
            setListasSeleccionadas(new Set(listasCli.map(l => l.lista_precio_id)))
            const def = listasCli.find(l => l.es_default)
            setListaDefaultId(def?.lista_precio_id || '')
        } else {
            setListasSeleccionadas(new Set())
            setListaDefaultId('')
        }

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
            descripcion: form.descripcion.trim() || null,
            condicion_pago: form.condicion_pago,
            dias_credito: form.condicion_pago === 'credito' ? Number(form.dias_credito) : 0,
            limite_credito: Number(form.limite_credito) || 0,
            activo: form.activo,
            contribuyente_especial: form.contribuyente_especial,
            tipo_cliente_id: form.tipo_cliente_id || null,
            direccion_fiscal: form.direccion_fiscal.trim() || null,
            cat1_id: form.cat1_id || null,
            cat2_id: form.cat2_id || null,
            cat3_id: form.cat3_id || null,
            cat4_id: form.cat4_id || null,
            contacto_comercial: form.contacto_comercial.trim() || null,
            email_comercial: form.email_comercial.trim() || null,
            telefono_comercial: form.telefono_comercial.trim() || null,
            contacto_administrativo: form.contacto_administrativo.trim() || null,
            email_administrativo: form.email_administrativo.trim() || null,
            telefono_administrativo: form.telefono_administrativo.trim() || null,
        }

        let nuevoClienteId = editando

        // Guardar cliente (usamos .select() para obtener el ID si es nuevo)
        const { data, error: err } = editando
            ? await supabase.from('clientes').update(payload).eq('id', editando)
            : await supabase.from('clientes').insert({ ...payload, empresa_id: perfil.empresa_id }).select()

        if (err) { setGuardando(false); setError('Error: ' + err.message); return }

        // Si es cliente nuevo, guardar también las direcciones temporales
        if (!editando) {
            // El INSERT puede persistir aunque .select() devuelva vacío (RLS/PostgREST).
            // Si no recuperamos el id, no podemos asociar las direcciones: avisamos en vez de perderlas en silencio.
            nuevoClienteId = data && data.length > 0 ? data[0].id : null
            if (!nuevoClienteId) {
                setGuardando(false)
                setError('El cliente se guardó pero no se pudo recuperar su ID; abre el cliente para agregar la dirección de entrega.')
                await cargar()
                return
            }
            if (direcciones.length > 0) {
                // Preparamos las direcciones para insertar en BD
                const direccionesParaGuardar = direcciones.map(d => ({
                    ...d,
                    cliente_id: nuevoClienteId,
                    empresa_id: perfil.empresa_id,
                    id: undefined // Eliminamos IDs temporales si los hubiera
                }))
                const { error: errDir } = await supabase.from('direcciones_entrega').insert(direccionesParaGuardar)
                if (errDir) {
                    setGuardando(false)
                    setError('El cliente se guardó pero falló el guardado de direcciones: ' + errDir.message)
                    await cargar()
                    return
                }
            }
        }

        // Guardar listas de precio asignadas
        const clienteIdFinal = editando || nuevoClienteId
        if (clienteIdFinal) {
            if (editando) {
                await supabase.from('cliente_listas_precio').delete().eq('cliente_id', clienteIdFinal)
            }
            if (listasSeleccionadas.size > 0) {
                await supabase.from('cliente_listas_precio').insert(
                    Array.from(listasSeleccionadas).map(lid => ({
                        empresa_id: perfil.empresa_id,
                        cliente_id: clienteIdFinal,
                        lista_precio_id: lid,
                        es_default: lid === listaDefaultId,
                    }))
                )
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

    const filtrados = clientes.filter(c => {
        const q = busqueda.toLowerCase()
        return (
            c.nombre.toLowerCase().includes(q) ||
            c.rif?.toLowerCase().includes(q) ||
            c.descripcion?.toLowerCase().includes(q)
        )
    })

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

                    <Campo label="Descripción" span={2}>
                        <textarea
                            value={form.descripcion}
                            onChange={e => campo('descripcion', e.target.value)}
                            placeholder="Breve descripción del cliente, sector, observaciones generales..."
                            rows={2}
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                        />
                    </Campo>

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
                    <Campo label="Límite de crédito (USD) ">
                        <input type="number" min="0" step="0.01" value={form.limite_credito}
                            onChange={e => campo('limite_credito', e.target.value)}
                            placeholder="Ej: 5000"
                            style={inputStyle} />
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

            {/* Contactos */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px' }}>Contactos</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div style={{ gridColumn: 'span 2', fontSize: '12px', fontWeight: 600, color: '#374151', borderBottom: '1px solid #f3f4f6', paddingBottom: '6px' }}>Contacto Comercial</div>
                    <Campo label="Nombre"><input value={form.contacto_comercial} onChange={e => campo('contacto_comercial', e.target.value)} placeholder="Nombre del contacto comercial" style={inputStyle} /></Campo>
                    <Campo label="Teléfono"><input value={form.telefono_comercial} onChange={e => campo('telefono_comercial', e.target.value)} placeholder="0414-000-0000" style={inputStyle} /></Campo>
                    <Campo label="Email" span={2}><input type="email" value={form.email_comercial} onChange={e => campo('email_comercial', e.target.value)} placeholder="comercial@empresa.com" style={inputStyle} /></Campo>

                    <div style={{ gridColumn: 'span 2', fontSize: '12px', fontWeight: 600, color: '#374151', borderBottom: '1px solid #f3f4f6', paddingBottom: '6px', marginTop: '8px' }}>Contacto Administrativo</div>
                    <Campo label="Nombre"><input value={form.contacto_administrativo} onChange={e => campo('contacto_administrativo', e.target.value)} placeholder="Nombre del contacto administrativo" style={inputStyle} /></Campo>
                    <Campo label="Teléfono"><input value={form.telefono_administrativo} onChange={e => campo('telefono_administrativo', e.target.value)} placeholder="0414-000-0000" style={inputStyle} /></Campo>
                    <Campo label="Email" span={2}><input type="email" value={form.email_administrativo} onChange={e => campo('email_administrativo', e.target.value)} placeholder="admin@empresa.com" style={inputStyle} /></Campo>
                </div>
            </div>

            {/* Clasificación por categorías */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px' }}>Clasificación</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                    {[
                        { label: 'Categoría 1', key: 'cat1_id', lista: cats1 },
                        { label: 'Categoría 2', key: 'cat2_id', lista: cats2 },
                        { label: 'Categoría 3', key: 'cat3_id', lista: cats3 },
                        { label: 'Categoría 4', key: 'cat4_id', lista: cats4 },
                    ].map(({ label, key, lista }) => (
                        <div key={key}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>{label}</label>
                            <select value={form[key]} onChange={e => campo(key, e.target.value)} style={inputStyle}>
                                <option value="">— Sin categoría —</option>
                                {lista.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                            {lista.length === 0 && (
                                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>
                                    Sin opciones — agrega en la pestaña Categorías
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Listas de precio */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Listas de precio</p>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 14px' }}>
                    Marca las listas disponibles para este cliente. La marcada como default se pre-selecciona en ventas y pedidos.
                </p>
                {listasEmpresa.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Sin listas de precio configuradas.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {listasEmpresa.map(l => {
                            const checked = listasSeleccionadas.has(l.id)
                            const isDefault = listaDefaultId === l.id
                            return (
                                <div key={l.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '12px',
                                    padding: '10px 14px', borderRadius: '8px',
                                    backgroundColor: checked ? '#f0fdf4' : '#f9fafb',
                                    border: `1px solid ${checked ? '#bbf7d0' : '#e5e7eb'}`,
                                }}>
                                    <input type="checkbox" id={`lista_${l.id}`} checked={checked}
                                        onChange={e => {
                                            const next = new Set(listasSeleccionadas)
                                            if (e.target.checked) next.add(l.id)
                                            else { next.delete(l.id); if (listaDefaultId === l.id) setListaDefaultId('') }
                                            setListasSeleccionadas(next)
                                        }}
                                        style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }} />
                                    <label htmlFor={`lista_${l.id}`} style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: '#1f2937', cursor: 'pointer' }}>
                                        {l.nombre}
                                        {l.es_default && <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>(global default)</span>}
                                    </label>
                                    {checked && (
                                        <button type="button" onClick={() => setListaDefaultId(isDefault ? '' : l.id)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                                                border: '1px solid', cursor: 'pointer',
                                                borderColor: isDefault ? '#16a34a' : '#d1d5db',
                                                backgroundColor: isDefault ? '#16a34a' : '#fff',
                                                color: isDefault ? '#fff' : '#9ca3af',
                                            }}>
                                            {isDefault ? '★ Default' : '☆ Default'}
                                        </button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
                {listasSeleccionadas.size === 0 && listasEmpresa.length > 0 && (
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '10px 0 0' }}>
                        Sin listas asignadas — se mostrarán todas las listas disponibles al crear ventas o pedidos.
                    </p>
                )}
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
                                    {/* Cliente existente: editar / activar. Cliente nuevo: quitar dirección temporal */}
                                    {editando ? (
                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                                            <button onClick={() => abrirEditarDir(dir)}
                                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <Pencil size={11} /> Editar
                                            </button>
                                            <button onClick={() => toggleActivarDir(dir)}
                                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: dir.activo ? '#dc2626' : '#16a34a', cursor: 'pointer' }}>
                                                {dir.activo ? 'Desactivar' : 'Activar'}
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '12px' }}>
                                            <button onClick={() => setDirecciones(prev => prev.filter((_, i) => i !== idx))}
                                                title="Quitar dirección"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                                                <Trash2 size={12} />
                                            </button>
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
                {tab === 'clientes' && (
                    <button onClick={abrirNuevo}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={16} /> Nuevo cliente
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'clientes', label: 'Clientes' },
                    { key: 'categorias', label: '⚙️ Categorías' },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: tab === t.key ? '#16a34a' : '#e5e7eb',
                            backgroundColor: tab === t.key ? '#f0fdf4' : '#fff',
                            color: tab === t.key ? '#16a34a' : '#6b7280',
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {exito && <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', marginBottom: '16px' }}>{exito}</div>}

            {/* Tab Categorías */}
            {tab === 'categorias' && (
                <CategoriasClientes onActualizado={cargarCategorias} />
            )}

            {/* Tab Clientes */}
            {tab === 'clientes' && (<>

            <div style={{ position: 'relative', marginBottom: '16px', maxWidth: '360px' }}>
                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                <input type="text" placeholder="Buscar por nombre, RIF o descripción..."
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
                                    <td style={{ padding: '12px 16px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{c.nombre}</div>
                                        {c.descripcion && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{c.descripcion}</div>}
                                    </td>
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
            </>)}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// GESTIÓN DE CATEGORÍAS DE CLIENTES
// ══════════════════════════════════════════════════════════════
function CategoriasClientes({ onActualizado }) {
    const { perfil } = useAuth()
    const [cats, setCats] = useState([])
    const [loading, setLoading] = useState(true)
    const [nuevos, setNuevos] = useState({ 1: '', 2: '', 3: '', 4: '' })
    const [editando, setEditando] = useState(null) // { id, nombre }
    const [error, setError] = useState('')
    const [guardando, setGuardando] = useState({})

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase.from('categorias_clientes')
            .select('id, nombre, nivel, activo')
            .eq('empresa_id', perfil.empresa_id)
            .order('nivel').order('nombre')
        if (data) setCats(data)
        setLoading(false)
    }

    async function agregar(nivel) {
        const nombre = nuevos[nivel].trim()
        if (!nombre) return
        setGuardando(prev => ({ ...prev, [nivel]: true }))
        const { error: err } = await supabase.from('categorias_clientes').insert({
            empresa_id: perfil.empresa_id, nombre, nivel,
        })
        if (err) { setError('Error: ' + err.message) }
        else { setNuevos(prev => ({ ...prev, [nivel]: '' })) }
        setGuardando(prev => ({ ...prev, [nivel]: false }))
        cargar(); onActualizado()
    }

    async function guardarEdicion() {
        if (!editando?.nombre.trim()) return
        await supabase.from('categorias_clientes').update({ nombre: editando.nombre.trim() }).eq('id', editando.id)
        setEditando(null)
        cargar(); onActualizado()
    }

    async function eliminar(id) {
        const { count } = await supabase.from('clientes')
            .select('id', { count: 'exact', head: true })
            .or(`cat1_id.eq.${id},cat2_id.eq.${id},cat3_id.eq.${id},cat4_id.eq.${id}`)
        if (count > 0) {
            setError(`No se puede eliminar — ${count} cliente(s) la usan. Renómbrala en su lugar.`)
            return
        }
        await supabase.from('categorias_clientes').delete().eq('id', id)
        cargar(); onActualizado()
    }

    if (loading) return <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>

    return (
        <div>
            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0 }} /> {error}
                    <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
                </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {[1, 2, 3, 4].map(nivel => {
                    const lista = cats.filter(c => c.nivel === nivel)
                    return (
                        <div key={nivel} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                            <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6', backgroundColor: '#f9fafb' }}>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>Categoría {nivel}</span>
                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>({lista.length})</span>
                            </div>

                            {lista.length === 0 ? (
                                <div style={{ padding: '16px', fontSize: '12px', color: '#9ca3af', textAlign: 'center' }}>Sin categorías</div>
                            ) : lista.map(c => (
                                <div key={c.id} style={{ padding: '10px 12px', borderBottom: '1px solid #f9fafb', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {editando?.id === c.id ? (
                                        <>
                                            <input value={editando.nombre}
                                                onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                                                onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditando(null) }}
                                                style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px' }}
                                                autoFocus />
                                            <button onClick={guardarEdicion} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}><Check size={13} /></button>
                                            <button onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={13} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <span style={{ flex: 1, fontSize: '13px', color: '#1f2937' }}>{c.nombre}</span>
                                            <button onClick={() => { setEditando({ id: c.id, nombre: c.nombre }); setError('') }}
                                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', color: '#6b7280' }}>
                                                <Pencil size={11} />
                                            </button>
                                            <button onClick={() => { setError(''); eliminar(c.id) }}
                                                style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', color: '#dc2626' }}>
                                                <Trash2 size={11} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            ))}

                            {/* Input para agregar */}
                            <div style={{ padding: '10px 12px', borderTop: '1px solid #f3f4f6', display: 'flex', gap: '6px' }}>
                                <input
                                    value={nuevos[nivel]}
                                    onChange={e => setNuevos(prev => ({ ...prev, [nivel]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && agregar(nivel)}
                                    placeholder="Nueva..."
                                    style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '12px' }} />
                                <button onClick={() => agregar(nivel)} disabled={guardando[nivel]}
                                    style={{ padding: '5px 8px', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: '12px' }}>
                                    <Plus size={13} />
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
                Las categorías usadas por clientes no pueden eliminarse — solo renombrarse.
            </p>
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
