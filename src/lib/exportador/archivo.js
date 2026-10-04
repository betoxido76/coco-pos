// Exportador: consulta paginada de la vista y armado del archivo (XLSX/CSV/TXT).
// docs/plan-exportador.md

import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { FUENTES } from './catalogo'

const PAGE = 1000

// filtros: { empresaId, desde, hasta, cliente, canal, vendedor, producto, incluirAnulados }
// Las fechas se filtran igual que el Dashboard (created_at entre desde 00:00 y
// hasta 23:59:59.999) para que el archivo cuadre con sus indicadores.
function aplicarFiltros(q, fuente, modo, f) {
    const m = fuente.filtros
    q = q.eq('empresa_id', f.empresaId)
    if (f.desde) q = q.gte(m.fechaCol, f.desde + 'T00:00:00')
    if (f.hasta) q = q.lte(m.fechaCol, f.hasta + 'T23:59:59.999')
    if (f.cliente && m.cliente) q = q.eq(m.cliente, f.cliente)
    if (f.canal && m.canal) q = q.eq(m.canal, f.canal)
    if (f.vendedor && m.vendedor) q = q.eq(m.vendedor, f.vendedor)
    if (f.producto && m.producto?.[modo]) {
        const { col, op } = m.producto[modo]
        q = op === 'contains' ? q.contains(col, [f.producto]) : q.eq(col, f.producto)
    }
    if (!f.incluirAnulados && m.anulados) q = q.eq(m.anulados, false)
    return q
}

export async function contarFilas(fuenteKey, modo, filtros) {
    const fuente = FUENTES[fuenteKey]
    let q = supabase.from(fuente.vistas[modo].vista).select('*', { count: 'exact', head: true })
    q = aplicarFiltros(q, fuente, modo, filtros)
    const { count, error } = await q
    if (error) throw error
    return count || 0
}

export async function descargarFilas(fuenteKey, modo, columnas, filtros, onProgreso) {
    const fuente = FUENTES[fuenteKey]
    const { vista, orden } = fuente.vistas[modo]
    let filas = []
    for (let desde = 0; ; desde += PAGE) {
        let q = supabase.from(vista).select(columnas.join(','))
        q = aplicarFiltros(q, fuente, modo, filtros)
        for (const o of orden) q = q.order(o, { ascending: true })
        const { data, error } = await q.range(desde, desde + PAGE - 1)
        if (error) throw error
        filas = filas.concat(data || [])
        onProgreso?.(filas.length)
        if (!data || data.length < PAGE) break
    }
    return filas
}

// ── Formato de valores ──────────────────────────────────────────────────────
const aFecha = (v) => {
    if (!v) return null
    const [y, m, d] = String(v).slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d)
}
const fechaTexto = (v) => {
    if (!v) return ''
    const [y, m, d] = String(v).slice(0, 10).split('-')
    return `${d}/${m}/${y}`
}

function valorXlsx(v, tipo) {
    if (v === null || v === undefined || v === '') return null
    if (tipo === 'fecha') return aFecha(v)
    if (tipo === 'bool') return v ? 'Sí' : 'No'
    if (['numero', 'moneda', 'pct'].includes(tipo)) return Number(v)
    return v
}

// CSV/TXT en español: decimales con coma, fechas dd/mm/aaaa
function valorTexto(v, tipo) {
    if (v === null || v === undefined) return ''
    if (tipo === 'fecha') return fechaTexto(v)
    if (tipo === 'bool') return v ? 'Sí' : 'No'
    if (['numero', 'moneda', 'pct'].includes(tipo)) return String(Number(v)).replace('.', ',')
    return String(v)
}

const FORMATO_NUM = { moneda: '#,##0.00', pct: '0.00', numero: '#,##0.####' }

function hojaInfo(meta, campos) {
    const avisos = [...new Set([...(meta.avisos || []), ...campos.filter(c => c.aviso).map(c => `${c.label}: ${c.aviso}`)])]
    return [
        ['Exportado de MiPOS'],
        [],
        ['Fuente', meta.fuente],
        ['Detalle', meta.detalle],
        ['Filtros', meta.filtrosTexto || 'Ninguno'],
        ['Filas', meta.filas],
        ['Generado', new Date().toLocaleString('es-VE')],
        ['Usuario', meta.usuario || ''],
        [],
        ['Avisos'],
        ...avisos.map(a => ['', a]),
    ]
}

function descargarBlob(contenido, nombre, tipo) {
    const blob = new Blob([contenido], { type: tipo })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = nombre
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// formato: 'xlsx' | 'csv' | 'txt'
export function generarArchivo(filas, campos, formato, meta, nombreBase) {
    if (formato === 'xlsx') {
        const aoa = [campos.map(c => c.label), ...filas.map(f => campos.map(c => valorXlsx(f[c.col], c.tipo)))]
        const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true })
        // Formato numérico y de fecha por columna
        campos.forEach((c, j) => {
            const fmt = c.tipo === 'fecha' ? 'dd/mm/yyyy' : FORMATO_NUM[c.tipo]
            if (!fmt) return
            for (let i = 1; i < aoa.length; i++) {
                const cell = ws[XLSX.utils.encode_cell({ r: i, c: j })]
                if (cell) cell.z = fmt
            }
        })
        ws['!cols'] = campos.map(c => ({ wch: Math.min(45, Math.max(c.label.length + 2, c.tipo === 'texto' ? 18 : 12)) }))
        if (aoa.length > 1) ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: campos.length - 1 } }) }
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Datos')
        const info = XLSX.utils.aoa_to_sheet(hojaInfo(meta, campos))
        info['!cols'] = [{ wch: 12 }, { wch: 110 }]
        XLSX.utils.book_append_sheet(wb, info, 'Info')
        XLSX.writeFile(wb, `${nombreBase}.xlsx`, { cellDates: true })
        return
    }
    const sep = formato === 'csv' ? ';' : '\t'
    const limpiar = (s) => {
        const t = String(s).replace(/\r?\n/g, ' ')
        if (formato === 'txt') return t.replace(/\t/g, ' ')
        return /[;"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
    }
    const lineas = [
        campos.map(c => limpiar(c.label)).join(sep),
        ...filas.map(f => campos.map(c => limpiar(valorTexto(f[c.col], c.tipo))).join(sep)),
    ]
    // BOM: Excel en español abre el UTF-8 con acentos
    descargarBlob('﻿' + lineas.join('\r\n'), `${nombreBase}.${formato}`,
        formato === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8')
}
