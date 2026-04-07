# Proyecto: Coco POS — Sistema de Gestión Integral

## Descripción general
Sistema ERP/POS para empresa de productos derivados del coco. Maneja ventas, facturación multimoneda (USD/Bs.), inventario, producción, compras y cuentas por cobrar. Construido para demo con cliente en plazo corto, con arquitectura escalable hacia sistema completo.

---

## Stack

- **Frontend:** React 18 + Vite
- **Base de datos:** Supabase (PostgreSQL) — auth, RLS, queries directas desde frontend
- **Autenticación:** Supabase Auth (email + password)
- **Estilos:** Inline styles (CSS-in-JS manual) + Tailwind CSS v3 (parcial)
- **Iconos:** lucide-react
- **Router:** react-router-dom v6
- **Deploy:** Pendiente (recomendado: Vercel para frontend)
- **Backend:** No hay backend intermedio — todo va directo a Supabase desde React

---

## Estructura del proyecto

```
coco-pos/
├── public/
├── src/
│   ├── components/
│   │   └── Layout.jsx          # Sidebar + outlet principal
│   ├── contexts/
│   │   └── AuthContext.jsx     # Proveedor de auth con Supabase
│   ├── lib/
│   │   └── supabaseClient.js   # Cliente Supabase inicializado
│   ├── pages/
│   │   ├── Login.jsx           # Pantalla de login
│   │   ├── Dashboard.jsx       # KPIs (pendiente desarrollo)
│   │   ├── Inventario.jsx      # Stock de productos terminados
│   │   ├── Ventas.jsx          # POS + historial de facturas
│   │   ├── Productos.jsx       # Maestro de productos terminados
│   │   ├── Clientes.jsx        # Maestro de clientes + condiciones de pago
│   │   ├── CuentasCobrar.jsx   # Seguimiento de créditos + cobros parciales
│   │   └── Configuracion.jsx   # Tasas de cambio BCV / Euro / Binance
│   ├── index.css
│   └── main.jsx                # Router + AuthProvider + rutas protegidas
├── .env                        # Variables de entorno (no commitear)
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
└── package.json
```

---

## Variables de entorno (.env)

```
VITE_SUPABASE_URL=https://TU_PROJECT_ID.supabase.co
VITE_SUPABASE_ANON_KEY=TU_ANON_KEY
```

---

## Base de datos — Tablas en Supabase

### Tablas principales (ya creadas y operativas)

| Tabla | Descripción |
|---|---|
| `usuarios` | Perfil del usuario autenticado (id = UUID de Supabase Auth) |
| `productos_terminados` | Maestro de productos con stock, precios, categorías, vida útil |
| `materias_primas` | Insumos para producción |
| `materiales_empaque` | Materiales de empaque |
| `clientes` | Maestro de clientes con condición de pago y días de crédito |
| `proveedores` | Maestro de proveedores |
| `ubicaciones` | Localidades/almacenes donde hay inventario |
| `ventas` | Cabecera de facturas de venta |
| `venta_items` | Detalle de líneas por factura |
| `cobros` | Abonos/pagos parciales sobre facturas a crédito |
| `compras` | Órdenes de compra |
| `compra_items` | Detalle de compras |
| `lotes_produccion` | Órdenes de producción / lotes |
| `lote_consumos` | Insumos consumidos por lote |
| `recetas` | Fórmulas de producción |
| `receta_items` | Ingredientes por receta |
| `listas_precio` | Definición de hasta 4 listas de precio (Público, Mayorista, etc.) |
| `producto_precios` | Precio por producto × lista de precio |
| `inventario_ubicacion` | Stock por producto × ubicación (fuente de verdad) |
| `producto_ubicacion` | Config de proveedor/costo preferido por producto × ubicación |
| `configuracion` | Parámetros del sistema (tasas de cambio) |

### Campos destacados por tabla

**`productos_terminados`**
```sql
id, nombre, sku, descripcion, unidad_medida,
precio_venta, costo_promedio,
stock_actual,    -- cache, fuente de verdad es inventario_ubicacion
stock_minimo,
categoria_1, categoria_2, categoria_3, categoria_4,
tipo_producto,   -- 'producido' | 'comprado'
vida_util_dias,
activo,
created_at
```

**`clientes`**
```sql
id, nombre, rif, telefono, email,
condicion_pago,  -- 'contado' | 'credito'
dias_credito,    -- número de días (ej: 30)
activo
```

**`ventas`**
```sql
id, numero_factura, cliente_id, usuario_id,
subtotal, total,
estado_cobro,           -- 'pendiente' | 'parcial' | 'pagado' | 'anulado'
tasa_cambio,            -- valor numérico de la tasa usada
tipo_tasa,              -- 'tasa_bcv' | 'tasa_euro' | 'tasa_binance'
pago_usd, pago_bs,      -- montos cobrados por moneda
metodo_usd, metodo_bs,  -- vía de pago por moneda
fecha_vencimiento_pago, -- para facturas a crédito
fecha_venta,
created_at
```

**`cobros`** (abonos sobre facturas a crédito)
```sql
id, venta_id, fecha_cobro,
monto_usd, monto_bs,
tasa_cambio, tipo_tasa,
metodo_usd, metodo_bs,
nota, usuario_id
```

**`configuracion`**
```sql
clave   -- 'tasa_bcv' | 'tasa_euro' | 'tasa_binance'
valor   -- NUMERIC(12,4)
actualizado_at
```

---

## Módulos — Estado actual

### ✅ Completados y funcionales

#### Autenticación
- Login con email/password via Supabase Auth
- `AuthContext` con `user`, `perfil`, `login()`, `logout()`
- Rutas protegidas — redirige a `/login` si no hay sesión
- Perfil del usuario cargado desde tabla `usuarios`

#### Inventario (`/inventario`)
- Lista todos los productos terminados activos
- Filtro por búsqueda (nombre/SKU) y por categoría
- KPIs: total productos, stock crítico, total unidades
- Semáforo visual: verde (OK), amarillo (stock bajo), rojo (sin stock)
- Alerta footer cuando hay productos bajo mínimo

#### Ventas (`/ventas`)
- Lista de facturas con historial (últimas 50)
- **Nueva venta:** búsqueda de productos, carrito con cantidades editables
- **Modal de pago multimoneda:** selección de tasa (BCV/Euro/Binance), pago mixto USD + Bs., cálculo automático de vuelto, métodos de pago por moneda
- **Factura a crédito:** botón alternativo que aparece solo si el cliente tiene `condicion_pago = 'credito'`, calcula `fecha_vencimiento_pago` automáticamente
- Vista de factura con totales en USD y Bs., forma de pago, tasa aplicada
- Descuento automático de stock al confirmar venta
- Estado de cobro: `pagado` (cobro inmediato) o `pendiente` (crédito)

#### Maestro de Productos (`/productos`)
- Lista con filtros por nombre/SKU y por categoría
- Crear y editar productos con todos los campos (SKU, precio, costo, stock, 4 categorías, tipo, vida útil, unidad)
- Toggle activo/inactivo directo desde la tabla
- Alerta de stock bajo en la lista

#### Maestro de Clientes (`/clientes`)
- Lista con búsqueda por nombre/RIF
- Crear y editar clientes
- Campos de condición de pago (`contado` / `crédito`) y días de crédito
- El campo `días_crédito` se deshabilita si la condición es `contado`

#### Cuentas por Cobrar (`/cuentas-cobrar`)
- Lista de facturas filtrable por estado (pendiente / parcial / pagado / todos)
- **Semáforo de vencimiento:** 🔴 vencida, 🟡 vence en ≤3 días, 🟢 dentro del plazo
- KPIs: total pendiente en USD, facturas vencidas, facturas al día
- Columnas: monto cobrado acumulado y saldo pendiente (calculados dinámicamente desde tabla `cobros`)
- **Modal de cobro:** selección de tasa del momento, pago parcial o total en USD/Bs., nota opcional, actualiza `estado_cobro` a `parcial` o `pagado` automáticamente

#### Configuración (`/configuracion`)
- Actualización de las 3 tasas de cambio: USD BCV, EUR BCV, USD Binance
- Muestra el equivalente `$1.00 = X Bs.` en tiempo real al editar
- Guarda en tabla `configuracion` via upsert

### 🔲 Pendiente de desarrollo

| Módulo | Prioridad | Notas |
|---|---|---|
| **Dashboard** | Alta | KPIs: ventas del día, stock crítico, cuentas por cobrar, últimas facturas |
| **Producción** | Alta | Crear lotes, consumir materias primas, generar stock de PT |
| **Compras** | Media | Órdenes de compra, recepción, actualización de stock MP/empaque |
| **Maestro MP y Empaque** | Media | Similar a Productos pero para insumos |
| **Reportes** | Media | Ventas por período, rotación de inventario, CxC aging |
| **Listas de precio** | Media | Asignar lista por cliente, usar en ventas |
| **Deploy a Vercel** | Alta | Para demo con cliente sin compartir pantalla |
| **Triggers de inventario** | Alta | DB triggers: venta → descuenta PT, producción → descuenta MP, suma PT |
| **Múltiples ubicaciones** | Baja | Usar `inventario_ubicacion` como fuente de verdad real |
| **Roles y permisos RLS** | Baja | Policies de escritura por rol (admin/vendedor/etc.) |
| **Ajustes de inventario** | Media | Entrada/salida manual con motivo |

---

## Convenciones del proyecto

### Código
- Todo el código en español (variables, funciones, labels)
- Estilos en inline styles (`style={{ }}`) — se prefiere sobre Tailwind por consistencia y ausencia de problemas de compilación
- Sin formularios HTML `<form>` — usar `onClick` / `onChange` directamente
- Paleta de colores: verde `#16a34a` (primario), azul `#1d4ed8` (crédito/secundario), rojo `#ef4444` (alertas), grays estándar Tailwind

### Supabase
- RLS habilitado en todas las tablas
- Policy base: `FOR ALL USING (auth.uid() IS NOT NULL)` para usuarios autenticados
- Queries directas desde el frontend — sin backend intermedio por ahora
- `stock_actual` en `productos_terminados` es un cache — se actualiza manualmente al confirmar ventas (triggers pendientes)

### Multimoneda
- Precios y totales internos siempre en **USD**
- Conversión a **Bs.** solo para presentación/factura, usando la tasa seleccionada en el momento
- 3 tasas disponibles: `tasa_bcv`, `tasa_euro`, `tasa_binance` — guardadas en tabla `configuracion`
- Formato USD: `$X.XX` — Formato Bs.: `X.XXX,XX Bs.` (locale `es-VE`)

### Facturación
- Número de factura generado en frontend: `FAC-${Date.now().toString().slice(-6)}`
- IVA fijo: 16%
- `estado_cobro`: `pendiente` → `parcial` → `pagado`
- Facturas a crédito: `estado_cobro = 'pendiente'`, tienen `fecha_vencimiento_pago`
- Cobros registrados en tabla `cobros` (permite abonos múltiples)

### Navegación (rutas)
| Ruta | Componente |
|---|---|
| `/login` | Login.jsx |
| `/` | Dashboard.jsx |
| `/inventario` | Inventario.jsx |
| `/ventas` | Ventas.jsx |
| `/productos` | Productos.jsx |
| `/clientes` | Clientes.jsx |
| `/cuentas-cobrar` | CuentasCobrar.jsx |
| `/configuracion` | Configuracion.jsx |

---

## Datos de prueba cargados

- **8 productos terminados:** aguas de coco, harinas, helados, aceite
- **5 clientes:** supermercados, distribuidoras, restaurante
- **3 ubicaciones:** Planta Principal, Almacén Centro, Punto de Venta Este
- **Tasas iniciales:** todas en 1.00 (actualizar antes del demo)
- **1 usuario admin:** creado en Supabase Auth + registro en tabla `usuarios`

---

## Contexto del cliente

- Empresa venezolana productora de derivados de coco
- Opera con precios en USD, factura en Bs. a tasa del día
- Maneja clientes contado y a crédito (30/60 días típicamente)
- Tiene planta de producción + puntos de venta
- Sistema anterior: POS en Python/Streamlit + SQLite (sistema de repuestos, diferente rubro)
- Necesita sistema integral que cubra todo el ciclo: compras → producción → inventario → ventas → cobros
