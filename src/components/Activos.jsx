// Activos fijos: piezas compartidas (docs/plan-activos-fijos.md)
//   FormActivo           alta (1 o N unidades) y edición de la ficha
//   ActivosDelDocumento  bloque "Activos registrados" + "Registrar como activo" en
//                        el detalle de un gasto o de una recepción
// Toda escritura va por RPC (activos_fijos.sql). Los montos (activo_valores) solo
// los leen admin/finanzas: la RLS devuelve el embed vacío a los demás.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { X, Plus, Archive } from 'lucide-react'
import FiltroCombo from './FiltroCombo'
import { hoyYMD, fmtFechaCorta } from './SelectorFechaTasa'

export const ESTADOS_ACTIVO = {
    operativo:     { bg: '#dcfce7', color: '#166534', label: 'Operativo' },
    mantenimiento: { bg: '#dbeafe', color: '#1e40af', label: 'En mantenimiento' },
    danado:        { bg: '#fee2e2', color: '#991b1b', label: 'Dañado' },
    desuso:        { bg: '#fef9c3', color: '#854d0e', label: 'En desuso' },
    baja:          { bg: '#f3f4f6', color: '#6b7280', label: 'Dado de baja' },
}

export const TIPOS_BAJA = {
    venta: 'Venta', robo: 'Robo o pérdida', dano: 'Daño sin reparación', donacion: 'Donación', desecho: 'Desecho', otro: 'Otro',
}

export function BadgeEstadoActivo({ estado }) {
    const s = ESTADOS_ACTIVO[estado] || ESTADOS_ACTIVO.operativo
    return <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{s.label}</span>
}

// Permisos del lado de la pantalla (la base los vuelve a validar)
export function usePermisosActivos() {
    const { perfil, modulosActivos } = useAuth()
    const esSuper = perfil?.rol === 'superadmin'
    return {
        puedeOperar: esSuper || (modulosActivos || []).includes('activos'),
        verValores: esSuper || ['admin', 'finanzas'].includes(perfil?.rol),   // decisión 0.5
    }
}

// Depreciación REFERENCIAL en línea recta (la oficial va en Galac)
export function depreciacionReferencial(valor, residual, vidaMeses, fechaAdq, hasta = hoyYMD()) {
    const v = Number(valor || 0), r = Number(residual || 0), vida = Number(vidaMeses || 0)
    if (!vida || !fechaAdq) return null
    const [y1, m1] = fechaAdq.split('-').map(Number)
    const [y2, m2] = hasta.split('-').map(Number)
    const meses = Math.max(0, (y2 - y1) * 12 + (m2 - m1))
    const acumulada = Math.min(Math.max(0, v - r), (Math.max(0, v - r) * meses) / vida)
    return { meses, acumulada, valorReferencial: v - acumulada, mensual: Math.max(0, v - r) / vida }
}

export const fmtUsd = n => `$${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const inputActivo = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box', fontFamily: 'inherit',
}
const lbl = { fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }
const seccion = { fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '18px 0 10px' }

// ══════════════════════════════════════════════════════════════
// FORMULARIO (alta / edición)
//   activo:  ficha a editar (con activo_valores si se ven) | null = alta
//   origen:  { tipo: 'gasto'|'compra', id, numero, proveedor, fecha, valor, nombre } al
//            registrar desde un gasto o una recepción (queda fijo)
// ══════════════════════════════════════════════════════════════
export function FormActivo({ activo = null, origen = null, onGuardado, onCerrar }) {
    const { perfil } = useAuth()
    const { verValores } = usePermisosActivos()
    const editando = !!activo
    const val = activo?.activo_valores || null

    const [categorias, setCategorias] = useState([])
    const [ubicaciones, setUbicaciones] = useState([])
    const [usuarios, setUsuarios] = useState([])
    const [proveedores, setProveedores] = useState([])
    const [documentos, setDocumentos] = useState({ gasto: [], compra: [] })
    const [minimo, setMinimo] = useState(100)

    const [f, setF] = useState(() => ({
        nombre: activo?.nombre ?? origen?.nombre ?? '',
        categoria_id: activo?.categoria_id ?? '',
        marca: activo?.marca ?? '', modelo: activo?.modelo ?? '', serial: activo?.serial ?? '',
        cantidad: '1',
        ubicacion_id: '', responsable_id: '', estado: 'operativo',
        fecha_adquisicion: activo?.fecha_adquisicion ?? origen?.fecha ?? hoyYMD(),
        garantia_hasta: activo?.garantia_hasta ?? '',
        origen_tipo: activo ? (activo.gasto_id ? 'gasto' : activo.compra_id ? 'compra' : '') : (origen?.tipo ?? ''),
        origen_id: activo ? (activo.gasto_id || activo.compra_id || '') : (origen?.id ?? ''),
        proveedor_id: activo && !activo.gasto_id && !activo.compra_id ? (activo.proveedor_id ?? '') : '',
        valor_adquisicion: val?.valor_adquisicion != null ? String(val.valor_adquisicion)
            : origen?.valor != null ? String(Number(origen.valor).toFixed(2)) : '',
        vida_util_meses: val?.vida_util_meses != null ? String(val.vida_util_meses) : '',
        valor_residual: val?.valor_residual != null ? String(val.valor_residual) : '0',
        observaciones: activo?.observaciones ?? '',
    }))
    const set = (k, v) => { setF(prev => ({ ...prev, [k]: v })); setConfirmar(false) }

    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [avisos, setAvisos] = useState([])
    const [confirmar, setConfirmar] = useState(false)   // ya vio los avisos y quiere guardar igual

    useEffect(() => {
        const e = perfil.empresa_id
        supabase.from('activo_categorias').select('id, nombre, vida_util_meses, activa').eq('empresa_id', e).order('nombre')
            .then(({ data }) => setCategorias(data || []))
        supabase.from('activo_ubicaciones').select('id, nombre, activa').eq('empresa_id', e).eq('activa', true).order('nombre')
            .then(({ data }) => {
                setUbicaciones(data || [])
                if (!editando && data?.length) setF(prev => prev.ubicacion_id ? prev
                    : { ...prev, ubicacion_id: (data.find(u => /^activos$/i.test(u.nombre)) || data[0]).id })
            })
        supabase.from('usuarios').select('id, nombre, activo').eq('empresa_id', e).order('nombre')
            .then(({ data }) => setUsuarios((data || []).filter(u => u.activo !== false)))
        supabase.from('empresas').select('activos_valor_minimo').eq('id', e).single()
            .then(({ data }) => { if (data?.activos_valor_minimo != null) setMinimo(Number(data.activos_valor_minimo)) })
        if (!origen) {
            supabase.from('proveedores').select('id, nombre').eq('empresa_id', e).eq('activo', true).order('nombre')
                .then(({ data }) => setProveedores(data || []))
            // Documentos de origen: últimos 18 meses, sin anulados
            const desde = new Date(); desde.setMonth(desde.getMonth() - 18)
            const d = desde.toISOString().slice(0, 10)
            Promise.all([
                supabase.from('gastos').select('id, numero_gasto, nombre, fecha, proveedores(nombre)').eq('empresa_id', e)
                    .neq('estado', 'anulado').gte('fecha', d).order('fecha', { ascending: false }).limit(1000),
                supabase.from('compras').select('id, numero_doc, fecha_compra, proveedores(nombre)').eq('empresa_id', e)
                    .neq('estado', 'anulada').gte('fecha_compra', d).order('fecha_compra', { ascending: false }).limit(1000),
            ]).then(([g, c]) => setDocumentos({
                gasto: (g.data || []).map(x => ({ value: x.id, label: `${x.numero_gasto || 'Gasto'} · ${fmtFechaCorta(x.fecha)} · ${x.nombre || ''}${x.proveedores?.nombre ? ' · ' + x.proveedores.nombre : ''}` })),
                compra: (c.data || []).map(x => ({ value: x.id, label: `${x.numero_doc} · ${fmtFechaCorta(String(x.fecha_compra).slice(0, 10))}${x.proveedores?.nombre ? ' · ' + x.proveedores.nombre : ''}` })),
            }))
        }
    }, [])

    // Vida útil sugerida por la categoría (solo si está vacía)
    function elegirCategoria(id) {
        const c = categorias.find(x => x.id === id)
        setF(prev => ({ ...prev, categoria_id: id,
            vida_util_meses: prev.vida_util_meses === '' && c?.vida_util_meses ? String(c.vida_util_meses) : prev.vida_util_meses }))
        setConfirmar(false)
    }

    const cantidad = Math.max(1, parseInt(f.cantidad || '1', 10) || 1)
    const pideValores = !editando || verValores   // al crear, quien registra carga el valor de la factura

    async function guardar() {
        setError('')
        if (!f.nombre.trim()) return setError('El nombre es obligatorio')
        if (!f.categoria_id) return setError('Elige una categoría')
        if (!editando && !f.ubicacion_id) return setError('Elige una ubicación')
        if (!f.fecha_adquisicion) return setError('La fecha de adquisición es obligatoria')
        if (f.origen_tipo && !f.origen_id) return setError(`Elige ${f.origen_tipo === 'gasto' ? 'el gasto' : 'la recepción'} de origen o quita el documento`)
        const valor = Number(f.valor_adquisicion)
        if (pideValores && (f.valor_adquisicion === '' || !(valor >= 0))) return setError('El valor de adquisición es obligatorio')
        if (!editando && (cantidad < 1 || cantidad > 50)) return setError('Cantidad entre 1 y 50')

        // Avisos que no bloquean: se confirma con un segundo clic
        if (!confirmar) {
            const lista = []
            if (pideValores && valor < minimo)
                lista.push(`El valor (${fmtUsd(valor)}) está por debajo del mínimo de ${fmtUsd(minimo)}: normalmente se registra solo como gasto.`)
            const serial = f.serial.trim()
            if (serial && cantidad === 1) {
                let q = supabase.from('activos').select('codigo, nombre').eq('empresa_id', perfil.empresa_id).ilike('serial', serial)
                if (editando) q = q.neq('id', activo.id)
                const { data } = await q
                if (data?.length) lista.push(`El serial ${serial} ya está en ${data.map(a => `${a.codigo} (${a.nombre})`).join(', ')}.`)
            }
            if (lista.length) { setAvisos(lista); setConfirmar(true); return }
        }

        const datos = {
            nombre: f.nombre.trim(), categoria_id: f.categoria_id,
            marca: f.marca, modelo: f.modelo, serial: cantidad > 1 ? '' : f.serial,
            fecha_adquisicion: f.fecha_adquisicion, garantia_hasta: f.garantia_hasta || '',
            gasto_id: f.origen_tipo === 'gasto' ? f.origen_id : null,
            compra_id: f.origen_tipo === 'compra' ? f.origen_id : null,
            proveedor_id: !f.origen_tipo && f.proveedor_id ? f.proveedor_id : null,
            observaciones: f.observaciones,
        }
        if (pideValores) Object.assign(datos, {
            valor_adquisicion: valor, vida_util_meses: f.vida_util_meses || '', valor_residual: f.valor_residual || '0',
        })

        setGuardando(true)
        let res
        if (editando) {
            res = await supabase.rpc('editar_activo', { p_id: activo.id, p_datos: datos })
        } else {
            Object.assign(datos, { ubicacion_id: f.ubicacion_id, responsable_id: f.responsable_id || null, estado: f.estado })
            res = await supabase.rpc('crear_activo', { p_datos: datos, p_cantidad: cantidad })
        }
        setGuardando(false)
        if (res.error) { setError(res.error.message); setConfirmar(false); setAvisos([]); return }
        onGuardado?.(res.data)
    }

    const fila2 = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '12px' }

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '640px', maxHeight: '92vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                        {editando ? `Editar ${activo.codigo}` : 'Registrar activo'}
                    </h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>
                {origen && (
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px' }}>
                        Desde {origen.tipo === 'gasto' ? 'el gasto' : 'la recepción'} <b style={{ fontFamily: 'monospace' }}>{origen.numero}</b>
                        {origen.proveedor ? ` · ${origen.proveedor}` : ''}
                    </p>
                )}

                <p style={seccion}>Identificación</p>
                <div style={{ marginBottom: '12px' }}>
                    <label style={lbl}>Nombre *</label>
                    <input value={f.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ej: Nevera exhibidora 2 puertas" style={inputActivo} />
                </div>
                <div style={fila2}>
                    <div>
                        <label style={lbl}>Categoría *</label>
                        <select value={f.categoria_id} onChange={e => elegirCategoria(e.target.value)} style={inputActivo}>
                            <option value="">— Elegir —</option>
                            {categorias.filter(c => c.activa || c.id === f.categoria_id).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                        </select>
                    </div>
                    {!editando && (
                        <div>
                            <label style={lbl}>Cantidad de unidades</label>
                            <input type="number" min="1" max="50" value={f.cantidad} onChange={e => set('cantidad', e.target.value)} style={inputActivo} />
                        </div>
                    )}
                </div>
                <div style={fila2}>
                    <div><label style={lbl}>Marca</label><input value={f.marca} onChange={e => set('marca', e.target.value)} style={inputActivo} /></div>
                    <div><label style={lbl}>Modelo</label><input value={f.modelo} onChange={e => set('modelo', e.target.value)} style={inputActivo} /></div>
                    <div>
                        <label style={lbl}>Serial</label>
                        <input value={cantidad > 1 ? '' : f.serial} disabled={cantidad > 1} onChange={e => set('serial', e.target.value)}
                            placeholder={cantidad > 1 ? 'Se carga en cada ficha' : ''} style={{ ...inputActivo, backgroundColor: cantidad > 1 ? '#f9fafb' : '#fff' }} />
                    </div>
                </div>
                {!editando && cantidad > 1 && (
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '-4px 0 12px' }}>
                        Se crean {cantidad} fichas iguales (una por unidad, cada una con su código). El serial se carga después en cada una.
                    </p>
                )}

                {!editando && (
                    <>
                        <p style={seccion}>Dónde está</p>
                        <div style={fila2}>
                            <div>
                                <label style={lbl}>Ubicación *</label>
                                <select value={f.ubicacion_id} onChange={e => set('ubicacion_id', e.target.value)} style={inputActivo}>
                                    <option value="">— Elegir —</option>
                                    {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <FiltroCombo label="Responsable" value={f.responsable_id} onChange={v => set('responsable_id', v)} width="100%"
                                    placeholder="Sin responsable" options={usuarios.map(u => ({ value: u.id, label: u.nombre }))} />
                            </div>
                            <div>
                                <label style={lbl}>Estado</label>
                                <select value={f.estado} onChange={e => set('estado', e.target.value)} style={inputActivo}>
                                    {Object.entries(ESTADOS_ACTIVO).filter(([k]) => k !== 'baja').map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                                </select>
                            </div>
                        </div>
                    </>
                )}

                <p style={seccion}>Compra</p>
                <div style={fila2}>
                    <div>
                        <label style={lbl}>Fecha de adquisición *</label>
                        <input type="date" value={f.fecha_adquisicion} max={hoyYMD()} onChange={e => set('fecha_adquisicion', e.target.value)} style={inputActivo} />
                    </div>
                    <div>
                        <label style={lbl}>Garantía hasta</label>
                        <input type="date" value={f.garantia_hasta} onChange={e => set('garantia_hasta', e.target.value)} style={inputActivo} />
                    </div>
                </div>
                {!origen && (
                    <div style={fila2}>
                        <div>
                            <label style={lbl}>Documento de origen</label>
                            <select value={f.origen_tipo} onChange={e => { set('origen_tipo', e.target.value); set('origen_id', '') }} style={inputActivo}>
                                <option value="">Sin documento (anterior al sistema)</option>
                                <option value="gasto">Gasto</option>
                                <option value="compra">Recepción de compra</option>
                            </select>
                        </div>
                        {f.origen_tipo ? (
                            <div>
                                <FiltroCombo label={f.origen_tipo === 'gasto' ? 'Gasto' : 'Recepción'} value={f.origen_id} width="100%"
                                    onChange={v => set('origen_id', v)} placeholder="— Elegir —" options={documentos[f.origen_tipo] || []} />
                            </div>
                        ) : (
                            <div>
                                <FiltroCombo label="Proveedor" value={f.proveedor_id} onChange={v => set('proveedor_id', v)} width="100%"
                                    placeholder="Sin proveedor" options={proveedores.map(p => ({ value: p.id, label: p.nombre }))} />
                            </div>
                        )}
                    </div>
                )}

                {pideValores && (
                    <>
                        <p style={seccion}>Montos (USD, sin IVA)</p>
                        <div style={fila2}>
                            <div>
                                <label style={lbl}>Valor de adquisición {cantidad > 1 ? 'por unidad ' : ''}*</label>
                                <input type="number" min="0" step="0.01" value={f.valor_adquisicion} onChange={e => set('valor_adquisicion', e.target.value)} style={inputActivo} />
                            </div>
                            <div>
                                <label style={lbl}>Vida útil (meses)</label>
                                <input type="number" min="1" value={f.vida_util_meses} onChange={e => set('vida_util_meses', e.target.value)} style={inputActivo} />
                            </div>
                            <div>
                                <label style={lbl}>Valor residual</label>
                                <input type="number" min="0" step="0.01" value={f.valor_residual} onChange={e => set('valor_residual', e.target.value)} style={inputActivo} />
                            </div>
                        </div>
                        {origen?.valor != null && cantidad > 1 && (
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '-4px 0 12px' }}>
                                El documento suma {fmtUsd(origen.valor)}: el valor va por unidad ({cantidad} × {fmtUsd(f.valor_adquisicion)} = {fmtUsd(cantidad * Number(f.valor_adquisicion || 0))}).
                            </p>
                        )}
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '-4px 0 12px' }}>
                            La vida útil y el residual solo sirven para una depreciación de referencia; la contable va en Galac.
                        </p>
                    </>
                )}

                <div>
                    <label style={lbl}>Observaciones</label>
                    <textarea value={f.observaciones} onChange={e => set('observaciones', e.target.value)} rows={2} style={{ ...inputActivo, resize: 'vertical' }} />
                </div>

                {confirmar && avisos.length > 0 && (
                    <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#92400e', marginTop: '14px' }}>
                        {avisos.map((a, i) => <div key={i}>{a}</div>)}
                        <div style={{ marginTop: '6px', fontWeight: 500 }}>Si es correcto, pulsa "Guardar de todos modos".</div>
                    </div>
                )}
                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{error}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                    <button onClick={onCerrar} disabled={guardando} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={guardar} disabled={guardando}
                        style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', backgroundColor: confirmar ? '#d97706' : '#16a34a', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Guardando…' : confirmar ? 'Guardar de todos modos' : editando ? 'Guardar cambios' : cantidad > 1 ? `Registrar ${cantidad} activos` : 'Registrar activo'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// BLOQUE EN EL DETALLE DE UN GASTO O UNA RECEPCIÓN
//   tipo: 'gasto' | 'compra'; origen: { id, numero, proveedor, fecha, valor, nombre }
// ══════════════════════════════════════════════════════════════
export function ActivosDelDocumento({ tipo, origen, anulado = false }) {
    const { perfil } = useAuth()
    const { puedeOperar } = usePermisosActivos()
    const [activos, setActivos] = useState([])
    const [form, setForm] = useState(false)
    const [aviso, setAviso] = useState('')

    async function cargar() {
        const { data } = await supabase.from('activos').select('id, codigo, nombre, estado, activo_ubicaciones(nombre)')
            .eq('empresa_id', perfil.empresa_id).eq(tipo === 'gasto' ? 'gasto_id' : 'compra_id', origen.id).order('codigo')
        setActivos(data || [])
    }
    useEffect(() => { if (perfil?.empresa_id && origen?.id) cargar() }, [perfil?.empresa_id, origen?.id])

    if (!puedeOperar && activos.length === 0) return null
    if (anulado && activos.length === 0) return null

    return (
        <div className="no-print" style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: activos.length ? '10px' : 0 }}>
                <Archive size={15} style={{ color: '#6b7280' }} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#374151' }}>
                    {activos.length ? `Activos registrados desde este documento (${activos.length})` : 'Activos fijos'}
                </span>
                {puedeOperar && !anulado && (
                    <button onClick={() => { setAviso(''); setForm(true) }}
                        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#fff', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={13} /> Registrar como activo
                    </button>
                )}
            </div>
            {!activos.length && puedeOperar && !anulado && (
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '6px 0 0' }}>
                    Si esta compra es un equipo (máquina, nevera, vehículo, computadora…), regístralo para controlar dónde está y quién lo tiene.
                </p>
            )}
            {activos.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderTop: '1px solid #f3f4f6', fontSize: '13px' }}>
                    <span style={{ fontFamily: 'monospace', color: '#374151' }}>{a.codigo}</span>
                    <span style={{ flex: 1, color: '#1f2937' }}>{a.nombre}</span>
                    <span style={{ color: '#6b7280', fontSize: '12px' }}>{a.activo_ubicaciones?.nombre}</span>
                    <BadgeEstadoActivo estado={a.estado} />
                </div>
            ))}
            {aviso && <p style={{ fontSize: '12px', color: '#166534', margin: '8px 0 0' }}>{aviso}</p>}
            {form && (
                <FormActivo origen={{ tipo, ...origen }} onCerrar={() => setForm(false)}
                    onGuardado={res => { setForm(false); setAviso(`Registrado: ${(res || []).map(r => r.codigo).join(', ')}. Lo ves en Activos.`); cargar() }} />
            )}
        </div>
    )
}
