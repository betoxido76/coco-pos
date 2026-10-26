// Lectura del VIN como TEXTO con Tesseract.js (OCR gratis, corre en el teléfono).
// Menos preciso que una IA de visión: sirve con texto impreso nítido (etiquetas,
// documentos) y le cuesta con letras grabadas en metal o con reflejos.
// La primera vez descarga el motor y el idioma (~5 MB) desde el CDN de jsdelivr.
import { validarVin } from './vin'

// Un VIN no usa I, O ni Q: se le prohíben al OCR para que no las confunda con 1 y 0
const PERMITIDOS = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ'

let trabajador = null
async function obtenerTrabajador(alProgreso) {
    if (!trabajador) {
        const { createWorker } = await import('tesseract.js')
        trabajador = await createWorker('eng', 1, {
            logger: m => { if (m.status === 'recognizing text') alProgreso?.(m.progress) },
        })
        await trabajador.setParameters({
            tessedit_char_whitelist: PERMITIDOS,
            tessedit_pageseg_mode: '11', // texto disperso: el VIN suele estar entre otros datos
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

// Candidatos a VIN en el texto leído, del más probable al menos:
// una línea o palabra de exactamente 17 caracteres pesa más que un trozo de 17
// dentro de algo más largo, y el dígito verificador correcto suma.
export function candidatosVin(texto) {
    const puntaje = new Map()
    const sumar = (vin, p) => {
        const v = validarVin(vin)
        if (!v.valido) return
        const total = p + (v.digito_ok === true ? 3 : v.digito_ok === false ? -1 : 0)
        puntaje.set(vin, Math.max(puntaje.get(vin) ?? -Infinity, total))
    }
    for (const linea of (texto || '').toUpperCase().split('\n')) {
        for (const palabra of linea.split(/\s+/)) if (palabra.length === 17) sumar(palabra, 3)
        const junta = linea.replace(/[^A-Z0-9]/g, '')
        if (junta.length === 17) sumar(junta, 2)
        for (let i = 0; i + 17 <= junta.length; i++) sumar(junta.slice(i, i + 17), 0)
    }
    return [...puntaje.entries()].sort((a, b) => b[1] - a[1]).map(([vin]) => vin)
}

// Devuelve { candidatos, texto, confianza } (confianza 0-100 de Tesseract)
export async function leerVinConOcr(bitmap, alProgreso) {
    const w = await obtenerTrabajador(alProgreso)
    let ultimo = null
    for (const invertir of [false, true]) {
        const { data } = await w.recognize(prepararCanvas(bitmap, invertir))
        const candidatos = candidatosVin(data.text)
        ultimo = { candidatos, texto: data.text.trim(), confianza: Math.round(data.confidence) }
        if (candidatos.length) return ultimo
    }
    return ultimo
}
