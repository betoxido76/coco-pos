// Cuenta de un gasto como obligación: total, pagado, retenciones y saldo, en USD.
//
// Misma lectura que CxP → Compras (CuentasPagar.jsx): el pagado NO incluye las
// retenciones (van en su columna) y el saldo descuenta también las que se
// retendrán en el próximo pago según el proveedor (docs/plan-retenciones.md).
// La usan Gastos y CxP → Gastos para que ambas listas digan lo mismo.
import { calcularRetenciones } from './retenciones'
import { supabase } from './supabaseClient'

export const PROV_RETENCION = 'retiene_iva, pct_retencion_iva, retiene_islr, pct_retencion_islr'

const pagoEnUsd = p => Number(p.monto_usd || 0) + Number(p.monto_bs || 0) / (Number(p.tasa_cambio) || 1)
const porPagar = g => g.estado === 'pendiente' || g.estado === 'parcial'

// Total de la obligación en USD: `monto` es el equivalente congelado al registrar.
// Solo los gastos muy viejos sin `monto` se convierten con la tasa vigente.
export const totalGasto = (g, tasas = {}) => Number(g.monto || 0) > 0
    ? Number(g.monto)
    : Number(g.monto_usd || 0) + Number(g.monto_bs || 0) / (Number(tasas[g.tipo_tasa] || tasas.tasa_bcv) || 1)

// pagosGasto: filas de `pagos` del gasto (con retencion_id y metodo_usd)
// g.proveedores debe traer PROV_RETENCION para proyectar las retenciones
export function cuentaGasto(g, pagosGasto = [], agente = false, tasas = {}) {
    const total = totalGasto(g, tasas)
    if (g.estado === 'anulado') return { total, pagado: 0, retenciones: 0, saldo: 0 }

    const reg = pagosGasto.filter(p => p.retencion_id)
    const registradas = reg.reduce((s, p) => s + pagoEnUsd(p), 0)
    // Gasto de contado anterior a 2026-10-05: 'pagado' sin abonos en `pagos`
    const pagado = g.estado === 'pagado' && pagosGasto.length === 0
        ? total
        : pagosGasto.filter(p => !p.retencion_id).reduce((s, p) => s + pagoEnUsd(p), 0)

    let porRetener = 0
    if (agente && porPagar(g)) {
        const vigentes = Object.fromEntries(reg.map(p => [p.metodo_usd === 'retencion_iva' ? 'iva' : 'islr', true]))
        const r = calcularRetenciones({ prov: g.proveedores, base: g.base_imponible, iva: g.monto_iva, vigentes })
        porRetener = Math.min((r.iva?.monto || 0) + (r.islr?.monto || 0), Math.max(0, total - pagado - registradas))
    }
    const retenciones = registradas + porRetener
    const saldo = porPagar(g) ? Math.max(0, total - pagado - retenciones) : 0
    return { total, pagado, retenciones, saldo }
}

// Abonos de varios gastos, en bloques de 100 ids (un IN de miles satura PostgREST)
export async function cargarPagosGastos(empresaId, ids) {
    const bloques = []
    for (let i = 0; i < ids.length; i += 100) bloques.push(ids.slice(i, i + 100))
    const resp = await Promise.all(bloques.map(b => supabase.from('pagos')
        .select('origen_id, monto_usd, monto_bs, tasa_cambio, retencion_id, metodo_usd')
        .eq('empresa_id', empresaId).eq('origen_tipo', 'gasto').in('origen_id', b)))
    const mapa = {}
    resp.flatMap(r => r.data || []).forEach(p => { (mapa[p.origen_id] ||= []).push(p) })
    return mapa
}
