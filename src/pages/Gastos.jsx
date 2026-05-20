import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X, Check, Pencil, Trash2, AlertTriangle, DollarSign } from 'lucide-react'

const fmt = n => `$${Number(n || 0).toFixed(2)}`
const fmtBs = n => `${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`

const OPCIONES_TASA = [
    { key: 'tasa_bcv',     label: 'USD · BCV' },
    { key: 'tasa_euro',    label: 'EUR · BCV' },
    { key: 'tasa_binance', label: 'USD · Binance' },
]

const METODOS_PAGO = ['Efectivo USD', 'Efectivo Bs.', 'Zelle', 'Transferencia', 'Pago Móvil', 'Punto de Venta', 'Otro']

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

function semaforo(fechaVenc) {
    if (!fechaVenc) return null
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const venc = new Date(fechaVenc + 'T00:00:00')
    const dias = Math.ceil((venc - hoy) / 86400000)
    if (dias < 0) return { color: '#ef4444', bg: '#fef2f2', label: `Vencido hace ${Math.abs(dias)}d`, dot: '🔴' }
    if (dias <= 3) return { color: '#d97706', bg: '#fffbeb', label: `Vence en ${dias}d`, dot: '🟡' }
    return { color: '#16a34a', bg: '#f0fdf4', label: `Vence en ${dias}d`, dot: '🟢' }
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
const PAGE_SIZE = 50

export default function Gastos() {
    const { perfil } = useAuth()
    const [tab, setTab] = useState('gastos')
    const [gastos, setGastos] = useState([])
    const [kpiData, setKpiData] = useState([])
    const [loading, setLoading] = useState(true)
    const [vista, setVista] = useState('lista')
    const [tasas, setTasas] = useState({ tasa_bcv: 1, tasa_euro: 1, tasa_binance: 1 })
    const [tipos, setTipos] = useState([])
    const [gastoPagando, setGastoPagando] = useState(null)
    const [pagina, setPagina] = useState(0)
    const [totalRegistros, setTotalRegistros] = useState(0)

    // Filtros
    const [filtroTipo, setFiltroTipo] = useState('')
    const [filtroDesde, setFiltroDesde] = useState('')
    const [filtroHasta, setFiltroHasta] = useState('')
    const [filtroEstado, setFiltroEstado] = useState('todos')

    useEffect(() => { cargarTasas(); cargarTipos() }, [])
    useEffect(() => { setPagina(0) }, [filtroTipo, filtroDesde, filtroHasta, filtroEstado])
    useEffect(() => { cargarGastos() }, [filtroTipo, filtroDesde, filtroHasta, filtroEstado, pagina])

    async function cargarTasas() {
        const { data } = await supabase.from('configuracion')
            .select('clave, valor').eq('empresa_id', perfil.empresa_id)
            .in('clave', ['tasa_bcv', 'tasa_euro', 'tasa_binance'])
        if (data) {
            const t = {}
            data.forEach(r => { t[r.clave] = Number(r.valor) })
            setTasas(t)
        }
    }

    async function cargarTipos() {
        const { data } = await supabase.from('tipos_gastos')
            .select('id, nombre').eq('empresa_id', perfil.empresa_id)
            .eq('activo', true).order('nombre')
        if (data) setTipos(data)
    }

    async function cargarGastos() {
        setLoading(true)

        let kpiQ = supabase.from('gastos')
            .select('estado, monto_usd, monto_bs, tipo_tasa, fecha_vencimiento')
            .eq('empresa_id', perfil.empresa_id)
        if (filtroTipo) kpiQ = kpiQ.eq('tipo_gasto_id', filtroTipo)
        if (filtroDesde) kpiQ = kpiQ.gte('fecha', filtroDesde)
        if (filtroHasta) kpiQ = kpiQ.lte('fecha', filtroHasta)
        if (filtroEstado !== 'todos') kpiQ = kpiQ.eq('estado', filtroEstado)

        let tablaQ = supabase.from('gastos')
            .select('*, tipos_gastos(nombre), usuarios(nombre), proveedores(nombre)', { count: 'exact' })
            .eq('empresa_id', perfil.empresa_id)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })
            .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1)
        if (filtroTipo) tablaQ = tablaQ.eq('tipo_gasto_id', filtroTipo)
        if (filtroDesde) tablaQ = tablaQ.gte('fecha', filtroDesde)
        if (filtroHasta) tablaQ = tablaQ.lte('fecha', filtroHasta)
        if (filtroEstado !== 'todos') tablaQ = tablaQ.eq('estado', filtroEstado)

        const [{ data: kpi }, { data, count }] = await Promise.all([kpiQ, tablaQ])
        if (kpi) setKpiData(kpi)
        if (data) setGastos(data)
        if (count !== null) setTotalRegistros(count)
        setLoading(false)
    }

    const hayFiltros = filtroTipo || filtroDesde || filtroHasta || filtroEstado !== 'todos'

    // KPIs — calculados sobre la query completa (kpiData), no la página visible
    const pagados = kpiData.filter(g => (g.estado || 'pagado') === 'pagado')
    const pendientes = kpiData.filter(g => (g.estado || 'pagado') === 'pendiente')
    const vencidos = pendientes.filter(g => g.fecha_vencimiento && new Date(g.fecha_vencimiento + 'T00:00:00') < new Date())

    const totalPagadoUsd = pagados.reduce((s, g) => {
        const t = tasas[g.tipo_tasa] || tasas.tasa_bcv || 1
        return s + Number(g.monto_usd || 0) + Number(g.monto_bs || 0) / t
    }, 0)
    const totalPendienteUsd = pendientes.reduce((s, g) => {
        const t = tasas[g.tipo_tasa] || tasas.tasa_bcv || 1
        return s + Number(g.monto_usd || 0) + Number(g.monto_bs || 0) / t
    }, 0)

    if (vista === 'nuevo') return (
        <NuevoGasto
            tasas={tasas}
            tipos={tipos}
            onGuardado={() => { cargarGastos(); setVista('lista') }}
            onCancelar={() => setVista('lista')}
        />
    )

    return (
        <div style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Gastos</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Registro y control de gastos operativos</p>
                </div>
                {tab === 'gastos' && (
                    <button onClick={() => setVista('nuevo')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={16} /> Registrar gasto
                    </button>
                )}
            </div>

            {/* Tabs principal */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'gastos', label: 'Gastos' },
                    { key: 'tipos', label: '⚙️ Tipos de gasto' },
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

            {/* Tab Gastos */}
            {tab === 'gastos' && (
                <>
                    {/* KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>Total pagado</p>
                            <p style={{ fontSize: '22px', fontWeight: 700, color: '#dc2626', margin: '0 0 2px' }}>{fmt(totalPagadoUsd)}</p>
                            <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{pagados.length} registro(s)</p>
                        </div>
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>Programado / pendiente</p>
                            <p style={{ fontSize: '22px', fontWeight: 700, color: '#d97706', margin: '0 0 2px' }}>{fmt(totalPendienteUsd)}</p>
                            <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{pendientes.length} registro(s)</p>
                        </div>
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: `1px solid ${vencidos.length > 0 ? '#fecaca' : '#e5e7eb'}`, padding: '16px 20px' }}>
                            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>Vencidos sin pagar</p>
                            <p style={{ fontSize: '22px', fontWeight: 700, color: vencidos.length > 0 ? '#ef4444' : '#1f2937', margin: '0 0 2px' }}>{vencidos.length}</p>
                            <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>requieren atención</p>
                        </div>
                    </div>

                    {/* Filtro estado */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                        {[['todos', 'Todos'], ['pagado', 'Pagados'], ['pendiente', 'Programados']].map(([val, lbl]) => (
                            <button key={val} onClick={() => setFiltroEstado(val)}
                                style={{
                                    padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                    border: '1px solid', cursor: 'pointer',
                                    borderColor: filtroEstado === val ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: filtroEstado === val ? '#16a34a' : '#fff',
                                    color: filtroEstado === val ? '#fff' : '#6b7280',
                                }}>
                                {lbl}
                                {val === 'pendiente' && pendientes.length > 0 && (
                                    <span style={{ marginLeft: '6px', backgroundColor: filtroEstado === val ? 'rgba(255,255,255,0.3)' : '#f3f4f6', borderRadius: '20px', padding: '1px 6px', fontSize: '11px' }}>
                                        {pendientes.length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Filtros de fecha y tipo */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }}>
                            <option value="">Todos los tipos</option>
                            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>Desde</span>
                            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
                                style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>Hasta</span>
                            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
                                style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', backgroundColor: '#fff' }} />
                        </div>
                        {hayFiltros && (
                            <button onClick={() => { setFiltroTipo(''); setFiltroDesde(''); setFiltroHasta(''); setFiltroEstado('todos') }}
                                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
                                <X size={14} /> Limpiar
                            </button>
                        )}
                    </div>

                    {/* Tabla */}
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>
                        ) : gastos.length === 0 ? (
                            <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No hay gastos registrados</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {['', 'Fecha', 'Nombre', 'Tipo', 'Vencimiento', 'Monto USD', 'Monto Bs.', 'Método', 'Usuario', ''].map((h, i) => (
                                            <th key={i} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {gastos.map(g => {
                                        const estado = g.estado || 'pagado'
                                        const sem = estado === 'pendiente' ? semaforo(g.fecha_vencimiento) : null
                                        return (
                                            <tr key={g.id}
                                                style={{ borderBottom: '1px solid #f3f4f6', backgroundColor: sem?.bg || 'transparent' }}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = sem?.bg || '#f9fafb'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = sem?.bg || 'transparent'}>
                                                {/* Dot semáforo */}
                                                <td style={{ padding: '12px 8px 12px 14px', fontSize: '16px' }}>
                                                    {estado === 'pendiente' ? (sem?.dot || '⚪') : ''}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                                    {new Date(g.fecha + 'T00:00:00').toLocaleDateString('es-VE')}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div>
                                                            <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{g.nombre}</div>
                                                            {g.proveedores?.nombre && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Proveedor: {g.proveedores.nombre}</div>}
                                                            {g.descripcion && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{g.descripcion}</div>}
                                                        </div>
                                                        {estado === 'pendiente' && (
                                                            <span style={{ fontSize: '10px', backgroundColor: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '20px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                Programado
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>
                                                    {g.tipos_gastos?.nombre || g.categoria || '—'}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {estado === 'pendiente'
                                                        ? sem
                                                            ? <span style={{ fontSize: '12px', fontWeight: 500, color: sem.color }}>{sem.label}</span>
                                                            : <span style={{ fontSize: '12px', color: '#9ca3af' }}>—</span>
                                                        : <span style={{ fontSize: '12px', color: '#9ca3af' }}>—</span>
                                                    }
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>
                                                    {Number(g.monto_usd) > 0 ? fmt(g.monto_usd) : '—'}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#d97706' }}>
                                                    {Number(g.monto_bs) > 0 ? fmtBs(g.monto_bs) : '—'}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>
                                                    {g.metodo_pago || '—'}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>
                                                    {g.usuarios?.nombre || '—'}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {estado === 'pendiente' && (
                                                        <button onClick={() => setGastoPagando(g)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                            <DollarSign size={12} /> Pagar
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
                </>
            )}

            {/* Tab Tipos de gasto */}
            {tab === 'tipos' && (
                <TiposGasto tipos={tipos} onActualizado={cargarTipos} />
            )}

            {/* Modal pagar gasto programado */}
            {gastoPagando && (
                <ModalPagarGasto
                    gasto={gastoPagando}
                    tasas={tasas}
                    onPagado={() => { setGastoPagando(null); cargarGastos() }}
                    onCerrar={() => setGastoPagando(null)}
                />
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// MODAL PAGAR GASTO PROGRAMADO
// ══════════════════════════════════════════════════════════════
function ModalPagarGasto({ gasto, tasas, onPagado, onCerrar }) {
    const { perfil } = useAuth()
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
    const [tipoTasa, setTipoTasa] = useState(gasto.tipo_tasa || 'tasa_bcv')
    const [montoUsd, setMontoUsd] = useState(gasto.monto_usd > 0 ? String(gasto.monto_usd) : '')
    const [montoBs, setMontoBs] = useState(gasto.monto_bs > 0 ? String(gasto.monto_bs) : '')
    const [metodoPago, setMetodoPago] = useState(gasto.metodo_pago || 'Efectivo USD')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [cuentasBancarias, setCuentasBancarias] = useState([])
    const [cuentaBancariaId, setCuentaBancariaId] = useState(gasto.cuenta_bancaria_id || '')

    useEffect(() => {
        if (perfil?.empresa_id) {
            supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda').eq('empresa_id', perfil.empresa_id).eq('activa', true)
                .then(({ data }) => setCuentasBancarias(data || []))
        }
    }, [perfil?.empresa_id])

    const tasa = tasas[tipoTasa] || 1
    const totalEnUsd = Number(montoUsd || 0) + (Number(montoBs || 0) / tasa)

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
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>Registrar pago</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>{gasto.nombre}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Fecha pago */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Fecha de pago</label>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Método de pago</label>
                            <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={inputStyle}>
                                {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Tasa */}
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Tasa de referencia</label>
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
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Monto USD</label>
                            <input type="number" min="0" step="0.01" value={montoUsd} onChange={e => setMontoUsd(e.target.value)} placeholder="0.00" style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Monto Bs.</label>
                            <input type="number" min="0" step="1" value={montoBs} onChange={e => setMontoBs(e.target.value)} placeholder="0.00" style={inputStyle} />
                        </div>
                    </div>

                    {(Number(montoUsd) > 0 || Number(montoBs) > 0) && (
                        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', fontWeight: 600 }}>
                            Total equivalente: {fmt(totalEnUsd)}
                        </div>
                    )}

                    {cuentasBancarias.length > 0 && (
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Cuenta bancaria (opcional)</label>
                            <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)} style={inputStyle}>
                                <option value="">— Efectivo / sin cuenta —</option>
                                {cuentasBancarias.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.banco} · {c.moneda})</option>)}
                            </select>
                        </div>
                    )}

                    {error && (
                        <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                        <button onClick={confirmar} disabled={guardando}
                            style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                            <Check size={16} /> {guardando ? 'Guardando...' : 'Confirmar pago'}
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

// ══════════════════════════════════════════════════════════════
// NUEVO GASTO
// ══════════════════════════════════════════════════════════════
function NuevoGasto({ tasas, tipos, onGuardado, onCancelar }) {
    const { perfil } = useAuth()
    const [estadoGasto, setEstadoGasto] = useState('pagado') // 'pagado' | 'pendiente'
    const [nombre, setNombre] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [tipoGastoId, setTipoGastoId] = useState('')
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
    const [fechaVencimiento, setFechaVencimiento] = useState('')
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [montoUsd, setMontoUsd] = useState('')
    const [montoBs, setMontoBs] = useState('')
    const [metodoPago, setMetodoPago] = useState('Efectivo USD')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [cuentasBancarias, setCuentasBancarias] = useState([])
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')
    const [proveedores, setProveedores] = useState([])
    const [proveedorId, setProveedorId] = useState('')

    useEffect(() => {
        if (perfil?.empresa_id) {
            Promise.all([
                supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda').eq('empresa_id', perfil.empresa_id).eq('activa', true),
                supabase.from('proveedores').select('id, nombre').eq('empresa_id', perfil.empresa_id).order('nombre'),
            ]).then(([{ data: cuentas }, { data: provs }]) => {
                setCuentasBancarias(cuentas || [])
                setProveedores(provs || [])
            })
        }
    }, [perfil?.empresa_id])

    const tasa = tasas[tipoTasa] || 1
    const totalEnUsd = Number(montoUsd || 0) + (Number(montoBs || 0) / tasa)

    async function guardar() {
        if (!nombre.trim()) { setError('El nombre del gasto es obligatorio'); return }
        if (!tipoGastoId) { setError('Selecciona el tipo de gasto'); return }
        if (estadoGasto === 'pagado' && Number(montoUsd) <= 0 && Number(montoBs) <= 0) {
            setError('Ingresa al menos un monto'); return
        }
        if (estadoGasto === 'pendiente' && !fechaVencimiento) {
            setError('Ingresa la fecha de vencimiento para el gasto programado'); return
        }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()

        const payload = {
            empresa_id: perfil.empresa_id,
            nombre: nombre.trim(),
            descripcion: descripcion.trim() || null,
            tipo_gasto_id: tipoGastoId,
            categoria: tipos.find(t => t.id === tipoGastoId)?.nombre || '',
            cuenta_bancaria_id: estadoGasto === 'pagado' ? (cuentaBancariaId || null) : null,
            proveedor_id: proveedorId || null,
            fecha,
            estado: estadoGasto,
            fecha_vencimiento: estadoGasto === 'pendiente' ? fechaVencimiento : null,
            monto_usd: Number(montoUsd || 0),
            monto_bs: Number(montoBs || 0),
            tasa_cambio: tasa,
            tipo_tasa: tipoTasa,
            metodo_pago: estadoGasto === 'pagado' ? metodoPago : null,
            usuario_id: user.id,
            monto: totalEnUsd,
        }

        const { error: err } = await supabase.from('gastos').insert(payload)
        if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        setGuardando(false)
        onGuardado()
    }

    return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Registrar gasto</h1>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Toggle pagado / programado */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Tipo de registro</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {[
                            { val: 'pagado', label: '✅ Pagado', sub: 'Erogación ya realizada' },
                            { val: 'pendiente', label: '📅 Programado', sub: 'Pago a realizar en fecha futura' },
                        ].map(opt => (
                            <button key={opt.val} onClick={() => setEstadoGasto(opt.val)}
                                style={{
                                    flex: 1, padding: '10px 14px', borderRadius: '10px', textAlign: 'left',
                                    border: '2px solid', cursor: 'pointer',
                                    borderColor: estadoGasto === opt.val ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: estadoGasto === opt.val ? '#f0fdf4' : '#fff',
                                }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: estadoGasto === opt.val ? '#166534' : '#374151' }}>{opt.label}</div>
                                <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{opt.sub}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Nombre y tipo */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nombre del gasto *</label>
                        <input value={nombre} onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: Pago de alquiler" style={inputStyle} autoFocus />
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Tipo de gasto *</label>
                        <select value={tipoGastoId} onChange={e => setTipoGastoId(e.target.value)} style={inputStyle}>
                            <option value="">Seleccionar tipo...</option>
                            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                        {tipos.length === 0 && (
                            <p style={{ fontSize: '11px', color: '#ef4444', margin: '4px 0 0' }}>
                                No hay tipos configurados. Ve a la pestaña "Tipos de gasto" para crearlos.
                            </p>
                        )}
                    </div>
                </div>

                {/* Proveedor */}
                {proveedores.length > 0 && (
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Proveedor <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                        </label>
                        <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} style={inputStyle}>
                            <option value="">— Sin proveedor —</option>
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                    </div>
                )}

                {/* Fecha */}
                <div style={{ display: 'grid', gridTemplateColumns: estadoGasto === 'pendiente' ? '1fr 1fr' : '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            {estadoGasto === 'pendiente' ? 'Fecha de registro' : 'Fecha de pago *'}
                        </label>
                        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
                    </div>
                    {estadoGasto === 'pendiente' ? (
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Fecha de vencimiento *</label>
                            <input type="date" value={fechaVencimiento} onChange={e => setFechaVencimiento(e.target.value)} style={inputStyle} />
                        </div>
                    ) : (
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Método de pago</label>
                            <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={inputStyle}>
                                {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    )}
                </div>

                {/* Tasa */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Tasa de referencia</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {OPCIONES_TASA.map(o => (
                            <button key={o.key} onClick={() => setTipoTasa(o.key)}
                                style={{
                                    padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                    border: '1px solid', cursor: 'pointer',
                                    borderColor: tipoTasa === o.key ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: tipoTasa === o.key ? '#f0fdf4' : '#fff',
                                    color: tipoTasa === o.key ? '#16a34a' : '#6b7280',
                                }}>
                                {o.label}
                                <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.7 }}>
                                    {tasas[o.key]?.toLocaleString('es-VE')} Bs.
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Montos */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Monto en USD {estadoGasto === 'pendiente' && <span style={{ color: '#9ca3af', fontWeight: 400 }}>(estimado)</span>}
                        </label>
                        <input type="number" min="0" step="0.01" value={montoUsd}
                            onChange={e => setMontoUsd(e.target.value)}
                            placeholder="0.00" style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Monto en Bs. {estadoGasto === 'pendiente' && <span style={{ color: '#9ca3af', fontWeight: 400 }}>(estimado)</span>}
                        </label>
                        <input type="number" min="0" step="1" value={montoBs}
                            onChange={e => setMontoBs(e.target.value)}
                            placeholder="0.00" style={inputStyle} />
                    </div>
                </div>

                {/* Resumen */}
                {(Number(montoUsd) > 0 || Number(montoBs) > 0) && (
                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px' }}>
                        <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Total equivalente {estadoGasto === 'pendiente' ? '(estimado)' : ''}
                        </p>
                        <p style={{ fontSize: '18px', fontWeight: 700, color: '#166534', margin: 0 }}>{fmt(totalEnUsd)}</p>
                        <p style={{ fontSize: '11px', color: '#16a34a', margin: '2px 0 0' }}>
                            {fmt(montoUsd || 0)} USD + {fmtBs(montoBs || 0)} ÷ {tasa.toLocaleString('es-VE')}
                        </p>
                    </div>
                )}

                {/* Cuenta bancaria (solo para gastos pagados) */}
                {estadoGasto === 'pagado' && cuentasBancarias.length > 0 && (
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Cuenta bancaria <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
                        <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)} style={inputStyle}>
                            <option value="">— Efectivo / sin cuenta —</option>
                            {cuentasBancarias.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.banco} · {c.moneda})</option>)}
                        </select>
                    </div>
                )}

                {/* Descripción */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        Descripción <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                        rows={2} placeholder="Notas adicionales sobre este gasto..."
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.7 : 1 }}>
                        <Check size={16} />
                        {guardando ? 'Guardando...' : estadoGasto === 'pendiente' ? 'Programar gasto' : 'Confirmar gasto'}
                    </button>
                    <button onClick={onCancelar}
                        style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// TIPOS DE GASTO
// ══════════════════════════════════════════════════════════════
function TiposGasto({ tipos, onActualizado }) {
    const { perfil } = useAuth()
    const [nuevoNombre, setNuevoNombre] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [editando, setEditando] = useState(null)
    const [error, setError] = useState('')

    async function agregar() {
        if (!nuevoNombre.trim()) { setError('Ingresa un nombre'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.from('tipos_gastos').insert({
            empresa_id: perfil.empresa_id,
            nombre: nuevoNombre.trim(),
        })
        if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        setNuevoNombre('')
        setGuardando(false)
        onActualizado()
    }

    async function guardarEdicion() {
        if (!editando.nombre.trim()) return
        await supabase.from('tipos_gastos').update({ nombre: editando.nombre.trim() }).eq('id', editando.id)
        setEditando(null)
        onActualizado()
    }

    async function eliminar(id) {
        const { count } = await supabase.from('gastos')
            .select('id', { count: 'exact', head: true })
            .eq('tipo_gasto_id', id)
        if (count > 0) {
            setError(`No se puede eliminar — tiene ${count} gasto(s) asociado(s). Puedes renombrarlo en su lugar.`)
            return
        }
        await supabase.from('tipos_gastos').delete().eq('id', id)
        onActualizado()
    }

    return (
        <div style={{ maxWidth: '560px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Tipos de gasto ({tipos.length})</span>
                </div>

                {tipos.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                        No hay tipos configurados. Agrega el primero abajo.
                    </div>
                ) : tipos.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f9fafb' }}>
                        {editando?.id === t.id ? (
                            <div style={{ display: 'flex', gap: '8px', flex: 1, marginRight: '8px' }}>
                                <input value={editando.nombre}
                                    onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditando(null) }}
                                    style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }}
                                    autoFocus />
                                <button onClick={guardarEdicion}
                                    style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
                                    Guardar
                                </button>
                                <button onClick={() => setEditando(null)}
                                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            <>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{t.nombre}</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => { setEditando({ id: t.id, nombre: t.nombre }); setError('') }}
                                        style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#6b7280' }}>
                                        <Pencil size={13} />
                                    </button>
                                    <button onClick={() => { setError(''); eliminar(t.id) }}
                                        style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#dc2626' }}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}

                <div style={{ padding: '14px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px' }}>
                    <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && agregar()}
                        placeholder="Nuevo tipo de gasto..."
                        style={{ ...inputStyle, padding: '8px 12px', fontSize: '13px' }} />
                    <button onClick={agregar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <Plus size={14} /> Agregar
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                    {error}
                </div>
            )}

            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
                Los tipos con gastos asociados no pueden eliminarse — solo renombrarse.
            </p>
        </div>
    )
}
