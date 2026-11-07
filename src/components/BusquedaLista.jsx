// Piezas para montar la barra de búsqueda estilo Odoo en una lista
// (docs/plan-barra-busqueda.md). La lógica vive en src/lib/busqueda.js y la
// barra en BarraBusqueda.jsx; aquí va lo que repite cada pantalla:
//
//   const bl = useBusquedaLista('cxp_compras', { pestanaPorDefecto: 'pendiente' })
//   <BarraBusqueda campos={CAMPOS} filas={filas} {...bl.propsBarra} />
//   const visibles = filtrar(filas, bl.busq, CAMPOS)
//   const arbol = bl.busq.agrupar.length ? agrupar(visibles, bl.busq.agrupar, CAMPOS, sumar, porSaldo) : null
//   <ControlGrupos arbol={arbol} n={visibles.length} unidad={['compra', 'compras']} bl={bl} />
//   <tbody>{arbol ? filasDeGrupos({ grupos: arbol, bl, colsEtiqueta: 5, celdas, renderFila }) : …}</tbody>
//
// La pestaña de estado de la pantalla (Pendientes, Pagadas…) se guarda con el
// favorito: si la pantalla tiene una, se maneja con bl.pestana / bl.setPestana.
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { busquedaVacia, clavesDe, leerFavoritos, guardarFavoritos } from '../lib/busqueda'

export function useBusquedaLista(pantalla, { pestanaPorDefecto = null } = {}) {
    const { perfil } = useAuth()
    const clave = `mipos_busquedas_${pantalla}_${perfil?.empresa_id}_${perfil?.id || 'yo'}`
    const [favoritos, setFavoritos] = useState(() => leerFavoritos(clave))
    const inicial = favoritos.find(f => f.porDefecto) || null
    const [busq, setBusq] = useState(() => inicial?.busqueda || busquedaVacia())
    const [favAplicado, setFavAplicado] = useState(() => inicial?.nombre || null)
    const [pestana, setPestanaEstado] = useState(() => inicial?.pestana ?? pestanaPorDefecto)
    const [abiertos, setAbiertos] = useState(() => new Set())

    // Al cambiar la agrupación, los grupos arrancan cerrados
    useEffect(() => { setAbiertos(new Set()) }, [busq.agrupar.join('|')])

    const cambiar = b => { setBusq(b); setFavAplicado(null) }
    const setPestana = p => { setPestanaEstado(p); setFavAplicado(null) }
    const aplicar = f => {
        if (f.pestana !== undefined && f.pestana !== null) setPestanaEstado(f.pestana)
        setBusq(f.busqueda || busquedaVacia()); setFavAplicado(f.nombre)
    }
    const quitar = () => { setBusq(busquedaVacia()); setFavAplicado(null) }
    const guardar = (nombre, porDefecto) => {
        const nuevo = { id: Date.now().toString(36), nombre, porDefecto, pestana, busqueda: busq }
        const lista = [...favoritos.filter(f => f.nombre !== nombre).map(f => porDefecto ? { ...f, porDefecto: false } : f), nuevo]
        setFavoritos(lista); guardarFavoritos(clave, lista); setFavAplicado(nombre)
    }
    const borrar = fav => {
        const lista = favoritos.filter(f => f.id !== fav.id)
        setFavoritos(lista); guardarFavoritos(clave, lista)
        if (favAplicado === fav.nombre) setFavAplicado(null)
    }
    const alternarGrupo = c => setAbiertos(s => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n })

    return {
        busq, pestana, setPestana, abiertos, setAbiertos, alternarGrupo,
        propsBarra: {
            busqueda: busq, onCambio: cambiar, favoritos, favoritoAplicado: favAplicado,
            onAplicarFavorito: aplicar, onGuardarFavorito: guardar, onBorrarFavorito: borrar, onQuitarFavorito: quitar,
        },
    }
}

// "N grupos · M registros · Abrir todo · Cerrar todo" sobre la tabla agrupada
// `resumen` (opcional) se muestra también sin agrupar cuando hay búsqueda: p. ej. "Total $1.234,00"
export function ControlGrupos({ arbol, n, unidad = ['registro', 'registros'], bl, resumen }) {
    const hayBusqueda = Object.values(bl.busq.filtros).some(v => v.length) || bl.busq.textos.length > 0
    if (!n || (!arbol && !(resumen && hayBusqueda))) return null
    const btn = { background: 'none', border: 'none', padding: 0, color: '#0E7F70', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: '#6b7280', margin: '0 0 8px 2px', flexWrap: 'wrap' }}>
            <span>{arbol ? `${arbol.length} ${arbol.length === 1 ? 'grupo' : 'grupos'} · ` : ''}{n} {n === 1 ? unidad[0] : unidad[1]}{resumen ? ` · ${resumen}` : ''}</span>
            {arbol && <>
                <button style={btn} onClick={() => bl.setAbiertos(new Set(clavesDe(arbol)))}>Abrir todo</button>
                <button style={btn} onClick={() => bl.setAbiertos(new Set())}>Cerrar todo</button>
            </>}
        </div>
    )
}

const FONDO_NIVEL = ['#eef2f7', '#f4f6fa', '#f9fafb']

// Filas <tr> de un árbol de grupos. La etiqueta ocupa las primeras `colsEtiqueta`
// columnas; `celdas` son las columnas restantes, en orden:
//   [{ key, contenido: g => nodo, color?: g => '#…', align?: 'right' }]
// Al abrir un grupo se muestran sus subgrupos o, en el último nivel, sus filas (renderFila).
export function filasDeGrupos({ grupos, nivel = 0, bl, colsEtiqueta, celdas, renderFila, unidad = ['registro', 'registros'], padding = '10px 14px' }) {
    return grupos.flatMap(g => {
        const abierto = bl.abiertos.has(g.clave)
        const fila = (
            <tr key={g.clave} onClick={() => bl.alternarGrupo(g.clave)} aria-expanded={abierto}
                style={{ cursor: 'pointer', backgroundColor: FONDO_NIVEL[nivel] || FONDO_NIVEL[2], borderBottom: '1px solid #e5e7eb' }}>
                <td colSpan={colsEtiqueta} style={{ padding, paddingLeft: `${14 + nivel * 22}px`, fontSize: '13px', fontWeight: 600, color: '#0F1F3D' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {abierto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        {g.etiqueta}
                        <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '12px' }}>· {g.n} {g.n === 1 ? unidad[0] : unidad[1]}</span>
                    </span>
                </td>
                {celdas.map(c => (
                    <td key={c.key} style={{ padding, fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: c.align || 'left', color: c.color ? c.color(g) : '#1f2937' }}>
                        {c.contenido ? c.contenido(g) : ''}
                    </td>
                ))}
            </tr>
        )
        if (!abierto) return [fila]
        return [fila, ...(g.hijos
            ? filasDeGrupos({ grupos: g.hijos, nivel: nivel + 1, bl, colsEtiqueta, celdas, renderFila, unidad, padding })
            : g.filas.map(renderFila))]
    })
}
