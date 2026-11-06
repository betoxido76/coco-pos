// Diferencial cambiario en CxC (docs/plan-diferencial-cambiario.md).
//
// Algunos clientes no pagan indexado (clientes.paga_indexado = false): pagan los
// bolívares de la factura aunque la tasa haya subido, y en USD queda un saldo
// que nunca va a entrar. Finanzas/Administración lo lleva a pérdida con
// `registrar_diferencial_cambiario`: queda en `diferenciales_cambiarios` y como
// abono SIN CAJA en `cobros` (diferencial_id), así que todo lector de saldos ve
// la nota saldada y Finanzas/Bancos no lo cuentan como dinero.
//
// ModalDiferencialCambiario: la ventana del botón "Dif. cambiario" de una nota.
// PanelDiferencialCambiario: la pestaña de CxC con el registro, totales y Excel.
import { useContext, useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import FiltroCombo from './FiltroCombo'
import { hoyYMD, fmtFechaCorta, ymdCaracas } from './SelectorFechaTasa'
import { useAltoBarra, useOrden, ordenarFilas, ThOrden, TopTitulos, estiloTarjetaTabla } from './TablaOrdenable'

const fmt = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtBs = (n) => `${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`
const fmtTasa = (n) => n ? Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—'
const cobroEnUsd = (c) => Number(c.monto_usd || 0) + Number(c.monto_bs || 0) / Number(c.tasa_cambio || 1)
const esDinero = (c) => !c.devolucion_id && !c.retencion_id && !c.diferencial_id
const COLUMNA_TASA = { tasa_bcv: 'tasa_bcv', tasa_euro: 'tasa_euro', tasa_binance: 'tasa_binance' }

// ── Ventana: llevar el saldo de una nota a diferencial cambiario ────────────
export function ModalDiferencialCambiario({ venta, onCerrar, onRegistrado }) {
    const { perfil } = useAuth()
    const [cobros, setCobros] = useState(null)
    const [tasaNota, setTasaNota] = useState(null)
    const [motivo, setMotivo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    const fechaNota = ymdCaracas(venta.fecha_venta || venta.created_at)

    useEffect(() => {
        async function cargar() {
            const { data } = await supabase.from('cobros')
                .select('id, fecha_cobro, monto_usd, monto_bs, tasa_cambio, tipo_tasa, metodo_usd, metodo_bs, devolucion_id, retencion_id, diferencial_id')
                .eq('venta_id', venta.id).order('fecha_cobro')
            const filas = data || []
            setCobros(filas)
            // Tasa del día de emisión, del mismo tipo que el último pago en Bs.
            const ultBs = [...filas].reverse().find(c => esDinero(c) && Number(c.monto_bs) > 0)
            const col = COLUMNA_TASA[ultBs?.tipo_tasa] || 'tasa_bcv'
            const { data: t } = await supabase.from('tasas_cambio').select(col)
                .eq('empresa_id', perfil.empresa_id).eq('fecha', fechaNota).maybeSingle()
            setTasaNota(Number(t?.[col]) || null)
        }
        cargar()
    }, [venta.id])

    const pagoDirecto = Number(venta.pago_usd || 0) + Number(venta.pago_bs || 0) / Number(venta.tasa_cambio || 1)
    const cobrado = (cobros || []).reduce((s, c) => s + cobroEnUsd(c), 0) + pagoDirecto
    const saldo = Math.round((Number(venta.total || 0) - cobrado) * 100) / 100
    const pagosBs = (cobros || []).filter(c => esDinero(c) && Number(c.monto_bs) > 0)
    const bsPagados = pagosBs.reduce((s, c) => s + Number(c.monto_bs), 0)
    // Lo que explica el cambio de tasa: cada pago en Bs. a la tasa de la nota contra la de su día
    const referencia = tasaNota
        ? Math.round(pagosBs.reduce((s, c) => s + Number(c.monto_bs) / tasaNota - Number(c.monto_bs) / Number(c.tasa_cambio || 1), 0) * 100) / 100
        : null
    const sinExplicar = referencia != null ? Math.round((saldo - referencia) * 100) / 100 : null
    const ultimo = pagosBs[pagosBs.length - 1]

    async function confirmar() {
        if (!motivo.trim()) { setError('El motivo es obligatorio'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.rpc('registrar_diferencial_cambiario', { p_venta_id: venta.id, p_motivo: motivo.trim() })
        setGuardando(false)
        if (err) { setError(err.message); return }
        onRegistrado()
    }

    const fila = (label, valor, fuerte) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
            <span style={{ color: '#6b7280' }}>{label}</span>
            <span style={{ fontWeight: fuerte ? 700 : 600, color: '#1f2937' }}>{valor}</span>
        </div>
    )

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '480px', maxWidth: 'calc(100vw - 32px)', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>Llevar saldo a diferencial cambiario</h2>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
                    {venta.numero_factura} · {venta.clientes?.nombre}. El cliente pagó los bolívares sin indexar: el saldo en USD se registra como pérdida y la nota queda pagada.
                </p>

                {cobros === null ? <p style={{ fontSize: '13px', color: '#9ca3af' }}>Cargando...</p> : (<>
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 16px', marginBottom: '14px' }}>
                        {fila('Total de la nota', fmt(venta.total))}
                        {fila('Cobrado (dinero, NC y retenciones)', fmt(cobrado))}
                        {fila('Bs. recibidos', fmtBs(bsPagados))}
                        <div style={{ borderTop: '1px solid #e5e7eb', margin: '8px 0' }} />
                        {fila('A diferencial cambiario', <span style={{ color: '#b45309' }}>{fmt(saldo)}</span>, true)}
                    </div>

                    <div style={{ fontSize: '12px', color: '#4b5563', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px', lineHeight: 1.5 }}>
                        {referencia == null
                            ? <>No hay tasa cargada para el {fmtFechaCorta(fechaNota)} (emisión de la nota): no se puede calcular cuánto del saldo se explica por el cambio de tasa.</>
                            : <>Con la tasa del día de la nota ({fmtTasa(tasaNota)} el {fmtFechaCorta(fechaNota)}) y la del pago
                                {ultimo ? ` (${fmtTasa(ultimo.tasa_cambio)} el ${fmtFechaCorta(ymdCaracas(ultimo.fecha_cobro))})` : ''},
                                el cambio de tasa explica <b>{fmt(referencia)}</b>.
                                {Math.abs(sinExplicar) > 0.5 && <> Los <b>{fmt(sinExplicar)}</b> restantes no vienen del cambio de tasa: revisa si el cliente pagó de menos, si falta una NC o si la factura se emitió en otra fecha.</>}
                            </>}
                    </div>

                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Motivo</label>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                        placeholder="Ej: Farmatodo pagó los Bs. de la factura del 07/10 sin indexar"
                        style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }} />

                    {error && <div style={{ marginTop: '10px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                        <button onClick={onCerrar} disabled={guardando}
                            style={{ flex: 1, padding: '11px', border: '1px solid #e5e7eb', borderRadius: '10px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '14px' }}>Cancelar</button>
                        <button onClick={confirmar} disabled={guardando || saldo <= 0.01}
                            style={{ flex: 2, padding: '11px', border: 'none', borderRadius: '10px', backgroundColor: saldo <= 0.01 ? '#d1d5db' : '#b45309', color: '#fff', fontWeight: 700, fontSize: '14px', cursor: saldo <= 0.01 ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
                            {guardando ? 'Registrando...' : `Llevar ${fmt(saldo)} a pérdida`}
                        </button>
                    </div>
                </>)}
            </div>
        </>
    )
}

// ── Pestaña: registro de diferenciales ──────────────────────────────────────
export function PanelDiferencialCambiario({ onCambio }) {
    const { perfil } = useAuth()
    const topBarra = useContext(TopTitulos)
    const [filtrosRef, altoFiltros] = useAltoBarra()
    const [orden, ordenarPor] = useOrden({ col: 'fecha', dir: 'desc' }, ['fecha', 'total', 'monto', 'referencia', 'bs'])
    const [desde, setDesde] = useState(`${hoyYMD().slice(0, 4)}-01-01`)
    const [hasta, setHasta] = useState(hoyYMD())
    const [fCliente, setFCliente] = useState('')
    const [fEstado, setFEstado] = useState('vigente')
    const [filas, setFilas] = useState([])
    const [cargando, setCargando] = useState(true)
    const [anulando, setAnulando] = useState(null)

    async function cargar() {
        setCargando(true)
        let q = supabase.from('diferenciales_cambiarios')
            .select('*, clientes(nombre, rif), ventas(numero_factura, nro_referencia), usuarios!usuario_id(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .order('fecha', { ascending: false })
        if (desde) q = q.gte('fecha', desde)
        if (hasta) q = q.lte('fecha', hasta)
        const { data } = await q
        setFilas(data || [])
        setCargando(false)
    }
    useEffect(() => { if (perfil?.empresa_id) cargar() }, [perfil?.empresa_id, desde, hasta])

    const opcClientes = [...new Map(filas.map(r => [r.cliente_id, { value: r.cliente_id, label: r.clientes?.nombre || '—' }])).values()]
        .sort((a, b) => a.label.localeCompare(b.label))
    const visibles = filas.filter(r => (!fCliente || r.cliente_id === fCliente) && (!fEstado || r.estado === fEstado))
    const filtradas = ordenarFilas(visibles, {
        numero: r => r.numero,
        fecha: r => r.fecha,
        cliente: r => r.clientes?.nombre,
        nota: r => r.ventas?.numero_factura,
        total: r => Number(r.total_nota),
        bs: r => Number(r.bs_pagados),
        referencia: r => r.referencia_usd == null ? null : Number(r.referencia_usd),
        monto: r => Number(r.monto_usd),
        estado: r => r.estado,
    }, orden)

    // Totales del período: solo vigentes
    const vigentes = filas.filter(r => r.estado === 'vigente' && (!fCliente || r.cliente_id === fCliente))
    const totalPerdida = vigentes.reduce((s, r) => s + Number(r.monto_usd), 0)
    const totalNotas = vigentes.reduce((s, r) => s + Number(r.total_nota), 0)
    const porCliente = Object.values(vigentes.reduce((acc, r) => {
        const k = r.cliente_id
        acc[k] = acc[k] || { nombre: r.clientes?.nombre || '—', monto: 0, total: 0, n: 0 }
        acc[k].monto += Number(r.monto_usd); acc[k].total += Number(r.total_nota); acc[k].n += 1
        return acc
    }, {})).sort((a, b) => b.monto - a.monto)

    function exportar() {
        const datos = filtradas.map(r => ({
            'N°': r.numero,
            'Fecha (último pago Bs.)': fmtFechaCorta(r.fecha),
            'Cliente': r.clientes?.nombre || '',
            'RIF': r.clientes?.rif || '',
            'Nota': r.ventas?.numero_factura || '',
            'Factura': r.ventas?.nro_referencia || '',
            'Total nota USD': Number(r.total_nota),
            'Cobrado antes USD': Number(r.cobrado_usd),
            'Bs. recibidos': Number(r.bs_pagados),
            'Tasa de la nota': r.tasa_nota ? Number(r.tasa_nota) : '',
            'Tasa del último pago': r.tasa_ultimo_pago ? Number(r.tasa_ultimo_pago) : '',
            'Explicado por la tasa USD': r.referencia_usd != null ? Number(r.referencia_usd) : '',
            'Diferencial USD': Number(r.monto_usd),
            '% de la nota': Number(r.total_nota) > 0 ? Math.round(Number(r.monto_usd) / Number(r.total_nota) * 10000) / 100 : '',
            'Motivo': r.motivo,
            'Registrado por': r.usuarios?.nombre || '',
            'Estado': r.estado,
            'Motivo anulación': r.motivo_anulacion || '',
        }))
        const ws = XLSX.utils.json_to_sheet(datos)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Diferencial cambiario')
        XLSX.writeFile(wb, `diferencial_cambiario_${desde || 'inicio'}_${hasta || hoyYMD()}.xlsx`)
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
                {kpi('Dejado de percibir en el período', fmt(totalPerdida), `${vigentes.length} nota(s)`)}
                {kpi('Sobre ventas por', fmt(totalNotas), totalNotas > 0 ? `${(totalPerdida / totalNotas * 100).toFixed(1)} % del total de esas notas` : undefined)}
                {porCliente.slice(0, 2).map(c => kpi(c.nombre, fmt(c.monto), `${c.n} nota(s) · ${(c.monto / c.total * 100).toFixed(1)} %`))}
            </div>

            <div ref={filtrosRef} style={{ position: 'sticky', top: topBarra, zIndex: 15, backgroundColor: '#f9fafb', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', paddingBottom: '12px' }}>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Desde</label>
                    <input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inp} />
                </div>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>Hasta</label>
                    <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={inp} />
                </div>
                <FiltroCombo label="Cliente" value={fCliente} onChange={setFCliente} options={opcClientes} width="240px" />
                <FiltroCombo label="Estado" value={fEstado} onChange={setFEstado} width="140px"
                    options={[{ value: 'vigente', label: 'Vigentes' }, { value: 'anulado', label: 'Anulados' }]} />
                <button onClick={exportar} disabled={filtradas.length === 0}
                    style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: '1px solid #16a34a', backgroundColor: '#f0fdf4', color: '#166534', cursor: filtradas.length ? 'pointer' : 'default' }}>
                    📊 Excel
                </button>
            </div>

            <div style={estiloTarjetaTabla}>
                {cargando ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    : filtradas.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay diferenciales cambiarios en el período. Se registran desde Facturas CxC, con el botón "Dif. cambiario" de la nota.</div>
                    : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    {[['N°', 'numero'], ['Fecha', 'fecha'], ['Cliente', 'cliente'], ['Nota', 'nota'], ['Total nota', 'total', true],
                                      ['Bs. recibidos', 'bs', true], ['Tasa nota → pago', null], ['Por la tasa', 'referencia', true], ['Diferencial', 'monto', true],
                                      ['Motivo', null], ['Estado', 'estado'], ['', null]].map(([h, col, der], i) => (
                                        <ThOrden key={i} col={col} orden={orden} onOrdenar={ordenarPor} top={topBarra + altoFiltros} align={der ? 'right' : 'left'}>{h}</ThOrden>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(r => {
                                    const anulado = r.estado === 'anulado'
                                    const td = { padding: '10px 14px', fontSize: '13px', color: anulado ? '#9ca3af' : '#374151', whiteSpace: 'nowrap' }
                                    return (
                                        <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{r.numero}</td>
                                            <td style={td}>{fmtFechaCorta(r.fecha)}</td>
                                            <td style={{ ...td, whiteSpace: 'normal' }}>{r.clientes?.nombre || '—'}</td>
                                            <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{r.ventas?.numero_factura || '—'}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>{fmt(r.total_nota)}</td>
                                            <td style={{ ...td, textAlign: 'right' }}>{fmtBs(r.bs_pagados)}</td>
                                            <td style={{ ...td, fontSize: '12px' }}>{fmtTasa(r.tasa_nota)} → {fmtTasa(r.tasa_ultimo_pago)}</td>
                                            <td style={{ ...td, textAlign: 'right' }} title="Parte del diferencial que explica la subida de la tasa entre la emisión y el pago">
                                                {r.referencia_usd != null ? fmt(r.referencia_usd) : '—'}
                                            </td>
                                            <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: anulado ? '#9ca3af' : '#b45309', textDecoration: anulado ? 'line-through' : 'none' }}>{fmt(r.monto_usd)}</td>
                                            <td style={{ ...td, whiteSpace: 'normal', maxWidth: '260px', fontSize: '12px' }} title={`Registrado por ${r.usuarios?.nombre || '—'}`}>{r.motivo}</td>
                                            <td style={td}>
                                                {anulado
                                                    ? <span title={r.motivo_anulacion || ''} style={{ fontSize: '12px', color: '#991b1b' }}>Anulado</span>
                                                    : <span style={{ fontSize: '12px', color: '#166534' }}>Vigente</span>}
                                            </td>
                                            <td style={td}>
                                                {!anulado && (
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

            {anulando && <ModalAnularDiferencial dif={anulando} onCerrar={() => setAnulando(null)}
                onAnulado={() => { setAnulando(null); cargar(); onCambio?.() }} />}
        </div>
    )
}

function ModalAnularDiferencial({ dif, onCerrar, onAnulado }) {
    const [motivo, setMotivo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    async function confirmar() {
        if (!motivo.trim()) { setError('El motivo es obligatorio'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.rpc('anular_diferencial_cambiario', { p_id: dif.id, p_motivo: motivo.trim() })
        setGuardando(false)
        if (err) { setError(err.message); return }
        onAnulado()
    }

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 6px' }}>Anular diferencial cambiario</h2>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 14px' }}>
                    {dif.numero} · {fmt(dif.monto_usd)} · {dif.clientes?.nombre} · {dif.ventas?.numero_factura}.
                    El monto vuelve al saldo de la nota en CxC.
                </p>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} placeholder="Motivo de la anulación"
                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                {error && <div style={{ marginTop: '10px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button onClick={onCerrar} disabled={guardando}
                        style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', backgroundColor: '#fff', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={confirmar} disabled={guardando}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', backgroundColor: '#dc2626', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Anulando...' : 'Anular diferencial'}
                    </button>
                </div>
            </div>
        </div>
    )
}
