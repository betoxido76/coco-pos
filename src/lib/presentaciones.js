// Presentaciones de compra de un insumo (docs/plan-presentaciones-insumos.md).
// Un insumo vive en su unidad base (unidad_medida: g, ml, unidad…); cada
// presentación es una forma de comprarlo con su factor: "Botella 2 L" = 2.000 ml.
// Un insumo sin presentaciones funciona como siempre.
import { supabase } from './supabaseClient'

// tipo_insumo de insumo_presentaciones (singular, como el motor de inventario)
export const TIPO_PRESENTACION = {
    materias_primas: 'materia_prima',
    materiales_empaque: 'material_empaque',
    consumibles: 'consumible',
    materia_prima: 'materia_prima',
    material_empaque: 'material_empaque',
    empaque: 'material_empaque',
    consumible: 'consumible',
}

const CAMPOS = 'id, tipo_insumo, insumo_id, nombre, factor, marca, proveedor_id, codigo_barras, activa'

export async function cargarPresentaciones(empresaId, tipoInsumo, insumoId) {
    const { data, error } = await supabase.from('insumo_presentaciones').select(CAMPOS)
        .eq('empresa_id', empresaId).eq('tipo_insumo', TIPO_PRESENTACION[tipoInsumo] || tipoInsumo)
        .eq('insumo_id', insumoId).order('factor').order('nombre')
    if (error) throw error
    return data || []
}

// Presentaciones ACTIVAS de una lista de tipos, agrupadas por insumo_id
export async function presentacionesPorInsumo(empresaId, tipos) {
    const { data, error } = await supabase.from('insumo_presentaciones').select(CAMPOS)
        .eq('empresa_id', empresaId).eq('activa', true)
        .in('tipo_insumo', tipos.map(t => TIPO_PRESENTACION[t] || t))
        .order('factor').order('nombre')
    if (error) throw error
    const mapa = {}
    for (const p of data || []) (mapa[p.insumo_id] ||= []).push(p)
    return mapa
}

// Fila de edición: `_key` estable para React; `id` solo si ya está guardada
let seq = 0
export function filaNueva() {
    return { _key: `n${++seq}`, id: null, nombre: '', factor: '', marca: '', proveedor_id: '', codigo_barras: '', activa: true }
}
export function aFilas(lista) {
    return (lista || []).map(p => ({
        _key: p.id, id: p.id, nombre: p.nombre || '', factor: p.factor != null ? String(Number(p.factor)) : '',
        marca: p.marca || '', proveedor_id: p.proveedor_id || '', codigo_barras: p.codigo_barras || '', activa: p.activa ?? true,
    }))
}

// Devuelve un mensaje de error o '' si las filas son válidas
export function validarPresentaciones(filas) {
    const vistos = new Set()
    for (const f of filas) {
        const nombre = f.nombre.trim()
        if (!nombre) return 'Cada presentación necesita un nombre (ej. "Botella 2 L").'
        const factor = Number(f.factor)
        if (!(factor > 0)) return `La presentación "${nombre}" necesita un factor mayor que cero.`
        const k = nombre.toLowerCase()
        if (vistos.has(k)) return `La presentación "${nombre}" está repetida.`
        vistos.add(k)
    }
    return ''
}

// Inserta las nuevas, actualiza las que cambiaron y borra las nuevas que se
// quitaron antes de guardar. Las ya guardadas no se borran: se desactivan
// (pueden estar en compras y las líneas guardan su foto).
export async function guardarPresentaciones({ empresaId, tipoInsumo, insumoId, filas, originales, usuarioId }) {
    const tipo = TIPO_PRESENTACION[tipoInsumo] || tipoInsumo
    const orig = Object.fromEntries((originales || []).map(p => [p.id, p]))
    const limpiar = f => ({
        nombre: f.nombre.trim(),
        factor: Number(f.factor),
        marca: f.marca.trim() || null,
        proveedor_id: f.proveedor_id || null,
        codigo_barras: f.codigo_barras.trim() || null,
        activa: !!f.activa,
    })

    for (const f of filas) {
        const datos = limpiar(f)
        if (!f.id) {
            const { error } = await supabase.from('insumo_presentaciones').insert({
                ...datos, empresa_id: empresaId, tipo_insumo: tipo, insumo_id: insumoId, creado_por: usuarioId || null,
            })
            if (error) throw traducir(error, datos.nombre)
            continue
        }
        const o = orig[f.id]
        const cambio = !o || o.nombre !== datos.nombre || Number(o.factor) !== datos.factor
            || (o.marca || null) !== datos.marca || (o.proveedor_id || null) !== datos.proveedor_id
            || (o.codigo_barras || null) !== datos.codigo_barras || (o.activa ?? true) !== datos.activa
        if (!cambio) continue
        // Solo se envían los campos que cambiaron: así un factor sin tocar no
        // dispara el candado de "factor ya usado en compras"
        const patch = {}
        for (const k of Object.keys(datos)) {
            const antes = k === 'factor' ? Number(o?.factor) : (o?.[k] ?? (k === 'activa' ? true : null))
            if (antes !== datos[k]) patch[k] = datos[k]
        }
        const { error } = await supabase.from('insumo_presentaciones').update(patch)
            .eq('id', f.id).eq('empresa_id', empresaId)
        if (error) throw traducir(error, datos.nombre)
    }
}

function traducir(error, nombre) {
    if (error.code === '23505') return new Error(`Ya existe una presentación llamada "${nombre}" para este insumo.`)
    return new Error(error.message)
}

// ── Líneas de compra (OC, recepción) ────────────────────────────────────────
// En memoria, `cantidad` y `precio_unitario` de la línea están en la unidad
// ELEGIDA: la presentación (si hay `presentacion_id`) o la unidad base. Así
// cantidad × precio (y los totales de iva.js) no cambian. La conversión a
// unidad base se hace solo al guardar (lineaCompraBD) y la repite el trigger
// linea_presentacion_cuadra en la base.
export const factorLinea = (item) => (item?.presentacion_id && Number(item.factor) > 0 ? Number(item.factor) : 1)

// Precio por unidad base (para costos del catálogo)
export const precioBaseLinea = (item) => Number(item?.precio_unitario || 0) / factorLinea(item)

// Cambia la presentación de una línea: la cantidad se mantiene (ahora en la
// nueva presentación) y el precio se convierte para que el costo por unidad
// base no cambie. pres = null → unidad base.
export function aplicarPresentacion(item, pres) {
    const precioBase = precioBaseLinea(item)
    if (!pres) return { ...item, presentacion_id: null, presentacion_nombre: null, factor: null, precio_unitario: redondear(precioBase, 6) }
    const factor = Number(pres.factor)
    return { ...item, presentacion_id: pres.id, presentacion_nombre: pres.nombre, factor, precio_unitario: redondear(precioBase * factor, 6) }
}

// Campos de la línea para la base. `campos` permite los nombres de la OC.
export function lineaCompraBD(item, { campoCantidad = 'cantidad', campoPrecio = 'precio_unitario' } = {}) {
    const cant = Number(item.cantidad || 0)
    const precio = Number(item.precio_unitario || 0)
    const f = factorLinea(item)
    if (f === 1 && !item.presentacion_id) {
        return { [campoCantidad]: cant, [campoPrecio]: precio, presentacion_id: null, cantidad_presentacion: null, precio_presentacion: null, factor: null }
    }
    return {
        [campoCantidad]: redondear(cant * f, 4),
        [campoPrecio]: redondear(precio / f, 10),
        presentacion_id: item.presentacion_id,
        cantidad_presentacion: cant,
        precio_presentacion: precio,
        factor: f,
    }
}

// Línea leída de la base → línea en memoria (en su presentación si la tiene)
export function lineaDesdeBD({ cantidadBase, precioBase, presentacion_id, presentacion_nombre, factor, cantidad_presentacion, precio_presentacion }) {
    if (presentacion_id && Number(factor) > 0) {
        const f = Number(factor)
        return {
            presentacion_id, presentacion_nombre, factor: f,
            cantidad: cantidad_presentacion != null ? Number(cantidad_presentacion) : redondear(Number(cantidadBase || 0) / f, 4),
            precio_unitario: precio_presentacion != null ? Number(precio_presentacion) : redondear(Number(precioBase || 0) * f, 6),
        }
    }
    return { presentacion_id: null, presentacion_nombre: null, factor: null, cantidad: Number(cantidadBase || 0), precio_unitario: Number(precioBase || 0) }
}

// "= 6.000 ml" para mostrar bajo la cantidad de una línea con presentación
export function equivalenciaLinea(item, unidad) {
    const f = factorLinea(item)
    if (f === 1 && !item?.presentacion_id) return ''
    return textoFactor(Number(item.cantidad || 0) * f, unidad)
}

// "3 × Botella 2 L" para documentos guardados (compra_items / orden_compra_items)
export function textoPresentacionGuardada(linea) {
    if (!linea?.presentacion_id && linea?.cantidad_presentacion == null) return ''
    const n = Number(linea.cantidad_presentacion || 0).toLocaleString('es-VE', { maximumFractionDigits: 4 })
    return `${n} × ${linea.presentacion_nombre || 'presentación'}`
}

function redondear(n, dec) {
    const p = 10 ** dec
    return Math.round(Number(n || 0) * p) / p
}

// Texto corto de la equivalencia: "= 2.000 ml"
export function textoFactor(factor, unidad) {
    const n = Number(factor)
    if (!(n > 0)) return ''
    return `= ${n.toLocaleString('es-VE', { maximumFractionDigits: 6 })} ${unidad || ''}`.trim()
}
