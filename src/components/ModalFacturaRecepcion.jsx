// Registrar la factura de una recepción que llegó sin ella, o corregir los
// precios de cualquier recepción sin abonos (docs/plan-factura-recepcion.md).
//
// Las cantidades no se tocan: las fija la recepción (inventario). La escritura
// es la RPC registrar_factura_recepcion, que recalcula el encabezado con la
// misma fórmula que src/lib/iva.js; aquí solo se muestra la vista previa.
import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { precioBaseItem, itemAplicaIva, totalesDeItems } from '../lib/iva'
import { hoyYMD, ymdCaracas } from './SelectorFechaTasa'

export const TOLERANCIA_FACTURA = 0.05

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`
const fmtPrecio = (n) => `$${Number(n || 0).toFixed(6).replace(/0{1,4}$/, '')}`

// compra_items.tipo_insumo (singular) → tabla y campo de costo del catálogo
const COSTO_CATALOGO = {
    materia_prima: { tabla: 'materias_primas', campo: 'costo_compra_promedio' },
    empaque: { tabla: 'materiales_empaque', campo: 'costo_compra_promedio' },
    material_empaque: { tabla: 'materiales_empaque', campo: 'costo_compra_promedio' },
    consumible: { tabla: 'consumibles', campo: 'costo_compra_promedio' },
    producto_terminado: { tabla: 'productos_terminados', campo: 'costo_promedio' },
}

// Precio que cargó logística (sin IVA): la referencia de la tolerancia
export const precioRecibido = (item) =>
    item.precio_recepcion != null ? Number(item.precio_recepcion) : precioBaseItem(item)

export default function ModalFacturaRecepcion({ compra, items, nombres = {}, onCerrar, onListo }) {
    const { perfil } = useAuth()
    const registrar = compra.estado_factura === 'pendiente'
    const [nro, setNro] = useState(compra.nro_doc_proveedor || '')
    const [fecha, setFecha] = useState(compra.fecha_factura || (compra.fecha_compra ? ymdCaracas(compra.fecha_compra) : hoyYMD()))
    // Precio editable por línea, en base (sin IVA)
    const [precios, setPrecios] = useState(() =>
        Object.fromEntries(items.map(i => [i.id, String(Number(precioBaseItem(i).toFixed(6)))])))
    const [motivo, setMotivo] = useState(compra.motivo_diferencia_factura || '')
    const [actualizarCostos, setActualizarCostos] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    const filas = items.map(i => {
        const ref = precioRecibido(i)
        const nuevo = Number(precios[i.id])
        const valido = precios[i.id] !== '' && Number.isFinite(nuevo) && nuevo >= 0
        const dif = ref > 0 && valido ? (nuevo - ref) / ref : 0
        const fuera = valido && ((ref > 0 && Math.abs(dif) > TOLERANCIA_FACTURA) || (ref === 0 && nuevo > 0))
        return { i, ref, nuevo, valido, dif, fuera }
    })
    const hayFuera = filas.some(f => f.fuera)
    const nuevos = totalesDeItems(
        filas.map(f => ({ ...f.i, precio_unitario: f.valido ? f.nuevo : 0, precio_incluye_iva: false, aplica_iva: itemAplicaIva(f.i) })),
        { descGlobal: compra.descuento_global || 0 })
    const totalAntes = Number(compra.total || 0)

    async function guardar() {
        setError('')
        if (!nro.trim()) { setError('Indica el N° de la factura'); return }
        if (!fecha) { setError('Indica la fecha de la factura'); return }
        if (filas.some(f => !f.valido)) { setError('Revisa los precios: hay líneas vacías o inválidas'); return }
        if (hayFuera && !motivo.trim()) { setError('Hay líneas que difieren más del 5 %: indica el motivo'); return }
        setGuardando(true)
        const { error: err } = await supabase.rpc('registrar_factura_recepcion', {
            p_compra_id: compra.id, p_nro: nro.trim(), p_fecha: fecha,
            p_items: filas.map(f => ({ id: f.i.id, precio_unitario: f.nuevo })),
            p_motivo: motivo.trim() || null,
        })
        if (err) { setGuardando(false); setError(err.message); return }
        if (actualizarCostos) {
            for (const f of filas) {
                const map = COSTO_CATALOGO[f.i.tipo_insumo]
                if (map) await supabase.from(map.tabla).update({ [map.campo]: f.nuevo })
                    .eq('id', f.i.insumo_id).eq('empresa_id', perfil.empresa_id)
            }
        }
        setGuardando(false)
        onListo()
    }

    const th = { padding: '8px 6px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: 'right' }
    const td = { padding: '8px 6px', fontSize: '13px', color: '#374151', textAlign: 'right' }
    const inp = { width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: 'min(720px, calc(100vw - 32px))', boxSizing: 'border-box', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                        {registrar ? 'Registrar factura' : 'Corregir factura'} · {compra.numero_doc}
                    </h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>
                    Precios <strong>sin IVA</strong> según la factura del proveedor. Las cantidades las fijó la recepción y no se modifican aquí.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '12px', marginBottom: '16px' }}>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>N° de factura</label>
                        <input value={nro} onChange={e => setNro(e.target.value)} style={inp} placeholder="N° de la factura del proveedor" />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Fecha de la factura</label>
                        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} />
                    </div>
                </div>

                <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                <th style={{ ...th, textAlign: 'left' }}>Insumo</th>
                                <th style={th}>Cant.</th>
                                <th style={th}>Precio recibido</th>
                                <th style={{ ...th, width: '130px' }}>Precio factura</th>
                                <th style={th}>Dif.</th>
                                <th style={th}>Base línea</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map(f => (
                                <tr key={f.i.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: f.fuera ? '#fef2f2' : undefined }}>
                                    <td style={{ ...td, textAlign: 'left' }}>{nombres[f.i.insumo_id] || '—'}</td>
                                    <td style={td}>{Number(f.i.cantidad).toLocaleString('es-VE')}</td>
                                    <td style={{ ...td, color: '#6b7280' }}>{fmtPrecio(f.ref)}</td>
                                    <td style={td}>
                                        <input type="number" min="0" step="0.000001" value={precios[f.i.id]}
                                            onChange={e => setPrecios(p => ({ ...p, [f.i.id]: e.target.value }))}
                                            style={{ ...inp, padding: '6px 8px', textAlign: 'right', borderColor: f.fuera ? '#fca5a5' : '#d1d5db' }} />
                                    </td>
                                    <td style={{ ...td, fontWeight: 600, color: f.fuera ? '#dc2626' : Math.abs(f.dif) > 0.00001 ? '#92400e' : '#9ca3af' }}>
                                        {f.valido ? `${f.dif > 0 ? '+' : ''}${(f.dif * 100).toFixed(1)} %` : '—'}
                                    </td>
                                    <td style={td}>{fmt(f.valido ? Number(f.i.cantidad) * f.nuevo * (1 - Number(f.i.descuento_item || 0) / 100) : 0)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px' }}>
                    {[['Base imponible', compra.base_gravada, nuevos.base_gravada], ['Exento', compra.base_exenta, nuevos.base_exenta], ['IVA (16%)', compra.iva, nuevos.iva]]
                        .filter(([l, a, n]) => l !== 'Exento' || Number(a) > 0 || n > 0)
                        .map(([l, a, n]) => (
                            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', color: '#6b7280', marginBottom: '4px' }}>
                                <span>{l}</span><span>{fmt(a)} → <strong style={{ color: '#374151' }}>{fmt(n)}</strong></span>
                            </div>
                        ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700, color: '#1f2937', marginTop: '6px' }}>
                        <span>Total</span>
                        <span>{fmt(totalAntes)} → <span style={{ color: Math.abs(nuevos.total - totalAntes) > 0.005 ? '#92400e' : '#16a34a' }}>{fmt(nuevos.total)}</span></span>
                    </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: hayFuera ? '#dc2626' : '#374151', display: 'block', marginBottom: '4px' }}>
                        Motivo de la diferencia {hayFuera ? '(obligatorio: hay líneas fuera del 5 %)' : '(opcional)'}
                    </label>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
                        style={{ ...inp, fontFamily: 'inherit', borderColor: hayFuera && !motivo.trim() ? '#fca5a5' : '#d1d5db' }} />
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#374151', marginBottom: '16px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={actualizarCostos} onChange={e => setActualizarCostos(e.target.checked)} />
                    Actualizar costos en catálogo con estos precios
                </label>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onCerrar} disabled={guardando} style={{ flex: 1, padding: '11px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                    <button onClick={guardar} disabled={guardando}
                        style={{ flex: 2, padding: '11px', border: 'none', borderRadius: '8px', backgroundColor: '#16a34a', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '14px', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Guardando...' : registrar ? 'Registrar factura' : 'Guardar corrección'}
                    </button>
                </div>
            </div>
        </>
    )
}
