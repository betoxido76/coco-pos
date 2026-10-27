// Lectura del VIN como TEXTO con Tesseract.js (OCR gratis, corre en el teléfono).
// Menos preciso que una IA de visión: sirve con texto impreso nítido (etiquetas,
// documentos) y le cuesta con letras grabadas en metal o con reflejos.
// La primera vez descarga el motor y el idioma (~5 MB) desde el CDN de jsdelivr.
import { validarVin } from './vin'

// Pasadas, de la más confiable a la de último recurso. Leer libre y corregir
// después rinde mucho más que prohibirle letras al OCR: con la lista de
// permitidos la confianza caía de ~87 % a ~12 % en una etiqueta de prueba.
const PASADAS = [
    { invertir: false, params: { tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' } },  // página normal
    { invertir: false, params: { tessedit_pageseg_mode: '11', tessedit_char_whitelist: '' } }, // texto disperso
    { invertir: true, params: { tessedit_pageseg_mode: '3', tessedit_char_whitelist: '' } },   // texto claro sobre oscuro
    { invertir: false, params: { tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789ABCDEFGHJKLMNPRSTUVWXYZ' } },
]

let trabajador = null
let alProgresoActual = null
async function obtenerTrabajador() {
    if (!trabajador) {
        const { createWorker } = await import('tesseract.js').catch(async () => {
            await new Promise(r => setTimeout(r, 1500)) // un reintento: datos móviles
            return import('tesseract.js')
        })
        trabajador = await createWorker('eng', 1, {
            logger: m => { if (m.status === 'recognizing text') alProgresoActual?.(m.progress) },
        })
    }
    return trabajador
}

// Escala de grises con contraste estirado; invertir sirve para texto claro sobre fondo oscuro
function prepararCanvas(bitmap, invertir) {
    const escala = Math.min(2, 2000 / Math.max(bitmap.width, bitmap.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bitmap.width * escala)
    c.height = Math.round(bitmap.height * escala)
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, c.width, c.height)
    const img = ctx.getImageData(0, 0, c.width, c.height)
    const d = img.data
    let min = 255, max = 0
    for (let i = 0; i < d.length; i += 4) {
        const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
        d[i] = g
        if (g < min) min = g
        if (g > max) max = g
    }
    const rango = Math.max(1, max - min)
    for (let i = 0; i < d.length; i += 4) {
        let g = Math.round(((d[i] - min) * 255) / rango)
        if (invertir) g = 255 - g
        d[i] = d[i + 1] = d[i + 2] = g
    }
    ctx.putImageData(img, 0, 0)
    return c
}

// Un VIN no usa I, O ni Q: el OCR las confunde con 1 y 0
const corregir = s => s.toUpperCase().replace(/[OQ]/g, '0').replace(/I/g, '1')

// Candidatos a VIN en el texto leído, del más probable al menos:
// una palabra o línea de exactamente 17 caracteres pesa más que un trozo de 17
// dentro de algo más largo, y el dígito verificador correcto suma.
export function candidatosVin(texto) {
    const puntaje = new Map()
    const sumar = (vin, p) => {
        const v = validarVin(vin)
        if (!v.valido) return
        const total = p + (v.digito_ok === true ? 3 : v.digito_ok === false ? -1 : 0)
        puntaje.set(vin, Math.max(puntaje.get(vin) ?? -Infinity, total))
    }
    for (const linea of corregir(texto || '').split('\n')) {
        for (const palabra of linea.split(/\s+/)) {
            const p = palabra.replace(/[^A-Z0-9]/g, '')
            if (p.length === 17) sumar(p, 3)
            else if (p.length === 20 && p.startsWith('V1N')) sumar(p.slice(3), 3) // "VIN" pegado al número
        }
        const junta = linea.replace(/[^A-Z0-9]/g, '')
        if (junta.length === 17) sumar(junta, 2)
        for (let i = 0; i + 17 <= junta.length; i++) sumar(junta.slice(i, i + 17), 0)
    }
    // Un trozo de 17 dentro de algo más largo solo vale si su dígito verificador cuadra
    // (puntaje 3); sin eso suele ser basura ("1N1HGCMB82633A004")
    return [...puntaje.entries()].filter(([, p]) => p >= 1).sort((a, b) => b[1] - a[1]).map(([vin]) => vin)
}

// Sin VIN completo: la palabra que más se le parece (10+ caracteres, cerca de 17,
// con letras y números), para dejarla en la casilla y corregirla a mano
export function mejorParcial(texto) {
    let mejor = ''
    for (const palabra of corregir(texto || '').split(/\s+/)) {
        const p = palabra.replace(/[^A-Z0-9]/g, '')
        if (p.length < 10 || !/\d/.test(p) || !/[A-Z]/.test(p)) continue
        if (!mejor || Math.abs(p.length - 17) < Math.abs(mejor.length - 17)) mejor = p
    }
    return mejor
}

// Devuelve { candidatos, parcial, texto, confianza } (confianza 0-100 de Tesseract)
export async function leerVinConOcr(bitmap, alProgreso) {
    const w = await obtenerTrabajador()
    const textos = []
    let confianza = 0
    try {
        for (const [i, pasada] of PASADAS.entries()) {
            alProgresoActual = p => alProgreso?.((i + p) / PASADAS.length)
            await w.setParameters(pasada.params)
            const { data } = await w.recognize(prepararCanvas(bitmap, pasada.invertir))
            textos.push(data.text.trim())
            confianza = Math.max(confianza, Math.round(data.confidence))
            const candidatos = candidatosVin(data.text)
            if (candidatos.length) return { candidatos, parcial: '', texto: data.text.trim(), confianza: Math.round(data.confidence) }
        }
    } finally {
        alProgresoActual = null
    }
    const todo = textos.join('\n')
    return { candidatos: [], parcial: mejorParcial(todo), texto: textos[0] || '', confianza }
}
