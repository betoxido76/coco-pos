// Trae TODAS las filas de una consulta, en bloques de 1000: la API de Supabase
// corta cada respuesta en ese tope. Se usa en las listas que ordenan y paginan
// en el navegador (para poder ordenar por cualquier columna, también las
// calculadas). `construir` devuelve la consulta ya filtrada y SIN .range(); se
// llama una vez por bloque. Conviene que lleve un .order() estable (p. ej. por
// id al final) para que los bloques no se pisen.
//
//   const filas = await traerTodas(() => supabase.from('mermas').select('*')
//       .eq('empresa_id', empresaId).order('created_at').order('id'))
// Igual que traerTodas pero devuelve { data, error } como una consulta normal de
// supabase-js: sirve para envolver una consulta existente sin tocar el código que
// la lee (destructuring, Promise.all, .then).
//
//   const { data } = await conTodas(() => supabase.from('productos_terminados').select('id, nombre').order('id'))
export async function conTodas(construir) {
    try { return { data: await traerTodas(construir), error: null } }
    catch (error) { return { data: null, error } }
}

export async function traerTodas(construir) {
    const filas = []
    for (let desde = 0; ; desde += 1000) {
        const { data, error } = await construir().range(desde, desde + 999)
        if (error) throw error
        filas.push(...(data || []))
        if (!data || data.length < 1000) return filas
    }
}
