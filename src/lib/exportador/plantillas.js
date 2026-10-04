// Plantillas del exportador (exportador_fase4_plantillas.sql).
// Guardan fuente, detalle, campos en orden, formato e "incluir anulados";
// los filtros siempre salen del Dashboard al exportar.
import { supabase } from '../supabaseClient'

const COLUMNAS = 'id, usuario_id, nombre, fuente, modo, campos, formato, incluir_anulados, alcance, updated_at, usuarios(nombre)'

// RLS ya filtra: las de la empresa + las personales propias
export async function listarPlantillas(empresaId) {
    const { data, error } = await supabase.from('plantillas_exportacion')
        .select(COLUMNAS).eq('empresa_id', empresaId).order('nombre')
    if (error) throw error
    return data || []
}

export async function crearPlantilla(empresaId, p) {
    const { data, error } = await supabase.from('plantillas_exportacion')
        .insert({ empresa_id: empresaId, ...p }).select(COLUMNAS).single()
    if (error) throw error
    return data
}

export async function actualizarPlantilla(id, empresaId, p) {
    // .select() para saber si RLS dejó modificarla (0 filas = sin permiso)
    const { data, error } = await supabase.from('plantillas_exportacion')
        .update(p).eq('id', id).eq('empresa_id', empresaId).select(COLUMNAS)
    if (error) throw error
    if (!data?.length) throw new Error('No tienes permiso para modificar esta plantilla')
    return data[0]
}

export async function eliminarPlantilla(id, empresaId) {
    const { data, error } = await supabase.from('plantillas_exportacion')
        .delete().eq('id', id).eq('empresa_id', empresaId).select('id')
    if (error) throw error
    if (!data?.length) throw new Error('No tienes permiso para eliminar esta plantilla')
}

// Misma regla que las políticas: el creador, o un admin si es de la empresa
export const puedeEditarPlantilla = (p, perfil) =>
    !!p && (p.usuario_id === perfil?.id || (p.alcance === 'empresa' && ['admin', 'superadmin'].includes(perfil?.rol)))
