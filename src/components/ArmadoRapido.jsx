// Armado rápido (docs/plan-kits.md): producir en un solo paso, sin la orden de
// 3 estados (confirmada → en proceso → cerrada). Pensado para kits —PT armados
// con otros PT— pero sirve para cualquier receta de producto terminado.
//
// Escribe por la RPC armar_produccion: orden ya cerrada, lote, consumos y
// movimientos en una transacción. Un componente PT sin stock lo bloquea todo.
import { useEffect, useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'

const fmt = (n, dec = 3) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: dec })
const normTipo = t => (t === 'empaque' ? 'material_empaque' : t)
const TABLA = { materia_prima: 'materias_primas', material_empaque: 'materiales_empaque', producto_terminado: 'productos_terminados' }
const CORTO = { materia_prima: 'MP', material_empaque: 'Empaque', producto_terminado: 'PT' }

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box',
}

export default function ArmadoRapido({ onCerrar, onArmado }) {
    const { perfil } = useAuth()
    const [recetas, setRecetas] = useState([])
    const [almacenes, setAlmacenes] = useState([])
    const [nombres, setNombres] = useState({})
    const [stock, setStock] = useState({})          // `${tipo}|${id}|${almacen}` → cantidad
    const [productoId, setProductoId] = useState('')
    const [cantidad, setCantidad] = useState('')
    const [consumos, setConsumos] = useState([])
    const [destino, setDestino] = useState('')
    const [lote, setLote] = useState('')
    const [vence, setVence] = useState('')
    const [observ, setObserv] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        Promise.all([
            supabase.from('recetas')
                .select('id, producto_id, rinde_unidades, productos_terminados(id, nombre, sku, unidad_medida, vida_util_dias), receta_items(tipo_insumo, insumo_id, cantidad)')
                .eq('empresa_id', perfil.empresa_id).eq('activo', true).not('producto_id', 'is', null),
            supabase.from('almacenes').select('id, nombre, es_default').eq('empresa_id', perfil.empresa_id).eq('activo', true)
                .order('es_default', { ascending: false }).order('nombre'),
        ]).then(([{ data: rs }, { data: alms }]) => {
            setRecetas((rs || []).filter(r => r.productos_terminados && r.receta_items?.length)
                .sort((a, b) => a.productos_terminados.nombre.localeCompare(b.productos_terminados.nombre)))
            setAlmacenes(alms || [])
            if (alms?.length) setDestino(alms[0].id)
        })
    }, [])

    const receta = recetas.find(r => r.producto_id === productoId)
    const producto = receta?.productos_terminados
    const almDef = almacenes[0]?.id || ''

    // Al elegir el producto: nombres de los insumos y su stock por almacén
    useEffect(() => {
        if (!receta) { setConsumos([]); return }
        const porTipo = {}
        receta.receta_items.forEach(i => { (porTipo[normTipo(i.tipo_insumo)] = porTipo[normTipo(i.tipo_insumo)] || []).push(i.insumo_id) })
        Promise.all(Object.entries(porTipo).map(([t, ids]) => Promise.all([
            supabase.from(TABLA[t] || 'materiales_empaque').select('id, nombre, unidad_medida').in('id', ids),
            supabase.from('stock_ubicacion').select('item_id, almacen_id, cantidad').eq('empresa_id', perfil.empresa_id)
                .eq('tipo_item', t).in('item_id', ids),
        ]).then(([n, s]) => ({ t, n: n.data || [], s: s.data || [] })))).then(res => {
            const nm = {}, st = {}
            res.forEach(({ t, n, s }) => {
                n.forEach(x => { nm[x.id] = x })
                s.forEach(x => { const k = `${t}|${x.item_id}|${x.almacen_id}`; st[k] = (st[k] || 0) + Number(x.cantidad || 0) })
            })
            setNombres(nm); setStock(st)
        })
        if (producto?.vida_util_dias && !vence) {
            const d = new Date(); d.setDate(d.getDate() + Number(producto.vida_util_dias))
            setVence(d.toISOString().split('T')[0])
        }
    }, [productoId, recetas.length])

    // Cantidades sugeridas = receta × (cantidad ÷ rinde). Se recalculan al cambiar la cantidad.
    useEffect(() => {
        if (!receta) return
        const f = Number(cantidad) > 0 ? Number(cantidad) / (Number(receta.rinde_unidades) || 1) : 0
        setConsumos(prev => receta.receta_items.map((i, idx) => {
            const tipo = normTipo(i.tipo_insumo)
            const ant = prev.find(p => p.tipo === tipo && p.id === i.insumo_id)
            return { key: idx, tipo, id: i.insumo_id, cantidad: f ? String(parseFloat((i.cantidad * f).toFixed(4))) : '', almacen: ant?.almacen || almDef }
        }))
    }, [productoId, cantidad, almDef])

    const disponible = c => stock[`${c.tipo}|${c.id}|${c.almacen}`] || 0
    const faltaPt = consumos.filter(c => c.tipo === 'producto_terminado' && Number(c.cantidad) > disponible(c) + 0.0005)
    const faltaOtros = consumos.filter(c => c.tipo !== 'producto_terminado' && Number(c.cantidad) > disponible(c) + 0.0005)

    async function armar() {
        setError('')
        if (!receta) { setError('Elige el producto a armar'); return }
        if (!(Number(cantidad) > 0)) { setError('Indica cuántas unidades armaste'); return }
        if (!destino) { setError('Elige el almacén al que entra el producto'); return }
        if (faltaPt.length) { setError('No hay stock suficiente de los productos terminados marcados en rojo'); return }
        setGuardando(true)
        const { data, error: err } = await supabase.rpc('armar_produccion', {
            p_producto_id: productoId, p_cantidad: Number(cantidad), p_almacen_destino: destino,
            p_items: consumos.map(c => ({ tipo_insumo: c.tipo, insumo_id: c.id, cantidad: Number(c.cantidad) || 0, almacen_id: c.almacen || null })),
            p_numero_lote: lote.trim() || null, p_fecha_vencimiento: vence || null, p_observaciones: observ.trim() || null,
        })
        setGuardando(false)
        if (err) { setError(err.message); return }
        onArmado(data)
    }

    const th = { padding: '8px 6px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }
    const td = { padding: '6px', fontSize: '13px', color: '#374151' }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: 'min(720px, calc(100vw - 32px))', boxSizing: 'border-box', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '92vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Armado rápido</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>
                    Registra lo que ya se armó: descuenta los componentes y suma el producto en un solo paso (queda como orden cerrada).
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '12px', marginBottom: '14px' }}>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Producto *</label>
                        <select value={productoId} onChange={e => setProductoId(e.target.value)} style={inputStyle}>
                            <option value="">— Producto con receta —</option>
                            {recetas.map(r => <option key={r.id} value={r.producto_id}>{r.productos_terminados.nombre}{r.productos_terminados.sku ? ` (${r.productos_terminados.sku})` : ''}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Cantidad armada *{producto ? ` (${producto.unidad_medida})` : ''}</label>
                        <input type="number" min="0" step="1" value={cantidad} onChange={e => setCantidad(e.target.value)} style={inputStyle} />
                    </div>
                </div>

                {consumos.length > 0 && (
                    <div style={{ overflowX: 'auto', marginBottom: '14px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                            <thead><tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                <th style={th}>Tipo</th><th style={th}>Componente</th><th style={th}>Sale de</th>
                                <th style={{ ...th, textAlign: 'right' }}>Disponible</th><th style={{ ...th, textAlign: 'right', width: '120px' }}>Consumo</th>
                            </tr></thead>
                            <tbody>
                                {consumos.map(c => {
                                    const falta = Number(c.cantidad) > disponible(c) + 0.0005
                                    const bloquea = falta && c.tipo === 'producto_terminado'
                                    return (
                                        <tr key={c.key} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: bloquea ? '#fef2f2' : falta ? '#fffbeb' : undefined }}>
                                            <td style={td}><span style={{ fontSize: '11px', fontWeight: 600, color: c.tipo === 'producto_terminado' ? '#166534' : '#6b7280' }}>{CORTO[c.tipo]}</span></td>
                                            <td style={td}>{nombres[c.id]?.nombre || '…'} <span style={{ color: '#9ca3af', fontSize: '11px' }}>{nombres[c.id]?.unidad_medida}</span></td>
                                            <td style={td}>
                                                <select value={c.almacen} onChange={e => setConsumos(p => p.map(x => x.key === c.key ? { ...x, almacen: e.target.value } : x))}
                                                    style={{ ...inputStyle, fontSize: '12px', padding: '5px 8px' }}>
                                                    {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                                </select>
                                            </td>
                                            <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: bloquea ? '#dc2626' : falta ? '#d97706' : '#16a34a' }}>{fmt(disponible(c))}</td>
                                            <td style={td}>
                                                <input type="number" min="0" step="0.001" value={c.cantidad}
                                                    onChange={e => setConsumos(p => p.map(x => x.key === c.key ? { ...x, cantidad: e.target.value } : x))}
                                                    style={{ ...inputStyle, fontSize: '13px', padding: '5px 8px', textAlign: 'right' }} />
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {faltaPt.length > 0 && (
                    <div style={{ display: 'flex', gap: '8px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#991b1b', marginBottom: '12px' }}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        <span>No alcanzan los productos terminados en rojo: elige otro almacén o ajusta la cantidad. No se puede armar con productos que no existen.</span>
                    </div>
                )}
                {faltaPt.length === 0 && faltaOtros.length > 0 && (
                    <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#92400e', marginBottom: '12px' }}>
                        Hay materia prima o empaque sin stock suficiente: se registrará el faltante, igual que al cerrar una orden.
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Entra al almacén *</label>
                        <select value={destino} onChange={e => setDestino(e.target.value)} style={inputStyle}>
                            {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>N° de lote</label>
                        <input value={lote} onChange={e => setLote(e.target.value)} style={inputStyle} placeholder="Opcional" />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '4px' }}>Vencimiento</label>
                        <input type="date" value={vence} onChange={e => setVence(e.target.value)} style={inputStyle} />
                    </div>
                </div>
                <textarea value={observ} onChange={e => setObserv(e.target.value)} rows={2} placeholder="Observaciones (opcional)"
                    style={{ ...inputStyle, fontFamily: 'inherit', marginBottom: '14px' }} />

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onCerrar} disabled={guardando} style={{ flex: 1, padding: '11px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                    <button onClick={armar} disabled={guardando || faltaPt.length > 0}
                        style={{ flex: 2, padding: '11px', border: 'none', borderRadius: '8px', backgroundColor: faltaPt.length ? '#d1d5db' : '#16a34a', color: '#fff', fontWeight: 600, cursor: faltaPt.length ? 'default' : 'pointer', fontSize: '14px', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Registrando...' : `Registrar armado${Number(cantidad) > 0 && producto ? ` de ${fmt(cantidad)} ${producto.unidad_medida || ''}` : ''}`}
                    </button>
                </div>
            </div>
        </>
    )
}
