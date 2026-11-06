# Diferencial cambiario en CxC

Implementado 2026-11-06. SQL: `diferencial_cambiario_fase1.sql`.

## Problema

Algunos clientes con poder de compra (en Meraki, Farmatodo) no pagan indexado:
pagan los bolívares de la factura aunque la tasa haya subido entre la emisión y
el pago. MiPOS lleva la nota en USD y convierte cada pago en Bs. a la tasa de su
día, así que en USD queda un saldo que nunca va a entrar y la nota se queda
"parcial" para siempre, inflando la cartera.

## Decisión

Un botón en CxC, **"Dif. cambiario"**, lleva ese saldo a pérdida. La nota queda
pagada y el monto queda registrado en una tabla propia para saber cuánto deja de
percibir la empresa por este concepto, por cliente y por mes.

Se descartó calcular el diferencial automáticamente en cada pago (monto en Bs.
congelado en la nota): exige saber el monto en Bs. de la factura fiscal y su
tasa, y los casos reales no cuadran con la tasa del día de la nota. Si más
adelante hace falta, puede escribir en la misma tabla y con el mismo abono.

## Modelo

- `clientes.paga_indexado boolean NOT NULL DEFAULT true`. Se desmarca en
  Administración → Clientes. Solo para esos clientes aparece el botón.
- `diferenciales_cambiarios` (DC-000001 por empresa): nota, cliente, fecha (del
  último pago en Bs.), monto, total de la nota, cobrado antes, Bs. recibidos,
  tasa del día de la nota y del último pago, **referencia** (la parte que explica
  el cambio de tasa: Σ Bs. ÷ tasa de la nota − Bs. ÷ tasa del pago), motivo,
  usuario, estado `vigente`/`anulado` + anulación. Un vigente por nota.
- **Abono sin caja** en `cobros`: `diferencial_id`, `metodo_usd =
  'diferencial_cambiario'`, sin cuenta bancaria (CHECK). Todo lector de saldo
  (CxC, Dashboard, Exportador, límite de crédito) ve la nota saldada sin
  cambios. Finanzas lo excluye; Bancos va por cuenta bancaria.
- Escritura **solo por RPC**: `registrar_diferencial_cambiario(venta, motivo)`
  y `anular_diferencial_cambiario(id, motivo)` (borra el abono y recalcula
  `estado_cobro`). El trigger `cobros_guarda_diferencial` impide escribir
  `diferencial_id` fuera de la RPC. Anular la nota anula su diferencial
  (trigger `ventas_anula_diferenciales`).

## Candados

1. Solo rol admin o finanzas (o superadmin).
2. Solo si la nota tiene al menos un pago de dinero en Bs.
3. Solo clientes con `paga_indexado = false`.
4. La ventana muestra cuánto del saldo explica el cambio de tasa y avisa si el
   resto es significativo (pago de menos, NC faltante, factura con otra fecha).
5. Motivo obligatorio y anulación con motivo.

Sin tope en %: no hay forma de definirlo todavía.

## Pantallas

- CxC → Facturas: botón "Dif. cambiario" en la fila (si cumple los candados);
  en las pagadas con diferencial, "Dif. camb. $X" bajo el saldo. El cobrado
  muestra solo dinero, NC y retenciones.
- CxC → pestaña **Dif. cambiario** (solo admin/finanzas, si algún cliente no
  paga indexado): período, cliente, estado, totales por cliente, Excel y anular.
- Exportador → Cobros: columna "Es diferencial cambiario".
- App de campo: el historial de cobros lo muestra como "Ajuste por diferencial
  cambiario".
