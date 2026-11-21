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

// Texto corto de la equivalencia: "= 2.000 ml"
export function textoFactor(factor, unidad) {
    const n = Number(factor)
    if (!(n > 0)) return ''
    return `= ${n.toLocaleString('es-VE', { maximumFractionDigits: 6 })} ${unidad || ''}`.trim()
}
