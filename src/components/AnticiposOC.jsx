// Anticipos a proveedor ligados a una orden de compra (docs/plan-anticipos-proveedor.md).
//
// Un anticipo es dinero entregado al proveedor antes de recibir: sale del banco
// el día que se paga y queda como saldo a favor hasta que se aplica a una
// recepción. Toda escritura pasa por RPC (anticipos_proveedor.sql):
//   registrar_anticipo_proveedor · anular_anticipo_proveedor
// La lectura va contra la vista v_anticipos_saldo (aplicado / reembolsado / saldo).
//
// El registro usa la ventana única de pago (ModalPagoObligacion): fecha + tasa
// de ESA fecha, montos USD/Bs, métodos y cuenta bancaria. No escribir otra.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import ModalPagoObligacion, { labelMetodo } from './ModalPagoObligacion'
import { fmtFechaCorta } from './SelectorFechaTasa'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`
const fmtBs = (n) => `${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`

export const ESTADOS_ANTICIPO = {
    disponible:       { bg: '#fef9c3', color: '#854d0e', label: 'Disponible' },
    aplicado_parcial: { bg: '#dbeafe', color: '#1e40af', label: 'Aplicado parcial' },
    aplicado:         { bg: '#dcfce7', color: '#166534', label: 'Aplicado' },
    reembolsado:      { bg: '#e0e7ff', color: '#3730a3', label: 'Reembolsado' },
    anulado:          { bg: '#f3f4f6', color: '#6b7280', label: 'Anulado' },
}

export function BadgeAnticipo({ estado }) {
    const s = ESTADOS_ANTICIPO[estado] || ESTADOS_ANTICIPO.disponible
    return <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{s.label}</span>
}

// Decisiones 0.2 / 0.3 del plan. La base valida lo mismo; esto solo evita
// mostrar botones que van a fallar.
export function usePermisosAnticipo() {
    const { perfil, modulosActivos } = useAuth()
    const puedeOperar = perfil?.rol === 'superadmin'
        || (modulosActivos || []).some(m => m === 'compras' || m === 'cxp')
    const puedeAnular = ['admin', 'finanzas', 'superadmin'].includes(perfil?.rol)
    return { puedeOperar, puedeAnular }
}

const ESTADOS_OC_CON_ANTICIPO = ['pendiente', 'aprobada', 'recibida_parcial']

// ── Sección dentro del detalle de la OC ─────────────────────────────────────
export default function AnticiposOC({ orden }) {
    const { perfil } = useAuth()
    const { puedeOperar, puedeAnular } = usePermisosAnticipo()
    const [anticipos, setAnticipos] = useState([])
    const [cargando, setCargando] = useState(true)
    const [registrando, setRegistrando] = useState(false)
    const [anulando, setAnulando] = useState(null)

    async function cargar() {
        setCargando(true)
        const { data } = await supabase.from('v_anticipos_saldo')
            .select('*')
            .eq('empresa_id', perfil.empresa_id)
            .eq('orden_compra_id', orden.id)
            .order('created_at', { ascending: true })
        setAnticipos(data || [])
        setCargando(false)
    }

    useEffect(() => { if (perfil?.empresa_id) cargar() }, [perfil?.empresa_id, orden.id])

    const vigentes = anticipos.filter(a => a.estado !== 'anulado')
    const totalAnticipado = vigentes.reduce((s, a) => s + Number(a.monto_equiv_usd || 0), 0)
    const saldoTotal = vigentes.reduce((s, a) => s + Number(a.saldo_usd || 0), 0)
    const totalOC = Number(orden.total || 0)
    const disponibleParaAnticipar = Math.max(0, totalOC - totalAnticipado)
    const admiteAnticipo = ESTADOS_OC_CON_ANTICIPO.includes(orden.estado)

    return (
        <div className="no-print" style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px 24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: anticipos.length ? '14px' : 0 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Anticipos al proveedor</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                        {vigentes.length === 0
                            ? 'Sin anticipos. El pago se registra al recibir la mercancía.'
                            : <>Anticipado {fmt(totalAnticipado)} de {fmt(totalOC)} · <strong style={{ color: saldoTotal > 0.01 ? '#854d0e' : '#166534' }}>saldo por aplicar {fmt(saldoTotal)}</strong></>}
                    </div>
                </div>
                {puedeOperar && admiteAnticipo && disponibleParaAnticipar > 0.01 && (
                    <button onClick={() => setRegistrando(true)}
                        style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        + Registrar anticipo
                    </button>
                )}
            </div>

            {cargando ? (
                <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '10px' }}>Cargando…</div>
            ) : anticipos.length > 0 && (
                <TablaAnticipos anticipos={anticipos} puedeAnular={puedeAnular} onAnular={setAnulando} />
            )}

            {registrando && (
                <ModalRegistrarAnticipo
                    orden={orden}
                    totalAnticipado={totalAnticipado}
                    onRegistrado={() => { setRegistrando(false); cargar() }}
                    onCerrar={() => setRegistrando(false)} />
            )}
            {anulando && (
                <ModalAnularAnticipo
                    anticipo={anulando}
                    onAnulado={() => { setAnulando(null); cargar() }}
                    onCerrar={() => setAnulando(null)} />
            )}
        </div>
    )
}

// ── Tabla reutilizable (OC y, en la Fase 5, CxP) ────────────────────────────
export function TablaAnticipos({ anticipos, puedeAnular, onAnular, mostrarOC = false }) {
    const th = { padding: '8px 10px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }
    const td = { padding: '10px', fontSize: '13px', color: '#374151', whiteSpace: 'nowrap' }
    return (
        <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                        {['N°', 'Fecha', ...(mostrarOC ? ['OC', 'Proveedor'] : []), 'Pagado', 'Aplicado', 'Saldo', 'Estado', ''].map((h, i) => (
                            <th key={i} style={{ ...th, textAlign: ['Pagado', 'Aplicado', 'Saldo'].includes(h) ? 'right' : 'left' }}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {anticipos.map(a => {
                        const anulado = a.estado === 'anulado'
                        const metodos = [labelMetodo(a.metodo_usd), labelMetodo(a.metodo_bs)].filter(Boolean).join(' / ')
                        return (
                            <tr key={a.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: anulado ? 0.55 : 1 }}>
                                <td style={{ ...td, fontFamily: 'monospace' }}>
                                    {a.numero_anticipo}
                                    {a.nro_doc_proveedor && <div style={{ fontFamily: 'system-ui', fontSize: '11px', color: '#6b7280' }}>Doc. prov.: {a.nro_doc_proveedor}</div>}
                                </td>
                                <td style={td}>{fmtFechaCorta(a.fecha)}</td>
                                {mostrarOC && <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{a.ordenes_compra?.numero_oc || '—'}</td>}
                                {mostrarOC && <td style={td}>{a.proveedores?.nombre || '—'}</td>}
                                <td style={{ ...td, textAlign: 'right' }}>
                                    <div style={{ fontWeight: 600 }}>{fmt(a.monto_equiv_usd)}</div>
                                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                        {[Number(a.monto_usd) > 0 && fmt(a.monto_usd), Number(a.monto_bs) > 0 && fmtBs(a.monto_bs)].filter(Boolean).join(' + ')}
                                        {metodos && ` · ${metodos}`}
                                    </div>
                                </td>
                                <td style={{ ...td, textAlign: 'right', color: '#6b7280' }}>{Number(a.aplicado_usd) > 0 ? fmt(a.aplicado_usd) : '—'}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: Number(a.saldo_usd) > 0.01 ? '#854d0e' : '#9ca3af' }}>{anulado ? '—' : fmt(a.saldo_usd)}</td>
                                <td style={td}>
                                    <BadgeAnticipo estado={a.estado} />
                                    {anulado && a.motivo_anulacion && <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', whiteSpace: 'normal' }}>{a.motivo_anulacion}</div>}
                                </td>
                                <td style={{ ...td, textAlign: 'right' }}>
                                    {/* Solo se anula un anticipo sin aplicaciones ni reembolsos (la RPC lo exige) */}
                                    {puedeAnular && a.estado === 'disponible' && (
                                        <button onClick={() => onAnular(a)}
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
        </div>
    )
}

// ── Aplicar anticipos a una recepción (Fase 4) ──────────────────────────────
// Bloque para las ventanas de pago de una recepción (Compras → recepción y
// CxP → Pagar). Carga los anticipos con saldo del proveedor, pre-marca los de
// la misma OC hasta `tope` y deja aplicar a mano los demás (otra OC, sin OC,
// OC cancelada = saldo a favor). El llamador guarda `aplicaciones`
// ({ anticipo_id: monto }) y, tras guardar la recepción, llama a
// aplicar_anticipo_proveedor por cada una — ver aplicacionesALista().
const r2 = n => Math.round(Number(n || 0) * 100) / 100

export function totalAplicaciones(aplicaciones) {
    return r2(Object.values(aplicaciones || {}).reduce((s, m) => s + Number(m || 0), 0))
}

export function aplicacionesALista(aplicaciones, anticipos) {
    return Object.entries(aplicaciones || {})
        .filter(([, m]) => Number(m) > 0.001)
        .map(([id, m]) => ({ anticipo_id: id, monto: r2(m), numero: anticipos?.find(a => a.id === id)?.numero_anticipo || '' }))
}

export function SelectorAnticipos({ proveedorId, ocId = null, tope, aplicaciones, onChange, onCargados }) {
    const { perfil } = useAuth()
    const { puedeOperar } = usePermisosAnticipo()
    const [disponibles, setDisponibles] = useState(null)

    useEffect(() => {
        if (!perfil?.empresa_id || !proveedorId || !puedeOperar) { setDisponibles([]); return }
        let cancel = false
        // Sin embeds sobre la vista: la OC se trae aparte
        ;(async () => {
            const { data } = await supabase.from('v_anticipos_saldo')
                .select('id, numero_anticipo, fecha, orden_compra_id, saldo_usd')
                .eq('empresa_id', perfil.empresa_id)
                .eq('proveedor_id', proveedorId)
                .in('estado', ['disponible', 'aplicado_parcial'])
                .order('fecha', { ascending: true })
            const conSaldo = (data || []).filter(a => Number(a.saldo_usd) > 0.01)
            const ocIds = [...new Set(conSaldo.map(a => a.orden_compra_id).filter(Boolean))]
            const ocs = {}
            if (ocIds.length) {
                const { data: ocData } = await supabase.from('ordenes_compra')
                    .select('id, numero_oc, estado').eq('empresa_id', perfil.empresa_id).in('id', ocIds)
                ;(ocData || []).forEach(o => { ocs[o.id] = o })
            }
            {
                if (cancel) return
                const lista = conSaldo.map(a => ({ ...a, ordenes_compra: ocs[a.orden_compra_id] || null }))
                    // Primero los de esta OC; después el resto, por antigüedad
                    .sort((a, b) => (b.orden_compra_id === ocId) - (a.orden_compra_id === ocId))
                setDisponibles(lista)
                onCargados?.(lista)
                // Pre-marcar los de la misma OC hasta el tope
                let resto = Number(tope || 0)
                const inicial = {}
                if (ocId) for (const a of lista) {
                    if (a.orden_compra_id !== ocId || resto <= 0.01) continue
                    const m = r2(Math.min(Number(a.saldo_usd), resto))
                    inicial[a.id] = m
                    resto -= m
                }
                onChange(inicial)
            }
        })()
        return () => { cancel = true }
    }, [perfil?.empresa_id, proveedorId, ocId, puedeOperar])

    // Si el tope baja (descuento, NDs), recortar desde el último aplicado
    useEffect(() => {
        let exceso = totalAplicaciones(aplicaciones) - Number(tope || 0)
        if (exceso <= 0.01) return
        const next = { ...aplicaciones }
        for (const id of Object.keys(next).reverse()) {
            if (exceso <= 0.01) break
            const quita = Math.min(next[id], exceso)
            next[id] = r2(next[id] - quita)
            exceso -= quita
            if (next[id] <= 0.001) delete next[id]
        }
        onChange(next)
    }, [tope])

    if (!disponibles || disponibles.length === 0) return null

    const aplicado = totalAplicaciones(aplicaciones)
    function toggle(a) {
        const next = { ...aplicaciones }
        if (next[a.id] !== undefined) delete next[a.id]
        else {
            const libre = Number(tope || 0) - aplicado
            if (libre <= 0.01) return
            next[a.id] = r2(Math.min(Number(a.saldo_usd), libre))
        }
        onChange(next)
    }
    function setMonto(a, v) {
        const otros = aplicado - Number(aplicaciones[a.id] || 0)
        const max = Math.min(Number(a.saldo_usd), Number(tope || 0) - otros)
        onChange({ ...aplicaciones, [a.id]: r2(Math.max(0, Math.min(Number(v) || 0, max))) })
    }

    return (
        <div style={{ backgroundColor: '#fefce8', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#854d0e', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Anticipos disponibles</p>
            {disponibles.map(a => {
                const marcado = aplicaciones[a.id] !== undefined
                const origen = a.orden_compra_id && a.orden_compra_id === ocId ? 'esta OC'
                    : a.ordenes_compra ? `${a.ordenes_compra.numero_oc}${a.ordenes_compra.estado === 'cancelada' ? ' (cancelada)' : ''}`
                    : 'sin OC'
                return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #fde68a' }}>
                        <input type="checkbox" checked={marcado} onChange={() => toggle(a)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '13px', color: '#713f12', fontFamily: 'monospace' }}>{a.numero_anticipo}</span>
                            <span style={{ fontSize: '11px', color: '#a16207', marginLeft: '6px' }}>{origen} · saldo {fmt(a.saldo_usd)}</span>
                        </div>
                        {marcado && (
                            <input type="number" min="0" step="0.01" value={aplicaciones[a.id]}
                                onChange={e => setMonto(a, e.target.value)}
                                style={{ width: '96px', padding: '4px 8px', border: '1px solid #fcd34d', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />
                        )}
                    </div>
                )
            })}
            {aplicado > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '13px' }}>
                    <span style={{ color: '#854d0e' }}>Anticipo aplicado:</span>
                    <span style={{ fontWeight: 600, color: '#166534' }}>-{fmt(aplicado)}</span>
                </div>
            )}
        </div>
    )
}

// ── Registrar ───────────────────────────────────────────────────────────────
function ModalRegistrarAnticipo({ orden, totalAnticipado, onRegistrado, onCerrar }) {
    const [nroDoc, setNroDoc] = useState('')
    const totalOC = Number(orden.total || 0)
    const disponible = Math.max(0, totalOC - totalAnticipado)

    async function confirmar({ fecha, tipoTasa, tasa, montoUsd, montoBs, metodoUsd, metodoBs, cuentaBancariaId, nota }) {
        const { error } = await supabase.rpc('registrar_anticipo_proveedor', {
            p_proveedor_id: orden.proveedor_id,
            p_orden_compra_id: orden.id,
            p_fecha: fecha,
            p_monto_usd: montoUsd,
            p_monto_bs: montoBs,
            p_tasa_cambio: tasa,
            p_tipo_tasa: tipoTasa,
            p_metodo_usd: montoUsd > 0 ? metodoUsd : null,
            p_metodo_bs: montoBs > 0 ? metodoBs : null,
            p_cuenta_bancaria_id: cuentaBancariaId,
            p_nro_doc_proveedor: nroDoc,
            p_nota: nota,
        })
        if (error) return error.message
        onRegistrado()
    }

    return (
        <ModalPagoObligacion
            titulo="Registrar anticipo"
            subtitulo={[orden.numero_oc, orden.proveedores?.nombre].filter(Boolean).join(' · ')}
            total={totalOC}
            abonado={totalAnticipado}
            saldo={disponible}
            labelAbonado="Ya anticipado"
            labelSaldo="Disponible para anticipar"
            proveedorId={orden.proveedor_id}
            textoConfirmar="Registrar anticipo"
            confirmacion={{
                titulo: '¿Confirmas el anticipo?',
                textoBoton: 'Sí, registrar anticipo',
                aviso: 'El dinero sale del banco en la fecha indicada. El anticipo queda como saldo a favor y se aplicará al recibir la mercancía de esta OC.',
            }}
            extras={
                <div style={{ marginBottom: '14px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>
                        N° de documento del proveedor <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <input value={nroDoc} onChange={e => setNroDoc(e.target.value)} placeholder="Factura o recibo del anticipo"
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', color: '#374151', boxSizing: 'border-box' }} />
                </div>
            }
            onConfirmar={confirmar}
            onCerrar={onCerrar}
        />
    )
}

// ── Anular ──────────────────────────────────────────────────────────────────
export function ModalAnularAnticipo({ anticipo, onAnulado, onCerrar }) {
    const [motivo, setMotivo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    async function confirmar() {
        if (!motivo.trim()) { setError('Indica el motivo de la anulación'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.rpc('anular_anticipo_proveedor', { p_anticipo_id: anticipo.id, p_motivo: motivo.trim() })
        if (err) { setError(err.message); setGuardando(false); return }
        onAnulado()
    }

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Anular anticipo</h2>
                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>{anticipo.numero_anticipo} · {fmt(anticipo.monto_equiv_usd)}</p>
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#991b1b', marginBottom: '14px', lineHeight: 1.5 }}>
                    El anticipo deja de contar como salida del banco y como saldo a favor. Usa esta opción solo si se registró por error; si el proveedor devolvió el dinero, corresponde un reembolso.
                </div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Motivo *</label>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2} placeholder="Ej: Registrado por error"
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginTop: '12px' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                    <button onClick={onCerrar} disabled={guardando}
                        style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button onClick={confirmar} disabled={guardando}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#fff', backgroundColor: '#dc2626', cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Anulando...' : 'Anular anticipo'}
                    </button>
                </div>
            </div>
        </div>
    )
}
