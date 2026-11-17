# Plan — Control de activos fijos

Estado: **fases 1 a 3 implementadas** (2026-11-17). Fases 4 a 7 (etiquetas QR, tomas físicas,
carga inicial/reportes y recorrido) quedan en backlog.

## El problema

Meraki está comprando equipos y no tiene dónde registrarlos. El inventario solo
maneja PT, MP, ME y consumibles, y ninguno sirve: un activo no se vende ni se
consume, y cargarlo como consumible infla el valor del inventario y los costos.

Hoy la compra se puede registrar como **gasto** (tipo "Activos / Inversiones"),
y así la deuda y el pago quedan resueltos. Lo que falta es el **control físico**:
qué equipos tiene la empresa, dónde está cada uno, quién lo tiene a cargo, en qué
estado está y si sigue existiendo.

## El modelo

- **Una ficha por unidad física**, no por cantidad. Tres neveras iguales son tres
  activos con su propio código, serial y ubicación. Así se controla cada una.
- Código **AF-000001** (correlativo por empresa) y **etiqueta con QR** pegada al
  equipo. El QR abre la ficha desde el teléfono.
- Cada activo tiene **ubicación** y **responsable** actuales. Todo cambio queda en
  un **historial de movimientos**: alta, traslado, cambio de responsable,
  mantenimiento, cambio de estado y baja. La ficha muestra la foto actual y el
  historial cuenta cómo llegó ahí.
- **Origen**: la ficha se enlaza al documento con que se compró: un gasto (GTO-)
  o una recepción (REC-). Desde la ficha se ve la factura y el proveedor, y desde
  el gasto se ve qué activos salieron de él. Los activos que ya tenían antes del
  sistema entran sin documento, con un valor de referencia.
- **Existencia**: se comprueba con **tomas físicas**. Se elige una ubicación (o
  toda la empresa), se recorren los equipos escaneando el QR y el sistema concilia
  lo encontrado contra lo esperado (ver más abajo).
- **No es contabilidad.** La depreciación oficial, el valor en libros y el asiento
  del activo siguen en Galac. El sistema puede mostrar una depreciación
  **referencial** (línea recta) para orientar, marcada como tal.
- **No mueve inventario** ni toca stock, costos de producto, CxP ni caja. Es un
  registro paralelo enlazado a la compra.

## Qué información maneja

### Ficha del activo (`activos`)

| Campo | Obligatorio | Nota |
|---|---|---|
| Código AF-000001 | Sí (automático) | Lo que va en la etiqueta |
| Nombre / descripción | Sí | "Nevera exhibidora 2 puertas" |
| Categoría | Sí | Maquinaria, Refrigeración, Vehículos, Computación, Mobiliario, Herramientas… editables por empresa, cada una con vida útil sugerida |
| Marca, modelo, serial | No | El serial es la identificación más fuerte; se avisa si se repite |
| Ubicación actual | Sí | Ver ubicaciones |
| Responsable actual | No | Persona (ver decisiones) |
| Estado | Sí | Operativo, En mantenimiento, Dañado, En desuso, Dado de baja |
| Fecha de adquisición | Sí | |
| Valor de adquisición USD | Sí | Base sin IVA. Si viene de un gasto o una recepción, se propone desde ahí |
| Documento de origen | No | Gasto o recepción; vacío en los activos anteriores al sistema |
| Proveedor | No | Se toma del documento de origen |
| Garantía hasta | No | Alerta antes de vencer |
| Vida útil (meses) y valor residual | No | Solo para la depreciación referencial |
| Fotos | No | 1 a 3 (Supabase Storage) |
| Observaciones | No | |
| Datos de baja | Al dar de baja | Fecha, motivo (venta, robo, daño sin reparación, donación, desecho), valor de recuperación, quién la autorizó |

### Ubicaciones (`activo_ubicaciones`)

Sedes y áreas físicas: "Planta — Producción", "Planta — Cava", "Oficina",
"Vehículo reparto 1", "En taller externo", "En cliente (comodato)".
Editables por empresa. Se separan de los almacenes porque un activo puede estar
en una oficina, en la calle o prestado a un cliente. Esto último sirve para las
neveras en comodato en los puntos de venta, si Meraki las tiene.

### Historial (`activo_movimientos`)

Una fila por evento: tipo (alta, traslado, responsable, estado, mantenimiento,
baja, ajuste de toma), fecha, ubicación y responsable antes y después, costo (si
es mantenimiento, con enlace opcional a su gasto), nota y usuario que lo
registró. El historial no se edita: un error se corrige con otro movimiento.

### Tomas físicas (`activo_tomas` + `activo_toma_items`)

- Encabezado TF-000001: alcance (una ubicación, varias o todas), fecha de
  apertura y cierre, quién la hizo y su estado (abierta, cerrada, anulada).
- Al abrirla se toma una **foto de lo esperado**: los activos vigentes de esas
  ubicaciones.
- Cada lectura (QR escaneado o búsqueda manual) marca el activo como
  **encontrado**. Se puede anotar su estado físico y una foto.

## Cómo se controla la existencia

1. **Toma física con el teléfono.** El responsable abre la toma de una ubicación,
   escanea el QR de cada equipo (con `BarcodeDetector`, como el laboratorio VIN)
   o lo busca por código o serial si la etiqueta se dañó. Va viendo cuántos
   lleva de cuántos.
2. **Conciliación al cerrar**, en cuatro grupos:
   - **Encontrado en su lugar**: confirmado, sin cambios.
   - **Encontrado en otra ubicación**: se propone registrar el traslado.
   - **No encontrado**: queda **"No localizado"** (estado aparte). No se da de baja
     automáticamente: alguien tiene que investigar y decidir.
   - **Sin ficha**: equipo físico sin registro. Se da de alta en el momento.
3. **Ajustes con firma.** Cerrar la toma genera los movimientos ("ajuste de toma")
   y un **acta imprimible** con lo encontrado, lo faltante y las firmas. Dar de
   baja un no localizado exige motivo y lo autoriza admin o finanzas.
4. **Frecuencia.** Se sugiere una toma completa al año y tomas parciales por
   ubicación cada trimestre. El tablero muestra la **fecha de la última
   verificación** de cada activo y resalta los que llevan más de X meses sin
   verse.
5. **Responsables.** Cada persona puede ver e imprimir **"activos a mi cargo"**,
   que sirve como acta de entrega al asignar y de devolución al retirarse un
   empleado.
6. **Candados en la base.** Toda escritura pasa por RPC, como en anticipos y
   requisiciones. No se borra un activo con historial. El serial se avisa si se
   repite dentro de la empresa. Un activo dado de baja no se traslada ni se asigna.

## Pantallas

- **Activos → Lista**: barra de búsqueda estilo Odoo (categoría, ubicación,
  responsable, estado, año de compra, "sin verificar hace más de N meses") y
  agrupación. KPIs: cantidad, valor de adquisición, valor referencial, no
  localizados y garantías por vencer.
- **Ficha**: datos, fotos, QR, documento de origen, historial y botones
  Trasladar, Cambiar responsable, Mantenimiento, Cambiar estado y Dar de baja.
- **Etiquetas**: impresión de QR en lote (hoja de etiquetas adhesivas) con código
  y nombre corto.
- **Tomas físicas**: lista de tomas, pantalla de escaneo pensada para teléfono y
  pantalla de conciliación y acta.
- **Desde Gastos y Compras**: botón "Registrar como activo(s)" en un gasto o en
  una recepción. Precarga fecha, proveedor y valor, y permite crear N fichas si la
  factura trae varias unidades.
- **Carga inicial** desde Excel (plantilla), para los equipos que ya tienen.
- **Exportador**: fuente `v_export_activos`.
- **Asistente IA** (después): consulta `asistente_activos` de solo lectura.

## Permisos

Módulo nuevo **`activos`**, que se activa por empresa desde SuperAdmin.

| Acción | Quién |
|---|---|
| Ver lista y fichas | Módulo `activos` |
| Alta, traslado, responsable, mantenimiento, estado | Módulo `activos` |
| Hacer una toma física (escanear) | Módulo `activos` |
| Cerrar una toma y aplicar ajustes | Admin o finanzas |
| Dar de baja | Admin o finanzas, con motivo obligatorio |
| Ver valores (adquisición y referencial) | Decisión 0.5 |

## Fase 0 — Decisiones (CERRADA 2026-11-17)

| # | Decisión | Resultado |
|---|---|---|
| 0.1 | Umbral de activo | **$100** (`empresas.activos_valor_minimo`): por debajo la app avisa que es gasto y pide confirmar; no bloquea |
| 0.2 | Responsables | **Usuarios del sistema** por ahora (`activos.responsable_id → usuarios`) |
| 0.3 | Ubicaciones y categorías | Ubicación inicial **"Activos"**; ubicaciones propias (`activo_ubicaciones`, no `almacenes`, para no aparecer en los selectores de stock), editables por la empresa. 7 categorías sembradas con vida útil sugerida, editables |
| 0.4 | Equipos en clientes | No por ahora; a futuro es una ubicación más (se agrega cliente_id si hace falta) |
| 0.5 | Quién ve los montos | **Admin y finanzas** (y superadmin): montos en `activo_valores` con RLS propia |
| 0.6 | Depreciación | Referencial en línea recta, solo informativa |
| 0.7 | Etiquetas | No por ahora (fase 4 en backlog) |
| 0.8 | Inventario inicial | **Uno a uno desde el sistema**, sin plantilla Excel |

## Implementado (fases 1-3)

- `activos_fijos.sql`: `activo_categorias`, `activo_ubicaciones` (escritura desde la app), `activos`,
  `activo_valores`, `activo_movimientos` (solo lectura; escritura por RPC: `crear_activo` (1 a 50
  unidades), `editar_activo`, `registrar_movimiento_activo` (traslado, responsable, estado,
  mantenimiento), `dar_baja_activo` y `reactivar_activo` (admin/finanzas)). Módulo `activos`.
- `src/pages/Activos.jsx`: lista con KPIs y filtros (FiltroCombo + búsqueda), ficha con historial,
  movimientos, baja/reactivación, maestros de categorías y ubicaciones.
- `src/components/Activos.jsx`: `FormActivo` (alta/edición, avisos de umbral y serial repetido) y
  `ActivosDelDocumento` (detalle de Gastos y de Compras → recepción: activos enlazados y "Registrar
  como activo", que precarga fecha, proveedor y valor).
- La lista usa filtros sueltos y no la barra estilo Odoo; el mantenimiento se registra como nota
  (la RPC ya acepta `gasto_id`, falta el selector en pantalla).

## Fases

1. **Base de datos** (`activos_fijos.sql`): tablas `activo_categorias`,
   `activo_ubicaciones`, `activo_responsables`, `activos`, `activo_movimientos`,
   `activo_tomas` y `activo_toma_items`, con RLS por empresa y GRANT explícito.
   Escritura solo por RPC: `crear_activo` (también en lote desde un gasto o una
   recepción), `mover_activo` (traslado, responsable, estado y mantenimiento),
   `dar_baja_activo`, `abrir_toma_activos`, `registrar_lectura_toma` y
   `cerrar_toma_activos`. Bucket de fotos y módulo `activos` en `modulos`.
   Pruebas en BEGIN/ROLLBACK.
2. **Lista y ficha**: CRUD por RPC, historial, maestros editables (categorías,
   ubicaciones, responsables) y fotos.
3. **Enlace con la compra**: "Registrar como activo(s)" desde Gastos y desde
   Compras (recepción), y el enlace inverso en sus detalles.
4. **Etiquetas QR**: generación e impresión en lote; la URL del QR abre la ficha.
5. **Tomas físicas**: escaneo en el teléfono, conciliación, ajustes y acta
   imprimible.
6. **Carga inicial y reportes**: plantilla Excel, `v_export_activos` en el
   exportador, "activos a mi cargo", depreciación referencial y alertas
   (garantía, sin verificar).
7. **Recorrido con Meraki**: carga inicial real, etiquetado y primera toma física
   completa.

Fases 1 a 3 ya dejan el registro útil (saber qué hay y de dónde salió). Las fases
4 y 5 son el control físico propiamente dicho.

## Fuera de alcance

- Depreciación contable oficial, revaluaciones y ajuste por inflación (Galac).
- Plan de mantenimiento preventivo con calendario y órdenes de trabajo. Por ahora
  se registra el mantenimiento como evento. Se puede agregar después.
- Venta de un activo con factura. La baja registra el valor de recuperación; la
  factura se hace aparte.
