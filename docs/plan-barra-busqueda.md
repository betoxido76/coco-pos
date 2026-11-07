# Plan — Barra de búsqueda estilo Odoo (piloto en CxC)

Aprobado 2026-11-07 con estas respuestas: los KPIs siguen **todos** los filtros;
el recorrido lo hace quien cobra en Meraki; tramos 1–30 / 31–60 / 61–90 / +90; a los
usuarios de SOMA les gustó su barra.

**Estado:** fases 1 a 4 construidas y publicadas el 2026-11-07
(`src/lib/busqueda.js`, `src/components/BarraBusqueda.jsx`, CxC). El mismo día, a pedido
del usuario y antes del recorrido, se extendió a CxP (Compras y Gastos programados),
Ventas (notas de entrega), Pedidos, Gastos y Compras (órdenes, recepciones y
devoluciones), con las piezas compartidas de `src/components/BusquedaLista.jsx`; la
regla de CLAUDE.md §15 ya la describe. Falta la fase 5 (recorrido con Meraki) en CxC,
y ajustar en todas las pantallas lo que salga de ahí.

En las pantallas con rango de fechas (Ventas, Pedidos, Gastos) el Desde/Hasta sigue
junto a la barra; en Ventas se guarda con los favoritos. En Pedidos, el filtro por
producto (SKU o nombre) sigue aparte porque se resuelve en la base.

## Objetivo

Reemplazar la fila de combos de filtro de CxC → Facturas por una barra de búsqueda
como la de SOMA y Odoo: filtros como etiquetas en una sola línea y un panel con
**Filtros · Agrupar por · Favoritos**. Ocupa menos espacio, permite muchos más
campos y agrega dos capacidades que hoy no existen en soma ops: **agrupar con
subtotales** y **guardar búsquedas**.

Es un piloto: se prueba en CxC con Meraki y, si funciona, pasa a ser el estándar
de las listas (Ventas, Pedidos, Compras/CxP, Gastos) en planes aparte.

## Referencia

`soma-frontend`, rama `staging`: `src/pages/forecast/resumen/SearchBar.tsx` y
`model.ts`. Se reutiliza el **diseño y la lógica** (estado de la búsqueda,
etiquetas, Backspace borra la última, sugerencias "Buscar *campo* por",
campos comunes arriba y el resto en "Más…", solo campos con datos, conteo por
valor, hasta 3 niveles de agrupación, favoritos con "por defecto"). **No se
copia el código**: SOMA está en TypeScript + Tailwind + shadcn; soma ops es
JavaScript con estilos en línea (CLAUDE.md §15).

## Qué no cambia

- **Las pestañas de estado** (Por cobrar · Pendientes · Parciales · Pagadas ·
  Todas) se quedan como accesos rápidos, fuera de la barra.
- **Los números**: cobrado, retenciones, diferencial cambiario y saldo se
  siguen calculando como hoy (`filasCxc`). La barra solo filtra y agrupa esas
  mismas filas; no hay una segunda fórmula de saldo.
- Cobro individual, cobro múltiple (selección del mismo cliente), botón
  "Dif. cambiario", orden por columna y títulos fijos.
- Las otras pestañas de CxC (Notas de crédito, Retenciones, Dif. cambiario,
  Anular NE).

## Campos de CxC

Los datos ya están en la carga de CxC (`ventas` + `clientes`), salvo vendedor y
los nombres de las categorías 2 a 4, que se suman a la consulta (ver Fase 3).

**Filtros** (cada valor muestra cuántas notas quedan con el resto de los filtros):

| Campo | Común | Valores |
|---|---|---|
| Cliente | sí | nombre del cliente |
| Categoría 1 | sí | `categorias_clientes` nivel 1 (el nombre que la empresa le dio) |
| Vendedor | sí | `pedidos.vendedor_id`, o quien emitió la nota si no vino de pedido (misma regla que `v_export_cartera_cxc`) |
| Vencimiento | sí | Por vencer · 1–30 días · 31–60 · 61–90 · Más de 90 |
| Categorías 2, 3 y 4 | | por nivel |
| Condición de pago | | Contado · Crédito |
| Mes de emisión | | Nov 2026, Oct 2026… |
| Contribuyente especial | | Sí · No |
| Retención | | Falta comprobante · Con retención registrada (solo si la empresa configuró %) |
| Diferencial cambiario | | Con diferencial (solo si algún cliente no paga indexado) |

**Búsqueda por texto** (lo que se escribe en la barra): N° de nota, Factura
(`nro_referencia`), O/C del cliente, Cliente, RIF.

**Agrupar por** (hasta 3 niveles, en el orden elegido): Cliente, Categoría 1–4,
Vendedor, Vencimiento, Mes de emisión, Condición de pago. Comunes: Cliente,
Categoría 1, Vendedor, Vencimiento.

Dentro de un campo los valores se suman (o); entre campos se cruzan (y), como
en SOMA. Los campos sin datos en la empresa no aparecen (p. ej. Categoría 3 si
nadie la usa).

## Decisiones propuestas

| Tema | Propuesta |
|---|---|
| Dónde se calcula | En el navegador, sobre las filas que CxC ya trae completas (`traerVentas` + `cargarCobrosPagina`). Con el volumen actual alcanza; si una empresa crece mucho, conteos y grupos pasan a la base en otro plan |
| KPIs de arriba | Respetan **todos** los filtros de la barra (hoy solo respetan cliente y categoría 1). Siguen sin depender de la pestaña de estado (miden siempre lo pendiente) |
| Estado de cuenta | El botón aparece cuando la barra tiene **un solo cliente** filtrado (hoy aparece con el combo de cliente) |
| Agrupado y paginación | Agrupado: los grupos arrancan contraídos y no se pagina (se ven los totales de cada grupo, se abre el que interesa). Sin agrupar: paginación de 50 como hoy |
| Filas de grupo | Nombre del grupo, cantidad de notas, Total, Ret., Cobrado y Saldo sumados. Se leen, no tienen acciones. Orden de los grupos: por saldo descendente; las notas dentro, por la columna elegida |
| Cobro múltiple con grupos | Se puede seleccionar dentro de un grupo; la regla de un solo cliente no cambia |
| Favoritos | En el navegador (`localStorage`, clave `mipos_busquedas_cxc_${empresa_id}_${usuario_id}`), con nombre y "usar por defecto al abrir". Compartir con la empresa queda para después (necesita una tabla) |
| Qué guarda un favorito | Pestaña de estado, filtros, textos y agrupación |
| URL | No se guarda la búsqueda en la dirección en el piloto |
| Teléfono | Las etiquetas pasan a varias líneas; el panel se abre a pantalla completa con las columnas una debajo de otra |

## Fases

1. **Estado de la búsqueda** (`src/lib/busqueda.js`): funciones sin pantalla
   para aplicar filtros y textos a filas, contar valores por campo con el resto
   de los filtros, agrupar en niveles con subtotales, quitar la última etiqueta
   y leer/guardar favoritos. Recibe la configuración de campos de la pantalla:
   `{ campo, etiqueta, tipo: 'valor' | 'texto', valor(fila), etiquetaValor?, comun?, agrupable? }`.
2. **Barra y panel** (`src/components/BarraBusqueda.jsx`): etiquetas, texto con
   sugerencias "Buscar *campo* por", panel Filtros · Agrupar · Favoritos,
   "Más filtros" / "Más agrupaciones", teclado (Enter, flechas, Backspace,
   Escape), colores de la marca soma ops.
3. **Tabla agrupada**: modo agrupado para la tabla de CxC (filas de grupo con
   subtotales, abrir y cerrar, sangría por nivel, "Abrir todo / Cerrar todo"),
   respetando `ThOrden`, títulos fijos y `overflow: 'clip'` (CLAUDE.md §15). Se
   agrega a la consulta de CxC el vendedor (embed de `pedidos` con hint) y los
   nombres de categorías 2–4.
4. **CxC con la barra**: configuración de campos de CxC, la barra reemplaza los
   dos `FiltroCombo`, KPIs y Estado de cuenta según las decisiones de arriba.
   Revisión con un usuario de Meraki en el navegador.
5. **Recorrido y ajuste** con Meraki (ver abajo). Con el resultado se decide si
   la barra pasa a CLAUDE.md §15 como estándar de listas.

Commit + push al cerrar cada fase. La fase 4 cambia una pantalla que Meraki usa
a diario: se publica avisando y con la versión mínima de la app sin tocar
(no hay cambios en la base).

## Recorrido con Meraki

1. Encontrar las notas vencidas de más de 60 días de un canal.
2. Ver la cartera agrupada por vendedor y luego por cliente, y abrir un cliente.
3. Buscar una nota por su N° de factura escribiendo en la barra.
4. Guardar "Vencidas por vendedor" como favorito por defecto y volver a entrar.
5. Cobrar una nota y hacer un cobro múltiple desde una vista filtrada.
6. Estado de cuenta de un cliente filtrado desde la barra.

Se mira: si encuentran el panel sin ayuda, si usan agrupar, si los KPIs filtrados
se entienden, y qué campo pidieron que no está.

## Fuera del piloto

- Otras pantallas (cada una con su plan corto, reutilizando las fases 1–3).
- Conteos y grupos calculados en la base (Inventario → Movimientos los va a necesitar).
- Favoritos compartidos con la empresa.
- Guardar la búsqueda en la URL.
- La app de campo (NuevoPedido) y las colas de trabajo (Despacho), que funcionan mejor con pestañas.

## Por decidir antes de construir

1. ¿Los KPIs deben seguir **todos** los filtros de la barra, o solo cliente y
   categorías (más cercano a hoy)?
2. ¿Quién de Meraki hace el recorrido? Idealmente quien cobra todos los días.
3. Tramos de vencimiento: ¿1–30 / 31–60 / 61–90 / +90 o los que use Meraki en su Excel?
4. ¿Cómo les fue a los usuarios de SOMA con su barra? (sigue en `staging`, no en `main`)
