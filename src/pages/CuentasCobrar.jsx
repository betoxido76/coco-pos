import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { X, DollarSign, CheckSquare, FileText, Ban } from 'lucide-react'

const fmt = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtBs = n => `${Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`
// Equivalente en USD de un cobro: parte en USD + parte en Bs convertida por su tasa.
const cobroEnUsd = (c) => Number(c.monto_usd || 0) + Number(c.monto_bs || 0) / Number(c.tasa_cambio || 1)

// Pago registrado en la propia fila de `ventas` (pago_usd/pago_bs), sin fila en
// `cobros`. Lo usan las ventas migradas desde el POS anterior. Las ventas de
// contado creadas por la app quedan 'pagado' sin registro de pago en ninguna
// parte: para esas el estado es el único dato disponible.
const pagoDirectoEnUsd = (v) => Number(v.pago_usd || 0) + Number(v.pago_bs || 0) / Number(v.tasa_cambio || 1)

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

const hoyYMD = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fmtFechaCorta = (ymd) => new Date(ymd + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })

// `cobros.fecha_cobro` puede venir como 'YYYY-MM-DD' (columna date) o como
// timestamp completo. La forma corta se parsea a medianoche LOCAL para que no
// se muestre el día anterior en husos negativos como el de Venezuela.
const parseFecha = (s) => new Date(String(s).length === 10 ? s + 'T00:00:00' : s)

// Días entre dos fechas contados por día calendario (no por horas), para que un
// cobro del mismo día dé 0 y uno del día siguiente dé 1 sin importar la hora.
const diasEntre = (desde, hasta) => {
    if (!desde || !hasta) return null
    const a = parseFecha(desde), b = parseFecha(hasta)
    if (isNaN(a) || isNaN(b)) return null
    const d0 = new Date(a.getFullYear(), a.getMonth(), a.getDate())
    const d1 = new Date(b.getFullYear(), b.getMonth(), b.getDate())
    return Math.round((d1 - d0) / 86400000)
}

// Tasas vigentes en una fecha concreta, desde el histórico `tasas_cambio`.
// Un pago registrado hoy pero recibido hace 3 días debe convertirse con la tasa
// de ESE día, no con la actual. Devuelve null si la fecha no tiene tasas cargadas.
function useTasasFecha(empresaId, fecha) {
    const [tasasFecha, setTasasFecha] = useState(null)
    const [cargando, setCargando] = useState(true)
    useEffect(() => {
        if (!empresaId || !fecha) return
        let cancel = false
        setCargando(true)
        supabase.from('tasas_cambio')
            .select('tasa_bcv, tasa_euro, tasa_binance')
            .eq('empresa_id', empresaId).eq('fecha', fecha).maybeSingle()
            .then(({ data }) => { if (!cancel) { setTasasFecha(data || null); setCargando(false) } })
        return () => { cancel = true }
    }, [empresaId, fecha])
    return { tasasFecha, cargandoTasas: cargando }
}

// Bloque de fecha + selector de tasa, compartido por el cobro individual y el múltiple.
function SelectorFechaTasa({ fecha, onFecha, tasasFecha, cargandoTasas, tipoTasa, onTipoTasa, opciones }) {
    return (
        <>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fecha del pago</label>
                <input type="date" value={fecha} max={hoyYMD()} onChange={e => onFecha(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#1f2937', backgroundColor: '#fff', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Tasa de cambio del {fmtFechaCorta(fecha)}
                </label>
                {cargandoTasas ? (
                    <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>Cargando tasas…</div>
                ) : !tasasFecha ? (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#991b1b' }}>
                        ⛔ No hay tasas registradas para esta fecha. Cárgalas en <strong>Administración → Tasas de Cambio</strong> eligiendo ese día, o selecciona otra fecha.
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {opciones.map(op => {
                            const v = Number(tasasFecha[op.key]) || 0
                            const activa = tipoTasa === op.key
                            return (
                                <button key={op.key} onClick={() => v > 0 && onTipoTasa(op.key)} disabled={v <= 0}
                                    style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid', cursor: v > 0 ? 'pointer' : 'not-allowed', borderColor: activa ? '#16a34a' : '#e5e7eb', backgroundColor: activa ? '#f0fdf4' : '#fff', color: v <= 0 ? '#d1d5db' : activa ? '#16a34a' : '#6b7280' }}>
                                    <div>{op.label}</div>
                                    <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 400 }}>
                                        {v > 0 ? `${v.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.` : 'sin tasa'}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </>
    )
}

export default function CuentasCobrar() {
    const { perfil } = useAuth()
    // Solo finanzas/administración pueden anular notas no despachadas
    const puedeAnular = ['admin', 'finanzas', 'superadmin'].includes(perfil?.rol)
    const [ventas, setVentas] = useState([])
    const [kpiData, setKpiData] = useState([])
    const [cobradoKpi, setCobradoKpi] = useState({})
    const [loading, setLoading] = useState(true)
    const [filtro, setFiltro] = useState('pendiente')
    const [modalVenta, setModalVenta] = useState(null)       // cobro individual
    const [modalMultiple, setModalMultiple] = useState(false) // cobro múltiple
    const [tasas, setTasas] = useState({ tasa_bcv: 1, tasa_euro: 1, tasa_binance: 1 })
    const [clientes, setClientes] = useState([])
    const [filtroCliente, setFiltroCliente] = useState('')
    const [categorias1, setCategorias1] = useState([])
    const [filtroCat1, setFiltroCat1] = useState('')
    // { venta_id: { cobrado, ultimaFecha } } — cobros de la página en un solo lote
    const [cobrosPagina, setCobrosPagina] = useState({})
    const [cobrosListos, setCobrosListos] = useState(false)
    const cobrosReq = useRef(0)
    const [seleccionadas, setSeleccionadas] = useState([]) // ids seleccionados
    const [pagina, setPagina] = useState(0)
    const [totalRegistros, setTotalRegistros] = useState(0)
    const [vista, setVista] = useState('cxc')
    const [ncs, setNcs] = useState([])
    const [loadingNcs, setLoadingNcs] = useState(false)
    const [filtroNcEstado, setFiltroNcEstado] = useState('todas')
    const [modalNc, setModalNc] = useState(null)
    const [modalLiquidar, setModalLiquidar] = useState(null)

    useEffect(() => { setPagina(0) }, [filtro, filtroCliente, filtroCat1])
    useEffect(() => { cargar() }, [filtro, filtroCliente, filtroCat1, pagina])
    // Limpiar selección al cambiar filtro
    useEffect(() => { setSeleccionadas([]) }, [filtro, filtroCliente, filtroCat1])

    useEffect(() => {
        supabase.from('clientes').select('id, nombre, cat1_id')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => setClientes(data || []))
        supabase.from('categorias_clientes').select('id, nombre')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).eq('nivel', 1).order('nombre')
            .then(({ data }) => setCategorias1(data || []))
    }, [])

    // El selector de cliente se acota a la categoría elegida
    const clientesFiltrados = filtroCat1 ? clientes.filter(c => c.cat1_id === filtroCat1) : clientes

    async function cargar() {
        setLoading(true)
        const estados = filtro === 'todos' ? ['pendiente', 'parcial', 'pagado'] : [filtro]

        // !inner solo cuando se filtra por categoría: con el embed normal una venta
        // sin cliente seguiría apareciendo, que es el comportamiento sin filtro.
        const embedCli = filtroCat1
            ? 'clientes!inner(nombre, condicion_pago, dias_credito)'
            : 'clientes(nombre, condicion_pago, dias_credito)'

        let tablaQ = supabase
            .from('ventas')
            .select(`*, ${embedCli}`, { count: 'exact' })
            .eq('empresa_id', perfil.empresa_id)
            .in('estado_cobro', estados)
            .order('fecha_vencimiento_pago', { ascending: true })
            .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1)
        if (filtroCliente) tablaQ = tablaQ.eq('cliente_id', filtroCliente)
        if (filtroCat1) tablaQ = tablaQ.eq('clientes.cat1_id', filtroCat1)

        // La tabla (paginada) se resuelve y muestra de inmediato; los KPIs de
        // cartera se cargan aparte para no bloquear el render si la query pesada
        // tarda o falla.
        try {
            const [{ data, count }, { data: cfg }] = await Promise.all([
                tablaQ,
                supabase.from('configuracion').select('clave, valor'),
            ])
            if (data) setVentas(data)
            if (count !== null && count !== undefined) setTotalRegistros(count)
            if (cfg) {
                const m = {}; cfg.forEach(r => { m[r.clave] = Number(r.valor) })
                setTasas({ tasa_bcv: m.tasa_bcv || 1, tasa_euro: m.tasa_euro || 1, tasa_binance: m.tasa_binance || 1 })
            }
            cargarCobrosPagina(data || [])
        } catch (e) {
            console.error('Error cargando facturas CxC:', e)
        } finally {
            setLoading(false)
        }

        cargarKpis()
    }

    // Cobros de las facturas de la página en UNA sola query. Antes cada fila
    // montaba dos componentes que consultaban `cobros` por su cuenta (2 queries
    // por fila = ~100 por página); ahora se resuelve todo aquí y las celdas solo
    // leen del mapa. De paso el saldo y el "cobrado" salen de los mismos datos.
    async function cargarCobrosPagina(filas) {
        // Al cambiar de página rápido, la respuesta de la página anterior puede
        // llegar después: solo se aplica la del último pedido.
        const req = ++cobrosReq.current
        setCobrosListos(false)
        const ids = filas.map(v => v.id)
        if (ids.length === 0) { setCobrosPagina({}); setCobrosListos(true); return }
        const { data } = await supabase.from('cobros')
            .select('venta_id, monto_usd, monto_bs, tasa_cambio, fecha_cobro, created_at')
            .in('venta_id', ids)
        if (req !== cobrosReq.current) return
        const m = {}
        ;(data || []).forEach(c => {
            const acc = m[c.venta_id] || (m[c.venta_id] = { cobrado: 0, ultimaFecha: null })
            acc.cobrado += cobroEnUsd(c)
            // fecha_cobro es la fecha real del pago; created_at cubre los cobros
            // viejos registrados antes de que se guardara la fecha.
            const f = c.fecha_cobro || c.created_at
            if (f && (!acc.ultimaFecha || parseFecha(f) > parseFecha(acc.ultimaFecha))) acc.ultimaFecha = f
        })
        setCobrosPagina(m)
        setCobrosListos(true)
    }

    // KPIs de cartera (pendiente + parcial), independientes del filtro de pestaña;
    // solo respetan el filtro de cliente. Se corre fuera de cargar() para no
    // bloquear la tabla.
    async function cargarKpis() {
        try {
            const kpiSelect = 'id, total, estado_cobro, fecha_vencimiento_pago, cliente_id, created_at'
                + (filtroCat1 ? ', clientes!inner(cat1_id)' : '')
            let kpiQ = supabase
                .from('ventas')
                .select(kpiSelect)
                .eq('empresa_id', perfil.empresa_id)
                .in('estado_cobro', ['pendiente', 'parcial'])
            if (filtroCliente) kpiQ = kpiQ.eq('cliente_id', filtroCliente)
            if (filtroCat1) kpiQ = kpiQ.eq('clientes.cat1_id', filtroCat1)

            const { data: kpi } = await kpiQ
            if (!kpi) return
            setKpiData(kpi)

            // Solo las facturas 'parcial' tienen cobros; las 'pendiente' aportan
            // saldo completo. Limitar el .in() a las parciales evita un IN de miles
            // de IDs que satura PostgREST y cuelga la carga.
            const parcialIds = kpi.filter(v => v.estado_cobro === 'parcial').map(v => v.id)
            if (parcialIds.length === 0) { setCobradoKpi({}); return }
            const { data: kpiCobros } = await supabase
                .from('cobros').select('venta_id, monto_usd, monto_bs, tasa_cambio').in('venta_id', parcialIds)
            const m = {}
            kpiCobros?.forEach(c => { m[c.venta_id] = (m[c.venta_id] || 0) + cobroEnUsd(c) })
            setCobradoKpi(m)
        } catch (e) {
            console.error('Error cargando KPIs de cartera CxC:', e)
        }
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

    // ─── Métricas de cartera (sobre kpiData = pendiente + parcial) ───
    const hoyKpi = new Date()
    const saldoKpi = (v) => Math.max(0, Number(v.total || 0) - (cobradoKpi[v.id] || 0))
    const esVencidaKpi = (v) => v.fecha_vencimiento_pago && new Date(v.fecha_vencimiento_pago) < hoyKpi

    const totalPendiente = kpiData.reduce((s, v) => s + saldoKpi(v), 0)
    const valorVencido = kpiData.filter(esVencidaKpi).reduce((s, v) => s + saldoKpi(v), 0)
    const valorPorVencer = kpiData.filter(v => !esVencidaKpi(v)).reduce((s, v) => s + saldoKpi(v), 0)
    const pctVencido = totalPendiente > 0 ? (valorVencido / totalPendiente) * 100 : 0
    const pctPorVencer = totalPendiente > 0 ? (valorPorVencer / totalPendiente) * 100 : 0

    // Días calle ponderado: Σ((hoy - emisión) * saldo) / Σ saldo. Pondera por el
    // saldo pendiente (para parciales, solo el valor aún por cobrar).
    const diasCalleNum = kpiData.reduce((s, v) => {
        const dias = Math.max(0, Math.floor((hoyKpi - new Date(v.created_at)) / 86400000))
        return s + dias * saldoKpi(v)
    }, 0)
    const diasCalle = totalPendiente > 0 ? (diasCalleNum / totalPendiente).toFixed(1) : '0.0'

    const mostrarCheckboxes = filtro === 'pendiente' || filtro === 'parcial'
    // En Pendientes no hay pagos todavía: la columna sería siempre vacía
    const mostrarDiasPago = filtro !== 'pendiente'

    return (
        <div style={{ padding: '24px' }}>
            {/* Header con tabs de vista */}
            <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Cuentas por cobrar</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                        {vista === 'cxc' ? 'Seguimiento de facturas a crédito'
                            : vista === 'nc' ? 'Historial de notas de crédito emitidas'
                            : 'Anular notas de entrega facturadas que no serán despachadas'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#f3f4f6', borderRadius: '10px', padding: '4px' }}>
                    {[['cxc', 'Facturas CxC'], ['nc', 'Notas de Crédito'], ...(puedeAnular ? [['anular', 'Anular NE']] : [])].map(([v, lbl]) => (
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
                        { label: 'Facturas vencidas', valor: kpiData.filter(esVencidaKpi).length, sub: 'requieren atención', color: '#ef4444' },
                        { label: 'Facturas al día', valor: kpiData.filter(v => !esVencidaKpi(v)).length, sub: 'dentro del plazo', color: '#16a34a' },
                        { label: 'Valor vencido', valor: fmt(valorVencido), pct: `${pctVencido.toFixed(0)}%`, sub: fmtBs(valorVencido * tasas.tasa_bcv), color: '#ef4444' },
                        { label: 'Valor por vencer', valor: fmt(valorPorVencer), pct: `${pctPorVencer.toFixed(0)}%`, sub: fmtBs(valorPorVencer * tasas.tasa_bcv), color: '#16a34a' },
                        { label: 'Días calle ponderado', valor: `${diasCalle} días`, sub: 'promedio ponderado por saldo', color: '#d97706' },
                    ].map(k => (
                        <div key={k.label} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{k.label}</p>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                <p style={{ fontSize: '22px', fontWeight: 700, color: k.color, margin: 0 }}>{k.valor}</p>
                                {k.pct != null && <span style={{ fontSize: '20px', fontWeight: 700, color: k.color }}>({k.pct})</span>}
                            </div>
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
                        {clientesFiltrados.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <select value={filtroCat1}
                        onChange={e => {
                            const cat = e.target.value
                            setFiltroCat1(cat)
                            // Si el cliente elegido no pertenece a la categoría, se limpia
                            if (cat && filtroCliente && !clientes.some(c => c.id === filtroCliente && c.cat1_id === cat)) setFiltroCliente('')
                        }}
                        style={{ padding: '7px 12px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                        <option value="">Todas las categorías</option>
                        {categorias1.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
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
                                            {[mostrarCheckboxes ? '☑' : '', '', 'Factura', 'Cliente', 'Emisión', 'Últ. pago',
                                              ...(mostrarDiasPago ? ['Días Pago'] : []),
                                              'Vencimiento', 'Total', 'Cobrado', 'Saldo', 'Estado', ''].map((h, i) => (
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
                                            const cob = cobrosPagina[v.id]
                                            const esPagada = v.estado_cobro === 'pagado'
                                            // Lo efectivamente cobrado = abonos en `cobros` + pago directo
                                            // en la venta. Si la factura está 'pagado' pero no hay ningún
                                            // registro (ventas de contado), se muestra el total: el estado
                                            // dice que se cobró completa y su saldo es 0.
                                            const cobradoReg = (cob?.cobrado || 0) + pagoDirectoEnUsd(v)
                                            const cobrado = esPagada ? Math.max(cobradoReg, v.total) : cobradoReg
                                            const saldoFila = esPagada ? 0 : v.total - cobrado
                                            // Días que tardó en pagarse: emisión → último cobro
                                            const diasPago = diasEntre(v.created_at, cob?.ultimaFecha)
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
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', whiteSpace: 'nowrap', color: cob?.ultimaFecha ? '#374151' : '#d1d5db' }}>
                                                        {cob?.ultimaFecha ? parseFecha(cob.ultimaFecha).toLocaleDateString('es-VE') : '—'}
                                                    </td>
                                                    {mostrarDiasPago && (
                                                        <td style={{ padding: '12px 14px', fontSize: '13px', whiteSpace: 'nowrap', color: diasPago != null ? '#374151' : '#d1d5db' }}>
                                                            {diasPago != null ? `${diasPago} d` : '—'}
                                                        </td>
                                                    )}
                                                    <td style={{ padding: '12px 14px' }}>
                                                        {sem ? <span style={{ fontSize: '12px', fontWeight: 500, color: sem.color }}>{sem.label}</span>
                                                            : <span style={{ fontSize: '12px', color: '#9ca3af' }}>—</span>}
                                                    </td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{fmt(v.total)}</td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#16a34a' }}>
                                                        {cobrosListos ? fmt(cobrado) : '—'}
                                                    </td>
                                                    <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#ef4444' }}>
                                                        {!cobrosListos ? '—'
                                                            : saldoFila > 0.01 ? fmt(saldoFila)
                                                            : <span style={{ color: '#16a34a' }}>✓ Pagado</span>}
                                                    </td>
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

            {/* ─── Vista Anular NE (solo finanzas/admin) ─── */}
            {vista === 'anular' && puedeAnular && <TabAnularNE />}

            {/* Modals */}
            {modalVenta && (
                <ModalCobro venta={modalVenta}
                    onCerrar={() => setModalVenta(null)}
                    onCobrado={() => { setModalVenta(null); cargar() }} />
            )}
            {modalMultiple && (
                <ModalCobroMultiple
                    ventas={ventasSeleccionadasObj}
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

// Cobrado y saldo por fila salen de `cobrosPagina` (una query por página),
// antes eran dos componentes que consultaban `cobros` fila por fila.

// ── Modal cobro individual ─────────────────────────────────────
function ModalCobro({ venta, onCerrar, onCobrado }) {
    const { perfil } = useAuth()
    const OPCIONES_TASA = [
        { key: 'tasa_bcv', label: 'USD · BCV' },
        { key: 'tasa_euro', label: 'EUR · BCV' },
        { key: 'tasa_binance', label: 'USD · Binance' },
    ]
    const METODOS_USD = ['Efectivo', 'Zelle', 'Transferencia USD', 'Otros']
    const METODOS_BS = ['Pago Móvil', 'Transferencia', 'Punto de Venta', 'Efectivo Bs.']

    const [cobradoPrev, setCobradoPrev] = useState(0)
    const [fechaPago, setFechaPago] = useState(hoyYMD())
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
                    const prev = data.reduce((s, c) => s + cobroEnUsd(c), 0)
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

    const { tasasFecha, cargandoTasas } = useTasasFecha(perfil?.empresa_id, fechaPago)
    const tasaDia = Number(tasasFecha?.[tipoTasa]) || 0
    const tasa = tasaDia > 0 ? tasaDia : 1   // evita dividir entre 0 mientras no hay tasa
    const sinTasa = !cargandoTasas && tasaDia <= 0

    const saldo = venta.total - cobradoPrev
    const montoNCs = ncsDisponibles
        .filter(nc => ncsSeleccionadas.has(nc.id))
        .reduce((s, nc) => s + (nc.monto_devuelto || 0), 0)
    const saldoEfectivo = Math.max(0, saldo - montoNCs)
    const abonoEnUsd = pagoUsd + (pagoBs / tasa) + montoNCs
    const excede = abonoEnUsd > saldo + 0.01
    const sinAbono = abonoEnUsd < 0.01

    // Al cambiar de fecha cambia la tasa: se recalcula el Bs. para que siga
    // equivaliendo al resto del saldo, igual que al cambiar de tipo de tasa.
    useEffect(() => {
        if (tasaDia > 0) setPagoBs(parseFloat((Math.max(0, saldoEfectivo - pagoUsd) * tasaDia).toFixed(2)))
    }, [tasasFecha])

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

    // Editar USD completa el Bs. con el equivalente del resto del saldo: dejar
    // USD en 0 llena el Bs. con el saldo completo a la tasa del día elegido.
    function handleUsdChange(val) {
        const n = Math.max(0, Number(val))
        setPagoUsd(n)
        setPagoBs(parseFloat((Math.max(0, saldoEfectivo - n) * tasa).toFixed(2)))
    }

    function handleTasaChange(nuevaTasa) {
        setTipoTasa(nuevaTasa)
        const t = Number(tasasFecha?.[nuevaTasa]) || 0
        if (t > 0) setPagoBs(parseFloat((Math.max(0, saldoEfectivo - pagoUsd) * t).toFixed(2)))
    }

    // Rellena Bs con lo que falte para cubrir el saldo efectivo, dado el USD ingresado.
    function saldarRestoEnBs() {
        setPagoBs(parseFloat((Math.max(0, saldoEfectivo - pagoUsd) * tasa).toFixed(2)))
    }

    async function confirmar() {
        if (sinTasa) { setError('No hay tasa registrada para la fecha del pago'); return }
        if (sinAbono) { setError('Ingresa un monto a cobrar'); return }
        if (excede) { setError('El abono supera el saldo pendiente'); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()
        // Mediodía para que la fecha no se corra de día al guardarse con zona horaria
        const fechaCobro = `${fechaPago}T12:00:00`

        // Aplicar NCs seleccionadas como cobros
        for (const nc of ncsDisponibles.filter(nc => ncsSeleccionadas.has(nc.id))) {
            await supabase.from('cobros').insert({
                venta_id: venta.id,
                monto_usd: nc.monto_devuelto,
                monto_bs: 0,
                tasa_cambio: tasa,
                tipo_tasa: tipoTasa,
                fecha_cobro: fechaCobro,
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
                fecha_cobro: fechaCobro,
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

                {/* Fecha del pago + tasas de esa fecha */}
                <SelectorFechaTasa
                    fecha={fechaPago} onFecha={setFechaPago}
                    tasasFecha={tasasFecha} cargandoTasas={cargandoTasas}
                    tipoTasa={tipoTasa} onTipoTasa={handleTasaChange}
                    opciones={OPCIONES_TASA}
                />

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

                <div style={{ borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', textAlign: 'center', fontWeight: 500, backgroundColor: sinTasa || excede ? '#fef2f2' : sinAbono ? '#f9fafb' : '#f0fdf4', color: sinTasa || excede ? '#dc2626' : sinAbono ? '#9ca3af' : '#166534', border: `1px solid ${sinTasa || excede ? '#fecaca' : sinAbono ? '#e5e7eb' : '#bbf7d0'}` }}>
                    {sinTasa ? `⛔ Sin tasa registrada para el ${fmtFechaCorta(fechaPago)}`
                        : excede ? '⚠️ El abono supera el saldo pendiente'
                        : sinAbono ? 'Ingresa el monto a cobrar'
                        : montoNCs > 0 && saldoEfectivo <= 0.001
                        ? `NC: ${fmt(montoNCs)} · Saldo cubierto completamente`
                        : `Abono: ${fmt(abonoEnUsd)} · Quedará pendiente: ${fmt(Math.max(0, saldo - abonoEnUsd))}`}
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

                <button onClick={confirmar} disabled={guardando || sinAbono || excede || sinTasa || cargandoTasas}
                    style={{ width: '100%', backgroundColor: sinAbono || excede || sinTasa || cargandoTasas ? '#d1d5db' : '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: sinAbono || excede || sinTasa || cargandoTasas ? 'default' : 'pointer' }}>
                    {guardando ? 'Registrando...' : 'Confirmar cobro'}
                </button>
            </div>
        </>
    )
}

// ── Modal cobro múltiple ───────────────────────────────────────
function ModalCobroMultiple({ ventas, onCerrar, onCobrado }) {
    const { perfil } = useAuth()
    const OPCIONES_TASA = [
        { key: 'tasa_bcv', label: 'USD · BCV' },
        { key: 'tasa_euro', label: 'EUR · BCV' },
        { key: 'tasa_binance', label: 'USD · Binance' },
    ]
    const METODOS_USD = ['Efectivo', 'Zelle', 'Transferencia USD', 'Otros']
    const METODOS_BS = ['Pago Móvil', 'Transferencia', 'Punto de Venta', 'Efectivo Bs.']

    const totalGeneral = ventas.reduce((s, v) => s + (v.total || 0), 0)

    const [fechaPago, setFechaPago] = useState(hoyYMD())
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

    const { tasasFecha, cargandoTasas } = useTasasFecha(perfil?.empresa_id, fechaPago)
    const tasaDia = Number(tasasFecha?.[tipoTasa]) || 0
    const tasa = tasaDia > 0 ? tasaDia : 1
    const sinTasa = !cargandoTasas && tasaDia <= 0

    const abonoEnUsd = pagoUsd + (pagoBs / tasa)
    const cubre = Math.abs(abonoEnUsd - totalGeneral) <= 0.01
    const excede = abonoEnUsd > totalGeneral + 0.01
    const sinAbono = abonoEnUsd < 0.01

    // La tasa del día elegido cambia el equivalente en Bs. del resto
    useEffect(() => {
        if (tasaDia > 0) setPagoBs(parseFloat((Math.max(0, totalGeneral - pagoUsd) * tasaDia).toFixed(2)))
    }, [tasasFecha])

    function handleUsdChange(val) {
        const n = Math.max(0, Number(val))
        setPagoUsd(n)
        setPagoBs(parseFloat((Math.max(0, totalGeneral - n) * tasa).toFixed(2)))
    }

    function handleTasaChange(nuevaTasa) {
        setTipoTasa(nuevaTasa)
        const t = Number(tasasFecha?.[nuevaTasa]) || 0
        if (t > 0) setPagoBs(parseFloat((Math.max(0, totalGeneral - pagoUsd) * t).toFixed(2)))
    }

    async function confirmar() {
        if (sinTasa) { setError('No hay tasa registrada para la fecha del pago'); return }
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
                fecha_cobro: `${fechaPago}T12:00:00`,
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

                {/* Fecha del pago + tasas de esa fecha */}
                <SelectorFechaTasa
                    fecha={fechaPago} onFecha={setFechaPago}
                    tasasFecha={tasasFecha} cargandoTasas={cargandoTasas}
                    tipoTasa={tipoTasa} onTipoTasa={handleTasaChange}
                    opciones={OPCIONES_TASA}
                />

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
                <div style={{ borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', textAlign: 'center', fontWeight: 500, backgroundColor: sinTasa || excede ? '#fef2f2' : sinAbono ? '#f9fafb' : cubre ? '#f0fdf4' : '#fffbeb', color: sinTasa || excede ? '#dc2626' : sinAbono ? '#9ca3af' : cubre ? '#166534' : '#854d0e', border: `1px solid ${sinTasa || excede ? '#fecaca' : sinAbono ? '#e5e7eb' : cubre ? '#bbf7d0' : '#fde68a'}` }}>
                    {sinTasa ? `⛔ Sin tasa registrada para el ${fmtFechaCorta(fechaPago)}`
                        : excede ? '⚠️ El monto supera el total de las facturas'
                        : sinAbono ? 'Ingresa el monto a cobrar'
                        : cubre ? `✓ Monto exacto — ${ventas.length} facturas quedarán pagadas`
                        : `Faltan ${fmt(totalGeneral - abonoEnUsd)} para cubrir el total`}
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

                <button onClick={confirmar} disabled={guardando || !cubre || excede || sinTasa || cargandoTasas}
                    style={{ width: '100%', backgroundColor: !cubre || excede || sinTasa || cargandoTasas ? '#d1d5db' : '#1d4ed8', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: !cubre || excede || sinTasa || cargandoTasas ? 'default' : 'pointer' }}>
                    {guardando ? 'Registrando...' : `Confirmar cobro de ${ventas.length} facturas`}
                </button>
            </div>
        </>
    )
}

function BadgeCobro({ estado }) {
    const e = { pendiente: ['#fef9c3', '#854d0e'], parcial: ['#dbeafe', '#1e40af'], pagado: ['#dcfce7', '#166534'], anulado: ['#f3f4f6', '#6b7280'] }
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

// ══════════════════════════════════════════════════════════════
// Tab Anular NE — anular notas de entrega facturadas NO despachadas
// (solo finanzas/administración; el gate de rol está en el componente raíz)
// ══════════════════════════════════════════════════════════════
function TabAnularNE() {
    const { perfil } = useAuth()
    const [rows, setRows] = useState([])
    const [loading, setLoading] = useState(true)
    const [modal, setModal] = useState(null) // fila a anular

    async function cargar() {
        setLoading(true)
        // Candidatos = pedidos facturados (aún no despachados) y su venta/NE
        const { data: peds } = await supabase.from('pedidos')
            .select('id, numero_pedido, venta_id, cliente_id, clientes(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('estado', 'facturado')
            .not('venta_id', 'is', null)
            .order('created_at', { ascending: false })
        const ventaIds = [...new Set((peds || []).map(p => p.venta_id).filter(Boolean))]
        let ventasMap = {}
        if (ventaIds.length > 0) {
            const { data: vts } = await supabase.from('ventas')
                .select('id, numero_factura, total, estado_cobro, created_at')
                .in('id', ventaIds)
            vts?.forEach(v => { ventasMap[v.id] = v })
        }
        const filas = (peds || []).map(p => {
            const v = ventasMap[p.venta_id]
            return v ? {
                pedidoId: p.id, numeroPedido: p.numero_pedido,
                clienteNombre: p.clientes?.nombre || '—',
                ventaId: v.id, numeroFactura: v.numero_factura,
                total: v.total, estadoCobro: v.estado_cobro, fecha: v.created_at,
            } : null
        }).filter(Boolean)
        setRows(filas)
        setLoading(false)
    }
    useEffect(() => { cargar() }, [])

    return (
        <>
            <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
                Notas de entrega ya <strong>facturadas</strong> (contabilizadas en CxC e inventario) que <strong>no serán despachadas</strong>.
                Al anular se revierte el inventario al almacén que elijas, se eliminan los cobros y la nota sale de CxC.
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    : rows.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay notas facturadas pendientes de despacho</div>
                        : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {['Nota de Entrega', 'N° Pedido', 'Cliente', 'Emisión', 'Total', 'Estado', ''].map((h, i) => (
                                            <th key={i} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i === 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.ventaId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{r.numeroFactura}</td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{r.numeroPedido || '—'}</td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', color: '#1f2937' }}>{r.clienteNombre}</td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>{new Date(r.fecha).toLocaleDateString('es-VE')}</td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(r.total)}</td>
                                            <td style={{ padding: '12px 14px' }}><BadgeCobro estado={r.estadoCobro} /></td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <button onClick={() => setModal(r)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                    <Ban size={12} /> Anular
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
            </div>

            {modal && <ModalAnularNE fila={modal} onCerrar={() => setModal(null)} onAnulada={() => { setModal(null); cargar() }} />}
        </>
    )
}

function ModalAnularNE({ fila, onCerrar, onAnulada }) {
    const { perfil } = useAuth()
    const [almacenes, setAlmacenes] = useState([])
    const [almacenId, setAlmacenId] = useState('')
    const [motivo, setMotivo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        supabase.from('almacenes').select('id, nombre, es_default')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => {
                setAlmacenes(data || [])
                const def = (data || []).find(a => a.es_default) || (data || [])[0]
                if (def) setAlmacenId(def.id)
            })
    }, [])

    async function confirmar() {
        if (!almacenId) { setError('Selecciona el almacén destino'); return }
        if (!motivo.trim()) { setError('El motivo es obligatorio'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.rpc('anular_nota_no_despachada', {
            p_venta_id: fila.ventaId,
            p_almacen_destino_id: almacenId,
            p_motivo: motivo.trim(),
        })
        setGuardando(false)
        if (err) { setError('Error: ' + err.message); return }
        onAnulada()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Anular nota de entrega</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#6b7280' }}>Nota / Pedido</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1f2937' }}>{fila.numeroFactura} · {fila.numeroPedido || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#6b7280' }}>Cliente</span>
                        <span style={{ color: '#1f2937' }}>{fila.clienteNombre}</span>
                    </div>
                </div>

                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '12px', color: '#991b1b' }}>
                    Se reintegrará el inventario al almacén elegido, se eliminarán los cobros de esta nota y la nota + el pedido quedarán <strong>anulados</strong>. Esta acción no se puede deshacer.
                </div>

                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Almacén destino del inventario</label>
                    <select value={almacenId} onChange={e => setAlmacenId(e.target.value)}
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                        <option value="">— Selecciona almacén —</option>
                        {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                    </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Motivo de anulación</label>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                        placeholder="Ej: pedido cancelado por el cliente, error de facturación..."
                        style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}

                <button onClick={confirmar} disabled={guardando}
                    style={{ width: '100%', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <Ban size={16} /> {guardando ? 'Anulando...' : 'Confirmar anulación'}
                </button>
            </div>
        </>
    )
}
