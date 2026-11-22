// Editor de presentaciones de compra de un insumo (MP, empaque, consumible).
// Solo edita filas en memoria; el maestro las guarda con guardarPresentaciones()
// después de guardar el insumo. docs/plan-presentaciones-insumos.md
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { filaNueva, textoFactor } from '../lib/presentaciones'
import { fmtCosto, costeoPromedio } from '../lib/costos'

export default function PresentacionesInsumo({ filas, onChange, unidad, costo, proveedores = [], unidadCambiada = false }) {
    const editar = (key, campo, valor) => onChange(filas.map(f => f._key === key ? { ...f, [campo]: valor } : f))
    const quitar = key => onChange(filas.filter(f => f._key !== key))
    const costoBase = Number(costo)

    return (
        <div style={{ gridColumn: 'span 2', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', backgroundColor: '#fcfcfd' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                <div>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: '#374151', margin: 0 }}>Presentaciones de compra</p>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: '3px 0 0', lineHeight: 1.4 }}>
                        Formas en que se compra este insumo. El stock y las recetas siguen en <strong>{unidad || 'la unidad del insumo'}</strong>;
                        al recibir "3 × Botella 2 L" el sistema suma la cantidad equivalente. Opcional.
                    </p>
                </div>
                <button type="button" onClick={() => onChange([...filas, filaNueva()])}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, background: '#fff', border: '1px solid #d1d5db', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                    <Plus size={13} /> Agregar
                </button>
            </div>

            {unidadCambiada && filas.length > 0 && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px', padding: '8px 10px', fontSize: '12px', color: '#92400e', marginBottom: '10px' }}>
                    Cambiaste la unidad del insumo: los factores de las presentaciones están escritos en la unidad anterior. Revísalos.
                </div>
            )}

            {filas.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '4px 0 0' }}>Sin presentaciones: se compra directamente en {unidad || 'su unidad'}.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '8px', fontSize: '11px', color: '#6b7280', fontWeight: 500, padding: '0 2px' }}>
                        <span>Presentación *</span><span>Contiene ({unidad || 'unidad'}) *</span><span>Marca</span><span>Proveedor</span><span>Código de barras</span><span />
                    </div>
                    {filas.map(f => {
                        const inactiva = f.id && !f.activa
                        const factor = Number(f.factor)
                        return (
                            <div key={f._key} style={{ opacity: inactiva ? 0.55 : 1 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '8px', alignItems: 'center' }}>
                                    <input value={f.nombre} onChange={e => editar(f._key, 'nombre', e.target.value)}
                                        placeholder="Ej: Botella 2 L" style={input} />
                                    <input type="number" min="0" step="any" value={f.factor} onChange={e => editar(f._key, 'factor', e.target.value)}
                                        placeholder="2000" style={input} />
                                    <input value={f.marca} onChange={e => editar(f._key, 'marca', e.target.value)} placeholder="Opcional" style={input} />
                                    <select value={f.proveedor_id} onChange={e => editar(f._key, 'proveedor_id', e.target.value)} style={input}>
                                        <option value="">—</option>
                                        {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                    </select>
                                    <input value={f.codigo_barras} onChange={e => editar(f._key, 'codigo_barras', e.target.value)} placeholder="Opcional" style={input} />
                                    {f.id ? (
                                        <button type="button" onClick={() => editar(f._key, 'activa', !f.activa)} title={f.activa ? 'Desactivar (ya no se ofrece al comprar)' : 'Reactivar'}
                                            style={{ ...btnMini, color: f.activa ? '#6b7280' : '#16a34a' }}>
                                            {f.activa ? 'Desactivar' : 'Activar'}
                                        </button>
                                    ) : (
                                        <button type="button" onClick={() => quitar(f._key)} title="Quitar" style={{ ...btnMini, color: '#dc2626' }}>
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                                {factor > 0 && (
                                    <p style={{ fontSize: '11px', color: '#6b7280', margin: '3px 2px 0' }}>
                                        1 {f.nombre.trim() || 'presentación'} {textoFactor(factor, unidad)}
                                        {costoBase > 0 && <> · al costo actual ≈ {fmtCosto(costoBase * factor)}</>}
                                        {inactiva && ' · inactiva'}
                                    </p>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// Conteo físico por presentación: "4 × Botella 2 L + 350 ml" → 8.350 ml.
// onTotal(total en unidad base, texto para la nota). Sin presentaciones no se dibuja.
export function ConteoPresentaciones({ opciones, unidad, onTotal }) {
    const lista = opciones || []
    const [abierto, setAbierto] = useState(false)
    const [cuentas, setCuentas] = useState({})
    const [suelto, setSuelto] = useState('')
    if (lista.length === 0) return null

    function cambiar(nuevasCuentas, nuevoSuelto) {
        setCuentas(nuevasCuentas); setSuelto(nuevoSuelto)
        const partes = []
        let total = 0
        for (const p of lista) {
            const n = Number(nuevasCuentas[p.id] || 0)
            if (n > 0) { total += n * Number(p.factor); partes.push(`${n.toLocaleString('es-VE')} × ${p.nombre}`) }
        }
        const s = Number(nuevoSuelto || 0)
        if (s > 0) { total += s; partes.push(`${s.toLocaleString('es-VE')} ${unidad || ''}`.trim()) }
        if (partes.length === 0) return
        onTotal(Math.round(total * 10000) / 10000, `Conteo: ${partes.join(' + ')}`)
    }

    const inp = { width: '80px', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }
    if (!abierto) {
        return (
            <button type="button" onClick={() => setAbierto(true)}
                style={{ marginTop: '6px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '12px', color: '#0f766e', fontWeight: 500 }}>
                Contar por presentación
            </button>
        )
    }
    return (
        <div style={{ marginTop: '8px', padding: '10px 12px', backgroundColor: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {lista.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: '#374151' }}>
                    <span>{p.nombre} <span style={{ color: '#9ca3af' }}>({Number(p.factor).toLocaleString('es-VE', { maximumFractionDigits: 6 })} {unidad})</span></span>
                    <input type="number" min="0" step="any" value={cuentas[p.id] ?? ''} placeholder="0"
                        onChange={e => cambiar({ ...cuentas, [p.id]: e.target.value }, suelto)} style={inp} />
                </label>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: '#374151' }}>
                <span>Suelto ({unidad || 'unidad'})</span>
                <input type="number" min="0" step="any" value={suelto} placeholder="0"
                    onChange={e => cambiar(cuentas, e.target.value)} style={inp} />
            </label>
        </div>
    )
}

// Nota bajo el campo de costo del maestro: de dónde sale el costo y el último
// precio pagado (costo de reposición)
export function NotaCostoInsumo({ perfil, ultimo, fecha, unidad }) {
    const promedio = costeoPromedio(perfil)
    if (!promedio && ultimo == null) return null
    const fechaTxt = fecha ? new Date(String(fecha).slice(0, 10) + 'T00:00:00').toLocaleDateString('es-VE') : ''
    return (
        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', lineHeight: 1.4 }}>
            {promedio && <div>Costo promedio: lo recalcula cada compra. Edítalo solo para la carga inicial.</div>}
            {ultimo != null && <div>Última compra: {fmtCosto(ultimo)} por {unidad || 'unidad'}{fechaTxt ? ` (${fechaTxt})` : ''}</div>}
        </div>
    )
}

// Selector de presentación para una línea de compra. Si el insumo no tiene
// presentaciones no se dibuja nada (la línea se ve como siempre).
//   opciones: presentaciones activas del insumo · value: presentacion_id o ''
export function SelectorPresentacion({ opciones, unidad, value, onChange, nombreGuardado }) {
    const lista = opciones || []
    // Una línea guardada puede apuntar a una presentación ya desactivada
    const falta = value && !lista.some(p => p.id === value)
    if (lista.length === 0 && !falta) return null
    return (
        <select value={value || ''} onChange={e => { if (e.target.value !== (value || '')) onChange(lista.find(p => p.id === e.target.value) || null) }}
            style={{ marginTop: '4px', maxWidth: '220px', padding: '3px 6px', border: '1px solid #99f6e4', borderRadius: '6px', fontSize: '12px', color: '#0f766e', backgroundColor: '#f0fdfa' }}>
            <option value="">Por {unidad || 'unidad'}</option>
            {falta && <option value={value}>{nombreGuardado || 'Presentación'} (inactiva)</option>}
            {lista.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} ({Number(p.factor).toLocaleString('es-VE', { maximumFractionDigits: 6 })} {unidad || ''})</option>
            ))}
        </select>
    )
}

const COLS = '1.6fr 1fr 1fr 1.2fr 1.1fr 78px'
const input = {
    width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: '7px',
    fontSize: '13px', color: '#374151', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box',
}
const btnMini = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '7px', padding: '6px 6px', fontSize: '11px', cursor: 'pointer', width: '100%',
}
