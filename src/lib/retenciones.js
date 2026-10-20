// Retenciones de IVA e ISLR a proveedores (docs/plan-retenciones.md).
//
// El cálculo OFICIAL lo hace la RPC `registrar_retenciones` en el servidor;
// aquí está la misma fórmula solo para mostrar la vista previa en la ventana
// de pago antes de confirmar:
//   IVA  = IVA del documento         × % del proveedor
//   ISLR = base imponible (sin IVA)  × % del proveedor
// Se retienen completas en el primer pago del documento; una retención ya
// registrada (vigente) no se vuelve a proponer.
import { redondear2, desglosarTotalConIva } from './iva'

export const TIPOS_RETENCION = {
    iva: { label: 'Retención IVA', corto: 'IVA' },
    islr: { label: 'Retención ISLR', corto: 'ISLR' },
}

// ¿Este proveedor está sujeto a alguna retención en esta empresa?
export const proveedorRetiene = (agente, prov) => !!agente && !!(prov?.retiene_iva || prov?.retiene_islr)

// Texto corto del proveedor: "IVA 75% · ISLR 2%"
export function resumenRetencionProveedor(prov) {
    const partes = []
    if (prov?.retiene_iva && prov.pct_retencion_iva) partes.push(`IVA ${Number(prov.pct_retencion_iva)}%`)
    if (prov?.retiene_islr && prov.pct_retencion_islr) partes.push(`ISLR ${Number(prov.pct_retencion_islr)}%`)
    return partes.join(' · ')
}

// Vista previa de las retenciones que corresponden a un documento.
//   prov:        proveedor (retiene_*, pct_retencion_*)
//   base, iva:   desglose del documento en USD (null = no se conoce)
//   vigentes:    { iva: true, islr: true } las que ya tiene registradas
// Devuelve { iva: { pct, base, monto } | null, islr: … }
export function calcularRetenciones({ prov, base, iva, vigentes = {} }) {
    const linea = (tipo, retiene, pct, sobre) => {
        if (!retiene || !(Number(pct) > 0) || vigentes[tipo] || sobre == null) return null
        const monto = redondear2(Number(sobre) * Number(pct) / 100)
        return monto > 0 ? { pct: Number(pct), base: redondear2(sobre), monto } : null
    }
    return {
        iva: linea('iva', prov?.retiene_iva, prov?.pct_retencion_iva, iva),
        islr: linea('islr', prov?.retiene_islr, prov?.pct_retencion_islr, base),
    }
}

// Desglose de una factura (base + IVA, en USD) a partir de su total:
// con IVA 16 % o exenta (servicio sin IVA: base = total, IVA = 0)
export function desgloseSugerido(total, exento) {
    return exento ? { base: redondear2(Number(total || 0)), iva: 0 } : desglosarTotalConIva(Number(total || 0))
}

// Aviso del desglose contra el total del documento (USD). montoBs: lo cargado
// en bolívares, para detectar la base escrita en Bs. (caso GS1, 2026-10-13)
export function avisoDesglose(base, iva, total, montoBs = 0) {
    const b = Number(base || 0), i = Number(iva || 0), t = Number(total || 0)
    if (!(b > 0)) return null
    if (!(t > 0)) return 'Falta el monto del gasto: base e IVA no lo reemplazan.'
    const suma = redondear2(b + i)
    if (suma <= t + 0.01) return null
    const bs = Number(montoBs || 0)
    if (bs > 0 && (Math.abs(b - bs) < 1 || Math.abs(suma - bs) < 1 || b > t * 20))
        return `Parece escrito en bolívares: el desglose va en USD y el total es $${t.toFixed(2)}.`
    return `Base + IVA ($${suma.toFixed(2)}) supera el total ($${t.toFixed(2)}).`
}

// Etiqueta de un abono que es retención (pagos_proveedor / pagos .metodo_usd)
export const esMetodoRetencion = (m) => m === 'retencion_iva' || m === 'retencion_islr'
