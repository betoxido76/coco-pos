// Exportador de datos del Dashboard (docs/plan-exportador.md).
// El usuario elige fuente, detalle (por documento / por producto), columnas y
// formato; se aplican los filtros que tenga marcados el Dashboard.
import { useEffect, useMemo, useState } from 'react'
import { X, Download } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { FUENTES, camposDe, gruposDe, filtrosIgnorados } from '../lib/exportador/catalogo'
import { contarFilas, descargarFilas, generarArchivo } from '../lib/exportador/archivo'

const claveSeleccion = (fuente, modo) => `mipos_export_${fuente}_${modo}`

function leerSeleccion(fuente, modo, campos) {
    try {
        const raw = localStorage.getItem(claveSeleccion(fuente, modo))
        if (raw) {
            const guardadas = JSON.parse(raw)
            const validas = guardadas.filter(c => campos.some(x => x.col === c))
            if (validas.length) return new Set(validas)
        }
    } catch { /* sin almacenamiento: se usan los marcados por defecto */ }
    return new Set(campos.filter(c => c.def).map(c => c.col))
}

function guardarSeleccion(fuente, modo, sel) {
    try { localStorage.setItem(claveSeleccion(fuente, modo), JSON.stringify([...sel])) } catch { /* sin almacenamiento */ }
}

const radio = (activo) => ({
    padding: '6px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', border: '1px solid',
    borderColor: activo ? '#16a34a' : '#e5e7eb', backgroundColor: activo ? '#f0fdf4' : '#fff',
    color: activo ? '#166534' : '#6b7280', fontWeight: activo ? 600 : 400,
})

export default function ExportadorDatos({ filtros, filtrosTexto, onCerrar }) {
    const { perfil } = useAuth()
    const [fuente, setFuente] = useState('ventas')
    const [modo, setModo] = useState('documento')
    const modos = Object.keys(FUENTES[fuente].vistas)
    const campos = useMemo(() => camposDe(fuente, modo), [fuente, modo])
    const ignorados = filtrosIgnorados(fuente, modo, filtros)

    // Una fuente con un solo detalle (cobros, cartera) fuerza 'documento'
    function elegirFuente(k) {
        setFuente(k)
        if (!FUENTES[k].vistas[modo]) setModo('documento')
    }
    const [seleccion, setSeleccion] = useState(() => leerSeleccion('ventas', 'documento', camposDe('ventas', 'documento')))
    const [formato, setFormato] = useState('xlsx')
    const [incluirAnulados, setIncluirAnulados] = useState(false)
    const [conteo, setConteo] = useState(null)
    const [progreso, setProgreso] = useState(null)
    const [error, setError] = useState('')

    const filtrosConsulta = useMemo(() => ({
        ...filtros, empresaId: perfil?.empresa_id, incluirAnulados,
    }), [filtros, perfil?.empresa_id, incluirAnulados])

    // Al cambiar de fuente o detalle se recupera la última selección de ese par
    useEffect(() => { setSeleccion(leerSeleccion(fuente, modo, campos)) }, [fuente, modo, campos])

    useEffect(() => {
        if (!perfil?.empresa_id) return
        let cancel = false
        setConteo(null)
        contarFilas(fuente, modo, filtrosConsulta)
            .then(n => { if (!cancel) setConteo(n) })
            .catch(e => { if (!cancel) setError('No se pudo contar las filas: ' + e.message) })
        return () => { cancel = true }
    }, [fuente, modo, filtrosConsulta, perfil?.empresa_id])

    function toggle(col) {
        setSeleccion(prev => {
            const s = new Set(prev)
            if (s.has(col)) s.delete(col); else s.add(col)
            guardarSeleccion(fuente, modo, s)
            return s
        })
    }
    function toggleGrupo(grupo, marcar) {
        setSeleccion(prev => {
            const s = new Set(prev)
            campos.filter(c => c.grupo === grupo).forEach(c => marcar ? s.add(c.col) : s.delete(c.col))
            guardarSeleccion(fuente, modo, s)
            return s
        })
    }
    function todos(marcar) {
        const s = marcar ? new Set(campos.map(c => c.col)) : new Set()
        guardarSeleccion(fuente, modo, s)
        setSeleccion(s)
    }

    async function descargar() {
        const elegidos = campos.filter(c => seleccion.has(c.col))
        if (!elegidos.length) { setError('Marca al menos un campo'); return }
        setError(''); setProgreso(0)
        try {
            const filas = await descargarFilas(fuente, modo, elegidos.map(c => c.col), filtrosConsulta, setProgreso)
            const def = FUENTES[fuente]
            const detalle = modo === 'documento' ? (def.etiquetaDocumento || 'Por documento') : 'Por producto'
            generarArchivo(filas, elegidos, formato, {
                fuente: def.etiqueta, detalle,
                filtrosTexto: [filtrosTexto, def.filtros.anulados && (incluirAnulados ? 'Incluye anulados' : 'Sin anulados'),
                    ignorados.length && `No aplicados en esta fuente: ${ignorados.join(', ')}`].filter(Boolean).join(' · '),
                filas: filas.length, usuario: perfil?.nombre, avisos: def.avisos,
            }, `MiPOS_${def.etiqueta.replace(/\s+/g, '_')}_${modo === 'documento' ? 'documentos' : 'productos'}${def.filtros.fechaCol ? `_${filtros.desde || ''}_${filtros.hasta || ''}` : ''}`)
        } catch (e) {
            setError('No se pudo generar el archivo: ' + e.message)
        } finally {
            setProgreso(null)
        }
    }

    const grupos = gruposDe(campos)

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '520px', maxWidth: '100vw', backgroundColor: '#fff', zIndex: 50, boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '18px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Exportar datos</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                        <button onClick={() => todos(true)} style={{ ...radio(false), padding: '4px 10px', fontSize: '12px' }}>Marcar todo</button>
                        <button onClick={() => todos(false)} style={{ ...radio(false), padding: '4px 10px', fontSize: '12px' }}>Limpiar</button>
                        <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#9ca3af', alignSelf: 'center' }}>{seleccion.size} campo(s)</span>
                    </div>
                    {grupos.map(g => {
                        const delGrupo = campos.filter(c => c.grupo === g)
                        const todosMarcados = delGrupo.every(c => seleccion.has(c.col))
                        return (
                            <div key={g} style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={todosMarcados} onChange={e => toggleGrupo(g, e.target.checked)} /> {g}
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', paddingLeft: '20px' }}>
                                    {delGrupo.map(c => (
                                        <label key={c.col} title={c.aviso || ''} style={{ fontSize: '13px', color: '#374151', display: 'flex', alignItems: 'flex-start', gap: '6px', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={seleccion.has(c.col)} onChange={() => toggle(c.col)} style={{ marginTop: '2px' }} />
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
