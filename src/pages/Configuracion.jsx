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
    const [loading, setLoading] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [exito, setExito] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => { cargar() }, [])

    async function cargar() {
        const { data } = await supabase.from('configuracion').select('clave, valor')
        if (data) {
            const mapa = {}
            data.forEach(r => { mapa[r.clave] = r.valor })
            setValores({
                tasa_bcv: mapa.tasa_bcv ?? '',
                tasa_euro: mapa.tasa_euro ?? '',
                tasa_binance: mapa.tasa_binance ?? '',
            })
        }
        setLoading(false)
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
        </div>
    )
}