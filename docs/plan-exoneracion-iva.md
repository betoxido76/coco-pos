# Plan — Clientes exonerados de IVA

Aprobado 2026-10-16 con dos cambios (ver Decisiones). Primer cliente: Meraki.

## Objetivo

Que las notas de un cliente **exonerado de IVA por un acto legal** (decreto,
providencia, convenio) salgan sin IVA aunque el producto sea gravado, siempre
**amparadas por un documento registrado y vigente**, y que la nota diga en qué
se ampara. Sin documento vigente, el sistema cobra IVA como siempre.

Lo que NO es: el campo "Se entrega con" (`clientes.documento_entrega`) no
decide el IVA. Sigue siendo solo el aviso para despacho.

## Principios

1. **El IVA lo decide el documento de exoneración, no una casilla.** No hay
   interruptor "no cobrar IVA" en el cliente: hay exoneraciones con número,
   base legal y vigencia.
2. **Trazable**: cada nota exonerada guarda qué exoneración la amparó, y su
   base exonerada queda separada de la exenta (el libro de ventas las distingue).
3. **Candado en la base**: una línea de un producto gravado sin IVA solo se
   acepta si la nota apunta a una exoneración vigente del mismo cliente en la
   fecha de la nota. Así no se puede saltar ni con una versión vieja de la app.
4. **Multi-empresa sin configuración**: una empresa que no registra
   exoneraciones no ve ningún cambio.

## Modelo de datos (fase 1)

- `exoneraciones_iva`: `empresa_id`, `cliente_id`, `base_legal` ('decreto' |
  'providencia' | 'convenio' | 'otro'), `numero_documento`!, `emisor` (p. ej.
  SENIAT, Gaceta Oficial N°), `fecha_documento`, `vigente_desde`!,
  `vigente_hasta` (NULL = sin vencimiento, que hay que marcar a propósito),
  `alcance` (ver pregunta 1), `observaciones`, `estado` ('vigente' |
  'revocada') + revocación (quién, cuándo, motivo), `usuario_id`.
  Escritura solo por RPC (admin/finanzas): `registrar_exoneracion_iva`,
  `revocar_exoneracion_iva`. No se borra: se revoca.
- `ventas.exoneracion_id` → `exoneraciones_iva` y `ventas.base_exonerada`
  (parte de `base_exenta`, para que ningún lector actual cambie).
- `venta_items.iva_exonerado boolean`: el producto es gravado pero esta línea
  va sin IVA por la exoneración (distinto de un producto exento).
- Función `exoneracion_vigente(cliente, fecha)` y trigger en `venta_items`
  (INSERT): producto gravado + línea sin IVA ⇒ exige `ventas.exoneracion_id`
  vigente del mismo cliente a la fecha de la nota.

## Dónde actúa

| Paso | Hoy | Con exoneración vigente |
|---|---|---|
| Pedido (NuevoPedido, Pedidos, Ventas) | Línea con `aplica_iva` del catálogo | Línea sin IVA; el vendedor ve "Cliente exonerado de IVA (N° …)" |
| Facturar (`prepararFacturaPedido`) | IVA del catálogo vigente al facturar | Se vuelve a evaluar la exoneración **a la fecha de facturar**: si venció, se cobra IVA y se avisa |
| Venta directa (Ventas, retail) | Igual que hoy | Mismo criterio |
| Nota impresa | — | Leyenda "Operación exonerada de IVA según [base legal] N° … de fecha …" |
| NC sobre una nota exonerada | Hereda `aplica_iva` | Hereda también `iva_exonerado` |
| Retenciones de CxC | IVA × % | IVA 0 ⇒ sin retención (ya funciona) |
| Exportador (ventas) | base_exenta | + `base_exonerada` y N° de exoneración |

## Pantallas

- **Administración → Clientes → ficha**: sección "Exoneración de IVA" (solo
  admin/finanzas editan): lista de documentos del cliente con su vigencia,
  registrar y revocar. Badge en la lista de clientes.
- **Aviso de vencimiento**: 30 días antes, en la ficha del cliente y al tomar
  un pedido.

## Fases

1. Base de datos: tabla, columnas, RPC, función, trigger, RLS. BEGIN/ROLLBACK.
2. Ficha del cliente: registrar / revocar / listar exoneraciones.
3. Pedido y facturación: líneas sin IVA amparadas, reevaluación al facturar,
   venta directa, NC heredada.
4. Nota impresa con la leyenda; exportador.
5. Documentación y recorrido.

## Decisiones (2026-10-16)

1. La exoneración cubre **todo** lo que se le vende al cliente.
2. **Sin adjunto ni datos del documento**: finanzas lleva el soporte aparte. El
   sistema guarda solo una **referencia** obligatoria (N° del documento o del
   control de finanzas) y la vigencia, opcional. Reemplaza los campos base
   legal / emisor / fecha del documento del modelo de arriba.
3. **Sin leyenda** en la nota por ahora (Meraki la confirma con el contador).
   La nota solo indica que es exonerada.
4. El cliente debe tener **RIF** para registrarle una exoneración.
5. Cliente de prueba: ANA ISABEL ACEDO (Meraki), hoy sin RIF.
