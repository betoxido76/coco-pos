# MiPOS — Sistema POS de Manufactura
## Documento de contexto para Claude Code y otras instancias

---

## 1. Descripción general

**MiPOS** (antes Coco POS) es un sistema de gestión empresarial multi-cliente (SaaS) construido para empresas de manufactura. Está diseñado para venderse por módulos a distintos clientes, con soporte para múltiples perfiles de negocio (manufactura, autopartes, retail, etc.).

**URL de producción:** `https://coco-pos.pages.dev`  
**Repositorio:** `https://github.com/betoxido76/coco-pos`  
**Deploy:** Cloudflare Pages (auto-deploy en push a `main`)

---

## 2. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | React + Vite 6 + react-router-dom |
| Base de datos | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Edge Functions | Supabase Edge Functions (Deno) |
| Hosting | Cloudflare Pages |
| Estilos | Inline styles + Tailwind (clases en Login/ResetPassword) |

**Variables de entorno requeridas:**
```
VITE_SUPABASE_URL=https://opndtxvomtlpgwyyloqd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Nota de build:** El proyecto usa `vite-plugin-pwa` instalado con `--legacy-peer-deps`. El `.npmrc` tiene `legacy-peer-deps=true` y el build command en Cloudflare es `npm install --legacy-peer-deps && npm run build`.

---

## 3. Estructura del proyecto

```
src/
├── contexts/
│   └── AuthContext.jsx          # Maneja sesión, perfil y login/logout
├── lib/
│   └── supabaseClient.js        # Cliente de Supabase
├── pages/
│   ├── Login.jsx                # Login + recuperación de contraseña
│   ├── ResetPassword.jsx        # Página de nueva contraseña (desde email)
│   ├── Dashboard.jsx
│   ├── Inventario.jsx           # Stock por almacén, ajustes, transferencias
│   ├── Ventas.jsx               # Facturación + pedidos por facturar
│   ├── NuevoPedido.jsx          # App móvil fuerza de ventas — ver sección 16
│   ├── Pedidos.jsx              # Gestión de pedidos (aprobar/rechazar/facturar)
│   ├── Compras.jsx              # Recepciones libres y contra OC
│   ├── CuentasCobrar.jsx        # Cobro multimoneda (USD/Bs/Euro/Binance)
│   ├── CuentasPagar.jsx         # Pagos a proveedores
│   ├── Produccion.jsx           # Órdenes de producción con lotes
│   ├── Mermas.jsx               # Registro de pérdidas por almacén
│   ├── CambiosManoMano.jsx      # Cambios en anaquel + stock reproceso
│   ├── Gastos.jsx               # Gastos operativos multimoneda
│   ├── Administracion.jsx       # Hub de maestros y configuración
│   ├── SuperAdmin.jsx           # Panel exclusivo del dueño del sistema
│   └── [subpáginas de Admin]
│       ├── Productos.jsx
│       ├── MateriasPrimas.jsx
│       ├── Consumibles.jsx
│       ├── Clientes.jsx         # Con categorías de 4 niveles
│       ├── Proveedores.jsx
│       ├── Configuracion.jsx    # Tasas de cambio BCV/Euro/Binance
│       ├── ListasPrecios.jsx
│       ├── GestionAlmacenes.jsx
│       ├── AccesosUsuarios.jsx  # Admin cliente gestiona módulos por usuario
│       └── CargaDatos.jsx
├── components/
│   └── Layout.jsx               # Sidebar con filtrado por módulos
└── main.jsx                     # Rutas principales
```

---

## 4. Arquitectura multi-empresa (multi-tenant)

### Principio fundamental
Cada query lleva `.eq('empresa_id', perfil.empresa_id)`. Los datos de diferentes clientes están en la misma BD pero aislados por RLS.

### Función clave en Supabase
```sql
get_empresa_id() -- Retorna el empresa_id del usuario autenticado
is_superadmin()  -- Retorna true si el usuario tiene rol 'superadmin' (SECURITY DEFINER)
```

### RLS
Todas las tablas tienen RLS activo. Las políticas usan `get_empresa_id()` para aislar datos. El superadmin puede leer/escribir en todas las empresas gracias a `is_superadmin()`.

---

## 5. Sistema de módulos y permisos

### Jerarquía de 3 niveles
```
Superadmin (tú)
    └── define módulos por empresa  →  tabla: empresa_modulos
            └── admin del cliente asigna módulos a usuarios  →  tabla: usuario_modulos
```

### Módulos disponibles (tabla `modulos`)
```
dashboard, inventario, ventas, pedidos, compras, cxc, cxp,
produccion, cambios, mermas, administracion, gastos, pedidos_campo
```

### Cómo funciona en el frontend
`Layout.jsx` consulta `usuario_modulos` al cargar y filtra el sidebar. El superadmin ve todo sin restricciones.

### Rutas en main.jsx
```
/                    → Dashboard
/inventario          → Inventario
/ventas              → Ventas
/pedidos             → Pedidos
/nuevo-pedido        → NuevoPedido (app móvil fuerza de ventas)
/compras             → Compras
/cuentas-cobrar      → CuentasCobrar
/cuentas-pagar       → CuentasPagar
/gastos              → Gastos
/produccion          → Produccion
/mermas              → Mermas
/cambios-mano-mano   → CambiosManoMano
/administracion      → Administracion
/superadmin          → SuperAdmin (URL secreta, no en sidebar)
/reset-password      → ResetPassword (fuera del Layout)
/login               → Login (fuera del Layout)
```

---

## 6. Tablas principales en Supabase

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
productos_terminados  -- SKU, stock_actual, costo_promedio
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
venta_items           -- Detalle de facturas
pedidos               -- Pedidos de venta (Realtime habilitado: supabase_realtime publication)
                      --   estado CHECK IN ('pendiente','aprobado','alistado','rechazado','facturado')
                      --   origen text ('oficina' | 'campo')
pedido_items          -- Detalle de pedidos
                      --   cantidad_alistada numeric (NULL = no alistado aún, 0 = cancelado, >0 = despachado)
cobros                -- Cobros parciales/totales en multimoneda
devoluciones          -- Notas de crédito
devolucion_items      -- Detalle de devoluciones
```

### Compras
```
ordenes_compra        -- OC a proveedores
orden_compra_items    -- Detalle de OC
compras               -- Recepciones
compra_items          -- Detalle de recepciones
pagos_proveedor       -- Pagos a proveedores
```

### Producción
```
recetas               -- Recetas de productos
                      --   producto_id uuid → productos_terminados (nullable)
                      --   mp_id uuid → materias_primas (nullable)  ← sesión 2026-05-17
                      --   Exactamente uno de los dos tiene valor (el otro es NULL)
                      --   Filtrar receta por PT: .eq('producto_id', id)
                      --   Filtrar receta por MP: .eq('mp_id', id)
receta_items          -- Ingredientes de recetas
ordenes_produccion    -- Órdenes de producción
lote_consumos         -- Insumos consumidos por lote (con almacen_id)
lotes_produccion      -- Lotes de PT producidos
```

### Otros
```
clientes              -- cat1_id..cat4_id, limite_credito numeric, vehiculo text
categorias_clientes   -- 4 niveles de categorías por empresa
perfilamiento_clientes -- Perfiles de segmentación de clientes
proveedores           -- condicion_pago, dias_credito
mermas                -- almacen_id, numero_merma, tipo_merma
cambios_mano_mano     -- almacen_id origen
stock_reproceso       -- almacen_id, estado
gastos                -- monto_usd, monto_bs, tipo_tasa, metodo_pago,
                      --   estado ('pagado'|'pendiente'), fecha_vencimiento,
                      --   cuenta_bancaria_id   ← YA IMPLEMENTADO en BD
tipos_gastos          -- Tipos de gasto personalizables por empresa
configuracion         -- Tasas: clave/valor por empresa_id
                      --   claves: tasa_bcv, tasa_euro, tasa_binance
listas_precio
producto_precios
direcciones_entrega   -- Direcciones de entrega por cliente
visitas_comerciales   -- Visitas de campo desde NuevoPedido
                      --   tipo text (presencial|llamada|whatsapp|videollamada)  ← NO tipo_visita
                      --   resultado text (pedido_tomado|sin_pedido|reagendar|no_contesto)
                      --   fecha_visita timestamptz NOT NULL
                      --   pedido_id uuid (opcional)
cobros                -- nota text (singular, NOT notas)
                      --   cuenta_bancaria_id uuid
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
-- NOTA: compatibilidades_vehiculo es tabla LEGACY (usa parte_id y año_desde/año_hasta)
--       Usar siempre producto_vehiculo + vehiculos para nuevas funcionalidades
```

### Inventario avanzado
```
inventario_ubicacion  -- Stock por tipo_item/item_id/ubicacion_id con info de lote
lotes_inventario_mp   -- Lotes de recepción de MP/ME/consumibles (compra_id, proveedor_id, vencimiento)
producto_ubicacion    -- Ubicaciones preferidas por producto (proveedor_preferido, stock_mínimo_ubicación)
ubicaciones           -- Ubicaciones generales (tipo, ciudad, responsable_id) — distinto de almacen_ubicaciones
```

---

## 7. Multimoneda

Las tasas de cambio se guardan en la tabla `configuracion`:
```
tasa_bcv, tasa_euro, tasa_binance
```

Los cobros y gastos manejan `monto_usd` + `monto_bs` + `tasa_cambio` + `tipo_tasa`.
El equivalente en USD = `monto_usd + (monto_bs / tasa)`.

---

## 8. Sistema de almacenes

Cada empresa puede tener múltiples almacenes. El stock se registra en `stock_ubicacion` con `almacen_id` y opcionalmente `almacen_ubicacion_id`.

**Bug conocido y resuelto:** El `upsert` con `ON CONFLICT` no funciona cuando `almacen_ubicacion_id = NULL` en Postgres. La solución es usar `UPDATE` directo por `id` del registro, e `INSERT` explícito cuando no existe.

Los módulos que manejan almacenes:
- **Inventario:** ajustes, transferencias, nuevo stock
- **Compras:** selector de almacén destino en recepción
- **Producción:** selector de almacén origen por insumo, almacén destino para PT al cerrar
- **Mermas:** almacén origen (solo mermas de inventario, no de despacho)
- **Cambios mano a mano:** almacén origen + almacén destino para reproceso

---

## 9. Edge Functions desplegadas

### `crear-usuario`
Crea un usuario en Supabase Auth + tabla `usuarios` + asigna módulos de la empresa.
Requiere rol `superadmin`. Incluye headers CORS.

### `resetear-password`  
Resetea la contraseña de un usuario. Solo accesible por superadmin.
Incluye headers CORS.

**Nota importante:** Ambas Edge Functions requieren el header `apikey` además del `Authorization` para funcionar desde el frontend. El CORS está configurado con `Access-Control-Allow-Origin: *`.

---

## 10. Perfiles de negocio (Opción 2 — pendiente de implementar)

El sistema está diseñado para soportar múltiples perfiles de negocio mediante un campo `perfil_negocio` en la tabla `empresas`. El primer perfil adicional identificado es **autopartes**, que requiere:

```sql
-- Campo en empresas
perfil_negocio text DEFAULT 'manufactura'

-- Tabla satélite (schema real verificado)
productos_autopartes (id, empresa_id, producto_id, marca, nro_parte, tipo, barras_2, barras_3)
-- NOTA: tipo viene de SQLite barras_1 (LISO/PERFORADO/etc) al migrar

-- Compatibilidad vehículo (tablas activas)
vehiculos (id, empresa_id, marca, modelo, submodelo, tipo)
producto_vehiculo (id, producto_id, vehiculo_id, año_inicio, año_fin, posicion)

-- Campos adicionales
clientes.vehiculo
```

En el frontend, los componentes renderizan condicionalmente según `perfil_negocio`:
```jsx
// perfil viene de useAuth(); empresas es el join desde usuarios→empresas
const esAutopartes = perfil?.empresas?.perfil_negocio === 'autopartes'
{esAutopartes && <CamposAutopartes />}
```

---

## 11. Flujo de onboarding de un cliente nuevo

1. Entrar a `/superadmin`
2. Crear empresa con nombre y RIF
3. Activar módulos contratados en pestaña "Módulos"
4. Ir a Authentication en Supabase → Add user (email + password)
5. Ejecutar SQL para insertar en `usuarios` y asignar módulos:
```sql
INSERT INTO public.usuarios (id, nombre, email, rol, empresa_id, activo)
VALUES ('UUID_AUTH', 'Nombre', 'email@empresa.com', 'admin', 'UUID_EMPRESA', true);

INSERT INTO public.usuario_modulos (usuario_id, empresa_id, modulo_id, activo)
SELECT 'UUID_AUTH', 'UUID_EMPRESA', modulo_id, true
FROM public.empresa_modulos WHERE empresa_id = 'UUID_EMPRESA'
ON CONFLICT DO NOTHING;
```
6. Comunicar credenciales al cliente

---

## 12. Recuperación de contraseña

**Auto-servicio:** El usuario hace clic en "¿Olvidaste tu contraseña?" en el login → Supabase envía email → usuario llega a `/reset-password` → ingresa nueva contraseña.

**Por superadmin:** En SuperAdmin → empresa → tab Usuarios → seleccionar usuario → botón 🔑 Resetear clave → ingresa nueva contraseña → llama Edge Function `resetear-password`.

**Cambio de contraseña (usuario autenticado):** Sidebar → "Cambiar contraseña" → modal con nueva contraseña y confirmación → llama `supabase.auth.updateUser()` directamente.

---

## 13. Seguridad

- RLS habilitado en todas las tablas
- Función `is_superadmin()` con `SECURITY DEFINER` para evitar recursión en políticas
- Anon key expuesta en frontend (normal en React) — RLS es la barrera de seguridad real
- No hay SQL injection (queries parametrizadas vía Supabase client)
- No hay XSS (React escapa HTML automáticamente)
- HTTPS via Cloudflare (automático)
- Rate limiting de Supabase Auth habilitado

---

## 14. Pendientes / Decisiones futuras

### Completados (sesiones 2026-04-25 / 2026-04-27)

| Item | Notas |
|---|---|
| Módulo de gastos — mejoras | Filtro Desde/Hasta, gastos programados (estado+fecha_vencimiento+semáforo), modal de pago, KPIs pagados/pendientes/vencidos |
| Paginación en todos los módulos | Ventas, CxC, CxP, Compras, Inventario (VistaMovimientos), Gastos, Mermas, CambiosManoMano — PAGE_SIZE=50, KPIs separados del paginado |
| Índices en Supabase | Creados sobre empresa_id, fecha, estado, cliente_id, vendedor_id en las tablas de mayor volumen |
| Historial de visitas en FichaCliente (paginado) | VISITAS_PAGE=10, cargarVisitas(pag), paginación con ← → en tab Visitas |
| Realtime en Pedidos.jsx | Suscripción INSERT filtrada por empresa_id; toast "Nuevo pedido recibido" + recarga automática; usa reloadKey para evitar stale closure |
| Módulo Finanzas | Vista consolidada de CxC + CxP + Cobros del día para rol finanzas |
| Actualizar precio/costo al confirmar venta u OC | Modal post-confirmación si hay precios modificados; Ventas actualiza `productos_terminados.precio_venta`; Compras OC actualiza `costo_compra_promedio` (MP/ME/consumibles) o `costo_promedio` (PT); también corregido bug de `cambiarPrecio` que no estaba definida en NuevaVenta |
| Error amigable por código duplicado | Productos/MP/ME/Consumibles: captura error Postgres `23505` y muestra `"El SKU/código X ya existe. Por favor elige otro código."` |
| NuevaVenta — días de crédito editables | Campo `diasCredito` pre-cargado desde catálogo del cliente, editable para casos excepcionales; muestra fecha de vencimiento en tiempo real; `confirmarVenta` usa este valor (no el del catálogo) para `fecha_vencimiento_pago` |
| NuevaVenta — pago contado USD/Bs complementario | USD + (Bs/tasa) = Total; escribir en USD calcula el resto en Bs y viceversa; cambiar tasa recomputa Bs desde USD actual |

### Completados (sesión 2026-05-06)

| Item | Notas |
|---|---|
| migrate_pos.py — campo `tipo` en autopartes | SQLite `barras_1` (LISO/PERFORADO) mapea a `productos_autopartes.tipo` en el INSERT |
| Productos.jsx — editar compatibilidad de vehículo | Botón lápiz por fila carga datos en el form; estado `editandoCompatIdx` (índice); resaltado azul de la fila en edición; botón cambia a "Actualizar" (naranja); link "Cancelar edición" |
| Cotizador — filtros separados por parte | Tab "Por parte": 3 campos separados (N° parte texto, Marca select, Tipo select) en grilla 3 columnas. Tipo también disponible en tab "Por vehículo" |
| Cotizador — Tipo en resultados | Resultados muestran `SKU · N° Parte · Marca · Tipo` |
| Ventas/NuevaVenta — búsqueda avanzada autopartes | Panel expandible con N° parte, Marca, Tipo, Categoría + sección "Vehículo compatible" (Marca→Modelo en cascada, Año). Botón "+" siempre habilitado (sin restricción de stock). El modal de actualizar precio también aplica a ítems del panel avanzado |
| Ventas/NuevaVenta — combobox de cliente | Reemplaza `<select>` por combobox searchable por RIF o nombre (máx 20 resultados); chip verde con × al seleccionar |
| `obtener_siguiente_ventas_numero` — fix migración | Agregado filtro `AND numero_factura LIKE 'NE-%'` para ignorar facturas migradas con formato `1-XXX` |
| Inventario VistaStock — paginación 25/50/100 | `.limit(5000)` en queries; `paginados = filtrados.slice(...)`; KPIs sobre `filtrados` completo; barra con selector + contador X–Y de Z + ← Pág N/Total → |
| Inventario VistaPorAlmacen — paginación 25/50/100 | `.limit(5000)` en query stock_ubicacion; misma barra de paginación; reset de página al cambiar filtro/almacén |
| Inventario VistaMovimientos — paginación configurable | Reemplaza `MOV_PAGE_SIZE=100` hardcodeado por estado `pageSize` (default 50); selector 25/50/100; misma barra consistente |
| Inventario — valorización respeta `aplica_iva` | Las 4 tablas (PT, MP, ME, consumibles) tienen campo `aplica_iva boolean`. Cálculo: `p.aplica_iva ? costo / 1.16 : costo`. Antes siempre dividía por 1.16 |

### Completados (sesión 2026-05-10/11)

| Item | Notas |
|---|---|
| UOM secundaria en FlujoPedido (NuevoPedido) | Query productos incluye `unidad_venta_2, factor_conversion_2`; `agregarProducto` agrega `unidadVenta:'1'`, `precioBase`; `cambiarUnidad(id)` alterna entre UM1 y UM2 ajustando precio; toggle pills apilados verticalmente junto al input de cantidad; guardar() inserta `unidad_venta` y `cantidad_primaria` en pedido_items (online y offline) |
| Categorías dinámicas en Productos/MP/Consumibles | Eliminado array `CATEGORIAS` hardcodeado; `categorias` se deriva de los items ya cargados (`[...new Set(...)]`); form usa `<input list="cats-xxx">` + `<datalist>` para sugerencias con texto libre; filtro usa `<select>` dinámico que solo aparece si hay categorías |
| Bug Consumibles.jsx — datos no cargaban | `setConsumibles(data)` → `setItems(data)` (función inexistente → datos nunca se mostraban) |
| NuevaVenta — ancho completo | Eliminado `maxWidth: '900px'`; columna nombre en tabla usa `ellipsis` en lugar de wrap |
| Flujo Pedido → Alistamiento → Facturación | NuevaVenta ya no factura directamente: registra un `pedido` sin rebajar stock. Nuevo módulo `Despacho.jsx`: almacén confirma cantidades por ítem (`cantidad_alistada`), pedido pasa a `estado='alistado'`. Ventas tab "Pedidos por registrar" muestra `estado='alistado'`; `FacturarPedido` usa `cantidad_alistada` y filtra ítems con cant=0. Stock se rebaja solo al facturar |
| `aprobacion_pedido` configurable por empresa | Toggle en Administración → Tasas de Cambio (bottom de página). ON = NuevaVenta crea pedido `pendiente` (requiere aprobación en Pedidos). OFF = crea directo `aprobado` (va a Despacho sin revisión). **NuevoPedido (campo) siempre crea `pendiente`**, independiente del toggle |
| Pedidos.jsx — tab Alistados | Nuevo tab `alistados` filtra `estado='alistado'`; ESTADOS map incluye badge naranja para `alistado` |
| FacturarPedido — cálculo automático USD↔Bs | `handleUsdChange` computa Bs complementario; `handleBsChange` computa USD complementario; `useEffect([tipoTasa])` recalcula Bs al cambiar tasa |
| AuthContext — empresas join + módulo despacho | `.select` de empresas incluye `aprobacion_pedido`; `TODOS_LOS_MODULOS` incluye `'despacho'` |
| Layout + main.jsx — ruta Despacho | Nav item `PackageCheck · Despacho → /despacho`; ruta `ModuloProtegido modulo="despacho"` |

### Completados (sesión 2026-05-17)

| Item | Notas |
|---|---|
| Recetas — soporte para MP Producidas | Nueva FK `recetas.mp_id uuid → materias_primas`. Listado con tabs "Productos terminados" / "MP Producidas" (con contadores). Modal: toggle PT/MP (solo cambiable en recetas nuevas); al seleccionar MP filtra por `tipo_producto='producido'`. Require SQL: `ALTER TABLE recetas ADD COLUMN IF NOT EXISTS mp_id uuid REFERENCES materias_primas(id)` |
| Produccion.jsx — fix lookup de receta para MP | `cargarReceta()` y `crearOrden()` usaban `.eq('producto_id', id)` para ambos tipos de salida. Ahora usan `.eq('mp_id', mpSalidaId)` cuando `tipoSalida='materia_prima'`. También cambiado `.single()` → `.maybeSingle()` |
| IVA condicional en todos los módulos | Auditoría completa: Ventas.jsx ya era correcto. Corregidos: **NuevoPedido.jsx** (query producto_precios incluye `aplica_iva`; totales y `precio_unitario` en pedido_items condicionales), **Pedidos.jsx** (TotalPedido y DetallePedido cargan `aplica_iva` via join; IVA por item), **Compras.jsx** (NuevaOrden: queries + agregarInsumo + totales + `precio_unitario_esperado`; NuevaRecepcion: queries + cargarItemsDeOC + agregarInsumoLibre + totales; DetalleOrden usa `orden.subtotal` guardado). Convención: precios en formularios de compra/pedido son CON IVA para items que aplican; el sistema extrae subtotal e IVA |

### Backlog estratégico (capacidades de plataforma SaaS)

Estos ítems no son mejoras funcionales al producto sino capacidades de la plataforma que se necesitan para escalar comercialmente.

| Item | Prioridad | Descripción |
|---|---|---|
| Panel de métricas del operador | Media | En SuperAdmin: pedidos por empresa/mes, módulos más usados, usuarios activos, última actividad. Necesario para soporte, detección de churn y decisiones de producto. Sin esto el operador va ciego. |
| Autoregistro (self-service onboarding) | Media | Un cliente prospecto va a una URL, ingresa nombre/RIF/email y queda activo con plan trial. Hoy el operador es el cuello de botella del onboarding. Bloqueante para escalar sin esfuerzo. |
| Billing integrado | Baja | Cobro recurrente automático, corte de acceso por falta de pago, portal de cliente para ver su suscripción. Para los primeros 10–20 clientes es manejable manualmente; necesario para escalar. Opciones: Stripe + webhooks, o MercadoPago para mercado latinoamericano. |

---

## 15. Convenciones de código

- `useAuth()` en cada componente que necesite `perfil`
- `perfil?.empresa_id` — siempre validar antes de usar
- Todas las queries: `.eq('empresa_id', perfil.empresa_id)`
- Todos los INSERTs: `empresa_id: perfil.empresa_id`
- Columna de movimientos es `notas` (con s), no `nota`
- Mapeo de tipos de insumo: `materias_primas→materia_prima`, `materiales_empaque→material_empaque`, `consumibles→consumible`, `productos_terminados→producto_terminado`
- Campo `aplica_iva boolean` existe en las 4 tablas de productos (PT, MP, ME, consumibles). **Nunca aplicar ni extraer IVA sin verificar este campo.** Patrón correcto en TODOS los módulos:
  - Extraer base de precio con IVA: `aplica_iva ? precio / 1.16 : precio`
  - Calcular IVA sobre base: `aplica_iva ? base * 0.16 : 0`
  - Total: suma de precios (con IVA embebido para items que aplican, sin IVA para los demás)
  - Los queries que calculan subtotal/IVA/total DEBEN incluir `aplica_iva` en el SELECT
  - Ventas.jsx es la referencia correcta; NuevoPedido, Pedidos, Compras fueron corregidos en sesión 2026-05-17
- Estilos: inline styles con objetos JS (no clases Tailwind, excepto en Login/ResetPassword)
- Formato de moneda USD: `fmt(n)` → `$X.XX`
- Formato de moneda Bs: `fmtBs(n)` → `X.XX Bs.`
- **localStorage cache keys** (prefijo `mipos_`):
  - `mipos_clientes_${empresa_id}` — lista de clientes
  - `mipos_listas_${empresa_id}` — listas de precio
  - `mipos_productos_${empresa_id}_${listaId}` — productos con precio
  - `mipos_offline_queue` — pedidos pendientes de sincronizar (array JSON)
  - Cada entry de caché incluye `{ data, ts }` donde `ts` es `Date.now()`; TTL = 1 hora (`CACHE_TTL = 3600000`)

---

## 16. NuevoPedido — App móvil fuerza de ventas

**Archivo:** `src/pages/NuevoPedido.jsx` (~1750 líneas, auto-contenido, sin imports de otros componentes del proyecto)

### Sub-componentes (todos en el mismo archivo)
```
NuevoPedido          # Componente raíz — maneja vista activa, offline queue, toasts, Realtime
  ├── HomeVendedor   # Dashboard del vendedor: stats del día (pedidos, monto, clientes, visitas)
  ├── ListaClientes  # Búsqueda + lista de clientes con badge de deuda (punto rojo)
  ├── FichaCliente   # 4 tabs: Resumen | Pedidos | Historial | Visitas
  └── FlujoPedido    # Wizard 3 pasos: cliente → dirección → productos → confirmación
```

### Flujo de navegación
```
HomeVendedor
  → [botón Clientes] → ListaClientes
      → [seleccionar cliente] → FichaCliente
          → [Tomar pedido] → FlujoPedido
              → [éxito] → HomeVendedor (refreshKey++)
```

### Features implementadas (sesión 2026-04-25)

| # | Feature | Descripción |
|---|---|---|
| 1 | Caché offline (stale-while-revalidate) | Clientes, listas y productos se sirven desde `localStorage` y se revalidan en background |
| 2 | Cola offline | Pedidos tomados sin conexión se guardan en `mipos_offline_queue`; se sincronizan al reconectar |
| 3 | Banner offline | `useOnline()` hook — banner rojo con icono `WifiOff` + contador de pedidos en cola |
| 4 | Realtime (pedidos propios) | Suscripción `postgres_changes` filtrada por `vendedor_id=eq.{userId}`; toast de confirmación al cambiar estado |
| 5 | Toast de confirmación | Overlay de toasts flotantes (top-right) para pedido creado, sincronizado y cambios de estado Realtime |
| 6 | Límite de crédito | Barra de utilización en FichaCliente → Resumen; banner de advertencia en paso 3 de FlujoPedido |
| 7 | CxC vencida | Banner rojo en paso 3 si el cliente tiene facturas vencidas sin pagar |
| 8 | Semáforo de stock | En paso 3 (grilla productos): verde ≥ 10, amarillo 1–9, rojo 0 |
| 9 | Visitas comerciales | Tab "Visitas" en FichaCliente — registrar tipo y resultado; contador en HomeVendedor |

### Patrones técnicos clave

**Cache helpers (top del archivo):**
```js
const CACHE_TTL = 3600000
const cacheSet = (key, data) => localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
const cacheGet = (key) => { ... }  // retorna null si expirado
```

**Offline queue helpers:**
```js
const getPendingQueue = () => JSON.parse(localStorage.getItem('mipos_offline_queue') || '[]')
const savePendingQueue = (q) => localStorage.setItem('mipos_offline_queue', JSON.stringify(q))
```

**Hook `useOnline()`:**
```js
// Escucha window 'online'/'offline'; retorna boolean
```

**Realtime subscription** (en `NuevoPedido` principal):
```js
// Se crea tras resolver supabase.auth.getUser()
// Canal: 'pedidos-vendedor', filtro: `vendedor_id=eq.${user.id}`
// Eventos: UPDATE → toast con TOAST_ESTADOS[nuevo_estado]
// Cleanup en return del useEffect
```

**`itemsPreloaded = useRef(false)`** en `FlujoPedido`:
Evita doble pre-carga de ítems de la última compra cuando el stale-while-revalidate llama `aplicarProductos()` dos veces (cache + red).

**`cargarDatosCliente(clienteId)`** en `FlujoPedido`:
Función helper que extrae el fetch de `direcciones_entrega` + CxC vencido + última compra. Se llama tanto en el `useEffect([clienteInicial])` como en `seleccionarCliente()`.

**Listas — evitar sobreescritura de `listaId`:**
En el background fetch de listas, `setListaId` solo se llama cuando `!listaId` para no pisar el valor ya seteado desde caché.

### Supabase — cambios aplicados en sesión 2026-05-17
```sql
-- Recetas para MP producidas
ALTER TABLE recetas ADD COLUMN IF NOT EXISTS mp_id uuid REFERENCES materias_primas(id);
-- Exactamente uno de producto_id / mp_id tiene valor por receta.
-- Recetas existentes conservan producto_id; las nuevas de MP usan mp_id.
```

### Supabase — cambios aplicados en sesión 2026-05-10/11
```sql
-- Flujo Pedido → Alistamiento → Facturación
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origen text DEFAULT 'oficina';
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS cantidad_alistada numeric;

ALTER TABLE pedidos DROP CONSTRAINT IF EXISTS pedidos_estado_check;
ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
  CHECK (estado IN ('pendiente','aprobado','alistado','rechazado','facturado'));

-- Configuración de aprobación por empresa
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS aprobacion_pedido boolean DEFAULT true;
CREATE POLICY "admin puede actualizar su empresa"
  ON empresas FOR UPDATE
  USING (id = get_empresa_id())
  WITH CHECK (id = get_empresa_id());
```

### Supabase — cambios requeridos para sección NuevoPedido (anteriores)
```sql
-- 1. Límite de crédito en clientes
ALTER TABLE clientes ADD COLUMN limite_credito numeric(12,2) DEFAULT 0;

-- 2. Tabla visitas comerciales
CREATE TABLE visitas_comerciales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES empresas(id),
  vendedor_id uuid REFERENCES usuarios(id),
  cliente_id uuid REFERENCES clientes(id),
  tipo_visita text CHECK (tipo_visita IN ('presencial','llamada','whatsapp','videollamada')),
  resultado text CHECK (resultado IN ('pedido_tomado','sin_pedido','reagendar','no_contesto')),
  notas text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE visitas_comerciales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "empresa propia" ON visitas_comerciales
  USING (empresa_id = get_empresa_id());
CREATE POLICY "insert propio" ON visitas_comerciales FOR INSERT
  WITH CHECK (empresa_id = get_empresa_id() AND vendedor_id = auth.uid());

-- 3. Habilitar Realtime en pedidos
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
```

---

## 17. Módulo de Gastos — diseño de gastos programados

Los gastos son erogaciones operativas (nómina, impuestos, servicios, etc.) distintas a compras de inventario.

### Mejoras pendientes de implementar

**Filtro por rango de fechas:** Reemplazar el filtro actual por selectores `fecha_inicio` / `fecha_fin` (igual que otros módulos).

**Gastos programados:** Un gasto puede registrarse como pagado (flujo actual) o programado para una fecha futura. Los gastos programados:
- Se registran igual que un gasto normal pero con `estado = 'pendiente'` y `fecha_vencimiento`
- Viven en el módulo Gastos (no en CXP — CXP es exclusivo de proveedores de inventario)
- Tienen semáforo de vencimiento igual al de CXC: verde > 3d, amarillo ≤ 3d, rojo vencido
- Al pagar un gasto programado se marca `estado = 'pagado'` y se registra el método de pago

### Cambios de BD — YA APLICADOS en Supabase
```
gastos.estado text              DEFAULT 'pagado' CHECK IN ('pagado','pendiente')
gastos.fecha_vencimiento date
gastos.metodo_pago text
gastos.cuenta_bancaria_id uuid  → cuentas_bancarias
```

### Estados y flujo
```
Nuevo gasto
  ├── Pagado hoy     → estado='pagado', fecha=hoy, monto registrado
  └── Programado     → estado='pendiente', fecha_vencimiento ingresada por usuario
        └── [al pagar] → estado='pagado', actualizar monto y método
```

---

## 18. Check constraints importantes (descubiertos en migración)

```
pedidos.estado               CHECK IN ('pendiente','aprobado','alistado','rechazado','facturado')
                             — 'alistado' fue agregado en sesión 2026-05-10 (ALTER TABLE DROP+ADD CONSTRAINT)

ventas.estado_cobro          CHECK IN ('pendiente','parcial','pagado')
                             — NO usar 'cobrado'; el equivalente correcto es 'pagado'

compra_items.tipo_insumo     CHECK IN ('materia_prima','empaque','material_empaque',
                                       'consumible','producto_terminado')
                             — 'producto_terminado' fue agregado manualmente (ALTER TABLE)
                               para soportar empresas que compran PT para revender

modulos.id                   Es string (ej: 'bancos', 'dashboard'), NO uuid
                             — Layout.jsx hace modulosActivos.includes('bancos')
                             — Si se inserta un módulo nuevo debe usarse el string key,
                               no un uuid generado
```

---

## 19. Herramienta de migración SQLite → Supabase

**Archivo:** `migrate_pos.py` (raíz del proyecto, en `.gitignore` los SQL generados)

### Uso
```bash
python migrate_pos.py <empresa_id> <usuario_id>           # args directos
python migrate_pos.py <empresa_id> <usuario_id> <db_path> # BD en ruta custom
python migrate_pos.py                                      # modo interactivo
```

### Qué migra (de `pos_repuestos.db`)
| SQLite | Supabase |
|---|---|
| tiendas | almacenes |
| proveedores | proveedores |
| clientes | clientes |
| productos | productos_terminados + productos_autopartes |
| inventarios | stock_ubicacion + stock_actual |
| tipos_gastos | tipos_gastos |
| configuracion | configuracion (tasa_cambio→tasa_bcv) |
| gastos | gastos |
| ventas + detalles_ventas | ventas + venta_items |
| compras (detalle_json) | compras + compra_items |

### Output
Genera 9 archivos `migration_NN_nombre.sql`, cada uno con `BEGIN/COMMIT` propio e INSERTs idempotentes (`ON CONFLICT (id) DO NOTHING`). Córrelos en orden en el SQL Editor de Supabase.

### Diseño clave
- **UUIDs determinísticos** via `uuid.uuid5(NS, key)` — re-correr el script produce los mismos IDs, evita FK inconsistentes si se interrumpe la migración
- **Archivos separados** porque Supabase limita el tamaño de query en el SQL Editor
- Los archivos `.sql` y `.db` están en `.gitignore` (contienen datos de clientes)

### Lo que NO migra (requiere trabajo manual o script adicional)
- Compatibilidades vehículo↔producto (`producto_vehiculo`) — si el SQLite tiene una tabla de compatibilidades, hay que agregar una sección al script
- Cobros parciales / historial de pagos

### Cotizador — búsqueda por vehículo
La búsqueda "Por vehículo" en `Cotizador.jsx` requiere datos en `producto_vehiculo`. Si la tabla está vacía, siempre retorna 0 resultados. Para que funcione hay que:
1. Cargar el catálogo de vehículos (Administración → Vehículos)
2. Asignar compatibilidades a cada producto (Administración → Productos → editar → sección Compatibilidades)
