// Laboratorio VIN (prueba, solo superadmin): el VIN se toma de un código de barras
// (escaneo en vivo con la cámara, o dentro de una foto) gratis y sin IA; si la foto
// no trae código, la Edge Function leer-vin la lee con IA. El usuario confirma o
// corrige y se guarda en lab_vin_escaneos. Ver laboratorio_vin.sql.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Camera, ImageIcon, ArrowLeft, Check, AlertTriangle, RefreshCw, ScanLine, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { validarVin, normalizarVin, vinEnTexto } from '../lib/vin'

const LADO_MAX = 1600 // px: suficiente para leer el serial y liviano para el envío

const card = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px', marginBottom: '16px' }
const btn = (bg, color = '#fff') => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flex: 1,
    backgroundColor: bg, color, border: bg === '#fff' ? '1px solid #d1d5db' : 'none', borderRadius: '10px',
    padding: '14px 12px', fontSize: '15px', fontWeight: 600, cursor: 'pointer',
})
const etiqueta = { fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }

const UBICACION = {
    parabrisas: 'Parabrisas', puerta: 'Etiqueta de la puerta', chasis_motor: 'Chasis / motor',
    documento: 'Documento', otro: 'Otro', desconocido: 'No identificado',
}
const FUENTE = { ia: 'IA', codigo_barras: 'Código de barras', manual: 'Manual' }
const CAMPOS_DECOD = [
    ['marca', 'Marca'], ['modelo', 'Modelo'], ['anio', 'Año'], ['version', 'Versión'],
    ['carroceria', 'Carrocería'], ['tipo', 'Tipo'], ['motor_cilindros', 'Cilindros'],
    ['motor_litros', 'Motor (L)'], ['combustible', 'Combustible'], ['fabricante', 'Fabricante'],
    ['pais_planta', 'País de planta'],
]

// Reduce la foto y la devuelve como JPEG en base64 (sin el prefijo data:)
async function prepararImagen(file) {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    return { bitmap, dataUrl, base64: dataUrl.split(',')[1] }
}

// Lector ZXing (funciona en Android y iPhone); se carga solo en esta pantalla
async function crearLectorZxing() {
    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
        import('@zxing/browser'), import('@zxing/library'),
    ])
    const hints = new Map([
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_39, BarcodeFormat.CODE_128, BarcodeFormat.DATA_MATRIX,
            BarcodeFormat.QR_CODE, BarcodeFormat.PDF_417]],
        [DecodeHintType.TRY_HARDER, true],
    ])
    return new BrowserMultiFormatReader(hints)
}

function canvasDe(bitmap, girar) {
    const escala = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala)
    const c = document.createElement('canvas')
    c.width = girar ? h : w
    c.height = girar ? w : h
    const ctx = c.getContext('2d')
    if (girar) { ctx.translate(h, 0); ctx.rotate(Math.PI / 2) }
    ctx.drawImage(bitmap, 0, 0, w, h)
    return c
}

// Busca códigos en la foto: lector nativo (Chrome Android) y luego ZXing, derecho
// y girado (la etiqueta de la puerta suele ir vertical). Devuelve el VIN si alguno
// lo trae y los textos leídos, para mostrar qué se encontró si no es un VIN.
async function buscarCodigo(bitmap) {
    const textos = []
    if ('BarcodeDetector' in window) {
        try {
            const soportados = await window.BarcodeDetector.getSupportedFormats()
            const formatos = ['code_39', 'code_128', 'data_matrix', 'qr_code', 'pdf417'].filter(f => soportados.includes(f))
            if (formatos.length) {
                const codigos = await new window.BarcodeDetector({ formats: formatos }).detect(bitmap)
                textos.push(...codigos.map(c => c.rawValue))
            }
        } catch { /* sigue con ZXing */ }
    }
    if (!textos.some(vinEnTexto)) {
        const lector = await crearLectorZxing()
        for (const girar of [false, true]) {
            try {
                textos.push(lector.decodeFromCanvas(canvasDe(bitmap, girar)).getText())
                break
            } catch { /* no encontró */ }
        }
    }
    return { vin: textos.map(vinEnTexto).find(Boolean) || null, textos }
}

async function llamarFuncion(body) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/leer-vin`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    return data
}

export default function LaboratorioVin() {
    const camaraRef = useRef(null)
    const galeriaRef = useRef(null)
    const [foto, setFoto] = useState(null)       // dataUrl para la vista previa
    const [paso, setPaso] = useState('')         // texto de progreso
    const [error, setError] = useState('')
    const [resultado, setResultado] = useState(null) // { fuente, vin_leido, lectura, decodificado, modelo, tokens, ms }
    const [vin, setVin] = useState('')
    const [decodificando, setDecodificando] = useState(false)
    const [observaciones, setObservaciones] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [guardado, setGuardado] = useState(false)
    const [historial, setHistorial] = useState([])
    const [escaneando, setEscaneando] = useState(false)
    const [leidoNoVin, setLeidoNoVin] = useState('')
    const videoRef = useRef(null)
    const controlesRef = useRef(null)

    useEffect(() => () => controlesRef.current?.stop(), [])

    useEffect(() => { cargarHistorial() }, [])

    async function cargarHistorial() {
        const { data } = await supabase.from('lab_vin_escaneos')
            .select('id, vin, fuente, corregido, valido, digito_ok, ubicacion, decodificado, created_at')
            .order('created_at', { ascending: false }).limit(50)
        setHistorial(data || [])
    }

    function reiniciar() {
        setFoto(null); setResultado(null); setVin(''); setError(''); setPaso('')
        setObservaciones(''); setGuardado(false); setLeidoNoVin('')
    }

    function detenerEscaneo() {
        controlesRef.current?.stop()
        controlesRef.current = null
        setEscaneando(false)
    }

    // Escaneo en vivo: la cámara queda abierta hasta leer un código con un VIN
    async function escanearEnVivo() {
        reiniciar()
        setEscaneando(true)
        try {
            const lector = await crearLectorZxing()
            controlesRef.current = await lector.decodeFromConstraints(
                { video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } },
                videoRef.current,
                async (res) => {
                    if (!res || !controlesRef.current) return
                    const vinCodigo = vinEnTexto(res.getText())
                    if (!vinCodigo) { setLeidoNoVin(res.getText()); return }
                    detenerEscaneo()
                    setVin(vinCodigo)
                    setPaso('Código leído. Decodificando...')
                    try {
                        const r = await llamarFuncion({ vin: vinCodigo })
                        setResultado({ fuente: 'codigo_barras', vin_leido: vinCodigo, decodificado: r.decodificado })
                    } catch (err) {
                        setResultado({ fuente: 'codigo_barras', vin_leido: vinCodigo })
                        setError(err.message)
                    } finally {
                        setPaso('')
                    }
                })
        } catch (err) {
            detenerEscaneo()
            setError('No se pudo abrir la cámara: ' + err.message)
        }
    }

    async function alElegirFoto(e) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        reiniciar()
        try {
            setPaso('Preparando la foto...')
            const { bitmap, dataUrl, base64 } = await prepararImagen(file)
            setFoto(dataUrl)

            setPaso('Buscando código de barras...')
            const { vin: vinCodigo, textos } = await buscarCodigo(bitmap)
            if (vinCodigo) {
                setPaso('Código encontrado. Decodificando...')
                const r = await llamarFuncion({ vin: vinCodigo })
                setResultado({ fuente: 'codigo_barras', vin_leido: vinCodigo, decodificado: r.decodificado })
                setVin(vinCodigo)
                return
            }

            if (textos.length) setLeidoNoVin(textos.join(' · '))
            setPaso('No hay código de barras con un VIN. Leyendo el serial con IA...')
            const r = await llamarFuncion({ imagen: base64, media_type: 'image/jpeg' }).catch(err => {
                throw new Error('No se encontró un código de barras con un VIN en la foto, y la lectura con IA falló: ' + err.message)
            })
            setResultado({ fuente: 'ia', ...r })
            setVin(r.vin || '')
        } catch (err) {
            setError(err.message)
        } finally {
            setPaso('')
        }
    }

    async function redecodificar() {
        setDecodificando(true); setError('')
        try {
            const r = await llamarFuncion({ vin })
            setResultado(prev => ({ ...(prev || { fuente: 'manual', vin_leido: null }), decodificado: r.decodificado, vinDecodificado: r.vin }))
        } catch (err) {
            setError(err.message)
        } finally {
            setDecodificando(false)
        }
    }

    async function guardar() {
        const v = validarVin(vin)
        const r = resultado || { fuente: 'manual' }
        setGuardando(true); setError('')
        const { error: e } = await supabase.from('lab_vin_escaneos').insert({
            vin: v.vin,
            vin_leido: r.vin_leido ?? null,
            fuente: r.fuente,
            corregido: !!r.vin_leido && normalizarVin(r.vin_leido) !== v.vin,
            valido: v.valido,
            digito_ok: v.digito_ok,
            ubicacion: r.lectura?.ubicacion ?? null,
            legibilidad: r.lectura?.legibilidad ?? null,
            notas_lectura: [r.lectura?.notas, r.lectura?.caracteres_dudosos].filter(Boolean).join(' · ') || null,
            decodificado: r.decodificado ?? null,
            observaciones: observaciones.trim() || null,
        })
        setGuardando(false)
        if (e) { setError(e.message); return }
        setGuardado(true)
        cargarHistorial()
    }

    const val = validarVin(vin)
    const decod = resultado?.decodificado
    // La decodificación mostrada es del VIN actual solo si no se editó después
    const decodVigente = decod && (resultado.vinDecodificado ?? resultado.vin ?? resultado.vin_leido) === val.vin

    return (
        <div style={{ padding: '16px', maxWidth: '720px', margin: '0 auto' }}>
            <Link to="/superadmin" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6b7280', textDecoration: 'none', marginBottom: '8px' }}>
                <ArrowLeft size={14} /> Super Admin
            </Link>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>🧪 Lectura de VIN</h1>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 16px' }}>
                Prueba de laboratorio: foto del serial de carrocería → código de barras o IA → base de datos.
            </p>

            <input ref={camaraRef} type="file" accept="image/*" capture="environment" onChange={alElegirFoto} style={{ display: 'none' }} />
            <input ref={galeriaRef} type="file" accept="image/*" onChange={alElegirFoto} style={{ display: 'none' }} />

            <button onClick={escaneando ? detenerEscaneo : escanearEnVivo} disabled={!!paso}
                style={{ ...btn(escaneando ? '#b91c1c' : '#16a34a'), width: '100%', marginBottom: '10px' }}>
                {escaneando ? <><X size={18} /> Cancelar escaneo</> : <><ScanLine size={18} /> Escanear código de barras</>}
            </button>

            <div style={{ ...card, padding: '8px', display: escaneando ? 'block' : 'none' }}>
                <video ref={videoRef} muted playsInline style={{ width: '100%', borderRadius: '8px', display: 'block', backgroundColor: '#000' }} />
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '8px 4px 0' }}>
                    Apunta al código de barras y acércate hasta que ocupe buena parte de la pantalla. Si está vertical, gira el teléfono.
                </p>
            </div>

            {leidoNoVin && (
                <div style={{ ...card, backgroundColor: '#fffbeb', borderColor: '#fde68a', color: '#92400e', fontSize: '13px' }}>
                    Se leyó un código, pero no contiene un VIN: <span style={{ fontFamily: 'ui-monospace, Consolas, monospace' }}>{leidoNoVin}</span>
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <button onClick={() => camaraRef.current?.click()} disabled={!!paso || escaneando} style={btn('#1d4ed8')}>
                    <Camera size={18} /> Tomar foto
                </button>
                <button onClick={() => galeriaRef.current?.click()} disabled={!!paso || escaneando} style={btn('#fff', '#374151')}>
                    <ImageIcon size={18} /> Galería
                </button>
            </div>

            {paso && (
                <div style={{ ...card, display: 'flex', alignItems: 'center', gap: '10px', color: '#1d4ed8', fontSize: '14px' }}>
                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> {paso}
                    <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
                </div>
            )}

            {error && (
                <div style={{ ...card, backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#991b1b', fontSize: '14px' }}>
                    {error}
                </div>
            )}

            {foto && (
                <div style={card}>
                    <img src={foto} alt="Foto del serial" style={{ width: '100%', borderRadius: '8px', display: 'block' }} />
                </div>
            )}

            {(resultado || (foto && !paso)) && (
                <div style={card}>
                    {resultado && (
                        <p style={{ ...etiqueta, marginBottom: '8px' }}>
                            Leído por <b>{FUENTE[resultado.fuente]}</b>
                            {resultado.lectura && <> · {UBICACION[resultado.lectura.ubicacion] || resultado.lectura.ubicacion} · legibilidad {resultado.lectura.legibilidad}</>}
                            {resultado.ms && <> · {(resultado.ms / 1000).toFixed(1)} s</>}
                        </p>
                    )}
                    {resultado?.lectura && !resultado.lectura.encontrado && (
                        <p style={{ fontSize: '14px', color: '#92400e', margin: '0 0 8px' }}>
                            La IA no encontró un VIN legible. Puedes escribirlo a mano o probar otra foto.
                        </p>
                    )}

                    <p style={etiqueta}>VIN (confírmalo o corrígelo)</p>
                    <input
                        value={vin}
                        onChange={e => { setVin(normalizarVin(e.target.value).slice(0, 17)); setGuardado(false) }}
                        placeholder="17 caracteres"
                        style={{
                            width: '100%', boxSizing: 'border-box', padding: '12px', fontSize: '20px', letterSpacing: '2px',
                            fontFamily: 'ui-monospace, Consolas, monospace', border: '2px solid ' + (val.valido ? '#16a34a' : '#d1d5db'),
                            borderRadius: '8px', color: '#111827',
                        }}
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0' }}>
                        <Insignia ok={val.vin.length === 17} texto={`${val.vin.length}/17 caracteres`} />
                        <Insignia ok={!/[IOQ]/.test(val.vin)} texto="Sin I, O, Q" />
                        {val.valido && <Insignia ok={val.digito_ok} texto={
                            val.digito_ok === null ? 'Dígito verificador: no aplica' : val.digito_ok ? 'Dígito verificador correcto' : 'Dígito verificador NO cuadra'
                        } />}
                    </div>
                    {resultado?.lectura?.caracteres_dudosos && (
                        <p style={{ fontSize: '13px', color: '#92400e', margin: '0 0 6px' }}>Dudosos: {resultado.lectura.caracteres_dudosos}</p>
                    )}
                    {resultado?.lectura?.notas && (
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 6px' }}>{resultado.lectura.notas}</p>
                    )}

                    {val.valido && !decodVigente && (
                        <button onClick={redecodificar} disabled={decodificando} style={{ ...btn('#fff', '#374151'), width: '100%', marginTop: '6px' }}>
                            <RefreshCw size={16} /> {decodificando ? 'Decodificando...' : 'Decodificar este VIN'}
                        </button>
                    )}

                    {decodVigente && (
                        <div style={{ marginTop: '10px' }}>
                            <p style={{ ...etiqueta, marginBottom: '6px' }}>Datos del vehículo (NHTSA)</p>
                            {decod.error ? (
                                <p style={{ fontSize: '13px', color: '#991b1b', margin: 0 }}>{decod.error}</p>
                            ) : (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                                        {CAMPOS_DECOD.filter(([k]) => decod[k]).map(([k, l]) => (
                                            <div key={k} style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '6px 8px' }}>
                                                <div style={{ fontSize: '11px', color: '#6b7280' }}>{l}</div>
                                                <div style={{ fontSize: '14px', color: '#111827', fontWeight: 500 }}>{decod[k]}</div>
                                            </div>
                                        ))}
                                    </div>
                                    {!CAMPOS_DECOD.some(([k]) => decod[k]) && (
                                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>Sin datos: la base de la NHTSA cubre sobre todo vehículos del mercado de EE. UU.</p>
                                    )}
                                    {decod.aviso && <p style={{ fontSize: '12px', color: '#92400e', margin: '6px 0 0' }}>{decod.aviso}</p>}
                                </>
                            )}
                        </div>
                    )}

                    <p style={{ ...etiqueta, marginTop: '12px' }}>Observaciones (opcional)</p>
                    <input value={observaciones} onChange={e => setObservaciones(e.target.value)}
                        placeholder="Ej.: placa del parabrisas, de noche"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '10px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '8px' }} />

                    <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                        <button onClick={guardar} disabled={!val.vin || guardando || guardado} style={btn(guardado ? '#16a34a' : '#111827')}>
                            <Check size={18} /> {guardado ? 'Guardado' : guardando ? 'Guardando...' : 'Guardar'}
                        </button>
                        <button onClick={reiniciar} style={btn('#fff', '#374151')}>Nueva lectura</button>
                    </div>
                    {!val.valido && val.vin && (
                        <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#92400e', margin: '8px 0 0' }}>
                            <AlertTriangle size={14} /> Se puede guardar igual, queda marcado como no válido.
                        </p>
                    )}
                </div>
            )}

            {!foto && !resultado && !escaneando && (
                <button onClick={() => setResultado({ fuente: 'manual', vin_leido: null })}
                    style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer', marginBottom: '16px' }}>
                    Escribir un VIN a mano
                </button>
            )}

            <div style={card}>
                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: '0 0 10px' }}>Últimas lecturas ({historial.length})</p>
                {historial.length === 0 && <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Todavía no hay lecturas guardadas.</p>}
                {historial.map(h => (
                    <div key={h.id} style={{ borderTop: '1px solid #f3f4f6', padding: '8px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: '14px', color: h.valido ? '#111827' : '#b91c1c' }}>{h.vin}</span>
                            <span style={{ fontSize: '12px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                {new Date(h.created_at).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {FUENTE[h.fuente]}{h.corregido ? ' (corregido)' : ''}
                            {h.ubicacion ? ` · ${UBICACION[h.ubicacion] || h.ubicacion}` : ''}
                            {h.decodificado?.marca ? ` · ${[h.decodificado.marca, h.decodificado.modelo, h.decodificado.anio].filter(Boolean).join(' ')}` : ''}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

function Insignia({ ok, texto }) {
    const color = ok === null ? ['#f3f4f6', '#4b5563'] : ok ? ['#dcfce7', '#166534'] : ['#fee2e2', '#991b1b']
    return <span style={{ fontSize: '12px', padding: '3px 8px', borderRadius: '999px', backgroundColor: color[0], color: color[1] }}>{texto}</span>
}
