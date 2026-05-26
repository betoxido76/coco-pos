import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { AlertTriangle, CheckCircle, Clock, DollarSign, FileText } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`
const fmtBs = (n, tasa) => `${(Number(n || 0) * Number(tasa || 1)).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`

function BadgeEstado({ estado }) {
    const estilos = {
        pendiente: { bg: '#fef9c3', color: '#854d0e' },
        parcial: { bg: '#dbeafe', color: '#1e40af' },
        pagado: { bg: '#dcfce7', color: '#166534' },
        anulado: { bg: '#fee2e2', color: '#991b1b' },
    }
    const s = estilos[estado] || estilos.pendiente
    return (
        <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>
            {estado}
        </span>
    )
}

function semaforo(fecha) {
    if (!fecha) return '#d1d5db'
    const hoy = new Date(); hoy.setHours(0,0,0,0)
    const fechaStr = String(fecha).includes('T') ? fecha : fecha + 'T00:00:00'
    const venc = new Date(fechaStr); venc.setHours(0,0,0,0)
    const dias = Math.ceil((venc - hoy) / 86400000)
    if (dias < 0) return '#ef4444'
    if (dias <= 3) return '#f59e0b'
    return '#16a34a'
}

function BadgeVencimiento({ fecha }) {
    if (!fecha) return null
    const hoy = new Date()
    const venc = new Date(fecha)
    const dias = Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24))
    if (dias < 0) return <span style={{ color: '#dc2626', fontSize: '12px', fontWeight: 500 }}>● Vencida</span>
    if (dias <= 3) return <span style={{ color: '#d97706', fontSize: '12px', fontWeight: 500 }}>● Vence en {dias}d</span>
    return <span style={{ color: '#16a34a', fontSize: '12px' }}>● {dias}d restantes</span>
}

const PAGE_SIZE = 50

export default function CuentasPagar() {
    const { perfil } = useAuth()
    const [compras, setCompras] = useState([])
    const [kpiData, setKpiData] = useState([])
    const [pagos, setPagos] = useState({})
    const [pagosKpi, setPagosKpi] = useState({})
    const [loading, setLoading] = useState(true)
    const [filtro, setFiltro] = useState('pendiente')
    const [compraSeleccionada, setCompraSeleccionada] = useState(null)
    const [mostrarModal, setMostrarModal] = useState(false)
    const [tasas, setTasas] = useState({})
    const [proveedores, setProveedores] = useState([])
    const [filtroProveedor, setFiltroProveedor] = useState('')
    const [pagina, setPagina] = useState(0)
    const [totalRegistros, setTotalRegistros] = useState(0)
    const [tabSeccion, setTabSeccion] = useState('compras')
    const [gastosPend, setGastosPend] = useState([])
    const [loadingGastos, setLoadingGastos] = useState(false)
    const [gastoPagando, setGastoPagando] = useState(null)
    const [compraVer, setCompraVer] = useState(null)
    const [gastoVerCxp, setGastoVerCxp] = useState(null)
    const [nds, setNds] = useState([])
    const [loadingNds, setLoadingNds] = useState(false)
    const [filtroNdEstado, setFiltroNdEstado] = useState('pendiente')
    const [ndVer, setNdVer] = useState(null)
    const [modalLiquidarNd, setModalLiquidarNd] = useState(null)

    useEffect(() => { setPagina(0) }, [filtro, filtroProveedor])
    useEffect(() => { cargarDatos() }, [filtro, filtroProveedor, pagina])
    useEffect(() => { if (tabSeccion === 'gastos') cargarGastosPendientes() }, [tabSeccion])
    useEffect(() => { if (tabSeccion === 'nd') cargarNds() }, [tabSeccion, filtroNdEstado])

    useEffect(() => {
        supabase.from('proveedores').select('id, nombre')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setProveedores(data || []))
    }, [])

    async function cargarDatos() {
        setLoading(true)

        let kpiQ = supabase
            .from('compras')
            .select('id, total, estado_cobro, fecha_vencimiento_pago')
            .eq('empresa_id', perfil.empresa_id)
            .eq('condicion_pago', 'credito')
        if (filtro !== 'todos') kpiQ = kpiQ.eq('estado_cobro', filtro)
        if (filtroProveedor) kpiQ = kpiQ.eq('proveedor_id', filtroProveedor)

        let tablaQ = supabase
            .from('compras')
            .select('*, proveedores(nombre), ordenes_compra(numero_oc)', { count: 'exact' })
            .eq('empresa_id', perfil.empresa_id)
            .eq('condicion_pago', 'credito')
            .order('fecha_vencimiento_pago', { ascending: true })
            .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1)
        if (filtro !== 'todos') tablaQ = tablaQ.eq('estado_cobro', filtro)
        if (filtroProveedor) tablaQ = tablaQ.eq('proveedor_id', filtroProveedor)

        const [{ data: cfgData }, { data: kpi }, { data, count }] = await Promise.all([
            supabase.from('configuracion').select('clave, valor'),
            kpiQ,
            tablaQ,
        ])

        const t = {}
        cfgData?.forEach(r => { t[r.clave] = r.valor })
        setTasas(t)

        if (kpi) {
            setKpiData(kpi)
            const kpiIds = kpi.map(c => c.id)
            if (kpiIds.length > 0) {
                const { data: kpiPagos } = await supabase
                    .from('pagos_proveedor').select('compra_id, monto_usd').in('compra_id', kpiIds)
                const kpiPagosMap = {}
                kpiPagos?.forEach(p => {
                    if (!kpiPagosMap[p.compra_id]) kpiPagosMap[p.compra_id] = []
                    kpiPagosMap[p.compra_id].push(p)
                })
                setPagosKpi(kpiPagosMap)
            }
        }

        if (!data) { setLoading(false); return }
        if (count !== null) setTotalRegistros(count)

        const ids = data.map(c => c.id)
        const { data: pagosData } = ids.length > 0
            ? await supabase.from('pagos_proveedor').select('*').in('compra_id', ids)
            : { data: [] }

        const pagosMap = {}
        pagosData?.forEach(p => {
            if (!pagosMap[p.compra_id]) pagosMap[p.compra_id] = []
            pagosMap[p.compra_id].push(p)
        })

        setCompras(data)
        setPagos(pagosMap)
        setLoading(false)
    }

    function calcularSaldo(compra) {
        const pagosCompra = pagos[compra.id] || []
        const cobrado = pagosCompra.reduce((s, p) => s + Number(p.monto_usd || 0), 0)
        return Number(compra.total || 0) - cobrado
    }

    function calcularCobrado(compra) {
        const pagosCompra = pagos[compra.id] || []
        return pagosCompra.reduce((s, p) => s + Number(p.monto_usd || 0), 0)
    }

    const totalPendiente = kpiData.reduce((s, c) => {
        const pag = (pagosKpi[c.id] || []).reduce((a, p) => a + Number(p.monto_usd || 0), 0)
        return s + Math.max(0, Number(c.total || 0) - pag)
    }, 0)
    const vencidas = kpiData.filter(c => c.fecha_vencimiento_pago && new Date(c.fecha_vencimiento_pago) < new Date()).length
    const alDia = kpiData.filter(c => c.fecha_vencimiento_pago && new Date(c.fecha_vencimiento_pago) >= new Date()).length

    async function cargarNds() {
        setLoadingNds(true)
        let q = supabase.from('devoluciones_proveedor')
            .select('id, numero_nd, monto_total, estado_nd, motivo, created_at, proveedor_id, compra_id, nota_liquidacion, fecha_liquidacion, proveedores(nombre), compras(numero_doc)')
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })
        if (filtroNdEstado === 'liquidada') q = q.in('estado_nd', ['reembolsada', 'anulada'])
        else if (filtroNdEstado !== 'todas') q = q.eq('estado_nd', filtroNdEstado)
        const { data } = await q
        setNds(data || [])
        setLoadingNds(false)
    }

    async function cargarGastosPendientes() {
        setLoadingGastos(true)
        const { data } = await supabase
            .from('gastos')
            .select('*, tipos_gastos(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('estado', 'pendiente')
            .order('fecha_vencimiento', { ascending: true })
        setGastosPend(data || [])
        setLoadingGastos(false)
    }

    function abrirModal(compra) {
        setCompraSeleccionada(compra)
        setMostrarModal(true)
    }

    if (compraVer) return (
        <DetalleRecepcionCxP compra={compraVer} onVolver={() => setCompraVer(null)} />
    )
    if (gastoVerCxp) return (
        <DetalleGastoCxP gasto={gastoVerCxp} tasas={tasas} onVolver={() => setGastoVerCxp(null)} />
    )
    if (ndVer) return (
        <DetalleND nd={ndVer} onVolver={() => setNdVer(null)} />
    )

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Cuentas por Pagar</h1>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Compras a crédito pendientes de pago</p>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>Total pendiente</p>
                    <p style={{ fontSize: '22px', fontWeight: 700, color: '#16a34a', margin: 0 }}>{fmt(totalPendiente)}</p>
                </div>
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: vencidas > 0 ? '1px solid #fecaca' : '1px solid #e5e7eb', padding: '16px' }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>Facturas vencidas</p>
                    <p style={{ fontSize: '22px', fontWeight: 700, color: vencidas > 0 ? '#dc2626' : '#1f2937', margin: 0 }}>{vencidas}</p>
                </div>
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>Al día</p>
                    <p style={{ fontSize: '22px', fontWeight: 700, color: '#16a34a', margin: 0 }}>{alDia}</p>
                </div>
            </div>

            {/* Tabs de sección */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[['compras', 'Compras a crédito'], ['gastos', 'Gastos programados'], ['nd', `Notas de Débito${nds.length && filtroNdEstado === 'pendiente' ? ` (${nds.length})` : ''}`]].map(([key, label]) => (
                    <button key={key} onClick={() => setTabSeccion(key)}
                        style={{ padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid', cursor: 'pointer',
                            borderColor: tabSeccion === key ? '#16a34a' : '#e5e7eb',
                            backgroundColor: tabSeccion === key ? '#f0fdf4' : '#fff',
                            color: tabSeccion === key ? '#16a34a' : '#6b7280' }}>
                        {label}
                    </button>
                ))}
            </div>

            {/* Filtros (solo para compras) */}
            {tabSeccion === 'compras' && <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                {[['pendiente', 'Pendientes'], ['parcial', 'Parciales'], ['pagado', 'Pagadas'], ['todos', 'Todas']].map(([val, label]) => (
                    <button key={val} onClick={() => setFiltro(val)}
                        style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', cursor: 'pointer', backgroundColor: filtro === val ? '#16a34a' : '#fff', color: filtro === val ? '#fff' : '#374151', fontWeight: filtro === val ? 500 : 400 }}>
                        {label}
                    </button>
                ))}
                <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                    <option value="">Todos los proveedores</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
            </div>}

            {/* Tabla compras */}
            {tabSeccion === 'compras' && <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : compras.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay compras a crédito {filtro !== 'todos' ? `con estado "${filtro}"` : ''}</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['', 'Documento', 'Proveedor', 'Vencimiento', 'Total', 'Pagado', 'Saldo', 'Estado', 'Accion'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: [4, 5, 6].includes(i) ? 'right' : 'left', width: i === 0 ? '28px' : undefined }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {compras.map(c => {
                                const saldo = calcularSaldo(c)
                                const cobrado = calcularCobrado(c)
                                return (
                                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                            {c.estado_cobro !== 'pagado' && c.estado_cobro !== 'anulado' && (
                                                <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: semaforo(c.fecha_vencimiento_pago) }} />
                                            )}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{c.numero_doc}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{c.proveedores?.nombre || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                            <div>{c.fecha_vencimiento_pago ? new Date(c.fecha_vencimiento_pago).toLocaleDateString('es-VE') : '—'}</div>
                                            {c.estado_cobro !== 'pagado' && <BadgeVencimiento fecha={c.fecha_vencimiento_pago} />}
                                        </td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(c.total)}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#16a34a', textAlign: 'right' }}>{fmt(cobrado)}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: saldo > 0 ? '#dc2626' : '#16a34a', textAlign: 'right' }}>{fmt(saldo)}</td>
                                        <td style={{ padding: '12px 16px' }}><BadgeEstado estado={c.estado_cobro} /></td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                {c.estado_cobro !== 'pagado' && c.estado_cobro !== 'anulado' && (
                                                    <button onClick={() => abrirModal(c)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>
                                                        <DollarSign size={12} /> Pagar
                                                    </button>
                                                )}
                                                <button onClick={() => setCompraVer(c)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                    <FileText size={13} /> Ver
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>}

            {tabSeccion === 'compras' && totalRegistros > PAGE_SIZE && (
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

            {/* Tabla gastos programados */}
            {tabSeccion === 'gastos' && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                    {loadingGastos ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    ) : gastosPend.length === 0 ? (
                        <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay gastos programados pendientes</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['', 'Documento', 'Nombre', 'Tipo', 'Vencimiento', 'Monto USD', 'Monto Bs.', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: [5, 6].includes(i) ? 'right' : 'left', width: i === 0 ? '28px' : undefined }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {gastosPend.map(g => {
                                    const tasa = Number(tasas[g.tipo_tasa] || tasas.tasa_bcv || 1)
                                    const totalUsd = Number(g.monto_usd || 0) + Number(g.monto_bs || 0) / tasa
                                    return (
                                        <tr key={g.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', backgroundColor: semaforo(g.fecha_vencimiento) }} />
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{g.numero_gasto || '—'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#1f2937', fontWeight: 500 }}>
                                                {g.nombre}
                                                {g.descripcion && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{g.descripcion}</div>}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{g.tipos_gastos?.nombre || g.categoria || '—'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                                                <div style={{ marginBottom: '2px' }}>{g.fecha_vencimiento ? new Date(g.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-VE') : '—'}</div>
                                                <BadgeVencimiento fecha={g.fecha_vencimiento ? g.fecha_vencimiento + 'T00:00:00' : null} />
                                            </td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#dc2626', textAlign: 'right' }}>{Number(g.monto_usd) > 0 ? fmt(g.monto_usd) : '—'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#d97706', textAlign: 'right' }}>{Number(g.monto_bs) > 0 ? fmtBs(g.monto_bs, 1) : '—'}</td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button onClick={() => setGastoPagando(g)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>
                                                        <DollarSign size={12} /> Pagar
                                                    </button>
                                                    <button onClick={() => setGastoVerCxp(g)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                        <FileText size={13} /> Ver
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Tab Notas de Débito */}
            {tabSeccion === 'nd' && (
                <div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        {[['pendiente', 'Pendientes'], ['aplicada', 'Aplicadas'], ['liquidada', 'Liquidadas'], ['todas', 'Todas']].map(([val, label]) => (
                            <button key={val} onClick={() => setFiltroNdEstado(val)}
                                style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', cursor: 'pointer', backgroundColor: filtroNdEstado === val ? '#dc2626' : '#fff', color: filtroNdEstado === val ? '#fff' : '#374151', fontWeight: filtroNdEstado === val ? 500 : 400 }}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        {loadingNds ? (
                            <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                        ) : nds.length === 0 ? (
                            <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay notas de débito {filtroNdEstado !== 'todas' ? `con estado "${filtroNdEstado}"` : ''}</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {['N° ND', 'Proveedor', 'Recepción origen', 'Fecha', 'Monto', 'Estado', 'Acciones'].map((h, i) => (
                                            <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {nds.map(nd => (
                                        <tr key={nd.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{nd.numero_nd || '—'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{nd.proveedores?.nombre || '—'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280', fontFamily: 'monospace' }}>{nd.compras?.numero_doc || '—'}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{new Date(nd.created_at).toLocaleDateString('es-VE')}</td>
                                            <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#dc2626', textAlign: 'right' }}>{fmt(nd.monto_total)}</td>
                                            <td style={{ padding: '12px 16px' }}><BadgeND estado={nd.estado_nd} /></td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button onClick={() => setNdVer(nd)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                        <FileText size={13} /> Ver
                                                    </button>
                                                    {nd.estado_nd === 'pendiente' && (
                                                        <button onClick={() => setModalLiquidarNd(nd)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer', fontWeight: 500 }}>
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
                </div>
            )}

            {mostrarModal && compraSeleccionada && (
                <ModalPago
                    compra={compraSeleccionada}
                    saldo={calcularSaldo(compraSeleccionada)}
                    tasas={tasas}
                    onCerrar={() => { setMostrarModal(false); setCompraSeleccionada(null) }}
                    onPagado={() => { setMostrarModal(false); setCompraSeleccionada(null); cargarDatos() }}
                />
            )}
            {gastoPagando && (
                <ModalPagoGasto
                    gasto={gastoPagando}
                    tasas={tasas}
                    onCerrar={() => setGastoPagando(null)}
                    onPagado={() => { setGastoPagando(null); cargarGastosPendientes() }}
                />
            )}
            {modalLiquidarNd && (
                <ModalLiquidarND
                    nd={modalLiquidarNd}
                    onCerrar={() => setModalLiquidarNd(null)}
                    onLiquidado={() => { setModalLiquidarNd(null); cargarNds() }}
                />
            )}
        </div>
    )
}

// ─── Modal de Pago ─────────────────────────────────────────────
function ModalPago({ compra, saldo, tasas, onCerrar, onPagado }) {
    const { perfil } = useAuth()
    const OPCIONES_TASA = [
        { key: 'tasa_bcv', label: 'USD · BCV' },
        { key: 'tasa_euro', label: 'EUR · BCV' },
        { key: 'tasa_binance', label: 'USD · Binance' },
    ]
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [montoUsd, setMontoUsd] = useState(saldo.toFixed(2))
    const [montoBs, setMontoBs] = useState('')
    const [metodoUsd, setMetodoUsd] = useState('transferencia')
    const [metodoBs, setMetodoBs] = useState('')
    const [nota, setNota] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [cuentasBancarias, setCuentasBancarias] = useState([])
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')
    const [ndsDisponibles, setNdsDisponibles] = useState([])
    const [ndsSeleccionadas, setNdsSeleccionadas] = useState(new Set())

    useEffect(() => {
        if (perfil?.empresa_id) {
            supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda').eq('empresa_id', perfil.empresa_id).eq('activa', true)
                .then(({ data }) => setCuentasBancarias(data || []))
        }
    }, [perfil?.empresa_id])

    useEffect(() => {
        if (perfil?.empresa_id && compra.proveedor_id) {
            supabase.from('devoluciones_proveedor')
                .select('id, numero_nd, monto_total, motivo')
                .eq('empresa_id', perfil.empresa_id)
                .eq('proveedor_id', compra.proveedor_id)
                .eq('estado_nd', 'pendiente')
                .then(({ data }) => setNdsDisponibles(data || []))
        }
    }, [perfil?.empresa_id, compra.proveedor_id])

    const montoNDs = [...ndsSeleccionadas].reduce((s, id) => {
        const nd = ndsDisponibles.find(n => n.id === id)
        return s + Number(nd?.monto_total || 0)
    }, 0)
    const saldoEfectivo = Math.max(0, saldo - montoNDs)

    function toggleNd(ndId) {
        setNdsSeleccionadas(prev => {
            const next = new Set(prev)
            if (next.has(ndId)) next.delete(ndId)
            else next.add(ndId)
            return next
        })
    }

    const tasa = Number(tasas[tipoTasa] || 1)

    useEffect(() => {
        setMontoUsd(saldoEfectivo.toFixed(2))
        setMontoBs('0')
    }, [ndsSeleccionadas.size])

    useEffect(() => {
        const usd = Number(montoUsd) || 0
        const complemento = (saldoEfectivo - usd) * tasa
        setMontoBs(complemento > 0 ? complemento.toFixed(2) : '0')
    }, [tipoTasa])

    function handleUsdChange(val) {
        setMontoUsd(val)
        const usd = Number(val) || 0
        const complemento = (saldoEfectivo - usd) * tasa
        setMontoBs(complemento > 0 ? complemento.toFixed(2) : '0')
    }

    function handleBsChange(val) {
        setMontoBs(val)
        const bs = Number(val) || 0
        const complemento = saldoEfectivo - bs / tasa
        setMontoUsd(complemento > 0 ? complemento.toFixed(2) : '0')
    }

    async function confirmar() {
        if (saldoEfectivo > 0.001 && (!montoUsd || Number(montoUsd) <= 0)) { setError('Ingresa un monto válido'); return }
        if (Number(montoUsd) > saldoEfectivo + 0.01) { setError(`El monto no puede superar el saldo efectivo de ${fmt(saldoEfectivo)}`); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()

        for (const ndId of ndsSeleccionadas) {
            const nd = ndsDisponibles.find(n => n.id === ndId)
            if (!nd) continue
            await supabase.from('pagos_proveedor').insert({
                compra_id: compra.id, usuario_id: user.id,
                monto_usd: Number(nd.monto_total), monto_bs: 0,
                tasa_cambio: tasa, tipo_tasa: tipoTasa,
                metodo_usd: 'Nota de Débito', metodo_bs: null,
                nota: `ND ${nd.numero_nd}`, devolucion_proveedor_id: nd.id,
                empresa_id: perfil.empresa_id,
            })
            await supabase.from('devoluciones_proveedor').update({ estado_nd: 'aplicada' }).eq('id', nd.id)
        }

        if (saldoEfectivo > 0.001) {
            const { error: errPago } = await supabase.from('pagos_proveedor').insert({
                compra_id: compra.id, usuario_id: user.id,
                monto_usd: Number(montoUsd), monto_bs: Number(montoBs || 0),
                tasa_cambio: tasa, tipo_tasa: tipoTasa,
                metodo_usd: metodoUsd, metodo_bs: metodoBs || null,
                nota: nota || null,
                cuenta_bancaria_id: cuentaBancariaId || null,
                empresa_id: perfil.empresa_id,
            })
            if (errPago) { setError('Error: ' + errPago.message); setGuardando(false); return }
        }

        const { data: todosPagos } = await supabase
            .from('pagos_proveedor').select('monto_usd').eq('compra_id', compra.id)
        const totalPagado = todosPagos.reduce((s, p) => s + Number(p.monto_usd), 0)
        const nuevoEstado = totalPagado >= Number(compra.total) - 0.01 ? 'pagado' : 'parcial'
        await supabase.from('compras').update({ estado_cobro: nuevoEstado }).eq('id', compra.id)

        setGuardando(false)
        onPagado()
    }

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>

                <div style={{ marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Registrar pago</h2>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{compra.numero_doc} · {compra.proveedores?.nombre}</p>
                </div>

                <div style={{ backgroundColor: '#eff6ff', borderRadius: '8px', padding: '12px 16px', marginBottom: ndsDisponibles.length > 0 ? '12px' : '20px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#16a34a' }}>Saldo pendiente</span>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a' }}>{fmt(saldo)}</span>
                </div>

                {ndsDisponibles.length > 0 && (
                    <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
                        <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notas de Débito disponibles</p>
                        {ndsDisponibles.map(nd => (
                            <label key={nd.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '6px 0', cursor: 'pointer', borderBottom: '1px solid #fde68a' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="checkbox" checked={ndsSeleccionadas.has(nd.id)} onChange={() => toggleNd(nd.id)} />
                                    <span style={{ fontSize: '13px', color: '#78350f', fontFamily: 'monospace' }}>{nd.numero_nd}</span>
                                    {nd.motivo && <span style={{ fontSize: '11px', color: '#92400e' }}>{nd.motivo}</span>}
                                </div>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>{fmt(nd.monto_total)}</span>
                            </label>
                        ))}
                        {montoNDs > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '13px' }}>
                                <span style={{ color: '#92400e' }}>Crédito aplicado:</span>
                                <span style={{ fontWeight: 600, color: '#dc2626' }}>-{fmt(montoNDs)}</span>
                            </div>
                        )}
                        {saldoEfectivo <= 0.001 && (
                            <div style={{ marginTop: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: '#166534', fontWeight: 500 }}>
                                ✓ Saldo cubierto completamente por notas de débito
                            </div>
                        )}
                    </div>
                )}

                {saldoEfectivo > 0.001 && <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Tasa de cambio</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {OPCIONES_TASA.map(op => (
                                <button key={op.key} onClick={() => setTipoTasa(op.key)}
                                    style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid', cursor: 'pointer', borderColor: tipoTasa === op.key ? '#16a34a' : '#e5e7eb', backgroundColor: tipoTasa === op.key ? '#f0fdf4' : '#fff', color: tipoTasa === op.key ? '#16a34a' : '#6b7280' }}>
                                    <div>{op.label}</div>
                                    <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 400 }}>{Number(tasas[op.key] || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Monto USD</label>
                            <input type="number" value={montoUsd} onChange={e => handleUsdChange(e.target.value)} step="0.01"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Método USD</label>
                            <select value={metodoUsd} onChange={e => setMetodoUsd(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', backgroundColor: '#fff' }}>
                                <option value="transferencia">Transferencia</option>
                                <option value="efectivo">Efectivo</option>
                                <option value="zelle">Zelle</option>
                                <option value="cheque">Cheque</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ fontSize: '12px', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '6px', padding: '8px 12px' }}>
                        Equivalente: {(Number(montoUsd || 0) * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Monto Bs. (opcional)</label>
                            <input type="number" value={montoBs} onChange={e => handleBsChange(e.target.value)} placeholder="0.00"
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Método Bs.</label>
                            <select value={metodoBs} onChange={e => setMetodoBs(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', backgroundColor: '#fff' }}>
                                <option value="">— ninguno —</option>
                                <option value="transferencia">Transferencia</option>
                                <option value="efectivo">Efectivo</option>
                                <option value="pago_movil">Pago móvil</option>
                            </select>
                        </div>
                    </div>

                    {cuentasBancarias.length > 0 && (
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Cuenta bancaria (opcional)</label>
                            <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)}
                                style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', backgroundColor: '#fff' }}>
                                <option value="">— Efectivo / sin cuenta —</option>
                                {cuentasBancarias.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.banco} · {c.moneda})</option>)}
                            </select>
                        </div>
                    )}

                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Nota (opcional)</label>
                        <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Referencia, observación..."
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                    </div>
                </div>}

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button onClick={onCerrar}
                        style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button onClick={confirmar} disabled={guardando}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#fff', backgroundColor: '#16a34a', cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Procesando...' : 'Confirmar pago'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Modal Pago de Gasto ────────────────────────────────────────
const METODOS_PAGO_GASTO = ['Efectivo USD', 'Efectivo Bs.', 'Zelle', 'Transferencia', 'Pago Móvil', 'Punto de Venta', 'Otro']

function ModalPagoGasto({ gasto, tasas, onCerrar, onPagado }) {
    const { perfil } = useAuth()
    const OPCIONES_TASA = [
        { key: 'tasa_bcv', label: 'USD · BCV' },
        { key: 'tasa_euro', label: 'EUR · BCV' },
        { key: 'tasa_binance', label: 'USD · Binance' },
    ]
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
    const [tipoTasa, setTipoTasa] = useState(gasto.tipo_tasa || 'tasa_bcv')
    const [montoUsd, setMontoUsd] = useState(gasto.monto_usd > 0 ? String(gasto.monto_usd) : '')
    const [montoBs, setMontoBs] = useState(gasto.monto_bs > 0 ? String(gasto.monto_bs) : '')
    const [metodoPago, setMetodoPago] = useState(gasto.metodo_pago || 'Efectivo USD')
    const [cuentaBancariaId, setCuentaBancariaId] = useState(gasto.cuenta_bancaria_id || '')
    const [cuentasBancarias, setCuentasBancarias] = useState([])
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        if (perfil?.empresa_id)
            supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda')
                .eq('empresa_id', perfil.empresa_id).eq('activa', true)
                .then(({ data }) => setCuentasBancarias(data || []))
    }, [perfil?.empresa_id])

    const tasa = Number(tasas[tipoTasa] || 1)
    const totalEnUsd = Number(montoUsd || 0) + Number(montoBs || 0) / tasa
    const inputS = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }

    async function confirmar() {
        if (Number(montoUsd) <= 0 && Number(montoBs) <= 0) { setError('Ingresa al menos un monto'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.from('gastos').update({
            estado: 'pagado',
            fecha,
            monto_usd: Number(montoUsd || 0),
            monto_bs: Number(montoBs || 0),
            tasa_cambio: tasa,
            tipo_tasa: tipoTasa,
            metodo_pago: metodoPago,
            cuenta_bancaria_id: cuentaBancariaId || null,
            monto: totalEnUsd,
        }).eq('id', gasto.id)
        if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        onPagado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '460px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>Registrar pago de gasto</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
                    {gasto.numero_gasto && <span style={{ fontFamily: 'monospace', marginRight: '8px' }}>{gasto.numero_gasto}</span>}
                    {gasto.nombre}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Fecha de pago</label>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputS} />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Método de pago</label>
                            <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={inputS}>
                                {METODOS_PAGO_GASTO.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Tasa de cambio</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {OPCIONES_TASA.map(op => (
                                <button key={op.key} onClick={() => setTipoTasa(op.key)}
                                    style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid', cursor: 'pointer',
                                        borderColor: tipoTasa === op.key ? '#16a34a' : '#e5e7eb',
                                        backgroundColor: tipoTasa === op.key ? '#f0fdf4' : '#fff',
                                        color: tipoTasa === op.key ? '#16a34a' : '#6b7280' }}>
                                    <div>{op.label}</div>
                                    <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 400 }}>{Number(tasas[op.key] || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Monto USD</label>
                            <input type="number" value={montoUsd} onChange={e => setMontoUsd(e.target.value)} step="0.01" placeholder="0.00" style={inputS} />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Monto Bs. (opcional)</label>
                            <input type="number" value={montoBs} onChange={e => setMontoBs(e.target.value)} step="1" placeholder="0.00" style={inputS} />
                        </div>
                    </div>

                    {cuentasBancarias.length > 0 && (
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Cuenta bancaria</label>
                            <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)} style={inputS}>
                                <option value="">— Sin especificar —</option>
                                {cuentasBancarias.map(c => <option key={c.id} value={c.id}>{c.banco} · {c.nombre} ({c.moneda})</option>)}
                            </select>
                        </div>
                    )}

                    {(Number(montoUsd) > 0 || Number(montoBs) > 0) && (
                        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', fontWeight: 600 }}>
                            Total equivalente: {fmt(totalEnUsd)}
                        </div>
                    )}

                    {error && <p style={{ color: '#dc2626', fontSize: '13px', margin: 0 }}>{error}</p>}

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <button onClick={onCerrar} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
                        <button onClick={confirmar} disabled={guardando}
                            style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1 }}>
                            {guardando ? 'Guardando...' : 'Confirmar pago'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    )
}

// ─── Detalle Recepción (desde CxP) ─────────────────────────────
function DetalleRecepcionCxP({ compra, onVolver }) {
    const { perfil } = useAuth()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [mapaNombres, setMapaNombres] = useState({})

    useEffect(() => {
        if (!perfil?.empresa_id) return
        Promise.all([
            supabase.from('materias_primas').select('id, nombre').eq('empresa_id', perfil.empresa_id),
            supabase.from('materiales_empaque').select('id, nombre').eq('empresa_id', perfil.empresa_id),
            supabase.from('productos_terminados').select('id, nombre').eq('empresa_id', perfil.empresa_id),
            supabase.from('consumibles').select('id, nombre').eq('empresa_id', perfil.empresa_id),
        ]).then(([mp, me, pt, con]) => {
            const mapa = {}
            ;[...(mp.data||[]), ...(me.data||[]), ...(pt.data||[]), ...(con.data||[])]
                .forEach(i => { mapa[i.id] = i.nombre })
            setMapaNombres(mapa)
        })
        supabase.from('compra_items').select('*')
            .eq('compra_id', compra.id).eq('empresa_id', perfil.empresa_id)
            .then(({ data }) => { if (data) setItems(data); setLoading(false) })
    }, [compra.id, perfil?.empresa_id])

    return (
        <div className="print-target" style={{ padding: '24px', maxWidth: '680px' }}>
            <style>{`@media print { body * { visibility: hidden; } .print-target, .print-target * { visibility: visible; } .print-target { position: fixed; top: 0; left: 0; width: 100% !important; max-width: none !important; margin: 0; padding: 20px !important; border: none !important; box-shadow: none !important; background: white !important; } .no-print { display: none !important; } }`}</style>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Detalle de Recepción</h1>
                <button onClick={() => window.print()} style={{ marginLeft: 'auto', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>🖨️ Imprimir</button>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>Recepción</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', fontFamily: 'monospace' }}>{compra.numero_doc || '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{new Date(compra.fecha_compra).toLocaleDateString('es-VE')}</div>
                        <div style={{ marginTop: '6px' }}><BadgeEstado estado={compra.estado_cobro || 'pendiente'} /></div>
                    </div>
                </div>
                {compra.ordenes_compra?.numero_oc && (
                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: '#166534' }}>
                        Vinculada a OC: <strong>{compra.ordenes_compra.numero_oc}</strong>
                    </div>
                )}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proveedor</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{compra.proveedores?.nombre || '—'}</div>
                </div>
                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Cargando items...</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>Sin items registrados</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                {['Insumo', 'Tipo', 'Cant.', 'Precio unit.', 'Total'].map((h, i) => (
                                    <th key={i} style={{ padding: '8px 0', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#1f2937' }}>{mapaNombres[item.insumo_id] || '—'}</td>
                                    <td style={{ padding: '10px 0', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{item.tipo_insumo?.replace(/_/g, ' ') || '—'}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{item.cantidad}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(item.cantidad * item.precio_unitario)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>
                        <span>Total</span>
                        <span style={{ color: '#16a34a' }}>{fmt(compra.total)}</span>
                    </div>
                    {compra.fecha_vencimiento_pago && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                            <span>Vencimiento</span>
                            <span>{new Date(compra.fecha_vencimiento_pago).toLocaleDateString('es-VE')}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ─── Detalle Gasto (desde CxP) ──────────────────────────────────
function semáforoGasto(fechaVenc) {
    if (!fechaVenc) return null
    const hoy = new Date(); hoy.setHours(0,0,0,0)
    const venc = new Date(fechaVenc + 'T00:00:00')
    const dias = Math.ceil((venc - hoy) / 86400000)
    if (dias < 0) return { color: '#ef4444', label: `Vencido hace ${Math.abs(dias)}d` }
    if (dias <= 3) return { color: '#d97706', label: `Vence en ${dias}d` }
    return { color: '#16a34a', label: `Vence en ${dias}d` }
}

function DetalleGastoCxP({ gasto: g, tasas, onVolver }) {
    const tasa = Number(tasas[g.tipo_tasa] || tasas.tasa_bcv || 1)
    const totalUsd = Number(g.monto_usd || 0) + Number(g.monto_bs || 0) / tasa
    const sem = semáforoGasto(g.fecha_vencimiento)

    const card = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px' }
    const lbl = { fontSize: '11px', fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }
    const val = { fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }

    return (
        <div className="print-target" style={{ padding: '24px', maxWidth: '720px' }}>
            <style>{`@media print { body * { visibility: hidden; } .print-target, .print-target * { visibility: visible; } .print-target { position: fixed; top: 0; left: 0; width: 100% !important; max-width: none !important; margin: 0; padding: 20px !important; border: none !important; box-shadow: none !important; background: white !important; } .no-print { display: none !important; } }`}</style>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Detalle de Gasto</h1>
                <span style={{ marginLeft: 'auto', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    backgroundColor: '#fffbeb', color: sem?.color || '#d97706' }}>
                    {sem ? sem.label : 'Pendiente'}
                </span>
                <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>🖨️ Imprimir</button>
            </div>
            <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                    <div><p style={lbl}>Documento</p><p style={{ ...val, fontFamily: 'monospace', fontSize: '15px' }}>{g.numero_gasto || '—'}</p></div>
                    <div><p style={lbl}>Vencimiento</p><p style={{ ...val, color: sem?.color || '#374151' }}>{g.fecha_vencimiento ? new Date(g.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</p></div>
                    <div><p style={lbl}>Tipo de gasto</p><p style={val}>{g.tipos_gastos?.nombre || g.categoria || '—'}</p></div>
                </div>
            </div>
            <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <p style={lbl}>Nombre</p>
                        <p style={val}>{g.nombre}</p>
                        {g.descripcion && <p style={{ fontSize: '13px', color: '#6b7280', margin: '6px 0 0' }}>{g.descripcion}</p>}
                    </div>
                    <div><p style={lbl}>Proveedor</p><p style={val}>{g.proveedores?.nombre || '—'}</p></div>
                </div>
            </div>
            <div style={card}>
                <p style={{ ...lbl, marginBottom: '16px' }}>Montos</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                    <div><p style={lbl}>Monto USD</p><p style={{ ...val, color: '#dc2626', fontSize: '16px' }}>{Number(g.monto_usd) > 0 ? fmt(g.monto_usd) : '—'}</p></div>
                    <div><p style={lbl}>Monto Bs.</p><p style={{ ...val, color: '#d97706', fontSize: '16px' }}>{Number(g.monto_bs) > 0 ? `${Number(g.monto_bs).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.` : '—'}</p></div>
                    <div><p style={lbl}>Tasa</p><p style={val}>{g.tipo_tasa === 'tasa_bcv' ? 'BCV' : g.tipo_tasa === 'tasa_euro' ? 'EUR·BCV' : 'Binance'} — {tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</p></div>
                    <div><p style={lbl}>Total USD equiv.</p><p style={{ ...val, fontSize: '16px' }}>{fmt(totalUsd)}</p></div>
                </div>
            </div>
        </div>
    )
}

// ─── BadgeND ────────────��──────────────────────────────────────
function BadgeND({ estado }) {
    const cfg = {
        pendiente:   { bg: '#fffbeb', color: '#854d0e', label: 'Pendiente' },
        aplicada:    { bg: '#dcfce7', color: '#166534', label: 'Aplicada' },
        reembolsada: { bg: '#dbeafe', color: '#1e40af', label: 'Reembolsada' },
        anulada:     { bg: '#f3f4f6', color: '#6b7280', label: 'Anulada' },
    }
    const { bg, color, label } = cfg[estado] || cfg.pendiente
    return <span style={{ backgroundColor: bg, color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{label}</span>
}

// ─── Detalle ND ──────────��─────────────────────────────────────
function DetalleND({ nd, onVolver }) {
    const { perfil } = useAuth()
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.from('devolucion_proveedor_items').select('*')
            .eq('devolucion_proveedor_id', nd.id).eq('empresa_id', perfil.empresa_id)
            .then(({ data }) => { setItems(data || []); setLoading(false) })
    }, [nd.id])

    const card = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px' }
    const lbl = { fontSize: '11px', fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }
    const val = { fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }

    return (
        <div className="print-target" style={{ padding: '24px', maxWidth: '680px' }}>
            <style>{`@media print { body * { visibility: hidden; } .print-target, .print-target * { visibility: visible; } .print-target { position: fixed; top: 0; left: 0; width: 100% !important; max-width: none !important; margin: 0; padding: 20px !important; } .no-print { display: none !important; } }`}</style>
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Nota de Débito</h1>
                <BadgeND estado={nd.estado_nd} />
                <button onClick={() => window.print()} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>🖨️ Imprimir</button>
            </div>

            <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                    <div><p style={lbl}>N° ND</p><p style={{ ...val, fontFamily: 'monospace', fontSize: '15px' }}>{nd.numero_nd || '—'}</p></div>
                    <div><p style={lbl}>Fecha</p><p style={val}>{new Date(nd.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' })}</p></div>
                    <div><p style={lbl}>Monto</p><p style={{ ...val, color: '#dc2626', fontSize: '16px', fontWeight: 700 }}>{fmt(nd.monto_total)}</p></div>
                </div>
            </div>

            <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div><p style={lbl}>Proveedor</p><p style={val}>{nd.proveedores?.nombre || '—'}</p></div>
                    <div><p style={lbl}>Recepción origen</p><p style={{ ...val, fontFamily: 'monospace' }}>{nd.compras?.numero_doc || '—'}</p></div>
                </div>
                {nd.motivo && <div style={{ marginTop: '12px' }}><p style={lbl}>Motivo</p><p style={{ ...val, color: '#6b7280' }}>{nd.motivo}</p></div>}
            </div>

            <div style={{ ...card, overflow: 'hidden', padding: 0 }}>
                {loading ? <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Ítem', 'Tipo', 'Cantidad', 'Precio unit.', 'Subtotal'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#1f2937', fontWeight: 500 }}>{item.nombre_insumo || '—'}</td>
                                    <td style={{ padding: '10px 16px', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{item.tipo_insumo?.replace(/_/g, ' ') || '—'}</td>
                                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{Number(item.cantidad).toLocaleString('es-VE')}</td>
                                    <td style={{ padding: '10px 16px', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{fmt(item.precio_unitario)}</td>
                                    <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(Number(item.cantidad) * Number(item.precio_unitario))}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {nd.estado_nd === 'aplicada' && (
                <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 16px', marginTop: '8px' }}>
                    <p style={{ fontSize: '13px', color: '#166534', fontWeight: 500, margin: 0 }}>✓ Esta ND fue aplicada como crédito al pagar una factura de {nd.proveedores?.nombre || 'este proveedor'}.</p>
                </div>
            )}
            {(nd.estado_nd === 'reembolsada' || nd.estado_nd === 'anulada') && (
                <div style={{ backgroundColor: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 16px', marginTop: '8px' }}>
                    <p style={{ fontSize: '12px', color: '#1e40af', margin: '0 0 4px', fontWeight: 600, textTransform: 'uppercase' }}>Liquidada — {nd.estado_nd}</p>
                    {nd.nota_liquidacion && <p style={{ fontSize: '13px', color: '#1e3a8a', margin: 0 }}>{nd.nota_liquidacion}</p>}
                    {nd.fecha_liquidacion && <p style={{ fontSize: '11px', color: '#3b82f6', margin: '4px 0 0' }}>{new Date(nd.fecha_liquidacion).toLocaleDateString('es-VE')}</p>}
                </div>
            )}
        </div>
    )
}

// ─── Modal Liquidar ND ─────────────���───────────────────────────
function ModalLiquidarND({ nd, onCerrar, onLiquidado }) {
    const [opcion, setOpcion] = useState('')
    const [metodo, setMetodo] = useState('Efectivo USD')
    const [nota, setNota] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    const METODOS = ['Efectivo USD', 'Efectivo Bs.', 'Zelle', 'Transferencia', 'Pago Móvil', 'Cheque']

    async function confirmar() {
        if (!opcion) { setError('Selecciona una opción'); return }
        setGuardando(true); setError('')
        const estado_nd = opcion === 'reembolso' ? 'reembolsada' : 'anulada'
        const { error: err } = await supabase.from('devoluciones_proveedor').update({
            estado_nd,
            nota_liquidacion: nota.trim() || null,
            fecha_liquidacion: new Date().toISOString(),
        }).eq('id', nd.id)
        if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        onLiquidado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>Liquidar Nota de Débito</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>
                    <span style={{ fontFamily: 'monospace', marginRight: '8px' }}>{nd.numero_nd}</span>
                    {nd.proveedores?.nombre || ''} · <strong style={{ color: '#dc2626' }}>{fmt(nd.monto_total)}</strong>
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' }}>
                    {[
                        { key: 'reembolso', icon: '💸', label: 'Reembolso', desc: 'El proveedor te devuelve el dinero' },
                        { key: 'anular', icon: '���', label: 'Anular', desc: 'La ND se cancela sin cobro' },
                    ].map(o => (
                        <button key={o.key} onClick={() => setOpcion(o.key)}
                            style={{ padding: '14px', borderRadius: '10px', border: '2px solid', cursor: 'pointer', textAlign: 'left',
                                borderColor: opcion === o.key ? '#dc2626' : '#e5e7eb',
                                backgroundColor: opcion === o.key ? '#fef2f2' : '#fff' }}>
                            <div style={{ fontSize: '20px', marginBottom: '4px' }}>{o.icon}</div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{o.label}</div>
                            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>{o.desc}</div>
                        </button>
                    ))}
                </div>

                {opcion === 'reembolso' && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Método de reembolso</label>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {METODOS.map(m => (
                                <button key={m} onClick={() => setMetodo(m)}
                                    style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', border: '1px solid', cursor: 'pointer',
                                        borderColor: metodo === m ? '#dc2626' : '#e5e7eb',
                                        backgroundColor: metodo === m ? '#fef2f2' : '#fff',
                                        color: metodo === m ? '#dc2626' : '#374151', fontWeight: metodo === m ? 500 : 400 }}>
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Nota (opcional)</label>
                    <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Observación..."
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>

                {error && <p style={{ color: '#dc2626', fontSize: '13px', margin: '0 0 12px' }}>{error}</p>}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={onCerrar} style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '13px', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={confirmar} disabled={guardando}
                        style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontSize: '13px', fontWeight: 500, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1 }}>
                        {guardando ? 'Guardando...' : 'Confirmar'}
                    </button>
                </div>
            </div>
        </>
    )
}
