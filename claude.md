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
clientes              -- Con cat1_id a cat4_id, limite_credito numeric(12,2)
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
visitas_comerciales   -- Visitas de campo registradas desde NuevoPedido
                      --   id, empresa_id, vendedor_id (uuid→usuarios), cliente_id,
                      --   tipo_visita (presencial|llamada|whatsapp|videollamada),
                      --   resultado (pedido_tomado|sin_pedido|reagendar|no_contesto),
                      --   notas text, created_at
                      --   RLS: SELECT/INSERT propios con get_empresa_id() + auth.uid()
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

### Backlog operacional (mejoras al producto existente)

| Item | Prioridad | Notas |
|---|---|---|
| Módulo de gastos — mejoras | Media | Filtro por rango de fechas (inicio/fin); gastos programados con fecha vencimiento (ver sección 17) |

### Completados (sesiones 2026-04-25 / 2026-04-26)

| Item | Notas |
|---|---|
| Paginación en todos los módulos | Ventas, CxC, CxP, Compras, Inventario (VistaMovimientos), Gastos, Mermas, CambiosManoMano — PAGE_SIZE=50, KPIs separados del paginado |
| Índices en Supabase | Creados sobre empresa_id, fecha, estado, cliente_id, vendedor_id en las tablas de mayor volumen |
| Historial de visitas en FichaCliente (paginado) | VISITAS_PAGE=10, cargarVisitas(pag), paginación con ← → en tab Visitas |
| Realtime en Pedidos.jsx | Suscripción INSERT en tabla pedidos filtrada por empresa_id; toast "Nuevo pedido recibido" + recarga automática de lista |
| Módulo Finanzas | Vista consolidada de CxC + CxP + Cobros del día para rol finanzas |

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

### Supabase — cambios requeridos para esta sección
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

### Cambios de BD requeridos
```sql
ALTER TABLE gastos ADD COLUMN estado text DEFAULT 'pagado' CHECK (estado IN ('pagado', 'pendiente'));
ALTER TABLE gastos ADD COLUMN fecha_vencimiento date;
ALTER TABLE gastos ADD COLUMN metodo_pago text; -- 'Efectivo', 'Transferencia', 'Pago Móvil', etc.
```

### Estados y flujo
```
Nuevo gasto
  ├── Pagado hoy     → estado='pagado', fecha=hoy, monto registrado
  └── Programado     → estado='pendiente', fecha_vencimiento ingresada por usuario
        └── [al pagar] → estado='pagado', actualizar monto y método
```
