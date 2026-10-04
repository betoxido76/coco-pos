// Facturar un pedido: de las líneas del pedido a las líneas y totales de la
// nota de entrega. Lo usan Pedidos → Convertir en factura y Ventas → Facturar
// pedido; antes cada uno tenía su versión y la diferencia era el bug
// (NE-001196: cajas cobradas por unidades alistadas).
//
// Reglas (docs/plan-iva-base-imponible.md):
//   - Cantidad facturada en la UNIDAD DE VENTA de la línea: lo alistado (en
//     unidades primarias) ÷ factor si la línea es UM2.
//   - El IVA se evalúa con el catálogo VIGENTE al facturar; desde aquí queda fijo.
//   - El precio de la línea pasa a la nota en base, con los descuentos aplicados.

import { precioBaseItem, itemAplicaIva, totalesDocumento, IVA_PCT } from './iva'

// Los items deben traer productos_terminados(aplica_iva, unidad_venta_2, factor_conversion_2, costo_promedio)
export const esLineaUM2 = (item) => {
    const uv = item.unidad_venta
    const uv2 = item.productos_terminados?.unidad_venta_2
    return !!uv && (uv === '2' || (!!uv2 && uv === uv2))
}

// Factor de conversión de la línea a unidades primarias (1 si no es UM2)
export const factorLinea = (item) => {
    const f = Number(item.productos_terminados?.factor_conversion_2 || 1)
    return esLineaUM2(item) && f > 1 ? f : 1
}

// Cantidad en unidades primarias: lo alistado, o lo pedido normalizado
export const cantidadPrimaria = (item) =>
    item.cantidad_alistada != null
        ? Number(item.cantidad_alistada)
        : (item.cantidad_primaria != null ? Number(item.cantidad_primaria) : Number(item.cantidad) * factorLinea(item))

// Cantidad en la unidad de venta de la línea
export const cantidadVenta = (item) =>
    item.cantidad_alistada != null ? Number(item.cantidad_alistada) / factorLinea(item) : Number(item.cantidad)

// IVA al facturar: catálogo vigente; si el join no vino, la foto de la línea
export const aplicaIvaAlFacturar = (item) =>
    item.productos_terminados?.aplica_iva ?? itemAplicaIva(item)

// Líneas que entran a la nota: lo alistado > 0, o lo pedido si no se alistó
export const lineasFacturables = (items) =>
    (items || []).filter(i => (i.cantidad_alistada == null ? Number(i.cantidad) : Number(i.cantidad_alistada)) > 0)

// → { lineas, totales }
//   lineas: payload de venta_items sin venta_id/empresa_id, más `_cantPrim`
//   totales: { base_gravada, base_exenta, subtotal, iva, total }
export function prepararFacturaPedido(items, descGlobalPct = 0) {
    const fGlobal = 1 - Number(descGlobalPct || 0) / 100
    const lineas = lineasFacturables(items).map(i => {
        const aplica = aplicaIvaAlFacturar(i)
        const cantidad = cantidadVenta(i)
        // precioBaseItem respeta la convención con la que se guardó la línea
        const precio = precioBaseItem(i) * (1 - Number(i.descuento_item || 0) / 100) * fGlobal
        return {
            producto_id: i.producto_id,
            cantidad,
            precio_unitario: precio,
            unidad_venta: i.unidad_venta || null,
            cantidad_primaria: cantidadPrimaria(i),
            aplica_iva: aplica,
            iva_pct: aplica ? IVA_PCT : 0,
            precio_incluye_iva: false,
            base_linea: Math.round(cantidad * precio * 10000) / 10000,
            // Foto del costo al facturar, por unidad de venta (exportador: margen)
            costo_unitario: i.productos_terminados?.costo_promedio != null
                ? Math.round(Number(i.productos_terminados.costo_promedio) * factorLinea(i) * 10000) / 10000
                : null,
            _cantPrim: cantidadPrimaria(i),
        }
    })
    const totales = totalesDocumento(lineas.map(l => ({ base: l.cantidad * l.precio_unitario, aplicaIva: l.aplica_iva })))
    return { lineas, totales }
}

// Campos de totales para el insert de `ventas`
export const camposTotalesVenta = (t) => ({
    subtotal: t.subtotal,
    base_gravada: t.base_gravada,
    base_exenta: t.base_exenta,
    iva: t.iva,
    total: t.total,
    impuesto_pct: IVA_PCT,
})

// Payload para venta_items (quita los campos auxiliares)
export const lineasParaInsert = (lineas, ventaId, empresaId) =>
    lineas.map(({ _cantPrim, ...l }) => ({ ...l, venta_id: ventaId, empresa_id: empresaId }))
