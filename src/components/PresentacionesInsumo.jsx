// Editor de presentaciones de compra de un insumo (MP, empaque, consumible).
// Solo edita filas en memoria; el maestro las guarda con guardarPresentaciones()
// después de guardar el insumo. docs/plan-presentaciones-insumos.md
import { Plus, X } from 'lucide-react'
import { filaNueva, textoFactor } from '../lib/presentaciones'
import { fmtCosto } from '../lib/costos'

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

const COLS = '1.6fr 1fr 1fr 1.2fr 1.1fr 78px'
const input = {
    width: '100%', padding: '7px 9px', border: '1px solid #d1d5db', borderRadius: '7px',
    fontSize: '13px', color: '#374151', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box',
}
const btnMini = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '7px', padding: '6px 6px', fontSize: '11px', cursor: 'pointer', width: '100%',
}
