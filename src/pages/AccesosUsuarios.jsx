import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Check, X, Shield, User, Pencil } from 'lucide-react'

const ROL_LABEL = {
    admin:      { label: 'Admin',      bg: '#f0fdf4', color: '#166534' },
    vendedor:   { label: 'Vendedor',   bg: '#dbeafe', color: '#1e40af' },
    produccion: { label: 'Producción', bg: '#fae8ff', color: '#7e22ce' },
    almacen:    { label: 'Almacén',    bg: '#fef9c3', color: '#854d0e' },
    finanzas:   { label: 'Finanzas',   bg: '#ffedd5', color: '#9a3412' },
}

export default function AccesosUsuarios() {
    const { perfil } = useAuth()
    const [usuarios, setUsuarios] = useState([])
    const [modulos, setModulos] = useState([]) // módulos contratados por la empresa
    const [accesos, setAccesos] = useState({}) // { usuario_id: Set(modulo_id) }
    const [loading, setLoading] = useState(true)
    const [guardando, setGuardando] = useState({}) // { `${uid}-${mid}`: bool }
    const [usuarioSel, setUsuarioSel] = useState(null)
    const [editandoNombre, setEditandoNombre] = useState(false)
    const [nuevoNombreVal, setNuevoNombreVal] = useState('')
    const [guardandoNombre, setGuardandoNombre] = useState(false)

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)

        // Cargar usuarios de la empresa
        const { data: usrs } = await supabase
            .from('usuarios')
            .select('id, nombre, email, rol, activo')
            .eq('empresa_id', perfil.empresa_id)
            .order('nombre')

        // Cargar módulos contratados por la empresa
        const { data: empMods } = await supabase
            .from('empresa_modulos')
            .select('modulo_id, modulos(id, nombre, orden)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('activo', true)
            .order('modulos(orden)')

        // Cargar todos los accesos actuales de usuarios de esta empresa
        const { data: usrMods } = await supabase
            .from('usuario_modulos')
            .select('usuario_id, modulo_id, activo')
            .eq('empresa_id', perfil.empresa_id)

        if (usrs) setUsuarios(usrs)

        const modsOrdenados = (empMods || [])
            .map(em => em.modulos)
            .filter(Boolean)
            .sort((a, b) => a.orden - b.orden)
        setModulos(modsOrdenados)

        // Construir mapa de accesos
        const mapa = {}
        usrs?.forEach(u => { mapa[u.id] = new Set() })
        usrMods?.forEach(um => {
            if (um.activo && mapa[um.usuario_id]) {
                mapa[um.usuario_id].add(um.modulo_id)
            }
        })
        setAccesos(mapa)

        // Seleccionar primer usuario por defecto
        if (usrs?.length > 0 && !usuarioSel) setUsuarioSel(usrs[0].id)

        setLoading(false)
    }

    async function toggleModulo(usuarioId, moduloId, tieneAcceso) {
        const key = `${usuarioId}-${moduloId}`
        setGuardando(prev => ({ ...prev, [key]: true }))

        if (tieneAcceso) {
            // Quitar acceso
            await supabase.from('usuario_modulos')
                .delete()
                .eq('usuario_id', usuarioId)
                .eq('modulo_id', moduloId)

            setAccesos(prev => {
                const nuevo = new Set(prev[usuarioId])
                nuevo.delete(moduloId)
                return { ...prev, [usuarioId]: nuevo }
            })
        } else {
            // Dar acceso
            await supabase.from('usuario_modulos')
                .upsert({ usuario_id: usuarioId, empresa_id: perfil.empresa_id, modulo_id: moduloId, activo: true })

            setAccesos(prev => {
                const nuevo = new Set(prev[usuarioId])
                nuevo.add(moduloId)
                return { ...prev, [usuarioId]: nuevo }
            })
        }

        setGuardando(prev => ({ ...prev, [key]: false }))
    }

    async function darTodoAcceso(usuarioId) {
        const inserts = modulos.map(m => ({
            usuario_id: usuarioId,
            empresa_id: perfil.empresa_id,
            modulo_id: m.id,
            activo: true,
        }))
        await supabase.from('usuario_modulos').upsert(inserts)
        setAccesos(prev => ({ ...prev, [usuarioId]: new Set(modulos.map(m => m.id)) }))
    }

    async function guardarNombre() {
        if (!nuevoNombreVal.trim()) return
        setGuardandoNombre(true)
        await supabase.from('usuarios').update({ nombre: nuevoNombreVal.trim() }).eq('id', usuarioSel)
        setUsuarios(prev => prev.map(u => u.id === usuarioSel ? { ...u, nombre: nuevoNombreVal.trim() } : u))
        setEditandoNombre(false)
        setGuardandoNombre(false)
    }

    async function quitarTodoAcceso(usuarioId) {
        await supabase.from('usuario_modulos')
            .delete()
            .eq('usuario_id', usuarioId)
            .eq('empresa_id', perfil.empresa_id)
        setAccesos(prev => ({ ...prev, [usuarioId]: new Set() }))
    }

    const usuarioActual = usuarios.find(u => u.id === usuarioSel)
    const accesosUsuario = accesos[usuarioSel] || new Set()
    const totalAccesos = accesosUsuario.size

    if (loading) return <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Usuarios y accesos</h1>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                    Define qué módulos puede ver cada usuario de tu empresa
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '20px' }}>

                {/* Lista de usuarios */}
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', height: 'fit-content' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Usuarios ({usuarios.length})
                    </div>
                    {usuarios.map(u => {
                        const rol = ROL_LABEL[u.rol] || { label: u.rol, bg: '#f3f4f6', color: '#374151' }
                        const nAccesos = (accesos[u.id] || new Set()).size
                        const seleccionado = usuarioSel === u.id
                        return (
                            <div key={u.id} onClick={() => { setUsuarioSel(u.id); setEditandoNombre(false) }}
                                style={{
                                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f9fafb',
                                    backgroundColor: seleccionado ? '#f0fdf4' : 'transparent',
                                    borderLeft: seleccionado ? '3px solid #16a34a' : '3px solid transparent',
                                    opacity: u.activo ? 1 : 0.5,
                                }}
                                onMouseEnter={e => { if (!seleccionado) e.currentTarget.style.backgroundColor = '#f9fafb' }}
                                onMouseLeave={e => { if (!seleccionado) e.currentTarget.style.backgroundColor = 'transparent' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{u.nombre}</div>
                                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{u.email}</div>
                                    </div>
                                    <span style={{ fontSize: '10px', backgroundColor: rol.bg, color: rol.color, padding: '2px 7px', borderRadius: '20px', fontWeight: 500, whiteSpace: 'nowrap', marginLeft: '8px' }}>
                                        {rol.label}
                                    </span>
                                </div>
                                <div style={{ fontSize: '11px', color: seleccionado ? '#16a34a' : '#9ca3af', marginTop: '4px' }}>
                                    {nAccesos} de {modulos.length} módulos activos
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Panel de módulos del usuario seleccionado */}
                {usuarioActual ? (
                    <div>
                        {/* Header del usuario */}
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ backgroundColor: '#f0fdf4', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <User size={20} style={{ color: '#16a34a' }} />
                                </div>
                                <div>
                                    {editandoNombre ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <input
                                                autoFocus
                                                value={nuevoNombreVal}
                                                onChange={e => setNuevoNombreVal(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') guardarNombre(); if (e.key === 'Escape') setEditandoNombre(false) }}
                                                style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', border: '1px solid #d1d5db', borderRadius: '6px', padding: '3px 8px', width: '180px' }}
                                            />
                                            <button onClick={guardarNombre} disabled={guardandoNombre}
                                                style={{ padding: '3px 10px', fontSize: '12px', fontWeight: 500, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                                                {guardandoNombre ? '...' : 'Guardar'}
                                            </button>
                                            <button onClick={() => setEditandoNombre(false)}
                                                style={{ padding: '3px 8px', fontSize: '12px', backgroundColor: 'transparent', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer' }}>
                                                Cancelar
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{usuarioActual.nombre}</span>
                                            <button onClick={() => { setNuevoNombreVal(usuarioActual.nombre); setEditandoNombre(true) }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: '#9ca3af', display: 'flex', alignItems: 'center' }}
                                                title="Editar nombre">
                                                <Pencil size={13} />
                                            </button>
                                        </div>
                                    )}
                                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{usuarioActual.email}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => darTodoAcceso(usuarioSel)}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid #bbf7d0', backgroundColor: '#f0fdf4', color: '#16a34a', cursor: 'pointer' }}>
                                    ✓ Dar todo acceso
                                </button>
                                <button onClick={() => quitarTodoAcceso(usuarioSel)}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                                    ✕ Quitar todo acceso
                                </button>
                            </div>
                        </div>

                        {/* Grid de módulos */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
                            {modulos.map(m => {
                                const tieneAcceso = accesosUsuario.has(m.id)
                                const key = `${usuarioSel}-${m.id}`
                                const cargando = guardando[key]
                                return (
                                    <div key={m.id}
                                        onClick={() => !cargando && toggleModulo(usuarioSel, m.id, tieneAcceso)}
                                        style={{
                                            backgroundColor: tieneAcceso ? '#f0fdf4' : '#fff',
                                            border: `2px solid ${tieneAcceso ? '#16a34a' : '#e5e7eb'}`,
                                            borderRadius: '12px', padding: '16px',
                                            cursor: cargando ? 'wait' : 'pointer',
                                            transition: 'all 0.15s',
                                            display: 'flex', alignItems: 'center', gap: '12px',
                                            opacity: cargando ? 0.6 : 1,
                                        }}
                                        onMouseEnter={e => { if (!cargando) e.currentTarget.style.borderColor = tieneAcceso ? '#15803d' : '#9ca3af' }}
                                        onMouseLeave={e => { e.currentTarget.style.borderColor = tieneAcceso ? '#16a34a' : '#e5e7eb' }}>
                                        <div style={{
                                            width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                                            backgroundColor: tieneAcceso ? '#16a34a' : '#f3f4f6',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            {tieneAcceso
                                                ? <Check size={14} style={{ color: '#fff' }} />
                                                : <X size={14} style={{ color: '#9ca3af' }} />}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, color: tieneAcceso ? '#166534' : '#374151' }}>
                                                {m.nombre}
                                            </div>
                                            <div style={{ fontSize: '11px', color: tieneAcceso ? '#16a34a' : '#9ca3af', marginTop: '2px' }}>
                                                {tieneAcceso ? 'Con acceso' : 'Sin acceso'}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {modulos.length === 0 && (
                            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px 20px', fontSize: '13px', color: '#854d0e' }}>
                                ⚠️ Tu empresa no tiene módulos contratados configurados. Contacta al administrador del sistema.
                            </div>
                        )}

                        <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '16px', textAlign: 'center' }}>
                            Haz clic en cada módulo para activar o desactivar el acceso. Los cambios se aplican inmediatamente.
                        </p>
                    </div>
                ) : (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db', padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                        Selecciona un usuario para gestionar sus accesos
                    </div>
                )}
            </div>
        </div>
    )
}
