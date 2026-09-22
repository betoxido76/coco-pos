// Puente hacia el motor de inventario, que vive en Postgres (motor_inventario_fase2.sql
// y _fase2b.sql). Aquí no hay lógica de stock: solo se arma la llamada.
//
// El invariante de 4 pasos (CLAUDE.md §15) se ejecuta dentro de una transacción
// en la base. Antes eran 4 llamadas HTTP sueltas desde el navegador y un corte
// de conexión a mitad dejaba el stock inconsistente sin que nadie se enterara.
//
// Uso típico en una pantalla que descuenta stock:
//
//   const almacenId = await almacenPredeterminado(perfil.empresa_id)
//   const faltantes = await verificarStock(items, almacenId)
//   if (faltantes.length && !yaConfirmo) { mostrarModal(faltantes); return }
//   await moverStockLote({ items, origen: 'pedido_facturado', almacenId,
//                          permitirFaltante: yaConfirmo, usuarioId })
import { supabase } from './supabaseClient'

// Almacén del que salen las ventas. Se marca en Administración → Almacenes.
// Si la empresa no tiene ninguno marcado, se devuelve null y el motor reparte
// tomando del almacén con más stock, que es el comportamiento anterior.
export async function almacenPredeterminado(empresaId) {
    if (!empresaId) return null
    const { data } = await supabase.from('almacenes')
        .select('id').eq('empresa_id', empresaId).eq('es_default', true)
        .limit(1).maybeSingle()
    return data?.id || null
}

// Los formularios usan varios nombres para el mismo tipo de ítem: el de Mermas
// dice 'empaque', los de Compras y Producción usan el plural de la tabla. El
// motor y `stock_ubicacion` usan el singular canónico. Ver CLAUDE.md §15.
const TIPO_ITEM_MOTOR = {
    empaque: 'material_empaque',
    productos_terminados: 'producto_terminado',
    materias_primas: 'materia_prima',
    materiales_empaque: 'material_empaque',
    consumibles: 'consumible',
}
export const tipoItemMotor = (t) => TIPO_ITEM_MOTOR[t] || t

// Un solo ítem. Para varios usar moverStockLote, que los mueve en una
// transacción — si uno falla, ninguno queda movido.
export async function moverStock({
    tipoItem, itemId, cantidad, origen, tipoMovimiento = 'salida',
    almacenId = null, permitirFaltante = false, notas = null, usuarioId = null, fecha = null,
}) {
    const params = {
        p_tipo_item: tipoItemMotor(tipoItem),
        p_item_id: itemId,
        p_cantidad: Number(cantidad),
        p_tipo_movimiento: tipoMovimiento,
        p_origen: origen,
        p_almacen_id: almacenId || null,
        p_permitir_faltante: permitirFaltante,
        p_notas: notas,
        p_usuario_id: usuarioId,
    }
    if (fecha) params.p_fecha = fecha
    const { data, error } = await supabase.rpc('mover_stock', params)
    if (error) throw new Error(error.message)
    return data
}

// Ajuste de stock desde la ficha de un maestro (productos, materias primas,
// empaque, consumibles). Aplica la DIFERENCIA contra el almacén elegido, no el
// valor absoluto: si otro usuario movió stock mientras el formulario estaba
// abierto, un "set" a ciegas le borraría el movimiento.
//
// Antes, estos formularios escribían stock_actual directo y no tocaban
// stock_ubicacion ni dejaban movimiento. De ahí salen los consumibles de
// Meraki con el doble en el catálogo que en almacenes.
export async function ajustarStockMaestro({
    tipoItem, itemId, stockAnterior, stockNuevo, almacenId, usuarioId = null, nota = null,
}) {
    const diff = Number(stockNuevo || 0) - Number(stockAnterior || 0)
    if (Math.abs(diff) < 0.0001) return null
    if (!almacenId) throw new Error('Selecciona el almacén al que aplicar el ajuste de stock')
    return moverStock({
        tipoItem, itemId, cantidad: Math.abs(diff),
        tipoMovimiento: diff > 0 ? 'entrada' : 'salida',
        origen: 'ajuste_manual', almacenId, usuarioId,
        notas: nota || 'Ajuste desde la ficha del maestro',
    })
}

// Convierte líneas de venta/pedido al formato que espera el motor.
// `cantidad` DEBE venir en unidades primarias: el motor no sabe de UM2.
export const lineasAItems = (lineas, getCantidad) => (lineas || [])
    .map(l => ({
        tipo_item: 'producto_terminado',
        item_id: l.producto_id,
        cantidad: Number(getCantidad ? getCantidad(l) : l.cantidad) || 0,
    }))
    .filter(i => i.item_id && i.cantidad > 0)

// Lectura pura: qué ítems no alcanzan y cuánto falta. [] = alcanza para todos.
// Mide contra lo que hay en almacenes, no contra stock_actual del catálogo.
export async function verificarStock(items, almacenId) {
    if (!items?.length) return []
    const { data, error } = await supabase.rpc('verificar_stock', {
        p_items: items.map(i => ({ ...i, tipo_item: tipoItemMotor(i.tipo_item) })),
        p_almacen_id: almacenId || null,
    })
    if (error) throw new Error(error.message)
    return data || []
}

// Mueve todos los ítems en UNA transacción: o salen todos o no sale ninguno.
// Con permitirFaltante en false (el defecto), si el stock no alcanza lanza y no
// queda nada a medias. En true registra el faltante marcado y sin almacén.
export async function moverStockLote({
    items, origen, almacenId = null, tipoMovimiento = 'salida',
    permitirFaltante = false, notas = null, usuarioId = null, fecha = null,
}) {
    if (!items?.length) return { items: 0, movimientos: 0, faltante: 0 }
    const params = {
        p_items: items.map(i => ({ ...i, tipo_item: tipoItemMotor(i.tipo_item) })),
        p_tipo_movimiento: tipoMovimiento,
        p_origen: origen,
        p_almacen_id: almacenId || null,
        p_permitir_faltante: permitirFaltante,
        p_notas: notas,
        p_usuario_id: usuarioId,
    }
    if (fecha) params.p_fecha = fecha
    const { data, error } = await supabase.rpc('mover_stock_lote', params)
    if (error) throw new Error(error.message)
    return data
}
