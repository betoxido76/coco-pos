import { createContext, forwardRef, useContext, useEffect, useRef, useState } from 'react'

// Alto de la barra fija para los títulos de tablas anidadas en subcomponentes:
// <TopTitulos.Provider value={altoBarra}> evita pasar `top` tabla por tabla.
export const TopTitulos = createContext(0)

// Piezas compartidas por las tablas con títulos fijos y orden por columna
// (CxC, CxP). Uso:
//
//   const [orden, ordenarPor] = useOrden({ col: 'vencimiento', dir: 'asc' }, ['total', 'saldo'])
//   const filas = ordenarFilas(datos, { total: f => f.total, ... }, orden)
//   const [barraRef, altoBarra] = useAltoBarra()   // barra sticky de filtros
//   <th> → <ThOrden col="total" orden={orden} onOrdenar={ordenarPor} top={altoBarra}>Total</ThOrden>

// Estado del orden. Las columnas de `descPrimero` (montos, fechas) arrancan de
// mayor a menor al elegirlas; las demás, de la A a la Z.
export function useOrden(inicial, descPrimero = []) {
    const [orden, setOrden] = useState(inicial)
    const ordenarPor = col => setOrden(o => o.col === col
        ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: descPrimero.includes(col) ? 'desc' : 'asc' })
    return [orden, ordenarPor]
}

// Copia ordenada de `filas`. `lectores` mapea columna → función que devuelve el
// valor a comparar. Los vacíos van siempre al final, en cualquier sentido.
export function ordenarFilas(filas, lectores, orden) {
    const leer = lectores[orden.col]
    if (!leer) return filas
    return [...filas].sort((a, b) => {
        const va = leer(a), vb = leer(b)
        const vacioA = va == null || va === '', vacioB = vb == null || vb === ''
        if (vacioA || vacioB) return vacioA === vacioB ? 0 : vacioA ? 1 : -1
        const c = typeof va === 'number' && typeof vb === 'number'
            ? va - vb
            : String(va).localeCompare(String(vb), 'es', { numeric: true })
        return orden.dir === 'asc' ? c : -c
    })
}

// Alto de la barra fija de filtros, para pegar los títulos justo debajo.
// Se vuelve a medir cuando la barra cambia de tamaño.
export function useAltoBarra(deps = []) {
    const ref = useRef(null)
    const [alto, setAlto] = useState(0)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        const ro = new ResizeObserver(() => setAlto(el.offsetHeight))
        ro.observe(el)
        return () => ro.disconnect()
    }, deps)
    return [ref, alto]
}

// Barra de pestañas/filtros fija arriba al hacer scroll. Se extiende sobre el
// padding de la página (`gutter`) con el fondo de la página, para que la tabla
// no se vea por detrás. Recibe el ref de useAltoBarra.
export const BarraFija = forwardRef(function BarraFija({ gutter = 24, style, children }, ref) {
    return (
        <div ref={ref} style={{
            position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#f9fafb',
            marginLeft: -gutter, marginRight: -gutter, padding: `12px ${gutter}px 4px`, ...style,
        }}>
            {children}
        </div>
    )
})

// Contenedor (tarjeta) de una tabla con títulos fijos: overflow 'clip' en vez
// de 'hidden', que crearía su propio contenedor de scroll.
export const estiloTarjetaTabla = { backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'clip' }

// Título de columna fijo al hacer scroll y, con `col`, ordenable con clic.
// El contenedor de la tabla debe usar overflow 'clip' (no 'hidden'): 'hidden'
// crea su propio contenedor de scroll y el título deja de quedar fijo.
export function ThOrden({ col, orden, onOrdenar, top, align = 'left', style, children }) {
    const topContexto = useContext(TopTitulos)
    if (top == null) top = topContexto
    const activa = col && orden?.col === col
    return (
        <th onClick={col ? () => onOrdenar(col) : undefined}
            style={{
                position: 'sticky', top, zIndex: 10, backgroundColor: '#f9fafb', boxShadow: 'inset 0 -1px 0 #e5e7eb',
                padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: activa ? '#16a34a' : '#6b7280',
                textAlign: align, whiteSpace: 'nowrap', cursor: col ? 'pointer' : 'default', userSelect: 'none',
                ...style,
            }}>
            {children}
            {col && <span style={{ marginLeft: '4px', fontSize: '10px' }}>{activa ? (orden.dir === 'asc' ? '↑' : '↓') : '↕'}</span>}
        </th>
    )
}
