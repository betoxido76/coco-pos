import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X, FlaskConical, Trash2, Pencil } from 'lucide-react'

const fmt = (n, dec = 4) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: dec })

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

const TIPO_COLOR = {
    materia_prima: { bg: '#dbeafe', color: '#1e40af' },
    material_empaque: { bg: '#fef9c3', color: '#854d0e' },
    empaque: { bg: '#fef9c3', color: '#854d0e' },
    consumible: { bg: '#f3e8ff', color: '#7c3aed' },
}

const TABS = [
    { key: 'pt', label: 'Productos terminados' },
    { key: 'mp', label: 'MP Producidas' },
]

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Recetas() {
    const { perfil } = useAuth()
    const [recetas, setRecetas] = useState([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState('pt')
    const [modalAbierto, setModalAbierto] = useState(false)
    const [recetaEditar, setRecetaEditar] = useState(null)

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        const { data } = await supabase
            .from('recetas')
            .select(`
                id, descripcion, merma_pct, activo, rinde_unidades, producto_id, mp_id, created_at,
                productos_terminados(id, nombre, sku, unidad_medida),
                materias_primas(id, nombre, codigo, unidad_medida),
                receta_items(id, tipo_insumo, insumo_id, cantidad, unidad)
            `)
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })
        if (data) setRecetas(data)
        setLoading(false)
    }

    function abrirNueva() {
        setRecetaEditar(null)
        setModalAbierto(true)
    }

    function abrirEditar(receta) {
        setRecetaEditar(receta)
        setModalAbierto(true)
    }

    function cerrarModal() {
        setModalAbierto(false)
        setRecetaEditar(null)
    }

    async function toggleActivo(receta) {
        await supabase.from('recetas').update({ activo: !receta.activo }).eq('id', receta.id)
        cargar()
    }

    const recetasFiltradas = recetas.filter(r => tab === 'pt' ? r.producto_id !== null : r.mp_id !== null)

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Recetas de producción</h2>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>
                        Define los insumos para producir cada producto terminado o materia prima producida
                    </p>
                </div>
                <button onClick={abrirNueva}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={15} /> Nueva receta
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '1px solid #e5e7eb', paddingBottom: '0' }}>
                {TABS.map(t => {
                    const count = recetas.filter(r => t.key === 'pt' ? r.producto_id !== null : r.mp_id !== null).length
                    const activo = tab === t.key
                    return (
                        <button key={t.key} onClick={() => setTab(t.key)} style={{
                            padding: '8px 16px', fontSize: '13px', fontWeight: activo ? 600 : 400,
                            color: activo ? '#1f2937' : '#6b7280',
                            background: 'none', border: 'none', borderBottom: activo ? '2px solid #16a34a' : '2px solid transparent',
                            cursor: 'pointer', marginBottom: '-1px',
                        }}>
                            {t.label}
                            <span style={{
                                marginLeft: '6px', fontSize: '11px', fontWeight: 500,
                                backgroundColor: activo ? '#dcfce7' : '#f3f4f6',
                                color: activo ? '#166534' : '#9ca3af',
                                borderRadius: '10px', padding: '1px 7px',
                            }}>{count}</span>
                        </button>
                    )
                })}
            </div>

            {/* Lista */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading
                    ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                    : recetasFiltradas.length === 0
                        ? (
                            <div style={{ padding: '56px', textAlign: 'center' }}>
                                <FlaskConical size={36} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
                                <p style={{ color: '#9ca3af', fontSize: '14px', margin: 0 }}>
                                    No hay recetas de {tab === 'pt' ? 'productos terminados' : 'MP producidas'}
                                </p>
                                <p style={{ color: '#d1d5db', fontSize: '13px', margin: '4px 0 0' }}>Crea la primera con el botón de arriba</p>
                            </div>
                        )
                        : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {[tab === 'pt' ? 'Producto' : 'MP Producida', 'Rinde', '% Merma', 'Insumos', 'Descripción', 'Estado', ''].map(h => (
                                            <th key={h} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {recetasFiltradas.map(r => {
                                        const esPt = r.producto_id !== null
                                        const nombre = esPt ? r.productos_terminados?.nombre : r.materias_primas?.nombre
                                        const codigo = esPt ? r.productos_terminados?.sku : r.materias_primas?.codigo
                                        const unidad = esPt ? r.productos_terminados?.unidad_medida : r.materias_primas?.unidad_medida
                                        return (
                                            <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{nombre}</span>
                                                    <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px', fontFamily: 'monospace' }}>{codigo}</span>
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: '#374151' }}>
                                                    {fmt(r.rinde_unidades, 3)} {unidad}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: r.merma_pct > 0 ? '#d97706' : '#9ca3af' }}>
                                                    {r.merma_pct > 0 ? `${r.merma_pct}%` : '—'}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: '#374151' }}>
                                                    <span style={{ backgroundColor: '#f3f4f6', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', fontWeight: 500 }}>
                                                        {r.receta_items?.length || 0} ítem(s)
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280', maxWidth: '200px' }}>
                                                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {r.descripcion || '—'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <button onClick={() => toggleActivo(r)} style={{
                                                        padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, border: 'none', cursor: 'pointer',
                                                        backgroundColor: r.activo ? '#dcfce7' : '#f3f4f6',
                                                        color: r.activo ? '#166534' : '#6b7280',
                                                    }}>
                                                        {r.activo ? 'Activa' : 'Inactiva'}
                                                    </button>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <button onClick={() => abrirEditar(r)}
                                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                                        <Pencil size={12} /> Editar
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )
                }
            </div>

            {/* Modal */}
            {modalAbierto && (
                <ModalReceta
                    receta={recetaEditar}
                    tabActivo={tab}
                    onGuardada={() => { cerrarModal(); cargar() }}
                    onCerrar={cerrarModal}
                />
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// MODAL CREAR / EDITAR RECETA
// ══════════════════════════════════════════════════════════════
function ModalReceta({ receta, tabActivo, onGuardada, onCerrar }) {
    const { perfil } = useAuth()
    const esNueva = !receta

    // tipoSalida: 'pt' = producto terminado, 'mp' = materia prima producida
    const tipoInicial = receta ? (receta.mp_id ? 'mp' : 'pt') : tabActivo
    const [tipoSalida, setTipoSalida] = useState(tipoInicial)

    // Maestros
    const [productos, setProductos] = useState([])
    const [mpProducidas, setMpProducidas] = useState([])
    const [insumosMp, setInsumosMp] = useState([])
    const [insumosMe, setInsumosMe] = useState([])
    const [insumosC, setInsumosC] = useState([])

    // Cabecera
    const [productoId, setProductoId] = useState(receta?.producto_id || '')
    const [mpId, setMpId] = useState(receta?.mp_id || '')
    const [descripcion, setDescripcion] = useState(receta?.descripcion || '')
    const [merma, setMerma] = useState(receta?.merma_pct ?? 0)
    const [rinde, setRinde] = useState(receta?.rinde_unidades ?? 1)

    // Items
    const [items, setItems] = useState([])

    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        Promise.all([
            supabase.from('productos_terminados').select('id, nombre, sku, unidad_medida').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('materias_primas').select('id, nombre, codigo, unidad_medida').eq('activo', true).eq('empresa_id', perfil.empresa_id).eq('tipo_producto', 'producido').order('nombre'),
            supabase.from('materias_primas').select('id, nombre, codigo, unidad_medida').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('materiales_empaque').select('id, nombre, codigo, unidad_medida').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
            supabase.from('consumibles').select('id, nombre, codigo, unidad_medida').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre'),
        ]).then(([pt, mpProd, mp, me, co]) => {
            setProductos(pt.data || [])
            setMpProducidas(mpProd.data || [])
            setInsumosMp(mp.data || [])
            setInsumosMe(me.data || [])
            setInsumosC(co.data || [])
        })

        if (!esNueva && receta.receta_items?.length) {
            setItems(receta.receta_items.map(i => ({
                _key: i.id,
                id: i.id,
                tipo_insumo: i.tipo_insumo,
                insumo_id: i.insumo_id,
                cantidad: String(i.cantidad),
                unidad: i.unidad,
                es_nuevo: false,
            })))
        }
    }, [])

    function getListaPorTipo(tipo) {
        if (tipo === 'materia_prima') return insumosMp
        if (tipo === 'material_empaque' || tipo === 'empaque') return insumosMe
        if (tipo === 'consumible') return insumosC
        return []
    }

    function agregarItem() {
        setItems(prev => [...prev, {
            _key: `nuevo-${Date.now()}`,
            id: null,
            tipo_insumo: 'materia_prima',
            insumo_id: '',
            cantidad: '',
            unidad: '',
            es_nuevo: true,
        }])
    }

    function eliminarItem(key) {
        setItems(prev => prev.filter(i => i._key !== key))
    }

    function actualizarItem(key, campo, valor) {
        setItems(prev => prev.map(i => {
            if (i._key !== key) return i
            const updated = { ...i, [campo]: valor }
            if (campo === 'insumo_id' || campo === 'tipo_insumo') {
                const tipo = campo === 'tipo_insumo' ? valor : i.tipo_insumo
                const insumoId = campo === 'insumo_id' ? valor : i.insumo_id
                const lista = getListaPorTipo(tipo)
                const insumo = lista.find(x => x.id === insumoId)
                updated.unidad = insumo?.unidad_medida || i.unidad
                if (campo === 'tipo_insumo') updated.insumo_id = ''
            }
            return updated
        }))
    }

    const esPt = tipoSalida === 'pt'
    const productoSel = esPt
        ? productos.find(p => p.id === productoId)
        : mpProducidas.find(p => p.id === mpId)

    async function guardar() {
        setError('')
        if (esPt && !productoId) return setError('Selecciona un producto terminado')
        if (!esPt && !mpId) return setError('Selecciona una materia prima producida')
        if (Number(rinde) <= 0) return setError('El rendimiento debe ser mayor a 0')
        const itemsValidos = items.filter(i => i.insumo_id && i.cantidad && Number(i.cantidad) > 0)
        if (itemsValidos.length === 0) return setError('Agrega al menos un insumo con cantidad válida')

        setGuardando(true)

        try {
            let recetaId = receta?.id

            const cabecera = {
                producto_id: esPt ? productoId : null,
                mp_id: esPt ? null : mpId,
                descripcion: descripcion.trim() || null,
                merma_pct: Number(merma) || 0,
                rinde_unidades: Number(rinde) || 1,
            }

            if (esNueva) {
                const { data: nueva, error: errReceta } = await supabase
                    .from('recetas')
                    .insert({ ...cabecera, activo: true, empresa_id: perfil.empresa_id })
                    .select()
                    .single()

                if (errReceta) throw new Error(errReceta.message)
                recetaId = nueva.id
            } else {
                const { error: errUpd } = await supabase
                    .from('recetas')
                    .update(cabecera)
                    .eq('id', recetaId)

                if (errUpd) throw new Error(errUpd.message)
                await supabase.from('receta_items').delete().eq('receta_id', recetaId)
            }

            const inserts = itemsValidos.map(i => ({
                receta_id: recetaId,
                tipo_insumo: i.tipo_insumo,
                insumo_id: i.insumo_id,
                cantidad: Number(i.cantidad),
                unidad: i.unidad || '',
                empresa_id: perfil.empresa_id,
            }))

            const { error: errItems } = await supabase.from('receta_items').insert(inserts)
            if (errItems) throw new Error(errItems.message)

            onGuardada()
        } catch (e) {
            setError(e.message || 'Error al guardar')
            setGuardando(false)
        }
    }

    const nombreSalida = esPt ? 'Producto terminado' : 'MP Producida'

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                backgroundColor: '#fff', borderRadius: '16px', padding: '28px',
                width: '640px', maxWidth: '95vw', zIndex: 50,
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                maxHeight: '92vh', overflowY: 'auto',
                boxSizing: 'border-box',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                            {esNueva ? 'Nueva receta' : 'Editar receta'}
                        </h2>
                        {!esNueva && (
                            <p style={{ fontSize: '13px', color: '#6b7280', margin: '3px 0 0' }}>
                                {esPt ? receta.productos_terminados?.nombre : receta.materias_primas?.nombre}
                            </p>
                        )}
                    </div>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                        <X size={20} />
                    </button>
                </div>

                {/* ── SECCIÓN 1: Tipo + Cabecera ── */}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px' }}>
                        Producto y rendimiento
                    </p>

                    {/* Toggle tipo */}
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                        {[
                            { key: 'pt', label: 'Producto terminado', activeColor: '#16a34a', activeBg: '#dcfce7' },
                            { key: 'mp', label: 'MP Producida', activeColor: '#7c3aed', activeBg: '#ede9fe' },
                        ].map(opt => {
                            const activo = tipoSalida === opt.key
                            return (
                                <button key={opt.key}
                                    onClick={() => { if (esNueva) { setTipoSalida(opt.key); setProductoId(''); setMpId('') } }}
                                    style={{
                                        padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 500,
                                        border: `1px solid ${activo ? opt.activeColor : '#e5e7eb'}`,
                                        backgroundColor: activo ? opt.activeBg : '#fff',
                                        color: activo ? opt.activeColor : '#6b7280',
                                        cursor: esNueva ? 'pointer' : 'not-allowed',
                                    }}>
                                    {opt.label}
                                </button>
                            )
                        })}
                        {!esNueva && (
                            <span style={{ fontSize: '11px', color: '#9ca3af', alignSelf: 'center', marginLeft: '4px' }}>
                                (no editable)
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        {/* Selector PT o MP */}
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                                {nombreSalida} *
                            </label>
                            {esNueva ? (
                                esPt ? (
                                    <select value={productoId} onChange={e => setProductoId(e.target.value)} style={inputStyle}>
                                        <option value="">— Selecciona un producto —</option>
                                        {productos.map(p => (
                                            <option key={p.id} value={p.id}>{p.nombre} {p.sku ? `(${p.sku})` : ''}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <select value={mpId} onChange={e => setMpId(e.target.value)} style={inputStyle}>
                                        <option value="">— Selecciona una MP producida —</option>
                                        {mpProducidas.length === 0
                                            ? <option disabled>No hay materias primas con tipo "producido"</option>
                                            : mpProducidas.map(p => (
                                                <option key={p.id} value={p.id}>{p.nombre} {p.codigo ? `(${p.codigo})` : ''}</option>
                                            ))
                                        }
                                    </select>
                                )
                            ) : (
                                <div style={{ ...inputStyle, backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }}>
                                    {esPt
                                        ? `${receta.productos_terminados?.nombre} — ${receta.productos_terminados?.sku || ''}`
                                        : `${receta.materias_primas?.nombre} — ${receta.materias_primas?.codigo || ''}`
                                    }
                                </div>
                            )}
                        </div>

                        {/* Rinde */}
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                                Rinde (unidades producidas) *
                                {productoSel && <span style={{ fontWeight: 400, color: '#9ca3af' }}> en {productoSel.unidad_medida}</span>}
                            </label>
                            <input type="number" min="0.001" step="0.001" value={rinde}
                                onChange={e => setRinde(e.target.value)} style={inputStyle}
                                placeholder="Ej: 100" />
                            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>
                                Cuántas unidades produce esta receta completa
                            </p>
                        </div>

                        {/* Merma */}
                        <div>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                                % de merma estimada
                            </label>
                            <input type="number" min="0" max="100" step="0.01" value={merma}
                                onChange={e => setMerma(e.target.value)} style={inputStyle}
                                placeholder="0" />
                            <p style={{ fontSize: '11px', color: '#9ca3af', margin: '4px 0 0' }}>
                                Pérdida esperada en el proceso (0 si no aplica)
                            </p>
                        </div>

                        {/* Descripción */}
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                                Descripción / observaciones
                            </label>
                            <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
                                placeholder="Notas sobre esta receta..." style={{ ...inputStyle, resize: 'vertical' }} />
                        </div>
                    </div>
                </div>

                {/* ── SECCIÓN 2: Insumos ── */}
                <div style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                            Insumos de la receta
                        </p>
                        <button onClick={agregarItem}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '7px', padding: '5px 12px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                            <Plus size={13} /> Agregar insumo
                        </button>
                    </div>

                    {items.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '28px', border: '2px dashed #e5e7eb', borderRadius: '10px', color: '#9ca3af', fontSize: '13px' }}>
                            Agrega los insumos necesarios para esta receta
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {items.map((item, idx) => (
                                <FilaInsumo
                                    key={item._key}
                                    item={item}
                                    idx={idx}
                                    insumosMp={insumosMp}
                                    insumosMe={insumosMe}
                                    insumosC={insumosC}
                                    onActualizar={(campo, valor) => actualizarItem(item._key, campo, valor)}
                                    onEliminar={() => eliminarItem(item._key)}
                                />
                            ))}
                        </div>
                    )}

                    {items.length > 0 && (
                        <div style={{ marginTop: '12px', backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#166534' }}>
                            <strong>{items.filter(i => i.insumo_id && i.cantidad).length}</strong> insumo(s) con cantidad •
                            esta receta rinde <strong>{fmt(rinde, 3)} {productoSel?.unidad_medida || 'unidades'}</strong>
                            {Number(merma) > 0 && <> • merma estimada <strong>{merma}%</strong></>}
                        </div>
                    )}
                </div>

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '16px' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onCerrar} style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button onClick={guardar} disabled={guardando}
                        style={{ flex: 2, backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: guardando ? 0.7 : 1 }}>
                        {guardando ? 'Guardando...' : esNueva ? '✓ Crear receta' : '✓ Guardar cambios'}
                    </button>
                </div>
            </div>
        </>
    )
}

// ══════════════════════════════════════════════════════════════
// FILA DE INSUMO dentro del modal
// ══════════════════════════════════════════════════════════════
function FilaInsumo({ item, idx, insumosMp, insumosMe, insumosC, onActualizar, onEliminar }) {
    function getOpciones(tipo) {
        if (tipo === 'materia_prima') return insumosMp
        if (tipo === 'material_empaque' || tipo === 'empaque') return insumosMe
        if (tipo === 'consumible') return insumosC
        return []
    }

    const opciones = getOpciones(item.tipo_insumo)
    const insumoSel = opciones.find(x => x.id === item.insumo_id)
    const tc = TIPO_COLOR[item.tipo_insumo] || { bg: '#f3f4f6', color: '#6b7280' }

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px 110px 36px', gap: '8px', alignItems: 'center', backgroundColor: '#f9fafb', borderRadius: '10px', padding: '10px 12px', border: '1px solid #e5e7eb' }}>
            {/* Tipo */}
            <select value={item.tipo_insumo}
                onChange={e => onActualizar('tipo_insumo', e.target.value)}
                style={{ ...inputStyle, fontSize: '12px', padding: '6px 8px', backgroundColor: tc.bg, color: tc.color, fontWeight: 500 }}>
                <option value="materia_prima">Mat. prima</option>
                <option value="material_empaque">Mat. empaque</option>
                <option value="consumible">Consumible</option>
            </select>

            {/* Insumo */}
            <select value={item.insumo_id}
                onChange={e => onActualizar('insumo_id', e.target.value)}
                style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }}>
                <option value="">— Selecciona —</option>
                {opciones.map(o => (
                    <option key={o.id} value={o.id}>
                        {o.nombre}{o.codigo ? ` (${o.codigo})` : ''}
                    </option>
                ))}
            </select>

            {/* Cantidad */}
            <input type="number" min="0" step="0.0001" value={item.cantidad}
                onChange={e => onActualizar('cantidad', e.target.value)}
                placeholder="Cantidad"
                style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px', textAlign: 'right' }} />

            {/* Unidad */}
            <input value={item.unidad || insumoSel?.unidad_medida || ''}
                onChange={e => onActualizar('unidad', e.target.value)}
                placeholder="Unidad"
                style={{ ...inputStyle, fontSize: '13px', padding: '6px 8px' }} />

            {/* Eliminar */}
            <button onClick={onEliminar}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}>
                <Trash2 size={15} />
            </button>
        </div>
    )
}
