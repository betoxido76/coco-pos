// Activos fijos: registro y control físico de equipos (docs/plan-activos-fijos.md)
// No es inventario: no mueve stock ni costos. Una ficha por unidad (AF-000001) con
// ubicación, responsable, estado e historial. Escritura por RPC (activos_fijos.sql):
//   crear_activo · editar_activo · registrar_movimiento_activo · dar_baja_activo · reactivar_activo
// Montos (activo_valores) solo para admin/finanzas.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { conTodas } from '../lib/traerTodas'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X, FileText, Settings, Search, MapPin, User, Wrench, Activity, Ban, RotateCcw, Pencil } from 'lucide-react'
import FiltroCombo from '../components/FiltroCombo'
import { fmtFechaCorta, hoyYMD } from '../components/SelectorFechaTasa'
import { useAltoBarra, useOrden, ordenarFilas, ThOrden, BarraFija, estiloTarjetaTabla } from '../components/TablaOrdenable'
import {
    FormActivo, BadgeEstadoActivo, ESTADOS_ACTIVO, TIPOS_BAJA, usePermisosActivos,
    depreciacionReferencial, fmtUsd, inputActivo,
} from '../components/Activos'

const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const SELECT_ACTIVO = `id, codigo, nombre, categoria_id, marca, modelo, serial, ubicacion_id, responsable_id, estado,
    fecha_adquisicion, garantia_hasta, gasto_id, compra_id, proveedor_id, observaciones, fecha_baja, tipo_baja, motivo_baja, created_at,
    activo_categorias(nombre), activo_ubicaciones(nombre), responsable:usuarios!responsable_id(nombre),
    proveedores(nombre), gastos(numero_gasto, nombre), compras(numero_doc),
    activo_valores(valor_adquisicion, vida_util_meses, valor_residual, valor_recuperacion)`

// ══════════════════════════════════════════════════════════════
// PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Activos() {
    const { perfil } = useAuth()
    const { puedeOperar, verValores } = usePermisosActivos()
    const [vista, setVista] = useState(null)          // null = lista | { ficha: id }
    const [activos, setActivos] = useState([])
    const [categorias, setCategorias] = useState([])
    const [ubicaciones, setUbicaciones] = useState([])
    const [cargando, setCargando] = useState(true)
    const [texto, setTexto] = useState('')
    const [fCategoria, setFCategoria] = useState('')
    const [fUbicacion, setFUbicacion] = useState('')
    const [fResponsable, setFResponsable] = useState('')
    const [fEstado, setFEstado] = useState('')
    const [verBajas, setVerBajas] = useState(false)
    const [form, setForm] = useState(false)
    const [maestro, setMaestro] = useState(null)      // 'categorias' | 'ubicaciones'
    const [barraRef, altoBarra] = useAltoBarra([vista])
    const [orden, ordenarPor] = useOrden({ col: 'codigo', dir: 'desc' }, ['codigo', 'fecha', 'valor'])

    async function cargarMaestros() {
        const [c, u] = await Promise.all([
            supabase.from('activo_categorias').select('id, nombre, vida_util_meses, activa').eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('activo_ubicaciones').select('id, nombre, activa').eq('empresa_id', perfil.empresa_id).order('nombre'),
        ])
        setCategorias(c.data || []); setUbicaciones(u.data || [])
    }
    async function cargar() {
        setCargando(true)
        const { data } = await conTodas(() => supabase.from('activos').select(SELECT_ACTIVO).eq('empresa_id', perfil.empresa_id).order('id'))
        setActivos(data || [])
        setCargando(false)
    }
    useEffect(() => { if (perfil?.empresa_id) { cargarMaestros(); cargar() } }, [perfil?.empresa_id])

    if (vista?.ficha) return (
        <FichaActivo id={vista.ficha} ubicaciones={ubicaciones} onVolver={() => { cargar(); setVista(null) }} />
    )

    const valorDe = a => Number(a.activo_valores?.valor_adquisicion || 0)
    const q = normalizar(texto.trim())
    const base = activos.filter(a => verBajas ? true : a.estado !== 'baja')
    const filtrados = ordenarFilas(base.filter(a =>
        (!fCategoria || a.categoria_id === fCategoria) && (!fUbicacion || a.ubicacion_id === fUbicacion)
        && (!fResponsable || (fResponsable === '__sin' ? !a.responsable_id : a.responsable_id === fResponsable))
        && (!fEstado || a.estado === fEstado)
        && (!q || normalizar([a.codigo, a.nombre, a.marca, a.modelo, a.serial].join(' ')).includes(q))
    ), {
        codigo: a => a.codigo, nombre: a => a.nombre, categoria: a => a.activo_categorias?.nombre,
        ubicacion: a => a.activo_ubicaciones?.nombre, responsable: a => a.responsable?.nombre,
        estado: a => a.estado, fecha: a => a.fecha_adquisicion, valor: valorDe,
    }, orden)

    const vigentes = filtrados.filter(a => a.estado !== 'baja')
    const kpis = [
        ['Activos', vigentes.length],
        ...(verValores ? [['Valor de adquisición', fmtUsd(vigentes.reduce((s, a) => s + valorDe(a), 0))]] : []),
        ['En mantenimiento o dañados', vigentes.filter(a => a.estado === 'mantenimiento' || a.estado === 'danado').length],
        ['Sin responsable', vigentes.filter(a => !a.responsable_id).length],
    ]
    const opcResp = [{ value: '__sin', label: 'Sin responsable' }, ...[...new Map(activos.filter(a => a.responsable)
        .map(a => [a.responsable_id, { value: a.responsable_id, label: a.responsable.nombre }])).values()]
        .sort((a, b) => a.label.localeCompare(b.label))]

    const btnSec = { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', cursor: 'pointer' }
    const td = { padding: '11px 14px', fontSize: '13px', color: '#374151' }

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Activos</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Equipos de la empresa: dónde están, quién los tiene y en qué estado</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button onClick={() => setMaestro('ubicaciones')} style={btnSec}><MapPin size={15} /> Ubicaciones</button>
                    <button onClick={() => setMaestro('categorias')} style={btnSec}><Settings size={15} /> Categorías</button>
                    {puedeOperar && (
                        <button onClick={() => setForm(true)}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                            <Plus size={16} /> Nuevo activo
                        </button>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                {kpis.map(([l, v]) => (
                    <div key={l} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{l}</div>
                        <div style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', marginTop: '4px' }}>{v}</div>
                    </div>
                ))}
            </div>

            <BarraFija ref={barraRef}>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '12px' }}>
                    <div style={{ position: 'relative', width: '240px' }}>
                        <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: '#9ca3af' }} />
                        <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Código, nombre, serial, marca…"
                            style={{ ...inputActivo, paddingLeft: '30px', fontSize: '13px' }} />
                    </div>
                    <FiltroCombo label="Categoría" value={fCategoria} onChange={setFCategoria} width="200px"
                        options={categorias.map(c => ({ value: c.id, label: c.nombre }))} />
                    <FiltroCombo label="Ubicación" value={fUbicacion} onChange={setFUbicacion} width="180px"
                        options={ubicaciones.map(u => ({ value: u.id, label: u.nombre }))} />
                    <FiltroCombo label="Responsable" value={fResponsable} onChange={setFResponsable} width="200px" options={opcResp} />
                    <FiltroCombo label="Estado" value={fEstado} onChange={v => { setFEstado(v); if (v === 'baja') setVerBajas(true) }} width="170px"
                        options={Object.entries(ESTADOS_ACTIVO).map(([value, s]) => ({ value, label: s.label }))} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#374151', paddingBottom: '9px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={verBajas} onChange={e => setVerBajas(e.target.checked)} /> Ver dados de baja
                    </label>
                </div>
            </BarraFija>

            <div style={estiloTarjetaTabla}>
                {cargando ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>
                    : filtrados.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
                            {activos.length === 0 ? 'Todavía no hay activos registrados. Usa "Nuevo activo" o "Registrar como activo" desde un gasto o una recepción.' : 'No hay activos para los filtros seleccionados.'}
                        </div>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {[['Código', 'codigo'], ['Activo', 'nombre'], ['Categoría', 'categoria'], ['Ubicación', 'ubicacion'],
                                      ['Responsable', 'responsable'], ['Estado', 'estado'], ['Adquirido', 'fecha'],
                                      ...(verValores ? [['Valor', 'valor']] : []), ['', null]].map(([h, col], i) => (
                                        <ThOrden key={i} col={col} orden={orden} onOrdenar={ordenarPor} top={altoBarra}
                                            align={col === 'valor' ? 'right' : 'left'} style={{ padding: '10px 14px' }}>{h}</ThOrden>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtrados.map(a => (
                                    <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: a.estado === 'baja' ? 0.6 : 1, cursor: 'pointer' }}
                                        onClick={() => setVista({ ficha: a.id })}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ ...td, fontFamily: 'monospace' }}>{a.codigo}</td>
                                        <td style={td}>
                                            <div style={{ color: '#1f2937', fontWeight: 500 }}>{a.nombre}</div>
                                            {(a.marca || a.modelo || a.serial) && (
                                                <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                                                    {[a.marca, a.modelo].filter(Boolean).join(' ')}{a.serial ? ` · S/N ${a.serial}` : ''}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ ...td, color: '#6b7280' }}>{a.activo_categorias?.nombre}</td>
                                        <td style={td}>{a.activo_ubicaciones?.nombre}</td>
                                        <td style={{ ...td, color: a.responsable ? '#374151' : '#9ca3af' }}>{a.responsable?.nombre || 'Sin responsable'}</td>
                                        <td style={td}><BadgeEstadoActivo estado={a.estado} /></td>
                                        <td style={{ ...td, color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtFechaCorta(a.fecha_adquisicion)}</td>
                                        {verValores && <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{a.activo_valores ? fmtUsd(valorDe(a)) : '—'}</td>}
                                        <td style={td}>
                                            <button onClick={e => { e.stopPropagation(); setVista({ ficha: a.id }) }}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>
                                                <FileText size={13} /> Ver
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    )}
            </div>

            {form && <FormActivo onCerrar={() => setForm(false)}
                onGuardado={res => { setForm(false); cargar(); if (res?.length === 1) setVista({ ficha: res[0].id }) }} />}
            {maestro && <ModalMaestro tipo={maestro} filas={maestro === 'categorias' ? categorias : ubicaciones}
                onCambio={cargarMaestros} onCerrar={() => setMaestro(null)} />}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// FICHA
// ══════════════════════════════════════════════════════════════
const ETIQUETA_MOV = {
    alta: 'Alta', edicion: 'Edición', traslado: 'Traslado', responsable: 'Responsable', estado: 'Estado',
    mantenimiento: 'Mantenimiento', baja: 'Baja', reactivacion: 'Reactivación',
}

function FichaActivo({ id, ubicaciones, onVolver }) {
    const { perfil } = useAuth()
    const { puedeOperar, verValores } = usePermisosActivos()
    const [a, setA] = useState(null)
    const [movs, setMovs] = useState([])
    const [modal, setModal] = useState(null)   // 'editar' | 'traslado' | 'responsable' | 'estado' | 'mantenimiento' | 'baja' | 'reactivar'

    async function cargar() {
        const [r, m] = await Promise.all([
            supabase.from('activos').select(SELECT_ACTIVO).eq('id', id).eq('empresa_id', perfil.empresa_id).single(),
            supabase.from('activo_movimientos')
                .select(`id, tipo, fecha, nota, created_at, estado_ant, estado_nuevo,
                    ua:activo_ubicaciones!ubicacion_ant(nombre), un:activo_ubicaciones!ubicacion_nueva(nombre),
                    ra:usuarios!responsable_ant(nombre), rn:usuarios!responsable_nuevo(nombre), us:usuarios!usuario_id(nombre),
                    gastos(numero_gasto)`)
                .eq('activo_id', id).eq('empresa_id', perfil.empresa_id).order('created_at', { ascending: false }),
        ])
        setA(r.data || null); setMovs(m.data || [])
    }
    useEffect(() => { cargar() }, [id])

    if (!a) return <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>

    const baja = a.estado === 'baja'
    const v = a.activo_valores
    const dep = v ? depreciacionReferencial(v.valor_adquisicion, v.valor_residual, v.vida_util_meses, a.fecha_adquisicion, a.fecha_baja || hoyYMD()) : null
    const garantiaVencida = a.garantia_hasta && a.garantia_hasta < hoyYMD()

    const card = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px 22px', marginBottom: '16px' }
    const label = { fontSize: '11px', fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }
    const value = { fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }
    const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '18px' }
    const btn = { display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }
    const dato = (l, val) => <div><p style={label}>{l}</p><p style={value}>{val || '—'}</p></div>
    const origenTxt = a.gastos ? `Gasto ${a.gastos.numero_gasto || ''}${a.gastos.nombre ? ' · ' + a.gastos.nombre : ''}`
        : a.compras ? `Recepción ${a.compras.numero_doc}` : 'Sin documento'

    function detalleMov(m) {
        if (m.tipo === 'traslado') return `${m.ua?.nombre || '—'} → ${m.un?.nombre || '—'}`
        if (m.tipo === 'responsable') return `${m.ra?.nombre || 'Sin responsable'} → ${m.rn?.nombre || 'Sin responsable'}`
        if (m.tipo === 'estado' || m.tipo === 'baja' || m.tipo === 'reactivacion')
            return `${ESTADOS_ACTIVO[m.estado_ant]?.label || m.estado_ant || ''} → ${ESTADOS_ACTIVO[m.estado_nuevo]?.label || m.estado_nuevo}`
        if (m.tipo === 'alta') return [m.un?.nombre, m.rn?.nombre].filter(Boolean).join(' · ')
        if (m.tipo === 'mantenimiento' && m.gastos?.numero_gasto) return `Gasto ${m.gastos.numero_gasto}`
        return ''
    }

    return (
        <div style={{ padding: '24px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>
                    <span style={{ fontFamily: 'monospace', color: '#6b7280', marginRight: '8px' }}>{a.codigo}</span>{a.nombre}
                </h1>
                <span style={{ marginLeft: 'auto' }}><BadgeEstadoActivo estado={a.estado} /></span>
            </div>

            {puedeOperar && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {!baja && <>
                        <button style={btn} onClick={() => setModal('traslado')}><MapPin size={14} /> Trasladar</button>
                        <button style={btn} onClick={() => setModal('responsable')}><User size={14} /> Cambiar responsable</button>
                        <button style={btn} onClick={() => setModal('estado')}><Activity size={14} /> Cambiar estado</button>
                        <button style={btn} onClick={() => setModal('mantenimiento')}><Wrench size={14} /> Mantenimiento</button>
                        <button style={btn} onClick={() => setModal('editar')}><Pencil size={14} /> Editar</button>
                        {verValores && <button style={{ ...btn, color: '#dc2626', borderColor: '#fecaca' }} onClick={() => setModal('baja')}><Ban size={14} /> Dar de baja</button>}
                    </>}
                    {baja && verValores && <button style={btn} onClick={() => setModal('reactivar')}><RotateCcw size={14} /> Reactivar (baja por error)</button>}
                </div>
            )}

            {baja && (
                <div style={{ ...card, backgroundColor: '#f9fafb' }}>
                    <p style={{ ...label, marginBottom: '8px' }}>Dado de baja</p>
                    <p style={{ fontSize: '13px', color: '#374151', margin: 0 }}>
                        {fmtFechaCorta(a.fecha_baja)} · {TIPOS_BAJA[a.tipo_baja] || a.tipo_baja} · {a.motivo_baja}
                        {verValores && v?.valor_recuperacion != null && ` · Recuperado ${fmtUsd(v.valor_recuperacion)}`}
                    </p>
                </div>
            )}

            <div style={card}>
                <div style={grid}>
                    {dato('Ubicación', a.activo_ubicaciones?.nombre)}
                    {dato('Responsable', a.responsable?.nombre || 'Sin responsable')}
                    {dato('Categoría', a.activo_categorias?.nombre)}
                    {dato('Marca / modelo', [a.marca, a.modelo].filter(Boolean).join(' '))}
                    {dato('Serial', a.serial)}
                    {dato('Adquirido', fmtFechaCorta(a.fecha_adquisicion))}
                    {dato('Proveedor', a.proveedores?.nombre)}
                    {dato('Documento de origen', origenTxt)}
                    <div>
                        <p style={label}>Garantía</p>
                        <p style={{ ...value, color: garantiaVencida ? '#9ca3af' : '#1f2937' }}>
                            {a.garantia_hasta ? `${garantiaVencida ? 'Venció' : 'Hasta'} ${fmtFechaCorta(a.garantia_hasta)}` : '—'}
                        </p>
                    </div>
                </div>
                {a.observaciones && <p style={{ fontSize: '13px', color: '#6b7280', margin: '16px 0 0', whiteSpace: 'pre-wrap' }}>{a.observaciones}</p>}
            </div>

            {verValores && v && (
                <div style={card}>
                    <div style={grid}>
                        {dato('Valor de adquisición', fmtUsd(v.valor_adquisicion))}
                        {dato('Vida útil', v.vida_util_meses ? `${v.vida_util_meses} meses` : '')}
                        {dato('Valor residual', fmtUsd(v.valor_residual))}
                        {dep && dato('Depreciación acumulada', `${fmtUsd(dep.acumulada)} (${dep.meses} meses)`)}
                        {dep && dato('Valor de referencia', fmtUsd(dep.valorReferencial))}
                    </div>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: '12px 0 0' }}>
                        {dep ? 'Depreciación referencial en línea recta, solo para orientar. La contable se lleva en Galac.'
                            : 'Carga la vida útil (Editar) para ver una depreciación de referencia.'}
                    </p>
                </div>
            )}

            <div style={card}>
                <p style={{ ...label, marginBottom: '12px' }}>Historial ({movs.length})</p>
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            {['Fecha', 'Movimiento', 'Detalle', 'Nota', 'Registró'].map(h => (
                                <th key={h} style={{ padding: '6px 8px', fontSize: '11px', fontWeight: 500, color: '#9ca3af', textAlign: 'left' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {movs.map(m => (
                            <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6', verticalAlign: 'top' }}>
                                <td style={{ padding: '8px', fontSize: '12px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtFechaCorta(m.fecha)}</td>
                                <td style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#374151' }}>{ETIQUETA_MOV[m.tipo] || m.tipo}</td>
                                <td style={{ padding: '8px', fontSize: '12px', color: '#374151' }}>{detalleMov(m)}</td>
                                <td style={{ padding: '8px', fontSize: '12px', color: '#6b7280' }}>{m.nota}</td>
                                <td style={{ padding: '8px', fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{m.us?.nombre}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                </div>
            </div>

            {modal === 'editar' && <FormActivo activo={a} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); cargar() }} />}
            {['traslado', 'responsable', 'estado', 'mantenimiento'].includes(modal) && (
                <ModalMovimiento tipo={modal} activo={a} ubicaciones={ubicaciones} onCerrar={() => setModal(null)} onHecho={() => { setModal(null); cargar() }} />
            )}
            {modal === 'baja' && <ModalBaja activo={a} onCerrar={() => setModal(null)} onHecho={() => { setModal(null); cargar() }} />}
            {modal === 'reactivar' && <ModalReactivar activo={a} onCerrar={() => setModal(null)} onHecho={() => { setModal(null); cargar() }} />}
        </div>
    )
}

// ── Contenedor de ventana ─────────────────────────────────────
function Ventana({ titulo, subtitulo, children, error, guardando, onCerrar, onConfirmar, textoBoton, peligro = false }) {
    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: subtitulo ? '4px' : '16px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{titulo}</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>
                {subtitulo && <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>{subtitulo}</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
                    <button onClick={onCerrar} disabled={guardando} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={onConfirmar} disabled={guardando}
                        style={{ padding: '9px 16px', borderRadius: '8px', border: 'none', backgroundColor: peligro ? '#dc2626' : '#16a34a', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Guardando…' : textoBoton}
                    </button>
                </div>
            </div>
        </div>
    )
}
const lbl = { fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }

function ModalMovimiento({ tipo, activo, ubicaciones, onCerrar, onHecho }) {
    const { perfil } = useAuth()
    const [usuarios, setUsuarios] = useState([])
    const [fecha, setFecha] = useState(hoyYMD())
    const [ubicacionId, setUbicacionId] = useState('')
    const [responsableId, setResponsableId] = useState('')
    const [estado, setEstado] = useState('')
    const [nota, setNota] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (tipo === 'responsable') supabase.from('usuarios').select('id, nombre, activo').eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setUsuarios((data || []).filter(u => u.activo !== false && u.id !== activo.responsable_id)))
    }, [tipo])

    const titulos = { traslado: 'Trasladar', responsable: 'Cambiar responsable', estado: 'Cambiar estado', mantenimiento: 'Registrar mantenimiento' }

    async function confirmar() {
        setError('')
        const datos = { fecha, nota }
        if (tipo === 'traslado') { if (!ubicacionId) return setError('Elige la ubicación nueva'); datos.ubicacion_id = ubicacionId }
        if (tipo === 'responsable') datos.responsable_id = responsableId || null
        if (tipo === 'estado') { if (!estado) return setError('Elige el estado nuevo'); datos.estado = estado }
        if (tipo === 'mantenimiento' && !nota.trim()) return setError('Describe el mantenimiento')
        setGuardando(true)
        const { error: err } = await supabase.rpc('registrar_movimiento_activo', { p_id: activo.id, p_tipo: tipo, p_datos: datos })
        setGuardando(false)
        if (err) return setError(err.message)
        onHecho()
    }

    return (
        <Ventana titulo={`${titulos[tipo]} · ${activo.codigo}`} subtitulo={activo.nombre} error={error} guardando={guardando}
            onCerrar={onCerrar} onConfirmar={confirmar} textoBoton="Registrar">
            {tipo === 'traslado' && (
                <div>
                    <label style={lbl}>De {activo.activo_ubicaciones?.nombre} a</label>
                    <select value={ubicacionId} onChange={e => setUbicacionId(e.target.value)} style={inputActivo}>
                        <option value="">— Elegir —</option>
                        {ubicaciones.filter(u => u.activa && u.id !== activo.ubicacion_id).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                </div>
            )}
            {tipo === 'responsable' && (
                <div>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px' }}>Hoy: <b>{activo.responsable?.nombre || 'Sin responsable'}</b></p>
                    <FiltroCombo label="Nuevo responsable" value={responsableId} onChange={setResponsableId} width="100%"
                        placeholder="Sin responsable" options={usuarios.map(u => ({ value: u.id, label: u.nombre }))} />
                </div>
            )}
            {tipo === 'estado' && (
                <div>
                    <label style={lbl}>De {ESTADOS_ACTIVO[activo.estado]?.label} a</label>
                    <select value={estado} onChange={e => setEstado(e.target.value)} style={inputActivo}>
                        <option value="">— Elegir —</option>
                        {Object.entries(ESTADOS_ACTIVO).filter(([k]) => k !== 'baja' && k !== activo.estado).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </select>
                </div>
            )}
            <div>
                <label style={lbl}>Fecha</label>
                <input type="date" value={fecha} max={hoyYMD()} onChange={e => setFecha(e.target.value)} style={inputActivo} />
            </div>
            <div>
                <label style={lbl}>{tipo === 'mantenimiento' ? 'Qué se hizo *' : 'Nota'}</label>
                <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} style={{ ...inputActivo, resize: 'vertical' }}
                    placeholder={tipo === 'mantenimiento' ? 'Ej: cambio de compresor, taller X' : ''} />
            </div>
        </Ventana>
    )
}

function ModalBaja({ activo, onCerrar, onHecho }) {
    const [tipo, setTipo] = useState('')
    const [fecha, setFecha] = useState(hoyYMD())
    const [motivo, setMotivo] = useState('')
    const [recuperado, setRecuperado] = useState('0')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    async function confirmar() {
        setError('')
        if (!tipo) return setError('Elige el tipo de baja')
        if (!motivo.trim()) return setError('El motivo es obligatorio')
        setGuardando(true)
        const { error: err } = await supabase.rpc('dar_baja_activo', {
            p_id: activo.id, p_tipo_baja: tipo, p_motivo: motivo.trim(), p_fecha: fecha, p_valor_recuperacion: Number(recuperado || 0),
        })
        setGuardando(false)
        if (err) return setError(err.message)
        onHecho()
    }

    return (
        <Ventana titulo={`Dar de baja ${activo.codigo}`} subtitulo={`${activo.nombre}. El activo sale de la lista de vigentes; su historial se conserva.`}
            error={error} guardando={guardando} onCerrar={onCerrar} onConfirmar={confirmar} textoBoton="Dar de baja" peligro>
            <div>
                <label style={lbl}>Tipo de baja *</label>
                <select value={tipo} onChange={e => setTipo(e.target.value)} style={inputActivo}>
                    <option value="">— Elegir —</option>
                    {Object.entries(TIPOS_BAJA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
            </div>
            <div>
                <label style={lbl}>Fecha *</label>
                <input type="date" value={fecha} max={hoyYMD()} onChange={e => setFecha(e.target.value)} style={inputActivo} />
            </div>
            <div>
                <label style={lbl}>Motivo *</label>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} style={{ ...inputActivo, resize: 'vertical' }} />
            </div>
            <div>
                <label style={lbl}>Valor recuperado (USD)</label>
                <input type="number" min="0" step="0.01" value={recuperado} onChange={e => setRecuperado(e.target.value)} style={inputActivo} />
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '4px 0 0' }}>Si se vendió o se vendió como chatarra. La factura de venta se hace aparte.</p>
            </div>
        </Ventana>
    )
}

function ModalReactivar({ activo, onCerrar, onHecho }) {
    const [motivo, setMotivo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    async function confirmar() {
        setError('')
        if (!motivo.trim()) return setError('El motivo es obligatorio')
        setGuardando(true)
        const { error: err } = await supabase.rpc('reactivar_activo', { p_id: activo.id, p_motivo: motivo.trim() })
        setGuardando(false)
        if (err) return setError(err.message)
        onHecho()
    }
    return (
        <Ventana titulo={`Reactivar ${activo.codigo}`} subtitulo="Deshace una baja registrada por error. Vuelve como operativo."
            error={error} guardando={guardando} onCerrar={onCerrar} onConfirmar={confirmar} textoBoton="Reactivar">
            <div>
                <label style={lbl}>Motivo *</label>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} style={{ ...inputActivo, resize: 'vertical' }} />
            </div>
        </Ventana>
    )
}

// ══════════════════════════════════════════════════════════════
// MAESTROS: categorías (con vida útil sugerida) y ubicaciones
// No se borran (quedan en fichas anteriores): se desactivan.
// ══════════════════════════════════════════════════════════════
function ModalMaestro({ tipo, filas, onCambio, onCerrar }) {
    const { perfil } = useAuth()
    const esCat = tipo === 'categorias'
    const tabla = esCat ? 'activo_categorias' : 'activo_ubicaciones'
    const [nueva, setNueva] = useState({ nombre: '', vida: '' })
    const [editando, setEditando] = useState(null)   // { id, nombre, vida }
    const [error, setError] = useState('')

    const mensaje = err => err.code === '23505' ? `Ya existe ${esCat ? 'una categoría' : 'una ubicación'} con ese nombre` : err.message
    const vidaValida = v => v === '' || (Number.isInteger(Number(v)) && Number(v) > 0)

    async function agregar() {
        if (!nueva.nombre.trim()) return
        if (esCat && !vidaValida(nueva.vida)) return setError('La vida útil va en meses (número entero)')
        setError('')
        const fila = { empresa_id: perfil.empresa_id, nombre: nueva.nombre.trim() }
        if (esCat) fila.vida_util_meses = nueva.vida === '' ? null : Number(nueva.vida)
        const { error: err } = await supabase.from(tabla).insert(fila)
        if (err) return setError(mensaje(err))
        setNueva({ nombre: '', vida: '' }); onCambio()
    }
    async function guardarEdicion() {
        if (!editando?.nombre.trim()) return
        if (esCat && !vidaValida(editando.vida)) return setError('La vida útil va en meses (número entero)')
        setError('')
        const cambios = { nombre: editando.nombre.trim() }
        if (esCat) cambios.vida_util_meses = editando.vida === '' ? null : Number(editando.vida)
        const { error: err } = await supabase.from(tabla).update(cambios).eq('id', editando.id).eq('empresa_id', perfil.empresa_id)
        if (err) return setError(mensaje(err))
        setEditando(null); onCambio()
    }
    async function toggle(f) {
        const { error: err } = await supabase.from(tabla).update({ activa: !f.activa }).eq('id', f.id).eq('empresa_id', perfil.empresa_id)
        if (err) setError(mensaje(err)); else onCambio()
    }

    const chico = { ...inputActivo, padding: '6px 10px', fontSize: '13px' }
    const btnChico = { background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{esCat ? 'Categorías de activos' : 'Ubicaciones de activos'}</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>
                {filas.map(f => (
                    <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid #f3f4f6', opacity: f.activa ? 1 : 0.5 }}>
                        {editando?.id === f.id ? (
                            <>
                                <input value={editando.nombre} autoFocus onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditando(null) }} style={chico} />
                                {esCat && <input value={editando.vida} onChange={e => setEditando({ ...editando, vida: e.target.value })}
                                    placeholder="Meses" style={{ ...chico, width: '80px' }} />}
                                <button onClick={guardarEdicion} style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>Guardar</button>
                            </>
                        ) : (
                            <>
                                <span style={{ flex: 1, fontSize: '14px', color: '#1f2937' }}>
                                    {f.nombre}{!f.activa && ' (inactiva)'}
                                    {esCat && f.vida_util_meses && <span style={{ fontSize: '12px', color: '#9ca3af' }}> · {f.vida_util_meses} meses</span>}
                                </span>
                                <button onClick={() => { setEditando({ id: f.id, nombre: f.nombre, vida: f.vida_util_meses ? String(f.vida_util_meses) : '' }); setError('') }} style={btnChico}>Editar</button>
                                <button onClick={() => toggle(f)} style={{ ...btnChico, color: f.activa ? '#dc2626' : '#16a34a' }}>{f.activa ? 'Desactivar' : 'Activar'}</button>
                            </>
                        )}
                    </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <input value={nueva.nombre} onChange={e => setNueva({ ...nueva, nombre: e.target.value })} onKeyDown={e => e.key === 'Enter' && agregar()}
                        placeholder={esCat ? 'Nueva categoría…' : 'Nueva ubicación… (ej: Planta, Oficina, Camión 1)'} style={{ ...inputActivo, fontSize: '13px' }} />
                    {esCat && <input value={nueva.vida} onChange={e => setNueva({ ...nueva, vida: e.target.value })}
                        placeholder="Meses" style={{ ...inputActivo, fontSize: '13px', width: '90px' }} />}
                    <button onClick={agregar}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <Plus size={14} /> Agregar
                    </button>
                </div>
                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginTop: '12px' }}>{error}</div>}
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '12px 0 0' }}>
                    {esCat ? 'La vida útil (meses) se propone al registrar un activo de esa categoría. ' : ''}
                    No se borran (quedan en fichas anteriores): se desactivan.
                </p>
            </div>
        </div>
    )
}
