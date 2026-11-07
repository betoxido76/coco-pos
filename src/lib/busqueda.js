// Barra de búsqueda estilo Odoo — lógica sin pantalla (docs/plan-barra-busqueda.md).
// La usan src/components/BarraBusqueda.jsx y la pantalla que la monta (hoy CxC).
//
// Configuración de campos de una pantalla:
//   {
//     campo: 'cliente',              // clave
//     etiqueta: 'Cliente',
//     valor: fila => id | null,      // clave del valor (filtrar y agrupar). null = "Sin <etiqueta>"
//     etiquetaValor: (valor, fila) => 'Nombre',   // texto que se muestra (por defecto, el valor)
//     texto: fila => 'texto',        // lo que se busca al escribir (campos buscables)
//     filtrable, agrupable, buscable, comun,      // en qué columnas del panel aparece
//     orden: ['a', 'b'] | 'desc',    // orden de los valores: fijo, alfabético desc (meses) o alfabético
//     nivelCliente: true,            // atributo del cliente (sirve para filtrar el saldo a favor)
//   }
//
// Estado de una búsqueda:
//   { filtros: { campo: [valor, …] }, textos: [{ campo, texto }], agrupar: [campo, …] }
// Dentro de un campo los valores se suman (o); entre campos se cruzan (y).

export const NULO = '__nulo__'
export const MAX_NIVELES = 3

export const busquedaVacia = () => ({ filtros: {}, textos: [], agrupar: [] })

export const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

export function claveDe(def, fila) {
    const v = def.valor(fila)
    return v == null || v === '' ? NULO : String(v)
}

export function etiquetaDe(def, clave, fila) {
    if (clave === NULO) return `Sin ${def.etiqueta.toLowerCase()}`
    return def.etiquetaValor ? (def.etiquetaValor(clave, fila) ?? clave) : clave
}

export const hayBusqueda = (b) => Object.values(b.filtros).some(v => v.length) || b.textos.length > 0

// ¿La fila pasa la búsqueda? `excepto` ignora el filtro de ese campo (para contar sus valores).
export function pasa(fila, b, campos, excepto = null) {
    for (const [campo, vals] of Object.entries(b.filtros)) {
        if (campo === excepto || !vals.length) continue
        const def = campos.find(c => c.campo === campo)
        if (!def) continue
        if (!vals.includes(claveDe(def, fila))) return false
    }
    if (b.textos.length) {
        const porCampo = {}
        for (const t of b.textos) (porCampo[t.campo] = porCampo[t.campo] || []).push(normalizar(t.texto))
        for (const [campo, textos] of Object.entries(porCampo)) {
            const lectores = campo === 'todo'
                ? campos.filter(c => c.buscable).map(c => c.texto || c.valor)
                : [(campos.find(c => c.campo === campo) || {}).texto].filter(Boolean)
            const contenido = lectores.map(l => normalizar(l(fila))).join(' ')
            if (!textos.some(t => contenido.includes(t))) return false
        }
    }
    return true
}

export const filtrar = (filas, b, campos) => filas.filter(f => pasa(f, b, campos))

// Solo los filtros de atributos del cliente (para filas que no son notas, p. ej. NC)
export function soloNivelCliente(b, campos) {
    const filtros = {}
    for (const [campo, vals] of Object.entries(b.filtros)) {
        if (campos.find(c => c.campo === campo)?.nivelCliente) filtros[campo] = vals
    }
    return { filtros, textos: [], agrupar: [] }
}

function ordenarValores(lista, def) {
    if (Array.isArray(def.orden)) {
        const pos = v => { const i = def.orden.indexOf(v.valor); return i < 0 ? 999 : i }
        return lista.sort((a, b) => pos(a) - pos(b))
    }
    const alfa = (a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es', { numeric: true, sensitivity: 'base' })
    return lista.sort((a, b) => {
        if (a.valor === NULO || b.valor === NULO) return a.valor === NULO ? 1 : -1   // "Sin …" al final
        return def.orden === 'desc' ? -alfa(a, b) : alfa(a, b)
    })
}

// Valores de un campo con cuántas filas quedan con el resto de los filtros. Los
// valores ya elegidos aparecen aunque queden en 0 (para poder quitarlos).
export function contarValores(filas, b, campos, campo) {
    const def = campos.find(c => c.campo === campo)
    const m = new Map()
    for (const f of filas) {
        if (!pasa(f, b, campos, campo)) continue
        const k = claveDe(def, f)
        const e = m.get(k)
        if (e) e.n++
        else m.set(k, { valor: k, etiqueta: etiquetaDe(def, k, f), n: 1 })
    }
    for (const k of b.filtros[campo] || []) {
        if (!m.has(k)) m.set(k, { valor: k, etiqueta: etiquetaDe(def, k, null), n: 0 })
    }
    return ordenarValores([...m.values()], def)
}

// ¿El campo tiene algún dato en estas filas? (los vacíos no se ofrecen)
export const tieneDatos = (filas, def) => filas.some(f => claveDe(def, f) !== NULO)

// Árbol de grupos. `sumar(filas)` devuelve los subtotales de un grupo; `ordenGrupos`
// compara dos grupos (por defecto, por etiqueta). Las filas conservan su orden.
//   [{ clave: 'cliente:abc', campo, valor, etiqueta, n, sumas, hijos | filas }]
export function agrupar(filas, niveles, campos, sumar, ordenGrupos, prefijo = '') {
    if (!niveles.length) return null
    const [campo, ...resto] = niveles
    const def = campos.find(c => c.campo === campo)
    const m = new Map()
    for (const f of filas) {
        const k = claveDe(def, f)
        let g = m.get(k)
        if (!g) { g = { campo, valor: k, etiqueta: etiquetaDe(def, k, f), filas: [] }; m.set(k, g) }
        g.filas.push(f)
    }
    const grupos = [...m.values()].map(g => {
        const clave = `${prefijo}${campo}:${g.valor}`
        const hijos = resto.length ? agrupar(g.filas, resto, campos, sumar, ordenGrupos, `${clave}/`) : null
        return { ...g, clave, n: g.filas.length, sumas: sumar(g.filas), hijos }
    })
    const porDefecto = (a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es', { numeric: true })
    return grupos.sort(ordenGrupos || porDefecto)
}

// Todas las claves de un árbol (para "Abrir todo")
export function clavesDe(grupos, acc = []) {
    for (const g of grupos || []) { acc.push(g.clave); clavesDe(g.hijos, acc) }
    return acc
}

// Backspace con la barra vacía: quita la última etiqueta (agrupación, luego textos, luego filtros)
export function quitarUltima(b) {
    if (b.agrupar.length) return { ...b, agrupar: [] }
    if (b.textos.length) {
        const ult = b.textos[b.textos.length - 1].campo
        return { ...b, textos: b.textos.filter(t => t.campo !== ult) }
    }
    const conValores = Object.keys(b.filtros).filter(k => b.filtros[k].length)
    if (conValores.length) {
        const f = { ...b.filtros }
        delete f[conValores[conValores.length - 1]]
        return { ...b, filtros: f }
    }
    return b
}

export function alternarValor(b, campo, valor) {
    const act = b.filtros[campo] || []
    const sig = act.includes(valor) ? act.filter(v => v !== valor) : [...act, valor]
    const filtros = { ...b.filtros }
    if (sig.length) filtros[campo] = sig; else delete filtros[campo]
    return { ...b, filtros }
}

export function alternarNivel(b, campo) {
    return b.agrupar.includes(campo)
        ? { ...b, agrupar: b.agrupar.filter(c => c !== campo) }
        : b.agrupar.length >= MAX_NIVELES ? b : { ...b, agrupar: [...b.agrupar, campo] }
}

// ── Favoritos (en el navegador; localStorage puede fallar en ventana privada) ──
export function leerFavoritos(clave) {
    try { const l = JSON.parse(localStorage.getItem(clave) || '[]'); return Array.isArray(l) ? l : [] }
    catch { return [] }
}

export function guardarFavoritos(clave, lista) {
    try { localStorage.setItem(clave, JSON.stringify(lista)); return true }
    catch { return false }
}

// ── Campos que se repiten en varias pantallas ──
export const TRAMOS_VENCIMIENTO = [['por_vencer', 'Por vencer'], ['1_30', '1–30 días'], ['31_60', '31–60 días'], ['61_90', '61–90 días'], ['mas_90', 'Más de 90 días']]

// Fecha local AAAA-MM-DD: una columna date viene tal cual; un timestamp se lleva a hora de Caracas
export function fechaLocal(v) {
    if (!v) return null
    const s = String(v)
    if (s.length === 10) return s
    const d = new Date(s)
    return isNaN(d) ? null : d.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' })
}

export function tramoVencimiento(fecha) {
    const ymd = fechaLocal(fecha)
    if (!ymd) return null
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const dias = Math.round((hoy - new Date(ymd + 'T00:00:00')) / 86400000)
    return dias <= 0 ? 'por_vencer' : dias <= 30 ? '1_30' : dias <= 60 ? '31_60' : dias <= 90 ? '61_90' : 'mas_90'
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export const etiquetaMes = (aaaamm) => { const [a, m] = String(aaaamm).split('-'); return `${MESES_CORTOS[Number(m) - 1] || m} ${a}` }

// Campo "Vencimiento" por tramos. `leer(fila)` devuelve la fecha de vencimiento.
export const campoVencimiento = (leer, extra = {}) => ({
    campo: 'vencimiento', etiqueta: 'Vencimiento', valor: f => tramoVencimiento(leer(f)),
    etiquetaValor: k => (TRAMOS_VENCIMIENTO.find(t => t[0] === k) || [k, k])[1], orden: TRAMOS_VENCIMIENTO.map(t => t[0]),
    filtrable: true, agrupable: true, comun: true, ...extra,
})

// Campo de mes (AAAA-MM), del más reciente al más viejo. `leer(fila)` devuelve la fecha.
export const campoMes = (leer, etiqueta = 'Mes', extra = {}) => ({
    campo: 'mes', etiqueta, valor: f => fechaLocal(leer(f))?.slice(0, 7) || null, etiquetaValor: etiquetaMes, orden: 'desc',
    filtrable: true, agrupable: true, ...extra,
})
