import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Save, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const TASAS = [
    { clave: 'tasa_bcv', label: 'USD · BCV', descripcion: 'Tasa oficial del Banco Central de Venezuela' },
    { clave: 'tasa_euro', label: 'EUR · BCV', descripcion: 'Tasa del Euro según BCV' },
    { clave: 'tasa_binance', label: 'USD · Binance', descripcion: 'Tasa de referencia del mercado paralelo' },
]

export default function Configuracion() {
    const { perfil } = useAuth()
    const [valores, setValores] = useState({ tasa_bcv: '', tasa_euro: '', tasa_binance: '' })
    const [aprobacionPedido, setAprobacionPedido] = useState(true)
    const [loading, setLoading] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [guardandoConf, setGuardandoConf] = useState(false)
    const [exito, setExito] = useState(false)
    const [exitoConf, setExitoConf] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => { cargar() }, [])

    async function cargar() {
        const [{ data: tasasData }, { data: empresa }] = await Promise.all([
            supabase.from('configuracion').select('clave, valor').eq('empresa_id', perfil.empresa_id),
            supabase.from('empresas').select('aprobacion_pedido').eq('id', perfil.empresa_id).single(),
        ])
        if (tasasData) {
            const mapa = {}
            tasasData.forEach(r => { mapa[r.clave] = r.valor })
            setValores({ tasa_bcv: mapa.tasa_bcv ?? '', tasa_euro: mapa.tasa_euro ?? '', tasa_binance: mapa.tasa_binance ?? '' })
        }
        if (empresa) setAprobacionPedido(empresa.aprobacion_pedido ?? true)
        setLoading(false)
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
        setGuardando(true)
        setError('')
        const updates = TASAS.map(t => ({
            clave: t.clave,
            empresa_id: perfil.empresa_id,
            valor: Number(valores[t.clave]),
            actualizado_at: new Date().toISOString(),
        }))
        const { error: err } = await supabase
            .from('configuracion')
            .upsert(updates, { onConflict: 'clave,empresa_id' })
        setGuardando(false)
        if (err) { setError('Error al guardar: ' + err.message); return }
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
            <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 28px' }}>Tasas de cambio vigentes</p>

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
                {exito ? <><Check size={16} /> Guardado</> : <><Save size={16} /> {guardando ? 'Guardando...' : 'Guardar tasas'}</>}
            </button>

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