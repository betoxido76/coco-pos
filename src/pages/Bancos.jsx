import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { ArrowLeft, Plus, Edit2, Landmark, ArrowRightLeft } from 'lucide-react'

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtBs = n => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs.'
const PAGE_SIZE = 50

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

function monedaCampo(moneda) {
    return moneda === 'Bs' ? 'monto_bs' : 'monto_usd'
}

async function calcularSaldoCuenta(cuentaId, moneda, saldoInicial) {
    const campo = monedaCampo(moneda)
    const [{ data: cobros }, { data: movs }, { data: pagos }, { data: gastos }] = await Promise.all([
        supabase.from('cobros').select('monto_usd, monto_bs').eq('cuenta_bancaria_id', cuentaId),
        supabase.from('movimientos_financieros').select('monto_usd, monto_bs, tipo').eq('cuenta_bancaria_id', cuentaId).eq('estado', 'pagado'),
        supabase.from('pagos_proveedor').select('monto_usd, monto_bs').eq('cuenta_bancaria_id', cuentaId),
        supabase.from('gastos').select('monto_usd, monto_bs').eq('cuenta_bancaria_id', cuentaId).eq('estado', 'pagado'),
    ])

    let saldo = Number(saldoInicial || 0)
    saldo += (cobros || []).reduce((s, c) => s + Number(c[campo] || 0), 0)
    saldo += (movs || []).filter(m => ['ingreso', 'transferencia_entrada'].includes(m.tipo))
        .reduce((s, m) => s + Number(m[campo] || 0), 0)
    saldo -= (pagos || []).reduce((s, p) => s + Number(p[campo] || 0), 0)
    saldo -= (gastos || []).reduce((s, g) => s + Number(g[campo] || 0), 0)
    saldo -= (movs || []).filter(m => ['egreso', 'transferencia_salida'].includes(m.tipo))
        .reduce((s, m) => s + Number(m[campo] || 0), 0)
    return saldo
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Bancos() {
    const { perfil } = useAuth()
    const [vista, setVista] = useState('lista')
    const [cuentaDetalle, setCuentaDetalle] = useState(null)
    const [cuentas, setCuentas] = useState([])
    const [saldos, setSaldos] = useState({})
    const [tasas, setTasas] = useState({})
    const [cargando, setCargando] = useState(true)
    const [modalCuenta, setModalCuenta] = useState(null)

    useEffect(() => {
        if (perfil?.empresa_id) cargar()
    }, [perfil?.empresa_id])

    async function cargar() {
        setCargando(true)
        const [{ data: cuentasData }, { data: cfgRows }] = await Promise.all([
            supabase.from('cuentas_bancarias').select('*').eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('configuracion').select('clave, valor'),
        ])

        const lista = cuentasData || []
        setCuentas(lista)
        const cfgMap = {}
        cfgRows?.forEach(r => { cfgMap[r.clave] = Number(r.valor) })
        setTasas({ tasa_bcv: cfgMap.tasa_bcv || 1, tasa_euro: cfgMap.tasa_euro || 1, tasa_binance: cfgMap.tasa_binance || 1 })

        const resultados = await Promise.all(lista.map(c => calcularSaldoCuenta(c.id, c.moneda, c.saldo_inicial)))
        const mapa = {}
        lista.forEach((c, i) => { mapa[c.id] = resultados[i] })
        setSaldos(mapa)
        setCargando(false)
    }

    async function toggleActiva(cuenta) {
        await supabase.from('cuentas_bancarias').update({ activa: !cuenta.activa }).eq('id', cuenta.id)
        cargar()
    }

    const totalUsd = cuentas.filter(c => c.moneda !== 'Bs').reduce((s, c) => s + (saldos[c.id] || 0), 0)
    const totalBs = cuentas.filter(c => c.moneda === 'Bs').reduce((s, c) => s + (saldos[c.id] || 0), 0)
    const cuentasActivas = cuentas.filter(c => c.activa).length

    if (vista === 'detalle' && cuentaDetalle) {
        return (
            <VistaDetalle
                cuenta={cuentaDetalle}
                tasas={tasas}
                onVolver={() => { setVista('lista'); setCuentaDetalle(null); cargar() }}
            />
        )
    }

    return (
        <div style={{ padding: '28px', maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
                <div>
                    <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Bancos</h1>
                    <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0' }}>Posición de saldo por cuenta</p>
                </div>
                <button onClick={() => setModalCuenta({})}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                    <Plus size={16} /> Nueva cuenta
                </button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
                {[
                    { label: 'Posición total USD', value: fmt(totalUsd), color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
                    { label: 'Total en Bs.', value: fmtBs(totalBs), color: '#854d0e', bg: '#fffbeb', border: '#fde68a' },
                    { label: 'Cuentas activas', value: cuentasActivas, color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
                ].map(k => (
                    <div key={k.label} style={{ backgroundColor: k.bg, border: `1px solid ${k.border}`, borderRadius: '12px', padding: '16px 20px' }}>
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 6px' }}>{k.label}</p>
                        <p style={{ fontSize: '22px', fontWeight: 700, color: k.color, margin: 0 }}>{k.value}</p>
                    </div>
                ))}
            </div>

            {/* Tabla */}
            {cargando ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>Calculando saldos...</div>
            ) : cuentas.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#9ca3af' }}>
                    <Landmark size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <p style={{ margin: 0 }}>No hay cuentas bancarias registradas</p>
                </div>
            ) : (
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Cuenta', 'Banco', 'Tipo', 'Moneda', 'Saldo actual', 'Acciones'].map(h => (
                                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {cuentas.map(c => {
                                const saldo = saldos[c.id] ?? 0
                                const badge = c.moneda === 'USD'
                                    ? { bg: '#dcfce7', color: '#166534' }
                                    : c.moneda === 'Bs'
                                        ? { bg: '#fef9c3', color: '#854d0e' }
                                        : { bg: '#dbeafe', color: '#1e40af' }
                                return (
                                    <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: c.activa ? 1 : 0.5 }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>{c.nombre}</td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#374151' }}>{c.banco}</td>
                                        <td style={{ padding: '14px 16px', fontSize: '13px', color: '#6b7280', textTransform: 'capitalize' }}>{c.tipo_cuenta}</td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 10px', borderRadius: '20px', backgroundColor: badge.bg, color: badge.color }}>{c.moneda}</span>
                                        </td>
                                        <td style={{ padding: '14px 16px', fontSize: '15px', fontWeight: 700, color: saldo >= 0 ? '#15803d' : '#dc2626' }}>
                                            {c.moneda === 'Bs' ? fmtBs(saldo) : fmt(saldo)}
                                        </td>
                                        <td style={{ padding: '14px 16px' }}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <button onClick={() => { setCuentaDetalle(c); setVista('detalle') }}
                                                    style={{ fontSize: '12px', padding: '5px 12px', borderRadius: '7px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', cursor: 'pointer', fontWeight: 500 }}>
                                                    Ver movimientos
                                                </button>
                                                <button onClick={() => setModalCuenta(c)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', padding: '4px' }}>
                                                    <Edit2 size={15} />
                                                </button>
                                                <button onClick={() => toggleActiva(c)} title={c.activa ? 'Desactivar' : 'Activar'}
                                                    style={{ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', backgroundColor: c.activa ? '#16a34a' : '#d1d5db', position: 'relative', transition: 'background 0.2s', padding: 0 }}>
                                                    <span style={{ position: 'absolute', top: '2px', left: c.activa ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s' }} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {modalCuenta !== null && (
                <ModalCuenta
                    cuentaEditar={modalCuenta?.id ? modalCuenta : null}
                    onGuardado={() => { setModalCuenta(null); cargar() }}
                    onCerrar={() => setModalCuenta(null)}
                />
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// VISTA DETALLE
// ══════════════════════════════════════════════════════════════
function VistaDetalle({ cuenta, tasas, onVolver }) {
    const { perfil } = useAuth()
    const hoy = new Date().toISOString().split('T')[0]
    const primerDiaMes = hoy.slice(0, 7) + '-01'

    const [desde, setDesde] = useState(primerDiaMes)
    const [hasta, setHasta] = useState(hoy)
    const [movimientos, setMovimientos] = useState([])
    const [saldoActual, setSaldoActual] = useState(0)
    const [cargando, setCargando] = useState(true)
    const [pagina, setPagina] = useState(0)
    const [modalMovimiento, setModalMovimiento] = useState(false)
    const [modalTransferencia, setModalTransferencia] = useState(false)
    const [otrasCuentas, setOtrasCuentas] = useState([])

    useEffect(() => {
        if (perfil?.empresa_id) {
            supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda').eq('empresa_id', perfil.empresa_id).eq('activa', true)
                .then(({ data }) => setOtrasCuentas((data || []).filter(c => c.id !== cuenta.id)))
        }
    }, [perfil?.empresa_id])

    useEffect(() => {
        if (perfil?.empresa_id) cargar()
    }, [desde, hasta, perfil?.empresa_id])

    async function cargar() {
        setCargando(true)
        const campo = monedaCampo(cuenta.moneda)

        const [{ data: cobros }, { data: movManuales }, { data: pagos }, { data: gastosData }, saldo] = await Promise.all([
            supabase.from('cobros')
                .select('id, monto_usd, monto_bs, created_at, ventas(numero_factura, clientes(nombre))')
                .eq('cuenta_bancaria_id', cuenta.id)
                .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59'),

            supabase.from('movimientos_financieros')
                .select('id, monto_usd, monto_bs, tipo, concepto, descripcion, fecha')
                .eq('cuenta_bancaria_id', cuenta.id)
                .eq('estado', 'pagado')
                .gte('fecha', desde).lte('fecha', hasta),

            supabase.from('pagos_proveedor')
                .select('id, monto_usd, monto_bs, created_at, compras(numero_doc, proveedores(nombre))')
                .eq('cuenta_bancaria_id', cuenta.id)
                .gte('created_at', desde).lte('created_at', hasta + 'T23:59:59'),

            supabase.from('gastos')
                .select('id, monto_usd, monto_bs, nombre, fecha')
                .eq('cuenta_bancaria_id', cuenta.id)
                .eq('estado', 'pagado')
                .gte('fecha', desde).lte('fecha', hasta),

            calcularSaldoCuenta(cuenta.id, cuenta.moneda, cuenta.saldo_inicial),
        ])

        setSaldoActual(saldo)

        const LABEL = {
            ingreso: 'Ingreso manual',
            egreso: 'Egreso manual',
            transferencia_entrada: 'Transferencia recibida',
            transferencia_salida: 'Transferencia enviada',
        }

        const lista = [
            ...(cobros || []).map(c => ({
                id: c.id, key: 'cobro-' + c.id,
                fecha: c.created_at?.split('T')[0],
                origen: 'cobro', label: 'Cobro venta',
                descripcion: [c.ventas?.numero_factura, c.ventas?.clientes?.nombre].filter(Boolean).join(' · '),
                monto: Number(c[campo] || 0), signo: 1,
            })),
            ...(movManuales || []).map(m => ({
                id: m.id, key: 'mov-' + m.id,
                fecha: m.fecha,
                origen: ['transferencia_entrada', 'transferencia_salida'].includes(m.tipo) ? 'transferencia' : m.tipo,
                label: LABEL[m.tipo] || m.tipo,
                descripcion: m.concepto + (m.descripcion ? ` — ${m.descripcion}` : ''),
                monto: Number(m[campo] || 0),
                signo: ['ingreso', 'transferencia_entrada'].includes(m.tipo) ? 1 : -1,
            })),
            ...(pagos || []).map(p => ({
                id: p.id, key: 'pago-' + p.id,
                fecha: p.created_at?.split('T')[0],
                origen: 'pago', label: 'Pago proveedor',
                descripcion: [p.compras?.numero_doc, p.compras?.proveedores?.nombre].filter(Boolean).join(' · '),
                monto: Number(p[campo] || 0), signo: -1,
            })),
            ...(gastosData || []).map(g => ({
                id: g.id, key: 'gasto-' + g.id,
                fecha: g.fecha,
                origen: 'gasto', label: 'Gasto',
                descripcion: g.nombre,
                monto: Number(g[campo] || 0), signo: -1,
            })),
        ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

        // Saldo acumulado: empezar desde saldo_actual y restar/sumar hacia atrás
        let saldoCorr = saldo
        const conSaldo = lista.map(m => {
            const s = saldoCorr
            saldoCorr -= m.signo * m.monto
            return { ...m, saldoAcum: s }
        })

        setMovimientos(conSaldo)
        setPagina(0)
        setCargando(false)
    }

    const totalIngresos = movimientos.filter(m => m.signo === 1).reduce((s, m) => s + m.monto, 0)
    const totalEgresos = movimientos.filter(m => m.signo === -1).reduce((s, m) => s + m.monto, 0)
    const neto = totalIngresos - totalEgresos

    const totalPags = Math.ceil(movimientos.length / PAGE_SIZE)
    const paginados = movimientos.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE)

    const fmtSaldo = v => cuenta.moneda === 'Bs' ? fmtBs(v) : fmt(v)

    const badgeOrigen = {
        cobro:         { bg: '#dcfce7', color: '#166534' },
        ingreso:       { bg: '#dcfce7', color: '#166534' },
        pago:          { bg: '#fef2f2', color: '#991b1b' },
        egreso:        { bg: '#fef2f2', color: '#991b1b' },
        gasto:         { bg: '#fef2f2', color: '#991b1b' },
        transferencia: { bg: '#dbeafe', color: '#1e40af' },
    }

    return (
        <div style={{ padding: '28px', maxWidth: '1100px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    <button onClick={onVolver}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: '#374151', fontSize: '13px' }}>
                        <ArrowLeft size={14} /> Volver
                    </button>
                    <div>
                        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1f2937', margin: 0 }}>{cuenta.nombre}</h2>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '3px 0 0' }}>
                            {cuenta.banco}{cuenta.numero_cuenta ? ` · ${cuenta.numero_cuenta}` : ''} · Saldo actual:{' '}
                            <strong style={{ color: saldoActual >= 0 ? '#16a34a' : '#dc2626' }}>{fmtSaldo(saldoActual)}</strong>
                        </p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setModalMovimiento(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={14} /> Movimiento manual
                    </button>
                    <button onClick={() => setModalTransferencia(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                        <ArrowRightLeft size={14} /> Transferencia
                    </button>
                </div>
            </div>

            {/* Filtro fechas */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '20px' }}>
                {[{ label: 'Desde', val: desde, set: setDesde }, { label: 'Hasta', val: hasta, set: setHasta }].map(f => (
                    <div key={f.label}>
                        <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>{f.label}</label>
                        <input type="date" value={f.val} onChange={e => f.set(e.target.value)}
                            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px' }} />
                    </div>
                ))}
            </div>

            {/* KPIs período */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                {[
                    { label: 'Ingresos del período', value: fmtSaldo(totalIngresos), color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
                    { label: 'Egresos del período', value: fmtSaldo(totalEgresos), color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
                    { label: 'Neto', value: fmtSaldo(neto), color: neto >= 0 ? '#166534' : '#991b1b', bg: '#f9fafb', border: '#e5e7eb' },
                ].map(k => (
                    <div key={k.label} style={{ backgroundColor: k.bg, border: `1px solid ${k.border}`, borderRadius: '10px', padding: '14px 16px' }}>
                        <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 4px' }}>{k.label}</p>
                        <p style={{ fontSize: '18px', fontWeight: 700, color: k.color, margin: 0 }}>{k.value}</p>
                    </div>
                ))}
            </div>

            {/* Tabla movimientos */}
            {cargando ? (
                <div style={{ textAlign: 'center', padding: '50px', color: '#9ca3af' }}>Cargando movimientos...</div>
            ) : movimientos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '50px', color: '#9ca3af' }}>Sin movimientos en este período</div>
            ) : (
                <>
                    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {[
                                        { h: 'Fecha', right: false }, { h: 'Origen', right: false },
                                        { h: 'Descripción', right: false }, { h: 'Ingreso', right: true },
                                        { h: 'Egreso', right: true }, { h: 'Saldo', right: true },
                                    ].map(({ h, right }) => (
                                        <th key={h} style={{ padding: '11px 14px', textAlign: right ? 'right' : 'left', fontSize: '12px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paginados.map(m => {
                                    const badge = badgeOrigen[m.origen] || { bg: '#f3f4f6', color: '#374151' }
                                    return (
                                        <tr key={m.key} style={{ borderBottom: '1px solid #f3f4f6' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            <td style={{ padding: '11px 14px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                                {m.fecha ? new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-VE') : '—'}
                                            </td>
                                            <td style={{ padding: '11px 14px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', backgroundColor: badge.bg, color: badge.color }}>{m.label}</span>
                                            </td>
                                            <td style={{ padding: '11px 14px', fontSize: '13px', color: '#374151', maxWidth: '260px' }}>
                                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion}</div>
                                            </td>
                                            <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 600, color: '#16a34a', textAlign: 'right' }}>
                                                {m.signo === 1 ? fmtSaldo(m.monto) : '—'}
                                            </td>
                                            <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 600, color: '#dc2626', textAlign: 'right' }}>
                                                {m.signo === -1 ? fmtSaldo(m.monto) : '—'}
                                            </td>
                                            <td style={{ padding: '11px 14px', fontSize: '13px', fontWeight: 700, color: m.saldoAcum >= 0 ? '#1f2937' : '#dc2626', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                {fmtSaldo(m.saldoAcum)}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>

                    {totalPags > 1 && (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', marginTop: '20px' }}>
                            <button onClick={() => setPagina(p => Math.max(0, p - 1))} disabled={pagina === 0}
                                style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #e5e7eb', backgroundColor: '#fff', cursor: pagina === 0 ? 'default' : 'pointer', opacity: pagina === 0 ? 0.4 : 1 }}>← Anterior</button>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>Pág. {pagina + 1} de {totalPags}</span>
                            <button onClick={() => setPagina(p => Math.min(totalPags - 1, p + 1))} disabled={pagina >= totalPags - 1}
                                style={{ padding: '6px 14px', borderRadius: '7px', border: '1px solid #e5e7eb', backgroundColor: '#fff', cursor: pagina >= totalPags - 1 ? 'default' : 'pointer', opacity: pagina >= totalPags - 1 ? 0.4 : 1 }}>Siguiente →</button>
                        </div>
                    )}
                </>
            )}

            {modalMovimiento && (
                <ModalMovimientoManual
                    cuenta={cuenta}
                    tasas={tasas}
                    onGuardado={() => { setModalMovimiento(false); cargar() }}
                    onCerrar={() => setModalMovimiento(false)}
                />
            )}
            {modalTransferencia && (
                <ModalTransferencia
                    cuentaOrigen={cuenta}
                    otrasCuentas={otrasCuentas}
                    tasas={tasas}
                    onGuardado={() => { setModalTransferencia(false); cargar() }}
                    onCerrar={() => setModalTransferencia(false)}
                />
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// MODAL CUENTA
// ══════════════════════════════════════════════════════════════
function ModalCuenta({ cuentaEditar, onGuardado, onCerrar }) {
    const { perfil } = useAuth()
    const [nombre, setNombre] = useState(cuentaEditar?.nombre || '')
    const [banco, setBanco] = useState(cuentaEditar?.banco || '')
    const [numeroCuenta, setNumeroCuenta] = useState(cuentaEditar?.numero_cuenta || '')
    const [tipoCuenta, setTipoCuenta] = useState(cuentaEditar?.tipo_cuenta || 'corriente')
    const [moneda, setMoneda] = useState(cuentaEditar?.moneda || 'USD')
    const [saldoInicial, setSaldoInicial] = useState(cuentaEditar?.saldo_inicial ?? '')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    async function guardar() {
        if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
        if (!banco.trim()) { setError('El banco es obligatorio'); return }
        setGuardando(true); setError('')

        const payload = {
            nombre: nombre.trim(), banco: banco.trim(),
            numero_cuenta: numeroCuenta.trim() || null,
            tipo_cuenta: tipoCuenta, moneda,
            saldo_inicial: Number(saldoInicial || 0),
        }

        if (cuentaEditar) {
            const { error: err } = await supabase.from('cuentas_bancarias').update(payload).eq('id', cuentaEditar.id)
            if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        } else {
            const { error: err } = await supabase.from('cuentas_bancarias').insert({ ...payload, empresa_id: perfil.empresa_id })
            if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        }

        setGuardando(false)
        onGuardado()
    }

    const btnToggle = active => ({
        padding: '7px 14px', borderRadius: '7px', border: '1px solid', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
        borderColor: active ? '#16a34a' : '#e5e7eb',
        backgroundColor: active ? '#f0fdf4' : '#fff',
        color: active ? '#16a34a' : '#6b7280',
    })

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '460px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 24px' }}>
                    {cuentaEditar ? 'Editar cuenta' : 'Nueva cuenta bancaria'}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nombre *</label>
                        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Banesco USD principal" style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Banco *</label>
                        <input value={banco} onChange={e => setBanco(e.target.value)} placeholder="Ej: Banesco, BDV, Mercantil" style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Número de cuenta</label>
                        <input value={numeroCuenta} onChange={e => setNumeroCuenta(e.target.value)} placeholder="Opcional" style={inputStyle} />
                    </div>

                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Tipo</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {['corriente', 'ahorro', 'otro'].map(t => (
                                <button key={t} onClick={() => setTipoCuenta(t)} style={btnToggle(tipoCuenta === t)}>
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Moneda</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {['USD', 'Bs', 'EUR'].map(m => (
                                <button key={m} onClick={() => setMoneda(m)} style={btnToggle(moneda === m)}>{m}</button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Saldo inicial</label>
                        <input type="number" min="0" step="0.01" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} placeholder="0.00" style={inputStyle} />
                        <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>Saldo al momento de registrar la cuenta en el sistema</p>
                    </div>

                    {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                        <button onClick={guardar} disabled={guardando}
                            style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                            {guardando ? 'Guardando...' : cuentaEditar ? 'Guardar cambios' : 'Crear cuenta'}
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
// MODAL MOVIMIENTO MANUAL
// ══════════════════════════════════════════════════════════════
function ModalMovimientoManual({ cuenta, tasas, onGuardado, onCerrar }) {
    const { perfil } = useAuth()
    const [tipo, setTipo] = useState('ingreso')
    const [concepto, setConcepto] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
    const [monto, setMonto] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    async function guardar() {
        if (!concepto.trim()) { setError('El concepto es obligatorio'); return }
        if (!monto || Number(monto) <= 0) { setError('Ingresa un monto válido'); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()
        const montoNum = Number(monto)

        const { error: err } = await supabase.from('movimientos_financieros').insert({
            empresa_id: perfil.empresa_id,
            cuenta_bancaria_id: cuenta.id,
            tipo, estado: 'pagado',
            concepto: concepto.trim(),
            descripcion: descripcion.trim() || null,
            fecha,
            monto_usd: cuenta.moneda !== 'Bs' ? montoNum : 0,
            monto_bs: cuenta.moneda === 'Bs' ? montoNum : 0,
            tasa_cambio: Number(tasas.tasa_bcv || 1),
            tipo_tasa: 'tasa_bcv',
            usuario_id: user.id,
        })

        if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        setGuardando(false)
        onGuardado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>Nuevo movimiento manual</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>{cuenta.nombre}</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Tipo</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setTipo('ingreso')}
                                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '13px', fontWeight: 500, borderColor: tipo === 'ingreso' ? '#16a34a' : '#e5e7eb', backgroundColor: tipo === 'ingreso' ? '#f0fdf4' : '#fff', color: tipo === 'ingreso' ? '#16a34a' : '#6b7280' }}>
                                ↑ Ingreso
                            </button>
                            <button onClick={() => setTipo('egreso')}
                                style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid', cursor: 'pointer', fontSize: '13px', fontWeight: 500, borderColor: tipo === 'egreso' ? '#dc2626' : '#e5e7eb', backgroundColor: tipo === 'egreso' ? '#fef2f2' : '#fff', color: tipo === 'egreso' ? '#dc2626' : '#6b7280' }}>
                                ↓ Egreso
                            </button>
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Concepto *</label>
                        <input value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: Depósito capital, Retiro gastos..." style={inputStyle} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Fecha</label>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Monto ({cuenta.moneda}) *</label>
                            <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" style={inputStyle} />
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Descripción (opcional)</label>
                        <input value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Referencia o nota adicional" style={inputStyle} />
                    </div>

                    {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                        <button onClick={guardar} disabled={guardando}
                            style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                            {guardando ? 'Guardando...' : 'Guardar'}
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
// MODAL TRANSFERENCIA
// ══════════════════════════════════════════════════════════════
function ModalTransferencia({ cuentaOrigen, otrasCuentas, tasas, onGuardado, onCerrar }) {
    const { perfil } = useAuth()
    const [cuentaDestinoId, setCuentaDestinoId] = useState(otrasCuentas[0]?.id || '')
    const [monto, setMonto] = useState('')
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
    const [referencia, setReferencia] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    const cuentaDestino = otrasCuentas.find(c => c.id === cuentaDestinoId)
    const moneda = cuentaOrigen.moneda

    async function guardar() {
        if (!cuentaDestinoId) { setError('Selecciona una cuenta destino'); return }
        if (!monto || Number(monto) <= 0) { setError('Ingresa un monto válido'); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()
        const montoNum = Number(monto)
        const id1 = crypto.randomUUID()
        const id2 = crypto.randomUUID()

        const { error: err } = await supabase.from('movimientos_financieros').insert([
            {
                id: id1, empresa_id: perfil.empresa_id,
                cuenta_bancaria_id: cuentaOrigen.id,
                tipo: 'transferencia_salida', estado: 'pagado',
                concepto: `Transferencia a ${cuentaDestino?.nombre || '—'}`,
                descripcion: referencia || null, fecha,
                monto_usd: moneda !== 'Bs' ? montoNum : 0,
                monto_bs: moneda === 'Bs' ? montoNum : 0,
                tasa_cambio: Number(tasas.tasa_bcv || 1), tipo_tasa: 'tasa_bcv',
                transferencia_par_id: id2, usuario_id: user.id,
            },
            {
                id: id2, empresa_id: perfil.empresa_id,
                cuenta_bancaria_id: cuentaDestinoId,
                tipo: 'transferencia_entrada', estado: 'pagado',
                concepto: `Transferencia desde ${cuentaOrigen.nombre}`,
                descripcion: referencia || null, fecha,
                monto_usd: moneda !== 'Bs' ? montoNum : 0,
                monto_bs: moneda === 'Bs' ? montoNum : 0,
                tasa_cambio: Number(tasas.tasa_bcv || 1), tipo_tasa: 'tasa_bcv',
                transferencia_par_id: id1, usuario_id: user.id,
            },
        ])

        if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        setGuardando(false)
        onGuardado()
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '440px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 4px' }}>Transferencia entre cuentas</h3>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 20px' }}>Mueve fondos entre tus cuentas propias</p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Cuenta origen</label>
                        <div style={{ padding: '9px 12px', backgroundColor: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#374151' }}>
                            {cuentaOrigen.nombre} <span style={{ color: '#9ca3af' }}>({cuentaOrigen.banco} · {moneda})</span>
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Cuenta destino *</label>
                        {otrasCuentas.length === 0 ? (
                            <div style={{ padding: '9px 12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '13px', color: '#dc2626' }}>
                                No hay otras cuentas activas registradas
                            </div>
                        ) : (
                            <select value={cuentaDestinoId} onChange={e => setCuentaDestinoId(e.target.value)} style={inputStyle}>
                                {otrasCuentas.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre} ({c.banco} · {c.moneda})</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Monto ({moneda}) *</label>
                            <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" style={inputStyle} />
                        </div>
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Fecha</label>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Referencia (opcional)</label>
                        <input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Número de referencia o descripción" style={inputStyle} />
                    </div>

                    {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                        <button onClick={guardar} disabled={guardando || otrasCuentas.length === 0}
                            style={{ flex: 2, backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: (guardando || otrasCuentas.length === 0) ? 0.6 : 1 }}>
                            {guardando ? 'Procesando...' : 'Confirmar transferencia'}
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
