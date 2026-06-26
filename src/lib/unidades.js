// Catálogo único de unidades de medida.
// Fuente de verdad compartida por todos los maestros y formularios que
// editan `unidad_medida` / `unidad`. Antes cada pantalla tenía su propia
// lista hardcodeada y desincronizada (kg en una, faltaba en otra), y los
// valores fuera de catálogo (ej. "Gramos" de migraciones) caían en silencio
// en la primera opción del <select>, ocultando el valor real.
export const UNIDADES = [
  'unidad', 'kg', 'g', 'litro', 'ml',
  'caja', 'bolsa', 'rollo', 'metro',
  'paquete', 'par', 'juego', 'otro',
]

// Opciones para un <select> de unidad. Si `actual` no está en el catálogo
// (valor legado/migrado), lo incluye al inicio para que el dropdown muestre
// el valor real en vez de aparentar otra unidad. Marca el valor fuera de
// catálogo para que sea evidente que hay que corregirlo.
export function opcionesUnidad(actual) {
  if (actual && !UNIDADES.includes(actual)) {
    return [{ value: actual, label: `${actual} (no estándar)` }, ...UNIDADES.map(u => ({ value: u, label: u }))]
  }
  return UNIDADES.map(u => ({ value: u, label: u }))
}
