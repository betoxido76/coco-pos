# Plan — Notas de crédito de proveedores

Aprobado 2026-10-06. Gemelo de las NC de clientes (CxC), del lado de CxP.

## Objetivo

Registrar las notas de crédito que emite un proveedor (descuento, ajuste de
precio, bonificación…) y aplicarlas al pagarle, en recepciones **y** gastos,
con o sin documento asociado y en forma parcial — igual que en CxC.

## Decisiones (usuario, 2026-10-06)

| Tema | Decisión |
|---|---|
| Concepto | **Se unifica** con las "Notas de Débito" actuales (`devoluciones_proveedor`): una sola pestaña CxP → **Notas de crédito**. Las que nacen de una devolución física (Compras → Devoluciones) conservan su `ND-` y se marcan "Devolución"; las manuales llevan `NCP-` |
| Dónde se aplica | Recepciones y **gastos** del mismo proveedor |
| Documento | Recepción opcional: sin ella es saldo a favor del proveedor |
| Aplicación | Parcial, como en CxC: el monto es editable, tope = min(saldo NC, saldo del documento); el remanente queda |
| Reembolso | "Liquidada" sin movimiento de caja, como hoy |
| Inventario | La NC manual **no** mueve inventario. Con mercancía se sigue usando Compras → Devoluciones |
| Aprobación / motivos | Sin umbral ni catálogo: motivo en texto libre (se registra un documento del proveedor) |

## Diseño

- `devoluciones_proveedor` gana: `origen` ('devolucion'|'manual'),
  `nro_doc_proveedor` (N° de la NC del proveedor), `fecha_emision`,
  `tasa_cambio`, `tipo_tasa`, `usuario_id`, anulación y estado `parcial`.
- `devolucion_proveedor_items`: `tipo_linea` ('insumo'|'valor') + `concepto`;
  insumo opcional en las de valor.
- **Saldo derivado** de sus aplicaciones: filas de `pagos_proveedor` (recepción)
  y de `pagos` (gasto) con `devolucion_proveedor_id`, sin cuenta bancaria. No se
  guarda: igual que la NC de cliente se deriva de `cobros.devolucion_id`.
- Escritura por RPC: `crear_nc_proveedor`, `aplicar_credito_proveedor`,
  `anular_credito_proveedor` (revierte sus aplicaciones). Un trigger impide
  escribir `devolucion_proveedor_id` fuera de la RPC (desde la fase 3).
- `anular_pago_proveedor` recalcula el estado de la NC cuyo abono se anula.

## Fases

1. **Base de datos** — columnas, RPCs, numeración `NCP-` separada de `ND-`.
2. **Pestaña Notas de crédito** — lista unificada (origen, N°, doc. del
   proveedor, saldo), "Nueva NC de proveedor", detalle con sus aplicaciones,
   anular, liquidar (reembolso). Compras → Devoluciones muestra solo las de
   devolución.
3. **Aplicación al pagar** — bloque "Notas de crédito disponibles" en las
   ventanas de recepción y de gasto (reemplaza el de ND todo-o-nada);
   indicador "Créditos a favor" en CxP; trigger de la RPC.
4. **Lectores y documentación** — Finanzas (no es caja en gastos), exportador
   ("nota de crédito aplicada"), CLAUDE.md, esquema, backlog.

## Riesgos

- Una NC que rebaja el IVA de una factura ya retenida no ajusta la retención
  (pregunta abierta al contador, backlog).
