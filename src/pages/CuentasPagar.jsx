import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { AlertTriangle, CheckCircle, Clock, DollarSign } from 'lucide-react'

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

    useEffect(() => { setPagina(0) }, [filtro, filtroProveedor])
    useEffect(() => { cargarDatos() }, [filtro, filtroProveedor, pagina])

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
            .select('*, proveedores(nombre)', { count: 'exact' })
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

    function abrirModal(compra) {
        setCompraSeleccionada(compra)
        setMostrarModal(true)
    }

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

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
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
            </div>

            {/* Tabla */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : compras.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay compras a crédito {filtro !== 'todos' ? `con estado "${filtro}"` : ''}</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Documento', 'Proveedor', 'Vencimiento', 'Total', 'Pagado', 'Saldo', 'Estado', 'Accion'].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: [3, 4, 5].includes(i) ? 'right' : 'left' }}>{h}</th>
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
                                            {c.estado_cobro !== 'pagado' && c.estado_cobro !== 'anulado' && (
                                                <button onClick={() => abrirModal(c)}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>
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

            {mostrarModal && compraSeleccionada && (
                <ModalPago
                    compra={compraSeleccionada}
                    saldo={calcularSaldo(compraSeleccionada)}
                    tasas={tasas}
                    onCerrar={() => { setMostrarModal(false); setCompraSeleccionada(null) }}
                    onPagado={() => { setMostrarModal(false); setCompraSeleccionada(null); cargarDatos() }}
                />
            )}
        </div>
    )
}

// ─── Modal de Pago ─────────────────────────────────────────────
function ModalPago({ compra, saldo, tasas, onCerrar, onPagado }) {
    const { perfil } = useAuth()
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

    useEffect(() => {
        if (perfil?.empresa_id) {
            supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda').eq('empresa_id', perfil.empresa_id).eq('activa', true)
                .then(({ data }) => setCuentasBancarias(data || []))
        }
    }, [perfil?.empresa_id])

    const tasa = Number(tasas[tipoTasa] || 1)
    const totalEnBs = Number(montoUsd || 0) * tasa

    async function confirmar() {
        if (!montoUsd || Number(montoUsd) <= 0) { setError('Ingresa un monto válido'); return }
        if (Number(montoUsd) > saldo + 0.01) { setError(`El monto no puede superar el saldo de ${fmt(saldo)}`); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()

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

                <div style={{ backgroundColor: '#eff6ff', borderRadius: '8px', padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: '#16a34a' }}>Saldo pendiente</span>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a' }}>{fmt(saldo)}</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Tasa de cambio</label>
                        <select value={tipoTasa} onChange={e => setTipoTasa(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', backgroundColor: '#fff' }}>
                            <option value="tasa_bcv">BCV — {Number(tasas.tasa_bcv || 0).toFixed(2)} Bs/$</option>
                            <option value="tasa_euro">Euro — {Number(tasas.tasa_euro || 0).toFixed(2)} Bs/€</option>
                            <option value="tasa_binance">Binance — {Number(tasas.tasa_binance || 0).toFixed(2)} Bs/$</option>
                        </select>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Monto USD</label>
                            <input type="number" value={montoUsd} onChange={e => setMontoUsd(e.target.value)} step="0.01"
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
                            <input type="number" value={montoBs} onChange={e => setMontoBs(e.target.value)} placeholder="0.00"
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
                </div>

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