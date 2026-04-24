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
│   ├── NuevoPedido.jsx          # App móvil para fuerza de ventas en campo
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
pedidos               -- Pedidos de venta
pedido_items          -- Detalle de pedidos
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
receta_items          -- Ingredientes de recetas
ordenes_produccion    -- Órdenes de producción
lote_consumos         -- Insumos consumidos por lote (con almacen_id)
lotes_produccion      -- Lotes de PT producidos
```

### Otros
```
clientes              -- Con cat1_id a cat4_id para clasificación
categorias_clientes   -- 4 niveles de categorías por empresa
proveedores
mermas                -- Con almacen_id para mermas de inventario
cambios_mano_mano     -- Con almacen_id origen
stock_reproceso       -- Stock pendiente de reproceso
gastos                -- Con monto_usd, monto_bs, tipo_tasa
tipos_gastos          -- Tipos de gasto personalizables por empresa
configuracion         -- Tasas: tasa_bcv, tasa_euro, tasa_binance
listas_precio
producto_precios
direcciones_entrega   -- Direcciones de entrega por cliente
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

-- Tabla satélite
productos_autopartes (producto_id, marca, nro_parte, vehiculo, año_desde, año_hasta, barras_2, barras_3)

-- Campos adicionales
clientes.vehiculo
ventas.vehiculo_cliente
```

En el frontend, los componentes renderizan condicionalmente según `perfil_negocio`:
```jsx
const { empresa } = useEmpresa()
{empresa.perfil_negocio === 'autopartes' && <CamposAutopartes />}
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

**Nota:** La creación de usuarios desde el frontend (SuperAdmin) aún tiene problemas de autenticación con la Edge Function (401). Se está investigando.

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

| Item | Prioridad | Notas |
|---|---|---|
| Creación de usuarios desde SuperAdmin (Edge Function 401) | Alta | El `apikey` header es requerido pero el problema persiste |
| Route guards por rol en frontend | Media | Actualmente solo el sidebar filtra, las rutas son accesibles directamente |
| Desactivar empresa → logout usuarios | Media | Solo cambia `activo` en BD, no bloquea sesiones activas |
| Perfil `autopartes` | Media | SQL y JSX condicional pendiente |
| Módulo de gastos en sistema autopartes | Baja | Ya existe el módulo, solo falta el perfil |
| Paginación en tablas con volumen alto | Baja | Ventas, CxC, CxP |
| Índices en Supabase | Baja | Para columnas frecuentemente filtradas |
| Módulo de reportes | Baja | No iniciado |

---

## 15. Convenciones de código

- `useAuth()` en cada componente que necesite `perfil`
- `perfil?.empresa_id` — siempre validar antes de usar
- Todas las queries: `.eq('empresa_id', perfil.empresa_id)`
- Todos los INSERTs: `empresa_id: perfil.empresa_id`
- Columna de movimientos es `notas` (con s), no `nota`
- Mapeo de tipos de insumo: `materias_primas→materia_prima`, `materiales_empaque→material_empaque`, `consumibles→consumible`, `productos_terminados→producto_terminado`
- Estilos: inline styles con objetos JS (no clases Tailwind, excepto en Login/ResetPassword)
- Formato de moneda USD: `fmt(n)` → `$X.XX`
- Formato de moneda Bs: `fmtBs(n)` → `X.XX Bs.`
