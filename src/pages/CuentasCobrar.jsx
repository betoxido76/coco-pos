import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { X, DollarSign } from 'lucide-react'

const fmt = n => `$${Number(n).toFixed(2)}`
const fmtBs = n => `${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`

function semaforo(fechaVenc) {
    if (!fechaVenc) return null
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const venc = new Date(fechaVenc + 'T00:00:00')
    const dias = Math.ceil((venc - hoy) / 86400000)
    if (dias < 0) return { color: '#ef4444', bg: '#fef2f2', label: `Vencida hace ${Math.abs(dias)}d`, dot: '🔴' }
    if (dias <= 3) return { color: '#d97706', bg: '#fffbeb', label: `Vence en ${dias}d`, dot: '🟡' }
    return { color: '#16a34a', bg: '#f0fdf4', label: `Vence en ${dias}d`, dot: '🟢' }
}

export default function CuentasCobrar() {
    const [ventas, setVentas] = useState([])
    const [loading, setLoading] = useState(true)
    const [filtro, setFiltro] = useState('pendiente')
    const [modalVenta, setModalVenta] = useState(null)
    const [tasas, setTasas] = useState({ tasa_bcv: 1, tasa_euro: 1, tasa_binance: 1 })

    useEffect(() => { cargar() }, [filtro])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase
            .from('ventas')
            .select('*, clientes(nombre, condicion_pago, dias_credito)')
            .in('estado_cobro', filtro === 'todos' ? ['pendiente', 'parcial', 'pagado'] : [filtro])
            .order('fecha_vencimiento_pago', { ascending: true })
        if (data) setVentas(data)

        const { data: cfg } = await supabase.from('configuracion').select('clave, valor')
        if (cfg) {
            const m = {}; cfg.forEach(r => { m[r.clave] = Number(r.valor) })
            setTasas({ tasa_bcv: m.tasa_bcv || 1, tasa_euro: m.tasa_euro || 1, tasa_binance: m.tasa_binance || 1 })
        }
        setLoading(false)
    }

    const totalPendiente = ventas
        .filter(v => v.estado_cobro !== 'pagado')
        .reduce((s, v) => s + (v.total || 0), 0)

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Cuentas por cobrar</h1>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Seguimiento de facturas a crédito</p>
            </div>

            {/* KPI */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'Total pendiente', valor: fmt(totalPendiente), sub: fmtBs(totalPendiente * tasas.tasa_bcv), color: '#1f2937' },
                    { label: 'Facturas vencidas', valor: ventas.filter(v => v.fecha_vencimiento_pago && new Date(v.fecha_vencimiento_pago) < new Date() && v.estado_cobro !== 'pagado').length, sub: 'requieren atención', color: '#ef4444' },
                    { label: 'Facturas al día', valor: ventas.filter(v => v.estado_cobro !== 'pagado' && (!v.fecha_vencimiento_pago || new Date(v.fecha_vencimiento_pago) >= new Date())).length, sub: 'dentro del plazo', color: '#16a34a' },
                ].map(k => (
                    <div key={k.label} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{k.label}</p>
                        <p style={{ fontSize: '22px', fontWeight: 700, color: k.color, margin: 0 }}>{k.valor}</p>
                        <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>{k.sub}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {[['pendiente', 'Pendientes'], ['parcial', 'Parciales'], ['pagado', 'Pagadas'], ['todos', 'Todas']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setFiltro(val)}
                        style={{
                            padding: '7px 16px', borderRadius: '8px', fontSize: '13px', border: '1px solid', cursor: 'pointer',
                            borderColor: filtro === val ? '#16a34a' : '#e5e7eb',
                            backgroundColor: filtro === val ? '#16a34a' : '#fff',
                            color: filtro === val ? '#fff' : '#6b7280'
                        }}>
                        {lbl}
                    </button>
                ))}
            </div>

            {/* Tabla */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    : ventas.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay facturas en este estado</div>
                        : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {['', 'Factura', 'Cliente', 'Emisión', 'Vencimiento', 'Total', 'Cobrado', 'Saldo', 'Estado', ''].map(h => (
                                            <th key={h} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {ventas.map(v => {
                                        const sem = semaforo(v.fecha_vencimiento_pago)
                                        return (
                                            <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: sem?.bg || 'transparent' }}
                                                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                                <td style={{ padding: '12px 8px 12px 14px', fontSize: '18px' }}>{sem?.dot || '⚪'}</td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{v.numero_factura}</td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{v.clientes?.nombre || '—'}</td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>
                                                    {new Date(v.created_at).toLocaleDateString('es-VE')}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {sem
                                                        ? <span style={{ fontSize: '12px', fontWeight: 500, color: sem.color }}>{sem.label}</span>
                                                        : <span style={{ fontSize: '12px', color: '#9ca3af' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{fmt(v.total)}</td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: '#16a34a' }}>
                                                    <MontoCobrado ventaId={v.id} />
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#ef4444' }}>
                                                    <SaldoPendiente ventaId={v.id} total={v.total} />
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <BadgeCobro estado={v.estado_cobro} />
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {v.estado_cobro !== 'pagado' && (
                                                        <button onClick={() => setModalVenta(v)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                            <DollarSign size={12} /> Registrar cobro
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

            {modalVenta && (
                <ModalCobro venta={modalVenta} tasas={tasas}
                    onCerrar={() => setModalVenta(null)}
                    onCobrado={() => { setModalVenta(null); cargar() }} />
            )}
        </div>
    )
}

// ── Cobrado total de una venta ─────────────────────────────────
function MontoCobrado({ ventaId }) {
    const [monto, setMonto] = useState(null)
    useEffect(() => {
        supabase.from('cobros').select('monto_usd, monto_bs, tasa_cambio').eq('venta_id', ventaId)
            .then(({ data }) => {
                if (data) setMonto(data.reduce((s, c) => s + c.monto_usd + (c.monto_bs / (c.tasa_cambio || 1)), 0))
            })
    }, [ventaId])
    return <span>{monto != null ? fmt(monto) : '—'}</span>
}

function SaldoPendiente({ ventaId, total }) {
    const [cobrado, setCobrado] = useState(null)
    useEffect(() => {
        supabase.from('cobros').select('monto_usd, monto_bs, tasa_cambio').eq('venta_id', ventaId)
            .then(({ data }) => {
                if (data) setCobrado(data.reduce((s, c) => s + c.monto_usd + (c.monto_bs / (c.tasa_cambio || 1)), 0))
            })
    }, [ventaId])
    if (cobrado === null) return <span>—</span>
    const saldo = total - cobrado
    return <span>{saldo > 0.01 ? fmt(saldo) : <span style={{ color: '#16a34a' }}>✓ Pagado</span>}</span>
}

// ── Modal de cobro ─────────────────────────────────────────────
function ModalCobro({ venta, tasas, onCerrar, onCobrado }) {
    const OPCIONES_TASA = [
        { key: 'tasa_bcv', label: 'USD · BCV' },
        { key: 'tasa_euro', label: 'EUR · BCV' },
        { key: 'tasa_binance', label: 'USD · Binance' },
    ]
    const METODOS_USD = ['Efectivo', 'Zelle', 'Transferencia USD', 'Otros']
    const METODOS_BS = ['Pago Móvil', 'Transferencia', 'Punto de Venta', 'Efectivo Bs.']

    const [cobradoPrev, setCobradoPrev] = useState(0)
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [pagoUsd, setPagoUsd] = useState(0)
    const [pagoBs, setPagoBs] = useState(0)
    const [metodoUsd, setMetodoUsd] = useState('Efectivo')
    const [metodoBs, setMetodoBs] = useState('Pago Móvil')
    const [nota, setNota] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        supabase.from('cobros').select('monto_usd, monto_bs, tasa_cambio').eq('venta_id', venta.id)
            .then(({ data }) => {
                if (data) setCobradoPrev(data.reduce((s, c) => s + c.monto_usd + (c.monto_bs / (c.tasa_cambio || 1)), 0))
            })
    }, [venta.id])

    const tasa = tasas[tipoTasa] || 1
    const saldo = venta.total - cobradoPrev
    const abonoEnUsd = pagoUsd + (pagoBs / tasa)
    const excede = abonoEnUsd > saldo + 0.01
    const sinAbono = abonoEnUsd < 0.01

    function handleUsdChange(val) {
        const n = Math.max(0, Number(val))
        setPagoUsd(n)
        setPagoBs(parseFloat((Math.max(0, saldo - n) * tasa).toFixed(2)))
    }

    async function confirmar() {
        if (sinAbono) { setError('Ingresa un monto a cobrar'); return }
        if (excede) { setError('El abono supera el saldo pendiente'); return }
        setGuardando(true); setError('')

        await supabase.from('cobros').insert({
            venta_id: venta.id,
            monto_usd: pagoUsd,
            monto_bs: pagoBs,
            tasa_cambio: tasa,
            tipo_tasa: tipoTasa,
            metodo_usd: metodoUsd,
            metodo_bs: metodoBs,
            nota: nota || null,
            usuario_id: (await supabase.auth.getUser()).data.user.id,
        })

        const nuevoCobrado = cobradoPrev + abonoEnUsd
        const nuevoEstado = nuevoCobrado >= venta.total - 0.01 ? 'pagado' : 'parcial'
        await supabase.from('ventas').update({ estado_cobro: nuevoEstado }).eq('id', venta.id)

        setGuardando(false)
        onCobrado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '460px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Registrar cobro</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                {/* Info factura */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                        <span style={{ color: '#6b7280' }}>Factura</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1f2937' }}>{venta.numero_factura}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                        <span style={{ color: '#6b7280' }}>Total factura</span>
                        <span style={{ fontWeight: 600, color: '#1f2937' }}>{fmt(venta.total)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                        <span style={{ color: '#6b7280' }}>Ya cobrado</span>
                        <span style={{ color: '#16a34a' }}>{fmt(cobradoPrev)}</span>
                    </div>
                    <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '8px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700 }}>
                        <span style={{ color: '#6b7280' }}>Saldo pendiente</span>
                        <span style={{ color: '#ef4444' }}>{fmt(saldo)}</span>
                    </div>
                </div>

                {/* Selector tasa */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasa de cambio</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {OPCIONES_TASA.map(op => (
                            <button key={op.key} onClick={() => setTipoTasa(op.key)}
                                style={{
                                    flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid', cursor: 'pointer',
                                    borderColor: tipoTasa === op.key ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: tipoTasa === op.key ? '#f0fdf4' : '#fff',
                                    color: tipoTasa === op.key ? '#16a34a' : '#6b7280'
                                }}>
                                <div>{op.label}</div>
                                <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 400 }}>{tasas[op.key].toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Montos */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Pago en USD ($)</label>
                        <input type="number" min="0" step="0.01" value={pagoUsd} onChange={e => handleUsdChange(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px', fontWeight: 600, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Vía USD</label>
                        <select value={metodoUsd} onChange={e => setMetodoUsd(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                            {METODOS_USD.map(m => <option key={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Pago en Bs.</label>
                        <input type="number" min="0" step="1" value={pagoBs} onChange={e => setPagoBs(Math.max(0, Number(e.target.value)))}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px', fontWeight: 600, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Vía Bs.</label>
                        <select value={metodoBs} onChange={e => setMetodoBs(e.target.value)}
                            style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                            {METODOS_BS.map(m => <option key={m}>{m}</option>)}
                        </select>
                    </div>
                </div>

                {/* Nota */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nota (opcional)</label>
                    <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: Transferencia ref. 12345"
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>

                {/* Resumen abono */}
                <div style={{
                    borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', textAlign: 'center', fontWeight: 500,
                    backgroundColor: excede ? '#fef2f2' : sinAbono ? '#f9fafb' : '#f0fdf4',
                    color: excede ? '#dc2626' : sinAbono ? '#9ca3af' : '#166534',
                    border: `1px solid ${excede ? '#fecaca' : sinAbono ? '#e5e7eb' : '#bbf7d0'}`
                }}>
                    {excede ? '⚠️ El abono supera el saldo pendiente'
                        : sinAbono ? 'Ingresa el monto a cobrar'
                            : `Abono: ${fmt(abonoEnUsd)} · Quedará pendiente: ${fmt(Math.max(0, saldo - abonoEnUsd))}`}
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

                <button onClick={confirmar} disabled={guardando || sinAbono || excede}
                    style={{ width: '100%', backgroundColor: sinAbono || excede ? '#d1d5db' : '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: sinAbono || excede ? 'default' : 'pointer' }}>
                    {guardando ? 'Registrando...' : 'Confirmar cobro'}
                </button>
            </div>
        </>
    )
}

function BadgeCobro({ estado }) {
    const e = { pendiente: ['#fef9c3', '#854d0e'], parcial: ['#dbeafe', '#1e40af'], pagado: ['#dcfce7', '#166534'] }
    const [bg, color] = e[estado] || e.pendiente
    return <span style={{ backgroundColor: bg, color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{estado}</span>
}