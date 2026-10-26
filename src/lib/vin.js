// VIN (serial de carrocería, ISO 3779): 17 caracteres sin I, O ni Q.
// Misma lógica en supabase/functions/leer-vin/index.ts.

const TRANSLIT = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const PESOS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

export function normalizarVin(v) {
    return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// digito_ok: true/false, o null si no aplica (VIN inválido o vehículo fuera del
// mercado norteamericano, donde el dígito verificador no es obligatorio)
export function validarVin(v) {
    const vin = normalizarVin(v)
    const valido = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin)
    if (!valido || !/^[1-5]/.test(vin)) return { vin, valido, digito_ok: null }
    const suma = [...vin].reduce((s, c, i) => s + (/\d/.test(c) ? Number(c) : TRANSLIT[c]) * PESOS[i], 0)
    const resto = suma % 11
    return { vin, valido, digito_ok: (resto === 10 ? 'X' : String(resto)) === vin[8] }
}

// Busca un VIN dentro del texto de un código de barras (a veces trae un prefijo,
// p. ej. la "I" de importación en Code 39)
export function vinEnTexto(texto) {
    const limpio = (texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    for (let i = 0; i + 17 <= limpio.length; i++) {
        const c = limpio.slice(i, i + 17)
        if (/^[A-HJ-NPR-Z0-9]{17}$/.test(c)) return c
    }
    return null
}
