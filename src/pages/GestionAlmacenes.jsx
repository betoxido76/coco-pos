import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Pencil, Check, X, ChevronDown, ChevronRight, MapPin, Warehouse } from 'lucide-react'

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

const VACIO_ALMACEN = { nombre: '', descripcion: '', es_default: false, activo: true }
const VACIO_UBIC = { nombre: '', activo: true }

export default function GestionAlmacenes() {
    const { perfil } = useAuth()
    const [almacenes, setAlmacenes] = useState([])
    const [loading, setLoading] = useState(true)
    const [expandido, setExpandido] = useState({}) // { almacen_id: bool }
    const [ubicacionesPor, setUbicacionesPor] = useState({}) // { almacen_id: [] }

    // Modal almacén
    const [modalAlmacen, setModalAlmacen] = useState(null) // null | 'nuevo' | { ...almacen }
    const [formAlmacen, setFormAlmacen] = useState(VACIO_ALMACEN)
    const [guardandoAlmacen, setGuardandoAlmacen] = useState(false)
    const [errorAlmacen, setErrorAlmacen] = useState('')

    // Modal ubicación
    const [modalUbic, setModalUbic] = useState(null) // null | { almacen_id, data?: {...} }
    const [formUbic, setFormUbic] = useState(VACIO_UBIC)
    const [guardandoUbic, setGuardandoUbic] = useState(false)
    const [errorUbic, setErrorUbic] = useState('')

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase.from('almacenes')
            .select('*')
            .eq('empresa_id', perfil.empresa_id)
            .order('es_default', { ascending: false })
            .order('nombre')
        if (data) setAlmacenes(data)
        setLoading(false)
    }

    async function cargarUbicaciones(almacenId) {
        const { data } = await supabase.from('almacen_ubicaciones')
            .select('*')
            .eq('almacen_id', almacenId)
            .eq('empresa_id', perfil.empresa_id)
            .order('nombre')
        if (data) setUbicacionesPor(prev => ({ ...prev, [almacenId]: data }))
    }

    function toggleExpandir(almacenId) {
        const nuevoEstado = !expandido[almacenId]
        setExpandido(prev => ({ ...prev, [almacenId]: nuevoEstado }))
        if (nuevoEstado && !ubicacionesPor[almacenId]) cargarUbicaciones(almacenId)
    }

    // ── Almacenes ──
    function abrirNuevoAlmacen() {
        setFormAlmacen(VACIO_ALMACEN); setErrorAlmacen(''); setModalAlmacen('nuevo')
    }

    function abrirEditarAlmacen(a) {
        setFormAlmacen({ nombre: a.nombre, descripcion: a.descripcion || '', es_default: a.es_default, activo: a.activo })
        setErrorAlmacen(''); setModalAlmacen(a)
    }

    async function guardarAlmacen() {
        if (!formAlmacen.nombre.trim()) { setErrorAlmacen('El nombre es obligatorio'); return }
        setGuardandoAlmacen(true); setErrorAlmacen('')

        // Si se marca como default, desmarcar los demás
        if (formAlmacen.es_default) {
            await supabase.from('almacenes').update({ es_default: false }).eq('empresa_id', perfil.empresa_id)
        }

        const payload = {
            nombre: formAlmacen.nombre.trim(),
            descripcion: formAlmacen.descripcion.trim() || null,
            es_default: formAlmacen.es_default,
            activo: formAlmacen.activo,
        }

        const { error } = modalAlmacen === 'nuevo'
            ? await supabase.from('almacenes').insert({ ...payload, empresa_id: perfil.empresa_id })
            : await supabase.from('almacenes').update(payload).eq('id', modalAlmacen.id)

        setGuardandoAlmacen(false)
        if (error) { setErrorAlmacen('Error: ' + error.message); return }
        setModalAlmacen(null)
        await cargar()
    }

    async function toggleActivarAlmacen(a) {
        await supabase.from('almacenes').update({ activo: !a.activo }).eq('id', a.id)
        await cargar()
    }

    // ── Ubicaciones ──
    function abrirNuevaUbic(almacenId) {
        setFormUbic(VACIO_UBIC); setErrorUbic('')
        setModalUbic({ almacen_id: almacenId })
    }

    function abrirEditarUbic(almacenId, ubic) {
        setFormUbic({ nombre: ubic.nombre, activo: ubic.activo }); setErrorUbic('')
        setModalUbic({ almacen_id: almacenId, data: ubic })
    }

    async function guardarUbic() {
        if (!formUbic.nombre.trim()) { setErrorUbic('El nombre es obligatorio'); return }
        setGuardandoUbic(true); setErrorUbic('')

        const payload = { nombre: formUbic.nombre.trim(), activo: formUbic.activo }
        const { error } = modalUbic.data
            ? await supabase.from('almacen_ubicaciones').update(payload).eq('id', modalUbic.data.id)
            : await supabase.from('almacen_ubicaciones').insert({ ...payload, almacen_id: modalUbic.almacen_id, empresa_id: perfil.empresa_id })

        setGuardandoUbic(false)
        if (error) { setErrorUbic('Error: ' + error.message); return }
        setModalUbic(null)
        await cargarUbicaciones(modalUbic.almacen_id)
    }

    async function toggleActivarUbic(almacenId, ubic) {
        await supabase.from('almacen_ubicaciones').update({ activo: !ubic.activo }).eq('id', ubic.id)
        await cargarUbicaciones(almacenId)
    }

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Almacenes</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                        Define los almacenes y sus ubicaciones internas
                    </p>
                </div>
                <button onClick={abrirNuevoAlmacen}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Nuevo almacén
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
            ) : almacenes.length === 0 ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
                    No hay almacenes registrados — crea el primero
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {almacenes.map(a => (
                        <div key={a.id} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden', opacity: a.activo ? 1 : 0.6 }}>
                            {/* Fila del almacén */}
                            <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', gap: '12px' }}>
                                <button onClick={() => toggleExpandir(a.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '2px', display: 'flex' }}>
                                    {expandido[a.id] ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                                </button>
                                <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '8px' }}>
                                    <Warehouse size={18} style={{ color: '#16a34a' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{a.nombre}</span>
                                        {a.es_default && (
                                            <span style={{ fontSize: '11px', backgroundColor: '#fef9c3', color: '#854d0e', padding: '1px 8px', borderRadius: '20px', border: '1px solid #fde68a' }}>
                                                Principal
                                            </span>
                                        )}
                                        {!a.activo && (
                                            <span style={{ fontSize: '11px', backgroundColor: '#f3f4f6', color: '#9ca3af', padding: '1px 8px', borderRadius: '20px' }}>
                                                Inactivo
                                            </span>
                                        )}
                                    </div>
                                    {a.descripcion && (
                                        <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0' }}>{a.descripcion}</p>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => abrirEditarAlmacen(a)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                        <Pencil size={11} /> Editar
                                    </button>
                                    <button onClick={() => toggleActivarAlmacen(a)}
                                        style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', color: a.activo ? '#dc2626' : '#16a34a', cursor: 'pointer' }}>
                                        {a.activo ? 'Desactivar' : 'Activar'}
                                    </button>
                                </div>
                            </div>

                            {/* Ubicaciones expandidas */}
                            {expandido[a.id] && (
                                <div style={{ borderTop: '1px solid #f3f4f6', backgroundColor: '#f9fafb', padding: '16px 20px 16px 52px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <MapPin size={12} /> Ubicaciones internas
                                        </span>
                                        <button onClick={() => abrirNuevaUbic(a.id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#fff', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                                            <Plus size={12} /> Agregar
                                        </button>
                                    </div>

                                    {!ubicacionesPor[a.id] ? (
                                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>Cargando...</div>
                                    ) : ubicacionesPor[a.id].length === 0 ? (
                                        <div style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic' }}>
                                            Sin ubicaciones — este almacén se usa sin subdivisiones
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {ubicacionesPor[a.id].map(u => (
                                                <div key={u.id} style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                    backgroundColor: '#fff', border: '1px solid #e5e7eb',
                                                    borderRadius: '8px', padding: '6px 12px',
                                                    opacity: u.activo ? 1 : 0.5,
                                                }}>
                                                    <span style={{ fontSize: '13px', color: '#374151', fontWeight: 500 }}>{u.nombre}</span>
                                                    {!u.activo && <span style={{ fontSize: '10px', color: '#9ca3af' }}>inactiva</span>}
                                                    <button onClick={() => abrirEditarUbic(a.id, u)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0', display: 'flex' }}>
                                                        <Pencil size={11} />
                                                    </button>
                                                    <button onClick={() => toggleActivarUbic(a.id, u)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: u.activo ? '#dc2626' : '#16a34a', padding: '0', display: 'flex' }}>
                                                        <X size={11} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Modal almacén */}
            {modalAlmacen && (
                <>
                    <div onClick={() => setModalAlmacen(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                                {modalAlmacen === 'nuevo' ? 'Nuevo almacén' : 'Editar almacén'}
                            </h3>
                            <button onClick={() => setModalAlmacen(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nombre *</label>
                                <input value={formAlmacen.nombre} onChange={e => setFormAlmacen(p => ({ ...p, nombre: e.target.value }))}
                                    placeholder="Ej: Almacén Principal, Cámara Fría..." style={inputStyle} autoFocus />
                            </div>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Descripción <span style={{ fontWeight: 400, color: '#9ca3af' }}>(opcional)</span></label>
                                <input value={formAlmacen.descripcion} onChange={e => setFormAlmacen(p => ({ ...p, descripcion: e.target.value }))}
                                    placeholder="Ej: Almacén de producto terminado en planta" style={inputStyle} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="checkbox" id="es_default" checked={formAlmacen.es_default}
                                        onChange={e => setFormAlmacen(p => ({ ...p, es_default: e.target.checked }))}
                                        style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                    <label htmlFor="es_default" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>
                                        Almacén principal <span style={{ fontSize: '12px', color: '#9ca3af' }}>(se pre-selecciona por defecto)</span>
                                    </label>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="checkbox" id="activo_a" checked={formAlmacen.activo}
                                        onChange={e => setFormAlmacen(p => ({ ...p, activo: e.target.checked }))}
                                        style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                    <label htmlFor="activo_a" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Activo</label>
                                </div>
                            </div>
                        </div>
                        {errorAlmacen && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{errorAlmacen}</div>}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={guardarAlmacen} disabled={guardandoAlmacen}
                                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoAlmacen ? 0.6 : 1 }}>
                                <Check size={16} /> {guardandoAlmacen ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button onClick={() => setModalAlmacen(null)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* Modal ubicación */}
            {modalUbic && (
                <>
                    <div onClick={() => setModalUbic(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '380px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                                {modalUbic.data ? 'Editar ubicación' : 'Nueva ubicación'}
                            </h3>
                            <button onClick={() => setModalUbic(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nombre *</label>
                                <input value={formUbic.nombre} onChange={e => setFormUbic(p => ({ ...p, nombre: e.target.value }))}
                                    placeholder="Ej: Pasillo A, Estante 3, Cámara 1..." style={inputStyle} autoFocus />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" id="activo_u" checked={formUbic.activo}
                                    onChange={e => setFormUbic(p => ({ ...p, activo: e.target.checked }))}
                                    style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                <label htmlFor="activo_u" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Activa</label>
                            </div>
                        </div>
                        {errorUbic && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{errorUbic}</div>}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={guardarUbic} disabled={guardandoUbic}
                                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoUbic ? 0.6 : 1 }}>
                                <Check size={16} /> {guardandoUbic ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button onClick={() => setModalUbic(null)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
