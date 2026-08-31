// Motor único de emisión de notas de crédito.
//
// Hasta la Fase 0 había dos implementaciones divergentes en Ventas.jsx
// (FormDevolucion y AutorizarDevolucion) que duplicaban numeración, reposición
// de stock y cálculo de monto, y ninguna respetaba el tipo elegido: reponían
// inventario y generaban crédito siempre. Este módulo es el único lugar donde
// se crea una NC, y los tres emisores (los dos de devolución + la emisión
// manual de CxC) pasan por aquí.
//
// Los tres ejes del documento son independientes (ver notas_credito_fase0.sql):
//   afectaInventario  ¿reingresa mercancía al almacén?
//   generaCredito     ¿produce crédito aplicable en CxC? (si no, no lleva N° NC)
//   ventaId           ¿contra qué factura? (opcional desde Fase 0)

import { supabase } from './supabaseClient'

// Los precios se guardan con IVA embebido salvo que la línea esté exenta.
export const baseDeLinea = (precio, aplicaIva) =>
    aplicaIva ? Number(precio || 0) / 1.16 : Number(precio || 0)

// `aplica_iva` es POR LÍNEA: en una misma NC conviven productos gravados y
// exentos, y una línea de valor puede ser cualquiera de las dos.
export function calcularTotalesNC(lineas) {
    let subtotal = 0, total = 0
    for (const l of lineas) {
        const cant = Number(l.cantidad || 0)
        const monto = cant * Number(l.precio_unitario || 0)
        total += monto
        subtotal += baseDeLinea(monto, l.aplica_iva)
    }
    const round2 = n => Math.round(n * 100) / 100
    return { subtotal: round2(subtotal), iva: round2(total - subtotal), total: round2(total) }
}

// Reingreso de mercancía siguiendo la invariante de stock del proyecto
// (CLAUDE.md §15): leer stock_actual → actualizar producto → actualizar
// stock_ubicacion con SELECT+UPDATE/INSERT (nunca UPSERT con ON CONFLICT
// cuando almacen_ubicacion_id es NULL) → registrar el movimiento.
async function reponerStock({ empresaId, almacenId, lineas }) {
    for (const l of lineas) {
        if (l.tipo_linea === 'valor' || !l.producto_id) continue
        const cantidad = Number(l.cantidad || 0)
        if (cantidad <= 0) continue

        const { data: prod } = await supabase.from('productos_terminados')
            .select('stock_actual, nombre, sku, tipo_producto').eq('id', l.producto_id).single()
        if (!prod) continue
        // Un servicio no lleva inventario: reponerle stock genera existencias
        // fantasma. Mismo criterio que anular_nota_no_despachada.
        if (prod.tipo_producto === 'servicio') continue

        const stockAnterior = Number(prod.stock_actual || 0)
        const nuevoStock = stockAnterior + cantidad

        await supabase.from('productos_terminados')
            .update({ stock_actual: nuevoStock }).eq('id', l.producto_id)

        const { data: su } = await supabase.from('stock_ubicacion')
            .select('id, cantidad')
            .eq('tipo_item', 'producto_terminado')
            .eq('item_id', l.producto_id)
            .eq('almacen_id', almacenId)
            .is('almacen_ubicacion_id', null)
            .maybeSingle()

        if (su) {
            await supabase.from('stock_ubicacion')
                .update({ cantidad: Number(su.cantidad || 0) + cantidad }).eq('id', su.id)
        } else {
            await supabase.from('stock_ubicacion').insert({
                tipo_item: 'producto_terminado',
                item_id: l.producto_id,
                almacen_id: almacenId,
                cantidad,
                empresa_id: empresaId,
            })
        }

        await supabase.from('movimientos_inventario').insert({
            empresa_id: empresaId,
            tipo_item: 'producto_terminado',
            item_id: l.producto_id,
            item_nombre: l.nombre || prod.nombre || '',
            item_codigo: l.sku || prod.sku || '',
            tipo_movimiento: 'entrada',
            cantidad,
            stock_anterior: stockAnterior,
            stock_actual: nuevoStock,
            almacen_id: almacenId,
            origen: 'devolucion',
            fecha: new Date().toISOString(),
        })
    }
}

/**
 * Emite una nota de crédito / documento de devolución.
 *
 * `lineas` es un array de:
 *   { tipo_linea: 'producto', producto_id, cantidad, precio_unitario, aplica_iva, nombre?, sku? }
 *   { tipo_linea: 'valor',    concepto, cantidad: 1, precio_unitario, aplica_iva }
 *
 * Devuelve { data, error }. `data` es la fila de `devoluciones` creada.
 */
export async function crearNotaCredito({
    empresaId, usuarioId, clienteId,
    ventaId = null, solicitudId = null,
    origen = 'manual',
    motivo, motivoTipoId = null,
    tipoDevolucion = 'nota_credito',
    afectaInventario = false,
    generaCredito = true,
    almacenId = null,
    referenciaFiscal = null,
    fechaEmision = null,
    tasaCambio = null, tipoTasa = null,
    esTotal = false,
    // 'en_revision' cuando el monto supera el umbral de aprobación de la empresa
    // y quien emite no es aprobador. En ese estado la NC existe y tiene número,
    // pero no es crédito: las consultas de crédito filtran por
    // estado IN ('pendiente','parcial'), así que queda fuera hasta aprobarse.
    estadoInicial = 'pendiente',
    aprobadaPor = null,
    lineas = [],
}) {
    if (!lineas.length) return { data: null, error: { message: 'La nota de crédito no tiene líneas' } }
    if (afectaInventario && !almacenId) {
        return { data: null, error: { message: 'Falta el almacén destino para reingresar la mercancía' } }
    }

    const { subtotal, iva, total } = calcularTotalesNC(lineas)

    // Solo un documento que genera crédito consume número de la serie NC. Una
    // reposición de mercancía se registra igual, pero sin N° y sin aparecer en
    // el tab de NC ni en el selector del modal de cobro.
    let numeroNc = null
    if (generaCredito) {
        const { data } = await supabase.rpc('obtener_siguiente_nc_numero', { p_empresa_id: empresaId })
        numeroNc = data || null
    }

    const { data: nc, error } = await supabase.from('devoluciones').insert({
        empresa_id: empresaId,
        venta_id: ventaId,
        cliente_id: clienteId,
        solicitud_id: solicitudId,
        usuario_id: usuarioId,
        origen,
        motivo,
        motivo_tipo_id: motivoTipoId,
        tipo_devolucion: tipoDevolucion,
        afecta_inventario: afectaInventario,
        genera_credito: generaCredito,
        numero_nc: numeroNc,
        estado_nc: estadoInicial,
        aprobada_por: aprobadaPor,
        fecha_aprobacion: aprobadaPor ? new Date().toISOString() : null,
        // Necesario para poder revertir el reingreso si la NC se anula.
        almacen_id: afectaInventario ? almacenId : null,
        monto_devuelto: total,
        subtotal,
        iva,
        es_total: esTotal,
        referencia_fiscal: referenciaFiscal,
        ...(fechaEmision ? { fecha_emision: fechaEmision } : {}),
        tasa_cambio: tasaCambio,
        tipo_tasa: tipoTasa,
    }).select().single()

    if (error) return { data: null, error }

    const { error: errItems } = await supabase.from('devolucion_items').insert(
        lineas.map(l => ({
            devolucion_id: nc.id,
            empresa_id: empresaId,
            tipo_linea: l.tipo_linea || 'producto',
            producto_id: l.tipo_linea === 'valor' ? null : l.producto_id,
            concepto: l.tipo_linea === 'valor' ? l.concepto : null,
            cantidad_devuelta: Number(l.cantidad || 0),
            precio_unitario: Number(l.precio_unitario || 0),
            aplica_iva: !!l.aplica_iva,
        }))
    )
    if (errItems) return { data: nc, error: errItems }

    if (afectaInventario) {
        await reponerStock({ empresaId, almacenId, lineas })
    }

    return { data: nc, error: null }
}
