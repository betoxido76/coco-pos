### Maestros
```
empresas              -- Clientes del sistema
usuarios              -- Roles: admin, vendedor, produccion, almacen, finanzas, superadmin
modulos               -- Catálogo de módulos disponibles
empresa_modulos       -- Módulos contratados por empresa
usuario_modulos       -- Módulos habilitados por usuario
```

### Inventario
```
productos_terminados  -- SKU, stock_actual, costo_promedio, aplica_iva
                      --   updated_at (trigger set_updated_at) + actualizado_por uuid
materias_primas       -- Insumos de producción
materiales_empaque    -- Materiales de empaque
consumibles           -- Consumibles generales
almacenes             -- Almacenes por empresa (con es_default)
almacen_ubicaciones   -- Ubicaciones dentro de almacenes
stock_ubicacion       -- Stock por almacén/ubicación (tabla pivote)
movimientos_inventario -- Historial de todos los movimientos
```

### Invariante crítica
```
SUM(stock_ubicacion WHERE item_id=X) = stock_actual en tabla del producto
```
Después de cada ajuste, transferencia o recepción se llama `sincronizarStockActual()`.

### Ventas y cobros
```
ventas                -- Facturas
                      --   oc_cliente text (opcional, O/C del cliente)
                      --   direccion_entrega_id uuid, direccion_entrega_texto text
venta_items           -- Detalle de facturas
pedidos               -- Pedidos de venta (Realtime habilitado: supabase_realtime publication)
                      --   estado CHECK IN ('pendiente','aprobado','alistado','rechazado','facturado','despachado')
                      --   origen text ('oficina' | 'campo')
                      --   oc_cliente text (opcional, O/C del cliente)
                      --   direccion_entrega_id uuid, direccion_entrega_texto text
pedido_items          -- Detalle de pedidos
                      --   cantidad_alistada numeric (NULL = no alistado aún, 0 = cancelado, >0 = alistado)
                      --   aplica_iva boolean = snapshot al crear la línea (igual que venta_items).
                      --   NO leer productos_terminados.aplica_iva al calcular: cambiar la
                      --   casilla en el catálogo reescribiría totales históricos.
                      --   Usar siempre itemAplicaIva() de src/lib/iva.js.
                      --   subtotal es columna ALMACENADA: recalcularla en cada UPDATE
                      --   (la app del vendedor totaliza desde ella).
cobros                -- Cobros parciales/totales en multimoneda
                      --   nota text (singular, NOT notas), cuenta_bancaria_id uuid
                      --   devolucion_id uuid (NC aplicada como cobro)
                      --   fecha_cobro = fecha REAL del pago (puede ser anterior a hoy);
                      --   tasa_cambio/tipo_tasa vienen de tasas_cambio de ESA fecha
                      --   contribuyente_especial boolean = snapshot del estatus del
                      --   cliente al momento del pago. NULL = no registrado (cobros
                      --   viejos). NO hacer JOIN a clientes para reportes: el estatus
                      --   cambia en el tiempo y reescribiría el pasado.
devoluciones          -- Notas de crédito
                      --   numero_nc, cliente_id, nota_liquidacion, fecha_liquidacion
                      --   estado_nc CHECK IN ('pendiente','aplicada','reembolsada','anulada')
                      --   solicitud_id uuid → solicitudes_devolucion (nullable, para flujo SDR manufactura)
devolucion_items      -- Detalle de devoluciones
solicitudes_devolucion     -- Paso 1 del flujo SDR (manufactura): almacén registra recepción física
                           --   numero_solicitud, venta_id, pedido_id (nullable), cliente_id
                           --   numero_pedido text (denormalizado para búsqueda por almacén)
                           --   almacen_id, notas_almacen, usuario_almacen_id
                           --   fecha_recepcion date, estado text ('recibida'|'autorizada'|'rechazada')
                           --   motivo_rechazo text (nullable)
solicitud_devolucion_items -- Detalle de SDR: producto_id, cantidad_recibida, precio_unitario, aplica_iva
```

### Compras
```
ordenes_compra        -- OC a proveedores
orden_compra_items    -- Detalle de OC
compras               -- Recepciones
compra_items          -- Detalle de recepciones
                      --   tipo_insumo CHECK IN ('materia_prima','empaque','material_empaque','consumible','producto_terminado')
pagos_proveedor       -- Pagos a proveedores
                      --   devolucion_proveedor_id → devoluciones_proveedor (ND)
                      --   anulado boolean (default false), motivo_anulacion,
                      --   anulado_por → usuarios, fecha_anulacion. Anulación lógica
                      --   vía RPC anular_pago_proveedor. FILTRAR anulado=false.
                      --   2 FKs a usuarios → embed con hint usuarios!usuario_id
                      --   anticipo_id → anticipos_proveedor: APLICACIÓN de un anticipo.
                      --   Siempre sin cuenta_bancaria_id (CHECK) y solo vía RPC (trigger).
                      --   Lectores de caja la excluyen: el dinero salió con el anticipo.
anticipos_proveedor   -- Anticipos pagados antes de recibir (ANT-000001), CLAUDE.md §7
                      --   proveedor_id!, orden_compra_id (nullable = saldo a favor sin OC)
                      --   fecha date, monto_usd, monto_bs, tasa_cambio, tipo_tasa,
                      --   metodo_usd/bs, cuenta_bancaria_id, monto_equiv_usd (USD a la tasa del día)
                      --   nro_doc_proveedor, estado ('disponible','aplicado_parcial',
                      --   'aplicado','reembolsado','anulado') — lo escribe recalcular_anticipo()
                      --   2 FKs a usuarios → embed con hint usuarios!usuario_id
                      --   Escritura SOLO por RPC (sin políticas de INSERT/UPDATE)
anticipo_reembolsos   -- El proveedor devuelve dinero de un anticipo (entra al banco)
                      --   anticipo_id!, fecha, montos, cuenta_bancaria_id, anulado
v_anticipos_saldo     -- Vista (security_invoker): anticipo + aplicado_usd, reembolsado_usd, saldo_usd
                      --   Sin embeds sobre la vista: resolver proveedor/OC con otra consulta
devoluciones_proveedor     -- Notas de débito a proveedor
devolucion_proveedor_items -- Detalle de ND
```

### Producción
```
recetas               -- Recetas de productos
                      --   producto_id uuid → productos_terminados (nullable)
                      --   mp_id uuid → materias_primas (nullable)
                      --   Exactamente uno de los dos tiene valor (el otro es NULL)
                      --   Filtrar receta por PT: .eq('producto_id', id)
                      --   Filtrar receta por MP: .eq('mp_id', id)
                      --   planificar_por ('salida' default | 'insumo') + insumo_base_tipo/insumo_base_id:
                      --   con 'insumo' la orden pide cuánto del insumo base se procesa y la salida
                      --   es un estimado (caso Meraki 30001: cocos de agua → litros). El insumo base
                      --   se referencia por (tipo, id): el editor borra y reinserta receta_items.
                      --   SIEMPRE filtrar por empresa_id al buscar la receta.
receta_items          -- Ingredientes de recetas
ordenes_produccion    -- Órdenes de producción
                      --   planificada_por, insumo_base_tipo/id, cantidad_insumo_base: foto de cómo se
                      --   planificó. Con 'insumo', cantidad_planificada es el rinde estimado (2 dec.)
                      --   y el factor de la receta sale de cantidad_insumo_base (factorOrden() en
                      --   Produccion.jsx), no de cantidad_planificada.
lote_consumos         -- Insumos consumidos por orden/lote (lote_id nullable — NULL = planificado al crear, se asigna al cerrar)
lotes_produccion      -- Lotes de PT producidos
```

### Clientes y proveedores
```
clientes              -- cat1_id..cat4_id, limite_credito numeric, vehiculo text
                      --   contacto_comercial, email_comercial, telefono_comercial
                      --   contacto_administrativo, email_administrativo, telefono_administrativo
categorias_clientes   -- 4 niveles de categorías por empresa
perfilamiento_clientes -- Perfiles de segmentación de clientes
proveedores           -- condicion_pago, dias_credito
cuentas_proveedor     -- Cuentas bancarias del proveedor (multi-cuenta)
                      --   proveedor_id, banco, tipo_cuenta, numero_cuenta, titular,
                      --   rif_titular, es_predeterminada boolean, empresa_id
direcciones_entrega   -- Direcciones de entrega por cliente
```

### Operaciones
```
mermas                -- almacen_id, numero_merma, tipo_merma
cambios_mano_mano     -- almacen_id origen (nullable), despachador_id (nullable)
                      --   estado text: 'solicitado' (desde campo, sin stock) | 'ejecutado' (procesado)
stock_reproceso       -- almacen_id, estado
gastos                -- monto_usd, monto_bs, tipo_tasa, metodo_pago,
                      --   estado ('pagado'|'pendiente'), fecha_vencimiento,
                      --   cuenta_bancaria_id → cuentas_bancarias
                      --   numero_factura text (opcional, factura del proveedor)
tipos_gastos          -- Tipos de gasto personalizables por empresa
configuracion         -- Tasa VIGENTE: clave/valor por empresa_id
                      --   claves: tasa_bcv, tasa_euro, tasa_binance
tasas_cambio          -- HISTÓRICO de tasas por fecha (ver CLAUDE.md §7)
                      --   empresa_id, fecha date, tasa_bcv, tasa_euro, tasa_binance
                      --   UNIQUE (empresa_id, fecha) → el upsert sobreescribe el día
listas_precio
producto_precios
visitas_comerciales   -- Visitas de campo desde NuevoPedido
                      --   tipo text (presencial|llamada|whatsapp|videollamada)  ← NO tipo_visita
                      --   resultado text (pedido_tomado|sin_pedido|reagendar|no_contesto)
                      --   fecha_visita timestamptz NOT NULL
                      --   pedido_id uuid (opcional)
```

### Requisiciones (consumo interno) — docs/plan-requisiciones.md
```
areas_consumo         -- Áreas que solicitan, editables por empresa (nombre único por empresa)
requisiciones         -- RQ-000001: solicitante_id → usuarios, area_id, almacen_id,
                      --   estado ('pendiente','entregada','anulada'), entregado_por, fecha_entrega,
                      --   anulado_por, motivo_anulacion. 3 FKs a usuarios → hint usuarios!solicitante_id
requisicion_items     -- tipo_item, item_id, foto nombre/código/unidad, cantidad_solicitada,
                      --   cantidad_entregada, costo_unitario (congelado al entregar)
                      -- Escritura SOLO por RPC: crear_requisicion / entregar_requisicion /
                      --   anular_requisicion. Movimientos con origen 'requisicion' y
                      --   'anulacion_requisicion' (nota = RQ · área).
```

### Finanzas / Bancos
```
cuentas_bancarias     -- Cuentas por empresa: banco, numero_cuenta, tipo_cuenta, moneda, saldo_inicial, activa
movimientos_financieros -- Movimientos de caja/banco
                        --   tipo: 'cobro'|'pago'|'gasto'|'transferencia_entrada'|'transferencia_salida'
                        --   monto_usd, monto_bs, tasa_cambio, tipo_tasa
                        --   cuenta_bancaria_id, transferencia_par_id (UUID espejo en transferencias)
                        --   estado, fecha, fecha_vencimiento
```

### Autopartes
```
vehiculos             -- Catálogo de vehículos (marca!, modelo!, submodelo, tipo) por empresa
producto_vehiculo     -- Compatibilidad producto↔vehículo (año_inicio!, año_fin!, posicion)
productos_autopartes  -- Datos extras de repuesto (nro_parte, marca, tipo, barras_2, barras_3)
                      -- tipo mapea desde SQLite barras_1 (ej: LISO, PERFORADO)
-- NOTA: compatibilidades_vehiculo es tabla LEGACY — usar siempre producto_vehiculo + vehiculos
```

### Inventario avanzado
```
inventario_ubicacion  -- Stock por tipo_item/item_id/ubicacion_id con info de lote
lotes_inventario_mp   -- Lotes de recepción de MP/ME/consumibles (compra_id, proveedor_id, vencimiento)
producto_ubicacion    -- Ubicaciones preferidas por producto (proveedor_preferido, stock_mínimo_ubicación)
ubicaciones           -- Ubicaciones generales (tipo, ciudad, responsable_id) — distinto de almacen_ubicaciones
```
