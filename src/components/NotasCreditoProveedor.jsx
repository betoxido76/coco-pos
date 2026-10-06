// Notas de crédito de proveedor — CxP → pestaña "Notas de crédito".
// docs/plan-nc-proveedores.md
//
// Una sola lista para los dos orígenes de `devoluciones_proveedor`:
//   - Devolución (ND-…): nace en Compras → Devoluciones, con mercancía.
//   - Manual (NCP-…):    la NC que emite el proveedor (descuento, ajuste…),
//                         registrada aquí, sin inventario.
// Ambas son crédito a favor que se aplica al pagarle (recepciones y gastos).
// Su saldo se deriva de las aplicaciones (filas de pagos_proveedor / pagos con
// devolucion_proveedor_id); escritura por RPC.
import { useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import FiltroCombo from './FiltroCombo'
import SelectorFechaTasa, { useTasasFecha, hoyYMD, fmtFechaCorta, ymdCaracas } from './SelectorFechaTasa'
import { useAltoBarra, useOrden, ordenarFilas, ThOrden, TopTitulos, estiloTarjetaTabla } from './TablaOrdenable'
import { totalesDocumento, precioBaseItem } from '../lib/iva'

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pagoEnUsd = (p) => Number(p.monto_usd || 0) + Number(p.monto_bs || 0) / (Number(p.tasa_cambio) || 1)

export const ESTADOS_NC_PROV = {
    pendiente:   { bg: '#fffbeb', color: '#854d0e', label: 'Disponible' },
    parcial:     { bg: '#dbeafe', color: '#1e40af', label: 'Aplicada en parte' },
    aplicada:    { bg: '#dcfce7', color: '#166534', label: 'Aplicada' },
    reembolsada: { bg: '#e0e7ff', color: '#3730a3', label: 'Reembolsada' },
    anulada:     { bg: '#f3f4f6', color: '#6b7280', label: 'Anulada' },
}
export function BadgeNCProv({ estado }) {
    const c = ESTADOS_NC_PROV[estado] || ESTADOS_NC_PROV.pendiente
    return <span style={{ backgroundColor: c.bg, color: c.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{c.label}</span>
}

// Notas de crédito con saldo de un proveedor (o de toda la empresa), con su
// saldo derivado de las aplicaciones vigentes. Lo usan la pestaña, el
// indicador de CxP y el bloque de la ventana de pago.
export async function cargarCreditosProveedor(empresaId, { proveedorId = null, soloDisponibles = false } = {}) {
    let q = supabase.from('devoluciones_proveedor')
        .select('id, numero_nd, nro_doc_proveedor, origen, monto_total, estado_nd, motivo, fecha_emision, created_at, proveedor_id, compra_id, nota_liquidacion, fecha_liquidacion, motivo_anulacion, proveedores(nombre), compras(numero_doc)')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
    if (proveedorId) q = q.eq('proveedor_id', proveedorId)
    if (soloDisponibles) q = q.in('estado_nd', ['pendiente', 'parcial'])
    const { data } = await q
    const notas = data || []
    const ids = notas.map(n => n.id)
    const aplicado = {}
    if (ids.length > 0) {
        const bloques = []
        for (let i = 0; i < ids.length; i += 100) bloques.push(ids.slice(i, i + 100))
        const resp = await Promise.all(bloques.flatMap(b => [
            supabase.from('pagos_proveedor').select('devolucion_proveedor_id, monto_usd, monto_bs, tasa_cambio').in('devolucion_proveedor_id', b).eq('anulado', false),
            supabase.from('pagos').select('devolucion_proveedor_id, monto_usd, monto_bs, tasa_cambio').in('devolucion_proveedor_id', b),
        ]))
        resp.flatMap(r => r.data || []).forEach(p => {
            aplicado[p.devolucion_proveedor_id] = (aplicado[p.devolucion_proveedor_id] || 0) + pagoEnUsd(p)
        })
    }
    return notas.map(n => {
        const vivo = ['pendiente', 'parcial'].includes(n.estado_nd)
        const ap = aplicado[n.id] || 0
        return { ...n, aplicado: ap, saldo: vivo ? Math.max(0, Number(n.monto_total || 0) - ap) : 0 }
    }).filter(n => !soloDisponibles || n.saldo > 0.01)
}

// ── Pestaña ─────────────────────────────────────────────────────────────────
export default function PanelNotasCreditoProveedor() {
    const { perfil } = useAuth()
    const puedeAnular = ['admin', 'finanzas', 'superadmin'].includes(perfil?.rol)
    const topBarra = useContext(TopTitulos)
    const [notas, setNotas] = useState([])
    const [cargando, setCargando] = useState(true)
    const [fEstado, setFEstado] = useState('disponible')
    const [fProveedor, setFProveedor] = useState('')
    const [fOrigen, setFOrigen] = useState('')
    const [ver, setVer] = useState(null)
    const [nueva, setNueva] = useState(false)
    const [filtrosRef, altoFiltros] = useAltoBarra([ver])
    const [orden, ordenarPor] = useOrden({ col: 'fecha', dir: 'desc' }, ['numero', 'fecha', 'monto', 'aplicado', 'saldo'])

    async function cargar() {
        setCargando(true)
        setNotas(await cargarCreditosProveedor(perfil.empresa_id))
        setCargando(false)
    }
    useEffect(() => { if (perfil?.empresa_id) cargar() }, [perfil?.empresa_id])

    if (ver) return <DetalleNCProveedor nota={ver} onVolver={() => { setVer(null); cargar() }} />

    const opcProv = [...new Map(notas.filter(n => n.proveedores).map(n => [n.proveedor_id, { value: n.proveedor_id, label: n.proveedores.nombre }])).values()]
        .sort((a, b) => a.label.localeCompare(b.label))
    const filtradas = ordenarFilas(notas.filter(n =>
        (!fProveedor || n.proveedor_id === fProveedor) && (!fOrigen || n.origen === fOrigen) &&
        (!fEstado || (fEstado === 'disponible' ? ['pendiente', 'parcial'].includes(n.estado_nd)
            : fEstado === 'liquidada' ? ['reembolsada', 'anulada'].includes(n.estado_nd) : n.estado_nd === fEstado))), {
        numero: n => n.numero_nd,
        origen: n => n.origen,
        doc_prov: n => n.nro_doc_proveedor,
        proveedor: n => n.proveedores?.nombre,
        recepcion: n => n.compras?.numero_doc,
        fecha: n => n.fecha_emision || n.created_at,
        monto: n => Number(n.monto_total || 0),
        aplicado: n => n.aplicado,
        saldo: n => n.saldo,
        estado: n => n.estado_nd,
    }, orden)
    const saldoFavor = notas.reduce((s, n) => s + n.saldo, 0)

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '14px 16px' }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>Crédito a favor con proveedores</p>
                    <p style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{fmt(saldoFavor)}</p>
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{notas.filter(n => n.saldo > 0.01).length} nota(s) con saldo, se aplican al pagar</p>
                </div>
            </div>

            <div ref={filtrosRef} style={{ position: 'sticky', top: topBarra, zIndex: 15, backgroundColor: '#f9fafb', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: '12px' }}>
                <FiltroCombo label="Estado" value={fEstado} onChange={setFEstado} width="170px" options={[
                    { value: 'disponible', label: 'Disponibles' }, { value: 'aplicada', label: 'Aplicadas' },
                    { value: 'liquidada', label: 'Reembolsadas / anuladas' }]} />
                <FiltroCombo label="Proveedor" value={fProveedor} onChange={setFProveedor} options={opcProv} width="240px" />
                <FiltroCombo label="Origen" value={fOrigen} onChange={setFOrigen} width="160px"
                    options={[{ value: 'manual', label: 'Manual (NCP)' }, { value: 'devolucion', label: 'Devolución (ND)' }]} />
                <button onClick={() => setNueva(true)}
                    style={{ marginLeft: 'auto', padding: '9px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', backgroundColor: '#16a34a', color: '#fff', cursor: 'pointer' }}>
                    + Nueva NC de proveedor
                </button>
            </div>

            <div style={estiloTarjetaTabla}>
                {cargando ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    : filtradas.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay notas de crédito para los filtros seleccionados.</div>
                    : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {[['N°', 'numero'], ['Origen', 'origen'], ['Doc. proveedor', 'doc_prov'], ['Proveedor', 'proveedor'], ['Recepción', 'recepcion'], ['Fecha', 'fecha'],
                                      ['Monto', 'monto', true], ['Aplicado', 'aplicado', true], ['Saldo', 'saldo', true], ['Estado', 'estado'], ['', null]].map(([h, col, der], i) => (
                                        <ThOrden key={i} col={col} orden={orden} onOrdenar={ordenarPor} top={topBarra + altoFiltros} align={der ? 'right' : 'left'}>{h}</ThOrden>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(n => {
                                    const td = { padding: '11px 14px', fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' }
                                    return (
                                        <tr key={n.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{n.numero_nd || '—'}</td>
                                            <td style={{ ...td, fontSize: '12px', color: '#6b7280' }}>{n.origen === 'manual' ? 'Manual' : 'Devolución'}</td>
                                            <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px', color: n.nro_doc_proveedor ? '#374151' : '#d1d5db' }}>{n.nro_doc_proveedor || '—'}</td>
                                            <td style={{ ...td, whiteSpace: 'normal' }}>{n.proveedores?.nombre || '—'}</td>
                                            <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px', color: n.compras?.numero_doc ? '#374151' : '#d1d5db' }}>{n.compras?.numero_doc || '—'}</td>
                                            <td style={td}>{fmtFechaCorta(n.fecha_emision || ymdCaracas(n.created_at))}</td>
                                            <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(n.monto_total)}</td>
                                            <td style={{ ...td, textAlign: 'right', color: n.aplicado > 0.01 ? '#374151' : '#d1d5db' }}>{n.aplicado > 0.01 ? fmt(n.aplicado) : '—'}</td>
                                            <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: n.saldo > 0.01 ? '#854d0e' : '#9ca3af' }}>{n.saldo > 0.01 ? fmt(n.saldo) : '—'}</td>
                                            <td style={td}><BadgeNCProv estado={n.estado_nd} /></td>
                                            <td style={td}>
                                                <button onClick={() => setVer(n)}
                                                    style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                    Ver
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
            </div>

            {nueva && <ModalNuevaNCProveedor onCerrar={() => setNueva(false)} onCreada={() => { setNueva(false); cargar() }} />}
        </div>
    )
}

// ── Nueva NC de proveedor ───────────────────────────────────────────────────
function ModalNuevaNCProveedor({ onCerrar, onCreada }) {
    const { perfil } = useAuth()
    const [proveedores, setProveedores] = useState([])
    const [proveedorId, setProveedorId] = useState('')
    const [recepciones, setRecepciones] = useState([])
    const [compraId, setCompraId] = useState('')
    const [nroDoc, setNroDoc] = useState('')
    const [fecha, setFecha] = useState(hoyYMD())
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [motivo, setMotivo] = useState('')
    const [lineas, setLineas] = useState([{ concepto: '', monto: '', aplica_iva: true }])
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        supabase.from('proveedores').select('id, nombre').eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setProveedores(data || []))
    }, [perfil.empresa_id])
    useEffect(() => {
        setCompraId('')
        if (!proveedorId) { setRecepciones([]); return }
        supabase.from('compras').select('id, numero_doc, nro_doc_proveedor, total, fecha_compra')
            .eq('empresa_id', perfil.empresa_id).eq('proveedor_id', proveedorId).neq('estado', 'anulada')
            .order('fecha_compra', { ascending: false }).limit(200)
            .then(({ data }) => setRecepciones(data || []))
    }, [proveedorId])

    const { tasasFecha, cargandoTasas } = useTasasFecha(perfil.empresa_id, fecha)
    const tasa = Number(tasasFecha?.[tipoTasa]) || 0
    // Montos en base (sin IVA); el IVA va una vez sobre la base gravada (iva.js)
    const totales = totalesDocumento(lineas.map(l => ({ base: Number(l.monto || 0), aplicaIva: l.aplica_iva })))

    const cambiarLinea = (i, k, v) => setLineas(ls => ls.map((l, j) => j === i ? { ...l, [k]: v } : l))

    async function guardar() {
        setError('')
        if (!proveedorId) { setError('Selecciona el proveedor'); return }
        if (!motivo.trim()) { setError('Indica el motivo'); return }
        const validas = lineas.filter(l => Number(l.monto) > 0)
        if (validas.length === 0) { setError('Agrega al menos una línea con monto'); return }
        if (validas.some(l => !l.concepto.trim())) { setError('Cada línea necesita un concepto'); return }
        if (!(tasa > 0)) { setError(`No hay tasa registrada para el ${fmtFechaCorta(fecha)}`); return }
        setGuardando(true)
        const { error: err } = await supabase.rpc('crear_nc_proveedor', {
            p_proveedor_id: proveedorId, p_compra_id: compraId || null, p_nro_doc_proveedor: nroDoc.trim() || null,
            p_fecha: fecha, p_tasa: tasa, p_tipo_tasa: tipoTasa, p_motivo: motivo.trim(),
            p_lineas: validas.map(l => ({ concepto: l.concepto.trim(), monto: Number(l.monto), aplica_iva: !!l.aplica_iva })),
        })
        setGuardando(false)
        if (err) { setError(err.message); return }
        onCreada()
    }

    const lbl = { fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }
    const inp = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Nueva nota de crédito de proveedor</h2>
                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 16px' }}>
                    Registra la NC que te emitió el proveedor. Queda como crédito a favor y se aplica al pagarle. No mueve inventario
                    (si hay mercancía de por medio, usa Compras → Devoluciones).
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ gridColumn: 'span 2' }}>
                        <FiltroCombo label="Proveedor *" value={proveedorId} onChange={setProveedorId} width="100%"
                            options={proveedores.map(p => ({ value: p.id, label: p.nombre }))} placeholder="Seleccionar…" />
                    </div>
                    <div>
                        <label style={lbl}>Recepción (opcional)</label>
                        <select value={compraId} onChange={e => setCompraId(e.target.value)} disabled={!proveedorId} style={inp}>
                            <option value="">— Sin recepción (saldo a favor) —</option>
                            {recepciones.map(r => <option key={r.id} value={r.id}>{r.numero_doc}{r.nro_doc_proveedor ? ` · ${r.nro_doc_proveedor}` : ''} · {fmt(r.total)}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>N° de la NC del proveedor</label>
                        <input value={nroDoc} onChange={e => setNroDoc(e.target.value)} placeholder="Ej: 00001234" style={inp} />
                    </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                    <SelectorFechaTasa fecha={fecha} onFecha={setFecha} tasasFecha={tasasFecha} cargandoTasas={cargandoTasas}
                        tipoTasa={tipoTasa} onTipoTasa={setTipoTasa} />
                </div>

                <div style={{ marginBottom: '12px' }}>
                    <label style={lbl}>Motivo *</label>
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Descuento, ajuste de precio, bonificación…" style={inp} />
                </div>

                <label style={lbl}>Líneas (montos sin IVA, USD)</label>
                {lineas.map((l, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto auto', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                        <input value={l.concepto} onChange={e => cambiarLinea(i, 'concepto', e.target.value)} placeholder="Concepto" style={inp} />
                        <input type="number" min="0" step="0.01" value={l.monto} onChange={e => cambiarLinea(i, 'monto', e.target.value)} placeholder="0.00" style={{ ...inp, textAlign: 'right' }} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#374151', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={l.aplica_iva} onChange={e => cambiarLinea(i, 'aplica_iva', e.target.checked)} /> IVA
                        </label>
                        <button type="button" onClick={() => setLineas(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)}
                            style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '16px' }}>×</button>
                    </div>
                ))}
                <button type="button" onClick={() => setLineas(ls => [...ls, { concepto: '', monto: '', aplica_iva: true }])}
                    style={{ fontSize: '12px', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontWeight: 600 }}>
                    + Agregar línea
                </button>

                <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '10px 14px', margin: '12px 0', fontSize: '13px', display: 'grid', gap: '4px' }}>
                    {totales.base_gravada > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>Base gravada</span><span>{fmt(totales.base_gravada)}</span></div>}
                    {totales.base_exenta > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>Base exenta</span><span>{fmt(totales.base_exenta)}</span></div>}
                    {totales.iva > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#6b7280' }}>IVA</span><span>{fmt(totales.iva)}</span></div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}><span>Total de la NC</span><span>{fmt(totales.total)}</span></div>
                    {tasa > 0 && totales.total > 0 && <div style={{ textAlign: 'right', fontSize: '11px', color: '#9ca3af' }}>{(totales.total * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</div>}
                </div>

                {error && <div style={{ fontSize: '13px', color: '#dc2626', marginBottom: '10px' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onCerrar} disabled={guardando} style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={guardar} disabled={guardando}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: '#16a34a', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Guardando...' : 'Registrar nota de crédito'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Detalle ─────────────────────────────────────────────────────────────────
function DetalleNCProveedor({ nota: inicial, onVolver }) {
    const { perfil } = useAuth()
    const puedeAnular = ['admin', 'finanzas', 'superadmin'].includes(perfil?.rol)
    const [nota, setNota] = useState(inicial)
    const [items, setItems] = useState([])
    const [aplicaciones, setAplicaciones] = useState([])
    const [modal, setModal] = useState(null)   // 'anular' | 'liquidar'

    async function cargar() {
        const [notas, { data: its }, { data: apsC }, { data: apsG }] = await Promise.all([
            cargarCreditosProveedor(perfil.empresa_id, { proveedorId: inicial.proveedor_id }),
            supabase.from('devolucion_proveedor_items').select('*').eq('devolucion_proveedor_id', inicial.id),
            supabase.from('pagos_proveedor').select('id, fecha_pago, monto_usd, monto_bs, tasa_cambio, anulado, motivo_anulacion, compras(numero_doc, nro_doc_proveedor)')
                .eq('devolucion_proveedor_id', inicial.id).order('fecha_pago'),
            supabase.from('pagos').select('id, fecha, monto_usd, monto_bs, tasa_cambio, origen_id').eq('devolucion_proveedor_id', inicial.id).order('fecha'),
        ])
        const n = notas.find(x => x.id === inicial.id)
        if (n) setNota(n)
        setItems(its || [])
        const idsG = (apsG || []).map(a => a.origen_id)
        const nomG = {}
        if (idsG.length) {
            const { data: gs } = await supabase.from('gastos').select('id, numero_gasto, nombre').in('id', idsG)
            ;(gs || []).forEach(g => { nomG[g.id] = `${g.numero_gasto || ''} · ${g.nombre || ''}` })
        }
        setAplicaciones([
            ...(apsC || []).map(a => ({ id: a.id, fecha: ymdCaracas(a.fecha_pago), doc: [a.compras?.numero_doc, a.compras?.nro_doc_proveedor].filter(Boolean).join(' · '), monto: pagoEnUsd(a), anulado: a.anulado, motivo: a.motivo_anulacion })),
            ...(apsG || []).map(a => ({ id: a.id, fecha: a.fecha, doc: nomG[a.origen_id] || 'Gasto', monto: pagoEnUsd(a), anulado: false })),
        ].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')))
    }
    useEffect(() => { cargar() }, [inicial.id])

    const vivo = ['pendiente', 'parcial'].includes(nota.estado_nd)
    const card = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px 22px', marginBottom: '14px' }
    const lbl = { fontSize: '11px', fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }
    const val = { fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }
    const th = { padding: '8px 12px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }
    const td = { padding: '9px 12px', fontSize: '13px', color: '#374151' }

    return (
        <div style={{ maxWidth: '760px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Nota de crédito {nota.numero_nd}</h2>
                <BadgeNCProv estado={nota.estado_nd} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    {vivo && (
                        <button onClick={() => setModal('liquidar')}
                            style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #c7d2fe', backgroundColor: '#eef2ff', color: '#3730a3', cursor: 'pointer' }}>
                            Liquidar (reembolso)
                        </button>
                    )}
                    {puedeAnular && !['anulada', 'reembolsada'].includes(nota.estado_nd) && (
                        <button onClick={() => setModal('anular')}
                            style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #fecaca', backgroundColor: '#fff', color: '#dc2626', cursor: 'pointer' }}>
                            Anular
                        </button>
                    )}
                </div>
            </div>

            <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    <div><p style={lbl}>Origen</p><p style={val}>{nota.origen === 'manual' ? 'Manual' : 'Devolución'}</p></div>
                    <div><p style={lbl}>Doc. del proveedor</p><p style={{ ...val, fontFamily: 'monospace' }}>{nota.nro_doc_proveedor || '—'}</p></div>
                    <div><p style={lbl}>Fecha</p><p style={val}>{fmtFechaCorta(nota.fecha_emision || ymdCaracas(nota.created_at))}</p></div>
                    <div><p style={lbl}>Proveedor</p><p style={val}>{nota.proveedores?.nombre || '—'}</p></div>
                    <div><p style={lbl}>Recepción</p><p style={{ ...val, fontFamily: 'monospace' }}>{nota.compras?.numero_doc || '—'}</p></div>
                    <div><p style={lbl}>Monto · Saldo</p><p style={val}>{fmt(nota.monto_total)} · <span style={{ color: '#854d0e' }}>{fmt(nota.saldo)}</span></p></div>
                </div>
                {nota.motivo && <p style={{ fontSize: '13px', color: '#6b7280', margin: '12px 0 0' }}>Motivo: {nota.motivo}</p>}
                {nota.estado_nd === 'anulada' && nota.motivo_anulacion && <p style={{ fontSize: '13px', color: '#991b1b', margin: '6px 0 0' }}>Anulada: {nota.motivo_anulacion}</p>}
                {nota.estado_nd === 'reembolsada' && <p style={{ fontSize: '13px', color: '#3730a3', margin: '6px 0 0' }}>Reembolsada{nota.nota_liquidacion ? `: ${nota.nota_liquidacion}` : ''}</p>}
            </div>

            <div style={{ ...card, padding: 0, overflow: 'clip' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ backgroundColor: '#f9fafb' }}>{['Concepto / ítem', 'Cant.', 'Precio', 'IVA'].map((h, i) => <th key={i} style={{ ...th, textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                    <tbody>
                        {items.map(it => (
                            <tr key={it.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                                <td style={td}>{it.concepto || it.nombre_insumo || '—'}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{Number(it.cantidad).toLocaleString('es-VE')}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{fmt(precioBaseItem(it))}</td>
                                <td style={{ ...td, textAlign: 'right' }}>{it.aplica_iva === false ? 'No' : 'Sí'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={card}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', margin: '0 0 8px' }}>Aplicaciones</p>
                {aplicaciones.length === 0 ? <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Todavía no se aplicó. Se aplica desde la ventana de pago de una recepción o un gasto de este proveedor.</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr>{['Fecha', 'Documento', 'Monto'].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                        <tbody>
                            {aplicaciones.map(a => (
                                <tr key={a.id} style={{ borderTop: '1px solid #f3f4f6', color: a.anulado ? '#9ca3af' : undefined }}>
                                    <td style={{ ...td, color: 'inherit' }}>{fmtFechaCorta(a.fecha)}</td>
                                    <td style={{ ...td, color: 'inherit', fontFamily: 'monospace', fontSize: '12px' }}>{a.doc}{a.anulado ? ' (anulada)' : ''}</td>
                                    <td style={{ ...td, color: 'inherit', textAlign: 'right', textDecoration: a.anulado ? 'line-through' : 'none' }}>{fmt(a.monto)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {modal && <ModalAccionNC nota={nota} accion={modal} onCerrar={() => setModal(null)} onListo={() => { setModal(null); cargar() }} />}
        </div>
    )
}

// Anular (revierte aplicaciones, RPC) o liquidar por reembolso (sin caja)
function ModalAccionNC({ nota, accion, onCerrar, onListo }) {
    const [texto, setTexto] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const anular = accion === 'anular'

    async function confirmar() {
        if (anular && !texto.trim()) { setError('El motivo es obligatorio'); return }
        setGuardando(true); setError('')
        const { error: err } = anular
            ? await supabase.rpc('anular_credito_proveedor', { p_id: nota.id, p_motivo: texto.trim() })
            : await supabase.from('devoluciones_proveedor').update({
                estado_nd: 'reembolsada', nota_liquidacion: texto.trim() || null, fecha_liquidacion: new Date().toISOString(),
            }).eq('id', nota.id)
        setGuardando(false)
        if (err) { setError(err.message); return }
        onListo()
    }

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 6px' }}>{anular ? 'Anular nota de crédito' : 'Liquidar por reembolso'}</h2>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 14px' }}>
                    {anular
                        ? `${nota.numero_nd} · ${fmt(nota.monto_total)}. Sus aplicaciones se revierten: lo aplicado vuelve al saldo de cada recepción o gasto.${nota.origen === 'devolucion' ? ' La mercancía devuelta no regresa al inventario.' : ''}`
                        : `El proveedor devolvió el saldo de ${fmt(nota.saldo)} en dinero. La nota deja de estar disponible para aplicar. No se registra movimiento de caja.`}
                </p>
                <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={3} placeholder={anular ? 'Motivo de la anulación' : 'Nota (opcional): referencia del reembolso…'}
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                {error && <div style={{ marginTop: '10px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button onClick={onCerrar} disabled={guardando} style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={confirmar} disabled={guardando}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: anular ? '#dc2626' : '#4f46e5', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Guardando...' : anular ? 'Anular nota' : 'Marcar reembolsada'}
                    </button>
                </div>
            </div>
        </div>
    )
}
