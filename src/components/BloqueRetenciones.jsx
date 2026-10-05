// Bloque "Retenciones" de las ventanas de pago (recepción y gasto).
// docs/plan-retenciones.md
//
// Muestra las retenciones que corresponden al documento —IVA del documento ×
// % del proveedor, ISLR = base imponible × %— y deja no aplicar una. Solo
// aparece si la empresa es agente de retención, el proveedor está marcado y el
// documento aún no tiene esa retención. Las calcula para la vista previa; la
// cifra oficial la escribe la RPC registrar_retenciones con la misma fórmula.
//
// Un gasto sin desglose (base e IVA) los pide aquí, con sugerencia desde el
// total; se guardan en el gasto al registrar la retención.
//
// onChange({ monto, aplicarIva, aplicarIslr, base, iva, desgloseNuevo, error })
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { calcularRetenciones, TIPOS_RETENCION } from '../lib/retenciones'
import { desglosarTotalConIva, redondear2 } from '../lib/iva'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`
const inp = { width: '100%', padding: '6px 10px', border: '1px solid #fcd34d', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', textAlign: 'right' }

export default function BloqueRetenciones({ origenTipo, origenId, proveedorId, base, iva, totalDocumento, saldo, onChange }) {
    const { perfil } = useAuth()
    const agente = !!perfil?.empresas?.agente_retencion
    const [prov, setProv] = useState(null)
    const [vigentes, setVigentes] = useState(null)   // { iva: true, islr: true }
    const [aplicar, setAplicar] = useState({ iva: true, islr: true })
    const sinDesglose = base == null
    const [baseEd, setBaseEd] = useState('')
    const [ivaEd, setIvaEd] = useState('')

    useEffect(() => {
        if (!agente || !proveedorId) { setProv(null); setVigentes({}); return }
        let cancel = false
        Promise.all([
            supabase.from('proveedores').select('nombre, retiene_iva, pct_retencion_iva, retiene_islr, pct_retencion_islr').eq('id', proveedorId).maybeSingle(),
            supabase.from('retenciones').select('tipo').eq('origen_tipo', origenTipo).eq('origen_id', origenId).eq('estado', 'vigente'),
        ]).then(([{ data: p }, { data: r }]) => {
            if (cancel) return
            setProv(p || null)
            const v = {}; (r || []).forEach(x => { v[x.tipo] = true })
            setVigentes(v)
        })
        return () => { cancel = true }
    }, [agente, proveedorId, origenTipo, origenId])

    const sujeto = agente && prov && (prov.retiene_iva || prov.retiene_islr)
    const baseCalc = sinDesglose ? (Number(baseEd) > 0 ? Number(baseEd) : null) : Number(base)
    const ivaCalc = sinDesglose ? (baseCalc != null ? Number(ivaEd || 0) : null) : Number(iva || 0)
    const ret = sujeto && vigentes ? calcularRetenciones({ prov, base: baseCalc, iva: ivaCalc, vigentes }) : { iva: null, islr: null }
    // Hay algo que retener (aunque falte el desglose para calcularlo)
    const pendientes = sujeto && vigentes
        ? ['iva', 'islr'].filter(t => prov[`retiene_${t}`] && !vigentes[t])
        : []
    const monto = redondear2((aplicar.iva && ret.iva ? ret.iva.monto : 0) + (aplicar.islr && ret.islr ? ret.islr.monto : 0))

    let error = null
    if (pendientes.length > 0 && sinDesglose && baseCalc == null) error = 'Indica la base imponible y el IVA de la factura para calcular la retención'
    else if (sinDesglose && baseCalc != null && totalDocumento != null && baseCalc + (ivaCalc || 0) > Number(totalDocumento) + 0.01)
        error = `Base + IVA (${fmt(baseCalc + (ivaCalc || 0))}) supera el total del documento (${fmt(totalDocumento)})`
    else if (monto > Number(saldo) + 0.01) error = `La retención (${fmt(monto)}) supera el saldo pendiente (${fmt(saldo)})`

    const cargando = agente && proveedorId && vigentes === null
    useEffect(() => {
        onChange?.({
            monto: error ? 0 : monto,
            aplicarIva: !!(aplicar.iva && ret.iva),
            aplicarIslr: !!(aplicar.islr && ret.islr),
            base: baseCalc, iva: ivaCalc,
            desgloseNuevo: sinDesglose && baseCalc != null,
            error: cargando ? 'Cargando retenciones…' : error,
        })
    }, [monto, aplicar.iva, aplicar.islr, baseCalc, ivaCalc, error, cargando, !!ret.iva, !!ret.islr]) // eslint-disable-line react-hooks/exhaustive-deps

    if (!sujeto || pendientes.length === 0) {
        // Documento que ya tiene sus retenciones: se informa, no se repite
        if (sujeto && vigentes && Object.keys(vigentes).length > 0) {
            return (
                <div style={{ fontSize: '12px', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px' }}>
                    Retenciones ya registradas en este documento: {Object.keys(vigentes).map(t => TIPOS_RETENCION[t].corto).join(' y ')}.
                </div>
            )
        }
        return null
    }

    function sugerir() {
        const d = desglosarTotalConIva(totalDocumento)
        setBaseEd(d.base.toFixed(2)); setIvaEd(d.iva.toFixed(2))
    }

    return (
        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Retenciones</p>

            {sinDesglose && (
                <div style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', color: '#92400e' }}>Desglose de la factura (USD)</span>
                        {totalDocumento > 0 && (
                            <button type="button" onClick={sugerir}
                                style={{ fontSize: '11px', color: '#92400e', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>
                                Sugerir del total
                            </button>
                        )}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <input type="number" min="0" step="0.01" value={baseEd} onChange={e => setBaseEd(e.target.value)} placeholder="Base imponible" style={inp} />
                        <input type="number" min="0" step="0.01" value={ivaEd} onChange={e => setIvaEd(e.target.value)} placeholder="IVA" style={inp} />
                    </div>
                </div>
            )}

            {['iva', 'islr'].filter(t => pendientes.includes(t)).map(t => {
                const r = ret[t]
                return (
                    <label key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '5px 0', cursor: r ? 'pointer' : 'default' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#78350f' }}>
                            <input type="checkbox" checked={!!(aplicar[t] && r)} disabled={!r}
                                onChange={e => setAplicar(a => ({ ...a, [t]: e.target.checked }))} />
                            {TIPOS_RETENCION[t].label} {prov[`pct_retencion_${t}`] ? `${Number(prov[`pct_retencion_${t}`])}%` : ''}
                            {r && <span style={{ fontSize: '11px', color: '#a16207' }}>sobre {fmt(r.base)}{t === 'iva' ? ' de IVA' : ' de base'}</span>}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: r && aplicar[t] ? '#dc2626' : '#9ca3af' }}>
                            {r ? `-${fmt(r.monto)}` : '—'}
                        </span>
                    </label>
                )
            })}

            {monto > 0 && !error && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #fde68a', marginTop: '6px', paddingTop: '6px', fontSize: '13px' }}>
                    <span style={{ color: '#92400e' }}>Se retiene (se le debe al SENIAT)</span>
                    <span style={{ fontWeight: 700, color: '#dc2626' }}>-{fmt(monto)}</span>
                </div>
            )}
            {error && <div style={{ marginTop: '6px', fontSize: '12px', color: '#dc2626' }}>{error}</div>}
        </div>
    )
}
