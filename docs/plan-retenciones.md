# Plan — Retenciones de IVA e ISLR a proveedores

Aprobado 2026-10-05. Primer cliente: Meraki (agente de retención). Diseñado
multi-empresa: todo se activa por empresa y no cambia nada para las demás.

## Objetivo y alcance

Que el sistema calcule y registre las retenciones de IVA e ISLR **al pagar** a
un proveedor, para saber cuánto hay que pagarle de verdad y cuánto se le debe
al SENIAT. Los comprobantes, su numeración y las declaraciones (TXT de IVA,
XML de ISLR) **siguen en Galac** por ahora; el modelo de datos queda listo para
traerlos al sistema después sin migrar nada.

Fuera de alcance (por decisión del cliente): comprobantes, numeración,
declaraciones, enteramiento, libro de compras.

## Decisiones

| Tema | Decisión |
|---|---|
| Sobre qué | Recepciones (compras) **y** gastos con proveedor |
| Cuándo | **Al pagar**: en el primer pago en dinero del documento que encuentre al proveedor sujeto a retención |
| Cuánto | IVA: `iva del documento × % del proveedor`. ISLR: `base imponible (sin IVA, gravada + exenta) × % del proveedor`. Completas en ese primer pago |
| Facturas viejas | Una factura pendiente o parcial registrada antes de esto **también** retiene al pagarla, si aún no tiene retención. Tope: su saldo |
| Porcentaje | Se configura en el proveedor (toggle + % para IVA y para ISLR) y se **congela** en cada retención: cambiar el % del proveedor no reescribe el pasado |
| Empresa | Interruptor "Agente de retención" en Administración → Configuración. Apagado = nada de esto aparece |
| Contado | Una recepción de contado va a **CxP con vencimiento hoy** y se paga desde la ventana única (se ofrece pagar en el acto). Igual un gasto "pagado": se registra programado para su fecha y se abre la ventana de pago. Una sola puerta de pago = la retención no se puede saltar |
| Registro | La retención es un **abono sin caja** a la obligación (como la aplicación de un anticipo): fila en `pagos_proveedor` (recepción) o `pagos` (gasto) con `retencion_id` y sin cuenta bancaria. Así todo lector de saldo ya la cuenta, y los de caja la excluyen |
| Escritura | Solo por RPC; un trigger impide escribir `retencion_id` fuera de ella |
| Montos | En USD (la moneda de las obligaciones del sistema) y su equivalente en Bs. a la tasa del día del pago |

## Modelo de datos (fase 1)

- `empresas.agente_retencion boolean default false`
- `proveedores`: `retiene_iva boolean`, `pct_retencion_iva numeric` (75 / 100),
  `retiene_islr boolean`, `pct_retencion_islr numeric`
- `gastos`: `base_imponible numeric`, `monto_iva numeric` (USD, como `gastos.monto`).
  NULL en gastos viejos; la ventana de pago los pide si hacen falta para retener
- `retenciones`: `tipo` ('iva'|'islr'), `origen_tipo` ('compra'|'gasto'),
  `origen_id`, `proveedor_id`, `fecha`, `base_calculo`, `porcentaje`,
  `monto_usd`, `tasa_cambio`, `tipo_tasa`, `monto_bs`, `estado`
  ('vigente'|'anulada'), anulación (`anulado_por`, `fecha_anulacion`,
  `motivo_anulacion`), `usuario_id`.
  **Preparadas para el proceso completo** (NULL hoy): `numero_comprobante`,
  `periodo`, `concepto_islr`, `fecha_enteramiento`, `referencia_enteramiento`.
  Única: una retención vigente por documento y tipo
- `pagos_proveedor.retencion_id`, `pagos.retencion_id` → `retenciones`
- RPC `registrar_retenciones(origen_tipo, origen_id, fecha, tasa, tipo_tasa,
  aplicar_iva, aplicar_islr, base, iva)`: calcula en el servidor (no confía en
  montos del navegador), valida empresa/proveedor/saldo, escribe retención +
  abono y recalcula el estado del documento
- RPC `anular_retencion(retencion_id, motivo)`: admin/finanzas. Anula la
  retención y su abono y recalcula el estado
- `anular_pago_proveedor`: si la fila anulada es un abono de retención, anula
  también la retención

## Fases

1. **Base de datos** — migración + RPCs + trigger + RLS. Prueba con BEGIN/ROLLBACK.
2. **Maestros** — interruptor en Configuración; toggles y % en Proveedores;
   base imponible e IVA en el formulario de gastos (sugeridos desde el total).
3. **Recepciones de contado a CxP** — la ventana de pago de recepciones pasa a
   `src/components/ModalPagoRecepcion.jsx`; la recepción elige contado (vence
   hoy) o crédito, y con contado ofrece pagar en el acto; CxP lista todas las
   condiciones (las de contado viejas suman su pago directo); Finanzas muestra
   el **saldo** de la CxP programada (cierra ese pendiente del backlog).
4. **Gastos de contado por la ventana de pago** — "pagado" registra el gasto
   programado para su fecha y abre `ModalPagoGasto`; Bancos lee los abonos de
   `pagos` sin contar dos veces el gasto (cierra ese pendiente del backlog).
5. **Retenciones en la ventana de pago** — bloque "Retenciones" en las ventanas
   de recepción y de gasto: muestra el cálculo, permite no aplicar una, y el
   resumen queda Total − Retención IVA − Retención ISLR = **A pagar**.
6. **Lectores y reporte** — Finanzas y el exportador distinguen la retención
   (no es caja); CxP → pestaña **Retenciones** con filtros por período
   (quincena para IVA, mes para ISLR), totales, Excel para cargar en Galac y
   anulación.
7. **Documentación** — CLAUDE.md, esquema, backlog (recorrido en producción).

## Riesgos conocidos

- Notas de débito y descuento por pronto pago no recalculan la base de la
  retención (se retiene sobre el documento original). Confirmar con el contador.
- ISLR sin sustraendo ni tabla de conceptos: el % del proveedor es el efectivo.
- Si el abono en dinero falla después de registrar la retención, la ventana la
  anula para no dejarla huérfana.
