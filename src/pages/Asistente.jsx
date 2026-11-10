// Asistente de IA (docs/plan-asistente-ia.md): preguntas sobre la operación
// respondidas con datos del sistema. Solo lectura. La IA corre en la Edge Function
// `asistente`; aquí solo se muestran conversaciones y se envían preguntas.
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Sparkles, Send, Plus, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const SUGERENCIAS = [
    '¿Quién me debe más y cuánto está vencido?',
    '¿Cómo van las ventas de este mes contra el mes pasado?',
    '¿Cuánto cobramos esta semana, por método de pago?',
    '¿Qué pedidos hay programados para mañana?',
    '¿Qué productos están por debajo del mínimo?',
    '¿Qué le debemos a proveedores esta semana?',
]

async function preguntar(body) {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asistente`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
    return data
}

// Etiquetas "Consultó: …" guardadas con el mensaje
const consultoDe = (herramientas) => [...new Set((herramientas || []).map(h => h.etiqueta).filter(Boolean))]

const estiloMd = `
.md-asistente { font-size: 14px; line-height: 1.55; color: #1f2937; }
.md-asistente p { margin: 0 0 8px; }
.md-asistente p:last-child { margin-bottom: 0; }
.md-asistente ul, .md-asistente ol { margin: 0 0 8px; padding-left: 20px; }
.md-asistente h1, .md-asistente h2, .md-asistente h3 { font-size: 15px; margin: 10px 0 6px; }
.md-asistente table { border-collapse: collapse; margin: 6px 0 10px; font-size: 13px; display: block; overflow-x: auto; max-width: 100%; }
.md-asistente th, .md-asistente td { border: 1px solid #e5e7eb; padding: 5px 10px; text-align: left; white-space: nowrap; }
.md-asistente th { background: #f9fafb; font-weight: 600; }
.md-asistente code { background: #f3f4f6; padding: 1px 4px; border-radius: 4px; font-size: 12px; }
`

export default function Asistente() {
    const { perfil } = useAuth()
    const esSuper = perfil?.rol === 'superadmin'
    const [conversaciones, setConversaciones] = useState([])
    const [actual, setActual] = useState(null)          // id de la conversación abierta
    const [mensajes, setMensajes] = useState([])
    const [texto, setTexto] = useState('')
    const [enviando, setEnviando] = useState(false)
    const [error, setError] = useState('')
    const finRef = useRef(null)

    useEffect(() => { cargarConversaciones(); nueva() }, [perfil?.empresa_id])
    useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, enviando])

    async function cargarConversaciones() {
        const { data } = await supabase.from('ia_conversaciones').select('id, titulo, updated_at')
            .eq('empresa_id', perfil.empresa_id).eq('usuario_id', perfil.id)
            .order('updated_at', { ascending: false }).limit(50)
        setConversaciones(data || [])
    }

    async function abrir(id) {
        setActual(id); setError('')
        const { data } = await supabase.from('ia_mensajes').select('id, rol, contenido, herramientas, modelo, costo_usd, created_at')
            .eq('conversacion_id', id).order('created_at')
        setMensajes((data || []).map(m => ({ ...m, consulto: consultoDe(m.herramientas) })))
    }

    function nueva() { setActual(null); setMensajes([]); setError(''); setTexto('') }

    async function enviar(pregunta) {
        const p = (pregunta ?? texto).trim()
        if (!p || enviando) return
        setTexto(''); setError(''); setEnviando(true)
        setMensajes(ms => [...ms, { id: `u${Date.now()}`, rol: 'usuario', contenido: p }])
        try {
            const r = await preguntar({ pregunta: p, conversacion_id: actual, empresa_id: perfil.empresa_id })
            setMensajes(ms => [...ms, { id: `a${Date.now()}`, rol: 'asistente', contenido: r.respuesta, consulto: r.consulto,
                modelo: r.modelo, costo_usd: r.costo_usd }])
            if (!actual) { setActual(r.conversacion_id); cargarConversaciones() }
        } catch (e) {
            setError(e.message)
            setTexto(p)
            setMensajes(ms => ms.slice(0, -1))
        } finally {
            setEnviando(false)
        }
    }

    return (
        <div style={{ display: 'flex', height: '100vh', backgroundColor: '#f9fafb' }}>
            <style>{estiloMd}</style>
            {/* Conversaciones */}
            <aside style={{ width: '260px', flexShrink: 0, borderRight: '1px solid #e5e7eb', backgroundColor: '#fff', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '16px' }}>
                    <button onClick={nueva}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '9px', borderRadius: '8px', border: '1px solid #d1d5db', backgroundColor: '#fff', fontSize: '13px', fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
                        <Plus size={15} /> Nueva conversación
                    </button>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {conversaciones.map(c => (
                        <div key={c.id} onClick={() => abrir(c.id)}
                            style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '10px 16px', cursor: 'pointer', fontSize: '13px',
                                color: actual === c.id ? '#0F1F3D' : '#4b5563', backgroundColor: actual === c.id ? '#eef2f7' : 'transparent', fontWeight: actual === c.id ? 600 : 400 }}>
                            <MessageSquare size={14} style={{ flexShrink: 0, marginTop: '2px', color: '#9ca3af' }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.titulo || 'Sin título'}</span>
                        </div>
                    ))}
                </div>
            </aside>

            {/* Chat */}
            <section style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
                        {mensajes.length === 0 && !enviando && (
                            <div style={{ textAlign: 'center', padding: '48px 0 24px' }}>
                                <div style={{ display: 'inline-flex', padding: '12px', borderRadius: '50%', backgroundColor: '#e6faf6', marginBottom: '12px' }}>
                                    <Sparkles size={26} color="#00BFA5" />
                                </div>
                                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#0F1F3D', margin: '0 0 6px' }}>Asistente</h1>
                                <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px' }}>
                                    Pregunta sobre ventas, cobranza, pedidos, inventario, cuentas por pagar y gastos. Responde con los datos del sistema; no modifica nada.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', textAlign: 'left' }}>
                                    {SUGERENCIAS.map(s => (
                                        <button key={s} onClick={() => enviar(s)}
                                            style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #e5e7eb', backgroundColor: '#fff', fontSize: '13px', color: '#374151', cursor: 'pointer', textAlign: 'left' }}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {mensajes.map(m => m.rol === 'usuario' ? (
                            <div key={m.id} style={{ display: 'flex', justifyContent: 'flex-end', margin: '12px 0' }}>
                                <div style={{ maxWidth: '80%', backgroundColor: '#0F1F3D', color: '#fff', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                                    {m.contenido}
                                </div>
                            </div>
                        ) : (
                            <div key={m.id} style={{ margin: '12px 0' }}>
                                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', padding: '14px 16px', borderRadius: '14px 14px 14px 4px' }}>
                                    <div className="md-asistente"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.contenido}</ReactMarkdown></div>
                                </div>
                                {(m.consulto?.length > 0 || (esSuper && m.costo_usd != null)) && (
                                    <div style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 6px 0' }}>
                                        {m.consulto?.length > 0 && <>Consultó: {m.consulto.join(' · ')}</>}
                                        {esSuper && m.costo_usd != null && <> {m.consulto?.length > 0 && '·'} {String(m.modelo || '').replace('anthropic/', '')} · ${Number(m.costo_usd).toFixed(4)}</>}
                                    </div>
                                )}
                            </div>
                        ))}
                        {enviando && (
                            <div style={{ margin: '12px 0', fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sparkles size={14} color="#00BFA5" /> Consultando el sistema…
                            </div>
                        )}
                        {error && (
                            <div style={{ margin: '12px 0', padding: '10px 14px', borderRadius: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '13px' }}>
                                {error}
                            </div>
                        )}
                        <div ref={finRef} />
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #e5e7eb', backgroundColor: '#fff', padding: '14px 24px' }}>
                    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} disabled={enviando}
                            placeholder="Escribe tu pregunta…  (Enter para enviar, Shift+Enter para nueva línea)"
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
                            style={{ flex: 1, resize: 'none', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '10px', fontSize: '14px', fontFamily: 'inherit', color: '#1f2937' }} />
                        <button onClick={() => enviar()} disabled={enviando || !texto.trim()} aria-label="Enviar"
                            style={{ padding: '11px 14px', borderRadius: '10px', border: 'none', backgroundColor: enviando || !texto.trim() ? '#e5e7eb' : '#00BFA5', color: '#fff', cursor: enviando || !texto.trim() ? 'default' : 'pointer' }}>
                            <Send size={18} />
                        </button>
                    </div>
                    <p style={{ maxWidth: '820px', margin: '6px auto 0', fontSize: '11px', color: '#9ca3af' }}>
                        Las respuestas salen de los datos del sistema. Verifica las cifras importantes en su pantalla antes de decidir.
                    </p>
                </div>
            </section>
        </div>
    )
}
