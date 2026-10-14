import { useState } from 'react'
import { Ban, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// Estados desde los que se puede anular: antes de facturar no hay inventario
// descontado ni deuda en CxC, así que anular solo cambia el estado del pedido.
const ESTADOS_ANULABLES = ['aprobado', 'alistado']

const NOMBRE_ESTADO = {
    pendiente: 'pendiente', aprobado: 'por alistar', alistado: 'por registrar',
    rechazado: 'rechazado', facturado: 'facturado', despachado: 'despachado', anulado: 'anulado',
}

// Ventana única de "Anular pedido" (Despacho y Pedidos: Por Alistar / Por Registrar).
// El UPDATE solo aplica si el pedido sigue en un estado anulable: si otra persona
// lo facturó mientras tanto, no se anula (quedaría anulado con su nota vigente).
export default function ModalAnularPedido({ pedido, onCerrar, onAnulado }) {
    const [motivo, setMotivo] = useState('')
    const [confirmaAlmacen, setConfirmaAlmacen] = useState(false)
    const [anulando, setAnulando] = useState(false)
    const [error, setError] = useState('')
    const esAlistado = pedido.estado === 'alistado'

    async function anular() {
        if (!motivo.trim()) { setError('El motivo de anulación es obligatorio'); return }
        if (esAlistado && !confirmaAlmacen) { setError('Confirma que la mercancía no salió del almacén'); return }
        setAnulando(true); setError('')
        const { data, error: err } = await supabase.from('pedidos')
            .update({ estado: 'anulado', motivo_anulacion: motivo.trim() })
            .eq('id', pedido.id)
            .in('estado', ESTADOS_ANULABLES)
            .select('id')
        if (err) { setAnulando(false); setError('Error: ' + err.message); return }
        if (!data?.length) {
            const { data: actual } = await supabase.from('pedidos').select('estado').eq('id', pedido.id).maybeSingle()
            setAnulando(false)
            setError(`No se anuló: el pedido ya está ${NOMBRE_ESTADO[actual?.estado] || actual?.estado || 'en otro estado'}. Recarga la lista.`)
            return
        }
        setAnulando(false)
        onAnulado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '48px', height: '48px', backgroundColor: '#fef2f2', borderRadius: '12px', margin: '0 auto 16px' }}>
                    <Ban size={22} color="#dc2626" />
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px', textAlign: 'center' }}>Anular pedido</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 2px', textAlign: 'center' }}>
                    Pedido <strong style={{ fontFamily: 'monospace', color: '#374151' }}>{pedido.numero_pedido}</strong>
                </p>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px', textAlign: 'center' }}>{pedido.clientes?.nombre}</p>

                {esAlistado && (
                    <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#92400e' }}>
                            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
                            <span>
                                Este pedido ya está alistado. Si la mercancía <strong>salió del almacén</strong>, no lo anules:
                                factúralo. Anularlo deja esas unidades en el inventario del sistema aunque ya no estén.
                            </span>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '13px', fontWeight: 600, color: '#92400e', cursor: 'pointer' }}>
                            <input type="checkbox" checked={confirmaAlmacen} onChange={e => setConfirmaAlmacen(e.target.checked)} />
                            Confirmo que la mercancía no salió del almacén
                        </label>
                    </div>
                )}

                <label style={{ fontSize: '12px', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '6px' }}>
                    Motivo de anulación <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    placeholder="Describe el motivo por el cual se anula este pedido..."
                    rows={3}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    autoFocus
                />
                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#dc2626', marginTop: '10px' }}>
                        {error}
                    </div>
                )}
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button onClick={onCerrar}
                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button onClick={anular} disabled={anulando || (esAlistado && !confirmaAlmacen)}
                        style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: (anulando || (esAlistado && !confirmaAlmacen)) ? 'not-allowed' : 'pointer', opacity: (anulando || (esAlistado && !confirmaAlmacen)) ? 0.6 : 1 }}>
                        <Ban size={15} /> {anulando ? 'Anulando...' : 'Confirmar anulación'}
                    </button>
                </div>
            </div>
        </>
    )
}
