// Criterios de clasificación de producto compartidos por los reportes.
//
// `productos_terminados.tipo_producto` vale 'producido' | 'comprado' | 'servicio'.
// Un servicio (flete, despacho express) no es mercancía: no tiene stock, no se
// alista y no se despacha — Ventas.jsx, Inventario.jsx y notasCredito.js ya lo
// saltan al mover inventario.
//
// Por lo mismo NO cuenta como unidad vendida: sumar un flete al contador de
// unidades mezcla servicios con botellas y el número deja de ser comparable
// contra el conteo físico del cliente. Su FACTURACIÓN sí cuenta, porque es
// ingreso real.
//
// A diferencia de `aplica_iva`, `tipo_producto` no se guarda como snapshot en
// la línea: se lee del catálogo en tiempo de cálculo. Reclasificar un producto
// recalcula los reportes históricos, que es el comportamiento deseado aquí
// (corrige el pasado en vez de congelar una clasificación equivocada).
export const esServicio = (linea) =>
    (linea?.productos_terminados?.tipo_producto ?? linea?.tipo_producto) === 'servicio'

// Unidades de una línea de venta, normalizadas a la unidad primaria.
// `cantidad_primaria` ya viene normalizada; si falta (líneas viejas sin
// backfill) cae a `cantidad`. Los servicios aportan 0.
export function unidadesDeLinea(linea) {
    if (esServicio(linea)) return 0
    return linea?.cantidad_primaria != null
        ? Number(linea.cantidad_primaria)
        : Number(linea?.cantidad || 0)
}
