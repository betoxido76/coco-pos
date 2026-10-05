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

// ── Pedidos ──
const CAMPOS_PEDIDOS = [
    { col: 'numero_pedido', label: 'N° pedido', tipo: 'texto', grupo: 'Documento', def: true },
    { col: 'fecha', label: 'Fecha', tipo: 'fecha', grupo: 'Documento', def: true },
    { col: 'hora', label: 'Hora', tipo: 'texto', grupo: 'Documento' },
    { col: 'estado', label: 'Estado', tipo: 'texto', grupo: 'Documento', def: true },
    { col: 'origen', label: 'Origen (oficina / campo)', tipo: 'texto', grupo: 'Documento' },
    { col: 'anulado', label: 'Rechazado / anulado', tipo: 'bool', grupo: 'Documento' },
    { col: 'fecha_entrega', label: 'Fecha de entrega', tipo: 'fecha', grupo: 'Documento' },
    { col: 'fecha_despacho', label: 'Fecha de despacho (programada)', tipo: 'fecha', grupo: 'Documento' },
    { col: 'oc_cliente', label: 'O/C del cliente', tipo: 'texto', grupo: 'Documento' },
    { col: 'nota_entrega', label: 'Nota de entrega', tipo: 'texto', grupo: 'Documento' },
    { col: 'notas', label: 'Notas', tipo: 'texto', grupo: 'Documento' },
    { col: 'motivo_rechazo', label: 'Motivo de rechazo', tipo: 'texto', grupo: 'Documento' },
    { col: 'motivo_anulacion', label: 'Motivo de anulación', tipo: 'texto', grupo: 'Documento' },
    { col: 'cliente_codigo', label: 'Código cliente', tipo: 'texto', grupo: 'Cliente' },
    { col: 'cliente', label: 'Cliente', tipo: 'texto', grupo: 'Cliente', def: true },
    { col: 'cliente_rif', label: 'RIF / CI', tipo: 'texto', grupo: 'Cliente' },
    { col: 'canal', label: 'Canal (categoría 1)', tipo: 'texto', grupo: 'Cliente' },
    { col: 'cliente_cat2', label: 'Categoría 2', tipo: 'texto', grupo: 'Cliente' },
    { col: 'direccion_entrega_nombre', label: 'Punto de entrega', tipo: 'texto', grupo: 'Entrega' },
    { col: 'direccion_entrega_texto', label: 'Dirección de entrega', tipo: 'texto', grupo: 'Entrega' },
    { col: 'direccion_ciudad', label: 'Ciudad', tipo: 'texto', grupo: 'Entrega' },
    { col: 'vendedor', label: 'Vendedor', tipo: 'texto', grupo: 'Vendedor', def: true },
    { col: 'lista_precio', label: 'Lista de precio', tipo: 'texto', grupo: 'Vendedor' },
    { col: 'sku', label: 'SKU', tipo: 'texto', grupo: 'Producto', def: true, modos: PROD },
    { col: 'producto', label: 'Producto', tipo: 'texto', grupo: 'Producto', def: true, modos: PROD },
    { col: 'tipo_producto', label: 'Tipo de producto', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'producto_cat1', label: 'Categoría producto 1', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'producto_cat2', label: 'Categoría producto 2', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'unidad_venta', label: 'Unidad de venta', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'cantidad_pedida', label: 'Cantidad pedida (unidad de venta)', tipo: 'numero', grupo: 'Producto', def: true, modos: PROD },
    { col: 'linea_unidades_pedidas', label: 'Unidades pedidas (primaria)', tipo: 'numero', grupo: 'Producto', modos: PROD },
    { col: 'linea_unidades_alistadas', label: 'Unidades alistadas (primaria)', tipo: 'numero', grupo: 'Producto', modos: PROD },
    { col: 'estado_linea', label: 'Estado de la línea', tipo: 'texto', grupo: 'Producto', modos: PROD },
    { col: 'precio_base', label: 'Precio sin IVA', tipo: 'moneda', grupo: 'Montos de la línea', def: true, modos: PROD },
    { col: 'descuento_item', label: 'Descuento ítem %', tipo: 'pct', grupo: 'Montos de la línea', modos: PROD },
    { col: 'aplica_iva', label: 'Aplica IVA', tipo: 'bool', grupo: 'Montos de la línea', modos: PROD },
    { col: 'base_linea', label: 'Base de la línea (con descuentos)', tipo: 'moneda', grupo: 'Montos de la línea', def: true, modos: PROD },
    { col: 'iva_linea', label: 'IVA de la línea (prorrateado)', tipo: 'moneda', grupo: 'Montos de la línea', modos: PROD,
      aviso: 'El IVA oficial es el del pedido, calculado sobre su base total: la suma por línea puede diferir por céntimos' },
    { col: 'total_linea', label: 'Total de la línea', tipo: 'moneda', grupo: 'Montos de la línea', def: true, modos: PROD },
    { col: 'descuento_global', label: 'Descuento global %', tipo: 'pct', grupo: 'Montos del documento' },
    { col: 'base_gravada', label: 'Base gravada', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'base_exenta', label: 'Base exenta', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'iva', label: 'IVA', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'total', label: 'Total', tipo: 'moneda', grupo: 'Montos del documento', def: true },
    { col: 'lineas', label: 'Cantidad de líneas', tipo: 'numero', grupo: 'Montos del documento', modos: DOC },
    { col: 'unidades_pedidas', label: 'Unidades pedidas del pedido', tipo: 'numero', grupo: 'Montos del documento' },
    { col: 'unidades_alistadas', label: 'Unidades alistadas del pedido', tipo: 'numero', grupo: 'Montos del documento' },
]

// ── Cobros ──
const CAMPOS_COBROS = [
    { col: 'fecha', label: 'Fecha del pago', tipo: 'fecha', grupo: 'Cobro', def: true },
    { col: 'registrado_el', label: 'Registrado el', tipo: 'fecha', grupo: 'Cobro' },
    { col: 'registrado_por', label: 'Registrado por', tipo: 'texto', grupo: 'Cobro' },
    { col: 'monto_usd', label: 'Monto USD', tipo: 'moneda', grupo: 'Cobro', def: true },
    { col: 'monto_bs', label: 'Monto Bs.', tipo: 'moneda', grupo: 'Cobro', def: true },
    { col: 'tasa_cambio', label: 'Tasa', tipo: 'numero', grupo: 'Cobro' },
    { col: 'tipo_tasa', label: 'Tipo de tasa', tipo: 'texto', grupo: 'Cobro' },
    { col: 'monto_equiv_usd', label: 'Equivalente USD', tipo: 'moneda', grupo: 'Cobro', def: true },
    { col: 'metodo_usd', label: 'Método USD', tipo: 'texto', grupo: 'Cobro' },
    { col: 'metodo_bs', label: 'Método Bs.', tipo: 'texto', grupo: 'Cobro' },
    { col: 'banco', label: 'Banco', tipo: 'texto', grupo: 'Cobro' },
    { col: 'cuenta', label: 'Cuenta', tipo: 'texto', grupo: 'Cobro' },
    { col: 'numero_cuenta', label: 'N° de cuenta', tipo: 'texto', grupo: 'Cobro' },
    { col: 'nota', label: 'Nota', tipo: 'texto', grupo: 'Cobro' },
    { col: 'es_nota_credito', label: 'Es nota de crédito aplicada', tipo: 'bool', grupo: 'Cobro', def: true,
      aviso: 'Una NC aplicada como cobro no es dinero: fíltrala para cuadrar con Bancos' },
    { col: 'numero_nc', label: 'N° NC', tipo: 'texto', grupo: 'Cobro' },
    { col: 'contribuyente_especial', label: 'Contribuyente especial (al pagar)', tipo: 'bool', grupo: 'Cobro' },
    { col: 'numero_factura', label: 'N° nota', tipo: 'texto', grupo: 'Nota cobrada', def: true },
    { col: 'fecha_nota', label: 'Fecha de la nota', tipo: 'fecha', grupo: 'Nota cobrada' },
    { col: 'total_nota', label: 'Total de la nota', tipo: 'moneda', grupo: 'Nota cobrada' },
    { col: 'estado_cobro', label: 'Estado de cobro', tipo: 'texto', grupo: 'Nota cobrada' },
    { col: 'cliente_codigo', label: 'Código cliente', tipo: 'texto', grupo: 'Cliente' },
    { col: 'cliente', label: 'Cliente', tipo: 'texto', grupo: 'Cliente', def: true },
    { col: 'cliente_rif', label: 'RIF / CI', tipo: 'texto', grupo: 'Cliente' },
    { col: 'canal', label: 'Canal (categoría 1)', tipo: 'texto', grupo: 'Cliente' },
    { col: 'vendedor', label: 'Vendedor', tipo: 'texto', grupo: 'Cliente' },
]

// ── Cartera CxC: estado actual ──
const CAMPOS_CARTERA_CXC = [
    ...CAMPOS_VENTAS.filter(c => !c.modos || c.modos.includes('documento'))
        .filter(c => !['anulada', 'costo', 'margen', 'margen_pct', 'costo_estimado', 'lineas'].includes(c.col)),
    { col: 'antiguedad_dias', label: 'Antigüedad (días desde la emisión)', tipo: 'numero', grupo: 'Cobranza', def: true },
    { col: 'tramo_antiguedad', label: 'Tramo de antigüedad', tipo: 'texto', grupo: 'Cobranza', def: true },
].map(c => c.col === 'vencimiento' || c.col === 'dias_vencida' ? { ...c, def: true } : c)

// ── Compras (recepciones) ──
const CAMPOS_COMPRAS = [
    { col: 'numero_doc', label: 'N° recepción', tipo: 'texto', grupo: 'Documento', def: true },
    { col: 'nro_doc_proveedor', label: 'Factura del proveedor', tipo: 'texto', grupo: 'Documento', def: true },
    { col: 'fecha', label: 'Fecha', tipo: 'fecha', grupo: 'Documento', def: true },
    { col: 'numero_oc', label: 'N° OC', tipo: 'texto', grupo: 'Documento' },
    { col: 'almacen', label: 'Almacén', tipo: 'texto', grupo: 'Documento' },
    { col: 'recibido_por', label: 'Recibido por', tipo: 'texto', grupo: 'Documento' },
    { col: 'estado_cobro', label: 'Estado de pago', tipo: 'texto', grupo: 'Documento' },
    { col: 'estatus', label: 'Estatus (pagado / al día / vencido)', tipo: 'texto', grupo: 'Documento', def: true },
    { col: 'anulada', label: 'Anulada', tipo: 'bool', grupo: 'Documento' },
    { col: 'proveedor', label: 'Proveedor', tipo: 'texto', grupo: 'Proveedor', def: true },
    { col: 'proveedor_rif', label: 'RIF proveedor', tipo: 'texto', grupo: 'Proveedor' },
    { col: 'condicion_pago', label: 'Condición de pago', tipo: 'texto', grupo: 'Proveedor' },
    { col: 'dias_credito', label: 'Días de crédito', tipo: 'numero', grupo: 'Proveedor' },
    { col: 'tipo_insumo', label: 'Tipo de insumo', tipo: 'texto', grupo: 'Insumo', modos: PROD },
    { col: 'insumo_codigo', label: 'Código', tipo: 'texto', grupo: 'Insumo', def: true, modos: PROD },
    { col: 'insumo', label: 'Insumo', tipo: 'texto', grupo: 'Insumo', def: true, modos: PROD },
    { col: 'unidad', label: 'Unidad', tipo: 'texto', grupo: 'Insumo', modos: PROD },
    { col: 'cantidad', label: 'Cantidad', tipo: 'numero', grupo: 'Insumo', def: true, modos: PROD },
    { col: 'precio_base', label: 'Precio sin IVA', tipo: 'moneda', grupo: 'Montos de la línea', def: true, modos: PROD },
    { col: 'descuento_item', label: 'Descuento ítem %', tipo: 'pct', grupo: 'Montos de la línea', modos: PROD },
    { col: 'aplica_iva', label: 'Aplica IVA', tipo: 'bool', grupo: 'Montos de la línea', modos: PROD },
    { col: 'base_linea', label: 'Base de la línea (con descuentos)', tipo: 'moneda', grupo: 'Montos de la línea', def: true, modos: PROD },
    { col: 'iva_linea', label: 'IVA de la línea (prorrateado)', tipo: 'moneda', grupo: 'Montos de la línea', modos: PROD,
      aviso: 'El IVA oficial es el de la recepción, calculado sobre su base total: la suma por línea puede diferir por céntimos' },
    { col: 'total_linea', label: 'Total de la línea', tipo: 'moneda', grupo: 'Montos de la línea', def: true, modos: PROD },
    { col: 'descuento_global', label: 'Descuento global %', tipo: 'pct', grupo: 'Montos del documento' },
    { col: 'base_gravada', label: 'Base gravada', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'base_exenta', label: 'Base exenta', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'iva', label: 'IVA', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'total', label: 'Total', tipo: 'moneda', grupo: 'Montos del documento', def: true },
    { col: 'descuento_pronto_pago', label: 'Descuento por pronto pago', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'pagado', label: 'Pagado (incluye anticipos y ND aplicados)', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'aplicado_anticipos', label: 'Anticipos aplicados', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'aplicado_notas_debito', label: 'Notas de débito aplicadas', tipo: 'moneda', grupo: 'Montos del documento' },
    { col: 'retenido', label: 'Retenido (IVA + ISLR)', tipo: 'moneda', grupo: 'Montos del documento',
      aviso: 'Ya está incluido en Pagado: no se le paga al proveedor, se le debe al SENIAT' },
    { col: 'saldo', label: 'Saldo pendiente', tipo: 'moneda', grupo: 'Montos del documento', def: true },
    { col: 'vencimiento', label: 'Vencimiento', tipo: 'fecha', grupo: 'Pago' },
    { col: 'dias_vencida', label: 'Días vencida', tipo: 'numero', grupo: 'Pago' },
    { col: 'lineas', label: 'Cantidad de líneas', tipo: 'numero', grupo: 'Montos del documento', modos: DOC },
]

const CAMPOS_CARTERA_CXP = [
    ...CAMPOS_COMPRAS.filter(c => !c.modos || c.modos.includes('documento')).filter(c => !['anulada', 'lineas'].includes(c.col)),
    { col: 'antiguedad_dias', label: 'Antigüedad (días desde la recepción)', tipo: 'numero', grupo: 'Pago', def: true },
].map(c => c.col === 'vencimiento' || c.col === 'dias_vencida' ? { ...c, def: true } : c)

// ── Pagos a proveedor ──
const CAMPOS_PAGOS_PROV = [
    { col: 'fecha', label: 'Fecha del pago', tipo: 'fecha', grupo: 'Pago', def: true },
    { col: 'tipo', label: 'Tipo (pago / contado / anticipo / aplicación / ND / retención)', tipo: 'texto', grupo: 'Pago', def: true },
    { col: 'sale_de_caja', label: 'Sale de caja', tipo: 'bool', grupo: 'Pago', def: true,
      aviso: 'Las aplicaciones de anticipo y de ND y las retenciones no son dinero: el anticipo ya salió en su propio renglón y la retención se le debe al SENIAT' },
    { col: 'monto_usd', label: 'Monto USD', tipo: 'moneda', grupo: 'Pago', def: true },
    { col: 'monto_bs', label: 'Monto Bs.', tipo: 'moneda', grupo: 'Pago', def: true },
    { col: 'tasa_cambio', label: 'Tasa', tipo: 'numero', grupo: 'Pago' },
    { col: 'tipo_tasa', label: 'Tipo de tasa', tipo: 'texto', grupo: 'Pago' },
    { col: 'monto_equiv_usd', label: 'Equivalente USD', tipo: 'moneda', grupo: 'Pago', def: true },
    { col: 'metodo_usd', label: 'Método USD', tipo: 'texto', grupo: 'Pago' },
    { col: 'metodo_bs', label: 'Método Bs.', tipo: 'texto', grupo: 'Pago' },
    { col: 'banco', label: 'Banco', tipo: 'texto', grupo: 'Pago' },
    { col: 'cuenta', label: 'Cuenta', tipo: 'texto', grupo: 'Pago' },
    { col: 'nota', label: 'Nota', tipo: 'texto', grupo: 'Pago' },
    { col: 'registrado_por', label: 'Registrado por', tipo: 'texto', grupo: 'Pago' },
    { col: 'anulado', label: 'Anulado', tipo: 'bool', grupo: 'Pago' },
    { col: 'motivo_anulacion', label: 'Motivo de anulación', tipo: 'texto', grupo: 'Pago' },
    { col: 'recepcion', label: 'N° recepción', tipo: 'texto', grupo: 'Documento', def: true },
    { col: 'nro_doc_proveedor', label: 'Factura del proveedor', tipo: 'texto', grupo: 'Documento' },
    { col: 'numero_anticipo', label: 'N° anticipo', tipo: 'texto', grupo: 'Documento' },
    { col: 'proveedor', label: 'Proveedor', tipo: 'texto', grupo: 'Proveedor', def: true },
    { col: 'proveedor_rif', label: 'RIF proveedor', tipo: 'texto', grupo: 'Proveedor' },
]

// ── Gastos ──
const CAMPOS_GASTOS = [
    { col: 'numero_gasto', label: 'N° gasto', tipo: 'texto', grupo: 'Gasto', def: true },
    { col: 'fecha', label: 'Fecha', tipo: 'fecha', grupo: 'Gasto', def: true },
    { col: 'tipo_gasto', label: 'Tipo de gasto', tipo: 'texto', grupo: 'Gasto', def: true },
    { col: 'categoria', label: 'Categoría', tipo: 'texto', grupo: 'Gasto' },
    { col: 'concepto', label: 'Concepto', tipo: 'texto', grupo: 'Gasto', def: true },
    { col: 'descripcion', label: 'Descripción', tipo: 'texto', grupo: 'Gasto' },
    { col: 'numero_factura', label: 'N° factura', tipo: 'texto', grupo: 'Gasto' },
    { col: 'estado', label: 'Estado', tipo: 'texto', grupo: 'Gasto', def: true },
    { col: 'anulado', label: 'Anulado', tipo: 'bool', grupo: 'Gasto' },
    { col: 'motivo_anulacion', label: 'Motivo de anulación', tipo: 'texto', grupo: 'Gasto' },
    { col: 'registrado_por', label: 'Registrado por', tipo: 'texto', grupo: 'Gasto' },
    { col: 'proveedor', label: 'Proveedor', tipo: 'texto', grupo: 'Proveedor' },
    { col: 'monto_usd', label: 'Monto USD', tipo: 'moneda', grupo: 'Montos' },
    { col: 'monto_bs', label: 'Monto Bs.', tipo: 'moneda', grupo: 'Montos' },
    { col: 'tasa_cambio', label: 'Tasa', tipo: 'numero', grupo: 'Montos' },
    { col: 'tipo_tasa', label: 'Tipo de tasa', tipo: 'texto', grupo: 'Montos' },
    { col: 'total_usd', label: 'Total USD', tipo: 'moneda', grupo: 'Montos', def: true },
    { col: 'abonado', label: 'Abonado', tipo: 'moneda', grupo: 'Montos' },
    { col: 'retenido', label: 'Retenido (IVA + ISLR)', tipo: 'moneda', grupo: 'Montos',
      aviso: 'Ya está incluido en Abonado: no se le paga al proveedor, se le debe al SENIAT' },
    { col: 'saldo', label: 'Saldo pendiente', tipo: 'moneda', grupo: 'Montos', def: true },
    { col: 'vencimiento', label: 'Vencimiento', tipo: 'fecha', grupo: 'Pago' },
    { col: 'metodo_pago', label: 'Método de pago', tipo: 'texto', grupo: 'Pago' },
    { col: 'banco', label: 'Banco', tipo: 'texto', grupo: 'Pago' },
    { col: 'cuenta', label: 'Cuenta', tipo: 'texto', grupo: 'Pago' },
]

// ── Movimientos de inventario ──
const CAMPOS_MOVIMIENTOS = [
    { col: 'fecha', label: 'Fecha', tipo: 'fecha', grupo: 'Movimiento', def: true },
    { col: 'hora', label: 'Hora', tipo: 'texto', grupo: 'Movimiento' },
    { col: 'tipo_movimiento', label: 'Entrada / salida', tipo: 'texto', grupo: 'Movimiento', def: true },
    { col: 'origen', label: 'Origen', tipo: 'texto', grupo: 'Movimiento', def: true },
    { col: 'notas', label: 'Notas', tipo: 'texto', grupo: 'Movimiento' },
    { col: 'almacen', label: 'Almacén', tipo: 'texto', grupo: 'Movimiento', def: true },
    { col: 'ubicacion', label: 'Ubicación', tipo: 'texto', grupo: 'Movimiento' },
    { col: 'usuario', label: 'Usuario', tipo: 'texto', grupo: 'Movimiento' },
    { col: 'tipo_item', label: 'Tipo de ítem', tipo: 'texto', grupo: 'Ítem' },
    { col: 'item_codigo', label: 'Código', tipo: 'texto', grupo: 'Ítem', def: true },
    { col: 'item_nombre', label: 'Ítem', tipo: 'texto', grupo: 'Ítem', def: true },
    { col: 'cantidad', label: 'Cantidad', tipo: 'numero', grupo: 'Cantidades', def: true },
    { col: 'stock_anterior', label: 'Stock anterior', tipo: 'numero', grupo: 'Cantidades' },
    { col: 'stock_actual', label: 'Stock después', tipo: 'numero', grupo: 'Cantidades' },
    { col: 'costo_actual', label: 'Costo unitario actual', tipo: 'moneda', grupo: 'Valor' },
    { col: 'valor_costo_actual', label: 'Valor a costo actual', tipo: 'moneda', grupo: 'Valor',
      aviso: 'Se valora con el costo promedio de hoy, no con el del día del movimiento' },
]

// Montos del documento repetidos en el detalle por producto
const COLS_DEL_DOC = new Set(['pagado', 'aplicado_anticipos', 'aplicado_notas_debito', 'retenido', 'descuento_pronto_pago', 'base_gravada', 'base_exenta', 'iva', 'total', 'cobrado', 'nc_aplicadas', 'saldo',
    'unidades_primarias', 'descuento_global', 'unidades_pedidas', 'unidades_alistadas'])

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
    pedidos: {
        etiqueta: 'Pedidos',
        vistas: {
            documento: { vista: 'v_export_pedidos', orden: ['fecha_pedido', 'pedido_id'] },
            producto: { vista: 'v_export_pedidos_detalle', orden: ['fecha_pedido', 'pedido_id', 'linea_id'] },
        },
        campos: CAMPOS_PEDIDOS,
        avisos: ['Los montos de un pedido alistado/facturado usan lo alistado; uno pendiente o aprobado, lo pedido'],
        filtros: {
            fechaCol: 'fecha_pedido',
            cliente: 'cliente_id', canal: 'canal', vendedor: 'vendedor_id',
            producto: { documento: { col: 'producto_ids', op: 'contains' }, producto: { col: 'linea_producto_id', op: 'eq' } },
            anulados: 'anulado',
        },
    },
    cobros: {
        etiqueta: 'Cobros',
        vistas: { documento: { vista: 'v_export_cobros', orden: ['fecha_cobro', 'cobro_id'] } },
        etiquetaDocumento: 'Por cobro',
        campos: CAMPOS_COBROS,
        avisos: ['Fecha = fecha real del pago (no la del registro), en hora de Venezuela'],
        filtros: { fechaCol: 'fecha_cobro', cliente: 'cliente_id', canal: 'canal', vendedor: 'vendedor_id', anulados: 'anulado' },
    },
    cartera_cxc: {
        etiqueta: 'Cartera CxC',
        vistas: { documento: { vista: 'v_export_cartera_cxc', orden: ['created_at', 'venta_id'] } },
        etiquetaDocumento: 'Por nota pendiente',
        campos: CAMPOS_CARTERA_CXC,
        avisos: ['Estado actual de la cartera: no se filtra por fechas (igual que los indicadores de CxC del Dashboard)'],
        filtros: { fechaCol: null, cliente: 'cliente_id', canal: 'canal', vendedor: 'vendedor_id' },
    },
    compras: {
        etiqueta: 'Compras',
        vistas: {
            documento: { vista: 'v_export_compras', orden: ['fecha_compra', 'compra_id'] },
            producto: { vista: 'v_export_compras_detalle', orden: ['fecha_compra', 'compra_id', 'linea_id'] },
        },
        etiquetaDocumento: 'Por recepción',
        campos: CAMPOS_COMPRAS,
        avisos: ['Recepciones anteriores a 2026-10: la suma de sus líneas puede no coincidir con el total (esas líneas no guardaban si llevaban IVA y se tomó del catálogo actual). El total oficial es el de la recepción'],
        // El filtro de producto del Dashboard aplica si ese producto se compró (PT comprado)
        filtros: {
            fechaCol: 'fecha_compra',
            producto: { documento: { col: 'insumo_ids', op: 'contains' }, producto: { col: 'linea_insumo_id', op: 'eq' } },
            anulados: 'anulada',
        },
    },
    pagos_proveedor: {
        etiqueta: 'Pagos a proveedor',
        vistas: { documento: { vista: 'v_export_pagos_proveedor', orden: ['fecha', 'pago_id'] } },
        etiquetaDocumento: 'Por pago',
        campos: CAMPOS_PAGOS_PROV,
        avisos: ['Incluye pagos contra recepciones, pagos de contado al recibir y anticipos. Para cuadrar con Bancos usa solo "Sale de caja = Sí"'],
        filtros: { fechaCol: 'fecha', fechaTipo: 'date', anulados: 'anulado' },
    },
    cartera_cxp: {
        etiqueta: 'Cartera CxP',
        vistas: { documento: { vista: 'v_export_cartera_cxp', orden: ['fecha_compra', 'compra_id'] } },
        etiquetaDocumento: 'Por recepción pendiente',
        campos: CAMPOS_CARTERA_CXP,
        avisos: ['Estado actual de las cuentas por pagar: no se filtra por fechas (igual que CxP)'],
        filtros: { fechaCol: null },
    },
    gastos: {
        etiqueta: 'Gastos',
        vistas: { documento: { vista: 'v_export_gastos', orden: ['fecha', 'gasto_id'] } },
        etiquetaDocumento: 'Por gasto',
        campos: CAMPOS_GASTOS,
        avisos: [],
        filtros: { fechaCol: 'fecha', fechaTipo: 'date', anulados: 'anulado' },
    },
    movimientos: {
        etiqueta: 'Movimientos de inventario',
        vistas: { documento: { vista: 'v_export_movimientos', orden: ['fecha_hora', 'movimiento_id'] } },
        etiquetaDocumento: 'Por movimiento',
        campos: CAMPOS_MOVIMIENTOS,
        avisos: [],
        filtros: { fechaCol: 'fecha_hora', producto: { documento: { col: 'item_id', op: 'eq' } } },
    },
}

// Filtros del Dashboard que una fuente no puede aplicar (para avisar en el panel)
export function filtrosIgnorados(fuenteKey, modo, filtros) {
    const m = FUENTES[fuenteKey].filtros
    const fuera = []
    if ((filtros.desde || filtros.hasta) && !m.fechaCol) fuera.push('fechas')
    if (filtros.cliente && !m.cliente) fuera.push('cliente')
    if (filtros.canal && !m.canal) fuera.push('canal')
    if (filtros.vendedor && !m.vendedor) fuera.push('vendedor')
    if (filtros.producto && !m.producto?.[modo]) fuera.push('producto')
    return fuera
}

// Campos de una fuente disponibles para un detalle, con el aviso de "del documento"
export function camposDe(fuenteKey, modo) {
    const f = FUENTES[fuenteKey]
    return f.campos
        .filter(c => !c.modos || c.modos.includes(modo))
        .map(c => (modo === 'producto' && COLS_DEL_DOC.has(c.col) && !c.aviso) ? { ...c, aviso: DEL_DOC } : c)
}

export const gruposDe = (campos) => [...new Set(campos.map(c => c.grupo))]
