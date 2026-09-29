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
import { fmtFechaCorta, ymdCaracas } from './SelectorFechaTasa'
import FiltroCombo from './FiltroCombo'

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
export function TablaAnticipos({ anticipos, puedeAnular, onAnular, onVer = null, mostrarOC = false }) {
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
                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                        {onVer && (
                                            <button onClick={() => onVer(a)}
                                                style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                Ver
                                            </button>
                                        )}
                                        {/* Solo se anula un anticipo sin aplicaciones ni reembolsos (la RPC lo exige) */}
                                        {puedeAnular && a.estado === 'disponible' && (
                                            <button onClick={() => onAnular(a)}
                                                style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}>
                                                Anular
                                            </button>
                                        )}
                                    </div>
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

// ════════════════════════════════════════════════════════════════════════════
// CxP → pestaña "Anticipos" (Fase 5)
// ════════════════════════════════════════════════════════════════════════════
const DIAS_ALERTA = 30
const diasDesde = (ymd) => Math.floor((Date.now() - new Date(ymd + 'T00:00:00').getTime()) / 86400000)

// Anticipos de la empresa con proveedor y OC resueltos aparte (sin embeds sobre la vista)
async function cargarAnticiposEmpresa(empresaId) {
    const { data } = await supabase.from('v_anticipos_saldo')
        .select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false })
    const lista = data || []
    const provIds = [...new Set(lista.map(a => a.proveedor_id))]
    const ocIds = [...new Set(lista.map(a => a.orden_compra_id).filter(Boolean))]
    const [{ data: provs }, { data: ocs }] = await Promise.all([
        provIds.length ? supabase.from('proveedores').select('id, nombre').eq('empresa_id', empresaId).in('id', provIds) : { data: [] },
        ocIds.length ? supabase.from('ordenes_compra').select('id, numero_oc, estado').eq('empresa_id', empresaId).in('id', ocIds) : { data: [] },
    ])
    const mp = Object.fromEntries((provs || []).map(p => [p.id, p]))
    const mo = Object.fromEntries((ocs || []).map(o => [o.id, o]))
    return lista.map(a => ({ ...a, proveedores: mp[a.proveedor_id] || null, ordenes_compra: mo[a.orden_compra_id] || null }))
}

// Saldo total a favor (para el KPI de la cabecera de CxP)
export async function saldoAnticiposEmpresa(empresaId) {
    const { data } = await supabase.from('v_anticipos_saldo')
        .select('saldo_usd').eq('empresa_id', empresaId).in('estado', ['disponible', 'aplicado_parcial'])
    return (data || []).reduce((s, a) => s + Number(a.saldo_usd || 0), 0)
}

const FILTROS_ESTADO = [
    { value: 'con_saldo', label: 'Con saldo' },
    ...Object.entries(ESTADOS_ANTICIPO).map(([value, s]) => ({ value, label: s.label })),
]

export function PanelAnticiposCxP() {
    const { perfil } = useAuth()
    const { puedeAnular } = usePermisosAnticipo()
    const [anticipos, setAnticipos] = useState([])
    const [cargando, setCargando] = useState(true)
    const [fProveedor, setFProveedor] = useState('')
    const [fOC, setFOC] = useState('')
    const [fEstado, setFEstado] = useState('con_saldo')
    const [ver, setVer] = useState(null)
    const [anulando, setAnulando] = useState(null)

    async function cargar() {
        setCargando(true)
        setAnticipos(await cargarAnticiposEmpresa(perfil.empresa_id))
        setCargando(false)
    }
    useEffect(() => { if (perfil?.empresa_id) cargar() }, [perfil?.empresa_id])

    if (ver) return <DetalleAnticipo anticipoId={ver.id} onVolver={() => { setVer(null); cargar() }} />

    const conSaldo = anticipos.filter(a => ['disponible', 'aplicado_parcial'].includes(a.estado) && Number(a.saldo_usd) > 0.01)
    const saldoTotal = conSaldo.reduce((s, a) => s + Number(a.saldo_usd), 0)
    const viejos = conSaldo.filter(a => diasDesde(a.fecha) > DIAS_ALERTA)
    const enCanceladas = conSaldo.filter(a => a.ordenes_compra?.estado === 'cancelada')
    const saldoCanceladas = enCanceladas.reduce((s, a) => s + Number(a.saldo_usd), 0)

    const opcProv = [...new Map(anticipos.filter(a => a.proveedores).map(a => [a.proveedor_id, { value: a.proveedor_id, label: a.proveedores.nombre }])).values()]
        .sort((x, y) => x.label.localeCompare(y.label))
    const opcOC = [...new Map(anticipos.filter(a => a.ordenes_compra).map(a => [a.orden_compra_id, { value: a.orden_compra_id, label: a.ordenes_compra.numero_oc }])).values()]

    const filtrados = anticipos.filter(a =>
        (!fProveedor || a.proveedor_id === fProveedor)
        && (!fOC || a.orden_compra_id === fOC)
        && (!fEstado || (fEstado === 'con_saldo' ? conSaldo.includes(a) : a.estado === fEstado)))

    const kpi = (titulo, valor, sub, alerta = false) => (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: `1px solid ${alerta ? '#fde68a' : '#e5e7eb'}`, padding: '14px 16px' }}>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{titulo}</p>
            <p style={{ fontSize: '20px', fontWeight: 700, color: alerta ? '#b45309' : '#1f2937', margin: 0 }}>{valor}</p>
            {sub && <p style={{ fontSize: '11px', color: '#9ca3af', margin: '2px 0 0' }}>{sub}</p>}
        </div>
    )

    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                {kpi('Saldo anticipado a favor', fmt(saldoTotal), `${conSaldo.length} anticipo(s) sin aplicar del todo`)}
                {kpi(`Sin aplicar hace más de ${DIAS_ALERTA} días`, viejos.length, viejos.length ? fmt(viejos.reduce((s, a) => s + Number(a.saldo_usd), 0)) : 'ninguno', viejos.length > 0)}
                {kpi('Saldo en OC canceladas', fmt(saldoCanceladas), enCanceladas.length ? 'reclamar reembolso o aplicar a otra compra' : 'ninguno', enCanceladas.length > 0)}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
                <FiltroCombo label="Proveedor" value={fProveedor} onChange={setFProveedor} options={opcProv} width="240px" />
                <FiltroCombo label="OC" value={fOC} onChange={setFOC} options={opcOC} width="160px" />
                <FiltroCombo label="Estado" value={fEstado} onChange={setFEstado} options={FILTROS_ESTADO} width="170px" />
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {cargando ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    : filtrados.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                        {anticipos.length === 0 ? 'No hay anticipos registrados. Se registran desde el detalle de una orden de compra.' : 'No hay anticipos para los filtros seleccionados.'}
                    </div>
                    : <TablaAnticipos anticipos={filtrados} mostrarOC puedeAnular={puedeAnular} onAnular={setAnulando} onVer={setVer} />}
            </div>

            {anulando && <ModalAnularAnticipo anticipo={anulando} onAnulado={() => { setAnulando(null); cargar() }} onCerrar={() => setAnulando(null)} />}
        </div>
    )
}

// ── Detalle de un anticipo: pago, aplicaciones, reembolsos ─────────────────
export function DetalleAnticipo({ anticipoId, onVolver }) {
    const { perfil } = useAuth()
    const { puedeOperar, puedeAnular } = usePermisosAnticipo()
    const [a, setA] = useState(null)
    const [saldos, setSaldos] = useState(null)
    const [aplicaciones, setAplicaciones] = useState([])
    const [reembolsos, setReembolsos] = useState([])
    const [modal, setModal] = useState(null) // 'reembolso' | 'anular' | { reembolso }

    async function cargar() {
        const [{ data: ant }, { data: sal }, { data: aps }, { data: rems }] = await Promise.all([
            supabase.from('anticipos_proveedor')
                .select('*, proveedores(nombre), ordenes_compra(numero_oc, estado), cuentas_bancarias(nombre, banco), usuarios!usuario_id(nombre)')
                .eq('empresa_id', perfil.empresa_id).eq('id', anticipoId).single(),
            supabase.from('v_anticipos_saldo').select('aplicado_usd, reembolsado_usd, saldo_usd').eq('id', anticipoId).single(),
            supabase.from('pagos_proveedor')
                .select('id, fecha_pago, monto_usd, anulado, motivo_anulacion, compras(numero_doc, total)')
                .eq('empresa_id', perfil.empresa_id).eq('anticipo_id', anticipoId).order('fecha_pago'),
            supabase.from('anticipo_reembolsos')
                .select('*, cuentas_bancarias(nombre, banco)')
                .eq('empresa_id', perfil.empresa_id).eq('anticipo_id', anticipoId).order('fecha'),
        ])
        setA(ant); setSaldos(sal); setAplicaciones(aps || []); setReembolsos(rems || [])
    }
    useEffect(() => { if (perfil?.empresa_id) cargar() }, [perfil?.empresa_id, anticipoId])

    if (!a) return <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>

    const saldo = Number(saldos?.saldo_usd || 0)
    const card = { backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '18px 22px', marginBottom: '14px' }
    const lbl = { fontSize: '11px', fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }
    const val = { fontSize: '14px', fontWeight: 500, color: '#1f2937', margin: 0 }
    const th = { padding: '8px 10px', fontSize: '11px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }
    const td = { padding: '9px 10px', fontSize: '13px', color: '#374151' }
    const metodos = [labelMetodo(a.metodo_usd), labelMetodo(a.metodo_bs)].filter(Boolean).join(' / ')

    return (
        <div style={{ maxWidth: '760px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px', flexWrap: 'wrap' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937', margin: 0, fontFamily: 'monospace' }}>{a.numero_anticipo}</h2>
                <BadgeAnticipo estado={a.estado} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    {puedeOperar && a.estado !== 'anulado' && saldo > 0.01 && (
                        <button onClick={() => setModal('reembolso')}
                            style={{ backgroundColor: '#fff', border: '1px solid #16a34a', color: '#16a34a', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                            Registrar reembolso
                        </button>
                    )}
                    {puedeAnular && a.estado === 'disponible' && (
                        <button onClick={() => setModal('anular')}
                            style={{ backgroundColor: '#fff', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                            Anular
                        </button>
                    )}
                </div>
            </div>

            <div style={card}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
                    <div><p style={lbl}>Proveedor</p><p style={val}>{a.proveedores?.nombre || '—'}</p></div>
                    <div><p style={lbl}>OC</p><p style={val}>{a.ordenes_compra ? `${a.ordenes_compra.numero_oc}${a.ordenes_compra.estado === 'cancelada' ? ' (cancelada)' : ''}` : 'Sin OC'}</p></div>
                    <div><p style={lbl}>Fecha del pago</p><p style={val}>{fmtFechaCorta(a.fecha)}</p></div>
                    <div><p style={lbl}>Doc. proveedor</p><p style={val}>{a.nro_doc_proveedor || '—'}</p></div>
                    <div><p style={lbl}>Pagado</p><p style={val}>{fmt(a.monto_equiv_usd)}</p>
                        <p style={{ fontSize: '11px', color: '#6b7280', margin: '2px 0 0' }}>
                            {[Number(a.monto_usd) > 0 && fmt(a.monto_usd), Number(a.monto_bs) > 0 && `${fmtBs(a.monto_bs)} @ ${Number(a.tasa_cambio).toLocaleString('es-VE')}`].filter(Boolean).join(' + ')}
                            {metodos && ` · ${metodos}`}
                        </p></div>
                    <div><p style={lbl}>Cuenta</p><p style={val}>{a.cuentas_bancarias ? `${a.cuentas_bancarias.nombre} (${a.cuentas_bancarias.banco})` : 'Efectivo / sin cuenta'}</p></div>
                    <div><p style={lbl}>Aplicado</p><p style={val}>{fmt(saldos?.aplicado_usd)}</p></div>
                    <div><p style={lbl}>Reembolsado</p><p style={val}>{fmt(saldos?.reembolsado_usd)}</p></div>
                    <div><p style={lbl}>Saldo</p><p style={{ ...val, fontSize: '16px', fontWeight: 700, color: saldo > 0.01 ? '#854d0e' : '#166534' }}>{a.estado === 'anulado' ? '—' : fmt(saldo)}</p></div>
                </div>
                {(a.nota || a.usuarios?.nombre) && (
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '14px 0 0' }}>
                        {a.nota && <>Nota: {a.nota} · </>}Registrado por {a.usuarios?.nombre || '—'}
                    </p>
                )}
                {a.estado === 'anulado' && (
                    <div style={{ marginTop: '12px', backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#6b7280' }}>
                        Anulado el {new Date(a.fecha_anulacion).toLocaleDateString('es-VE')}{a.motivo_anulacion ? ` — ${a.motivo_anulacion}` : ''}
                    </div>
                )}
            </div>

            <div style={card}>
                <p style={{ ...lbl, marginBottom: '10px' }}>Aplicaciones a recepciones</p>
                {aplicaciones.length === 0 ? <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Todavía no se aplicó. Se aplica al registrar la recepción o desde CxP → Pagar.</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>{['Recepción', 'Fecha', 'Monto', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 2 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                        <tbody>{aplicaciones.map(p => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: p.anulado ? 0.5 : 1 }}>
                                <td style={{ ...td, fontFamily: 'monospace' }}>{p.compras?.numero_doc || '—'}</td>
                                <td style={td}>{fmtFechaCorta(ymdCaracas(p.fecha_pago))}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(p.monto_usd)}</td>
                                <td style={{ ...td, fontSize: '11px', color: '#6b7280' }}>{p.anulado ? `Anulada${p.motivo_anulacion ? ' — ' + p.motivo_anulacion : ''}` : ''}</td>
                            </tr>
                        ))}</tbody>
                    </table>
                )}
                <p style={{ fontSize: '11px', color: '#9ca3af', margin: '10px 0 0' }}>Una aplicación se anula desde CxP → la recepción → Pagos registrados; el monto vuelve a este anticipo.</p>
            </div>

            <div style={card}>
                <p style={{ ...lbl, marginBottom: '10px' }}>Reembolsos del proveedor</p>
                {reembolsos.length === 0 ? <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Sin reembolsos.</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>{['Fecha', 'Monto', 'Cuenta', ''].map((h, i) => <th key={i} style={{ ...th, textAlign: i === 1 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                        <tbody>{reembolsos.map(r => (
                            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6', opacity: r.anulado ? 0.5 : 1 }}>
                                <td style={td}>{fmtFechaCorta(r.fecha)}</td>
                                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(r.monto_equiv_usd)}</td>
                                <td style={td}>{r.cuentas_bancarias ? r.cuentas_bancarias.nombre : 'Efectivo / sin cuenta'}</td>
                                <td style={{ ...td, textAlign: 'right' }}>
                                    {r.anulado ? <span style={{ fontSize: '11px', color: '#6b7280' }}>Anulado{r.motivo_anulacion ? ` — ${r.motivo_anulacion}` : ''}</span>
                                        : puedeAnular && (
                                            <button onClick={() => setModal({ reembolso: r })}
                                                style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '3px 8px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}>
                                                Anular
                                            </button>
                                        )}
                                </td>
                            </tr>
                        ))}</tbody>
                    </table>
                )}
            </div>

            {modal === 'reembolso' && (
                <ModalReembolsoAnticipo anticipo={a} saldo={saldo}
                    onRegistrado={() => { setModal(null); cargar() }} onCerrar={() => setModal(null)} />
            )}
            {modal === 'anular' && (
                <ModalAnularAnticipo anticipo={a} onAnulado={() => { setModal(null); cargar() }} onCerrar={() => setModal(null)} />
            )}
            {modal?.reembolso && (
                <ModalMotivo
                    titulo="Anular reembolso"
                    detalle={`${fmtFechaCorta(modal.reembolso.fecha)} · ${fmt(modal.reembolso.monto_equiv_usd)}`}
                    aviso="El reembolso deja de contar como entrada al banco y el monto vuelve al saldo del anticipo."
                    textoBoton="Anular reembolso"
                    onConfirmar={async (motivo) => {
                        const { error } = await supabase.rpc('anular_reembolso_anticipo', { p_reembolso_id: modal.reembolso.id, p_motivo: motivo })
                        if (error) return error.message
                        setModal(null); cargar()
                    }}
                    onCerrar={() => setModal(null)} />
            )}
        </div>
    )
}

// ── Reembolso: el proveedor devuelve dinero del anticipo ───────────────────
function ModalReembolsoAnticipo({ anticipo, saldo, onRegistrado, onCerrar }) {
    async function confirmar({ fecha, tipoTasa, tasa, montoUsd, montoBs, metodoUsd, metodoBs, cuentaBancariaId, nota }) {
        const { error } = await supabase.rpc('registrar_reembolso_anticipo', {
            p_anticipo_id: anticipo.id, p_fecha: fecha,
            p_monto_usd: montoUsd, p_monto_bs: montoBs, p_tasa_cambio: tasa, p_tipo_tasa: tipoTasa,
            p_metodo_usd: montoUsd > 0 ? metodoUsd : null, p_metodo_bs: montoBs > 0 ? metodoBs : null,
            p_cuenta_bancaria_id: cuentaBancariaId, p_nota: nota,
        })
        if (error) return error.message
        onRegistrado()
    }
    return (
        <ModalPagoObligacion
            titulo="Registrar reembolso"
            subtitulo={[anticipo.numero_anticipo, anticipo.proveedores?.nombre].filter(Boolean).join(' · ')}
            saldo={saldo}
            labelSaldo="Saldo del anticipo"
            textoConfirmar="Registrar reembolso"
            confirmacion={{
                titulo: '¿Confirmas el reembolso?',
                textoBoton: 'Sí, registrar reembolso',
                aviso: 'El dinero entra a la cuenta indicada en esa fecha y se descuenta del saldo del anticipo.',
            }}
            onConfirmar={confirmar}
            onCerrar={onCerrar}
        />
    )
}

// ── Motivo obligatorio (anulaciones) ────────────────────────────────────────
function ModalMotivo({ titulo, detalle, aviso, textoBoton, onConfirmar, onCerrar }) {
    const [motivo, setMotivo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    async function confirmar() {
        if (!motivo.trim()) { setError('Indica el motivo'); return }
        setGuardando(true); setError('')
        const msg = await onConfirmar(motivo.trim())
        if (msg) { setError(msg); setGuardando(false) }
    }
    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>{titulo}</h2>
                {detalle && <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 14px' }}>{detalle}</p>}
                {aviso && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#991b1b', marginBottom: '14px' }}>{aviso}</div>}
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Motivo *</label>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginTop: '12px' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                    <button onClick={onCerrar} disabled={guardando}
                        style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={confirmar} disabled={guardando}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#fff', backgroundColor: '#dc2626', cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Procesando...' : textoBoton}
                    </button>
                </div>
            </div>
        </div>
    )
}
