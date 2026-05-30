import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Pencil, Check, Search, X, Star, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const VACIO = {
    nombre: '', rif: '', telefono: '', contacto: '', tipo: '', codigo: '', activo: true, direccion_fiscal: '',
    condicion_pago: 'contado', dias_credito: 0,
}

const VACIO_CUENTA = {
    banco: '', tipo_cuenta: 'corriente', numero_cuenta: '', titular: '', rif_titular: '', es_predeterminada: false,
}

const TIPOS_CUENTA = [
    { value: 'corriente', label: 'Corriente' },
    { value: 'ahorro', label: 'Ahorro' },
    { value: 'pago_movil', label: 'Pago Móvil' },
]

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

    // Cuentas bancarias
    const [cuentas, setCuentas] = useState([])
    const [modalCuenta, setModalCuenta] = useState(null) // null | 'nuevo' | objeto cuenta
    const [formCuenta, setFormCuenta] = useState(VACIO_CUENTA)
    const [guardandoCuenta, setGuardandoCuenta] = useState(false)
    const [errorCuenta, setErrorCuenta] = useState('')

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase.from('proveedores').select('*')
            .eq('empresa_id', perfil.empresa_id).order('nombre')
        if (data) setProveedores(data)
        setLoading(false)
    }

    async function cargarCuentas(proveedorId) {
        const { data } = await supabase.from('cuentas_proveedor')
            .select('*')
            .eq('proveedor_id', proveedorId)
            .eq('empresa_id', perfil.empresa_id)
            .order('es_predeterminada', { ascending: false })
            .order('created_at')
        if (data) setCuentas(data)
    }

    function abrirNuevo() {
        setEditando(null); setForm(VACIO); setCuentas([]); setError(''); setVista('form')
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
        cargarCuentas(p.id)
        setError(''); setVista('form')
    }

    function campo(k, v) { setForm(prev => ({ ...prev, [k]: v })) }
    function campoCuenta(k, v) { setFormCuenta(prev => ({ ...prev, [k]: v })) }

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

        let proveedorId = editando
        const { data, error: err } = editando
            ? await supabase.from('proveedores').update(payload).eq('id', editando).select()
            : await supabase.from('proveedores').insert({ ...payload, empresa_id: perfil.empresa_id }).select()

        setGuardando(false)
        if (err) { setError('Error: ' + err.message); return }

        // Para proveedores nuevos: guardar cuentas temporales con el ID real
        if (!editando && data?.[0]?.id) {
            proveedorId = data[0].id
            if (cuentas.length > 0) {
                await supabase.from('cuentas_proveedor').insert(
                    cuentas.map(({ _isTemp, id, ...c }) => ({
                        ...c,
                        proveedor_id: proveedorId,
                        empresa_id: perfil.empresa_id,
                    }))
                )
            }
        }

        setExito(editando ? 'Proveedor actualizado' : 'Proveedor creado')
        setTimeout(() => setExito(''), 3000)
        await cargar(); setVista('lista')
    }

    // ── Gestión de cuentas ──
    function abrirNuevaCuenta() {
        setFormCuenta({ ...VACIO_CUENTA, es_predeterminada: cuentas.length === 0 })
        setErrorCuenta('')
        setModalCuenta('nuevo')
    }

    function abrirEditarCuenta(c) {
        setFormCuenta({
            banco: c.banco || '',
            tipo_cuenta: c.tipo_cuenta || 'corriente',
            numero_cuenta: c.numero_cuenta || '',
            titular: c.titular || '',
            rif_titular: c.rif_titular || '',
            es_predeterminada: c.es_predeterminada,
        })
        setErrorCuenta('')
        setModalCuenta(c)
    }

    async function guardarCuenta() {
        if (!formCuenta.banco.trim()) { setErrorCuenta('El banco es obligatorio'); return }
        if (!formCuenta.numero_cuenta.trim()) { setErrorCuenta('El número de cuenta es obligatorio'); return }
        setGuardandoCuenta(true); setErrorCuenta('')

        const payload = {
            banco: formCuenta.banco.trim(),
            tipo_cuenta: formCuenta.tipo_cuenta,
            numero_cuenta: formCuenta.numero_cuenta.trim(),
            titular: formCuenta.titular.trim() || null,
            rif_titular: formCuenta.rif_titular.trim() || null,
            es_predeterminada: formCuenta.es_predeterminada,
            activa: true,
        }

        // Proveedor nuevo: gestión local
        if (!editando) {
            if (modalCuenta === 'nuevo') {
                const nuevas = formCuenta.es_predeterminada
                    ? cuentas.map(c => ({ ...c, es_predeterminada: false }))
                    : [...cuentas]
                setCuentas([...nuevas, { ...payload, id: `temp_${Date.now()}`, _isTemp: true }])
            } else {
                setCuentas(prev => prev.map(c => {
                    if (c.id !== modalCuenta.id) return formCuenta.es_predeterminada ? { ...c, es_predeterminada: false } : c
                    return { ...c, ...payload }
                }))
            }
            setGuardandoCuenta(false)
            setModalCuenta(null)
            return
        }

        // Proveedor existente: guardar en BD
        if (payload.es_predeterminada) {
            await supabase.from('cuentas_proveedor')
                .update({ es_predeterminada: false })
                .eq('proveedor_id', editando)
        }

        const { error: err } = modalCuenta === 'nuevo'
            ? await supabase.from('cuentas_proveedor').insert({ ...payload, proveedor_id: editando, empresa_id: perfil.empresa_id })
            : await supabase.from('cuentas_proveedor').update(payload).eq('id', modalCuenta.id)

        setGuardandoCuenta(false)
        if (err) { setErrorCuenta('Error: ' + err.message); return }
        await cargarCuentas(editando)
        setModalCuenta(null)
    }

    async function eliminarCuenta(c) {
        if (!editando) {
            setCuentas(prev => prev.filter(x => x.id !== c.id))
            return
        }
        await supabase.from('cuentas_proveedor').delete().eq('id', c.id)
        await cargarCuentas(editando)
    }

    async function togglePredeterminada(c) {
        if (!editando) {
            setCuentas(prev => prev.map(x => ({ ...x, es_predeterminada: x.id === c.id })))
            return
        }
        await supabase.from('cuentas_proveedor').update({ es_predeterminada: false }).eq('proveedor_id', editando)
        await supabase.from('cuentas_proveedor').update({ es_predeterminada: true }).eq('id', c.id)
        await cargarCuentas(editando)
    }

    const filtrados = proveedores.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.rif?.toLowerCase().includes(busqueda.toLowerCase())
    )

    // ── FORMULARIO ──
    if (vista === 'form') return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={() => setVista('lista')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{editando ? 'Editar proveedor' : 'Nuevo proveedor'}</h1>
            </div>

            {/* Datos generales */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 16px' }}>Datos generales</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <Campo label="Nombre *" span={2}><input value={form.nombre} onChange={e => campo('nombre', e.target.value)} style={inputStyle} /></Campo>
                    <Campo label="RIF / Cédula"><input value={form.rif} onChange={e => campo('rif', e.target.value)} placeholder="J-12345678-9" style={inputStyle} /></Campo>
                    <Campo label="Teléfono"><input value={form.telefono} onChange={e => campo('telefono', e.target.value)} placeholder="0212-000-0000" style={inputStyle} /></Campo>
                    <Campo label="Persona de contacto" span={2}><input value={form.contacto} onChange={e => campo('contacto', e.target.value)} placeholder="Nombre del contacto" style={inputStyle} /></Campo>
                    <Campo label="Dirección Fiscal" span={2}>
                        <textarea value={form.direccion_fiscal} onChange={e => campo('direccion_fiscal', e.target.value)}
                            placeholder="Dirección completa para facturación / domicilio fiscal..." rows={2}
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
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
                    {editando && (
                        <Campo label="Código" span={2}>
                            <input value={form.codigo || '—'} disabled style={{ ...inputStyle, backgroundColor: '#f9fafb', color: '#6b7280' }} />
                        </Campo>
                    )}
                    <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" id="activo" checked={form.activo} onChange={e => campo('activo', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                        <label htmlFor="activo" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Proveedor activo</label>
                    </div>
                </div>
            </div>

            {/* Cuentas bancarias */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Datos de pago</p>
                    <button onClick={abrirNuevaCuenta}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={13} /> Agregar cuenta
                    </button>
                </div>

                {cuentas.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#9ca3af', fontSize: '13px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db' }}>
                        Sin cuentas registradas — agrega la primera
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {cuentas.map((c, idx) => (
                            <div key={c.id || idx} style={{ backgroundColor: c.es_predeterminada ? '#f0fdf4' : '#f9fafb', borderRadius: '10px', border: `1px solid ${c.es_predeterminada ? '#bbf7d0' : '#e5e7eb'}`, padding: '12px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>{c.banco}</span>
                                            <span style={{ fontSize: '11px', backgroundColor: '#e0e7ff', color: '#3730a3', padding: '1px 8px', borderRadius: '20px' }}>
                                                {TIPOS_CUENTA.find(t => t.value === c.tipo_cuenta)?.label || c.tipo_cuenta}
                                            </span>
                                            {c.es_predeterminada && (
                                                <span style={{ fontSize: '11px', backgroundColor: '#fef9c3', color: '#854d0e', padding: '1px 8px', borderRadius: '20px', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                    <Star size={10} /> Predeterminada
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#374151', fontFamily: 'monospace' }}>{c.numero_cuenta}</div>
                                        {(c.titular || c.rif_titular) && (
                                            <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                                {[c.titular, c.rif_titular].filter(Boolean).join(' · ')}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                        {!c.es_predeterminada && (
                                            <button onClick={() => togglePredeterminada(c)} title="Marcar como predeterminada"
                                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#9ca3af' }}>
                                                <Star size={12} />
                                            </button>
                                        )}
                                        <button onClick={() => abrirEditarCuenta(c)}
                                            style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            <Pencil size={11} /> Editar
                                        </button>
                                        <button onClick={() => eliminarCuenta(c)}
                                            style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#dc2626' }}>
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
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

            {/* Modal de cuenta */}
            {modalCuenta && (
                <>
                    <div onClick={() => setModalCuenta(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '480px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                                {modalCuenta === 'nuevo' ? 'Nueva cuenta' : 'Editar cuenta'}
                            </h3>
                            <button onClick={() => setModalCuenta(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                            <CampoM label="Banco *" span={2}>
                                <input value={formCuenta.banco} onChange={e => campoCuenta('banco', e.target.value)} placeholder="Ej: Banco de Venezuela" style={inputStyle} />
                            </CampoM>
                            <CampoM label="Tipo de cuenta">
                                <select value={formCuenta.tipo_cuenta} onChange={e => campoCuenta('tipo_cuenta', e.target.value)} style={inputStyle}>
                                    {TIPOS_CUENTA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                            </CampoM>
                            <CampoM label={formCuenta.tipo_cuenta === 'pago_movil' ? 'Teléfono *' : 'N° de cuenta *'}>
                                <input value={formCuenta.numero_cuenta} onChange={e => campoCuenta('numero_cuenta', e.target.value)}
                                    placeholder={formCuenta.tipo_cuenta === 'pago_movil' ? '0414-000-0000' : '0102-0000-00-0000000000'} style={inputStyle} />
                            </CampoM>
                            <CampoM label="Titular" span={2}>
                                <input value={formCuenta.titular} onChange={e => campoCuenta('titular', e.target.value)} placeholder="Nombre del titular de la cuenta" style={inputStyle} />
                            </CampoM>
                            <CampoM label="RIF / Cédula del titular" span={2}>
                                <input value={formCuenta.rif_titular} onChange={e => campoCuenta('rif_titular', e.target.value)} placeholder="J-12345678-9 o V-12345678" style={inputStyle} />
                            </CampoM>
                            <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="checkbox" id="predeterminada" checked={formCuenta.es_predeterminada}
                                    onChange={e => campoCuenta('es_predeterminada', e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                                <label htmlFor="predeterminada" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>Cuenta predeterminada</label>
                            </div>
                        </div>

                        {errorCuenta && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{errorCuenta}</div>}

                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button onClick={guardarCuenta} disabled={guardandoCuenta}
                                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardandoCuenta ? 0.6 : 1 }}>
                                <Check size={16} />{guardandoCuenta ? 'Guardando...' : 'Guardar cuenta'}
                            </button>
                            <button onClick={() => setModalCuenta(null)}
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
                                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280' }}>{p.tipo ? p.tipo.replace(/_/g, ' ') : '—'}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, backgroundColor: p.condicion_pago === 'credito' ? '#dbeafe' : '#f3f4f6', color: p.condicion_pago === 'credito' ? '#1e40af' : '#6b7280' }}>
                                            {p.condicion_pago === 'credito' ? `crédito ${p.dias_credito || 0}d` : 'contado'}
                                        </span>
                                    </td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.telefono || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{p.contacto || '—'}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, backgroundColor: p.activo ? '#dcfce7' : '#f3f4f6', color: p.activo ? '#166534' : '#9ca3af' }}>
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

function CampoM({ label, children, span = 1 }) {
    return (
        <div style={{ gridColumn: `span ${span}` }}>
            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>{label}</label>
            {children}
        </div>
    )
}
