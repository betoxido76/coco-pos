// IVA de una línea de pedido o venta.
//
// La línea guarda su propio `aplica_iva` al crearse (snapshot). Leerlo del
// producto en tiempo de cálculo haría que cambiar la casilla en el catálogo
// recalculara los totales de todos los documentos históricos.
//
// El fallback al producto cubre las líneas anteriores al snapshot, que es el
// comportamiento que tenían antes; `true` es el último recurso porque los
// precios se guardan con IVA embebido salvo que el producto esté exento.
export const itemAplicaIva = (item) =>
    item?.aplica_iva ?? item?.productos_terminados?.aplica_iva ?? true
