// Super Admin → empresa → pestaña IA: interruptor, límite mensual, modelo y
// consumo por mes (tabla ia_consumo). docs/plan-asistente-ia.md
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const MODELOS = [
    { key: '', label: 'Por defecto (Sonnet 5.5)' },
    { key: 'haiku', label: 'Haiku 5.5' },
    { key: 'sonnet', label: 'Sonnet 5.5' },
    { key: 'opus', label: 'Opus 5.5' },
]
const FUNCIONES = { asistente: 'Asistente', lectura_vin: 'Lectura de VIN' }
const usd = (n, dec = 2) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
const mesCaracas = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }).slice(0, 7)
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const etiquetaMes = (m) => { const [a, n] = m.split('-'); return `${MESES[Number(n) - 1]} ${a}` }

const input = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }
const th = { textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', borderBottom: '1px solid #e5e7eb' }
const td = { padding: '8px 12px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' }

export default function PanelIAEmpresa({ empresaId }) {
    const [cfg, setCfg] = useState(null)
    const [form, setForm] = useState({ ia_activa: false, ia_limite_mensual_usd: '', ia_modelo: '', ia_preguntas_dia_usuario: 40 })
    const [consumo, setConsumo] = useState([])
    const [preguntas, setPreguntas] = useState([])   // preguntas del mes en curso (ia_mensajes rol usuario)
    const [usuarios, setUsuarios] = useState({})
    const [cargando, setCargando] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [msg, setMsg] = useState('')

    useEffect(() => { cargar() }, [empresaId])

    async function cargar() {
        setCargando(true); setMsg('')
        const desde = new Date(); desde.setMonth(desde.getMonth() - 11, 1); desde.setHours(0, 0, 0, 0)
        const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
        const [{ data: emp }, { data: filas }, { data: pregs }, { data: usrs }] = await Promise.all([
            supabase.from('empresas').select('ia_activa, ia_limite_mensual_usd, ia_modelo, ia_preguntas_dia_usuario').eq('id', empresaId).single(),
            supabase.from('ia_consumo').select('funcion, modelo, tokens_entrada, tokens_salida, tokens_cache_lectura, costo_usd, conversacion_id, usuario_id, created_at')
                .eq('empresa_id', empresaId).gte('created_at', desde.toISOString()).order('created_at', { ascending: false }).limit(10000),
            supabase.from('ia_mensajes').select('created_at, ia_conversaciones!inner(usuario_id, empresa_id)')
                .eq('rol', 'usuario').eq('ia_conversaciones.empresa_id', empresaId).gte('created_at', inicioMes.toISOString()).limit(10000),
            supabase.from('usuarios').select('id, nombre').eq('empresa_id', empresaId),
        ])
        setCfg(emp)
        setForm({ ia_activa: !!emp?.ia_activa, ia_limite_mensual_usd: emp?.ia_limite_mensual_usd ?? '', ia_modelo: emp?.ia_modelo || '',
            ia_preguntas_dia_usuario: emp?.ia_preguntas_dia_usuario ?? 40 })
        setConsumo(filas || [])
        setPreguntas(pregs || [])
        setUsuarios(Object.fromEntries((usrs || []).map(u => [u.id, u.nombre])))
        setCargando(false)
    }

    async function guardar() {
        setGuardando(true); setMsg('')
        const limite = form.ia_limite_mensual_usd === '' ? null : Number(form.ia_limite_mensual_usd)
        if (limite != null && (isNaN(limite) || limite < 0)) { setMsg('El límite debe ser un número positivo'); setGuardando(false); return }
        const porDia = Number(form.ia_preguntas_dia_usuario)
        if (!Number.isInteger(porDia) || porDia < 0) { setMsg('Las preguntas por día deben ser un número entero'); setGuardando(false); return }
        const cambios = { ia_activa: form.ia_activa, ia_limite_mensual_usd: limite, ia_modelo: form.ia_modelo || null, ia_preguntas_dia_usuario: porDia }
        const { error } = await supabase.from('empresas').update(cambios).eq('id', empresaId)
        setGuardando(false)
        setMsg(error ? `Error: ${error.message}` : 'Guardado')
        if (!error) setCfg({ ...cfg, ...cambios })
    }

    if (cargando) return <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando…</div>

    // Por mes y función: llamadas al modelo (una pregunta puede hacer varias), usuarios, tokens y costo
    const porMes = {}
    consumo.forEach(c => {
        const k = `${mesCaracas(c.created_at)}|${c.funcion}`
        const a = porMes[k] || (porMes[k] = { mes: mesCaracas(c.created_at), funcion: c.funcion, llamadas: 0, entrada: 0, salida: 0, cache: 0, costo: 0, usuarios: new Set() })
        a.llamadas++; a.entrada += c.tokens_entrada; a.salida += c.tokens_salida; a.cache += c.tokens_cache_lectura
        a.costo += Number(c.costo_usd); if (c.usuario_id) a.usuarios.add(c.usuario_id)
    })
    const filas = Object.values(porMes).sort((a, b) => b.mes.localeCompare(a.mes) || a.funcion.localeCompare(b.funcion))
    const mesActual = mesCaracas(new Date())
    const gastoMes = filas.filter(f => f.mes === mesActual).reduce((s, f) => s + f.costo, 0)
    const limite = cfg?.ia_limite_mensual_usd
    const pct = limite > 0 ? Math.min(100, gastoMes / limite * 100) : 0
    const cambiado = form.ia_activa !== !!cfg?.ia_activa || String(form.ia_limite_mensual_usd ?? '') !== String(cfg?.ia_limite_mensual_usd ?? '')
        || (form.ia_modelo || '') !== (cfg?.ia_modelo || '')
        || String(form.ia_preguntas_dia_usuario) !== String(cfg?.ia_preguntas_dia_usuario ?? 40)

    // Uso por usuario en el mes en curso: preguntas (hoy y en el mes) y costo del asistente
    const hoyCcs = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
    const porUsuario = {}
    const filaU = (id) => porUsuario[id] || (porUsuario[id] = { id, hoy: 0, mes: 0, costo: 0 })
    preguntas.forEach(p => {
        if (mesCaracas(p.created_at) !== mesActual) return
        const f = filaU(p.ia_conversaciones.usuario_id); f.mes++
        if (new Date(p.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Caracas' }) === hoyCcs) f.hoy++
    })
    consumo.forEach(c => { if (c.usuario_id && c.funcion === 'asistente' && mesCaracas(c.created_at) === mesActual) filaU(c.usuario_id).costo += Number(c.costo_usd) })
    const filasUsuario = Object.values(porUsuario).sort((a, b) => b.costo - a.costo)

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>Configuración</div>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', cursor: 'pointer' }}>
                        <input type="checkbox" checked={form.ia_activa} onChange={e => setForm({ ...form, ia_activa: e.target.checked })}
                            style={{ width: '16px', height: '16px', accentColor: '#1d4ed8' }} />
                        IA activa para esta empresa
                    </label>
                    <div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Límite mensual (USD)</div>
                        <input type="number" min="0" step="1" value={form.ia_limite_mensual_usd} placeholder="sin límite = sin uso"
                            onChange={e => setForm({ ...form, ia_limite_mensual_usd: e.target.value })} style={{ ...input, width: '150px' }} />
                    </div>
                    <div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Preguntas por usuario al día</div>
                        <input type="number" min="0" step="1" value={form.ia_preguntas_dia_usuario}
                            onChange={e => setForm({ ...form, ia_preguntas_dia_usuario: e.target.value })} style={{ ...input, width: '110px' }} />
                    </div>
                    <div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px' }}>Modelo del asistente</div>
                        <select value={form.ia_modelo} onChange={e => setForm({ ...form, ia_modelo: e.target.value })} style={input}>
                            {MODELOS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                        </select>
                    </div>
                    <button onClick={guardar} disabled={guardando || !cambiado}
                        style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', backgroundColor: cambiado ? '#1d4ed8' : '#e5e7eb', color: cambiado ? '#fff' : '#9ca3af', cursor: cambiado ? 'pointer' : 'default' }}>
                        {guardando ? 'Guardando…' : 'Guardar'}
                    </button>
                    {msg && <span style={{ fontSize: '12px', color: msg.startsWith('Error') ? '#dc2626' : '#16a34a' }}>{msg}</span>}
                </div>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '12px 0 0' }}>
                    Para usar el asistente, el usuario además necesita el módulo "Asistente IA" (pestañas Módulos y Usuarios).
                    Al llegar al límite del mes, el asistente avisa que se agotó el cupo. Cada usuario tiene además un tope de
                    preguntas por día (hora de Venezuela) y de 6 por minuto. El superadmin no tiene límite.
                </p>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Gasto de {etiquetaMes(mesActual)}</div>
                    <div style={{ fontSize: '20px', fontWeight: 700, color: pct >= 90 ? '#dc2626' : '#1f2937' }}>
                        {usd(gastoMes)} <span style={{ fontSize: '13px', fontWeight: 400, color: '#6b7280' }}>{limite != null ? `de ${usd(limite)}` : 'sin límite configurado'}</span>
                    </div>
                </div>
                {limite > 0 && (
                    <div style={{ height: '8px', backgroundColor: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a' }} />
                    </div>
                )}
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Uso por usuario en {etiquetaMes(mesActual)}</div>
                {filasUsuario.length === 0 ? (
                    <div style={{ padding: '0 20px 20px', fontSize: '13px', color: '#9ca3af' }}>Nadie ha usado el asistente este mes.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                            <th style={th}>Usuario</th><th style={th}>Preguntas hoy</th><th style={th}>Preguntas del mes</th><th style={th}>Costo del mes</th>
                        </tr></thead>
                        <tbody>
                            {filasUsuario.map(f => (
                                <tr key={f.id}>
                                    <td style={td}>{usuarios[f.id] || 'Superadmin / otro'}</td>
                                    <td style={td}>{f.hoy} <span style={{ color: '#9ca3af' }}>de {cfg?.ia_preguntas_dia_usuario ?? 40}</span></td>
                                    <td style={td}>{f.mes}</td>
                                    <td style={{ ...td, fontWeight: 600 }}>{usd(f.costo, 4)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ padding: '14px 20px', fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Consumo por mes (últimos 12)</div>
                {filas.length === 0 ? (
                    <div style={{ padding: '24px 20px', fontSize: '13px', color: '#9ca3af' }}>Sin consumo registrado.</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>
                            <th style={th}>Mes</th><th style={th}>Función</th><th style={th}>Llamadas</th><th style={th}>Usuarios</th>
                            <th style={th}>Tokens entrada</th><th style={th}>De caché</th><th style={th}>Tokens salida</th><th style={th}>Costo</th>
                        </tr></thead>
                        <tbody>
                            {filas.map(f => (
                                <tr key={`${f.mes}|${f.funcion}`}>
                                    <td style={td}>{etiquetaMes(f.mes)}</td>
                                    <td style={td}>{FUNCIONES[f.funcion] || f.funcion}</td>
                                    <td style={td}>{f.llamadas.toLocaleString('es-VE')}</td>
                                    <td style={td}>{f.usuarios.size}</td>
                                    <td style={td}>{f.entrada.toLocaleString('es-VE')}</td>
                                    <td style={td}>{f.cache.toLocaleString('es-VE')}</td>
                                    <td style={td}>{f.salida.toLocaleString('es-VE')}</td>
                                    <td style={{ ...td, fontWeight: 600 }}>{usd(f.costo, 4)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
