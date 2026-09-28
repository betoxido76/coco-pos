import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

// Filtro de lista con búsqueda: se abre como un <select>, pero al escribir
// filtra las opciones por cualquier parte del texto (sin distinguir
// mayúsculas ni acentos). El filtro se aplica al elegir una opción.
//
//   <FiltroCombo label="Proveedor" value={id} onChange={setId}
//       options={[{ value: 'uuid', label: 'Nombre' }]} />
//
// value '' = Todos.

const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function FiltroCombo({ label, value, options, onChange, placeholder = 'Todos', width = '200px' }) {
    const [abierto, setAbierto] = useState(false)
    const [texto, setTexto] = useState('')
    const [activo, setActivo] = useState(0)
    const contRef = useRef(null)
    const listaRef = useRef(null)

    const seleccionada = options.find(o => o.value === value)

    useEffect(() => {
        if (!abierto) return
        const fuera = e => { if (contRef.current && !contRef.current.contains(e.target)) cerrar() }
        document.addEventListener('mousedown', fuera)
        return () => document.removeEventListener('mousedown', fuera)
    }, [abierto])

    const q = normalizar(texto.trim())
    const filtradas = q ? options.filter(o => normalizar(o.label).includes(q)) : options
    // Con texto escrito no se ofrece "Todos": el usuario está buscando algo
    const items = q ? filtradas : [{ value: '', label: placeholder }, ...filtradas]

    function abrir() { setAbierto(true); setTexto(''); setActivo(0) }
    function cerrar() { setAbierto(false); setTexto('') }
    function elegir(v) { onChange(v); cerrar() }

    function onKeyDown(e) {
        if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter')) { abrir(); e.preventDefault(); return }
        if (e.key === 'ArrowDown') { setActivo(a => Math.min(a + 1, items.length - 1)); e.preventDefault() }
        else if (e.key === 'ArrowUp') { setActivo(a => Math.max(a - 1, 0)); e.preventDefault() }
        else if (e.key === 'Enter') { if (items[activo]) elegir(items[activo].value); e.preventDefault() }
        else if (e.key === 'Escape') { cerrar(); e.target.blur() }
    }

    useEffect(() => {
        listaRef.current?.children[activo]?.scrollIntoView({ block: 'nearest' })
    }, [activo])

    return (
        <div ref={contRef} style={{ position: 'relative', width }}>
            {label && <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '4px' }}>{label}</label>}
            <div style={{ position: 'relative' }}>
                <input
                    value={abierto ? texto : (seleccionada?.label || '')}
                    placeholder={abierto ? 'Escribe para buscar…' : placeholder}
                    onFocus={abrir}
                    onClick={() => !abierto && abrir()}
                    onChange={e => { setTexto(e.target.value); setActivo(0); if (!abierto) setAbierto(true) }}
                    onKeyDown={onKeyDown}
                    style={{
                        width: '100%', padding: '8px 52px 8px 12px', border: '1px solid',
                        borderColor: value ? '#16a34a' : '#d1d5db', borderRadius: '8px', fontSize: '13px',
                        color: '#374151', backgroundColor: value ? '#f0fdf4' : '#fff', boxSizing: 'border-box',
                        textOverflow: 'ellipsis',
                    }} />
                <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {value && !abierto && (
                        <button onMouseDown={e => { e.preventDefault(); onChange('') }} title="Quitar filtro"
                            style={{ display: 'flex', background: 'none', border: 'none', padding: '2px', cursor: 'pointer', color: '#6b7280' }}>
                            <X size={14} />
                        </button>
                    )}
                    <ChevronDown size={14} color="#9ca3af" style={{ pointerEvents: 'none' }} />
                </div>
            </div>
            {abierto && (
                <div ref={listaRef} style={{
                    position: 'absolute', top: '100%', left: 0, minWidth: '100%', marginTop: '4px', maxHeight: '260px', overflowY: 'auto',
                    backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50,
                }}>
                    {items.length === 0 ? (
                        <div style={{ padding: '10px 12px', fontSize: '13px', color: '#9ca3af' }}>Sin coincidencias</div>
                    ) : items.map((o, i) => (
                        <div key={o.value || '__todos'}
                            onMouseDown={e => { e.preventDefault(); elegir(o.value) }}
                            onMouseEnter={() => setActivo(i)}
                            style={{
                                padding: '8px 12px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
                                backgroundColor: i === activo ? '#f0fdf4' : 'transparent',
                                color: o.value === '' ? '#6b7280' : '#374151',
                                fontWeight: o.value === value ? 600 : 400,
                            }}>
                            {o.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
