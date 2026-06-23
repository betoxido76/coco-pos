import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { X, DollarSign, CheckSquare, FileText } from 'lucide-react'

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

const PAGE_SIZE = 50

export default function CuentasCobrar() {
    const { perfil } = useAuth()
    const [ventas, setVentas] = useState([])
    const [kpiData, setKpiData] = useState([])
    const [loading, setLoading] = useState(true)
    const [filtro, setFiltro] = useState('pendiente')
    const [modalVenta, setModalVenta] = useState(null)       // cobro individual
    const [modalMultiple, setModalMultiple] = useState(false) // cobro múltiple
    const [tasas, setTasas] = useState({ tasa_bcv: 1, tasa_euro: 1, tasa_binance: 1 })
    const [clientes, setClientes] = useState([])
    const [filtroCliente, setFiltroCliente] = useState('')
    const [seleccionadas, setSeleccionadas] = useState([]) // ids seleccionados
    const [pagina, setPagina] = useState(0)
    const [totalRegistros, setTotalRegistros] = useState(0)
    const [vista, setVista] = useState('cxc')
    const [ncs, setNcs] = useState([])
    const [loadingNcs, setLoadingNcs] = useState(false)
    const [filtroNcEstado, setFiltroNcEstado] = useState('todas')
    const [modalNc, setModalNc] = useState(null)
    const [modalLiquidar, setModalLiquidar] = useState(null)

    useEffect(() => { setPagina(0) }, [filtro, filtroCliente])
    useEffect(() => { cargar() }, [filtro, filtroCliente, pagina])
    // Limpiar selección al cambiar filtro
    useEffect(() => { setSeleccionadas([]) }, [filtro, filtroCliente])

    useEffect(() => {
        supabase.from('clientes').select('id, nombre')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setClientes(data || []))
    }, [])

    async function cargar() {
        setLoading(true)
        const estados = filtro === 'todos' ? ['pendiente', 'parcial', 'pagado'] : [filtro]

        let kpiQ = supabase
            .from('ventas')
            .select('total, estado_cobro, fecha_vencimiento_pago, cliente_id')
            .eq('empresa_id', perfil.empresa_id)
            .in('estado_cobro', estados)
        if (filtroCliente) kpiQ = kpiQ.eq('cliente_id', filtroCliente)

        let tablaQ = supabase
            .from('ventas')
            .select('*, clientes(nombre, condicion_pago, dias_credito)', { count: 'exact' })
            .eq('empresa_id', perfil.empresa_id)
            .in('estado_cobro', estados)
            .order('fecha_vencimiento_pago', { ascending: true })
            .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1)
        if (filtroCliente) tablaQ = tablaQ.eq('cliente_id', filtroCliente)

        const [{ data: kpi }, { data, count }, { data: cfg }] = await Promise.all([
            kpiQ,
            tablaQ,
            supabase.from('configuracion').select('clave, valor'),
        ])

        if (kpi) setKpiData(kpi)
        if (data) setVentas(data)
        if (count !== null) setTotalRegistros(count)
        if (cfg) {
            const m = {}; cfg.forEach(r => { m[r.clave] = Number(r.valor) })
            setTasas({ tasa_bcv: m.tasa_bcv || 1, tasa_euro: m.tasa_euro || 1, tasa_binance: m.tasa_binance || 1 })
        }
        setLoading(false)
    }

    async function cargarNcs() {
        setLoadingNcs(true)
        let q = supabase.from('devoluciones')
            .select('id, numero_nc, monto_devuelto, estado_nc, tipo_devolucion, motivo, created_at, cliente_id, venta_id, nota_liquidacion, fecha_liquidacion, clientes(nombre), ventas(numero_factura)')
            .eq('empresa_id', perfil.empresa_id)
            .not('numero_nc', 'is', null)
            .order('created_at', { ascending: false })
        if (filtroNcEstado === 'liquidada') q = q.in('estado_nc', ['reembolsada', 'anulada'])
        else if (filtroNcEstado !== 'todas') q = q.eq('estado_nc', filtroNcEstado)
        const { data } = await q
        setNcs(data || [])
        setLoadingNcs(false)
    }
    useEffect(() => { if (vista === 'nc') cargarNcs() }, [vista, filtroNcEstado])

    // Lógica de selección múltiple
    const ventasSeleccionables = ventas.filter(v => v.estado_cobro !== 'pagado')
    const clienteSeleccionado = seleccionadas.length > 0
        ? ventas.find(v => v.id === seleccionadas[0])?.cliente_id
        : null
    const ventasSeleccionadasObj = ventas.filter(v => seleccionadas.includes(v.id))
    const totalSeleccionado = ventasSeleccionadasObj.reduce((s, v) => s + (v.total || 0), 0)

    function toggleSeleccion(venta) {
        if (venta.estado_cobro === 'pagado') return
        setSeleccionadas(prev => {
            if (prev.includes(venta.id)) return prev.filter(id => id !== venta.id)
            // Solo del mismo cliente
            if (clienteSeleccionado && venta.cliente_id !== clienteSeleccionado) return prev
            return [...prev, venta.id]
        })
    }

    const totalPendiente = kpiData
        .filter(v => v.estado_cobro !== 'pagado')
        .reduce((s, v) => s + (v.total || 0), 0)

    const mostrarCheckboxes = filtro === 'pendiente' || filtro === 'parcial'

    return (
        <div style={{ padding: '24px' }}>
            {/* Header con tabs de vista */}
            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Cuentas por cobrar</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                        {vista === 'cxc' ? 'Seguimiento de facturas a crédito' : 'Historial de notas de crédito emitidas'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f3f4f6', borderRadius: '10px', padding: '4px' }}>
                    {[['cxc', 'Facturas CxC'], ['nc', 'Notas de Crédito']].map(([v, lbl]) => (
                        <button key={v} onClick={() => setVista(v)}
                            style={{ padding: '7px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.15s', backgroundColor: vista === v ? '#fff' : 'transparent', color: vista === v ? '#1f2937' : '#6b7280', boxShadow: vista === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                            {lbl}
                        </button>
                    ))}
                </div>
            </div>

            {/* ─── Vista CxC ─── */}
            {vista === 'cxc' && (<>
                {/* KPI */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                    {[
                        { label: 'Total pendiente', valor: fmt(totalPendiente), sub: fmtBs(totalPendiente * tasas.tasa_bcv), color: '#1f2937' },
                        { label: 'Facturas vencidas', valor: kpiData.filter(v => v.fecha_vencimiento_pago && new Date(v.fecha_vencimiento_pago) < new Date() && v.estado_cobro !== 'pagado').length, sub: 'requieren atención', color: '#ef4444' },
                        { label: 'Facturas al día', valor: kpiData.filter(v => v.estado_cobro !== 'pagado' && (!v.fecha_vencimiento_pago || new Date(v.fecha_vencimiento_pago) >= new Date())).length, sub: 'dentro del plazo', color: '#16a34a' },
                    ].map(k => (
                        <div key={k.label} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{k.label}</p>
                            <p style={{ fontSize: '22px', fontWeight: 700, color: k.color, margin: 0 }}>{k.valor}</p>
                            <p style={{ fontSize: '12px', color: '#9ca3af', margin: '2px 0 0' }}>{k.sub}</p>
                        </div>
                    ))}
                </div>

                {/* Filtros */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {[['pendiente', 'Pendientes'], ['parcial', 'Parciales'], ['pagado', 'Pagadas'], ['todos', 'Todas']].map(([val, lbl]) => (
                        <button key={val} onClick={() => setFiltro(val)}
                            style={{ padding: '7px 16px', borderRadius: '8px', fontSize: '13px', border: '1px solid', cursor: 'pointer', borderColor: filtro === val ? '#16a34a' : '#e5e7eb', backgroundColor: filtro === val ? '#16a34a' : '#fff', color: filtro === val ? '#fff' : '#6b7280' }}>
                            {lbl}
                        </button>
                    ))}
                    <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
                        style={{ padding: '7px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                        <option value="">Todos los clientes</option>
                        {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                </div>

                {/* Barra de cobro múltiple */}
                {seleccionadas.length > 1 && (
                    <div style={{ backgroundColor: '#1d4ed8', borderRadius: '10px', padding: '12px 20px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ color: '#fff' }}>
                            <span style={{ fontWeight: 700, fontSize: '15px' }}>{seleccionadas.length} facturas seleccionadas</span>
                            <span style={{ fontSize: '13px', marginLeft: '12px', opacity: 0.85 }}>
                                {ventasSeleccionadasObj[0]?.clientes?.nombre} · Total: {fmt(totalSeleccionado)}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setSeleccionadas([])}
                                style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid rgba(255,255,255,0.3)', backgroundColor: 'transparent', color: '#fff', cursor: 'pointer' }}>
                                Cancelar
                            </button>
                            <button onClick={() => setModalMultiple(true)}
                                style={{ padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, border: 'none', backgroundColor: '#fff', color: '#1d4ed8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <DollarSign size={14} /> Cobrar {fmt(totalSeleccionado)}
                            </button>
                        </div>
                    </div>
                )}

                {/* Tabla facturas */}
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    {loading ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                        : ventas.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay facturas en este estado</div>
                            : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                            {[mostrarCheckboxes ? '☑' : '', '', 'Factura', 'Cliente', 'Emisión', 'Vencimiento', 'Total', 'Cobrado', 'Saldo', 'Estado', ''].map((h, i) => (
                                                <th key={i} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ventas.map(v => {
                                            const sem = semaforo(v.fecha_vencimiento_pago)
                                            const seleccionada = seleccionadas.includes(v.id)
                                            const deshabilitada = v.estado_cobro === 'pagado' ||
                                                (clienteSeleccionado && v.cliente_id !== clienteSeleccionado && !seleccionada)
                                            return (
                                                <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: seleccionada ? '#eff6ff' : sem?.bg || 'transparent', opacity: deshabilitada && mostrarCheckboxes ? 0.45 : 1, outline: seleccionada ? '2px solid #1d4ed8' : 'none', outlineOffset: '-2px' }}>
                                                    <td style={{ padding: '12px 8px 12px 14px' }}>
                                                        {mostrarCheckboxes && v.estado_cobro !== 'pagado' && (
                                                            <input type="checkbox" checked={seleccionada}
                                                                disabled={deshabilitada && !seleccionada}
                                                                onChange={() => toggleSeleccion(v)}
                                                                style={{ width: '16px', height: '16px', cursor: deshabilitada && !seleccionada ? 'not-allowed' : 'pointer', accentColor: '#1d4ed8' }} />
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '12px 8px 12px 0', fontSize: '18px' }}>{sem?.dot || '⚪'}</td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{v.numero_factura}</td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{v.clientes?.nombre || '—'}</td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>{new Date(v.created_at).toLocaleDateString('es-VE')}</td>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        {sem ? <span style={{ fontSize: '12px', fontWeight: 500, color: sem.color }}>{sem.label}</span>
                                                            : <span style={{ fontSize: '12px', color: '#9ca3af' }}>—</span>}
                                                    </td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{fmt(v.total)}</td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#16a34a' }}><MontoCobrado ventaId={v.id} /></td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#ef4444' }}><SaldoPendiente ventaId={v.id} total={v.total} /></td>
                                                    <td style={{ padding: '12px 14px' }}><BadgeCobro estado={v.estado_cobro} /></td>
                                                    <td style={{ padding: '12px 14px' }}>
                                                        {v.estado_cobro !== 'pagado' && (
                                                            <button onClick={() => setModalVenta(v)}
                                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                                <DollarSign size={12} /> Cobrar
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

                {totalRegistros > PAGE_SIZE && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', marginTop: '8px' }}>
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>
                            Mostrando {pagina * PAGE_SIZE + 1}–{Math.min((pagina + 1) * PAGE_SIZE, totalRegistros)} de {totalRegistros}
                        </span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setPagina(p => p - 1)} disabled={pagina === 0}
                                style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: pagina === 0 ? '#d1d5db' : '#374151', cursor: pagina === 0 ? 'default' : 'pointer' }}>
                                ← Anterior
                            </button>
                            <button onClick={() => setPagina(p => p + 1)} disabled={(pagina + 1) * PAGE_SIZE >= totalRegistros}
                                style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: (pagina + 1) * PAGE_SIZE >= totalRegistros ? '#d1d5db' : '#374151', cursor: (pagina + 1) * PAGE_SIZE >= totalRegistros ? 'default' : 'pointer' }}>
                                Siguiente →
                            </button>
                        </div>
                    </div>
                )}
            </>)}

            {/* ─── Vista NC ─── */}
            {vista === 'nc' && (<>
                {/* Filtro estado */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    {[['todas', 'Todas'], ['pendiente', 'Pendientes'], ['aplicada', 'Aplicadas'], ['liquidada', 'Liquidadas']].map(([val, lbl]) => (
                        <button key={val} onClick={() => setFiltroNcEstado(val)}
                            style={{ padding: '7px 16px', borderRadius: '8px', fontSize: '13px', border: '1px solid', cursor: 'pointer', borderColor: filtroNcEstado === val ? '#d97706' : '#e5e7eb', backgroundColor: filtroNcEstado === val ? '#d97706' : '#fff', color: filtroNcEstado === val ? '#fff' : '#6b7280' }}>
                            {lbl}
                        </button>
                    ))}
                </div>

                {/* Tabla NC */}
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    {loadingNcs ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                        : ncs.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay notas de crédito</div>
                            : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                            {['N° NC', 'Cliente', 'Factura origen', 'Tipo', 'Fecha', 'Monto', 'Estado', ''].map((h, i) => (
                                                <th key={i} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i === 5 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {ncs.map(nc => (
                                            <tr key={nc.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace', fontWeight: 600, color: '#374151' }}>{nc.numero_nc || '—'}</td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: '#1f2937' }}>{nc.clientes?.nombre || '—'}</td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace', color: '#6b7280' }}>{nc.ventas?.numero_factura || '—'}</td>
                                                <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>{nc.tipo_devolucion === 'total' ? 'Total' : 'Parcial'}</td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>{new Date(nc.created_at).toLocaleDateString('es-VE')}</td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 700, color: '#1f2937', textAlign: 'right' }}>{fmt(nc.monto_devuelto)}</td>
                                                <td style={{ padding: '12px 14px' }}><BadgeNC estado={nc.estado_nc} /></td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button onClick={() => setModalNc(nc)}
                                                            style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}>
                                                            Ver
                                                        </button>
                                                        {nc.estado_nc === 'pendiente' && (
                                                            <button onClick={() => setModalLiquidar(nc)}
                                                                style={{ padding: '5px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, border: '1px solid #bfdbfe', backgroundColor: '#eff6ff', color: '#1d4ed8', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                                Liquidar
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                </div>
            </>)}

            {/* Modals */}
            {modalVenta && (
                <ModalCobro venta={modalVenta} tasas={tasas}
                    onCerrar={() => setModalVenta(null)}
                    onCobrado={() => { setModalVenta(null); cargar() }} />
            )}
            {modalMultiple && (
                <ModalCobroMultiple
                    ventas={ventasSeleccionadasObj}
                    tasas={tasas}
                    onCerrar={() => setModalMultiple(false)}
                    onCobrado={() => { setModalMultiple(false); setSeleccionadas([]); cargar() }} />
            )}
            {modalNc && <DetalleNC nc={modalNc} onCerrar={() => setModalNc(null)} />}
            {modalLiquidar && (
                <ModalLiquidarNC nc={modalLiquidar} onCerrar={() => setModalLiquidar(null)}
                    onLiquidado={() => { setModalLiquidar(null); cargarNcs() }} />
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

// ── Modal cobro individual ─────────────────────────────────────
function ModalCobro({ venta, tasas, onCerrar, onCobrado }) {
    const { perfil } = useAuth()
    const OPCIONES_TASA = [
        { key: 'tasa_bcv', label: 'USD · BCV' },
        { key: 'tasa_euro', label: 'EUR · BCV' },
        { key: 'tasa_binance', label: 'USD · Binance' },
    ]
    const METODOS_USD = ['Efectivo', 'Zelle', 'Transferencia USD', 'Otros']
    const METODOS_BS = ['Pago Móvil', 'Transferencia', 'Punto de Venta', 'Efectivo Bs.']

    const [cobradoPrev, setCobradoPrev] = useState(0)
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [pagoUsd, setPagoUsd] = useState(venta.total)
    const [pagoBs, setPagoBs] = useState(0)
    const [metodoUsd, setMetodoUsd] = useState('Efectivo')
    const [metodoBs, setMetodoBs] = useState('Pago Móvil')
    const [nota, setNota] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [cuentasBancarias, setCuentasBancarias] = useState([])
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')
    const [ncsDisponibles, setNcsDisponibles] = useState([])
    const [ncsSeleccionadas, setNcsSeleccionadas] = useState(new Set())

    useEffect(() => {
        if (perfil?.empresa_id) {
            supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda')
                .eq('empresa_id', perfil.empresa_id).eq('activa', true)
                .then(({ data }) => setCuentasBancarias(data || []))
        }
    }, [perfil?.empresa_id])

    useEffect(() => {
        supabase.from('cobros').select('monto_usd, monto_bs, tasa_cambio').eq('venta_id', venta.id)
            .then(({ data }) => {
                if (data) {
                    const prev = data.reduce((s, c) => s + c.monto_usd + (c.monto_bs / (c.tasa_cambio || 1)), 0)
                    setCobradoPrev(prev)
                    setPagoUsd(Math.max(0, venta.total - prev))
                }
            })
    }, [venta.id])

    useEffect(() => {
        if (venta.cliente_id && perfil?.empresa_id) {
            supabase.from('devoluciones')
                .select('id, numero_nc, monto_devuelto, created_at')
                .eq('empresa_id', perfil.empresa_id)
                .eq('cliente_id', venta.cliente_id)
                .eq('estado_nc', 'pendiente')
                .order('created_at', { ascending: false })
                .then(({ data }) => setNcsDisponibles(data || []))
        }
    }, [venta.cliente_id, perfil?.empresa_id])

    const tasa = tasas[tipoTasa] || 1
    const saldo = venta.total - cobradoPrev
    const montoNCs = ncsDisponibles
        .filter(nc => ncsSeleccionadas.has(nc.id))
        .reduce((s, nc) => s + (nc.monto_devuelto || 0), 0)
    const saldoEfectivo = Math.max(0, saldo - montoNCs)
    const abonoEnUsd = pagoUsd + (pagoBs / tasa) + montoNCs
    const excede = abonoEnUsd > saldo + 0.01
    const sinAbono = abonoEnUsd < 0.01

    function toggleNc(ncId) {
        setNcsSeleccionadas(prev => {
            const next = new Set(prev)
            if (next.has(ncId)) next.delete(ncId); else next.add(ncId)
            const nuevoMontoNCs = ncsDisponibles
                .filter(nc => next.has(nc.id))
                .reduce((s, nc) => s + (nc.monto_devuelto || 0), 0)
            const nuevoSaldoEfectivo = Math.max(0, saldo - nuevoMontoNCs)
            setPagoUsd(parseFloat(nuevoSaldoEfectivo.toFixed(2)))
            setPagoBs(0)
            return next
        })
    }

    // Campos independientes: editar USD NO autocompleta Bs, para permitir cobros parciales.
    function handleUsdChange(val) {
        setPagoUsd(Math.max(0, Number(val)))
    }

    function handleTasaChange(nuevaTasa) {
        setTipoTasa(nuevaTasa)
    }

    // Rellena Bs con lo que falte para cubrir el saldo efectivo, dado el USD ingresado.
    function saldarRestoEnBs() {
        setPagoBs(parseFloat((Math.max(0, saldoEfectivo - pagoUsd) * tasa).toFixed(2)))
    }

    async function confirmar() {
        if (sinAbono) { setError('Ingresa un monto a cobrar'); return }
        if (excede) { setError('El abono supera el saldo pendiente'); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()

        // Aplicar NCs seleccionadas como cobros
        for (const nc of ncsDisponibles.filter(nc => ncsSeleccionadas.has(nc.id))) {
            await supabase.from('cobros').insert({
                venta_id: venta.id,
                monto_usd: nc.monto_devuelto,
                monto_bs: 0,
                tasa_cambio: tasa,
                tipo_tasa: tipoTasa,
                metodo_usd: 'Nota de Crédito',
                metodo_bs: null,
                nota: `NC ${nc.numero_nc || nc.id.slice(0, 8)}`,
                devolucion_id: nc.id,
                usuario_id: user.id,
                empresa_id: perfil.empresa_id,
            })
            await supabase.from('devoluciones').update({ estado_nc: 'aplicada' }).eq('id', nc.id)
        }

        // Cobro en efectivo/transferencia (si hay monto)
        if (pagoUsd > 0.001 || pagoBs > 0.001) {
            await supabase.from('cobros').insert({
                venta_id: venta.id,
                monto_usd: pagoUsd,
                monto_bs: pagoBs,
                tasa_cambio: tasa,
                tipo_tasa: tipoTasa,
                metodo_usd: metodoUsd,
                metodo_bs: metodoBs,
                nota: nota || null,
                cuenta_bancaria_id: cuentaBancariaId || null,
                usuario_id: user.id,
                empresa_id: perfil.empresa_id,
            })
        }

        const nuevoCobrado = cobradoPrev + abonoEnUsd
        const nuevoEstado = nuevoCobrado >= venta.total - 0.01 ? 'pagado' : 'parcial'
        await supabase.from('ventas').update({ estado_cobro: nuevoEstado }).eq('id', venta.id)

        setGuardando(false)
        onCobrado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '460px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Registrar cobro</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                {/* Resumen de factura */}
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

                {/* Notas de crédito disponibles */}
                {ncsDisponibles.length > 0 && (
                    <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <FileText size={14} color="#d97706" />
                            <span style={{ fontSize: '12px', fontWeight: 600, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Notas de crédito disponibles
                            </span>
                        </div>
                        {ncsDisponibles.map((nc, i) => (
                            <label key={nc.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', cursor: 'pointer', borderBottom: i < ncsDisponibles.length - 1 ? '1px solid #fde68a' : 'none' }}>
                                <input type="checkbox" checked={ncsSeleccionadas.has(nc.id)} onChange={() => toggleNc(nc.id)}
                                    style={{ width: '15px', height: '15px', accentColor: '#d97706', cursor: 'pointer', flexShrink: 0 }} />
                                <span style={{ fontSize: '13px', color: '#92400e', fontFamily: 'monospace' }}>
                                    {nc.numero_nc || `NC-${nc.id.slice(0, 8)}`}
                                </span>
                                <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 700, color: '#92400e' }}>{fmt(nc.monto_devuelto)}</span>
                            </label>
                        ))}
                        {ncsSeleccionadas.size > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', marginTop: '4px', fontSize: '13px', fontWeight: 700, borderTop: '1px solid #fcd34d' }}>
                                <span style={{ color: '#d97706' }}>Total NCs aplicadas</span>
                                <span style={{ color: '#d97706' }}>{fmt(montoNCs)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Sección de pago en efectivo/transferencia — ocultar si NCs cubren todo */}
                {saldoEfectivo > 0.001 ? (
                    <>
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasa de cambio</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {OPCIONES_TASA.map(op => (
                                    <button key={op.key} onClick={() => handleTasaChange(op.key)}
                                        style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid', cursor: 'pointer', borderColor: tipoTasa === op.key ? '#16a34a' : '#e5e7eb', backgroundColor: tipoTasa === op.key ? '#f0fdf4' : '#fff', color: tipoTasa === op.key ? '#16a34a' : '#6b7280' }}>
                                        <div>{op.label}</div>
                                        <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 400 }}>{tasas[op.key].toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</div>
                                    </button>
                                ))}
                            </div>
                        </div>

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
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>Pago en Bs.</label>
                                    <button type="button" onClick={saldarRestoEnBs}
                                        style={{ fontSize: '11px', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                                        Saldar resto
                                    </button>
                                </div>
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

                        {pagoUsd > 0 && (
                            <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#6b7280' }}>
                                ${pagoUsd.toFixed(2)} × {tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} = <strong style={{ color: '#374151' }}>{(pagoUsd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</strong>
                            </div>
                        )}

                        {cuentasBancarias.length > 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Cuenta bancaria (opcional)</label>
                                <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                                    <option value="">— Efectivo / sin cuenta —</option>
                                    {cuentasBancarias
                                        .filter(c => pagoUsd > 0 && pagoBs > 0 ? true : pagoUsd > 0 ? c.moneda !== 'Bs' : c.moneda === 'Bs')
                                        .map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.banco} · {c.moneda})</option>)}
                                </select>
                            </div>
                        )}

                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nota (opcional)</label>
                            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: Transferencia ref. 12345"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                        </div>
                    </>
                ) : ncsSeleccionadas.size > 0 && (
                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', textAlign: 'center', color: '#166534', fontWeight: 500 }}>
                        Las notas de crédito seleccionadas cubren el saldo completo
                    </div>
                )}

                <div style={{ borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', textAlign: 'center', fontWeight: 500, backgroundColor: excede ? '#fef2f2' : sinAbono ? '#f9fafb' : '#f0fdf4', color: excede ? '#dc2626' : sinAbono ? '#9ca3af' : '#166534', border: `1px solid ${excede ? '#fecaca' : sinAbono ? '#e5e7eb' : '#bbf7d0'}` }}>
                    {excede ? '⚠️ El abono supera el saldo pendiente'
                        : sinAbono ? 'Ingresa el monto a cobrar'
                        : montoNCs > 0 && saldoEfectivo <= 0.001
                        ? `NC: ${fmt(montoNCs)} · Saldo cubierto completamente`
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

// ── Modal cobro múltiple ───────────────────────────────────────
function ModalCobroMultiple({ ventas, tasas, onCerrar, onCobrado }) {
    const { perfil } = useAuth()
    const OPCIONES_TASA = [
        { key: 'tasa_bcv', label: 'USD · BCV' },
        { key: 'tasa_euro', label: 'EUR · BCV' },
        { key: 'tasa_binance', label: 'USD · Binance' },
    ]
    const METODOS_USD = ['Efectivo', 'Zelle', 'Transferencia USD', 'Otros']
    const METODOS_BS = ['Pago Móvil', 'Transferencia', 'Punto de Venta', 'Efectivo Bs.']

    const totalGeneral = ventas.reduce((s, v) => s + (v.total || 0), 0)

    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [pagoUsd, setPagoUsd] = useState(totalGeneral)
    const [pagoBs, setPagoBs] = useState(0)
    const [metodoUsd, setMetodoUsd] = useState('Efectivo')
    const [metodoBs, setMetodoBs] = useState('Pago Móvil')
    const [nota, setNota] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [cuentasBancarias, setCuentasBancarias] = useState([])
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')

    useEffect(() => {
        if (perfil?.empresa_id) {
            supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda').eq('empresa_id', perfil.empresa_id).eq('activa', true)
                .then(({ data }) => setCuentasBancarias(data || []))
        }
    }, [perfil?.empresa_id])

    const tasa = tasas[tipoTasa] || 1
    const abonoEnUsd = pagoUsd + (pagoBs / tasa)
    const cubre = Math.abs(abonoEnUsd - totalGeneral) <= 0.01
    const excede = abonoEnUsd > totalGeneral + 0.01
    const sinAbono = abonoEnUsd < 0.01

    function handleUsdChange(val) {
        const n = Math.max(0, Number(val))
        setPagoUsd(n)
        setPagoBs(parseFloat((Math.max(0, totalGeneral - n) * tasa).toFixed(2)))
    }

    function handleTasaChange(nuevaTasa) {
        setTipoTasa(nuevaTasa)
        const t = tasas[nuevaTasa] || 1
        setPagoBs(parseFloat((Math.max(0, totalGeneral - pagoUsd) * t).toFixed(2)))
    }

    async function confirmar() {
        if (sinAbono) { setError('Ingresa un monto a cobrar'); return }
        if (excede) { setError('El monto supera el total de las facturas'); return }
        if (!cubre) { setError('El monto debe cubrir exactamente el total — no se aceptan pagos parciales en cobro múltiple'); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()

        // Insertar un cobro por cada factura con su proporción del total
        for (const venta of ventas) {
            const proporcion = venta.total / totalGeneral
            await supabase.from('cobros').insert({
                venta_id: venta.id,
                monto_usd: parseFloat((pagoUsd * proporcion).toFixed(2)),
                monto_bs: parseFloat((pagoBs * proporcion).toFixed(2)),
                tasa_cambio: tasa,
                tipo_tasa: tipoTasa,
                metodo_usd: metodoUsd,
                metodo_bs: metodoBs,
                nota: nota || null,
                cuenta_bancaria_id: cuentaBancariaId || null,
                usuario_id: user.id,
                empresa_id: perfil.empresa_id,
            })
            await supabase.from('ventas').update({ estado_cobro: 'pagado' }).eq('id', venta.id)
        }

        setGuardando(false)
        onCobrado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '480px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <div>
                        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: '0 0 2px' }}>Cobro múltiple</h2>
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>{ventas[0]?.clientes?.nombre} · {ventas.length} facturas</p>
                    </div>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                {/* Lista de facturas incluidas */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                    {ventas.map((v, i) => (
                        <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: i < ventas.length - 1 ? '6px' : 0 }}>
                            <span style={{ fontFamily: 'monospace', color: '#374151' }}>{v.numero_factura}</span>
                            <span style={{ fontWeight: 600, color: '#1f2937' }}>{fmt(v.total)}</span>
                        </div>
                    ))}
                    <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '10px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700 }}>
                        <span style={{ color: '#6b7280' }}>Total a cobrar</span>
                        <span style={{ color: '#1d4ed8' }}>{fmt(totalGeneral)}</span>
                    </div>
                </div>

                {/* Aviso pago exacto */}
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#854d0e' }}>
                    ⚠️ El monto debe coincidir exactamente con el total. No se aceptan pagos parciales en cobro múltiple.
                </div>

                {/* Selector de tasa */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasa de cambio</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {OPCIONES_TASA.map(op => (
                            <button key={op.key} onClick={() => handleTasaChange(op.key)}
                                style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid', cursor: 'pointer', borderColor: tipoTasa === op.key ? '#16a34a' : '#e5e7eb', backgroundColor: tipoTasa === op.key ? '#f0fdf4' : '#fff', color: tipoTasa === op.key ? '#16a34a' : '#6b7280' }}>
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

                {pagoUsd > 0 && (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#6b7280' }}>
                        ${pagoUsd.toFixed(2)} × {tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} = <strong style={{ color: '#374151' }}>{(pagoUsd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</strong>
                    </div>
                )}

                {cuentasBancarias.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Cuenta bancaria (opcional)</label>
                        <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                            <option value="">— Efectivo / sin cuenta —</option>
                            {cuentasBancarias
                                .filter(c => pagoUsd > 0 && pagoBs > 0 ? true : pagoUsd > 0 ? c.moneda !== 'Bs' : c.moneda === 'Bs')
                                .map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.banco} · {c.moneda})</option>)}
                        </select>
                    </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nota (opcional)</label>
                    <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: Transferencia ref. 12345"
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>

                {/* Resumen */}
                <div style={{ borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', textAlign: 'center', fontWeight: 500, backgroundColor: excede ? '#fef2f2' : sinAbono ? '#f9fafb' : cubre ? '#f0fdf4' : '#fffbeb', color: excede ? '#dc2626' : sinAbono ? '#9ca3af' : cubre ? '#166534' : '#854d0e', border: `1px solid ${excede ? '#fecaca' : sinAbono ? '#e5e7eb' : cubre ? '#bbf7d0' : '#fde68a'}` }}>
                    {excede ? '⚠️ El monto supera el total de las facturas'
                        : sinAbono ? 'Ingresa el monto a cobrar'
                        : cubre ? `✓ Monto exacto — ${ventas.length} facturas quedarán pagadas`
                        : `Faltan ${fmt(totalGeneral - abonoEnUsd)} para cubrir el total`}
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

                <button onClick={confirmar} disabled={guardando || !cubre || excede}
                    style={{ width: '100%', backgroundColor: !cubre || excede ? '#d1d5db' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: !cubre || excede ? 'default' : 'pointer' }}>
                    {guardando ? 'Registrando...' : `Confirmar cobro de ${ventas.length} facturas`}
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

function BadgeNC({ estado }) {
    const cfg = {
        pendiente:   { bg: '#fffbeb', color: '#854d0e', label: 'Pendiente' },
        aplicada:    { bg: '#dcfce7', color: '#166534', label: 'Aplicada' },
        reembolsada: { bg: '#dbeafe', color: '#1e40af', label: 'Reembolsada' },
        anulada:     { bg: '#f3f4f6', color: '#6b7280', label: 'Anulada' },
    }
    const { bg, color, label } = cfg[estado] || cfg.pendiente
    return <span style={{ backgroundColor: bg, color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{label}</span>
}

// ── Detalle de Nota de Crédito ─────────────────────────────────
function DetalleNC({ nc, onCerrar }) {
    const [items, setItems] = useState([])
    const [facturaAplicada, setFacturaAplicada] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function cargar() {
            const [{ data: itemsData }, { data: cobroData }] = await Promise.all([
                supabase.from('devolucion_items')
                    .select('cantidad_devuelta, precio_unitario, productos_terminados(nombre, sku)')
                    .eq('devolucion_id', nc.id),
                nc.estado_nc === 'aplicada'
                    ? supabase.from('cobros').select('venta_id, ventas(numero_factura)').eq('devolucion_id', nc.id).maybeSingle()
                    : Promise.resolve({ data: null }),
            ])
            setItems(itemsData || [])
            if (cobroData?.ventas?.numero_factura) setFacturaAplicada(cobroData.ventas.numero_factura)
            setLoading(false)
        }
        cargar()
    }, [nc.id])

    const Row = ({ label, value, mono, bold }) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>{label}</span>
            <span style={{ color: '#1f2937', fontWeight: bold ? 700 : 500, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
        </div>
    )

    return (
        <>
            <style>{`@media print { .no-print { display: none !important; } .print-target { max-width: none !important; box-shadow: none !important; position: static !important; transform: none !important; border-radius: 0 !important; } }`}</style>
            <div className="no-print" onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div className="print-target" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '540px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

                {/* Header */}
                <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{nc.numero_nc || 'Nota de Crédito'}</h2>
                    <BadgeNC estado={nc.estado_nc} />
                    <button onClick={() => window.print()}
                        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', cursor: 'pointer' }}>
                        🖨️ Imprimir
                    </button>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                {/* Info general */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <Row label="N° Nota de Crédito" value={nc.numero_nc || '—'} mono />
                    <Row label="Cliente" value={nc.clientes?.nombre || '—'} />
                    <Row label="Factura origen" value={nc.ventas?.numero_factura || '—'} mono />
                    <Row label="Fecha emisión" value={new Date(nc.created_at).toLocaleDateString('es-VE')} />
                    <Row label="Tipo devolución" value={nc.tipo_devolucion === 'total' ? 'Total' : 'Parcial'} />
                    {nc.motivo && <Row label="Motivo" value={nc.motivo} />}
                    <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '2px 0' }} />
                    <Row label="Monto NC" value={fmt(nc.monto_devuelto)} bold />
                    {nc.estado_nc === 'aplicada' && facturaAplicada && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginTop: '2px' }}>
                            <span style={{ color: '#6b7280' }}>Aplicada a factura</span>
                            <span style={{ color: '#16a34a', fontWeight: 600, fontFamily: 'monospace' }}>{facturaAplicada}</span>
                        </div>
                    )}
                    {(nc.estado_nc === 'reembolsada' || nc.estado_nc === 'anulada') && nc.fecha_liquidacion && (
                        <Row label="Fecha liquidación" value={new Date(nc.fecha_liquidacion).toLocaleDateString('es-VE')} />
                    )}
                    {(nc.estado_nc === 'reembolsada' || nc.estado_nc === 'anulada') && nc.nota_liquidacion && (
                        <Row label="Detalle" value={nc.nota_liquidacion} />
                    )}
                </div>

                {/* Productos incluidos */}
                {loading
                    ? <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px', fontSize: '13px' }}>Cargando...</div>
                    : items.length > 0 && (
                        <div>
                            <p style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Productos devueltos</p>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500 }}>Producto</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 500 }}>Cant.</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 500 }}>P. Unit.</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 500 }}>Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.map((it, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '10px 12px', color: '#1f2937' }}>
                                                {it.productos_terminados?.nombre || '—'}
                                                {it.productos_terminados?.sku && (
                                                    <span style={{ display: 'block', fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{it.productos_terminados.sku}</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{it.cantidad_devuelta}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>{fmt(it.precio_unitario)}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#1f2937' }}>{fmt((it.cantidad_devuelta || 0) * (it.precio_unitario || 0))}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                {nc.estado_nc === 'pendiente' && (
                    <div style={{ marginTop: '16px', backgroundColor: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#854d0e' }}>
                        Esta NC está pendiente. Aparecerá disponible al cobrar cualquier factura del cliente, o puede liquidarse directamente desde la lista.
                    </div>
                )}
                {nc.estado_nc === 'reembolsada' && (
                    <div style={{ marginTop: '16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#1e40af' }}>
                        Se reembolsó el monto directamente al cliente sin aplicarse a una factura.
                    </div>
                )}
                {nc.estado_nc === 'anulada' && (
                    <div style={{ marginTop: '16px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#6b7280' }}>
                        Esta NC fue anulada sin reembolso.
                    </div>
                )}
            </div>
        </>
    )
}

// ── Modal liquidar NC ──────────────────────────────────────────
function ModalLiquidarNC({ nc, onCerrar, onLiquidado }) {
    const METODOS = ['Efectivo', 'Transferencia', 'Pago Móvil', 'Zelle', 'Otros']
    const [tipo, setTipo] = useState('reembolso')
    const [metodo, setMetodo] = useState('Efectivo')
    const [nota, setNota] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    async function confirmar() {
        setGuardando(true); setError('')
        const nuevoEstado = tipo === 'reembolso' ? 'reembolsada' : 'anulada'
        const notaFinal = tipo === 'reembolso'
            ? `Reembolso vía ${metodo}${nota ? ' — ' + nota : ''}`
            : (nota || 'Anulada sin reembolso')
        const { error: err } = await supabase.from('devoluciones').update({
            estado_nc: nuevoEstado,
            nota_liquidacion: notaFinal,
            fecha_liquidacion: new Date().toISOString(),
        }).eq('id', nc.id)
        setGuardando(false)
        if (err) { setError(err.message); return }
        onLiquidado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '420px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Liquidar nota de crédito</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                {/* Resumen NC */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                        <span style={{ color: '#6b7280' }}>N° NC</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1f2937' }}>{nc.numero_nc}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                        <span style={{ color: '#6b7280' }}>Cliente</span>
                        <span style={{ fontWeight: 500, color: '#1f2937' }}>{nc.clientes?.nombre || '—'}</span>
                    </div>
                    <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '8px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: 700 }}>
                        <span style={{ color: '#6b7280' }}>Monto</span>
                        <span style={{ color: '#1f2937' }}>{fmt(nc.monto_devuelto)}</span>
                    </div>
                </div>

                {/* Tipo */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tipo de liquidación</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button onClick={() => setTipo('reembolso')}
                            style={{ flex: 1, padding: '12px 8px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, border: '2px solid', cursor: 'pointer', textAlign: 'center', borderColor: tipo === 'reembolso' ? '#1d4ed8' : '#e5e7eb', backgroundColor: tipo === 'reembolso' ? '#eff6ff' : '#fff', color: tipo === 'reembolso' ? '#1d4ed8' : '#6b7280' }}>
                            <div style={{ fontSize: '20px', marginBottom: '4px' }}>💸</div>
                            <div style={{ fontWeight: 600 }}>Reembolso</div>
                            <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>Se devuelve el dinero</div>
                        </button>
                        <button onClick={() => setTipo('anular')}
                            style={{ flex: 1, padding: '12px 8px', borderRadius: '10px', fontSize: '13px', fontWeight: 500, border: '2px solid', cursor: 'pointer', textAlign: 'center', borderColor: tipo === 'anular' ? '#6b7280' : '#e5e7eb', backgroundColor: tipo === 'anular' ? '#f9fafb' : '#fff', color: tipo === 'anular' ? '#374151' : '#6b7280' }}>
                            <div style={{ fontSize: '20px', marginBottom: '4px' }}>✕</div>
                            <div style={{ fontWeight: 600 }}>Anular</div>
                            <div style={{ fontSize: '11px', opacity: 0.75, marginTop: '2px' }}>Sin reembolso</div>
                        </button>
                    </div>
                </div>

                {/* Método (solo reembolso) */}
                {tipo === 'reembolso' && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Método de reembolso</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {METODOS.map(m => (
                                <button key={m} onClick={() => setMetodo(m)}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid', cursor: 'pointer', borderColor: metodo === m ? '#16a34a' : '#e5e7eb', backgroundColor: metodo === m ? '#f0fdf4' : '#fff', color: metodo === m ? '#16a34a' : '#6b7280', fontWeight: metodo === m ? 600 : 400 }}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Nota */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nota (opcional)</label>
                    <input value={nota} onChange={e => setNota(e.target.value)}
                        placeholder={tipo === 'reembolso' ? 'Ej: Transferencia ref. 12345' : 'Ej: Cliente no reclamará el crédito'}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

                <button onClick={confirmar} disabled={guardando}
                    style={{ width: '100%', backgroundColor: tipo === 'reembolso' ? '#1d4ed8' : '#6b7280', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1 }}>
                    {guardando ? 'Guardando...' : tipo === 'reembolso' ? `Confirmar reembolso de ${fmt(nc.monto_devuelto)}` : 'Confirmar anulación'}
                </button>
            </div>
        </>
    )
}
