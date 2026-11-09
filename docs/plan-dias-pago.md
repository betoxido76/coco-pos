# Días promedio de pago (CxC)

Implementado 2026-11-09 a pedido del equipo de CxC de Meraki. SQL: `cxc_dias_pago.sql`.

## Qué muestra

Dos tags nuevos en CxC, que siguen todos los filtros de la barra (lo más útil: por cliente):

- **Días promedio de pago**: cuántos días tardaron en cobrarse las notas pagadas.
  - Cifra grande: **ponderada por monto** (cada dólar pesa igual): impacto en caja. Es el estándar
    de crédito (Weighted Average Days to Pay; el DSO y el Paydex también ponderan por valor).
  - Debajo: **promedio simple** (cada nota pesa igual), el que Meraki calculaba a mano.
  - Si las dos cifras se separan mucho, hay facturas grandes que se demoran.
- **Atraso vs plazo**: días de pago − plazo de la nota. Positivo = pagó después de vencer.
  Debajo, el simple y el plazo promedio ponderado.

Complementa a "Días calle" (notas abiertas): este indicador solo ve notas ya pagadas, así que una
factura de 120 días sin pagar no aparece aquí sino en Días calle.

## Reglas (decididas con el usuario)

1. **Pagos parciales**: cada abono pesa por su monto y su fecha. Una nota de $1.000 pagada $900 a
   los 10 días y $100 a los 60 cuenta ~15 días (no 60). Los días de cada nota ya vienen así de la
   vista; el promedio simple promedia esos días por nota.
2. **Solo dinero**: no cuentan retenciones, NC aplicadas ni diferencial cambiario. Una nota pagada
   solo con NC queda fuera.
3. **Plazo** = vencimiento − emisión de la nota (no el plazo actual del cliente, que puede cambiar).
   Sin vencimiento: días de crédito del cliente si es a crédito, si no 0.
4. **Contado y crédito** entran todas. La venta de contado sin registro de cobro (pagada en el
   acto) o con el pago en la propia venta (`pago_usd`/`pago_bs`, migradas) cuenta 0 días.
5. **Ventana**: sin filtro de mes en la barra, notas emitidas en los últimos 12 meses; con filtro
   de mes, esos meses (mes de emisión).
6. Notas en $0 y anuladas fuera. Días por día calendario en hora de Venezuela; un abono con fecha
   anterior a la nota cuenta 0.

## Modelo

Vista `v_cxc_dias_pago` (security_invoker): una fila por nota pagada con `monto_dinero`,
`dias_pago` (ponderado por abono), `plazo_dias` y los atributos que filtra la barra (cliente,
categorías, condición, vendedor, retención, diferencial). CxC la carga completa (en bloques de
1000) y calcula los promedios en el navegador sobre lo filtrado.

La columna "Días" de la tabla sigue siendo emisión → último cobro; en una nota con abonos
parciales puede diferir del valor que usa el tag.

## Pendiente

Recorrido con el equipo de CxC: comparar 2–3 clientes contra el cálculo que hacían a mano.
