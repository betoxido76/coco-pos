// IVA del sistema — fórmula única (docs/plan-iva-base-imponible.md).
//
// Convención desde 2026-10: el precio de lista / de una línea es la BASE
// imponible y el IVA se SUMA. Los documentos anteriores guardaban el precio con
// el IVA embebido: esas líneas tienen `precio_incluye_iva = true` y se siguen
// leyendo con su convención, así que el pasado no se reescribe.
//
// Reglas:
//   - Ningún módulo escribe `/ 1.16` ni `* 0.16`: todo pasa por aquí.
//   - El IVA del documento se calcula UNA vez, sobre la base gravada total.
//   - Un documento emitido (nota de entrega, NC, recepción, ND) se lee de los
//     montos guardados en su encabezado (`totalesGuardados`), no se recalcula.

export const IVA_PCT = 16
const FACTOR = 1 + IVA_PCT / 100

export const redondear2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100

// La línea guarda su propio `aplica_iva` al crearse (snapshot). Leerlo del
// producto en tiempo de cálculo haría que cambiar la casilla en el catálogo
// recalculara los totales de los documentos ya emitidos. El fallback al
// producto cubre las líneas anteriores al snapshot.
export const itemAplicaIva = (item) =>
    item?.aplica_iva ?? item?.productos_terminados?.aplica_iva ?? true

// Solo las líneas guardadas antes del cambio traen `precio_incluye_iva = true`.
// Una línea nueva (en memoria o guardada por la app actual) es base.
export const precioIncluyeIva = (item) => item?.precio_incluye_iva === true

// Precio guardado → precio sin IVA.
export const precioBase = (precio, aplicaIva, incluyeIva = false) =>
    (incluyeIva && aplicaIva) ? Number(precio || 0) / FACTOR : Number(precio || 0)

export const precioBaseItem = (item) =>
    precioBase(item?.precio_unitario, itemAplicaIva(item), precioIncluyeIva(item))

// Precio con IVA, solo para mostrar (p. ej. "precio final" al vendedor).
export const conIva = (base, aplicaIva) => aplicaIva ? Number(base || 0) * FACTOR : Number(base || 0)

// Totales de un documento a partir de sus líneas en base.
// lineas: [{ base, aplicaIva }], con `base` = cantidad × precio base × (1 − desc. ítem)
export function totalesDocumento(lineas, descGlobalPct = 0) {
    const f = 1 - Number(descGlobalPct || 0) / 100
    let g = 0, e = 0
    for (const l of lineas) {
        const b = Number(l.base || 0) * f
        if (l.aplicaIva) g += b
        else e += b
    }
    const base_gravada = redondear2(g)
    const base_exenta = redondear2(e)
    const iva = redondear2(base_gravada * IVA_PCT / 100)
    return {
        base_gravada, base_exenta, iva,
        subtotal: redondear2(base_gravada + base_exenta),
        total: redondear2(base_gravada + base_exenta + iva),
    }
}

// Base de una línea guardada o en memoria, con la convención que tenga.
//   cantidad: cantidad en unidad de venta (por defecto item.cantidad)
//   descPct:  descuento del ítem (por defecto item.descuento_item)
export const baseLinea = (item, cantidad = item?.cantidad, descPct = item?.descuento_item) =>
    Number(cantidad || 0) * precioBaseItem(item) * (1 - Number(descPct || 0) / 100)

// Atajo: totales desde líneas con el formato de pedido_items / venta_items.
//   opts.cantidad(item) → cantidad en unidad de venta (p. ej. lo alistado ÷ factor)
export function totalesDeItems(items, { cantidad, descGlobal = 0 } = {}) {
    return totalesDocumento(
        (items || []).map(i => ({
            base: baseLinea(i, cantidad ? cantidad(i) : i.cantidad),
            aplicaIva: itemAplicaIva(i),
        })),
        descGlobal,
    )
}

// Montos de un documento ya guardado. Los encabezados anteriores a la Fase 1
// (o escritos por una versión vieja de la app) pueden no traer el desglose.
export function totalesGuardados(doc, campoTotal = 'total') {
    const total = Number(doc?.[campoTotal] || 0)
    const subtotal = doc?.subtotal != null
        ? Number(doc.subtotal)
        : (doc?.base_gravada != null ? Number(doc.base_gravada) + Number(doc.base_exenta || 0) : total)
    const iva = doc?.iva != null ? Number(doc.iva) : redondear2(total - subtotal)
    const base_gravada = doc?.base_gravada != null ? Number(doc.base_gravada) : redondear2(iva * 100 / IVA_PCT)
    const base_exenta = doc?.base_exenta != null ? Number(doc.base_exenta) : redondear2(subtotal - base_gravada)
    return { base_gravada, base_exenta, subtotal, iva, total }
}

// Campos de IVA que toda línea NUEVA lleva al insertarse.
export const camposIvaLinea = (aplicaIva) => ({
    aplica_iva: !!aplicaIva,
    iva_pct: aplicaIva ? IVA_PCT : 0,
    precio_incluye_iva: false,
})

// Campos de IVA para heredar de una línea de origen (NC desde la factura,
// SDR desde la venta): conserva la convención del documento original.
export const camposIvaHeredados = (origen) => ({
    aplica_iva: itemAplicaIva(origen),
    iva_pct: itemAplicaIva(origen) ? IVA_PCT : 0,
    precio_incluye_iva: precioIncluyeIva(origen),
})
