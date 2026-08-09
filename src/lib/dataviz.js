// Formato y paleta compartidos por los tabs del Dashboard.

export const fmt = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const fmtNum = n => Number(n || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })
export const fmtPct = n => `${(Number(n || 0) * 100).toFixed(1)}%`

// Paleta categórica CVD-safe sobre fondo claro. Verificada con el validador de
// la guía de dataviz: los 6 primeros pasan los seis checks (banda de luminosidad,
// croma, separación CVD, piso de visión normal, contraste).
//
// A partir del 7º hue el par #e87ba4↔#e34948 cae a ΔE 13.2 en visión normal, por
// debajo del piso de 15: no usar más de 6 categorías. Lo que sobra va a "Otros"
// en gris neutro, que no es un hue categórico y por eso no entra en el conteo.
export const COLORES = ['#2a78d6', '#1baf7a', '#eda100', '#008300', '#4a3aa7', '#e34948']
export const MAX_CATEGORIAS = 6
export const GRIS_OTROS = '#898781'
export const ROJO = '#e34948'

// Los hues se asignan en orden fijo, nunca ciclados: el color sigue a la entidad
// y no a su posición en el ranking, así un filtro no repinta las series.
export const colorCategoria = (i, esOtros = false) =>
    esOtros || i >= MAX_CATEGORIAS ? GRIS_OTROS : COLORES[i]

// Agrupa en "Otros" lo que exceda las 6 categorías, ordenando por valor.
export function agruparTop({ entradas, limite = MAX_CATEGORIAS }) {
    const orden = [...entradas].sort((a, b) => b.value - a.value)
    if (orden.length <= limite) return orden
    const top = orden.slice(0, limite - 1)
    const resto = orden.slice(limite - 1)
    return [...top, { name: 'Otros', value: resto.reduce((s, e) => s + e.value, 0), _otros: true }]
}
