import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Save, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const TASAS = [
    { clave: 'tasa_bcv', label: 'USD · BCV', descripcion: 'Tasa oficial del Banco Central de Venezuela' },
    { clave: 'tasa_euro', label: 'EUR · BCV', descripcion: 'Tasa del Euro según BCV' },
    { clave: 'tasa_binance', label: 'USD · Binance', descripcion: 'Tasa de referencia del mercado paralelo' },
]

const hoyYMD = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fmtFecha = (ymd) => new Date(ymd + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })

export default function Configuracion() {
    const { perfil } = useAuth()
    const [valores, setValores] = useState({ tasa_bcv: '', tasa_euro: '', tasa_binance: '' })
    const [fecha, setFecha] = useState(hoyYMD())
    const [historico, setHistorico] = useState([])   // últimas fechas cargadas
    const [existeFecha, setExisteFecha] = useState(false)
    const [aprobacionPedido, setAprobacionPedido] = useState(true)
    const [loading, setLoading] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [guardandoConf, setGuardandoConf] = useState(false)
    const [exito, setExito] = useState(false)
    const [exitoConf, setExitoConf] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => { cargar() }, [])
    // Al cambiar la fecha se cargan las tasas de ESE día (vacías si aún no existe)
    useEffect(() => { if (!loading) cargarFecha(fecha) }, [fecha])

    async function cargar() {
        const [{ data: empresa }] = await Promise.all([
            supabase.from('empresas').select('aprobacion_pedido').eq('id', perfil.empresa_id).single(),
            cargarFecha(fecha),
            cargarHistorico(),
        ])
        if (empresa) setAprobacionPedido(empresa.aprobacion_pedido ?? true)
        setLoading(false)
    }

    // Tasas de una fecha puntual. Si no hay registro, los campos quedan vacíos
    // (se está creando la fecha) en vez de arrastrar los valores de otro día.
    async function cargarFecha(f) {
        const { data } = await supabase.from('tasas_cambio')
            .select('tasa_bcv, tasa_euro, tasa_binance')
            .eq('empresa_id', perfil.empresa_id).eq('fecha', f)
            .maybeSingle()
        setExisteFecha(!!data)
        setValores({
            tasa_bcv: data?.tasa_bcv ?? '',
            tasa_euro: data?.tasa_euro ?? '',
            tasa_binance: data?.tasa_binance ?? '',
        })
    }

    async function cargarHistorico() {
        const { data } = await supabase.from('tasas_cambio')
            .select('fecha, tasa_bcv, tasa_euro, tasa_binance')
            .eq('empresa_id', perfil.empresa_id)
            .order('fecha', { ascending: false })
            .limit(15)
        setHistorico(data || [])
    }

    async function guardarConfiguracion() {
        setGuardandoConf(true)
        const { error: err } = await supabase.from('empresas').update({ aprobacion_pedido: aprobacionPedido }).eq('id', perfil.empresa_id)
        setGuardandoConf(false)
        if (err) { setError('Error al guardar configuración: ' + err.message); return }
        setExitoConf(true)
        setTimeout(() => setExitoConf(false), 3000)
    }

    async function guardar() {
        if (TASAS.some(t => !(Number(valores[t.clave]) > 0))) {
            setError('Las tres tasas deben tener un valor mayor a 0 antes de guardar la fecha')
            return
        }
        setGuardando(true)
        setError('')

        // 1) Histórico: una fila por (empresa, fecha). Si la fecha ya existe se
        //    sobreescriben sus valores gracias al UNIQUE(empresa_id, fecha).
        const { error: errHist } = await supabase.from('tasas_cambio').upsert({
            empresa_id: perfil.empresa_id,
            fecha,
            tasa_bcv: Number(valores.tasa_bcv),
            tasa_euro: Number(valores.tasa_euro),
            tasa_binance: Number(valores.tasa_binance),
            actualizado_at: new Date().toISOString(),
        }, { onConflict: 'empresa_id,fecha' })
        if (errHist) { setGuardando(false); setError('Error al guardar: ' + errHist.message); return }

        // 2) `configuracion` = tasa vigente que leen los demás módulos (Ventas,
        //    Compras, Gastos, CxP, Bancos, Finanzas, NuevoPedido). Solo se
        //    sincroniza si esta es la fecha más reciente del histórico; cargar
        //    una fecha pasada no debe pisar la tasa vigente.
        const { data: ultima } = await supabase.from('tasas_cambio')
            .select('fecha').eq('empresa_id', perfil.empresa_id)
            .order('fecha', { ascending: false }).limit(1).maybeSingle()

        if (!ultima || fecha >= ultima.fecha) {
            const updates = TASAS.map(t => ({
                clave: t.clave,
                empresa_id: perfil.empresa_id,
                valor: Number(valores[t.clave]),
                actualizado_at: new Date().toISOString(),
            }))
            const { error: err } = await supabase
                .from('configuracion')
                .upsert(updates, { onConflict: 'clave,empresa_id' })
            if (err) { setGuardando(false); setError('Error al guardar: ' + err.message); return }
        }

        await cargarHistorico()
        setExisteFecha(true)
        setGuardando(false)
        setExito(true)
        setTimeout(() => setExito(false), 3000)
    }

    if (loading) return <div style={{ padding: '24px', color: '#9ca3af' }}>Cargando...</div>

    const bcv = Number(valores.tasa_bcv) || 0
    const eur = Number(valores.tasa_euro) || 0
    const bin = Number(valores.tasa_binance) || 0

    function pct(tasa, base) {
        if (!tasa || !base) return null
        const v = ((tasa - base) / base * 100)
        return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
    }

    return (
        <div style={{ padding: '24px', maxWidth: '560px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Configuración</h1>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>Tasas de cambio por fecha</p>

            {/* Fecha del registro — define qué día del histórico se está editando */}
            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                    <div>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Fecha de las tasas</p>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                            {existeFecha
                                ? 'Ya hay tasas cargadas para este día — al guardar se sobreescriben'
                                : 'Sin tasas para este día — al guardar se crea el registro'}
                        </p>
                    </div>
                    <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                        style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#1f2937', backgroundColor: '#fff' }} />
                </div>
                {/* Casi siempre cambia una sola tasa: copiar el último día evita retipear las tres */}
                {!existeFecha && historico.length > 0 && (
                    <button onClick={() => setValores({
                        tasa_bcv: historico[0].tasa_bcv ?? '',
                        tasa_euro: historico[0].tasa_euro ?? '',
                        tasa_binance: historico[0].tasa_binance ?? '',
                    })}
                        style={{ marginTop: '10px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                        Copiar tasas del {fmtFecha(historico[0].fecha)}
                    </button>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                {TASAS.map(t => (
                    <div key={t.clave} style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                            <div>
                                <p style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: 0 }}>{t.label}</p>
                                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>{t.descripcion}</p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '13px', color: '#6b7280' }}>Bs.</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={valores[t.clave]}
                                    onChange={e => setValores(prev => ({ ...prev, [t.clave]: e.target.value }))}
                                    style={{ width: '130px', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}
                                />
                            </div>
                        </div>
                        {valores[t.clave] > 0 && (
                            <p style={{ fontSize: '12px', color: '#16a34a', margin: '8px 0 0', textAlign: 'right' }}>
                                $1.00 = {Number(valores[t.clave]).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                            </p>
                        )}
                        {t.clave === 'tasa_euro' && eur > 0 && bcv > 0 && (
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0', textAlign: 'right' }}>
                                {pct(eur, bcv)} vs. USD·BCV
                            </p>
                        )}
                        {t.clave === 'tasa_binance' && bin > 0 && bcv > 0 && (
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0', textAlign: 'right' }}>
                                {pct(bin, bcv)} vs. USD·BCV
                            </p>
                        )}
                        {t.clave === 'tasa_binance' && bin > 0 && eur > 0 && (
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '2px 0 0', textAlign: 'right' }}>
                                {pct(bin, eur)} vs. EUR·BCV
                            </p>
                        )}
                    </div>
                ))}
            </div>

            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>
                    {error}
                </div>
            )}

            <button onClick={guardar} disabled={guardando}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: exito ? '#166534' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
                {exito ? <><Check size={16} /> Guardado</> : <><Save size={16} /> {guardando ? 'Guardando...' : existeFecha ? 'Actualizar tasas del día' : 'Guardar tasas del día'}</>}
            </button>

            {/* Histórico — clic en una fila la carga en el formulario para editarla */}
            {historico.length > 0 && (
                <div style={{ marginTop: '28px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Histórico de tasas</h2>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 12px' }}>Últimos {historico.length} días cargados · haz clic en una fecha para editarla</p>
                    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['Fecha', 'USD · BCV', 'EUR · BCV', 'USD · Binance'].map((h, i) => (
                                        <th key={h} style={{ padding: '9px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {historico.map(h => {
                                    const activa = h.fecha === fecha
                                    return (
                                        <tr key={h.fecha} onClick={() => setFecha(h.fecha)}
                                            style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', backgroundColor: activa ? '#f0fdf4' : 'transparent' }}>
                                            <td style={{ padding: '9px 14px', fontSize: '13px', fontWeight: activa ? 600 : 400, color: activa ? '#16a34a' : '#374151' }}>{fmtFecha(h.fecha)}</td>
                                            {['tasa_bcv', 'tasa_euro', 'tasa_binance'].map(k => (
                                                <td key={k} style={{ padding: '9px 14px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>
                                                    {h[k] != null ? Number(h[k]).toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '—'}
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Configuración de pedidos */}
            <div style={{ marginTop: '32px', borderTop: '1px solid #e5e7eb', paddingTop: '24px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Flujo de pedidos</h2>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>Aprobación antes de pasar a alistamiento</p>
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Requerir aprobación de pedidos</p>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>
                            {aprobacionPedido
                                ? 'Los pedidos pasan por aprobación antes de ir a Despacho'
                                : 'Los pedidos van directamente a Despacho sin aprobación previa'}
                        </p>
                    </div>
                    <button onClick={() => setAprobacionPedido(v => !v)}
                        style={{ width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer', position: 'relative', backgroundColor: aprobacionPedido ? '#16a34a' : '#d1d5db', transition: 'background 0.2s', flexShrink: 0 }}>
                        <span style={{ position: 'absolute', top: '2px', left: aprobacionPedido ? '22px' : '2px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                    </button>
                </div>
                <button onClick={guardarConfiguracion} disabled={guardandoConf}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', backgroundColor: exitoConf ? '#166534' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}>
                    {exitoConf ? <><Check size={16} /> Guardado</> : <><Save size={16} /> {guardandoConf ? 'Guardando...' : 'Guardar configuración'}</>}
                </button>
            </div>
        </div>
    )
}