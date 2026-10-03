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
import { moverStockLote } from './inventario'
import { precioBase, totalesDocumento, IVA_PCT } from './iva'

// El precio de la línea es base imponible. Solo una NC contra una factura
// anterior al cambio de convención hereda `precio_incluye_iva = true` de la
// línea original (docs/plan-iva-base-imponible.md).
export const baseDeLinea = (precio, aplicaIva, incluyeIva = false) =>
    precioBase(precio, aplicaIva, incluyeIva)

// `aplica_iva` es POR LÍNEA: en una misma NC conviven productos gravados y
// exentos, y una línea de valor puede ser cualquiera de las dos. El IVA se
// calcula una vez, sobre la base gravada total.
export function calcularTotalesNC(lineas) {
    return totalesDocumento(lineas.map(l => ({
        base: Number(l.cantidad || 0) * baseDeLinea(l.precio_unitario, l.aplica_iva, l.precio_incluye_iva),
        aplicaIva: !!l.aplica_iva,
    })))
}

// Reingreso de mercancía siguiendo la invariante de stock del proyecto
// (CLAUDE.md §15): leer stock_actual → actualizar producto → actualizar
// stock_ubicacion con SELECT+UPDATE/INSERT (nunca UPSERT con ON CONFLICT
// cuando almacen_ubicacion_id es NULL) → registrar el movimiento.
async function reponerStock({ usuarioId = null, almacenId, lineas }) {
    // El motor hace los 4 pasos en una transacción y salta los servicios, que
    // no llevan inventario. Antes esto estaba escrito a mano aquí, y su
    // consulta a stock_ubicacion no filtraba por empresa_id.
    const items = (lineas || [])
        .filter(l => l.tipo_linea !== 'valor' && l.producto_id && Number(l.cantidad || 0) > 0)
        .map(l => ({
            tipo_item: 'producto_terminado',
            item_id: l.producto_id,
            cantidad: Number(l.cantidad),
        }))
    if (items.length === 0) return

    await moverStockLote({
        items, tipoMovimiento: 'entrada', origen: 'devolucion',
        almacenId, usuarioId, notas: 'Reposición por nota de crédito',
    })
}

/**
 * Emite una nota de crédito / documento de devolución.
 *
 * `lineas` es un array de:
 *   { tipo_linea: 'producto', producto_id, cantidad, precio_unitario, aplica_iva, precio_incluye_iva?, nombre?, sku? }
 *   { tipo_linea: 'valor',    concepto, cantidad: 1, precio_unitario, aplica_iva }
 * precio_unitario es base; precio_incluye_iva solo al heredar de una factura vieja.
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

    const { subtotal, iva, total, base_gravada, base_exenta } = calcularTotalesNC(lineas)

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
        base_gravada,
        base_exenta,
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
            iva_pct: l.aplica_iva ? IVA_PCT : 0,
            precio_incluye_iva: !!l.precio_incluye_iva,
        }))
    )
    if (errItems) return { data: nc, error: errItems }

    if (afectaInventario) {
        await reponerStock({ usuarioId, almacenId, lineas })
    }

    return { data: nc, error: null }
}
