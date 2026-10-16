// Retenciones de IVA e ISLR que nos hacen los clientes (docs/plan-retenciones-clientes.md).
//
// El cálculo OFICIAL lo hace la RPC `registrar_retenciones_venta`; aquí está la
// misma fórmula para la vista previa en el cobro y la columna de CxC:
//   IVA  = IVA de la nota            × % de la EMPRESA (ret_clientes_pct_iva)
//   ISLR = base imponible de la nota × % de la EMPRESA (ret_clientes_pct_islr)
// Solo si el cliente es contribuyente especial. Una retención ya registrada no
// se vuelve a proponer. Los montos de la nota salen de totalesGuardados.
import { redondear2, totalesGuardados } from './iva'

export const esMetodoRetencionCliente = (m) => m === 'retencion_iva' || m === 'retencion_islr'

// % vigentes de la empresa (perfil.empresas)
export const pctRetencionClientes = (empresa) => ({
    iva: Number(empresa?.ret_clientes_pct_iva) || 0,
    islr: Number(empresa?.ret_clientes_pct_islr) || 0,
})

// ¿A este cliente hay que proponerle retención en esta empresa?
export function clienteRetiene(empresa, cliente) {
    const pct = pctRetencionClientes(empresa)
    return !!cliente?.contribuyente_especial && (pct.iva > 0 || pct.islr > 0)
}

// Retenciones registradas de una nota a partir de sus filas de `cobros`
// (las que traen retencion_id). Devuelve { iva: monto, islr: monto, total }.
export function retencionesRegistradas(cobros) {
    const r = { iva: 0, islr: 0, total: 0 }
    for (const c of cobros || []) {
        if (!c.retencion_id) continue
        const tipo = c.metodo_usd === 'retencion_islr' ? 'islr' : 'iva'
        r[tipo] = redondear2(r[tipo] + Number(c.monto_usd || 0))
        r.total = redondear2(r.total + Number(c.monto_usd || 0))
    }
    return r
}

// Vista previa de las retenciones POR REGISTRAR de una nota.
//   venta:      con total/subtotal/base_*/iva y clientes.contribuyente_especial
//   vigentes:   { iva: true, islr: true } las que ya tiene registradas
// Devuelve { iva: { pct, base, monto } | null, islr: … | null, total }
export function retencionesPorRegistrar(venta, empresa, vigentes = {}) {
    const vacio = { iva: null, islr: null, total: 0 }
    if (!clienteRetiene(empresa, venta?.clientes)) return vacio
    const pct = pctRetencionClientes(empresa)
    const t = totalesGuardados(venta)
    const linea = (tipo, sobre) => {
        if (!(pct[tipo] > 0) || vigentes[tipo]) return null
        const monto = redondear2(Number(sobre || 0) * pct[tipo] / 100)
        return monto > 0 ? { pct: pct[tipo], base: redondear2(sobre), monto } : null
    }
    const iva = linea('iva', t.iva)
    const islr = linea('islr', t.base_gravada + t.base_exenta)
    return { iva, islr, total: redondear2((iva?.monto || 0) + (islr?.monto || 0)) }
}
