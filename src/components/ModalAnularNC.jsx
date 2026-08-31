// Anulación de una nota de crédito, con reverso completo.
//
// Antes existía "anular sin reembolso" en el modal de liquidar, pero solo
// cambiaba la etiqueta: no deshacía la aplicación a facturas ni sacaba del
// almacén la mercancía que la NC había reingresado. Una NC ya aplicada ni
// siquiera se podía tocar desde la interfaz.
//
// Esta pantalla muestra el impacto ANTES de confirmar — ahí está la mitad de su
// valor: que quien anula vea que hay facturas dadas por cobradas que van a
// reabrirse. El reverso corre en el RPC `anular_nota_credito`, transaccional:
// hacerlo desde el frontend dejaría plata inconsistente si falla a mitad.
//
// El mismo componente sirve para rechazar una NC en revisión (esRechazo): un
// rechazo es mecánicamente una anulación.

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { X } from 'lucide-react'
import { fmt, inputStyle, labelStyle, seccionStyle } from './NotasCredito'

export default function ModalAnularNC({ nc, onCerrar, onAnulada, esRechazo = false }) {
    const { perfil } = useAuth()
    const [aplicaciones, setAplicaciones] = useState([])
    const [items, setItems] = useState([])
    const [almacenes, setAlmacenes] = useState([])
    const [almacenId, setAlmacenId] = useState('')
    const [motivo, setMotivo] = useState('')
    const [cargando, setCargando] = useState(true)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    // La NC no guardaba el almacén antes de la Fase 4: si repuso mercancía y no
    // lo tiene, hay que preguntarlo para saber de dónde sacarla.
    const faltaAlmacen = nc.afecta_inventario && !nc.almacen_id

    useEffect(() => {
        async function cargar() {
            const [{ data: cobros }, { data: lineas }] = await Promise.all([
                supabase.from('cobros')
                    .select('monto_usd, venta_id, ventas(numero_factura, total, estado_cobro)')
                    .eq('devolucion_id', nc.id),
                nc.afecta_inventario
                    ? supabase.from('devolucion_items')
                        .select('cantidad_devuelta, tipo_linea, productos_terminados(nombre, sku, stock_actual, tipo_producto)')
                        .eq('devolucion_id', nc.id)
                    : Promise.resolve({ data: [] }),
            ])
            setAplicaciones(cobros || [])
            // Los servicios no movieron stock, así que tampoco se revierten.
            setItems((lineas || []).filter(l =>
                l.tipo_linea === 'producto' && l.productos_terminados?.tipo_producto !== 'servicio'))
            setCargando(false)
        }
        cargar()

        if (faltaAlmacen && perfil?.empresa_id) {
            supabase.from('almacenes').select('id, nombre, es_default')
                .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
                .then(({ data }) => {
                    setAlmacenes(data || [])
                    const def = (data || []).find(a => a.es_default) || (data || [])[0]
                    if (def) setAlmacenId(def.id)
                })
        }
    }, [nc.id])

    // El RPC se niega a dejar stock negativo; se avisa antes para no hacer
    // perder el viaje.
    const sinStock = items.filter(i =>
        Number(i.productos_terminados?.stock_actual || 0) < Number(i.cantidad_devuelta || 0))

    async function confirmar() {
        if (!motivo.trim()) { setError('El motivo es obligatorio'); return }
        if (faltaAlmacen && !almacenId) { setError('Indica de qué almacén revertir la mercancía'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.rpc('anular_nota_credito', {
            p_nc_id: nc.id,
            p_motivo: esRechazo ? `Rechazada: ${motivo.trim()}` : motivo.trim(),
            p_almacen_id: faltaAlmacen ? almacenId : null,
        })
        setGuardando(false)
        if (err) { setError(err.message); return }
        onAnulada()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 60 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', width: '560px', maxWidth: '95vw', maxHeight: '90vh', zIndex: 70, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '24px 28px 12px' }}>
                    <div>
                        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                            {esRechazo ? 'Rechazar nota de crédito' : 'Anular nota de crédito'}
                        </h2>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                            <strong style={{ fontFamily: 'monospace' }}>{nc.numero_nc || '—'}</strong>
                            {' · '}{nc.clientes?.nombre || '—'}{' · '}{fmt(nc.monto_devuelto)}
                        </p>
                    </div>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                <div style={{ padding: '0 28px', overflowY: 'auto', flex: 1 }}>
                    {cargando ? (
                        <p style={{ fontSize: '13px', color: '#9ca3af', padding: '16px 0' }}>Calculando impacto…</p>
                    ) : (<>
                        {aplicaciones.length === 0 && items.length === 0 && (
                            <div style={{ backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#6b7280', marginBottom: '16px' }}>
                                Esta nota no se aplicó a ninguna factura ni movió inventario. Anularla solo la marca como anulada.
                            </div>
                        )}

                        {aplicaciones.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <p style={seccionStyle}>Facturas que se reabrirán</p>
                                {aplicaciones.map((a, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                                        <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>
                                            {a.ventas?.numero_factura || '—'}
                                        </span>
                                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>total {fmt(a.ventas?.total || 0)}</span>
                                        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
                                            −{fmt(a.monto_usd)}
                                        </span>
                                        {a.ventas?.estado_cobro === 'pagado' && (
                                            <span style={{ fontSize: '11px', color: '#b45309', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '20px', padding: '2px 8px', whiteSpace: 'nowrap' }}>
                                                dejará de estar pagada
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {items.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <p style={seccionStyle}>Mercancía que saldrá del inventario</p>
                                {items.map((it, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '13px', color: '#1f2937' }}>{it.productos_terminados?.nombre}</div>
                                            <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>
                                                {it.productos_terminados?.sku} · existencia {Number(it.productos_terminados?.stock_actual || 0)}
                                            </div>
                                        </div>
                                        <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: '#dc2626' }}>
                                            −{Number(it.cantidad_devuelta)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {sinStock.length > 0 && (
                            <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#991b1b', marginBottom: '16px' }}>
                                No hay existencia suficiente de {sinStock.map(i => i.productos_terminados?.nombre).join(', ')}.
                                La mercancía probablemente ya se volvió a vender: ajusta el inventario antes de anular.
                            </div>
                        )}

                        {faltaAlmacen && (
                            <div style={{ marginBottom: '16px' }}>
                                <label style={labelStyle}>Almacén del que sale la mercancía *</label>
                                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 6px' }}>
                                    Esta nota es anterior al registro del almacén, hay que indicarlo.
                                </p>
                                <select value={almacenId} onChange={e => setAlmacenId(e.target.value)} style={inputStyle}>
                                    {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                </select>
                            </div>
                        )}

                        <div style={{ marginBottom: '16px' }}>
                            <label style={labelStyle}>Motivo {esRechazo ? 'del rechazo' : 'de la anulación'} *</label>
                            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} autoFocus
                                placeholder={esRechazo ? 'Por qué se rechaza esta nota…' : 'Por qué se anula esta nota…'}
                                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                        </div>
                    </>)}
                </div>

                <div style={{ borderTop: '1px solid #e5e7eb', padding: '16px 28px 24px' }}>
                    {error && (
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>
                    )}
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={onCerrar} style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>Cancelar</button>
                        <button onClick={confirmar} disabled={guardando || cargando}
                            style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: '#dc2626', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: guardando ? 'default' : 'pointer', opacity: guardando || cargando ? 0.6 : 1 }}>
                            {guardando ? 'Procesando…' : esRechazo ? 'Confirmar rechazo' : 'Confirmar anulación'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
