// CxP → pestaña Retenciones (docs/plan-retenciones.md).
//
// Lista las retenciones de IVA/ISLR hechas al pagar a proveedores, por período
// (quincena para IVA, mes para ISLR, que es como se declaran), con totales,
// Excel para cargarlas en Galac y anulación (Finanzas/Administración). Lo
// vigente del período es lo que se le debe al SENIAT.
import { useContext, useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import FiltroCombo from './FiltroCombo'
import { hoyYMD, fmtFechaCorta } from './SelectorFechaTasa'
import { useAltoBarra, useOrden, ordenarFilas, ThOrden, TopTitulos, estiloTarjetaTabla } from './TablaOrdenable'
import { TIPOS_RETENCION } from '../lib/retenciones'

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtBs = (n) => `${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Períodos de declaración: quincenas (IVA) y meses (ISLR)
function periodo(clave) {
    const [a, m, d] = hoyYMD().split('-').map(Number)
    const finMes = (anio, mes) => new Date(anio, mes, 0).getDate()   // mes 1-12
    const mesAnt = m === 1 ? [a - 1, 12] : [a, m - 1]
    switch (clave) {
        case 'quincena': return d <= 15 ? [ymd(new Date(a, m - 1, 1)), ymd(new Date(a, m - 1, 15))] : [ymd(new Date(a, m - 1, 16)), ymd(new Date(a, m - 1, finMes(a, m)))]
        case 'quincena_ant': return d <= 15
            ? [ymd(new Date(mesAnt[0], mesAnt[1] - 1, 16)), ymd(new Date(mesAnt[0], mesAnt[1] - 1, finMes(...mesAnt)))]
            : [ymd(new Date(a, m - 1, 1)), ymd(new Date(a, m - 1, 15))]
        case 'mes': return [ymd(new Date(a, m - 1, 1)), ymd(new Date(a, m - 1, finMes(a, m)))]
        case 'mes_ant': return [ymd(new Date(mesAnt[0], mesAnt[1] - 1, 1)), ymd(new Date(mesAnt[0], mesAnt[1] - 1, finMes(...mesAnt)))]
        default: return ['', '']
    }
}
const PERIODOS = [['quincena', 'Quincena actual'], ['quincena_ant', 'Quincena anterior'], ['mes', 'Mes actual'], ['mes_ant', 'Mes anterior']]

export default function PanelRetenciones() {
    const { perfil } = useAuth()
    const puedeAnular = ['admin', 'finanzas', 'superadmin'].includes(perfil?.rol)
    const topBarra = useContext(TopTitulos)
    const [filtrosRef, altoFiltros] = useAltoBarra()
    const [orden, ordenarPor] = useOrden({ col: 'fecha', dir: 'desc' }, ['fecha', 'base', 'monto', 'monto_bs', 'pct'])
    const [inicial] = useState(periodo('mes'))
    const [desde, setDesde] = useState(inicial[0])
    const [hasta, setHasta] = useState(inicial[1])
    const [fTipo, setFTipo] = useState('')
    const [fProveedor, setFProveedor] = useState('')
    const [fEstado, setFEstado] = useState('vigente')
    const [filas, setFilas] = useState([])
    const [cargando, setCargando] = useState(true)
    const [anulando, setAnulando] = useState(null)

    async function cargar() {
        setCargando(true)
        let q = supabase.from('retenciones')
            .select('*, proveedores(nombre, rif)')
            .eq('empresa_id', perfil.empresa_id)
            .order('fecha', { ascending: false })
        if (desde) q = q.gte('fecha', desde)
        if (hasta) q = q.lte('fecha', hasta)
        const { data } = await q
        const rets = data || []
        // Documento de origen: recepción o gasto (origen_id no es FK)
        const idsC = [...new Set(rets.filter(r => r.origen_tipo === 'compra').map(r => r.origen_id))]
        const idsG = [...new Set(rets.filter(r => r.origen_tipo === 'gasto').map(r => r.origen_id))]
        const [{ data: cs }, { data: gs }] = await Promise.all([
            idsC.length ? supabase.from('compras').select('id, numero_doc, nro_doc_proveedor').in('id', idsC) : { data: [] },
            idsG.length ? supabase.from('gastos').select('id, numero_gasto, numero_factura, nombre').in('id', idsG) : { data: [] },
        ])
        const docs = {}
        ;(cs || []).forEach(c => { docs[c.id] = { numero: c.numero_doc, factura: c.nro_doc_proveedor } })
        ;(gs || []).forEach(g => { docs[g.id] = { numero: g.numero_gasto, factura: g.numero_factura, concepto: g.nombre } })
        setFilas(rets.map(r => ({ ...r, doc: docs[r.origen_id] || {} })))
        setCargando(false)
    }
    useEffect(() => { if (perfil?.empresa_id) cargar() }, [perfil?.empresa_id, desde, hasta])

    const opcProv = [...new Map(filas.filter(r => r.proveedores).map(r => [r.proveedor_id, { value: r.proveedor_id, label: r.proveedores.nombre }])).values()]
        .sort((a, b) => a.label.localeCompare(b.label))
    const filtradas = ordenarFilas(filas.filter(r =>
        (!fTipo || r.tipo === fTipo) && (!fProveedor || r.proveedor_id === fProveedor) && (!fEstado || r.estado === fEstado)), {
        fecha: r => r.fecha,
        tipo: r => r.tipo,
        proveedor: r => r.proveedores?.nombre,
        rif: r => r.proveedores?.rif,
        documento: r => r.doc.numero,
        factura: r => r.doc.factura,
        base: r => Number(r.base_calculo),
        pct: r => Number(r.porcentaje),
        monto: r => Number(r.monto_usd),
        monto_bs: r => Number(r.monto_bs),
        estado: r => r.estado,
    }, orden)
    const vigentes = filas.filter(r => r.estado === 'vigente' && (!fProveedor || r.proveedor_id === fProveedor))
    const total = t => vigentes.filter(r => r.tipo === t).reduce((s, r) => s + Number(r.monto_usd), 0)
    const totalBs = t => vigentes.filter(r => r.tipo === t).reduce((s, r) => s + Number(r.monto_bs), 0)

    function exportar() {
        const datos = filtradas.map(r => ({
            'Fecha': fmtFechaCorta(r.fecha),
            'Tipo': TIPOS_RETENCION[r.tipo].corto,
            'Proveedor': r.proveedores?.nombre || '',
            'RIF': r.proveedores?.rif || '',
            'Documento': r.doc.numero || '',
            'Factura del proveedor': r.doc.factura || '',
            'Base de cálculo USD': Number(r.base_calculo),
            '%': Number(r.porcentaje),
            'Retenido USD': Number(r.monto_usd),
            'Tasa': Number(r.tasa_cambio),
            'Retenido Bs.': Number(r.monto_bs),
            'Estado': r.estado,
            'Motivo anulación': r.motivo_anulacion || '',
        }))
        const ws = XLSX.utils.json_to_sheet(datos)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Retenciones')
        XLSX.writeFile(wb, `retenciones_${desde || 'inicio'}_${hasta || hoyYMD()}.xlsx`)
    }

    const kpi = (titulo, valor, sub) => (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '14px 16px' }}>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{titulo}</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{valor}</p>
            {sub && <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{sub}</p>}
        </div>
    )
    const inp = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                {kpi('IVA retenido en el período', fmt(total('iva')), fmtBs(totalBs('iva')))}
                {kpi('ISLR retenido en el período', fmt(total('islr')), fmtBs(totalBs('islr')))}
                {kpi('Total a enterar al SENIAT', fmt(total('iva') + total('islr')), `${vigentes.length} retención(es) vigentes`)}
            </div>

            {/* Filtros: fijos debajo de la barra de pestañas de CxP */}
            <div ref={filtrosRef} style={{ position: 'sticky', top: topBarra, zIndex: 15, backgroundColor: '#f9fafb', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: '12px' }}>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Desde</label>
                    <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inp} />
                </div>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Hasta</label>
                    <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inp} />
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {PERIODOS.map(([k, l]) => (
                        <button key={k} onClick={() => { const [d, h] = periodo(k); setDesde(d); setHasta(h) }}
                            style={{ padding: '7px 10px', borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}>
                            {l}
                        </button>
                    ))}
                </div>
                <FiltroCombo label="Tipo" value={fTipo} onChange={setFTipo} width="130px"
                    options={[{ value: 'iva', label: 'IVA' }, { value: 'islr', label: 'ISLR' }]} />
                <FiltroCombo label="Proveedor" value={fProveedor} onChange={setFProveedor} options={opcProv} width="220px" />
                <FiltroCombo label="Estado" value={fEstado} onChange={setFEstado} width="140px"
                    options={[{ value: 'vigente', label: 'Vigentes' }, { value: 'anulada', label: 'Anuladas' }]} />
                <button onClick={exportar} disabled={filtradas.length === 0}
                    style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid #16a34a', backgroundColor: '#f0fdf4', color: '#166534', cursor: filtradas.length ? 'pointer' : 'default' }}>
                    📊 Excel
                </button>
            </div>

            <div style={estiloTarjetaTabla}>
                {cargando ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    : filtradas.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay retenciones en el período seleccionado.</div>
                    : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {[['Fecha', 'fecha'], ['Tipo', 'tipo'], ['Proveedor', 'proveedor'], ['RIF', 'rif'], ['Documento', 'documento'], ['Factura prov.', 'factura'],
                                      ['Base', 'base', true], ['%', 'pct', true], ['Retenido', 'monto', true], ['Bs.', 'monto_bs', true], ['Estado', 'estado'], ['', null]].map(([h, col, der], i) => (
                                        <ThOrden key={i} col={col} orden={orden} onOrdenar={ordenarPor} top={topBarra + altoFiltros} align={der ? 'right' : 'left'}>{h}</ThOrden>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(r => {
                                    const anulada = r.estado === 'anulada'
                                    const td = { padding: '10px 14px', fontSize: '13px', color: anulada ? '#9ca3af' : '#374151', whiteSpace: 'nowrap' }
                                    return (
                                        <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={td}>{fmtFechaCorta(r.fecha)}</td>
                                            <td style={td}>{TIPOS_RETENCION[r.tipo].corto}</td>
                                            <td style={{ ...td, whiteSpace: 'normal' }}>{r.proveedores?.nombre || '—'}</td>
                                            <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{r.proveedores?.rif || '—'}</td>
                                            <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>
                                                {r.doc.numero || '—'}
                                                {r.doc.concepto && <div style={{ fontFamily: 'system-ui', fontSize: '11px', color: '#9ca3af' }}>{r.doc.concepto}</div>}
                                            </td>
                                            <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{r.doc.factura || '—'}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>{fmt(r.base_calculo)}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>{Number(r.porcentaje)}%</td>
                                            <td style={{ ...td, textAlign: 'right', fontWeight: 600, textDecoration: anulada ? 'line-through' : 'none' }}>{fmt(r.monto_usd)}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>{fmtBs(r.monto_bs)}</td>
                                            <td style={td}>
                                                {anulada
                                                    ? <span title={r.motivo_anulacion || ''} style={{ fontSize: '12px', color: '#991b1b' }}>Anulada</span>
                                                    : <span style={{ fontSize: '12px', color: '#166534' }}>Vigente</span>}
                                            </td>
                                            <td style={td}>
                                                {!anulada && puedeAnular && (
                                                    <button onClick={() => setAnulando(r)}
                                                        style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}>
                                                        Anular
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
            </div>

            {anulando && <ModalAnularRetencion retencion={anulando} onCerrar={() => setAnulando(null)} onAnulada={() => { setAnulando(null); cargar() }} />}
        </div>
    )
}

function ModalAnularRetencion({ retencion, onCerrar, onAnulada }) {
    const [motivo, setMotivo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    async function confirmar() {
        if (!motivo.trim()) { setError('El motivo es obligatorio'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.rpc('anular_retencion', { p_retencion_id: retencion.id, p_motivo: motivo.trim() })
        setGuardando(false)
        if (err) { setError(err.message); return }
        onAnulada()
    }

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 6px' }}>Anular retención</h2>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 14px' }}>
                    {TIPOS_RETENCION[retencion.tipo].label} de {fmt(retencion.monto_usd)} · {retencion.proveedores?.nombre} · {retencion.doc.numero}.
                    El monto vuelve al saldo del documento: al pagarlo de nuevo se propondrá otra vez.
                </p>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Motivo de la anulación"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                {error && <div style={{ marginTop: '10px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button onClick={onCerrar} disabled={guardando}
                        style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={confirmar} disabled={guardando}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Anulando...' : 'Anular retención'}
                    </button>
                </div>
            </div>
        </div>
    )
}
