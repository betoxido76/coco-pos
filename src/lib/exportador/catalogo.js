// Catálogo del exportador del Dashboard (docs/plan-exportador.md).
//
// Cada fuente apunta a vistas planas de la base (exportador_faseN.sql) que ya
// traen todo cruzado y calculado como el resto del sistema. Aquí solo se
// describe qué columnas puede elegir el usuario y cómo mostrarlas.
//
// Campo: { col, label, tipo, grupo, def?, modos?, aviso? }
//   tipo:  'texto' | 'numero' | 'moneda' | 'pct' | 'fecha' | 'bool'
//   modos: en qué detalle está disponible ('documento' | 'producto'); por defecto ambos
//   aviso: se muestra junto al campo y en la hoja Info del archivo

const DEL_DOC = 'Del documento: se repite en cada línea, no lo sumes en el detalle por producto'

const DOC = ['documento']
const PROD = ['producto']

const CAMPOS_VENTAS = [
    // Documento
    { col: 'numero_factura', label: 'N° nota', tipo: 'texto', grupo: 'Documento', def: true },
    { col: 'fecha', label: 'Fecha', tipo: 'fecha', grupo: 'Documento', def: true },
    { col: 'hora', label: 'Hora', tipo: 'texto', grupo: 'Documento' },
    { col: 'numero_pedido', label: 'N° pedido', tipo: 'texto', grupo: 'Documento' },
    { col: 'oc_cliente', label: 'O/C del cliente', tipo: 'texto', grupo: 'Documento' },
    { col: 'nro_referencia', label: 'N° referencia', tipo: 'texto', grupo: 'Documento' },
    { col: 'estado_cobro', label: 'Estado de cobro', tipo: 'texto', grupo: 'Documento' },
    { col: 'estatus', label: 'Estatus (pagado / al día / vencido)', tipo: 'texto', grupo: 'Documento', def: true },
    { col: 'anulada', label: 'Anulada', tipo: 'bool', grupo: 'Documento' },
    // Cliente
    { col: 'cliente_codigo', label: 'Código cliente', tipo: 'texto', grupo: 'Cliente' },
    { col: 'cliente', label: 'Cliente', tipo: 'texto', grupo: 'Cliente', def: true },
    { col: 'cliente_rif', label: 'RIF / CI', tipo: 'texto', grupo: 'Cliente' },
    { col: 'canal', label: 'Canal (categoría 1)', tipo: 'texto', grupo: 'Cliente' },
    { col: 'cliente_cat2', label: 'Categoría 2', tipo: 'texto', grupo: 'Cliente' },
    { col: 'cliente_cat3', label: 'Categoría 3', tipo: 'texto', grupo: 'Cliente' },
    { col: 'cliente_cat4', label: 'Categoría 4', tipo: 'texto', grupo: 'Cliente' },
    { col: 'condicion_pago', label: 'Condición de pago', tipo: 'texto', grupo: 'Cliente' },
    { col: 'dias_credito', label: 'Días de crédito', tipo: 'numero', grupo: 'Cliente' },
    { col: 'contribuyente_especial', label: 'Contribuyente especial', tipo: 'bool', grupo: 'Cliente' },
    // Entrega
    { col: 'direccion_entrega_nombre', label: 'Punto de entrega', tipo: 'texto', grupo: 'Entrega' },
    { col: 'direccion_entrega_texto', label: 'Dirección de entrega', tipo: 'texto', grupo: 'Entrega' },
    { col: 'direccion_ciudad', label: 'Ciudad', tipo: 'texto', grupo: 'Entrega' },
    // Vendedor
    { col: 'vendedor', label: 'Vendedor', tipo: 'texto', grupo: 'Vendedor' },
    { col: 'emitida_por', label: 'Emitida por', tipo: 'texto', grupo: 'Vendedor' },
    // Producto (solo detalle)
    { col: 'sku', label: 'SKU', tipo: 'texto', grupo: 'Producto', def: true, modos: PROD },
    { col: 'producto', label: 'Producto', tipo: 'texto', grupo: 'Producto', def: true, modos: PROD },
    { col: 'tipo_producto', label: 'Tipo de producto', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'producto_cat1', label: 'Categoría producto 1', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'producto_cat2', label: 'Categoría producto 2', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'producto_cat3', label: 'Categoría producto 3', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'producto_cat4', label: 'Categoría producto 4', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'unidad_venta', label: 'Unidad de venta', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'cantidad', label: 'Cantidad (unidad de venta)', tipo: 'numero', grupo: 'Producto', def: true, modos: PROD },
    { col: 'linea_unidades_primarias', label: 'Unidades (unidad primaria)', tipo: 'numero', grupo: 'Producto', modos: PROD },
    // Montos de la línea (solo detalle)
    { col: 'precio_base', label: 'Precio sin IVA', tipo: 'moneda', grupo: 'Montos de la línea', def: true, modos: PROD },
    { col: 'aplica_iva', label: 'Aplica IVA', tipo: 'bool', grupo: 'Montos de la línea', modos: PROD },
    { col: 'base_linea', label: 'Base de la línea', tipo: 'moneda', grupo: 'Montos de la línea', def: true, modos: PROD },
    { col: 'iva_linea', label: 'IVA de la línea (prorrateado)', tipo: 'moneda', grupo: 'Montos de la línea', modos: PROD,
      aviso: 'El IVA oficial es el de la nota, calculado sobre su base total: la suma por línea puede diferir por céntimos' },
    { col: 'total_linea', label: 'Total de la línea', tipo: 'moneda', grupo: 'Montos de la línea', def: true, modos: PROD },
    // Montos del documento
    { col: 'base_gravada', label: 'Base gravada', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'base_exenta', label: 'Base exenta', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'iva', label: 'IVA', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'total', label: 'Total', tipo: 'moneda', grupo: 'Montos del documento', def: true },
    { col: 'cobrado', label: 'Cobrado', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'nc_aplicadas', label: 'Notas de crédito aplicadas', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'saldo', label: 'Saldo pendiente', tipo: 'moneda', grupo: 'Montos del documento', def: true },
    // Cobranza
    { col: 'vencimiento', label: 'Vencimiento', tipo: 'fecha', grupo: 'Cobranza' },
    { col: 'dias_vencida', label: 'Días vencida', tipo: 'numero', grupo: 'Cobranza' },
    { col: 'unidades_primarias', label: 'Unidades de la nota (primaria)', tipo: 'numero', grupo: 'Montos del documento' },
    { col: 'lineas', label: 'Cantidad de líneas', tipo: 'numero', grupo: 'Montos del documento', modos: DOC },
    // Costo y margen
    { col: 'costo', label: 'Costo', tipo: 'moneda', grupo: 'Costo y margen', modos: DOC },
    { col: 'margen', label: 'Margen $', tipo: 'moneda', grupo: 'Costo y margen', modos: DOC },
    { col: 'margen_pct', label: 'Margen %', tipo: 'pct', grupo: 'Costo y margen', modos: DOC },
    { col: 'costo_estimado', label: 'Costo estimado', tipo: 'bool', grupo: 'Costo y margen', modos: DOC },
    { col: 'costo_unitario', label: 'Costo unitario', tipo: 'moneda', grupo: 'Costo y margen', modos: PROD },
    { col: 'costo_linea', label: 'Costo de la línea', tipo: 'moneda', grupo: 'Costo y margen', modos: PROD },
    { col: 'linea_margen', label: 'Margen $', tipo: 'moneda', grupo: 'Costo y margen', modos: PROD },
    { col: 'linea_margen_pct', label: 'Margen %', tipo: 'pct', grupo: 'Costo y margen', modos: PROD },
    { col: 'linea_costo_estimado', label: 'Costo estimado', tipo: 'bool', grupo: 'Costo y margen', modos: PROD },
]

// Montos del documento repetidos en el detalle por producto
const COLS_DEL_DOC = new Set(['base_gravada', 'base_exenta', 'iva', 'total', 'cobrado', 'nc_aplicadas', 'saldo', 'unidades_primarias'])

const AVISO_COSTO = 'Costo estimado = Sí: venta anterior a 2026-10-03, sin foto del costo al facturar; se usa el costo promedio actual del producto'

export const FUENTES = {
    ventas: {
        etiqueta: 'Ventas',
        // Vista por detalle; el orden asegura paginación estable
        vistas: {
            documento: { vista: 'v_export_ventas', orden: ['created_at', 'venta_id'] },
            producto: { vista: 'v_export_ventas_detalle', orden: ['created_at', 'venta_id', 'linea_id'] },
        },
        campos: CAMPOS_VENTAS,
        avisos: [AVISO_COSTO],
        // Filtros del Dashboard → columnas de la vista
        filtros: {
            fechaCol: 'created_at',
            cliente: 'cliente_id',
            canal: 'canal',
            vendedor: 'vendedor_id',
            // En "por documento": notas que contienen el producto (con su total completo)
            producto: { documento: { col: 'producto_ids', op: 'contains' }, producto: { col: 'linea_producto_id', op: 'eq' } },
            anulados: 'anulada',
        },
    },
}

// Campos de una fuente disponibles para un detalle, con el aviso de "del documento"
export function camposDe(fuenteKey, modo) {
    const f = FUENTES[fuenteKey]
    return f.campos
        .filter(c => !c.modos || c.modos.includes(modo))
        .map(c => (modo === 'producto' && COLS_DEL_DOC.has(c.col) && !c.aviso) ? { ...c, aviso: DEL_DOC } : c)
}

export const gruposDe = (campos) => [...new Set(campos.map(c => c.grupo))]
