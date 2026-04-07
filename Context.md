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
│   │   ├── Inventario.jsx      # Stock unificado + Movimientos
│   │   ├── Ventas.jsx          # POS + historial de facturas + devoluciones
│   │   ├── Compras.jsx         # Órdenes de Compra + Recepciones
│   │   ├── Administracion.jsx  # Módulo unificado: Productos, MP, Empaque, Clientes, Tasas
│   │   ├── CuentasCobrar.jsx   # Seguimiento de créditos + cobros parciales
│   │   ├── Productos.jsx       # Maestro de productos terminados
│   │   ├── MateriasPrimas.jsx  # Maestro de MP y Materiales de Empaque
│   │   ├── Clientes.jsx        # Maestro de clientes
│   │   └── Configuracion.jsx   # Tasas de cambio
│   ├── index.css
│   └── main.jsx                # Router + AuthProvider + rutas protegidas
├── docs/
│   ├── seed-materias-primas.sql
│   ├── seed-proveedores.sql
│   ├── migracion-ordenes-compra.sql
│   ├── migracion-movimientos-inventario.sql
│   └── fix-rls-compras.sql
├── .env
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
| `usuarios` | Perfil del usuario autenticado |
| `productos_terminados` | Maestro de productos con stock, precios, categorías |
| `materias_primas` | Insumos para producción |
| `materiales_empaque` | Materiales de empaque |
| `clientes` | Maestro de clientes con condición de pago |
| `proveedores` | Maestro de proveedores |
| `ubicaciones` | Localidades/almacenes |
| `ventas` | Cabecera de facturas de venta |
| `venta_items` | Detalle de líneas por factura |
| `cobros` | Abonos/pagos parciales sobre facturas a crédito |
| `compras` | Recepciones de inventario |
| `compra_items` | Detalle de recepciones |
| `ordenes_compra` | Órdenes de compra |
| `orden_compra_items` | Detalle de OC |
| `movimientos_inventario` | Historial de entradas/salidas/ajustes |
| `lotes_produccion` | Órdenes de producción / lotes |
| `lote_consumos` | Insumos consumidos por lote |
| `recetas` | Fórmulas de producción |
| `receta_items` | Ingredientes por receta |
| `listas_precio` | Definición de listas de precio |
| `producto_precios` | Precio por producto × lista |
| `inventario_ubicacion` | Stock por ubicación |
| `producto_ubicacion` | Config por producto × ubicación |
| `configuracion` | Parámetros del sistema (tasas) |
| `devoluciones` | Cabecera de devoluciones |
| `devolucion_items` | Detalle de productos devueltos |

---

## Módulos — Estado actual

### ✅ Completados y funcionales

#### Autenticación
- Login con email/password via Supabase Auth
- `AuthContext` con `user`, `perfil`, `login()`, `logout()`
- Rutas protegidas

#### Inventario (`/inventario`)
- **Tabs:** Stock Actual y Movimientos
- Filtro unificado por tipo (PT, MP, Empaque, Todos)
- KPIs de stock crítico y total unidades
- Historial de movimientos con filtros por fecha, tipo y búsqueda

#### Ventas (`/ventas`)
- POS con carrito, búsqueda y cálculo de IVA
- Modal de pago multimoneda (USD/Bs., tasas BCV/Euro/Binance)
- Facturas a crédito con cálculo de vencimiento
- Devoluciones parciales/totales con reposición de stock

#### Compras (`/compras`)
- **Tabs:** Órdenes de Compra y Recepciones
- Creación de OC con carrito de insumos
- Recepción libre o vinculada a OC
- Control de cantidades recibidas vs solicitadas
- Modal de pago multimoneda y crédito

#### Administración y Configuración (`/administracion`)
- **Tabs:** Productos, Materias Primas, Materiales de Empaque, Clientes, Tasas de Cambio
- CRUD completo para cada maestro
- Filtros, búsqueda, toggle activo/inactivo
- Alertas de stock bajo y vencimientos
- Gestión de tasas de cambio en tiempo real

#### Cuentas por Cobrar (`/cuentas-cobrar`)
- Lista de facturas con semáforo de vencimiento
- KPIs de pendiente, vencidas y al día
- Modal de cobro con pago parcial/total multimoneda

### 🔲 Pendiente de desarrollo

| Módulo | Prioridad | Notas |
|---|---|---|
| **Dashboard** | Alta | KPIs: ventas del día, stock crítico, CxC, últimas transacciones |
| **Producción** | Alta | Órdenes, consumo de MP, generación de lotes y PT |
| **Reportes** | Media | Ventas por período, rotación, CxC aging |
| **Listas de precio** | Media | Asignación por cliente, uso en POS |
| **Deploy a Vercel** | Alta | Demo pública |
| **Triggers de inventario** | Alta | Automatización de stock en ventas/compras/producción |
| **Múltiples ubicaciones** | Baja | `inventario_ubicacion` como fuente de verdad |
| **Roles y RLS** | Baja | Policies por rol |
| **Ajustes de inventario** | Media | Entradas/salidas manuales con motivo |

---

## Convenciones del proyecto

### Código
- Todo en español
- Estilos inline (`style={{ }}`) preferidos sobre Tailwind
- Sin `<form>` HTML — usar `onClick` / `onChange`
- Paleta: verde `#16a34a`, azul `#1d4ed8`, rojo `#ef4444`, grays Tailwind

### Supabase
- RLS habilitado en todas las tablas
- Policy base: `FOR ALL USING (auth.role() = 'authenticated')`
- Queries directas desde frontend
- `stock_actual` es cache (se actualiza manualmente en frontend)

### Multimoneda
- Precios internos en **USD**
- Conversión a **Bs.** solo para presentación/factura
- 3 tasas: `tasa_bcv`, `tasa_euro`, `tasa_binance` en tabla `configuracion`

### Navegación (rutas)
| Ruta | Componente |
|---|---|
| `/login` | Login.jsx |
| `/` | Dashboard.jsx |
| `/inventario` | Inventario.jsx |
| `/ventas` | Ventas.jsx |
| `/compras` | Compras.jsx |
| `/administracion` | Administracion.jsx |
| `/cuentas-cobrar` | CuentasCobrar.jsx |

---

## Contexto del cliente

- Empresa venezolana productora de derivados de coco
- Opera con precios en USD, factura en Bs. a tasa del día
- Maneja clientes contado y a crédito (30/60 días)
- Planta de producción + puntos de venta
- Necesita sistema integral: compras → producción → inventario → ventas → cobros
