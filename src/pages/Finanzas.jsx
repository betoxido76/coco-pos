import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X, Check, Trash2 } from 'lucide-react'

const fmt = n => `$${Number(n || 0).toFixed(2)}`
const fmtBs = n => `${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`

const OPCIONES_TASA = [
    { key: 'tasa_bcv', label: 'USD · BCV' },
    { key: 'tasa_euro', label: 'EUR · BCV' },
    { key: 'tasa_binance', label: 'USD · Binance' },
]
const METODOS_PAGO = ['Efectivo USD', 'Efectivo Bs.', 'Zelle', 'Transferencia', 'Pago Móvil', 'Punto de Venta', 'Otro']

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

function equivUsd(monto_usd, monto_bs, tasa_cambio) {
    return Number(monto_usd || 0) + Number(monto_bs || 0) / (Number(tasa_cambio) || 1)
}

function semaforo(fechaVenc) {
    if (!fechaVenc) return null
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const venc = new Date(fechaVenc + 'T00:00:00')
    const dias = Math.ceil((venc - hoy) / 86400000)
    if (dias < 0) return { color: '#ef4444', label: `Vencido hace ${Math.abs(dias)}d`, dot: '🔴' }
    if (dias <= 3) return { color: '#d97706', label: `Vence en ${dias}d`, dot: '🟡' }
    return { color: '#16a34a', label: `Vence en ${dias}d`, dot: '🟢' }
}

function BadgeOrigen({ origen }) {
    const map = {
        cobro:      { bg: '#dcfce7', color: '#166534', label: 'Cobro venta' },
        cxc:        { bg: '#dbeafe', color: '#1e40af', label: 'CXC pendiente' },
        gasto:      { bg: '#fef9c3', color: '#854d0e', label: 'Gasto' },
        gasto_prog: { bg: '#fef3c7', color: '#92400e', label: 'Gasto prog.' },
        proveedor:  { bg: '#fce7f3', color: '#9d174d', label: 'Pago proveedor' },
        cxp:        { bg: '#fee2e2', color: '#991b1b', label: 'CXP pendiente' },
        manual:     { bg: '#f3f4f6', color: '#374151', label: 'Manual' },
    }
    const s = map[origen] || map.manual
    return (
        <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {s.label}
        </span>
    )
}

const hoyStr = () => new Date().toISOString().split('T')[0]
const primerDiaMes = () => {
    const h = new Date()
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Finanzas() {
    const { perfil } = useAuth()
    const [tab, setTab] = useState('resumen')

    const [cobros, setCobros] = useState([])
    const [cxcPendiente, setCxcPendiente] = useState([])
    const [gastosPagados, setGastosPagados] = useState([])
    const [gastosPendientes, setGastosPendientes] = useState([])
    const [pagosGasto, setPagosGasto] = useState([]) // abonos a gastos (motor `pagos`)
    const [pagosProveedor, setPagosProveedor] = useState([])
    const [cxpPendiente, setCxpPendiente] = useState([])
    const [movManuales, setMovManuales] = useState([])
    const [tasas, setTasas] = useState({ tasa_bcv: 1, tasa_euro: 1, tasa_binance: 1 })
    const [loading, setLoading] = useState(true)
    const [modalManual, setModalManual] = useState(false)

    const [filtroDesde, setFiltroDesde] = useState(primerDiaMes)
    const [filtroHasta, setFiltroHasta] = useState(hoyStr)

    useEffect(() => { cargarTodo() }, [filtroDesde, filtroHasta])

    async function cargarTodo() {
        setLoading(true)
        const desde = filtroDesde || '2000-01-01'
        const hasta = filtroHasta || '2099-12-31'

        const [
            { data: d1 }, { data: d2 }, { data: d3 }, { data: d4 },
            { data: d5 }, { data: d6 }, { data: d7 }, { data: cfg },
            { data: dPagos },
        ] = await Promise.all([
            supabase.from('cobros')
                .select('*, ventas(numero_factura, clientes(nombre))')
                .eq('empresa_id', perfil.empresa_id)
                .gte('created_at', desde + 'T00:00:00')
                .lte('created_at', hasta + 'T23:59:59'),

            supabase.from('ventas')
                .select('id, numero_factura, total, fecha_vencimiento_pago, estado_cobro, clientes(nombre)')
                .eq('empresa_id', perfil.empresa_id)
                .in('estado_cobro', ['pendiente', 'parcial']),

            supabase.from('gastos')
                .select('*, tipos_gastos(nombre)')
                .eq('empresa_id', perfil.empresa_id)
                .eq('estado', 'pagado')
                .gte('fecha', desde)
                .lte('fecha', hasta),

            supabase.from('gastos')
                .select('*, tipos_gastos(nombre)')
                .eq('empresa_id', perfil.empresa_id)
                .in('estado', ['pendiente', 'parcial']),

            supabase.from('pagos_proveedor')
                .select('*, compras(proveedores(nombre))')
                .eq('empresa_id', perfil.empresa_id)
                .gte('created_at', desde + 'T00:00:00')
                .lte('created_at', hasta + 'T23:59:59'),

            supabase.from('compras')
                .select('id, total, fecha_vencimiento_pago, estado_cobro, proveedores(nombre)')
                .eq('empresa_id', perfil.empresa_id)
                .eq('condicion_pago', 'credito')
                .in('estado_cobro', ['pendiente', 'parcial']),

            supabase.from('movimientos_financieros')
                .select('*')
                .eq('empresa_id', perfil.empresa_id)
                .order('fecha', { ascending: false }),

            supabase.from('configuracion')
                .select('clave, valor')
                .eq('empresa_id', perfil.empresa_id),

            // Abonos a gastos (motor `pagos`) — sin filtro de período: se usan para
            // caja realizada (filtrando por fecha en JS) y para el saldo de parciales.
            supabase.from('pagos')
                .select('origen_id, fecha, monto_usd, monto_bs, tasa_cambio, tipo_tasa, metodo_usd')
                .eq('empresa_id', perfil.empresa_id)
                .eq('origen_tipo', 'gasto'),
        ])

        setCobros(d1 || [])
        setCxcPendiente(d2 || [])
        setGastosPagados(d3 || [])
        setGastosPendientes(d4 || [])
        setPagosProveedor(d5 || [])
        setCxpPendiente(d6 || [])
        setMovManuales(d7 || [])
        setPagosGasto(dPagos || [])
        if (cfg) { const t = {}; cfg.forEach(r => { t[r.clave] = Number(r.valor) }); setTasas(t) }
        setLoading(false)
    }

    // ── Normalización ──────────────────────────────────────────
    const ingresosRealizados = [
        ...cobros.map(c => ({
            id: c.id, origen: 'cobro',
            fecha: c.created_at?.split('T')[0],
            descripcion: [c.ventas?.numero_factura, c.ventas?.clientes?.nombre].filter(Boolean).join(' — '),
            monto_usd: c.monto_usd, monto_bs: c.monto_bs,
            tasa_cambio: c.tasa_cambio, tipo_tasa: c.tipo_tasa,
            metodo: [c.metodo_usd, c.metodo_bs].filter(Boolean).join(' / '),
        })),
        ...movManuales.filter(m => m.tipo === 'ingreso' && (m.estado || 'pagado') === 'pagado'
            && m.fecha >= (filtroDesde || '2000-01-01') && m.fecha <= (filtroHasta || '2099-12-31'))
            .map(m => ({
                id: m.id, origen: 'manual',
                fecha: m.fecha,
                descripcion: m.concepto + (m.descripcion ? ` — ${m.descripcion}` : ''),
                monto_usd: m.monto_usd, monto_bs: m.monto_bs,
                tasa_cambio: m.tasa_cambio, tipo_tasa: m.tipo_tasa, metodo: null,
            })),
    ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

    const ingresosProgramados = [
        ...cxcPendiente.map(v => ({
            id: v.id, origen: 'cxc',
            fecha: v.fecha_vencimiento_pago,
            descripcion: `${v.numero_factura} — ${v.clientes?.nombre || '—'}`,
            monto_usd: v.total, monto_bs: 0,
            tasa_cambio: 1, tipo_tasa: null, metodo: null,
            fecha_vencimiento: v.fecha_vencimiento_pago,
        })),
        ...movManuales.filter(m => m.tipo === 'ingreso' && (m.estado || 'pagado') === 'pendiente')
            .map(m => ({
                id: m.id, origen: 'manual',
                fecha: m.fecha,
                descripcion: m.concepto + (m.descripcion ? ` — ${m.descripcion}` : ''),
                monto_usd: m.monto_usd, monto_bs: m.monto_bs,
                tasa_cambio: m.tasa_cambio, tipo_tasa: m.tipo_tasa, metodo: null,
                fecha_vencimiento: m.fecha_vencimiento,
            })),
    ].sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999'))

    // Gastos que tienen abonos en el motor `pagos` (programados): su caja realizada
    // sale de `pagos`, NO de la fila del gasto — evita doble conteo.
    const gastoIdsConAbono = new Set(pagosGasto.map(p => p.origen_id))
    const enPeriodo = f => f && f >= (filtroDesde || '2000-01-01') && f <= (filtroHasta || '2099-12-31')
    const pagadoPorGastoFin = {}
    pagosGasto.forEach(p => {
        pagadoPorGastoFin[p.origen_id] = (pagadoPorGastoFin[p.origen_id] || 0)
            + Number(p.monto_usd || 0) + Number(p.monto_bs || 0) / (Number(p.tasa_cambio) || 1)
    })

    const egresosRealizados = [
        // Gastos de contado: 'pagado' sin abonos registrados en `pagos`
        ...gastosPagados.filter(g => !gastoIdsConAbono.has(g.id)).map(g => ({
            id: g.id, origen: 'gasto',
            fecha: g.fecha,
            descripcion: `${g.nombre} — ${g.tipos_gastos?.nombre || '—'}`,
            monto_usd: g.monto_usd, monto_bs: g.monto_bs,
            tasa_cambio: g.tasa_cambio, tipo_tasa: g.tipo_tasa,
            metodo: g.metodo_pago,
        })),
        // Abonos a gastos programados/parciales, dentro del período
        ...pagosGasto.filter(p => enPeriodo(p.fecha)).map(p => ({
            id: `pago-${p.origen_id}-${p.fecha}-${p.monto_usd}-${p.monto_bs}`, origen: 'gasto',
            fecha: p.fecha,
            descripcion: 'Abono a gasto',
            monto_usd: p.monto_usd, monto_bs: p.monto_bs,
            tasa_cambio: p.tasa_cambio, tipo_tasa: p.tipo_tasa,
            metodo: p.metodo_usd,
        })),
        ...pagosProveedor.map(p => ({
            id: p.id, origen: 'proveedor',
            fecha: p.created_at?.split('T')[0],
            descripcion: `Pago a: ${p.compras?.proveedores?.nombre || '—'}`,
            monto_usd: p.monto_usd, monto_bs: p.monto_bs,
            tasa_cambio: p.tasa_cambio, tipo_tasa: p.tipo_tasa,
            metodo: [p.metodo_usd, p.metodo_bs].filter(Boolean).join(' / '),
        })),
        ...movManuales.filter(m => m.tipo === 'egreso' && (m.estado || 'pagado') === 'pagado'
            && m.fecha >= (filtroDesde || '2000-01-01') && m.fecha <= (filtroHasta || '2099-12-31'))
            .map(m => ({
                id: m.id, origen: 'manual',
                fecha: m.fecha,
                descripcion: m.concepto + (m.descripcion ? ` — ${m.descripcion}` : ''),
                monto_usd: m.monto_usd, monto_bs: m.monto_bs,
                tasa_cambio: m.tasa_cambio, tipo_tasa: m.tipo_tasa, metodo: null,
            })),
    ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

    const egresosProgramados = [
        ...gastosPendientes.map(g => {
            const total = Number(g.monto || 0) > 0
                ? Number(g.monto)
                : Number(g.monto_usd || 0) + Number(g.monto_bs || 0) / (tasas[g.tipo_tasa] || tasas.tasa_bcv || 1)
            const saldo = Math.max(0, total - (pagadoPorGastoFin[g.id] || 0))
            return {
                id: g.id, origen: 'gasto_prog',
                fecha: g.fecha,
                descripcion: `${g.nombre} — ${g.tipos_gastos?.nombre || '—'}`
                    + (g.estado === 'parcial' ? ' (saldo)' : ''),
                monto_usd: saldo, monto_bs: 0,
                tasa_cambio: 1, tipo_tasa: null, metodo: null,
                fecha_vencimiento: g.fecha_vencimiento,
            }
        }),
        ...cxpPendiente.map(c => ({
            id: c.id, origen: 'cxp',
            fecha: c.fecha_vencimiento_pago,
            descripcion: `Compra a: ${c.proveedores?.nombre || '—'}`,
            monto_usd: c.total, monto_bs: 0,
            tasa_cambio: 1, tipo_tasa: null, metodo: null,
            fecha_vencimiento: c.fecha_vencimiento_pago,
        })),
        ...movManuales.filter(m => m.tipo === 'egreso' && (m.estado || 'pagado') === 'pendiente')
            .map(m => ({
                id: m.id, origen: 'manual',
                fecha: m.fecha,
                descripcion: m.concepto + (m.descripcion ? ` — ${m.descripcion}` : ''),
                monto_usd: m.monto_usd, monto_bs: m.monto_bs,
                tasa_cambio: m.tasa_cambio, tipo_tasa: m.tipo_tasa, metodo: null,
                fecha_vencimiento: m.fecha_vencimiento,
            })),
    ].sort((a, b) => (a.fecha_vencimiento || '9999').localeCompare(b.fecha_vencimiento || '9999'))

    // ── Totales ────────────────────────────────────────────────
    const totalIngReal  = ingresosRealizados.reduce((s, i) => s + equivUsd(i.monto_usd, i.monto_bs, i.tasa_cambio), 0)
    const totalEgrReal  = egresosRealizados.reduce((s, i) => s + equivUsd(i.monto_usd, i.monto_bs, i.tasa_cambio), 0)
    const totalIngProg  = ingresosProgramados.reduce((s, i) => s + equivUsd(i.monto_usd, i.monto_bs, i.tasa_cambio), 0)
    const totalEgrProg  = egresosProgramados.reduce((s, i) => s + equivUsd(i.monto_usd, i.monto_bs, i.tasa_cambio), 0)

    const ingUsd = ingresosRealizados.reduce((s, i) => s + Number(i.monto_usd || 0), 0)
    const ingBs  = ingresosRealizados.reduce((s, i) => s + Number(i.monto_bs  || 0), 0)
    const egrUsd = egresosRealizados.reduce((s,  i) => s + Number(i.monto_usd || 0), 0)
    const egrBs  = egresosRealizados.reduce((s,  i) => s + Number(i.monto_bs  || 0), 0)

    return (
        <div style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Finanzas</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Flujo consolidado de ingresos y egresos</p>
                </div>
                <button onClick={() => setModalManual(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Movimiento manual
                </button>
            </div>

            {/* Filtro de período */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', flexWrap: 'wrap', backgroundColor: '#f9fafb', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>Período realizados:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>Desde</span>
                    <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
                        style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>Hasta</span>
                    <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
                        style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }} />
                </div>
                <button onClick={() => { setFiltroDesde(primerDiaMes()); setFiltroHasta(hoyStr()) }}
                    style={{ padding: '6px 12px', borderRadius: '7px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontSize: '12px', cursor: 'pointer' }}>
                    Este mes
                </button>
                <span style={{ fontSize: '12px', color: '#9ca3af', fontStyle: 'italic', marginLeft: '4px' }}>
                    · Programados siempre muestran el total vigente
                </span>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'resumen',   label: 'Resumen' },
                    { key: 'ingresos',  label: `Ingresos` },
                    { key: 'egresos',   label: `Egresos` },
                    { key: 'manual',    label: `Manuales (${movManuales.length})` },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: tab === t.key ? '#16a34a' : '#e5e7eb',
                            backgroundColor: tab === t.key ? '#f0fdf4' : '#fff',
                            color: tab === t.key ? '#16a34a' : '#6b7280',
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>
            ) : (
                <>
                    {tab === 'resumen' && (
                        <ResumenTab
                            totalIngReal={totalIngReal} totalEgrReal={totalEgrReal}
                            totalIngProg={totalIngProg} totalEgrProg={totalEgrProg}
                            ingUsd={ingUsd} ingBs={ingBs} egrUsd={egrUsd} egrBs={egrBs}
                            tasas={tasas}
                        />
                    )}
                    {tab === 'ingresos' && (
                        <MovimientosTab
                            realizados={ingresosRealizados}
                            programados={ingresosProgramados}
                            colorReal="#16a34a"
                        />
                    )}
                    {tab === 'egresos' && (
                        <MovimientosTab
                            realizados={egresosRealizados}
                            programados={egresosProgramados}
                            colorReal="#dc2626"
                        />
                    )}
                    {tab === 'manual' && (
                        <ManualTab
                            movimientos={movManuales}
                            onNuevo={() => setModalManual(true)}
                            onActualizado={cargarTodo}
                        />
                    )}
                </>
            )}

            {modalManual && (
                <ModalMovimiento
                    tasas={tasas}
                    onGuardado={() => { setModalManual(false); cargarTodo() }}
                    onCerrar={() => setModalManual(false)}
                />
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// TAB RESUMEN
// ══════════════════════════════════════════════════════════════
function ResumenTab({ totalIngReal, totalEgrReal, totalIngProg, totalEgrProg, ingUsd, ingBs, egrUsd, egrBs, tasas }) {
    const balanceReal = totalIngReal - totalEgrReal
    const balanceProy = balanceReal + totalIngProg - totalEgrProg

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Período realizado */}
            <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>En el período seleccionado</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    {[
                        { label: 'Ingresos realizados', valor: fmt(totalIngReal), color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
                        { label: 'Egresos realizados',  valor: fmt(totalEgrReal), color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                        { label: 'Balance neto',        valor: fmt(balanceReal),  color: balanceReal >= 0 ? '#1d4ed8' : '#dc2626', bg: '#eff6ff', border: '#bfdbfe' },
                    ].map(k => (
                        <div key={k.label} style={{ backgroundColor: k.bg, borderRadius: '12px', border: `1px solid ${k.border}`, padding: '16px 20px' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 6px' }}>{k.label}</p>
                            <p style={{ fontSize: '22px', fontWeight: 700, color: k.color, margin: 0 }}>{k.valor}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Proyección */}
            <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Posición total (incl. pendientes)</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
                    {[
                        { label: 'Por cobrar (CXC)',    valor: fmt(totalIngProg), color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
                        { label: 'Por pagar (gastos + CXP)', valor: fmt(totalEgrProg), color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
                        { label: 'Balance proyectado',  valor: fmt(balanceProy),  color: balanceProy >= 0 ? '#166534' : '#991b1b', bg: '#f9fafb', border: '#e5e7eb' },
                    ].map(k => (
                        <div key={k.label} style={{ backgroundColor: k.bg, borderRadius: '12px', border: `1px solid ${k.border}`, padding: '16px 20px' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 6px' }}>{k.label}</p>
                            <p style={{ fontSize: '22px', fontWeight: 700, color: k.color, margin: 0 }}>{k.valor}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Breakdown por moneda */}
            <div>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Desglose por moneda — realizados</p>
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Moneda', 'Ingresos', 'Egresos', 'Neto'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 20px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>🇺🇸 Dólares (USD)</td>
                                <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 600, color: '#16a34a', textAlign: 'right' }}>{fmt(ingUsd)}</td>
                                <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 600, color: '#dc2626', textAlign: 'right' }}>{fmt(egrUsd)}</td>
                                <td style={{ padding: '12px 20px', fontSize: '14px', fontWeight: 700, color: ingUsd - egrUsd >= 0 ? '#1d4ed8' : '#dc2626', textAlign: 'right' }}>{fmt(ingUsd - egrUsd)}</td>
                            </tr>
                            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 600, color: '#374151' }}>🇻🇪 Bolívares (Bs.)</td>
                                <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 600, color: '#16a34a', textAlign: 'right' }}>{fmtBs(ingBs)}</td>
                                <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 600, color: '#dc2626', textAlign: 'right' }}>{fmtBs(egrBs)}</td>
                                <td style={{ padding: '12px 20px', fontSize: '14px', fontWeight: 700, color: ingBs - egrBs >= 0 ? '#1d4ed8' : '#dc2626', textAlign: 'right' }}>{fmtBs(ingBs - egrBs)}</td>
                            </tr>
                            <tr style={{ backgroundColor: '#f9fafb' }}>
                                <td style={{ padding: '12px 20px', fontSize: '13px', fontWeight: 700, color: '#1f2937' }}>Equivalente USD total</td>
                                <td style={{ padding: '12px 20px', fontSize: '14px', fontWeight: 700, color: '#16a34a', textAlign: 'right' }}>{fmt(totalIngReal)}</td>
                                <td style={{ padding: '12px 20px', fontSize: '14px', fontWeight: 700, color: '#dc2626', textAlign: 'right' }}>{fmt(totalEgrReal)}</td>
                                <td style={{ padding: '12px 20px', fontSize: '15px', fontWeight: 700, color: totalIngReal - totalEgrReal >= 0 ? '#1d4ed8' : '#dc2626', textAlign: 'right' }}>{fmt(totalIngReal - totalEgrReal)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                {tasas.tasa_bcv > 1 && (
                    <p style={{ fontSize: '11px', color: '#9ca3af', margin: '6px 0 0 4px' }}>
                        Tasa BCV usada para equivalencias: {tasas.tasa_bcv.toLocaleString('es-VE')} Bs./USD
                    </p>
                )}
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// TAB MOVIMIENTOS (Ingresos o Egresos)
// ══════════════════════════════════════════════════════════════
function MovimientosTab({ realizados, programados, colorReal }) {
    const [subtab, setSubtab] = useState('realizados')
    const lista = subtab === 'realizados' ? realizados : programados

    const total = lista.reduce((s, i) => s + equivUsd(i.monto_usd, i.monto_bs, i.tasa_cambio), 0)

    return (
        <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {[
                    { key: 'realizados', label: `Realizados (${realizados.length})` },
                    { key: 'programados', label: `Programados (${programados.length})` },
                ].map(t => (
                    <button key={t.key} onClick={() => setSubtab(t.key)}
                        style={{
                            padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: subtab === t.key ? '#6366f1' : '#e5e7eb',
                            backgroundColor: subtab === t.key ? '#eef2ff' : '#fff',
                            color: subtab === t.key ? '#4f46e5' : '#6b7280',
                        }}>
                        {t.label}
                    </button>
                ))}
                <span style={{ marginLeft: 'auto', fontSize: '14px', fontWeight: 700, color: colorReal, alignSelf: 'center' }}>
                    Total: {fmt(total)}
                </span>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {lista.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                        No hay movimientos en esta sección
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['', 'Fecha', 'Origen', 'Descripción', 'USD', 'Bs.', subtab === 'programados' ? 'Vencimiento' : 'Método', 'Equiv. USD'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lista.map((item, idx) => {
                                const sem = subtab === 'programados' ? semaforo(item.fecha_vencimiento) : null
                                return (
                                    <tr key={item.id || idx}
                                        style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '11px 8px 11px 14px', fontSize: '15px' }}>
                                            {sem?.dot || ''}
                                        </td>
                                        <td style={{ padding: '11px 14px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                            {item.fecha ? new Date(item.fecha + 'T00:00:00').toLocaleDateString('es-VE') : '—'}
                                        </td>
                                        <td style={{ padding: '11px 14px' }}>
                                            <BadgeOrigen origen={item.origen} />
                                        </td>
                                        <td style={{ padding: '11px 14px', fontSize: '13px', color: '#1f2937', maxWidth: '260px' }}>
                                            {item.descripcion}
                                        </td>
                                        <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 600, color: colorReal, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {Number(item.monto_usd) > 0 ? fmt(item.monto_usd) : '—'}
                                        </td>
                                        <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 600, color: '#d97706', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {Number(item.monto_bs) > 0 ? fmtBs(item.monto_bs) : '—'}
                                        </td>
                                        <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                                            {subtab === 'programados'
                                                ? sem
                                                    ? <span style={{ fontSize: '12px', fontWeight: 500, color: sem.color }}>{sem.label}</span>
                                                    : <span style={{ fontSize: '12px', color: '#9ca3af' }}>Sin fecha</span>
                                                : <span style={{ fontSize: '12px', color: '#6b7280' }}>{item.metodo || '—'}</span>
                                            }
                                        </td>
                                        <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 700, color: colorReal, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            {fmt(equivUsd(item.monto_usd, item.monto_bs, item.tasa_cambio))}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// TAB MANUAL
// ══════════════════════════════════════════════════════════════
function ManualTab({ movimientos, onNuevo, onActualizado }) {
    const { perfil } = useAuth()
    const [eliminando, setEliminando] = useState(null)

    async function eliminar(id) {
        setEliminando(id)
        await supabase.from('movimientos_financieros').delete().eq('id', id)
        setEliminando(null)
        onActualizado()
    }

    if (movimientos.length === 0) return (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '48px', textAlign: 'center' }}>
            <p style={{ color: '#9ca3af', fontSize: '14px', margin: '0 0 16px' }}>No hay movimientos manuales registrados</p>
            <button onClick={onNuevo}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                <Plus size={16} /> Agregar el primero
            </button>
        </div>
    )

    return (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        {['Fecha', 'Tipo', 'Estado', 'Concepto', 'USD', 'Bs.', 'Vencimiento', ''].map((h, i) => (
                            <th key={i} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {movimientos.map(m => {
                        const sem = (m.estado || 'pagado') === 'pendiente' ? semaforo(m.fecha_vencimiento) : null
                        return (
                            <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <td style={{ padding: '11px 14px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                    {new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-VE')}
                                </td>
                                <td style={{ padding: '11px 14px' }}>
                                    <span style={{
                                        fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '20px',
                                        backgroundColor: m.tipo === 'ingreso' ? '#dcfce7' : '#fef2f2',
                                        color: m.tipo === 'ingreso' ? '#166534' : '#991b1b',
                                    }}>
                                        {m.tipo === 'ingreso' ? '↑ Ingreso' : '↓ Egreso'}
                                    </span>
                                </td>
                                <td style={{ padding: '11px 14px' }}>
                                    <span style={{
                                        fontSize: '12px', fontWeight: 500, padding: '2px 8px', borderRadius: '20px',
                                        backgroundColor: (m.estado || 'pagado') === 'pagado' ? '#dcfce7' : '#fef3c7',
                                        color: (m.estado || 'pagado') === 'pagado' ? '#166534' : '#92400e',
                                    }}>
                                        {(m.estado || 'pagado') === 'pagado' ? 'Realizado' : 'Programado'}
                                    </span>
                                </td>
                                <td style={{ padding: '11px 14px' }}>
                                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{m.concepto}</div>
                                    {m.descripcion && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{m.descripcion}</div>}
                                </td>
                                <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 600, color: m.tipo === 'ingreso' ? '#16a34a' : '#dc2626' }}>
                                    {Number(m.monto_usd) > 0 ? fmt(m.monto_usd) : '—'}
                                </td>
                                <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 600, color: '#d97706' }}>
                                    {Number(m.monto_bs) > 0 ? fmtBs(m.monto_bs) : '—'}
                                </td>
                                <td style={{ padding: '11px 14px' }}>
                                    {sem
                                        ? <span style={{ fontSize: '12px', fontWeight: 500, color: sem.color }}>{sem.dot} {sem.label}</span>
                                        : <span style={{ fontSize: '12px', color: '#9ca3af' }}>—</span>
                                    }
                                </td>
                                <td style={{ padding: '11px 14px' }}>
                                    <button onClick={() => eliminar(m.id)} disabled={eliminando === m.id}
                                        style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#dc2626', opacity: eliminando === m.id ? 0.5 : 1 }}>
                                        <Trash2 size={13} />
                                    </button>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// MODAL NUEVO MOVIMIENTO MANUAL
// ══════════════════════════════════════════════════════════════
function ModalMovimiento({ tasas, onGuardado, onCerrar }) {
    const { perfil } = useAuth()
    const [tipo, setTipo] = useState('ingreso')
    const [estadoMov, setEstadoMov] = useState('pagado')
    const [concepto, setConcepto] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [fecha, setFecha] = useState(hoyStr())
    const [fechaVencimiento, setFechaVencimiento] = useState('')
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [montoUsd, setMontoUsd] = useState('')
    const [montoBs, setMontoBs] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    const tasa = tasas[tipoTasa] || 1
    const totalEnUsd = Number(montoUsd || 0) + (Number(montoBs || 0) / tasa)

    async function guardar() {
        if (!concepto.trim()) { setError('El concepto es obligatorio'); return }
        if (estadoMov === 'pagado' && Number(montoUsd) <= 0 && Number(montoBs) <= 0) {
            setError('Ingresa al menos un monto'); return
        }
        if (estadoMov === 'pendiente' && !fechaVencimiento) {
            setError('Ingresa la fecha de vencimiento'); return
        }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()
        const { error: err } = await supabase.from('movimientos_financieros').insert({
            empresa_id: perfil.empresa_id,
            tipo, concepto: concepto.trim(),
            descripcion: descripcion.trim() || null,
            fecha, fecha_vencimiento: estadoMov === 'pendiente' ? fechaVencimiento : null,
            estado: estadoMov,
            monto_usd: Number(montoUsd || 0),
            monto_bs: Number(montoBs || 0),
            tipo_tasa: tipoTasa, tasa_cambio: tasa,
            usuario_id: user.id,
        })

        if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        onGuardado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '500px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Movimiento manual</h3>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={18} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Tipo ingreso/egreso */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {[
                            { val: 'ingreso', label: '↑ Ingreso', bg: '#dcfce7', border: '#16a34a', color: '#166534' },
                            { val: 'egreso',  label: '↓ Egreso',  bg: '#fef2f2', border: '#dc2626', color: '#991b1b' },
                        ].map(opt => (
                            <button key={opt.val} onClick={() => setTipo(opt.val)}
                                style={{
                                    flex: 1, padding: '10px', borderRadius: '9px', fontSize: '14px', fontWeight: 600,
                                    border: `2px solid ${tipo === opt.val ? opt.border : '#e5e7eb'}`,
                                    backgroundColor: tipo === opt.val ? opt.bg : '#fff',
                                    color: tipo === opt.val ? opt.color : '#6b7280', cursor: 'pointer',
                                }}>
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    {/* Estado realizado/programado */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {[
                            { val: 'pagado',   label: '✅ Realizado',   sub: 'Ya ocurrido' },
                            { val: 'pendiente', label: '📅 Programado', sub: 'Fecha futura' },
                        ].map(opt => (
                            <button key={opt.val} onClick={() => setEstadoMov(opt.val)}
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: '9px', textAlign: 'left',
                                    border: `2px solid ${estadoMov === opt.val ? '#6366f1' : '#e5e7eb'}`,
                                    backgroundColor: estadoMov === opt.val ? '#eef2ff' : '#fff', cursor: 'pointer',
                                }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: estadoMov === opt.val ? '#4f46e5' : '#374151' }}>{opt.label}</div>
                                <div style={{ fontSize: '11px', color: '#9ca3af' }}>{opt.sub}</div>
                            </button>
                        ))}
                    </div>

                    {/* Concepto */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Concepto *</label>
                        <input value={concepto} onChange={e => setConcepto(e.target.value)}
                            placeholder="Ej: Capital inicial, Préstamo bancario, Retiro socio..." style={inputStyle} autoFocus />
                    </div>

                    {/* Fecha */}
                    <div style={{ display: 'grid', gridTemplateColumns: estadoMov === 'pendiente' ? '1fr 1fr' : '1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>
                                {estadoMov === 'pendiente' ? 'Fecha de registro' : 'Fecha'}
                            </label>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
                        </div>
                        {estadoMov === 'pendiente' && (
                            <div>
                                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Fecha de vencimiento *</label>
                                <input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} style={inputStyle} />
                            </div>
                        )}
                    </div>

                    {/* Tasa */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Tasa de referencia</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {OPCIONES_TASA.map(o => (
                                <button key={o.key} onClick={() => setTipoTasa(o.key)}
                                    style={{
                                        flex: 1, padding: '6px 8px', borderRadius: '7px', fontSize: '11px', fontWeight: 500,
                                        border: '1px solid', cursor: 'pointer',
                                        borderColor: tipoTasa === o.key ? '#16a34a' : '#e5e7eb',
                                        backgroundColor: tipoTasa === o.key ? '#f0fdf4' : '#fff',
                                        color: tipoTasa === o.key ? '#16a34a' : '#6b7280',
                                    }}>
                                    {o.label}
                                    <span style={{ display: 'block', fontSize: '10px', opacity: 0.7 }}>{(tasas[o.key] || 0).toLocaleString('es-VE')}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Montos */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>
                                Monto USD {estadoMov === 'pendiente' && <span style={{ color: '#9ca3af', fontWeight: 400 }}>(estim.)</span>}
                            </label>
                            <input type="number" min="0" step="0.01" value={montoUsd} onChange={e => setMontoUsd(e.target.value)} placeholder="0.00" style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>
                                Monto Bs. {estadoMov === 'pendiente' && <span style={{ color: '#9ca3af', fontWeight: 400 }}>(estim.)</span>}
                            </label>
                            <input type="number" min="0" step="1" value={montoBs} onChange={e => setMontoBs(e.target.value)} placeholder="0.00" style={inputStyle} />
                        </div>
                    </div>

                    {(Number(montoUsd) > 0 || Number(montoBs) > 0) && (
                        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', fontWeight: 600 }}>
                            Equivalente: {fmt(totalEnUsd)}
                        </div>
                    )}

                    {/* Descripción */}
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>
                            Descripción <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                        </label>
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
                            placeholder="Notas adicionales..."
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                    </div>

                    {error && (
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={guardar} disabled={guardando}
                            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                            <Check size={16} /> {guardando ? 'Guardando...' : 'Guardar movimiento'}
                        </button>
                        <button onClick={onCerrar}
                            style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}
