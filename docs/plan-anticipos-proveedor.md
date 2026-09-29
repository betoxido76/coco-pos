# Plan — Anticipos a proveedor vinculados a la OC (opción B)

Estado: **aprobado para ejecutar** (2026-09-28). Seguir fase por fase; cada fase
se despliega y se prueba antes de pasar a la siguiente.

## El problema

`pagos_proveedor.compra_id` es NOT NULL: todo pago a proveedor debe colgar de una
recepción. Un anticipo pagado al emitir la OC no tiene dónde registrarse →
el banco no cuadra, CxP muestra la deuda completa al recibir (riesgo de pago
doble), no se ve cuánto dinero tienen los proveedores sin entregar, y si la OC
se cancela el anticipo se pierde de vista. Hoy: 0 anticipos en las 9 empresas
(si los hubo, se pagaron por fuera).

## El modelo (patrón SAP / NetSuite)

- El **anticipo** es un documento propio (`ANT-000001`): dinero entregado a un
  proveedor, normalmente contra una OC. Es un **activo** (un derecho), no un
  gasto ni una deuda. Sale del banco el día que se paga.
- La **aplicación** es el cruce del anticipo contra una recepción. Se registra
  como una fila de `pagos_proveedor` con `anticipo_id` y **sin cuenta
  bancaria**: para CxP es un abono más (no hay que tocar el cálculo de saldo),
  pero no es una salida de dinero.
- El saldo del anticipo es: `monto_usd_equivalente − aplicaciones vigentes − reembolsos`.
- El anticipo pertenece al **proveedor**; la OC es su destino preferente. Si la
  OC se cancela, el saldo queda disponible para cualquier recepción del mismo
  proveedor (esto cubre también la opción A, "saldo a favor").
- Multimoneda: el equivalente USD se fija con la tasa **de la fecha del anticipo**
  (`tasas_cambio`, §7). Se aplica en USD. No hay diferencial cambiario porque el
  sistema contabiliza en USD.

## Fase 0 — Decisiones previas (usuario) — CERRADA 2026-09-28

| # | Decisión | Resultado |
|---|---|---|
| 0.1 | ¿El proveedor emite factura por el anticipo? (IVA: hecho imponible al pagar, consultar al contador) | **Pendiente con el contador.** No bloquea: `nro_doc_proveedor` queda **opcional** y se vuelve obligatorio si el contador lo confirma |
| 0.2 | ¿Quién registra anticipos? | Quien tenga el módulo **`compras` o `cxp`** (el botón en la OC se oculta sin ninguno de los dos) |
| 0.3 | ¿Quién los anula? | Admin / finanzas (igual que `anular_pago_proveedor`) ✔ |
| 0.4 | ¿Tope del anticipo? | Hasta el 100 % del total de la OC, menos los anticipos vigentes ✔ |
| 0.5 | Reembolso de un anticipo | Sí, con fecha, cuenta bancaria y método; entra al banco ✔ |
| 0.6 | ¿Arreglar los 2 bugs previos de Bancos/Finanzas (ver Fase 2)? | Sí, en la misma entrega ✔ |

## Fase 1 — Base de datos

Archivo `anticipos_proveedor.sql`. Antes de reescribir una función existente, **leer su
definición actual en producción** (`pg_get_functiondef`), no reescribirla de memoria.

1. **Tabla `anticipos_proveedor`**
   `id, empresa_id!, numero_anticipo!, proveedor_id!, orden_compra_id (nullable),
   fecha date!, monto_usd, monto_bs, tasa_cambio, tipo_tasa, metodo_usd, metodo_bs,
   cuenta_bancaria_id, monto_equiv_usd numeric! (> 0), nro_doc_proveedor, nota,
   estado text! CHECK IN ('disponible','aplicado_parcial','aplicado','reembolsado','anulado'),
   usuario_id!, created_at, anulado_por, fecha_anulacion, motivo_anulacion`.
   Índices por `(empresa_id, proveedor_id, estado)` y `orden_compra_id`.
2. **Tabla `anticipo_reembolsos`** (si 0.5 = sí): `id, empresa_id, anticipo_id!, fecha!,
   monto_usd, monto_bs, tasa_cambio, tipo_tasa, metodo, cuenta_bancaria_id, nota, anulado…`.
3. **`pagos_proveedor.anticipo_id uuid REFERENCES anticipos_proveedor`** + CHECK:
   si `anticipo_id` no es null, `cuenta_bancaria_id` debe ser null.
4. **RLS** en las tablas nuevas con `get_empresa_id()` / `is_superadmin()`, igual que el resto.
5. **Numeración** `obtener_siguiente_anticipo_numero(p_empresa_id)` → `ANT-000001`,
   con el mismo patrón que los demás contadores.
6. **`recalcular_anticipo(p_anticipo_id)`**: deriva el `estado` a partir de las
   aplicaciones y reembolsos vigentes. Es la única que escribe `estado`.
7. **RPC `aplicar_anticipo_proveedor(p_anticipo_id, p_compra_id, p_monto)`**, SECURITY DEFINER,
   en una transacción con `FOR UPDATE` sobre el anticipo y la recepción. Valida: misma
   empresa y mismo proveedor, anticipo no anulado, `p_monto ≤ saldo del anticipo` y
   `≤ saldo de la recepción`. Inserta la fila en `pagos_proveedor` (fecha = hoy,
   `metodo_usd = 'anticipo'`, `nota = 'Aplicación ANT-…'`) y recalcula
   `compras.estado_cobro` y el anticipo.
8. **RPC `anular_anticipo_proveedor(p_id, p_motivo)`**: bloquea si hay aplicaciones o
   reembolsos vigentes ("anula primero las aplicaciones"). Motivo obligatorio.
9. **Extender `anular_pago_proveedor`**: si el pago tiene `anticipo_id`, llamar a
   `recalcular_anticipo` (el saldo vuelve al anticipo).
10. **Vista `v_anticipos_saldo`** (`security_invoker`): anticipo + aplicado + reembolsado + saldo.
11. **Pruebas en producción sin dejar residuos** (`BEGIN … ROLLBACK`): aplicar parcial y
    total, sobreaplicar (debe fallar), proveedor distinto (debe fallar), anular la
    aplicación (el saldo vuelve), anular un anticipo con aplicaciones (debe fallar).

> **Fase 1 — APLICADA en producción 2026-09-28** (migración `anticipos_proveedor_fase1`).
> 17/17 pruebas con BEGIN/ROLLBACK. Ajustes surgidos al probar: trigger guardián
> sobre `pagos_proveedor.anticipo_id` y permiso atado al módulo (no al rol admin).

## Fase 2 — Bancos y Finanzas (antes de la UI, para que el dinero cuadre desde el primer anticipo)

> **HECHA 2026-09-28.** Además de los 2 bugs previstos, los **cobros** tenían el mismo
> error de fecha (596 de 1.828 fuera de su día) y Finanzas contaba las NC aplicadas
> como ingreso; ambos corregidos. Hallazgos que quedan FUERA de esta fase:
> (a) Finanzas muestra la CxP programada por `compras.total`, sin restar abonos;
> (b) Bancos no lee los abonos parciales a gastos (tabla `pagos`): hoy es latente
> (0 abonos con cuenta bancaria), pero fallará cuando se registre el primero.

Encontré dos bugs que **ya existen hoy**:
- **Finanzas cuenta como salida de caja las ND aplicadas como pago**
  (`pagos_proveedor` con `devolucion_proveedor_id`), aunque no se movió dinero.
- **Bancos y Finanzas fechan los pagos a proveedor por `created_at`**, no por
  `fecha_pago`: un pago cargado con fecha pasada aparece el día en que se registró (va contra §7).

Cambios:
1. Bancos (`calcularSaldoCuenta` y el extracto) y Finanzas: el anticipo aparece como
   **egreso "Anticipo proveedor · ANT-… · OC-…"** en su `fecha`; el reembolso, como ingreso.
2. Finanzas: excluir de las salidas los `pagos_proveedor` con `anticipo_id` **o**
   `devolucion_proveedor_id` (arregla el bug 1).
3. Bancos y Finanzas: fechar por `fecha_pago` (arregla el bug 2).
4. Verificación: el saldo de cada cuenta bancaria antes y después del cambio. Solo
   debe moverse por el bug 2 (se reubican fechas, el total no cambia) y, en
   Finanzas, por el bug 1.

## Fase 3 — Registrar el anticipo desde la OC

> **HECHA 2026-09-28.** Componente `src/components/AnticiposOC.jsx` (sección, tabla
> reutilizable `TablaAnticipos`, `ModalAnularAnticipo`, `usePermisosAnticipo`).
> `ModalPagoObligacion` ganó `labelAbonado`, `labelSaldo` y `confirmacion`. El botón de
> anular aparece solo en anticipos `disponible` (sin aplicaciones ni reembolsos).

1. **`DetalleOrden`**: sección "Anticipos" (número, fecha, monto, aplicado, saldo, estado)
   y botón **"Registrar anticipo"** para OC en estado `pendiente`, `aprobada` o `recibida_parcial`.
2. El botón abre **`ModalPagoObligacion`** (la ventana única de pago, §7). Total = total OC,
   abonado = anticipos vigentes y `saldoEfectivo` = el tope de 0.4. En `extras` va el
   Nro. doc. del proveedor. La fecha y la tasa de esa fecha las maneja el componente.
   **No se escribe una ventana nueva.**
3. Listado de OC: columna "Anticipo" con el saldo disponible (vacía si no hay).
4. Anulación del anticipo desde su detalle (RPC 1.8), con motivo.

## Fase 4 — Aplicación automática en la recepción

> **HECHA 2026-09-28.** `SelectorAnticipos` (en `AnticiposOC.jsx`) se usa en
> `ModalPagoCompra` y en CxP → `ModalPago`. Con anticipo, la recepción se guarda
> a crédito y el pago en dinero al recibir va como abono ("Pago al recibir"); si el
> anticipo cubre todo no se pide pago. La OC del anticipo se lee aparte (no se
> usan embeds sobre la vista `v_anticipos_saldo`).

1. **Recepción contra OC** (`NuevaRecepcion` → `ModalPagoCompra`): si la OC o el proveedor
   tienen anticipos con saldo, se muestra el bloque **"Anticipos disponibles"**.
   - Los de **la misma OC** vienen pre-marcados y se aplican automáticamente hasta el total de la recepción.
   - Los del mismo proveedor sin OC (o de una OC cancelada) aparecen desmarcados, para aplicarlos a mano.
   - El resto de la recepción sigue el flujo normal (contado, parcial o crédito).
2. Si hay anticipo aplicado, la recepción se guarda como `condicion_pago = 'credito'`
   (igual que el contado parcial de hoy), para que aparezca en CxP con su abono. Si el
   anticipo cubre todo, queda `pagado`.
3. Aplicar llama a la RPC 1.7 después de insertar la recepción. Si falla, se avisa con
   el mismo patrón que el abono inicial actual ("la recepción se registró pero el
   anticipo no se aplicó; aplícalo desde CxP").
4. **CxP → `ModalPago`** (pagar una recepción ya existente): mismo bloque en `extras`,
   para aplicar anticipos a recepciones libres o anteriores.
5. En "Pagos registrados" de la recepción, la aplicación se ve como "Aplicación ANT-…"
   y se anula con el flujo actual (Fase 1.9 devuelve el saldo).

## Fase 5 — CxP: pestaña "Anticipos"

1. Tab nuevo junto a Compras, Gastos y ND. KPIs: **total anticipado con saldo**, cantidad,
   **anticipos con más de 30 días sin aplicar**, y **saldo en OC canceladas**.
2. Tabla: ANT, fecha, proveedor, OC (con su estado), monto, aplicado, saldo, antigüedad,
   estado. Filtros con `FiltroCombo`: proveedor, OC y estado.
3. Detalle: datos del pago, aplicaciones (recepción, fecha, monto) y reembolsos, más los
   botones Anular y Registrar reembolso.
4. En los KPIs de CxP, mostrar "Deuda con proveedores" y "Anticipos a favor" **por separado**,
   sin restarlos (como hacen los ERP: uno es pasivo y el otro activo).

## Fase 6 — Cancelación de OC con anticipo

1. `anularOC`: si la OC tiene anticipos con saldo, en vez del `confirm` simple se abre un
   modal con dos caminos:
   - **Dejar como saldo a favor del proveedor** (default): el anticipo sigue `disponible`
     y se ofrece en la próxima recepción de ese proveedor (Fase 4.1).
   - **Registrar reembolso**: el dinero vuelve a una cuenta bancaria (tabla 1.2).
2. El listado de la Fase 5 marca los anticipos de OC canceladas para darles seguimiento.

## Fase 7 — Cierre

1. `CLAUDE.md` §7 (anticipos, la regla de que la aplicación no es salida de dinero y que
   los lectores de `pagos_proveedor` para caja deben excluir `anticipo_id`) y `docs/claude-schema.md`.
2. Memoria del proyecto.
3. Recorrido completo con el usuario en producción, en una empresa de prueba:
   1. OC $1.000 → anticipo 30 % en Bs → Bancos muestra la salida en su fecha.
   2. Recepción parcial $600 → aplica $300 → CxP debe $300.
   3. Recepción del resto $400 → el anticipo queda en 0 → CxP debe $400.
   4. OC cancelada con anticipo → queda como saldo a favor → se aplica a otra OC del mismo proveedor.
   5. Anular una aplicación → el saldo vuelve al anticipo y la recepción vuelve a `pendiente`/`parcial`.
   6. Intentar anular un anticipo con aplicaciones → bloqueado.
   7. Reembolso → entra al banco.
4. Capacitación: una lámina para Compras/CxP (mismo formato que las presentaciones de capacitación de Meraki).

## Compatibilidad con la Fase 2 del backlog (CxP unificada)

Cuando `pagos_proveedor` migre a la tabla genérica `pagos`, el anticipo pasa a ser
`pagos.origen_tipo = 'orden_compra'` y la aplicación, un cruce. El diseño evita
depender de columnas que esa migración elimine: el enlace es `anticipo_id` y el
estado se deriva, nunca se edita a mano.

## Fuera de alcance (por ahora)

- Asientos contables (no hay módulo contable).
- Diferencial cambiario (el sistema contabiliza en USD).
- Anticipos a clientes (es el caso espejo; saldría fácil con este mismo diseño).
