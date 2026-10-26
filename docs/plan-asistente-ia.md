# Plan — Asistente de IA (fase 1: base de consumo + prototipo de solo lectura)

Propuesto 2026-10-26, **pendiente de aprobación**. Nada construido aún.

## Objetivo

Un lugar en MiPOS donde el usuario pregunte en lenguaje natural sobre su operación
("¿quién me debe más de 30 días?", "¿cómo van las ventas de helados contra el mes
pasado?") y una IA responda con cifras **sacadas del sistema**, no inventadas.

La fase 1 deja lista la **base para cobrarlo**: todo uso de IA queda registrado por
empresa con su costo, con límite de gasto por empresa y un panel de consumo en
Super Admin. El prototipo del asistente lo usa solo el superadmin, con datos de
Meraki, para medir calidad y costo real antes de ofrecerlo a clientes.

## Cómo funciona

```
Pantalla /asistente ──pregunta──▶ Edge Function `asistente`
                                   │ 1. ¿usuario válido? ¿empresa con IA activa y bajo su límite?
                                   │ 2. arma las herramientas que el usuario puede usar (sus módulos)
                                   │ 3. bucle: modelo ⇄ herramientas (RPC de solo lectura en Postgres)
                                   │ 4. registra tokens y costo en ia_consumo
                ◀──respuesta + "consultó: …"──┘
```

- **La IA nunca toca la base directamente.** Recibe una lista de herramientas
  (tool use) y decide cuáles llamar; cada herramienta es una RPC de Postgres de
  **solo lectura** que devuelve datos ya agregados y acotados.
- **Las RPC corren con la sesión del usuario** (`SECURITY INVOKER`): el RLS sigue
  aplicando. Además reciben `empresa_id` explícito y filtran por él, porque el
  superadmin ve todas las empresas por RLS y no debe mezclarlas: la función usa la
  empresa del usuario o, para el superadmin, la empresa activa del selector.
- **Solo se ofrecen las herramientas de los módulos que el usuario tiene**
  (`usuario_modulos`): quien no tiene CxP no puede preguntar por proveedores.
- **Todas las llamadas a IA pasan por Edge Functions.** La clave vive en los
  secretos de Supabase y ninguna llamada escapa del registro de consumo.

## Decisiones propuestas

| Tema | Propuesta |
|---|---|
| Proveedor | OpenRouter (ya activo, devuelve el costo exacto de cada llamada), detrás de un adaptador pequeño para poder pasar a la API directa de Anthropic sin tocar el resto |
| Modelo | Configurable por empresa. Arranque: **Claude Sonnet 5.5** para el asistente (buen uso de herramientas a costo medio); medir **Haiku 5.5** con las mismas preguntas y quedarse con el más barato que acierte. Opus solo si los análisis lo piden |
| Alcance de datos (fase 1) | Ventas, CxC, pedidos, cobros, inventario (stock), CxP y gastos. Producción queda para después |
| Escritura | **Ninguna.** El asistente no crea, edita ni anula nada en la fase 1 |
| Usuarios (fase 1) | Solo superadmin, con la empresa activa del selector. Los clientes, en la fase 2 |
| Cifras | Regla del sistema: todo número sale de una herramienta y la respuesta dice de dónde y de qué período ("CxC al 26/10"). Si no hay herramienta para algo, lo dice en vez de suponer |
| Datos como datos | Nombres, notas y descripciones que devuelven las herramientas son datos, nunca instrucciones (el sistema lo indica; como todo es lectura, el daño posible es bajo) |
| Topes por pregunta | Máx. 8 vueltas de herramientas y salida acotada; cada herramienta devuelve máx. 200 filas y avisa si recortó |
| Límite por empresa | `empresas.ia_activa` + `ia_limite_mensual_usd`. Antes de cada llamada se suma el consumo del mes; al llegar al límite, el asistente responde que se agotó el cupo |
| Conversaciones | Se guardan en el servidor (para preguntas de seguimiento y para auditar qué se respondió) |
| Fechas | Zona Caracas, como el resto del sistema (`ymdCaracas`) |
| Respuestas | Markdown con tablas; se agrega `react-markdown` + `remark-gfm` solo en esta pantalla (carga diferida) |

## Base de datos

**Tablas nuevas** (con RLS **y `GRANT` explícito**, CLAUDE.md §15):

- `ia_consumo` — una fila por llamada a un modelo: `empresa_id`, `usuario_id`,
  `funcion` (`asistente` | `lectura_vin` | …), `proveedor`, `modelo`,
  `tokens_entrada`, `tokens_salida`, `costo_usd`, `conversacion_id` (nullable),
  `created_at`. La escribe solo la Edge Function (service role); lectura:
  superadmin todo, y en la fase 2 el admin de cada empresa lo suyo.
- `ia_conversaciones` — `empresa_id`, `usuario_id`, `titulo`, `created_at`.
- `ia_mensajes` — `conversacion_id`, `rol`, `contenido` (texto), `herramientas`
  (jsonb: qué consultó y con qué filtros), `created_at`.
- `empresas`: `ia_activa boolean default false`, `ia_limite_mensual_usd numeric`,
  `ia_modelo text`.

**RPC de solo lectura** (prefijo `asistente_`, `SECURITY INVOKER`, `empresa_id`
obligatorio, sobre las vistas `v_export_*` del exportador cuando existan):

| Herramienta | Responde | Fuente | Módulo |
|---|---|---|---|
| `buscar` | Resolver un nombre a cliente/producto/proveedor (búsqueda sin acentos) | maestros | cualquiera |
| `ventas_resumen` | Totales por día/semana/mes/cliente/producto/vendedor/categoría, con filtros | `v_export_ventas`, `_lineas` | ventas |
| `cartera_cxc` | Saldos por cliente, vencido vs. por vencer, antigüedad | `v_export_cartera_cxc` | cxc |
| `cobros_resumen` | Cobrado por período, cliente, método | `v_export_cobros` | cxc |
| `pedidos_resumen` | Pedidos por estado, cliente, fecha programada | `v_export_pedidos` | pedidos |
| `stock` | Existencias por producto/almacén, bajo mínimo | productos + `stock_ubicacion` | inventario |
| `cartera_cxp` | Lo que se debe a proveedores y vencimientos | `v_export_cartera_cxp` | cxp |
| `gastos_resumen` | Gastos por período y tipo | `v_export_gastos` | gastos |

Cada RPC se prueba con BEGIN/ROLLBACK y contra las cifras de las pantallas
(CxC, Dashboard), igual que el exportador.

## Costo estimado por pregunta

Una pregunta típica: instrucciones + definición de herramientas (~4.000 tokens,
cacheables) y 2–3 vueltas de herramientas → ~10–15 mil tokens de entrada y
~1.000 de salida.

| Modelo | Costo aproximado por pregunta |
|---|---|
| Haiku 5.5 | ~0,2 centavos |
| Sonnet 5.5 | ~4 centavos |
| Opus 5.5 | ~8 centavos |

Son estimados: el costo real lo da `ia_consumo` durante el prototipo y con él se
fija el precio del módulo.

## Pantallas

- **Asistente** (`/asistente`, por ahora solo superadmin en el menú): chat,
  preguntas sugeridas, botón "Nueva conversación", lista de conversaciones. Bajo
  cada respuesta, "Consultó: Ventas 01/10–26/10 · CxC al 26/10". El costo de cada
  respuesta se muestra solo al superadmin.
- **Super Admin → Consumo IA**: por empresa y mes, número de consultas, tokens,
  costo en USD y límite. En la fase 2 se suman el precio cobrado y el margen.

## Fases (dentro de la fase 1)

1. **Base de consumo** — `ia_consumo`, columnas de IA en `empresas`; `leer-vin`
   pasa a registrar su consumo y a respetar el límite. Panel de consumo en Super Admin.
2. **RPC de herramientas** — las 8 de la tabla, probadas contra las cifras de las pantallas.
3. **Edge Function `asistente`** — adaptador del proveedor, bucle de herramientas,
   permisos por módulo, topes, conversaciones y registro de consumo.
4. **Pantalla del asistente** — chat con markdown, "consultó", conversaciones.
5. **Evaluación** — 20 preguntas reales de Meraki con su respuesta correcta sacada
   de las pantallas; correrlas con Haiku y Sonnet, medir aciertos y costo, y elegir modelo.

Commit + push al cerrar cada fase.

## Fuera de la fase 1

- Acceso de clientes, precio por plan, bolsa prepagada y margen (fase 2).
- Documentos: subir PDF/Excel y consultarlos (fase 3).
- Acciones con confirmación, p. ej. crear un pedido (fase 4).
- Respuesta en streaming (texto que aparece mientras se escribe), gráficos y
  análisis con ejecución de código (requieren la API directa de Anthropic).

## Por decidir antes de construir

1. ¿El prototipo solo para ti, o también para el admin de Meraki como piloto?
2. Límite mensual de gasto para el prototipo (propuesta: USD 10).
3. ¿Producción entra ya en la fase 1 o después?
