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
produccion, cambios, mermas, administracion, gastos, pedidos_campo, despacho
```

`modulos.id` es string (ej: `'bancos'`, `'dashboard'`), NO uuid. Layout.jsx hace `modulosActivos.includes('bancos')`.

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
/despacho            → Despacho
/administracion      → Administracion
/superadmin          → SuperAdmin (URL secreta, no en sidebar)
/reset-password      → ResetPassword (fuera del Layout)
/login               → Login (fuera del Layout)
```

---

## 6. Tablas principales en Supabase

@docs/claude-schema.md

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

## 10. Perfiles de negocio (pendiente de implementar)

El sistema soporta múltiples perfiles de negocio mediante `perfil_negocio` en la tabla `empresas`. El primer perfil adicional es **autopartes**:

```sql
-- Campo en empresas
perfil_negocio text DEFAULT 'manufactura'

-- Tablas activas
vehiculos (id, empresa_id, marca, modelo, submodelo, tipo)
producto_vehiculo (id, producto_id, vehiculo_id, año_inicio, año_fin, posicion)
productos_autopartes (id, empresa_id, producto_id, marca, nro_parte, tipo, barras_2, barras_3)
-- tipo viene de SQLite barras_1 (LISO/PERFORADO/etc) al migrar
```

En el frontend, los componentes renderizan condicionalmente:
```jsx
const esAutopartes = perfil?.empresas?.perfil_negocio === 'autopartes'
{esAutopartes && <CamposAutopartes />}
```

---

## 11. Flujo de onboarding de un cliente nuevo

1. Entrar a `/superadmin`
2. Crear empresa con nombre y RIF
3. Activar módulos contratados en pestaña "Módulos"
4. Ir a Authentication en Supabase → Add user (email + password)
5. Ejecutar SQL:
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

**Auto-servicio:** Login → "¿Olvidaste tu contraseña?" → Supabase envía email → `/reset-password` → ingresa nueva contraseña.

**Por superadmin:** SuperAdmin → empresa → tab Usuarios → botón 🔑 Resetear clave → llama Edge Function `resetear-password`.

**Cambio autenticado:** Sidebar → "Cambiar contraseña" → modal → `supabase.auth.updateUser()`.

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

## 14. Backlog estratégico (capacidades de plataforma SaaS)

Ítems no son mejoras funcionales al producto sino capacidades de la plataforma para escalar comercialmente.

| Item | Prioridad | Descripción |
|---|---|---|
| Panel de métricas del operador | Media | En SuperAdmin: pedidos por empresa/mes, módulos más usados, usuarios activos, última actividad. Necesario para soporte, detección de churn y decisiones de producto. |
| Autoregistro (self-service onboarding) | Media | Un cliente prospecto va a una URL, ingresa nombre/RIF/email y queda activo con plan trial. Hoy el operador es el cuello de botella del onboarding. |
| Billing integrado | Baja | Cobro recurrente automático, corte de acceso por falta de pago, portal de cliente. Opciones: Stripe + webhooks, o MercadoPago para mercado latinoamericano. |

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
  - Ventas.jsx es la referencia correcta
- **Invariante stock — patrón obligatorio en TODO movimiento de inventario** (alta, baja o reverso):
  1. Leer `stock_actual` actual antes de modificar (para `stock_anterior` en movimiento)
  2. Actualizar `stock_actual` en la tabla del producto
  3. Actualizar `stock_ubicacion` con SELECT + UPDATE si existe / INSERT si no existe (nunca UPSERT con ON CONFLICT cuando `almacen_ubicacion_id=NULL`)
  4. Insertar en `movimientos_inventario` con `stock_anterior`, `stock_actual`, `almacen_id`, `origen`
  - El punto más débil históricamente son las funciones de **anulación/reverso**: suelen revertir `stock_actual` pero olvidar `stock_ubicacion`. Verificar siempre los 4 pasos en rutas de cancel/anulación.
  - Para conversión de tipo de insumo entre formulario y `stock_ubicacion`: `{ materias_primas→materia_prima, materiales_empaque→material_empaque, consumibles→consumible, productos_terminados→producto_terminado }`
  - Para conversión desde `compra_items.tipo_insumo` (singular) a nombre de tabla (plural): `{ materia_prima→materias_primas, empaque→materiales_empaque, material_empaque→materiales_empaque, consumible→consumibles, producto_terminado→productos_terminados }`
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

### Features activas
- Caché offline stale-while-revalidate (clientes, listas, productos en `localStorage`)
- Cola offline: pedidos sin conexión en `mipos_offline_queue`, sincronizan al reconectar
- Banner offline con `useOnline()` + contador de pedidos en cola
- Realtime: suscripción `postgres_changes` por `vendedor_id`; toast al cambiar estado del pedido
- Límite de crédito: barra en FichaCliente + banner en paso 3
- CxC vencida: banner rojo en paso 3 si el cliente tiene facturas vencidas
- Semáforo de stock en grilla: verde ≥ 10, amarillo 1–9, rojo 0
- Visitas comerciales: tab "Visitas" en FichaCliente, contador en HomeVendedor
- UOM secundaria: toggle UM1/UM2 por ítem, inserta `unidad_venta` y `cantidad_primaria`
- Solicitar cambio mano a mano: bottom-sheet desde FichaCliente → crea `cambios_mano_mano` con `estado='solicitado'`
- **NuevoPedido (campo) siempre crea pedidos `pendiente`**, independiente del toggle `aprobacion_pedido`

### Patrones técnicos clave

**Cache helpers (top del archivo):**
```js
const CACHE_TTL = 3600000
const cacheSet = (key, data) => localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }))
const cacheGet = (key) => { ... }  // retorna null si expirado
```

**`itemsPreloaded = useRef(false)`** en `FlujoPedido`:
Evita doble pre-carga de ítems de la última compra cuando el stale-while-revalidate llama `aplicarProductos()` dos veces (cache + red).

**`cargarDatosCliente(clienteId)`** en `FlujoPedido`:
Helper que extrae el fetch de `direcciones_entrega` + CxC vencido + última compra. Se llama en `useEffect([clienteInicial])` y en `seleccionarCliente()`.

**Listas — evitar sobreescritura de `listaId`:**
En el background fetch de listas, `setListaId` solo se llama cuando `!listaId` para no pisar el valor ya seteado desde caché.

---

## 17. Módulo de Gastos — diseño de gastos programados

Los gastos son erogaciones operativas (nómina, impuestos, servicios, etc.) distintas a compras de inventario.

**Gastos programados:** Un gasto puede registrarse como pagado (flujo actual) o programado para una fecha futura:
- Se registran con `estado = 'pendiente'` y `fecha_vencimiento`
- Viven en el módulo Gastos (no en CXP — CXP es exclusivo de proveedores de inventario)
- Semáforo de vencimiento: verde > 3d, amarillo ≤ 3d, rojo vencido
- Al pagar se marca `estado = 'pagado'` y se registra el método de pago

### Campos en BD (ya aplicados)
```
gastos.estado text              DEFAULT 'pagado' CHECK IN ('pagado','pendiente')
gastos.fecha_vencimiento date
gastos.metodo_pago text
gastos.cuenta_bancaria_id uuid  → cuentas_bancarias
```

---

## 18. Check constraints importantes

```
pedidos.estado               CHECK IN ('pendiente','aprobado','alistado','rechazado','facturado','despachado')

ventas.estado_cobro          CHECK IN ('pendiente','parcial','pagado')
                             — NO usar 'cobrado'; el equivalente correcto es 'pagado'

compra_items.tipo_insumo     CHECK IN ('materia_prima','empaque','material_empaque',
                                       'consumible','producto_terminado')

modulos.id                   Es string (ej: 'bancos', 'dashboard'), NO uuid

devoluciones.estado_nc       CHECK IN ('pendiente','aplicada','reembolsada','anulada')

cambios_mano_mano.estado     CHECK IN ('solicitado','ejecutado')
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

### Diseño clave
- **UUIDs determinísticos** via `uuid.uuid5(NS, key)` — re-correr el script produce los mismos IDs, evita FK inconsistentes si se interrumpe la migración
- **Archivos separados** porque Supabase limita el tamaño de query en el SQL Editor (genera 9 archivos `migration_NN_nombre.sql`)
- Los archivos `.sql` y `.db` están en `.gitignore` (contienen datos de clientes)

### Lo que NO migra
- Compatibilidades vehículo↔producto (`producto_vehiculo`)
- Cobros parciales / historial de pagos

### Cotizador — búsqueda por vehículo
Requiere datos en `producto_vehiculo`. Si la tabla está vacía, siempre retorna 0 resultados. Para que funcione: cargar catálogo de vehículos y asignar compatibilidades en Administración → Productos.
