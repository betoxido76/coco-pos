// Ficha del cliente → "Exoneración de IVA" (docs/plan-exoneracion-iva.md).
//
// Un cliente exonerado factura sin IVA en productos gravados, SOLO mientras
// tenga una exoneración vigente. El soporte lo lleva finanzas aparte; aquí va
// una referencia obligatoria (N° del documento o del control de finanzas) y la
// vigencia. Registrar y revocar: admin/finanzas, por RPC. Registrar una nueva
// reemplaza la vigente. Nada se borra: queda el historial.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { hoyYMD, fmtFechaCorta } from './SelectorFechaTasa'
import { estadoExoneracion } from '../lib/exoneracion'

const inp = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', color: '#374151' }

export default function ExoneracionIvaCliente({ clienteId, rif }) {
    const { perfil } = useAuth()
    const puedeEditar = ['admin', 'finanzas', 'superadmin'].includes(perfil?.rol)
    const [lista, setLista] = useState([])
    const [cargando, setCargando] = useState(true)
    const [form, setForm] = useState(null)        // { referencia, desde, hasta, observaciones }
    const [revocando, setRevocando] = useState(null)
    const [motivo, setMotivo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    async function cargar() {
        setCargando(true)
        const { data } = await supabase.from('exoneraciones_iva')
            .select('*').eq('cliente_id', clienteId).order('created_at', { ascending: false })
        setLista(data || [])
        setCargando(false)
    }
    useEffect(() => { if (clienteId) cargar() }, [clienteId])

    const vigente = lista.find(e => e.estado === 'vigente')
    const est = vigente ? estadoExoneracion(vigente) : null

    async function registrar() {
        if (!form.referencia.trim()) { setError('La referencia es obligatoria'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.rpc('registrar_exoneracion_iva', {
            p_cliente_id: clienteId, p_referencia: form.referencia.trim(),
            p_vigente_desde: form.desde || null, p_vigente_hasta: form.hasta || null,
            p_observaciones: form.observaciones.trim() || null,
        })
        setGuardando(false)
        if (err) { setError(err.message); return }
        setForm(null); cargar()
    }

    async function revocar() {
        if (!motivo.trim()) { setError('El motivo es obligatorio'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.rpc('revocar_exoneracion_iva', { p_exoneracion_id: revocando.id, p_motivo: motivo.trim() })
        setGuardando(false)
        if (err) { setError(err.message); return }
        setRevocando(null); setMotivo(''); cargar()
    }

    const caja = { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', marginBottom: '20px' }
    const titulo = <p style={{ fontSize: '13px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>Exoneración de IVA</p>

    if (!clienteId) return (
        <div style={caja}>
            {titulo}
            <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>Guarda el cliente para registrarle una exoneración.</p>
        </div>
    )

    return (
        <div style={caja}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div>
                    {titulo}
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: '0 0 14px' }}>
                        Con una exoneración vigente, sus notas salen sin IVA aunque el producto sea gravado. Sin ella, se cobra IVA.
                    </p>
                </div>
                {puedeEditar && !form && (
                    <button type="button" onClick={() => { setError(''); setForm({ referencia: '', desde: hoyYMD(), hasta: '', observaciones: '' }) }}
                        style={{ flexShrink: 0, backgroundColor: '#eef2ff', color: '#4338ca', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }}>
                        {vigente ? 'Reemplazar' : '+ Registrar exoneración'}
                    </button>
                )}
            </div>

            {cargando ? <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Cargando...</p> : (<>
                {vigente ? (
                    <div style={{ backgroundColor: est.vencida ? '#fef2f2' : '#eef2ff', border: `1px solid ${est.vencida ? '#fecaca' : '#c7d2fe'}`, borderRadius: '10px', padding: '12px 14px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
                            <div style={{ fontSize: '13px', color: '#312e81' }}>
                                <strong>{est.vencida ? 'Exoneración vencida' : est.futura ? 'Exoneración (aún no empieza)' : 'Cliente exonerado de IVA'}</strong>
                                {' · '}Ref. <span style={{ fontFamily: 'monospace' }}>{vigente.referencia}</span>
                                <div style={{ fontSize: '12px', color: '#4338ca', marginTop: '2px' }}>
                                    Desde {fmtFechaCorta(vigente.vigente_desde)} · {vigente.vigente_hasta ? `hasta ${fmtFechaCorta(vigente.vigente_hasta)}` : 'sin vencimiento'}
                                    {est.porVencer && <span style={{ color: '#d97706', fontWeight: 600 }}> · vence en {est.dias} días</span>}
                                </div>
                                {vigente.observaciones && <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>{vigente.observaciones}</div>}
                            </div>
                            {puedeEditar && (
                                <button type="button" onClick={() => { setError(''); setRevocando(vigente) }}
                                    style={{ flexShrink: 0, background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}>
                                    Revocar
                                </button>
                            )}
                        </div>
                    </div>
                ) : !form && (
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 8px' }}>No está exonerado: sus notas llevan IVA según el producto.</p>
                )}

                {form && (
                    <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px', marginBottom: '12px' }}>
                        {!rif && (
                            <div style={{ fontSize: '12px', color: '#dc2626', marginBottom: '10px' }}>
                                El cliente no tiene RIF: cárgalo y guarda el cliente antes de registrar la exoneración.
                            </div>
                        )}
                        {vigente && (
                            <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '10px' }}>
                                La exoneración vigente (Ref. {vigente.referencia}) quedará revocada y reemplazada por esta.
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Referencia <span style={{ color: '#dc2626' }}>*</span></label>
                                <input value={form.referencia} onChange={e => setForm(f => ({ ...f, referencia: e.target.value }))}
                                    placeholder="N° del documento o del control de finanzas" style={inp} autoFocus />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Vigente desde</label>
                                <input type="date" value={form.desde} onChange={e => setForm(f => ({ ...f, desde: e.target.value }))} style={inp} />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Hasta (opcional)</label>
                                <input type="date" value={form.hasta} onChange={e => setForm(f => ({ ...f, hasta: e.target.value }))} style={inp} />
                            </div>
                            <div style={{ gridColumn: 'span 3' }}>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Observaciones</label>
                                <input value={form.observaciones} onChange={e => setForm(f => ({ ...f, observaciones: e.target.value }))} style={inp} />
                            </div>
                        </div>
                        {error && <div style={{ fontSize: '12px', color: '#dc2626', marginTop: '8px' }}>{error}</div>}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button type="button" onClick={registrar} disabled={guardando || !rif}
                                style={{ backgroundColor: '#4338ca', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: 600, cursor: guardando || !rif ? 'default' : 'pointer', opacity: guardando || !rif ? 0.6 : 1 }}>
                                {guardando ? 'Guardando...' : 'Registrar'}
                            </button>
                            <button type="button" onClick={() => setForm(null)}
                                style={{ backgroundColor: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                        </div>
                    </div>
                )}

                {lista.filter(e => e.estado === 'revocada').length > 0 && (
                    <details style={{ fontSize: '12px', color: '#6b7280' }}>
                        <summary style={{ cursor: 'pointer' }}>Historial ({lista.filter(e => e.estado === 'revocada').length} revocada/s)</summary>
                        {lista.filter(e => e.estado === 'revocada').map(e => (
                            <div key={e.id} style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
                                Ref. <span style={{ fontFamily: 'monospace' }}>{e.referencia}</span> · {fmtFechaCorta(e.vigente_desde)} – {e.vigente_hasta ? fmtFechaCorta(e.vigente_hasta) : 'sin venc.'}
                                {' · '}revocada {e.fecha_revocacion ? fmtFechaCorta(e.fecha_revocacion.slice(0, 10)) : ''}: {e.motivo_revocacion}
                            </div>
                        ))}
                    </details>
                )}
            </>)}

            {revocando && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px' }}>
                        <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 6px' }}>Revocar exoneración</h2>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 14px' }}>
                            Ref. {revocando.referencia}. Desde ahora sus notas llevan IVA. Las notas ya emitidas no cambian.
                        </p>
                        <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Motivo"
                            style={{ ...inp, fontFamily: 'inherit' }} />
                        {error && <div style={{ marginTop: '8px', fontSize: '12px', color: '#dc2626' }}>{error}</div>}
                        <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
                            <button type="button" onClick={() => { setRevocando(null); setMotivo('') }} disabled={guardando}
                                style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer' }}>Cancelar</button>
                            <button type="button" onClick={revocar} disabled={guardando}
                                style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                                {guardando ? 'Revocando...' : 'Revocar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
