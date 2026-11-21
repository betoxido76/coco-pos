// Formato de costos unitarios de insumos.
// Desde 2026-11-21 un costo puede ser por gramo o mililitro (fracciones de
// centavo: sal ≈ $0,0005/g). `toFixed(2)` los mostraba como $0.00.
// Regla: mínimo 2 decimales y los necesarios según la magnitud, sin ceros de
// relleno. $0.25 se sigue viendo $0.25; $0.0475 → $0.0475; $0.000544 → $0.000544.
export function decimalesCosto(n) {
    const a = Math.abs(Number(n) || 0)
    if (a === 0 || a >= 1) return 2
    if (a >= 0.01) return 4
    return 6
}

export function numCosto(n) {
    if (n == null || n === '' || isNaN(Number(n))) return ''
    const v = Number(n)
    let s = v.toFixed(decimalesCosto(v))
    if (s.includes('.')) {
        s = s.replace(/0+$/, '')
        const dec = s.split('.')[1] || ''
        if (dec.length < 2) s = v.toFixed(2)
    }
    return s
}

export function fmtCosto(n) {
    const s = numCosto(n)
    return s === '' ? '—' : `$${s}`
}
