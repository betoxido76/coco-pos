// Barra de búsqueda estilo Odoo: etiquetas en una línea, texto con sugerencias
// "Buscar <campo> por" y panel Filtros · Agrupar por · Favoritos.
// Lógica en src/lib/busqueda.js; diseño tomado de SOMA (docs/plan-barra-busqueda.md).
//
//   <BarraBusqueda campos={CAMPOS} filas={filasBase} busqueda={b} onCambio={setB}
//       unidad="notas" favoritos={favs} favoritoAplicado={nombre}
//       onAplicarFavorito={f => …} onGuardarFavorito={(nombre, porDefecto) => …}
//       onBorrarFavorito={f => …} onQuitarFavorito={() => …} />
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search, SlidersHorizontal, ChevronDown, ChevronRight, X, Trash2, Star } from 'lucide-react'
import {
    MAX_NIVELES, contarValores, tieneDatos, quitarUltima, alternarValor, alternarNivel, etiquetaDe, claveDe,
} from '../lib/busqueda'

const C = { navy: '#0F1F3D', teal: '#00BFA5', tealOscuro: '#0E7F70', tealSuave: '#E0F7F3', borde: '#d1d5db', gris: '#6b7280', grisClaro: '#9ca3af', fondo: '#f9fafb' }

const CSS = `
.bb { position: relative; flex: 1 1 420px; min-width: 260px; }
.bb-barra { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 38px; padding: 4px 6px 4px 10px; background: #fff;
    border: 1px solid ${C.borde}; border-radius: 8px; cursor: text; }
.bb-barra:focus-within { border-color: ${C.teal}; box-shadow: 0 0 0 3px rgba(0,191,165,.15); }
.bb-chip { display: inline-flex; align-items: center; max-width: 100%; font-size: 12px; border-radius: 6px; background: #eef2f7; color: ${C.navy}; overflow: hidden; }
.bb-chip .k { padding: 3px 6px; background: #dfe6ef; font-weight: 600; white-space: nowrap; }
.bb-chip .v { padding: 3px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 340px; }
.bb-chip .v i { font-style: normal; color: ${C.gris}; }
.bb-chip button { border: 0; background: none; padding: 0 6px; cursor: pointer; color: ${C.gris}; font-size: 14px; line-height: 1; align-self: stretch; }
.bb-chip button:hover { color: #dc2626; }
.bb-chip.grp .k { background: ${C.tealSuave}; color: ${C.tealOscuro}; }
.bb-chip.fav .k { background: #fdf0d5; color: #92400e; }
.bb-input { flex: 1 1 160px; min-width: 120px; border: 0; outline: none; font-size: 13px; padding: 5px 2px; background: transparent; color: ${C.navy}; }
.bb-drop { display: inline-flex; align-items: center; gap: 6px; border: 0; border-left: 1px solid #e5e7eb; background: none; padding: 5px 8px 5px 10px;
    font-size: 12px; font-weight: 600; color: ${C.navy}; cursor: pointer; white-space: nowrap; border-radius: 0 6px 6px 0; }
.bb-drop:hover, .bb-drop[aria-expanded="true"] { background: ${C.fondo}; }
.bb-pop { position: absolute; left: 0; top: calc(100% + 6px); z-index: 60; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
    box-shadow: 0 12px 48px rgba(15,31,61,.18); }
.bb-sugg { min-width: 320px; padding: 6px; }
.bb-sugg button { display: block; width: 100%; text-align: left; border: 0; background: none; padding: 8px 10px; border-radius: 6px; font-size: 13px; color: #374151; cursor: pointer; }
.bb-sugg button.hl { background: ${C.fondo}; }
.bb-panel { width: min(900px, calc(100vw - 48px)); display: grid; grid-template-columns: 1.3fr 1fr 1fr; max-height: min(70vh, 620px); }
.bb-panel.sin-grupo { width: min(640px, calc(100vw - 48px)); grid-template-columns: 1.3fr 1fr; }
.bb-col { padding: 14px 14px 16px; overflow-y: auto; min-width: 0; }
.bb-col + .bb-col { border-left: 1px solid #f1f5f9; }
.bb-col h5 { margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: ${C.gris}; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.bb-col h5 span { font-weight: 400; text-transform: none; letter-spacing: 0; font-size: 11px; color: ${C.grisClaro}; }
.bb-opt { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: 0; background: none; padding: 6px 8px; border-radius: 6px; font-size: 13px; color: #374151; cursor: pointer; }
.bb-opt:hover { background: ${C.fondo}; }
.bb-opt.on { color: ${C.navy}; font-weight: 600; }
.bb-opt.dis { color: #cbd5e1; cursor: default; }
.bb-opt.dis:hover { background: none; }
.bb-opt .ck { width: 16px; height: 16px; flex: none; border: 1.5px solid #cbd5e1; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; }
.bb-opt.on .ck { background: ${C.teal}; border-color: ${C.teal}; }
.bb-opt .t { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bb-opt .n { font-size: 11px; color: ${C.grisClaro}; font-variant-numeric: tabular-nums; }
.bb-opt .ord { width: 18px; height: 18px; border-radius: 50%; background: ${C.teal}; color: ${C.navy}; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.bb-faceta > button { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: none; padding: 7px 6px; font-size: 13px; font-weight: 600; color: ${C.navy}; cursor: pointer; border-radius: 6px; text-align: left; }
.bb-faceta > button:hover { background: ${C.fondo}; }
.bb-faceta .cnt { margin-left: auto; font-size: 11px; font-weight: 700; color: ${C.navy}; background: ${C.tealSuave}; border-radius: 99px; padding: 0 7px; }
.bb-faceta .opts { padding-left: 14px; max-height: 260px; overflow-y: auto; }
.bb-faceta .buscar { width: calc(100% - 8px); margin: 2px 4px 4px; padding: 5px 8px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 12px; }
.bb-mas { margin-top: 6px; border-top: 1px dashed #e5e7eb; padding-top: 6px; }
.bb-mas > button { border: 0; background: none; font-size: 12px; font-weight: 600; color: ${C.tealOscuro}; cursor: pointer; padding: 6px; display: flex; align-items: center; gap: 4px; }
.bb-favrow { display: flex; align-items: center; gap: 4px; }
.bb-favrow .del { border: 0; background: none; color: ${C.grisClaro}; cursor: pointer; padding: 4px; border-radius: 6px; display: flex; }
.bb-favrow .del:hover { color: #dc2626; background: #fef2f2; }
.bb-save { display: flex; flex-direction: column; gap: 8px; padding: 6px 4px; }
.bb-save input[type=text] { padding: 7px 9px; border: 1px solid ${C.borde}; border-radius: 6px; font-size: 13px; }
.bb-save label { font-size: 12px; color: #374151; display: flex; gap: 6px; align-items: center; }
.bb-btn { border: 0; border-radius: 6px; background: ${C.teal}; color: ${C.navy}; font-weight: 700; font-size: 13px; padding: 7px 10px; cursor: pointer; }
.bb-btn:disabled { opacity: .5; cursor: default; }
.bb-cerrar { position: absolute; top: 8px; right: 8px; border: 0; background: none; color: ${C.grisClaro}; cursor: pointer; padding: 4px; border-radius: 6px; display: none; }
.bb-vacio { font-size: 12px; color: ${C.grisClaro}; padding: 6px 8px; }
.bb button:focus-visible, .bb input:focus-visible { outline: 2px solid ${C.teal}; outline-offset: 1px; }
@media (max-width: 760px) {
    .bb-panel { position: fixed; inset: 0; width: auto; max-height: none; border-radius: 0; grid-template-columns: 1fr; overflow-y: auto; z-index: 80; padding-top: 32px; }
    .bb-col + .bb-col { border-left: 0; border-top: 1px solid #f1f5f9; }
    .bb-col { overflow: visible; }
    .bb-cerrar { display: flex; }
    .bb-drop .txt { display: none; }
}
`

export default function BarraBusqueda({
    campos, filas, busqueda, onCambio, unidad = 'registros', placeholder,
    // false: sin la columna "Agrupar por" (p. ej. el Dashboard, donde agrupan las gráficas)
    agrupar = true,
    favoritos = [], favoritoAplicado, onAplicarFavorito, onGuardarFavorito, onBorrarFavorito, onQuitarFavorito,
}) {
    const [texto, setTexto] = useState('')
    const [hl, setHl] = useState(0)
    const [panel, setPanel] = useState(false)
    const cont = useRef(null)
    const inp = useRef(null)

    useEffect(() => {
        const fuera = e => { if (cont.current && !cont.current.contains(e.target)) setPanel(false) }
        const esc = e => { if (e.key === 'Escape') setPanel(false) }
        document.addEventListener('mousedown', fuera)
        document.addEventListener('keydown', esc)
        return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
    }, [])

    const buscables = campos.filter(c => c.buscable)
    const sugerencias = [{ campo: 'todo', etiqueta: 'en todo' }, ...buscables]
    const etiquetaTexto = c => c === 'todo' ? 'Texto' : (campos.find(x => x.campo === c)?.etiqueta || c)

    function agregarTexto(campo) {
        const t = texto.trim()
        if (!t) return
        setTexto(''); setHl(0)
        onCambio({ ...busqueda, textos: [...busqueda.textos, { campo, texto: t }] })
    }

    // ── Etiquetas ──
    const chips = []
    const chip = (key, k, v, onX, cls = '') => chips.push(
        <span key={key} className={`bb-chip ${cls}`}>
            <span className="k">{k}</span><span className="v">{v}</span>
            <button type="button" aria-label={`Quitar ${typeof k === 'string' ? k : ''}`} onClick={e => { e.stopPropagation(); onX() }}>×</button>
        </span>,
    )
    const o = i => i > 0 ? <i key={`o${i}`}> o </i> : null
    if (favoritoAplicado) chip('fav', <Star size={11} style={{ verticalAlign: '-1px' }} />, favoritoAplicado, () => onQuitarFavorito?.(), 'fav')
    for (const def of campos) {
        const vals = busqueda.filtros[def.campo]
        if (!vals?.length) continue
        chip(`f-${def.campo}`, def.etiqueta, vals.map((v, i) => <span key={v}>{o(i)}{etiquetaDe(def, v, filas.find(f => claveDe(def, f) === v))}</span>), () => {
            const f = { ...busqueda.filtros }; delete f[def.campo]; onCambio({ ...busqueda, filtros: f })
        })
    }
    const camposTexto = [...new Set(busqueda.textos.map(t => t.campo))]
    for (const c of camposTexto) {
        const ts = busqueda.textos.filter(t => t.campo === c)
        chip(`t-${c}`, etiquetaTexto(c), ts.map((t, i) => <span key={i}>{o(i)}“{t.texto}”</span>),
            () => onCambio({ ...busqueda, textos: busqueda.textos.filter(t => t.campo !== c) }))
    }
    if (busqueda.agrupar.length) {
        chip('grp', 'Agrupar', busqueda.agrupar.map(c => campos.find(x => x.campo === c)?.etiqueta || c).join(' › '),
            () => onCambio({ ...busqueda, agrupar: [] }), 'grp')
    }

    return (
        <div className="bb" ref={cont}>
            <style>{CSS}</style>
            <div className="bb-barra" onClick={e => {
                if (e.target === e.currentTarget) { inp.current?.focus(); if (!texto.trim()) setPanel(true) }
            }}>
                <Search size={15} color={C.grisClaro} style={{ flex: 'none' }} onClick={() => { inp.current?.focus(); setPanel(true) }} />
                {chips}
                <input ref={inp} id="barra-busqueda" className="bb-input" type="text" autoComplete="off" aria-label="Buscar"
                    placeholder={chips.length ? '' : placeholder}
                    value={texto}
                    onClick={() => { if (!texto.trim()) setPanel(true) }}
                    onChange={e => { setTexto(e.target.value); setHl(0); if (e.target.value.trim()) setPanel(false) }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && texto.trim()) { e.preventDefault(); agregarTexto(sugerencias[hl].campo) }
                        else if (e.key === 'ArrowDown' && texto.trim()) { e.preventDefault(); setHl(h => Math.min(sugerencias.length - 1, h + 1)) }
                        else if (e.key === 'ArrowUp' && texto.trim()) { e.preventDefault(); setHl(h => Math.max(0, h - 1)) }
                        else if (e.key === 'Backspace' && !texto) {
                            const nb = quitarUltima(busqueda)
                            if (nb !== busqueda) onCambio(nb)
                            else if (favoritoAplicado) onQuitarFavorito?.()
                        } else if (e.key === 'Escape') { setTexto(''); setPanel(false) }
                    }} />
                <button type="button" className="bb-drop" aria-expanded={panel} onClick={() => setPanel(v => !v)}>
                    <SlidersHorizontal size={14} />
                    <span className="txt">{agrupar ? 'Filtros · Agrupar · Favoritos' : 'Filtros · Favoritos'}</span>
                    <ChevronDown size={13} />
                </button>
            </div>

            {texto.trim() && (
                <div className="bb-pop bb-sugg" role="listbox">
                    {sugerencias.map((s, i) => (
                        <button type="button" key={s.campo} className={i === hl ? 'hl' : ''} onMouseEnter={() => setHl(i)} onClick={() => agregarTexto(s.campo)}>
                            Buscar <b>{s.campo === 'todo' ? 'en todo' : s.etiqueta}</b> por: {texto.trim()}
                        </button>
                    ))}
                </div>
            )}

            {panel && (
                <Panel campos={campos} filas={filas} busqueda={busqueda} onCambio={onCambio} unidad={unidad} conAgrupar={agrupar}
                    favoritos={favoritos} favoritoAplicado={favoritoAplicado}
                    onAplicarFavorito={f => { onAplicarFavorito?.(f); setPanel(false) }}
                    onGuardarFavorito={onGuardarFavorito} onBorrarFavorito={onBorrarFavorito}
                    cerrar={() => setPanel(false)} />
            )}
        </div>
    )
}

function Opcion({ on, dis, n, ord, titulo, onClick, children }) {
    return (
        <button type="button" className={`bb-opt${on ? ' on' : ''}${dis ? ' dis' : ''}`} aria-pressed={on} aria-disabled={dis || undefined}
            title={titulo} onClick={dis ? undefined : onClick}>
            {ord != null ? <span className="ord">{ord}</span> : <span className="ck">{on ? '✓' : ''}</span>}
            <span className="t">{children}</span>
            {n != null && <span className="n">{n.toLocaleString('es-VE')}</span>}
        </button>
    )
}

// Comunes en el orden de la configuración; el resto, alfabético
function separar(lista) {
    const comunes = lista.filter(c => c.comun)
    const mas = lista.filter(c => !c.comun).sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
    return { comunes, mas }
}

function Panel({ campos, filas, busqueda, onCambio, unidad, conAgrupar = true, favoritos, favoritoAplicado, onAplicarFavorito, onGuardarFavorito, onBorrarFavorito, cerrar }) {
    const [abiertas, setAbiertas] = useState({})
    const [verMasF, setVerMasF] = useState(false)
    const [verMasG, setVerMasG] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [nombre, setNombre] = useState('')
    const [porDefecto, setPorDefecto] = useState(false)

    // El panel arranca en el borde izquierdo de la barra; si no cabe en la pantalla
    // se corre lo necesario para mostrarse completo (16 px de margen a cada lado).
    // En el teléfono (≤ 760 px) va a pantalla completa y no se mueve.
    const panelRef = useRef(null)
    const [desplazar, setDesplazar] = useState(0)
    useLayoutEffect(() => {
        const ajustar = () => {
            const el = panelRef.current
            if (!el || window.innerWidth <= 760) { setDesplazar(0); return }
            const padre = el.offsetParent?.getBoundingClientRect()
            if (!padre) return
            const ancho = el.offsetWidth, margen = 16
            const izq = padre.left                       // donde arranca sin desplazar
            let dx = 0
            if (izq + ancho > window.innerWidth - margen) dx = (window.innerWidth - margen) - (izq + ancho)
            if (izq + dx < margen) dx = margen - izq
            setDesplazar(dx)
        }
        ajustar()
        window.addEventListener('resize', ajustar)
        return () => window.removeEventListener('resize', ajustar)
    }, [])

    const conDatos = campos.filter(c => tieneDatos(filas, c))
    const fil = separar(conDatos.filter(c => c.filtrable))
    const grp = separar(conDatos.filter(c => c.agrupable))
    const masFActivos = fil.mas.some(c => (busqueda.filtros[c.campo] || []).length)
    const masGActivos = grp.mas.some(c => busqueda.agrupar.includes(c.campo))

    // Las facetas cuentan con el resto de los filtros: reciben todos los campos
    const faceta = def => (
        <FacetaConCampos key={def.campo} def={def} campos={campos} filas={filas} busqueda={busqueda} onCambio={onCambio}
            abierta={!!abiertas[def.campo]} alternar={() => setAbiertas(s => ({ ...s, [def.campo]: !s[def.campo] }))} />
    )
    const nivel = def => {
        const i = busqueda.agrupar.indexOf(def.campo)
        const lleno = i < 0 && busqueda.agrupar.length >= MAX_NIVELES
        return (
            <Opcion key={def.campo} on={i >= 0} ord={i >= 0 ? i + 1 : undefined} dis={lleno}
                titulo={lleno ? `Máximo ${MAX_NIVELES} niveles` : undefined}
                onClick={() => onCambio(alternarNivel(busqueda, def.campo))}>
                {def.etiqueta}
            </Opcion>
        )
    }
    function guardar() {
        if (!nombre.trim()) return
        onGuardarFavorito?.(nombre.trim(), porDefecto)
        setGuardando(false); setNombre(''); setPorDefecto(false)
    }

    return (
        <div className={`bb-pop bb-panel${conAgrupar ? '' : ' sin-grupo'}`} role="dialog" aria-label={conAgrupar ? 'Filtros, agrupar y favoritos' : 'Filtros y favoritos'} ref={panelRef}
            style={desplazar ? { left: desplazar } : undefined}>
            <button type="button" className="bb-cerrar" aria-label="Cerrar" onClick={cerrar}><X size={18} /></button>
            <div className="bb-col">
                <h5>Filtros <span title={`Dentro de un campo los valores se suman (o); entre campos se cruzan (y). El número es cuántas ${unidad} quedan con el resto de los filtros.`}>o dentro · y entre campos</span></h5>
                {fil.comunes.map(faceta)}
                {fil.mas.length > 0 && (
                    <div className="bb-mas">
                        <button type="button" aria-expanded={verMasF || masFActivos} onClick={() => setVerMasF(v => !v)}>
                            {verMasF || masFActivos ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Más filtros
                        </button>
                        {(verMasF || masFActivos) && fil.mas.map(faceta)}
                    </div>
                )}
            </div>
            {conAgrupar && <div className="bb-col">
                <h5>Agrupar por <span title="El orden en que los eliges es el orden de los niveles. Las filas de grupo muestran los totales.">hasta {MAX_NIVELES} niveles</span></h5>
                {grp.comunes.map(nivel)}
                {grp.mas.length > 0 && (
                    <div className="bb-mas">
                        <button type="button" aria-expanded={verMasG || masGActivos} onClick={() => setVerMasG(v => !v)}>
                            {verMasG || masGActivos ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Más agrupaciones
                        </button>
                        {(verMasG || masGActivos) && grp.mas.map(nivel)}
                    </div>
                )}
            </div>}
            <div className="bb-col">
                <h5>Favoritos <span title={conAgrupar ? 'Guarda la pestaña, los filtros, los textos y la agrupación. Se guardan en este navegador.' : 'Guarda los filtros y los textos. Se guardan en este navegador.'}>en este navegador</span></h5>
                {favoritos.map(f => (
                    <div key={f.id} className="bb-favrow">
                        <Opcion on={favoritoAplicado === f.nombre} onClick={() => onAplicarFavorito(f)}>{f.porDefecto ? '★ ' : ''}{f.nombre}</Opcion>
                        {onBorrarFavorito && (
                            <button type="button" className="del" title="Eliminar" aria-label={`Eliminar el favorito ${f.nombre}`}
                                onClick={() => { if (window.confirm(`¿Eliminar el favorito “${f.nombre}”?`)) onBorrarFavorito(f) }}>
                                <Trash2 size={14} />
                            </button>
                        )}
                    </div>
                ))}
                {guardando ? (
                    <div className="bb-save">
                        <input type="text" id="nombre-favorito" autoFocus placeholder="Nombre de la búsqueda" aria-label="Nombre del favorito"
                            value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') guardar() }} />
                        <label><input type="checkbox" checked={porDefecto} onChange={e => setPorDefecto(e.target.checked)} /> Usar por defecto al abrir</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button type="button" className="bb-btn" disabled={!nombre.trim()} onClick={guardar}>Guardar</button>
                            <button type="button" className="bb-opt" style={{ width: 'auto' }} onClick={() => setGuardando(false)}>Cancelar</button>
                        </div>
                    </div>
                ) : (
                    <button type="button" className="bb-opt" onClick={() => setGuardando(true)}>
                        <span className="ck" style={{ color: C.tealOscuro, borderColor: C.teal }}>+</span>
                        <span className="t">Guardar la búsqueda actual</span>
                    </button>
                )}
            </div>
        </div>
    )
}

function FacetaConCampos({ def, campos, filas, busqueda, onCambio, abierta, alternar }) {
    const sel = busqueda.filtros[def.campo] || []
    const [filtro, setFiltro] = useState('')
    const valores = useMemo(() => abierta ? contarValores(filas, busqueda, campos, def.campo) : [], [abierta, filas, busqueda, campos, def.campo])
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const q = norm(filtro.trim())
    return (
        <div className="bb-faceta">
            <button type="button" aria-expanded={abierta} onClick={alternar}>
                {abierta ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {def.etiqueta}
                {sel.length > 0 && <span className="cnt">{sel.length}</span>}
            </button>
            {abierta && (
                <div className="opts">
                    {valores.length > 10 && (
                        <input className="buscar" type="text" placeholder={`Buscar ${def.etiqueta.toLowerCase()}…`} value={filtro}
                            onChange={e => setFiltro(e.target.value)} aria-label={`Buscar en ${def.etiqueta}`} />
                    )}
                    {valores.filter(v => !q || norm(v.etiqueta).includes(q)).map(v => (
                        <Opcion key={v.valor} on={sel.includes(v.valor)} n={v.n}
                            onClick={() => onCambio(alternarValor(busqueda, def.campo, v.valor))}>
                            {v.etiqueta}
                        </Opcion>
                    ))}
                    {!valores.length && <div className="bb-vacio">Sin valores</div>}
                </div>
            )}
        </div>
    )
}
