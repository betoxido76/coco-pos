import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Check, X, Building2, Plus, User, Shield, Eye, EyeOff } from 'lucide-react'

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

const ROLES = [
    { key: 'admin', label: 'Admin' },
    { key: 'vendedor', label: 'Vendedor' },
    { key: 'produccion', label: 'Producción' },
    { key: 'almacen', label: 'Almacén' },
    { key: 'finanzas', label: 'Finanzas' },
]

const ROL_LABEL = {
    admin: { bg: '#f0fdf4', color: '#166534' },
    vendedor: { bg: '#dbeafe', color: '#1e40af' },
    produccion: { bg: '#fae8ff', color: '#7e22ce' },
    almacen: { bg: '#fef9c3', color: '#854d0e' },
    finanzas: { bg: '#ffedd5', color: '#9a3412' },
}

export default function SuperAdmin() {
    const [empresas, setEmpresas] = useState([])
    const [modulos, setModulos] = useState([])
    const [empresaModulos, setEmpresaModulos] = useState({}) // { empresa_id: Set(modulo_id) }
    const [loading, setLoading] = useState(true)
    const [empresaSel, setEmpresaSel] = useState(null)
    const [tabPanel, setTabPanel] = useState('modulos') // 'modulos' | 'usuarios'
    const [guardando, setGuardando] = useState({})

    // Usuarios de la empresa seleccionada
    const [usuarios, setUsuarios] = useState([])
    const [loadingUsuarios, setLoadingUsuarios] = useState(false)
    const [usuarioSel, setUsuarioSel] = useState(null)
    const [accesos, setAccesos] = useState({}) // { usuario_id: Set(modulo_id) }

    // Modal nueva empresa
    const [modalEmpresa, setModalEmpresa] = useState(false)
    const [formEmpresa, setFormEmpresa] = useState({ nombre: '', rif: '' })
    const [guardandoEmpresa, setGuardandoEmpresa] = useState(false)
    const [errorEmpresa, setErrorEmpresa] = useState('')

    // Modal nuevo usuario
    const [modalUsuario, setModalUsuario] = useState(false)
    const [formUsuario, setFormUsuario] = useState({ nombre: '', email: '', password: '', rol: 'admin' })
    const [mostrarPass, setMostrarPass] = useState(false)
    const [guardandoUsuario, setGuardandoUsuario] = useState(false)
    const [errorUsuario, setErrorUsuario] = useState('')

    useEffect(() => { cargar() }, [])

    useEffect(() => {
        if (empresaSel && tabPanel === 'usuarios') cargarUsuarios(empresaSel)
    }, [empresaSel, tabPanel])

    async function cargar() {
        setLoading(true)
        const [{ data: emps }, { data: mods }, { data: empMods }] = await Promise.all([
            supabase.from('empresas').select('id, nombre, rif, activo').order('nombre'),
            supabase.from('modulos').select('id, nombre, orden').eq('activo', true).order('orden'),
            supabase.from('empresa_modulos').select('empresa_id, modulo_id, activo'),
        ])

        setEmpresas(emps || [])
        setModulos(mods || [])

        const mapa = {}
        emps?.forEach(e => { mapa[e.id] = new Set() })
        empMods?.forEach(em => { if (em.activo && mapa[em.empresa_id]) mapa[em.empresa_id].add(em.modulo_id) })
        setEmpresaModulos(mapa)

        if (emps?.length > 0 && !empresaSel) setEmpresaSel(emps[0].id)
        setLoading(false)
    }

    async function cargarUsuarios(empresaId) {
        setLoadingUsuarios(true)
        setUsuarioSel(null)

        const [{ data: usrs }, { data: usrMods }] = await Promise.all([
            supabase.from('usuarios').select('id, nombre, email, rol, activo').eq('empresa_id', empresaId).order('nombre'),
            supabase.from('usuario_modulos').select('usuario_id, modulo_id, activo').eq('empresa_id', empresaId),
        ])

        setUsuarios(usrs || [])

        const mapa = {}
        usrs?.forEach(u => { mapa[u.id] = new Set() })
        usrMods?.forEach(um => { if (um.activo && mapa[um.usuario_id]) mapa[um.usuario_id].add(um.modulo_id) })
        setAccesos(mapa)

        if (usrs?.length > 0) setUsuarioSel(usrs[0].id)
        setLoadingUsuarios(false)
    }

    // ── Módulos empresa ──
    async function toggleModulo(empresaId, moduloId, tieneModulo) {
        const key = `emp-${empresaId}-${moduloId}`
        setGuardando(prev => ({ ...prev, [key]: true }))
        if (tieneModulo) {
            await supabase.from('empresa_modulos').delete().eq('empresa_id', empresaId).eq('modulo_id', moduloId)
            await supabase.from('usuario_modulos').delete().eq('empresa_id', empresaId).eq('modulo_id', moduloId)
            setEmpresaModulos(prev => { const s = new Set(prev[empresaId]); s.delete(moduloId); return { ...prev, [empresaId]: s } })
        } else {
            await supabase.from('empresa_modulos').upsert({ empresa_id: empresaId, modulo_id: moduloId, activo: true })
            setEmpresaModulos(prev => { const s = new Set(prev[empresaId]); s.add(moduloId); return { ...prev, [empresaId]: s } })
        }
        setGuardando(prev => ({ ...prev, [key]: false }))
    }

    async function activarTodos(empresaId) {
        await supabase.from('empresa_modulos').upsert(modulos.map(m => ({ empresa_id: empresaId, modulo_id: m.id, activo: true })))
        setEmpresaModulos(prev => ({ ...prev, [empresaId]: new Set(modulos.map(m => m.id)) }))
    }

    async function desactivarTodos(empresaId) {
        await supabase.from('empresa_modulos').delete().eq('empresa_id', empresaId)
        await supabase.from('usuario_modulos').delete().eq('empresa_id', empresaId)
        setEmpresaModulos(prev => ({ ...prev, [empresaId]: new Set() }))
    }

    // ── Módulos usuario ──
    async function toggleModuloUsuario(usuarioId, moduloId, tieneAcceso) {
        const key = `usr-${usuarioId}-${moduloId}`
        setGuardando(prev => ({ ...prev, [key]: true }))
        if (tieneAcceso) {
            await supabase.from('usuario_modulos').delete().eq('usuario_id', usuarioId).eq('modulo_id', moduloId)
            setAccesos(prev => { const s = new Set(prev[usuarioId]); s.delete(moduloId); return { ...prev, [usuarioId]: s } })
        } else {
            await supabase.from('usuario_modulos').upsert({ usuario_id: usuarioId, empresa_id: empresaSel, modulo_id: moduloId, activo: true })
            setAccesos(prev => { const s = new Set(prev[usuarioId]); s.add(moduloId); return { ...prev, [usuarioId]: s } })
        }
        setGuardando(prev => ({ ...prev, [key]: false }))
    }

    async function darTodoAccesoUsuario(usuarioId) {
        const modsEmpresa = [...(empresaModulos[empresaSel] || [])]
        await supabase.from('usuario_modulos').upsert(
            modsEmpresa.map(m => ({ usuario_id: usuarioId, empresa_id: empresaSel, modulo_id: m, activo: true }))
        )
        setAccesos(prev => ({ ...prev, [usuarioId]: new Set(modsEmpresa) }))
    }

    async function quitarTodoAccesoUsuario(usuarioId) {
        await supabase.from('usuario_modulos').delete().eq('usuario_id', usuarioId).eq('empresa_id', empresaSel)
        setAccesos(prev => ({ ...prev, [usuarioId]: new Set() }))
    }

    async function toggleUsuarioActivo(usuario) {
        await supabase.from('usuarios').update({ activo: !usuario.activo }).eq('id', usuario.id)
        setUsuarios(prev => prev.map(u => u.id === usuario.id ? { ...u, activo: !u.activo } : u))
    }

    // ── Reset de contraseña ──
    const [modalReset, setModalReset] = useState(null) // { id, nombre }
    const [nuevaPass, setNuevaPass] = useState('')
    const [mostrarNuevaPass, setMostrarNuevaPass] = useState(false)
    const [guardandoReset, setGuardandoReset] = useState(false)
    const [errorReset, setErrorReset] = useState('')
    const [exitoReset, setExitoReset] = useState(false)

    async function resetearPassword() {
        if (!nuevaPass || nuevaPass.length < 6) { setErrorReset('La contraseña debe tener al menos 6 caracteres'); return }
        setGuardandoReset(true); setErrorReset('')
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { setErrorUsuario('No hay sesión activa. Cierra sesión y vuelve a entrar.'); setGuardandoUsuario(false); return }
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/resetear-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ usuario_id: modalReset.id, nueva_password: nuevaPass }),
        })
        const result = await res.json()
        if (!res.ok || result.error) {
            setErrorReset(result.error || 'Error al resetear la contraseña')
            setGuardandoReset(false)
            return
        }
        setGuardandoReset(false)
        setExitoReset(true)
        setTimeout(() => { setModalReset(null); setNuevaPass(''); setExitoReset(false) }, 2000)
    }

    // ── Nueva empresa ──
    async function guardarEmpresa() {
        if (!formEmpresa.nombre.trim()) { setErrorEmpresa('El nombre es obligatorio'); return }
        setGuardandoEmpresa(true); setErrorEmpresa('')
        const { data, error } = await supabase.from('empresas')
            .insert({ nombre: formEmpresa.nombre.trim(), rif: formEmpresa.rif.trim() || null })
            .select().single()
        if (error) { setErrorEmpresa('Error: ' + error.message); setGuardandoEmpresa(false); return }
        setEmpresaModulos(prev => ({ ...prev, [data.id]: new Set() }))
        setGuardandoEmpresa(false)
        setModalEmpresa(false)
        await cargar()
        setEmpresaSel(data.id)
    }

    // ── Nuevo usuario ──
    async function guardarUsuario() {
        if (!formUsuario.nombre.trim()) { setErrorUsuario('El nombre es obligatorio'); return }
        if (!formUsuario.email.trim()) { setErrorUsuario('El email es obligatorio'); return }
        if (!formUsuario.password || formUsuario.password.length < 6) { setErrorUsuario('La contraseña debe tener al menos 6 caracteres'); return }
        setGuardandoUsuario(true); setErrorUsuario('')

        const { data: { session } } = await supabase.auth.getSession()

        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crear-usuario`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                nombre: formUsuario.nombre.trim(),
                email: formUsuario.email.trim(),
                password: formUsuario.password,
                rol: formUsuario.rol,
                empresa_id: empresaSel,
            }),
        })

        const result = await res.json()
        if (!res.ok || result.error) {
            setErrorUsuario(result.error || 'Error al crear el usuario')
            setGuardandoUsuario(false)
            return
        }

        setGuardandoUsuario(false)
        setModalUsuario(false)
        setFormUsuario({ nombre: '', email: '', password: '', rol: 'admin' })
        await cargarUsuarios(empresaSel)
    }

    async function toggleEmpresaActiva(empresa) {
        await supabase.from('empresas').update({ activo: !empresa.activo }).eq('id', empresa.id)
        await cargar()
    }

    const empresaActual = empresas.find(e => e.id === empresaSel)
    const modulosEmpresa = empresaModulos[empresaSel] || new Set()
    const modulosContratados = modulos.filter(m => modulosEmpresa.has(m.id))
    const usuarioActual = usuarios.find(u => u.id === usuarioSel)
    const accesosUsuario = accesos[usuarioSel] || new Set()

    if (loading) return <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>

    return (
        <div style={{ padding: '24px', maxWidth: '1200px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>🛠️ Super Admin</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Gestiona empresas, módulos y usuarios</p>
                </div>
                <button onClick={() => { setModalEmpresa(true); setFormEmpresa({ nombre: '', rif: '' }); setErrorEmpresa('') }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Nueva empresa
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px' }}>

                {/* Lista de empresas */}
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', height: 'fit-content' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Empresas ({empresas.length})
                    </div>
                    {empresas.map(e => {
                        const nMods = (empresaModulos[e.id] || new Set()).size
                        const sel = empresaSel === e.id
                        return (
                            <div key={e.id} onClick={() => { setEmpresaSel(e.id); setTabPanel('modulos') }}
                                style={{
                                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f9fafb',
                                    backgroundColor: sel ? '#eff6ff' : 'transparent',
                                    borderLeft: sel ? '3px solid #1d4ed8' : '3px solid transparent',
                                    opacity: e.activo ? 1 : 0.5,
                                }}
                                onMouseEnter={ev => { if (!sel) ev.currentTarget.style.backgroundColor = '#f9fafb' }}
                                onMouseLeave={ev => { if (!sel) ev.currentTarget.style.backgroundColor = 'transparent' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                    <Building2 size={14} style={{ color: sel ? '#1d4ed8' : '#9ca3af', flexShrink: 0 }} />
                                    <span style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{e.nombre}</span>
                                    {!e.activo && <span style={{ fontSize: '10px', backgroundColor: '#f3f4f6', color: '#9ca3af', padding: '1px 6px', borderRadius: '20px' }}>inactiva</span>}
                                </div>
                                {e.rif && <div style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '22px' }}>{e.rif}</div>}
                                <div style={{ fontSize: '11px', color: sel ? '#1d4ed8' : '#9ca3af', marginLeft: '22px', marginTop: '2px' }}>
                                    {nMods} módulos · {/* usuarios se cargan al abrir */}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Panel derecho */}
                {empresaActual ? (
                    <div>
                        {/* Header empresa + tabs */}
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>{empresaActual.nombre}</div>
                                    {empresaActual.rif && <div style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{empresaActual.rif}</div>}
                                </div>
                                <button onClick={() => toggleEmpresaActiva(empresaActual)}
                                    style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', cursor: 'pointer' }}>
                                    {empresaActual.activo ? 'Desactivar empresa' : 'Activar empresa'}
                                </button>
                            </div>

                            {/* Tabs */}
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {[
                                    { key: 'modulos', label: `Módulos (${modulosEmpresa.size})` },
                                    { key: 'usuarios', label: `Usuarios (${usuarios.length})` },
                                ].map(tab => (
                                    <button key={tab.key} onClick={() => setTabPanel(tab.key)}
                                        style={{
                                            padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                            border: '1px solid', cursor: 'pointer',
                                            borderColor: tabPanel === tab.key ? '#1d4ed8' : '#e5e7eb',
                                            backgroundColor: tabPanel === tab.key ? '#eff6ff' : '#fff',
                                            color: tabPanel === tab.key ? '#1d4ed8' : '#6b7280',
                                        }}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── TAB MÓDULOS ── */}
                        {tabPanel === 'modulos' && (
                            <>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                    <button onClick={() => activarTodos(empresaSel)}
                                        style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}>
                                        ✓ Activar todos
                                    </button>
                                    <button onClick={() => desactivarTodos(empresaSel)}
                                        style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                                        ✕ Desactivar todos
                                    </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                                    {modulos.map(m => {
                                        const tiene = modulosEmpresa.has(m.id)
                                        const key = `emp-${empresaSel}-${m.id}`
                                        const cargando = guardando[key]
                                        return (
                                            <div key={m.id} onClick={() => !cargando && toggleModulo(empresaSel, m.id, tiene)}
                                                style={{
                                                    backgroundColor: tiene ? '#eff6ff' : '#fff',
                                                    border: `2px solid ${tiene ? '#1d4ed8' : '#e5e7eb'}`,
                                                    borderRadius: '12px', padding: '16px', cursor: cargando ? 'wait' : 'pointer',
                                                    display: 'flex', alignItems: 'center', gap: '12px', opacity: cargando ? 0.6 : 1,
                                                }}>
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0, backgroundColor: tiene ? '#1d4ed8' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    {tiene ? <Check size={14} style={{ color: '#fff' }} /> : <X size={14} style={{ color: '#9ca3af' }} />}
                                                </div>
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: 600, color: tiene ? '#1e40af' : '#374151' }}>{m.nombre}</div>
                                                    <div style={{ fontSize: '11px', color: tiene ? '#1d4ed8' : '#9ca3af', marginTop: '2px' }}>{tiene ? 'Contratado' : 'No contratado'}</div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </>
                        )}

                        {/* ── TAB USUARIOS ── */}
                        {tabPanel === 'usuarios' && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                                    <button onClick={() => { setModalUsuario(true); setFormUsuario({ nombre: '', email: '', password: '', rol: 'admin' }); setErrorUsuario(''); setGuardandoUsuario(false) }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                                        <Plus size={14} /> Nuevo usuario
                                    </button>
                                </div>

                                {loadingUsuarios ? (
                                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando usuarios...</div>
                                ) : usuarios.length === 0 ? (
                                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db', padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                                        No hay usuarios en esta empresa. Crea el primero.
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '16px' }}>

                                        {/* Lista usuarios */}
                                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', height: 'fit-content' }}>
                                            {usuarios.map(u => {
                                                const rol = ROL_LABEL[u.rol] || { bg: '#f3f4f6', color: '#374151' }
                                                const nAcc = (accesos[u.id] || new Set()).size
                                                const sel = usuarioSel === u.id
                                                return (
                                                    <div key={u.id} onClick={() => setUsuarioSel(u.id)}
                                                        style={{
                                                            padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f9fafb',
                                                            backgroundColor: sel ? '#f0fdf4' : 'transparent',
                                                            borderLeft: sel ? '3px solid #16a34a' : '3px solid transparent',
                                                            opacity: u.activo ? 1 : 0.5,
                                                        }}
                                                        onMouseEnter={ev => { if (!sel) ev.currentTarget.style.backgroundColor = '#f9fafb' }}
                                                        onMouseLeave={ev => { if (!sel) ev.currentTarget.style.backgroundColor = 'transparent' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{u.nombre}</span>
                                                            <span style={{ fontSize: '10px', backgroundColor: rol.bg, color: rol.color, padding: '1px 6px', borderRadius: '20px' }}>
                                                                {u.rol}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{u.email}</div>
                                                        <div style={{ fontSize: '11px', color: sel ? '#16a34a' : '#9ca3af', marginTop: '2px' }}>
                                                            {nAcc} de {modulosContratados.length} módulos
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>

                                        {/* Accesos del usuario seleccionado */}
                                        {usuarioActual && (
                                            <div>
                                                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '14px 18px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>{usuarioActual.nombre}</div>
                                                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{usuarioActual.email} · {usuarioActual.rol}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button onClick={() => darTodoAccesoUsuario(usuarioSel)}
                                                            style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#16a34a', cursor: 'pointer' }}>
                                                            ✓ Todo acceso
                                                        </button>
                                                        <button onClick={() => quitarTodoAccesoUsuario(usuarioSel)}
                                                            style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                                                            ✕ Sin acceso
                                                        </button>
                                                        <button onClick={() => toggleUsuarioActivo(usuarioActual)}
                                                            style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', cursor: 'pointer' }}>
                                                            {usuarioActual.activo ? 'Desactivar' : 'Activar'}
                                                        </button>
                                                        <button onClick={() => { setModalReset({ id: usuarioActual.id, nombre: usuarioActual.nombre }); setNuevaPass(''); setErrorReset(''); setExitoReset(false) }}
                                                            style={{ padding: '5px 10px', borderRadius: '6px', fontSize: '11px', border: '1px solid #fde68a', backgroundColor: '#fefce8', color: '#854d0e', cursor: 'pointer' }}>
                                                            🔑 Resetear clave
                                                        </button>
                                                    </div>
                                                </div>

                                                {modulosContratados.length === 0 ? (
                                                    <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 18px', fontSize: '13px', color: '#854d0e' }}>
                                                        ⚠️ Esta empresa no tiene módulos contratados. Actívalos primero en la pestaña Módulos.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                                                        {modulosContratados.map(m => {
                                                            const tieneAcc = accesosUsuario.has(m.id)
                                                            const key = `usr-${usuarioSel}-${m.id}`
                                                            const cargando = guardando[key]
                                                            return (
                                                                <div key={m.id} onClick={() => !cargando && toggleModuloUsuario(usuarioSel, m.id, tieneAcc)}
                                                                    style={{
                                                                        backgroundColor: tieneAcc ? '#f0fdf4' : '#fff',
                                                                        border: `2px solid ${tieneAcc ? '#16a34a' : '#e5e7eb'}`,
                                                                        borderRadius: '10px', padding: '12px',
                                                                        cursor: cargando ? 'wait' : 'pointer',
                                                                        display: 'flex', alignItems: 'center', gap: '10px',
                                                                        opacity: cargando ? 0.6 : 1,
                                                                    }}>
                                                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0, backgroundColor: tieneAcc ? '#16a34a' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                        {tieneAcc ? <Check size={12} style={{ color: '#fff' }} /> : <X size={12} style={{ color: '#9ca3af' }} />}
                                                                    </div>
                                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: tieneAcc ? '#166534' : '#374151' }}>{m.nombre}</span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db', padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                        Selecciona una empresa
                    </div>
                )}
            </div>

            {/* Modal nueva empresa */}
            {modalEmpresa && (
                <>
                    <div onClick={() => setModalEmpresa(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '400px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 20px' }}>Nueva empresa / cliente</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nombre *</label>
                                <input value={formEmpresa.nombre} onChange={e => setFormEmpresa(p => ({ ...p, nombre: e.target.value }))}
                                    placeholder="Nombre de la empresa" style={inputStyle} autoFocus />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>RIF <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opcional)</span></label>
                                <input value={formEmpresa.rif} onChange={e => setFormEmpresa(p => ({ ...p, rif: e.target.value }))}
                                    placeholder="J-12345678-9" style={inputStyle} />
                            </div>
                        </div>
                        {errorEmpresa && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{errorEmpresa}</div>}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={guardarEmpresa} disabled={guardandoEmpresa}
                                style={{ flex: 2, backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoEmpresa ? 0.6 : 1 }}>
                                {guardandoEmpresa ? 'Creando...' : 'Crear empresa'}
                            </button>
                            <button onClick={() => setModalEmpresa(false)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Modal nuevo usuario */}
            {modalUsuario && (
                <>
                    <div onClick={() => setModalUsuario(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '420px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>Nuevo usuario</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>Para: <strong>{empresaActual?.nombre}</strong></p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nombre *</label>
                                <input value={formUsuario.nombre} onChange={e => setFormUsuario(p => ({ ...p, nombre: e.target.value }))}
                                    placeholder="Nombre completo" style={inputStyle} autoFocus />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Email *</label>
                                <input type="email" value={formUsuario.email} onChange={e => setFormUsuario(p => ({ ...p, email: e.target.value }))}
                                    placeholder="correo@empresa.com" style={inputStyle} />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Contraseña inicial *</label>
                                <div style={{ position: 'relative' }}>
                                    <input type={mostrarPass ? 'text' : 'password'} value={formUsuario.password}
                                        onChange={e => setFormUsuario(p => ({ ...p, password: e.target.value }))}
                                        placeholder="Mínimo 6 caracteres" style={{ ...inputStyle, paddingRight: '40px' }} />
                                    <button onClick={() => setMostrarPass(!mostrarPass)}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                                        {mostrarPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Rol *</label>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                    {ROLES.map(r => (
                                        <button key={r.key} onClick={() => setFormUsuario(p => ({ ...p, rol: r.key }))}
                                            style={{
                                                padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                                border: '1px solid', cursor: 'pointer',
                                                borderColor: formUsuario.rol === r.key ? '#1d4ed8' : '#e5e7eb',
                                                backgroundColor: formUsuario.rol === r.key ? '#eff6ff' : '#fff',
                                                color: formUsuario.rol === r.key ? '#1d4ed8' : '#6b7280',
                                            }}>
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '10px 14px', marginTop: '14px', fontSize: '12px', color: '#166534' }}>
                            ✓ El usuario recibirá acceso a todos los módulos contratados por la empresa. Puedes ajustarlo después.
                        </div>
                        {errorUsuario && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '12px' }}>{errorUsuario}</div>}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={guardarUsuario} disabled={guardandoUsuario}
                                style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoUsuario ? 0.6 : 1 }}>
                                {guardandoUsuario ? 'Creando usuario...' : 'Crear usuario'}
                            </button>
                            <button onClick={() => setModalUsuario(false)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Modal reset de contraseña */}
            {modalReset && (
                <>
                    <div onClick={() => setModalReset(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '400px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>🔑 Resetear contraseña</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
                            Usuario: <strong>{modalReset.nombre}</strong>
                        </p>

                        {exitoReset ? (
                            <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: '#166534', textAlign: 'center' }}>
                                ✅ Contraseña actualizada correctamente
                            </div>
                        ) : (
                            <>
                                <div>
                                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nueva contraseña *</label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={mostrarNuevaPass ? 'text' : 'password'}
                                            value={nuevaPass}
                                            onChange={e => setNuevaPass(e.target.value)}
                                            placeholder="Mínimo 6 caracteres"
                                            style={{ ...inputStyle, paddingRight: '40px' }}
                                            autoFocus
                                        />
                                        <button onClick={() => setMostrarNuevaPass(!mostrarNuevaPass)}
                                            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                                            {mostrarNuevaPass ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                                {errorReset && (
                                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '12px' }}>
                                        {errorReset}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                                    <button onClick={resetearPassword} disabled={guardandoReset}
                                        style={{ flex: 2, backgroundColor: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoReset ? 0.6 : 1 }}>
                                        {guardandoReset ? 'Actualizando...' : 'Confirmar nueva contraseña'}
                                    </button>
                                    <button onClick={() => setModalReset(null)}
                                        style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
