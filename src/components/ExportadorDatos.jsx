// Exportador de datos del Dashboard (docs/plan-exportador.md).
// El usuario elige fuente, detalle (por documento / por producto), columnas (y
// su orden) y formato; se aplican los filtros que tenga marcados el Dashboard.
// Las selecciones se pueden guardar como plantillas personales o de la empresa.
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Download, ChevronUp, ChevronDown, Save, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { FUENTES, camposDe, gruposDe, filtrosIgnorados } from '../lib/exportador/catalogo'
import { contarFilas, descargarFilas, generarArchivo } from '../lib/exportador/archivo'
import { listarPlantillas, crearPlantilla, actualizarPlantilla, eliminarPlantilla, puedeEditarPlantilla } from '../lib/exportador/plantillas'

const claveSeleccion = (fuente, modo) => `mipos_export_${fuente}_${modo}`

// La selección es un ARRAY: su orden es el orden de las columnas del archivo
function leerSeleccion(fuente, modo, campos) {
    try {
        const raw = localStorage.getItem(claveSeleccion(fuente, modo))
        if (raw) {
            const validas = JSON.parse(raw).filter(c => campos.some(x => x.col === c))
            if (validas.length) return validas
        }
    } catch { /* sin almacenamiento: se usan los marcados por defecto */ }
    return campos.filter(c => c.def).map(c => c.col)
}

function guardarSeleccion(fuente, modo, sel) {
    try { localStorage.setItem(claveSeleccion(fuente, modo), JSON.stringify(sel)) } catch { /* sin almacenamiento */ }
}

const radio = (activo) => ({
    padding: '6px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', border: '1px solid',
    borderColor: activo ? '#16a34a' : '#e5e7eb', backgroundColor: activo ? '#f0fdf4' : '#fff',
    color: activo ? '#166534' : '#6b7280', fontWeight: activo ? 600 : 400,
})
const botonChico = { ...radio(false), padding: '4px 10px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }
const iconoBtn = { background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '2px', display: 'flex' }

export default function ExportadorDatos({ filtros, filtrosTexto, onCerrar }) {
    const { perfil } = useAuth()
    const [fuente, setFuente] = useState('ventas')
    const [modo, setModo] = useState('documento')
    const modos = Object.keys(FUENTES[fuente].vistas)
    const campos = useMemo(() => camposDe(fuente, modo), [fuente, modo])
    const ignorados = filtrosIgnorados(fuente, modo, filtros)
    const [seleccion, setSeleccionState] = useState(() => leerSeleccion('ventas', 'documento', camposDe('ventas', 'documento')))
    const [formato, setFormato] = useState('xlsx')
    const [incluirAnulados, setIncluirAnulados] = useState(false)
    const [conteo, setConteo] = useState(null)
    const [progreso, setProgreso] = useState(null)
    const [error, setError] = useState('')
    const [aviso, setAviso] = useState('')

    // Plantillas
    const [plantillas, setPlantillas] = useState([])
    const [plantillaId, setPlantillaId] = useState('')
    const [guardando, setGuardando] = useState(null)   // null | { nombre, alcance }
    const seleccionDePlantilla = useRef(null)           // campos a aplicar tras cambiar fuente/detalle
    const plantilla = plantillas.find(p => p.id === plantillaId) || null
    const puedeEditar = puedeEditarPlantilla(plantilla, perfil)

    const marcadas = useMemo(() => new Set(seleccion), [seleccion])

    function setSeleccion(sel) {
        guardarSeleccion(fuente, modo, sel)
        setSeleccionState(sel)
    }

    const filtrosConsulta = useMemo(() => ({
        ...filtros, empresaId: perfil?.empresa_id, incluirAnulados,
    }), [filtros, perfil?.empresa_id, incluirAnulados])

    // Al cambiar de fuente o detalle: los campos de la plantilla elegida, o la
    // última selección de ese par en este navegador
    useEffect(() => {
        if (seleccionDePlantilla.current) {
            const cols = seleccionDePlantilla.current
            seleccionDePlantilla.current = null
            const validas = cols.filter(c => campos.some(x => x.col === c))
            if (validas.length < cols.length) setAviso(`${cols.length - validas.length} campo(s) de la plantilla ya no existen y se omitieron`)
            setSeleccionState(validas)
            return
        }
        setSeleccionState(leerSeleccion(fuente, modo, campos))
    }, [fuente, modo, campos])

    useEffect(() => {
        if (!perfil?.empresa_id) return
        listarPlantillas(perfil.empresa_id)
            .then(setPlantillas)
            .catch(e => setError('No se pudieron cargar las plantillas: ' + e.message))
    }, [perfil?.empresa_id])

    useEffect(() => {
        if (!perfil?.empresa_id) return
        let cancel = false
        setConteo(null)
        contarFilas(fuente, modo, filtrosConsulta)
            .then(n => { if (!cancel) setConteo(n) })
            .catch(e => { if (!cancel) setError('No se pudo contar las filas: ' + e.message) })
        return () => { cancel = true }
    }, [fuente, modo, filtrosConsulta, perfil?.empresa_id])

    // Una fuente con un solo detalle (cobros, cartera) fuerza 'documento'
    function elegirFuente(k) {
        setFuente(k)
        if (!FUENTES[k].vistas[modo]) setModo('documento')
    }

    function aplicarPlantilla(id) {
        setPlantillaId(id); setAviso(''); setError('')
        const p = plantillas.find(x => x.id === id)
        if (!p) return
        if (!FUENTES[p.fuente]?.vistas[p.modo]) { setError('La plantilla apunta a una fuente que ya no existe'); return }
        setFormato(p.formato)
        setIncluirAnulados(p.incluir_anulados)
        if (p.fuente === fuente && p.modo === modo) {
            const validas = p.campos.filter(c => campos.some(x => x.col === c))
            if (validas.length < p.campos.length) setAviso(`${p.campos.length - validas.length} campo(s) de la plantilla ya no existen y se omitieron`)
            setSeleccionState(validas)
        } else {
            seleccionDePlantilla.current = p.campos
            setFuente(p.fuente); setModo(p.modo)
        }
    }

    const datosPlantilla = () => ({ fuente, modo, campos: seleccion, formato, incluir_anulados: incluirAnulados })

    async function guardarComo() {
        const nombre = guardando?.nombre?.trim()
        if (!nombre) { setError('Ponle un nombre a la plantilla'); return }
        if (!seleccion.length) { setError('Marca al menos un campo'); return }
        try {
            const p = await crearPlantilla(perfil.empresa_id, { ...datosPlantilla(), nombre, alcance: guardando.alcance })
            setPlantillas(prev => [...prev, p].sort((a, b) => a.nombre.localeCompare(b.nombre)))
            setPlantillaId(p.id); setGuardando(null); setError('')
            setAviso(`Plantilla "${p.nombre}" guardada`)
        } catch (e) { setError('No se pudo guardar la plantilla: ' + e.message) }
    }

    async function actualizar() {
        if (!plantilla) return
        try {
            const p = await actualizarPlantilla(plantilla.id, perfil.empresa_id, datosPlantilla())
            setPlantillas(prev => prev.map(x => x.id === p.id ? p : x))
            setError(''); setAviso(`Plantilla "${p.nombre}" actualizada`)
        } catch (e) { setError(e.message) }
    }

    async function eliminar() {
        if (!plantilla || !window.confirm(`¿Eliminar la plantilla "${plantilla.nombre}"?`)) return
        try {
            await eliminarPlantilla(plantilla.id, perfil.empresa_id)
            setPlantillas(prev => prev.filter(x => x.id !== plantilla.id))
            setPlantillaId(''); setError(''); setAviso('Plantilla eliminada')
        } catch (e) { setError(e.message) }
    }

    // ── Selección y orden de columnas ──
    function toggle(col) {
        setSeleccion(marcadas.has(col) ? seleccion.filter(c => c !== col) : [...seleccion, col])
    }
    function toggleGrupo(grupo, marcar) {
        const delGrupo = campos.filter(c => c.grupo === grupo).map(c => c.col)
        setSeleccion(marcar
            ? [...seleccion, ...delGrupo.filter(c => !marcadas.has(c))]
            : seleccion.filter(c => !delGrupo.includes(c)))
    }
    function todos(marcar) {
        setSeleccion(marcar ? [...seleccion, ...campos.map(c => c.col).filter(c => !marcadas.has(c))] : [])
    }
    function mover(idx, delta) {
        const j = idx + delta
        if (j < 0 || j >= seleccion.length) return
        const s = [...seleccion];
        [s[idx], s[j]] = [s[j], s[idx]]
        setSeleccion(s)
    }

    async function descargar() {
        const elegidos = seleccion.map(col => campos.find(c => c.col === col)).filter(Boolean)
        if (!elegidos.length) { setError('Marca al menos un campo'); return }
        setError(''); setProgreso(0)
        try {
            const filas = await descargarFilas(fuente, modo, elegidos.map(c => c.col), filtrosConsulta, setProgreso)
            const def = FUENTES[fuente]
            const detalle = modo === 'documento' ? (def.etiquetaDocumento || 'Por documento') : 'Por producto'
            generarArchivo(filas, elegidos, formato, {
                fuente: def.etiqueta, detalle,
                plantilla: plantilla?.nombre,
                filtrosTexto: [filtrosTexto, def.filtros.anulados && (incluirAnulados ? 'Incluye anulados' : 'Sin anulados'),
                    ignorados.length && `No aplicados en esta fuente: ${ignorados.join(', ')}`].filter(Boolean).join(' · '),
                filas: filas.length, usuario: perfil?.nombre, avisos: def.avisos,
            }, `MiPOS_${(plantilla?.nombre || def.etiqueta).replace(/[^\w\-áéíóúñÁÉÍÓÚÑ]+/g, '_')}_${modo === 'documento' ? 'documentos' : 'productos'}${def.filtros.fechaCol ? `_${filtros.desde || ''}_${filtros.hasta || ''}` : ''}`)
        } catch (e) {
            setError('No se pudo generar el archivo: ' + e.message)
        } finally {
            setProgreso(null)
        }
    }

    const grupos = gruposDe(campos)
    const etiquetaFuente = (k) => FUENTES[k]?.etiqueta || k

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '560px', maxWidth: '100vw', backgroundColor: '#fff', zIndex: 50, boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Exportar datos</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Plantillas */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', width: '64px' }}>Plantilla</span>
                        <select value={plantillaId} onChange={e => aplicarPlantilla(e.target.value)}
                            style={{ flex: 1, minWidth: '180px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }}>
                            <option value="">— Sin plantilla —</option>
                            {plantillas.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.nombre} · {etiquetaFuente(p.fuente)}{p.alcance === 'empresa' ? ' · empresa' : ' · personal'}
                                </option>
                            ))}
                        </select>
                        <button onClick={() => { setGuardando({ nombre: '', alcance: 'personal' }); setAviso('') }} style={botonChico}><Save size={12} /> Guardar como…</button>
                        {plantilla && puedeEditar && <button onClick={actualizar} style={botonChico}>Actualizar</button>}
                        {plantilla && puedeEditar && <button onClick={eliminar} style={{ ...botonChico, color: '#dc2626' }}><Trash2 size={12} /></button>}
                    </div>
                    {plantilla && (
                        <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '-6px', paddingLeft: '72px' }}>
                            {plantilla.alcance === 'empresa' ? 'De la empresa' : 'Personal'} · creada por {plantilla.usuarios?.nombre || '—'}
                            {!puedeEditar && ' · solo lectura (puedes guardarla como una nueva)'}
                        </div>
                    )}
                    {guardando && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', backgroundColor: '#f9fafb', borderRadius: '8px', padding: '8px 10px' }}>
                            <input autoFocus value={guardando.nombre} placeholder="Nombre de la plantilla"
                                onChange={e => setGuardando(g => ({ ...g, nombre: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') guardarComo() }}
                                style={{ flex: 1, minWidth: '160px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }} />
                            <select value={guardando.alcance} onChange={e => setGuardando(g => ({ ...g, alcance: e.target.value }))}
                                style={{ padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }}>
                                <option value="personal">Solo para mí</option>
                                <option value="empresa">Para toda la empresa</option>
                            </select>
                            <button onClick={guardarComo} style={{ ...botonChico, ...radio(true), padding: '5px 10px', fontSize: '12px' }}>Guardar</button>
                            <button onClick={() => setGuardando(null)} style={botonChico}>Cancelar</button>
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', width: '64px' }}>Qué</span>
                        {Object.entries(FUENTES).map(([k, f]) => (
                            <button key={k} onClick={() => elegirFuente(k)} style={radio(fuente === k)}>{f.etiqueta}</button>
                        ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', width: '64px' }}>Detalle</span>
                        <button onClick={() => setModo('documento')} style={radio(modo === 'documento')}>{FUENTES[fuente].etiquetaDocumento || 'Por documento'}</button>
                        {modos.includes('producto') && <button onClick={() => setModo('producto')} style={radio(modo === 'producto')}>Por producto</button>}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '8px', padding: '8px 10px' }}>
                        <strong>Filtros del dashboard:</strong> {filtrosTexto || 'ninguno'}
                        {ignorados.length > 0 && (
                            <div style={{ color: '#92400e', marginTop: '4px' }}>⚠ Esta fuente no aplica: {ignorados.join(', ')}</div>
                        )}
                    </div>
                    {FUENTES[fuente].filtros.anulados && (
                        <label style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={incluirAnulados} onChange={e => setIncluirAnulados(e.target.checked)} /> Incluir anulados
                        </label>
                    )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                    {/* Orden de las columnas del archivo */}
                    {seleccion.length > 0 && (
                        <div style={{ marginBottom: '16px', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '10px 12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                                Columnas del archivo, en orden ({seleccion.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '180px', overflowY: 'auto' }}>
                                {seleccion.map((col, i) => {
                                    const c = campos.find(x => x.col === col)
                                    if (!c) return null
                                    return (
                                        <div key={col} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#374151', padding: '2px 0' }}>
                                            <span style={{ width: '22px', color: '#9ca3af', fontSize: '11px', textAlign: 'right' }}>{i + 1}</span>
                                            <span style={{ flex: 1 }}>{c.label}<span style={{ color: '#9ca3af', fontSize: '11px', marginLeft: '6px' }}>{c.grupo}</span></span>
                                            <button onClick={() => mover(i, -1)} disabled={i === 0} style={{ ...iconoBtn, opacity: i === 0 ? 0.3 : 1 }} title="Subir"><ChevronUp size={15} /></button>
                                            <button onClick={() => mover(i, 1)} disabled={i === seleccion.length - 1} style={{ ...iconoBtn, opacity: i === seleccion.length - 1 ? 0.3 : 1 }} title="Bajar"><ChevronDown size={15} /></button>
                                            <button onClick={() => toggle(col)} style={iconoBtn} title="Quitar"><X size={14} /></button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <button onClick={() => todos(true)} style={botonChico}>Marcar todo</button>
                        <button onClick={() => todos(false)} style={botonChico}>Limpiar</button>
                        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af', alignSelf: 'center' }}>Los nuevos campos se agregan al final</span>
                    </div>
                    {grupos.map(g => {
                        const delGrupo = campos.filter(c => c.grupo === g)
                        const todosMarcados = delGrupo.every(c => marcadas.has(c.col))
                        return (
                            <div key={g} style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={todosMarcados} onChange={e => toggleGrupo(g, e.target.checked)} /> {g}
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', paddingLeft: '20px' }}>
                                    {delGrupo.map(c => (
                                        <label key={c.col} title={c.aviso || ''} style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'flex-start', gap: '6px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={marcadas.has(c.col)} onChange={() => toggle(c.col)} style={{ marginTop: '2px' }} />
                                            <span>{c.label}{c.aviso && <span style={{ color: '#d97706', marginLeft: '4px' }}>⚠</span>}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                    {modo === 'producto' && (
                        <p style={{ fontSize: '12px', color: '#92400e', backgroundColor: '#fffbeb', borderRadius: '8px', padding: '8px 10px' }}>
                            ⚠ Los montos del documento se repiten en cada línea: para totalizar en el detalle por producto usa los montos de la línea.
                        </p>
                    )}
                </div>

                <div style={{ padding: '14px 20px', borderTop: '1px solid #e5e7eb' }}>
                    {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', color: '#dc2626', marginBottom: '10px' }}>{error}</div>}
                    {aviso && !error && <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '8px 10px', fontSize: '13px', color: '#166534', marginBottom: '10px' }}>{aviso}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>
                            {progreso !== null ? `Descargando… ${progreso.toLocaleString('es-VE')} filas`
                                : conteo === null ? 'Contando…' : `≈ ${conteo.toLocaleString('es-VE')} filas`}
                        </span>
                        <select value={formato} onChange={e => setFormato(e.target.value)}
                            style={{ marginLeft: 'auto', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px' }}>
                            <option value="xlsx">Excel (.xlsx)</option>
                            <option value="csv">CSV (;)</option>
                            <option value="txt">Texto (tabulado)</option>
                        </select>
                        <button onClick={descargar} disabled={progreso !== null || !conteo}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: (progreso !== null || !conteo) ? 0.5 : 1 }}>
                            <Download size={15} /> Descargar
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
