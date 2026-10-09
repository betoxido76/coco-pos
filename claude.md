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

**PWA y versiones viejas:** la app guarda su código en el navegador. Con
`registerType: 'prompt'` una pestaña abierta NO toma la versión nueva sola:
`src/components/AvisoNuevaVersion.jsx` revisa cada 15 min y pide recargar. Un
arreglo publicado no protege a quien tiene la pestaña abierta desde antes
(NE-001226 se facturó con un bug corregido una hora antes): las reglas que no
deben violarse van además como candado en la base (p. ej. el trigger
`venta_items_cuadra_unidades`: cantidad × factor = cantidad_primaria).

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

Hay **dos fuentes de tasas y cada una tiene su rol** — no unificar sin leer esto:

| Tabla | Rol | Quién la usa |
|---|---|---|
| `configuracion` (clave/valor) | Tasa **vigente** (una foto por empresa): `tasa_bcv`, `tasa_euro`, `tasa_binance` | Ventas, Compras, Gastos, CxP, Bancos, Finanzas, NuevoPedido y los KPIs de CxC |
| `tasas_cambio` | **Histórico** por fecha: una fila por `(empresa_id, fecha)` con las 3 tasas | Todo registro de dinero: CxC, CxP, Gastos, Compras (contado) y Administración → Tasas de Cambio |

`Administracion → Configuracion` escribe SIEMPRE en `tasas_cambio` (upsert sobre
`empresa_id,fecha`, por eso volver a guardar una fecha la sobreescribe) y
**solo sincroniza `configuracion` cuando la fecha guardada es la más reciente**
del histórico — cargar una tasa de días atrás no debe pisar la vigente.

**Todo movimiento de dinero se registra con su fecha real y con la tasa de ESA
fecha**, no la de hoy. Si la fecha elegida no tiene tasas en `tasas_cambio`, el
guardado se bloquea (hay que cargarlas primero en Administración).

| Módulo | Fecha guardada en |
|---|---|
| CxC — cobros (individual y múltiple) | `cobros.fecha_cobro` |
| CxP — pagos a proveedor | `pagos_proveedor.fecha_pago` (timestamptz: escribir con `fechaAtimestamp()`, nunca 'AAAA-MM-DD' solo, que queda a medianoche UTC = día anterior en Venezuela) |
| CxP / Gastos — abonos a gastos | `pagos.fecha` · `gastos.fecha` |
| Gastos — alta del gasto | `gastos.fecha` |
| Compras — recepción de contado | Ya no se paga en la recepción: va a CxP con vencimiento hoy (`pagos_proveedor.fecha_pago`). `compras.fecha_pago` solo en las de contado anteriores a 2026-10-05 |

**Lectores de caja (Bancos, Finanzas):** ubicar cada movimiento por su fecha
real (`cobros.fecha_cobro`, `pagos_proveedor.fecha_pago`), nunca por
`created_at`; convertir con `ymdCaracas()` y filtrar con
`inicioDiaCaracas()`/`finDiaCaracas()`. No son dinero y se excluyen de caja: los
cobros con `devolucion_id` (NC aplicada), los `pagos_proveedor` con
`devolucion_proveedor_id` (nota de crédito de proveedor aplicada, también en
`pagos` para gastos) o con `anticipo_id` (aplicación de un
anticipo: el dinero salió con el anticipo, `anticipos_proveedor`, en su `fecha`),
y los abonos con `retencion_id` en `pagos_proveedor` y `pagos` (retención: se le
debe al SENIAT). Ver `docs/plan-anticipos-proveedor.md` y `docs/plan-retenciones.md`.
Gastos en Bancos: el dinero sale por sus abonos en `pagos`; un gasto `pagado`
se cuenta por su fila solo si no tiene abonos (contado anterior a 2026-10-05).

La UI es un componente único: `src/components/SelectorFechaTasa.jsx`, que
exporta también `useTasasFecha`, `OPCIONES_TASA`, `hoyYMD`, `fechaAtimestamp`,
`ymdCaracas`, `inicioDiaCaracas` y `finDiaCaracas`.
**No duplicar el selector de tasa en un módulo nuevo** — importarlo de ahí.

### Ventana de pago única (cuentas por pagar)

`src/components/ModalPagoObligacion.jsx` es la ÚNICA ventana de "registrar
pago" del sistema: resumen (total / abonado / saldo), fecha + tasa de esa fecha,
monto USD + método, equivalente en Bs., monto Bs. + "Saldar resto" + método,
cuenta bancaria y nota. Maneja todo el formulario y sus validaciones; el
llamador solo recibe los datos en `onConfirmar(datos)` y escribe en BD
(devolver un string = mensaje de error a mostrar).

- `saldoEfectivo` es el tope del abono (saldo menos descuentos y créditos
  aplicados). Los montos arrancan **vacíos** (prellenar el saldo provocaba
  pagos parciales registrados como totales) y antes de guardar se muestra
  `ConfirmacionPago` (exportado del mismo archivo): "Pago TOTAL" o "Pago
  PARCIAL — queda pendiente $X".
- **No hay otra puerta de pago.** La recepción de contado (`ModalPagoCompra`
  en Compras) solo elige la condición: contado = CxP con vencimiento hoy y se
  abre `ModalPagoRecepcion` en el acto. El gasto "Pagado" se registra por pagar
  (vence en su fecha) y abre `ModalPagoGasto`. Así descuentos, NDs, anticipos y
  retenciones pasan siempre por el mismo lugar.
- `bloqueo` (texto) impide confirmar; `fechaInicial` propone la fecha del pago.
- Los pagos a proveedor se anulan (lógicamente) desde CxP → Ver recepción →
  Pagos registrados, vía RPC `anular_pago_proveedor` (`anular_pago_proveedor.sql`).
  **Todo lector de `pagos_proveedor` debe filtrar `.eq('anulado', false)`.**
- `extras` inyecta los bloques propios del dominio (retenciones, descuento por
  pronto pago, notas de débito, anticipos) entre el resumen y el formulario.
- `METODOS_USD` / `METODOS_BS` / `labelMetodo` son el vocabulario compartido de
  métodos de pago.

La usan `src/components/ModalPagoRecepcion.jsx` (recepciones: CxP → Pagar y la
recepción de contado; calcula su propio saldo) y
`src/components/ModalPagoGasto.jsx` (gastos), este último montado tanto desde
**Gastos** como desde **CxP → tab Gastos** para que pagar un gasto se vea y
funcione igual desde ambos lados. **No escribir una ventana de pago nueva.**

### Factura de la recepción (CxP)

La recepción fija las **cantidades** (inventario); la factura fija los
**precios** (deuda). `docs/plan-factura-recepcion.md`.

- Al recibir se pregunta "¿Llegó con factura?". Sin factura:
  `compras.estado_factura = 'pendiente'`, precios estimados (de la OC), sin
  anticipos ni pago en el acto. El default de la columna es `'registrada'` a
  propósito (versiones viejas en caché).
- **Registrar o corregir** la factura: CxP → Ver recepción, ventana
  `src/components/ModalFacturaRecepcion.jsx`, RPC `registrar_factura_recepcion`
  (módulo `cxp`). Sirve también para corregir precios de una recepción que
  llegó CON factura, mientras no tenga abonos ni devolución vigente. Las
  cantidades no se tocan. Tolerancia 5 % contra `compra_items.precio_recepcion`
  (el precio que cargó logística): fuera de ella, motivo obligatorio.
- El encabezado lo recalcula la RPC con la fórmula de `src/lib/iva.js`; el
  vencimiento = fecha de factura + días de crédito.
- **Candados**: sin factura, un trigger rechaza todo INSERT en
  `pagos_proveedor` (pago, anticipo, NC, retención) y la devolución (ND).

### Anticipos a proveedor

Dinero pagado a un proveedor ANTES de recibir, normalmente contra una OC
(`anticipos_proveedor`, `ANT-000001`). Es un saldo a favor, no un gasto: sale
del banco en su `fecha` y se cruza contra recepciones con una **aplicación** =
fila de `pagos_proveedor` con `anticipo_id` y **sin cuenta bancaria** (abono
para CxP, no salida de caja). Saldo = `monto_equiv_usd − aplicaciones vigentes −
reembolsos vigentes` (vista `v_anticipos_saldo`).

- **Toda escritura por RPC**: `registrar_anticipo_proveedor`,
  `aplicar_anticipo_proveedor`, `anular_anticipo_proveedor`,
  `registrar_reembolso_anticipo`, `anular_reembolso_anticipo`. Un trigger impide
  escribir `pagos_proveedor.anticipo_id` fuera de la RPC, y las tablas no tienen
  política de INSERT/UPDATE. `anular_pago_proveedor` devuelve el saldo al anticipo.
- Registrar/aplicar: módulo `compras` o `cxp` (el rol admin NO basta). Anular:
  admin/finanzas.
- UI en `src/components/AnticiposOC.jsx`: sección en el detalle de la OC,
  `SelectorAnticipos` (recepción y CxP → Pagar), pestaña CxP → Anticipos,
  detalle/reembolso y el modal al cancelar una OC con anticipo.
- Diseño y decisiones: `docs/plan-anticipos-proveedor.md`.

### Notas de crédito de proveedores

`devoluciones_proveedor` es la **nota de crédito de proveedor**, con dos
orígenes: `devolucion` (`ND-`, nace en Compras → Devoluciones y saca la
mercancía) y `manual` (`NCP-`, la NC que emite el proveedor —descuento,
ajuste—; se registra en CxP → Notas de crédito y no mueve inventario). Lleva el
N° del documento del proveedor (`nro_doc_proveedor`) y puede o no apuntar a una
recepción (sin recepción = saldo a favor).

- Se aplica **al pagar**, en recepciones **y gastos** del mismo proveedor, en
  forma parcial (bloque `BloqueCreditosProveedor`, como el de NC en CxC). La
  aplicación es un abono sin caja con `devolucion_proveedor_id` en
  `pagos_proveedor` o `pagos`. **Saldo derivado** de esas aplicaciones
  (`saldo_credito_proveedor`, `cargarCreditosProveedor` en el front); el estado
  (`pendiente`/`parcial`/`aplicada`) lo recalcula la base.
- **Toda escritura por RPC**: `crear_nc_proveedor`, `aplicar_credito_proveedor`,
  `anular_credito_proveedor` (revierte sus aplicaciones). Un trigger impide
  escribir `devolucion_proveedor_id` fuera de la RPC. Liquidar por reembolso =
  `estado_nd = 'reembolsada'`, sin movimiento de caja (decisión del usuario),
  vía `liquidar_credito_proveedor` (referencia obligatoria); se deshace con
  `revertir_reembolso_credito_proveedor` (`nc_proveedores_reembolso.sql`).
  Liquidar NO es aplicar: NCP-000001 se marcó reembolsada por error.
- Diseño y decisiones: `docs/plan-nc-proveedores.md`.

### Retenciones de IVA e ISLR a proveedores

Para empresas agentes de retención (`empresas.agente_retencion`, Administración →
Tasas/Configuración). El proveedor se marca con `retiene_iva` / `retiene_islr` y
su % (Administración → Proveedores). Se retiene **al pagar**, en el primer pago
del documento que no tenga esa retención (también facturas viejas pendientes):
IVA = IVA del documento × %; ISLR = base imponible (sin IVA) × %.

- La retención (`retenciones`) es un **abono sin caja**: fila en
  `pagos_proveedor` (recepción) o `pagos` (gasto) con `retencion_id`, sin cuenta
  bancaria. Todo lector de saldo ya la cuenta; los de caja la excluyen.
- **Toda escritura por RPC**: `registrar_retenciones` (calcula en el servidor)
  y `anular_retencion`. Un trigger impide escribir `retencion_id` fuera de ella.
  `anular_pago_proveedor` sobre el abono de una retención la anula.
- El % se congela en la retención: cambiar el proveedor no reescribe el pasado.
- Gastos: necesitan `base_imponible` y `monto_iva` (USD); el formulario y la
  ventana de pago los piden si el proveedor retiene.
- UI: `BloqueRetenciones` en las dos ventanas de pago; CxP → pestaña
  **Retenciones** (`PanelRetenciones`: totales por período, Excel, anulación).
  Vista previa con `src/lib/retenciones.js` (misma fórmula que la RPC).
- Comprobantes, numeración y declaraciones siguen en **Galac**; la tabla ya
  trae `numero_comprobante`, `periodo`, `concepto_islr` y enteramiento vacíos.
- Diseño y decisiones: `docs/plan-retenciones.md`.

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
| **CxP unificada (compras + gastos)** — Fase 2 del motor de pagos | Media | Consolidar en una sola pantalla de Cuentas por Pagar todas las obligaciones: recepciones de compra **y** gastos programados/parciales. Fase 1 ya creó la tabla genérica `pagos` (`origen_tipo IN ('gasto','compra')`) como cimiento. Fase 2: migrar `pagos_proveedor` → `pagos`, y que CxP liste ambos orígenes con estado derivado (pendiente/parcial/pagado) y un motor de abonos compartido. Objetivo: un único "¿qué debo?" en vez de revisar Gastos y CxP por separado. Solo entran gastos `pendiente`/`parcial` (los de contado no son cuentas por pagar). Ver §17 y §18 (`gastos.estado` ya admite `'parcial'`). |

### Backlog funcional (pendientes abiertos)

Correcciones y cierres concretos del producto, no capacidades de plataforma.
Al cerrar un ítem, borrarlo de esta tabla.

| Item | Prioridad | Descripción |
|---|---|---|
| Recorrido de retenciones en producción | Alta | Nada del circuito de retenciones (`docs/plan-retenciones.md`) se probó en navegador (las RPC sí, en BEGIN/ROLLBACK). Activar Meraki como agente, marcar 1 proveedor y probar: recepción a crédito pagada desde CxP, recepción de contado (pagar en el acto), gasto "Pagado" con y sin desglose, pago parcial, anular el abono de una retención, pestaña Retenciones + Excel. Revisar Finanzas y Bancos después. |
| Recorrido de NC de proveedores en producción | Alta | Nada se probó en navegador (las RPC sí, en BEGIN/ROLLBACK). Registrar una NCP con y sin recepción, aplicarla en parte a una recepción y el resto a un gasto del mismo proveedor, anular una aplicación desde CxP → Ver recepción, anular la nota, liquidar otra por reembolso. Revisar que las ND de Super Frenos se sigan viendo y aplicando. |
| Validar retenciones con el contador | Media | (1) ¿IVA e ISLR completos en el primer abono o el ISLR proporcional a cada abono? (2) ¿La base del ISLR incluye la parte exenta? (3) ¿Las NDs y el descuento por pronto pago reducen la base retenida? Hoy: completas en el primer pago, base gravada + exenta, sin ajuste por ND/descuento. |
| Recorrido de anticipos en producción | Alta | Nada del circuito de anticipos (`docs/plan-anticipos-proveedor.md`) se probó en navegador. Correr los 7 casos de la Fase 7 con una OC real pequeña antes de anunciarlo a los usuarios. |
| Revisar pedidos alistados sin facturar (Meraki) | Alta | Al 2026-09-28 había 15 pedidos `alistado` con fecha programada ≤ 28/09, algunos del 16-17/09. Si alguno se entregó sin facturar, el conteo físico no lo incluye y facturarlo lo descontaría dos veces. Revisar uno por uno con despacho. |
| Recontar Helado Antojito 40g (Meraki) | Media | El 24/09 se ajustó a 520 y el conteo del 25/09 dio 812 sin producción registrada entre medio. Hoy está en 392 tras restar el pedido de Farmatodo. |
| Factura del anticipo (IVA) | Media | Consultar al contador si el proveedor debe facturar el anticipo al cobrarlo. Si sí, volver obligatorio `anticipos_proveedor.nro_doc_proveedor`. |
| Lámina de capacitación: anticipos | Media | Compras y CxP, formato de las presentaciones de Meraki, con capturas reales. Hacerla después del recorrido. |
| Documento de origen en movimientos de inventario | Media | Los movimientos `pedido_facturado` no guardan NE/PED: enlazar una salida con su factura solo se puede por hora. Pasar `notas` con NE y PED en `moverStockLote` desde Pedidos y Ventas. |
| Hora real de despacho | Media | `pedidos.fecha_despacho` es la fecha PROGRAMADA; la hora en que se marca despachado solo queda en los logs de la API (retención corta). Agregar `despachado_at`. |
| Merma de la receta sin uso | Media | `recetas.merma_pct` se carga pero ninguna orden lo aplica: el factor es `cantidad ÷ rinde_unidades`. Confirmar con Meraki si el rinde que cargan ya es neto (p. ej. 30001: 529,411 L de 1.800 cocos con merma 3 %); si no, los estimados están inflados. |
| Recorrido de factura en recepción | Alta | Nada se probó en navegador (la RPC sí, en BEGIN/ROLLBACK). Recepción sin factura → intento de pago (bloqueado) → registrar factura dentro y fuera del 5 % → pagar. Corregir REC-000054 (Injaca: tiene factura, precios unitarios a corregir; hoy sus líneas suman $4.955,88 y el encabezado $5.005,55) con "Corregir factura". Intentar corregir una recepción con abonos (bloqueado). |
| Precios con 2 decimales en ventas | Media | `venta_items`, `pedido_items` y `devolucion_items.precio_unitario` siguen en numeric(12,2) (compras pasó a 6 en `compra_items_precio_6dec.sql`). Revisar si los descuentos generan precios base con más decimales; cambiarlo toca `recalcular_totales_pedido` y las vistas del exportador. |
| Recepción no transaccional | Baja | La recepción se guarda en varios pasos desde el navegador (compra, aplicación de anticipos, ítems, stock); el pago va aparte por CxP. Si un paso falla, avisa y queda para completarlo a mano. Llevarla a una RPC. |

---

## 15. Convenciones de código

- `useAuth()` en cada componente que necesite `perfil`
- `perfil?.empresa_id` — siempre validar antes de usar
- Todas las queries: `.eq('empresa_id', perfil.empresa_id)`
- Todos los INSERTs: `empresa_id: perfil.empresa_id`
- Columna de movimientos es `notas` (con s), no `nota`
- Mapeo de tipos de insumo: `materias_primas→materia_prima`, `materiales_empaque→material_empaque`, `consumibles→consumible`, `productos_terminados→producto_terminado`
- **IVA — precios en base imponible (desde 2026-10, `docs/plan-iva-base-imponible.md`)**. Todo precio de lista, de línea y todo costo es **sin IVA**; el IVA se **suma**. Campo `aplica_iva boolean` en las 4 tablas de productos (PT, MP, ME, consumibles). Reglas en TODOS los módulos:
  - **Toda la aritmética pasa por `src/lib/iva.js`**: `precioBaseItem`, `baseLinea`, `totalesDeItems` / `totalesDocumento`, `totalesGuardados`, `camposIvaLinea`, `camposIvaHeredados`. **Nunca escribir `/ 1.16` ni `* 0.16` en un módulo.**
  - El IVA del documento se calcula UNA vez sobre la base gravada total (`round2(base_gravada × 16 %)`), no sumando IVA por línea.
  - Cada línea guarda `aplica_iva`, `iva_pct` y `precio_incluye_iva`. Las líneas anteriores al cambio tienen `precio_incluye_iva = true` (precio con IVA embebido) y `precioBaseItem` las lee bien. **El default de la columna es `true` a propósito**: el código nuevo escribe `false` explícitamente (`camposIvaLinea`); una versión vieja de la app en caché queda marcada con la convención que usó.
  - Los SELECT de líneas que se usan para calcular DEBEN traer `aplica_iva` y `precio_incluye_iva`.
  - Documento emitido (nota de entrega, NC, recepción, ND, OC) = montos del encabezado (`base_gravada`, `base_exenta`, `iva`, `total`) vía `totalesGuardados`; no se recalcula.
  - Pedidos: `pedidos.total`/`base_*`/`iva` los mantiene el trigger `recalcular_totales_pedido` (cualquier cambio de líneas, estado o descuento global); facturado = montos de su nota. Las listas leen ese total. `pedido_items.subtotal` es la base de la línea.
  - Facturar un pedido: SOLO `src/lib/facturacion.js` (`prepararFacturaPedido`): cantidad en unidad de venta, IVA del catálogo vigente al facturar, totales de la nota.
  - Una NC o SDR contra una factura hereda `aplica_iva` y `precio_incluye_iva` de la línea original (`camposIvaHeredados`).
- **Invariante stock — patrón obligatorio en TODO movimiento de inventario** (alta, baja o reverso):
  1. Leer `stock_actual` actual antes de modificar (para `stock_anterior` en movimiento)
  2. Actualizar `stock_actual` en la tabla del producto
  3. Actualizar `stock_ubicacion` con SELECT + UPDATE si existe / INSERT si no existe (nunca UPSERT con ON CONFLICT cuando `almacen_ubicacion_id=NULL`)
  4. Insertar en `movimientos_inventario` con `stock_anterior`, `stock_actual`, `almacen_id`, `origen`
  - El punto más débil históricamente son las funciones de **anulación/reverso**: suelen revertir `stock_actual` pero olvidar `stock_ubicacion`. Verificar siempre los 4 pasos en rutas de cancel/anulación.
  - Para conversión de tipo de insumo entre formulario y `stock_ubicacion`: `{ materias_primas→materia_prima, materiales_empaque→material_empaque, consumibles→consumible, productos_terminados→producto_terminado }`
  - Para conversión desde `compra_items.tipo_insumo` (singular) a nombre de tabla (plural): `{ materia_prima→materias_primas, empaque→materiales_empaque, material_empaque→materiales_empaque, consumible→consumibles, producto_terminado→productos_terminados }`
- Estilos: inline styles con objetos JS (no clases Tailwind, excepto en Login/ResetPassword)
- **Filtros de lista**: usar `src/components/FiltroCombo.jsx` (lista + búsqueda por
  cualquier parte del texto, sin acentos ni mayúsculas; `value=''` = Todos; prop
  `disabled`). No usar `<select>` para filtros; los `<select>` de formularios siguen igual.
- **Listas: filtros y títulos fijos + orden por columna** con `src/components/TablaOrdenable.jsx`:
  `BarraFija` (pestañas/filtros, recibe el ref de `useAltoBarra`), `ThOrden` (título fijo a
  `top={altoBarra}`, ordenable con `col`), `useOrden` + `ordenarFilas` (vacíos al final) y
  `estiloTarjetaTabla`. La tarjeta de la tabla y cualquier ancestro deben usar `overflow: 'clip'`,
  nunca `'hidden'`/`'auto'` (crean su propio scroll y el título deja de quedar fijo). Para tablas
  en subcomponentes, `<TopTitulos.Provider value={altoBarra}>`. Las listas que se ordenan por
  columnas calculadas traen todo el filtro con `traerTodas` (`src/lib/traerTodas.js`) y paginan en
  el navegador; Inventario → Movimientos ordena en la base (paginado allí).
- **Exportador del Dashboard** (`docs/plan-exportador.md`): una vista plana `v_export_*` por fuente (security_invoker) + catálogo de campos en `src/lib/exportador/catalogo.js`. Agregar un campo = columna en la vista + entrada en el catálogo; no cruzar tablas desde la pantalla.
- Formato de moneda USD: `fmt(n)` → `$X.XX`
- Formato de moneda Bs: `fmtBs(n)` → `X.XX Bs.`
- **localStorage cache keys** (prefijo `mipos_`):
  - `mipos_clientes_${empresa_id}` — lista de clientes
  - `mipos_listas_${empresa_id}` — listas de precio
  - `mipos_productos_v2_${empresa_id}_${listaId}` — productos con precio (v2: precios en base imponible; la clave vieja traía precios con IVA)
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
