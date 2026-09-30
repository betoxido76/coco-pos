// Requisiciones de materiales: consumo interno de ítems que no se venden ni
// están en recetas (en Meraki, el almacén "Consumibles"). docs/plan-requisiciones.md
//
//   pendiente → entregada (almacén despacha: el stock baja por el motor)
//             → anulada   (si estaba entregada, el stock vuelve)
//
// Toda escritura de requisiciones va por RPC (requisiciones.sql):
//   crear_requisicion · entregar_requisicion · anular_requisicion
// Solicitar = módulo 'requisiciones'. Entregar = módulo 'inventario' (almacén).
// El stock solo se muestra a quien tiene 'inventario': los solicitantes no ven
// inventario (decisión 0.3 del plan).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X, FileText, Trash2, Settings, Check } from 'lucide-react'
import FiltroCombo from '../components/FiltroCombo'
import { fmtFechaCorta } from '../components/SelectorFechaTasa'

const fmt = (n, dec = 2) => Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 0, maximumFractionDigits: dec })
const fmtUsd = n => `$${Number(n || 0).toFixed(2)}`

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px',
    fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box',
}

const ESTADOS = {
    pendiente: { bg: '#fef9c3', color: '#854d0e', label: 'Pendiente' },
    entregada: { bg: '#dcfce7', color: '#166534', label: 'Entregada' },
    anulada:   { bg: '#f3f4f6', color: '#6b7280', label: 'Anulada' },
}

// Tipos de ítem que se pueden pedir; consumibles primero (decisión 0.6)
const TIPOS = [
    { key: 'consumible',         label: 'Consumibles',       tabla: 'consumibles',          campoCodigo: 'codigo' },
    { key: 'materia_prima',      label: 'Materia prima',     tabla: 'materias_primas',      campoCodigo: 'codigo' },
    { key: 'material_empaque',   label: 'Material de empaque', tabla: 'materiales_empaque', campoCodigo: 'codigo' },
    { key: 'producto_terminado', label: 'Producto terminado', tabla: 'productos_terminados', campoCodigo: 'sku' },
]

function BadgeEstado({ estado }) {
    const s = ESTADOS[estado] || ESTADOS.pendiente
    return <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap' }}>{s.label}</span>
}

function usePermisos() {
    const { perfil, modulosActivos } = useAuth()
    const mods = modulosActivos || []
    const esSuper = perfil?.rol === 'superadmin'
    return {
        puedeSolicitar: esSuper || mods.includes('requisiciones'),
        esAlmacen: esSuper || mods.includes('inventario'),   // entrega, ve stock, anula entregadas
    }
}

// ══════════════════════════════════════════════════════════════
// PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Requisiciones() {
    const { perfil } = useAuth()
    const { puedeSolicitar, esAlmacen } = usePermisos()
    const [vista, setVista] = useState('lista')   // 'lista' | 'nueva' | { detalle: id }
    const [reqs, setReqs] = useState([])
    const [areas, setAreas] = useState([])
    const [cargando, setCargando] = useState(true)
    const [fEstado, setFEstado] = useState('pendiente')
    const [fArea, setFArea] = useState('')
    const [fSolicitante, setFSolicitante] = useState('')
    const [modalAreas, setModalAreas] = useState(false)

    async function cargarAreas() {
        const { data } = await supabase.from('areas_consumo').select('id, nombre, activa')
            .eq('empresa_id', perfil.empresa_id).order('nombre')
        setAreas(data || [])
    }

    async function cargar() {
        setCargando(true)
        let q = supabase.from('requisiciones')
            .select('id, numero_requisicion, fecha, estado, area_id, solicitante_id, fecha_entrega, areas_consumo(nombre), almacenes(nombre), usuarios!solicitante_id(nombre), requisicion_items(id)')
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })
            .limit(300)
        if (fEstado) q = q.eq('estado', fEstado)
        const { data } = await q
        setReqs(data || [])
        setCargando(false)
    }

    useEffect(() => { if (perfil?.empresa_id) cargarAreas() }, [perfil?.empresa_id])
    useEffect(() => { if (perfil?.empresa_id) cargar() }, [perfil?.empresa_id, fEstado])

    if (vista === 'nueva') return (
        <NuevaRequisicion areas={areas.filter(a => a.activa)}
            onCreada={id => { cargar(); setVista({ detalle: id }) }}
            onCancelar={() => setVista('lista')} />
    )
    if (vista?.detalle) return (
        <DetalleRequisicion id={vista.detalle} onVolver={() => { cargar(); setVista('lista') }} />
    )

    const opcSolicitantes = [...new Map(reqs.filter(r => r.usuarios).map(r => [r.solicitante_id, { value: r.solicitante_id, label: r.usuarios.nombre }])).values()]
        .sort((a, b) => a.label.localeCompare(b.label))
    const filtradas = reqs.filter(r => (!fArea || r.area_id === fArea) && (!fSolicitante || r.solicitante_id === fSolicitante))

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Requisiciones</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Solicitud y entrega de materiales para consumo interno</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setModalAreas(true)}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#fff', color: '#374151', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', cursor: 'pointer' }}>
                        <Settings size={15} /> Áreas
                    </button>
                    {puedeSolicitar && (
                        <button onClick={() => setVista('nueva')}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                            <Plus size={16} /> Nueva requisición
                        </button>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '16px' }}>
                <FiltroCombo label="Estado" value={fEstado} onChange={setFEstado} width="160px"
                    options={Object.entries(ESTADOS).map(([value, s]) => ({ value, label: s.label }))} />
                <FiltroCombo label="Área" value={fArea} onChange={setFArea} width="200px"
                    options={areas.map(a => ({ value: a.id, label: a.nombre }))} />
                <FiltroCombo label="Solicitante" value={fSolicitante} onChange={setFSolicitante} width="220px" options={opcSolicitantes} />
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {cargando ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>
                    : filtradas.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>
                        {reqs.length === 0 && !fEstado ? 'No hay requisiciones registradas.' : 'No hay requisiciones para los filtros seleccionados.'}
                    </div> : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['N°', 'Fecha', 'Área', 'Solicitante', 'Almacén', 'Ítems', 'Estado', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{r.numero_requisicion}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{fmtFechaCorta(r.fecha)}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{r.areas_consumo?.nombre || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{r.usuarios?.nombre || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{r.almacenes?.nombre || '—'}</td>
                                        <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{r.requisicion_items?.length || 0}</td>
                                        <td style={{ padding: '12px 16px' }}><BadgeEstado estado={r.estado} /></td>
                                        <td style={{ padding: '12px 16px' }}>
                                            <button onClick={() => setVista({ detalle: r.id })}
                                                style={{ display: 'flex', alignItems: 'center', gap: '4px', background: r.estado === 'pendiente' && esAlmacen ? '#16a34a' : 'none', color: r.estado === 'pendiente' && esAlmacen ? '#fff' : '#374151', border: r.estado === 'pendiente' && esAlmacen ? 'none' : '1px solid #e5e7eb', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                                <FileText size={13} /> {r.estado === 'pendiente' && esAlmacen ? 'Entregar' : 'Ver'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
            </div>

            {modalAreas && <ModalAreas areas={areas} onCambio={cargarAreas} onCerrar={() => setModalAreas(false)} />}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// NUEVA REQUISICIÓN
// ══════════════════════════════════════════════════════════════
function NuevaRequisicion({ areas, onCreada, onCancelar }) {
    const { perfil } = useAuth()
    const { esAlmacen } = usePermisos()
    const [areaId, setAreaId] = useState('')
    const [almacenes, setAlmacenes] = useState([])
    const [almacenId, setAlmacenId] = useState('')
    const [notas, setNotas] = useState('')
    const [catalogo, setCatalogo] = useState({})       // tipo -> [{ id, nombre, codigo, unidad }]
    const [stock, setStock] = useState({})             // item_id -> cantidad en el almacén elegido
    const [lineas, setLineas] = useState([])           // [{ _key, tipo, itemId, cantidad }]
    const [tipoNuevo, setTipoNuevo] = useState('consumible')
    const [itemNuevo, setItemNuevo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        supabase.from('almacenes').select('id, nombre, es_default').eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')
            .then(({ data }) => {
                const lista = data || []
                setAlmacenes(lista)
                // Por defecto, el almacén de consumibles si existe
                const def = lista.find(a => /consum/i.test(a.nombre)) || lista.find(a => a.es_default) || lista[0]
                if (def) setAlmacenId(def.id)
            })
        Promise.all(TIPOS.map(t => supabase.from(t.tabla).select(`id, nombre, ${t.campoCodigo}, unidad_medida`)
            .eq('empresa_id', perfil.empresa_id).eq('activo', true).order('nombre')))
            .then(res => {
                const cat = {}
                TIPOS.forEach((t, i) => {
                    cat[t.key] = (res[i].data || []).map(x => ({ id: x.id, nombre: x.nombre, codigo: x[t.campoCodigo], unidad: x.unidad_medida }))
                })
                setCatalogo(cat)
            })
    }, [])

    // Stock del almacén elegido: solo para quien tiene inventario
    useEffect(() => {
        if (!esAlmacen || !almacenId) { setStock({}); return }
        supabase.from('stock_ubicacion').select('item_id, cantidad')
            .eq('empresa_id', perfil.empresa_id).eq('almacen_id', almacenId)
            .then(({ data }) => {
                const m = {}
                ;(data || []).forEach(s => { m[s.item_id] = (m[s.item_id] || 0) + Number(s.cantidad || 0) })
                setStock(m)
            })
    }, [almacenId, esAlmacen])

    const itemDe = l => (catalogo[l.tipo] || []).find(x => x.id === l.itemId)

    function agregar(id) {
        if (!id) return
        if (lineas.some(l => l.tipo === tipoNuevo && l.itemId === id)) { setItemNuevo(''); return }
        setLineas(prev => [...prev, { _key: `${tipoNuevo}-${id}`, tipo: tipoNuevo, itemId: id, cantidad: '' }])
        setItemNuevo('')
    }

    async function guardar() {
        setError('')
        if (!areaId) return setError('Elige el área que solicita')
        if (!almacenId) return setError('Elige el almacén')
        if (lineas.length === 0) return setError('Agrega al menos un ítem')
        if (lineas.some(l => !(Number(l.cantidad) > 0))) return setError('Todas las cantidades deben ser mayores a cero')
        setGuardando(true)
        const { data, error: err } = await supabase.rpc('crear_requisicion', {
            p_area_id: areaId, p_almacen_id: almacenId, p_notas: notas,
            p_items: lineas.map(l => ({ tipo_item: l.tipo, item_id: l.itemId, cantidad: Number(l.cantidad) })),
        })
        if (err) { setError(err.message); setGuardando(false); return }
        onCreada(data.id)
    }

    const label = { fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }
    const opcionesItem = (catalogo[tipoNuevo] || []).map(x => ({ value: x.id, label: `${x.nombre}${x.codigo ? ` (${x.codigo})` : ''}` }))

    return (
        <div style={{ padding: '24px', maxWidth: '760px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Nueva requisición</h1>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={label}>Área que solicita *</label>
                        <select value={areaId} onChange={e => setAreaId(e.target.value)} style={inputStyle}>
                            <option value="">— Elige un área —</option>
                            {areas.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={label}>Almacén *</label>
                        <select value={almacenId} onChange={e => setAlmacenId(e.target.value)} style={inputStyle}>
                            {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label style={label}>Ítems</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '10px' }}>
                        <select value={tipoNuevo} onChange={e => { setTipoNuevo(e.target.value); setItemNuevo('') }} style={{ ...inputStyle, width: '190px' }}>
                            {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        <FiltroCombo value={itemNuevo} onChange={agregar} options={opcionesItem} placeholder="Buscar y agregar ítem…" width="360px" />
                    </div>

                    {lineas.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px', border: '2px dashed #e5e7eb', borderRadius: '10px', color: '#9ca3af', fontSize: '13px' }}>
                            Busca los ítems que necesitas y agrégalos
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    {['Ítem', ...(esAlmacen ? ['En almacén'] : []), 'Cantidad', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '8px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: h === 'Ítem' ? 'left' : 'right' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {lineas.map(l => {
                                    const it = itemDe(l)
                                    const disp = stock[l.itemId] || 0
                                    return (
                                        <tr key={l._key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '8px', fontSize: '13px', color: '#1f2937' }}>
                                                {it?.nombre || '—'}
                                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>{TIPOS.find(t => t.key === l.tipo)?.label}</span>
                                            </td>
                                            {esAlmacen && (
                                                <td style={{ padding: '8px', fontSize: '13px', textAlign: 'right', color: Number(l.cantidad) > disp ? '#dc2626' : '#6b7280' }}>
                                                    {fmt(disp)} {it?.unidad}
                                                </td>
                                            )}
                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <input type="number" min="0" step="any" value={l.cantidad}
                                                        onChange={e => setLineas(prev => prev.map(x => x._key === l._key ? { ...x, cantidad: e.target.value } : x))}
                                                        style={{ ...inputStyle, width: '110px', textAlign: 'right', padding: '6px 8px' }} />
                                                    <span style={{ fontSize: '12px', color: '#6b7280', minWidth: '40px', textAlign: 'left' }}>{it?.unidad}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                <button onClick={() => setLineas(prev => prev.filter(x => x._key !== l._key))}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={15} /></button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div>
                    <label style={label}>Notas <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
                    <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Para qué se necesita, urgencia…"
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>{error}</div>}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.7 : 1 }}>
                        <Check size={16} /> {guardando ? 'Guardando...' : 'Registrar requisición'}
                    </button>
                    <button onClick={onCancelar}
                        style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                </div>
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: 0 }}>La requisición queda pendiente: el inventario baja cuando almacén la entrega.</p>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// DETALLE (imprimible) + ENTREGAR + ANULAR
// ══════════════════════════════════════════════════════════════
function DetalleRequisicion({ id, onVolver }) {
    const { perfil } = useAuth()
    const { esAlmacen } = usePermisos()
    const [req, setReq] = useState(null)
    const [items, setItems] = useState([])
    const [stock, setStock] = useState({})
    const [entregar, setEntregar] = useState({})   // item.id -> cantidad a entregar
    const [procesando, setProcesando] = useState(false)
    const [error, setError] = useState('')
    const [anulando, setAnulando] = useState(false)
    const [userId, setUserId] = useState(null)

    async function cargar() {
        const [{ data: r }, { data: its }, { data: { user } }] = await Promise.all([
            supabase.from('requisiciones')
                .select('*, areas_consumo(nombre), almacenes(nombre), sol:usuarios!solicitante_id(nombre), ent:usuarios!entregado_por(nombre), anu:usuarios!anulado_por(nombre)')
                .eq('empresa_id', perfil.empresa_id).eq('id', id).single(),
            supabase.from('requisicion_items').select('*').eq('empresa_id', perfil.empresa_id).eq('requisicion_id', id).order('item_nombre'),
            supabase.auth.getUser(),
        ])
        setReq(r); setItems(its || []); setUserId(user?.id || null)
        setEntregar(Object.fromEntries((its || []).map(i => [i.id, String(i.cantidad_solicitada)])))
        if (esAlmacen && r?.estado === 'pendiente' && its?.length) {
            const { data: st } = await supabase.from('stock_ubicacion').select('item_id, cantidad')
                .eq('empresa_id', perfil.empresa_id).eq('almacen_id', r.almacen_id).in('item_id', its.map(i => i.item_id))
            const m = {}
            ;(st || []).forEach(s => { m[s.item_id] = (m[s.item_id] || 0) + Number(s.cantidad || 0) })
            setStock(m)
        }
    }
    useEffect(() => { if (perfil?.empresa_id) cargar() }, [perfil?.empresa_id, id])

    if (!req) return <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>

    const pendiente = req.estado === 'pendiente'
    const puedeEntregar = esAlmacen && pendiente
    const puedeAnular = req.estado !== 'anulada' && (esAlmacen || (pendiente && req.solicitante_id === userId))
    const faltantes = puedeEntregar ? items.filter(i => Number(entregar[i.id] || 0) > (stock[i.item_id] || 0)) : []
    const costoTotal = items.reduce((s, i) => s + Number(i.cantidad_entregada || 0) * Number(i.costo_unitario || 0), 0)

    async function confirmarEntrega(permitirFaltante = false) {
        setError('')
        if (items.some(i => Number(entregar[i.id]) < 0 || entregar[i.id] === '')) { setError('Revisa las cantidades a entregar'); return }
        if (!permitirFaltante && faltantes.length > 0) {
            const ok = window.confirm(`No hay stock suficiente en ${req.almacenes?.nombre} para: ${faltantes.map(f => f.item_nombre).join(', ')}.\n\n¿Entregar igual? El faltante queda registrado como salida sin almacén.`)
            if (!ok) return
            permitirFaltante = true
        }
        setProcesando(true)
        const { error: err } = await supabase.rpc('entregar_requisicion', {
            p_requisicion_id: req.id,
            p_items: items.map(i => ({ id: i.id, cantidad_entregada: Number(entregar[i.id] || 0) })),
            p_permitir_faltante: permitirFaltante,
        })
        setProcesando(false)
        if (err) { setError(err.message); return }
        cargar()
    }

    const cel = { padding: '10px 8px', fontSize: '13px', color: '#374151', borderBottom: '1px solid #f3f4f6' }
    const th = { padding: '8px', fontSize: '11px', fontWeight: 600, color: '#6b7280', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '2px solid #e5e7eb' }
    const firma = (titulo, nombre) => (
        <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ borderTop: '1px solid #374151', margin: '48px 12px 6px' }} />
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151' }}>{titulo}</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>{nombre || ' '}</div>
        </div>
    )

    return (
        <div className="print-target" style={{ padding: '24px', maxWidth: '820px' }}>
            <style>{`@media print { body * { visibility: hidden; } .print-target, .print-target * { visibility: visible; } .print-target { position: fixed; top: 0; left: 0; width: 100% !important; max-width: none !important; margin: 0; padding: 20px !important; background: white !important; } .no-print { display: none !important; } }`}</style>

            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0, fontFamily: 'monospace' }}>{req.numero_requisicion}</h1>
                <BadgeEstado estado={req.estado} />
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    {puedeAnular && (
                        <button onClick={() => setAnulando(true)}
                            style={{ background: '#fff', border: '1px solid #fecaca', color: '#dc2626', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer' }}>
                            Anular
                        </button>
                    )}
                    <button onClick={() => window.print()}
                        style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                        🖨️ Imprimir vale
                    </button>
                </div>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '24px 28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>Vale de requisición de materiales</div>
                        <div style={{ fontSize: '13px', color: '#6b7280', fontFamily: 'monospace', marginTop: '2px' }}>{req.numero_requisicion}</div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '12px', color: '#6b7280' }}>
                        <div>Fecha: {fmtFechaCorta(req.fecha)}</div>
                        <div style={{ marginTop: '4px' }}><BadgeEstado estado={req.estado} /></div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px 16px', marginBottom: '18px' }}>
                    {[
                        ['Área', req.areas_consumo?.nombre],
                        ['Solicitante', req.sol?.nombre],
                        ['Almacén', req.almacenes?.nombre],
                        ...(req.estado === 'entregada' ? [['Entregado', `${req.ent?.nombre || '—'} · ${new Date(req.fecha_entrega).toLocaleDateString('es-VE')}`]] : []),
                    ].map(([l, v]) => (
                        <div key={l}>
                            <div style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l}</div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937' }}>{v || '—'}</div>
                        </div>
                    ))}
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
                    <thead>
                        <tr>
                            <th style={th}>Ítem</th>
                            <th style={{ ...th, textAlign: 'right' }}>Solicitado</th>
                            {puedeEntregar && <th style={{ ...th, textAlign: 'right' }} className="no-print">En almacén</th>}
                            <th style={{ ...th, textAlign: 'right' }}>{puedeEntregar ? 'A entregar' : 'Entregado'}</th>
                            {esAlmacen && req.estado === 'entregada' && <th style={{ ...th, textAlign: 'right' }}>Costo</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(i => {
                            const disp = stock[i.item_id] || 0
                            return (
                                <tr key={i.id}>
                                    <td style={cel}>
                                        {i.item_nombre}{i.item_codigo && <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>{i.item_codigo}</span>}
                                    </td>
                                    <td style={{ ...cel, textAlign: 'right' }}>{fmt(i.cantidad_solicitada, 4)} {i.unidad}</td>
                                    {puedeEntregar && (
                                        <td className="no-print" style={{ ...cel, textAlign: 'right', color: Number(entregar[i.id]) > disp ? '#dc2626' : '#6b7280' }}>{fmt(disp, 4)}</td>
                                    )}
                                    <td style={{ ...cel, textAlign: 'right' }}>
                                        {puedeEntregar ? (
                                            <input type="number" min="0" step="any" value={entregar[i.id] ?? ''}
                                                onChange={e => setEntregar(prev => ({ ...prev, [i.id]: e.target.value }))}
                                                style={{ ...inputStyle, width: '110px', textAlign: 'right', padding: '6px 8px' }} />
                                        ) : i.cantidad_entregada != null ? `${fmt(i.cantidad_entregada, 4)} ${i.unidad || ''}` : '—'}
                                    </td>
                                    {esAlmacen && req.estado === 'entregada' && (
                                        <td style={{ ...cel, textAlign: 'right' }}>{fmtUsd(Number(i.cantidad_entregada || 0) * Number(i.costo_unitario || 0))}</td>
                                    )}
                                </tr>
                            )
                        })}
                    </tbody>
                    {esAlmacen && req.estado === 'entregada' && (
                        <tfoot>
                            <tr><td colSpan={3} style={{ ...cel, fontWeight: 600, textAlign: 'right' }}>Costo total</td><td style={{ ...cel, fontWeight: 700, textAlign: 'right' }}>{fmtUsd(costoTotal)}</td></tr>
                        </tfoot>
                    )}
                </table>

                {req.notas && <p style={{ fontSize: '13px', color: '#374151', margin: '0 0 12px' }}><strong>Notas:</strong> {req.notas}</p>}
                {req.estado === 'anulada' && (
                    <div style={{ backgroundColor: '#f3f4f6', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                        Anulada por {req.anu?.nombre || '—'} el {new Date(req.fecha_anulacion).toLocaleDateString('es-VE')} — {req.motivo_anulacion}
                        {req.fecha_entrega && ' · el stock entregado se devolvió al almacén'}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                    {firma('Solicitado por', req.sol?.nombre)}
                    {firma('Entregado por', req.ent?.nombre)}
                    {firma('Recibido por', '')}
                </div>
            </div>

            {puedeEntregar && (
                <div className="no-print" style={{ marginTop: '16px' }}>
                    {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginBottom: '10px' }}>{error}</div>}
                    <button onClick={() => confirmarEntrega(false)} disabled={procesando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 22px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: procesando ? 0.7 : 1 }}>
                        <Check size={16} /> {procesando ? 'Entregando...' : 'Confirmar entrega'}
                    </button>
                    <p style={{ fontSize: '12px', color: '#9ca3af', margin: '6px 0 0' }}>
                        Al confirmar, el inventario de {req.almacenes?.nombre} baja por lo entregado. Una línea en 0 no se entrega.
                    </p>
                </div>
            )}

            {anulando && (
                <ModalAnular req={req} onCerrar={() => setAnulando(false)} onAnulada={() => { setAnulando(false); cargar() }} />
            )}
        </div>
    )
}

function ModalAnular({ req, onAnulada, onCerrar }) {
    const [motivo, setMotivo] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    async function confirmar() {
        if (!motivo.trim()) { setError('Indica el motivo'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.rpc('anular_requisicion', { p_requisicion_id: req.id, p_motivo: motivo.trim() })
        if (err) { setError(err.message); setGuardando(false); return }
        onAnulada()
    }
    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '420px' }}>
                <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>Anular {req.numero_requisicion}</h2>
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#991b1b', margin: '12px 0' }}>
                    {req.estado === 'entregada'
                        ? `Ya fue entregada: lo entregado vuelve al stock de ${req.almacenes?.nombre}.`
                        : 'Todavía no se entregó: se anula sin mover inventario.'}
                </div>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }}>Motivo *</label>
                <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
                    style={{ ...inputStyle, fontSize: '13px', resize: 'vertical', fontFamily: 'inherit' }} />
                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginTop: '12px' }}>{error}</div>}
                <div style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
                    <button onClick={onCerrar} disabled={guardando} style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>Cancelar</button>
                    <button onClick={confirmar} disabled={guardando}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#fff', backgroundColor: '#dc2626', cursor: 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Anulando...' : 'Anular requisición'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// ÁREAS (editables por empresa, decisión 0.4)
// ══════════════════════════════════════════════════════════════
function ModalAreas({ areas, onCambio, onCerrar }) {
    const { perfil } = useAuth()
    const [nueva, setNueva] = useState('')
    const [editando, setEditando] = useState(null)   // { id, nombre }
    const [error, setError] = useState('')

    const mensaje = err => err.code === '23505' ? 'Ya existe un área con ese nombre' : err.message

    async function agregar() {
        if (!nueva.trim()) return
        setError('')
        const { error: err } = await supabase.from('areas_consumo').insert({ empresa_id: perfil.empresa_id, nombre: nueva.trim() })
        if (err) { setError(mensaje(err)); return }
        setNueva(''); onCambio()
    }
    async function guardarEdicion() {
        if (!editando?.nombre.trim()) return
        setError('')
        const { error: err } = await supabase.from('areas_consumo').update({ nombre: editando.nombre.trim() })
            .eq('id', editando.id).eq('empresa_id', perfil.empresa_id)
        if (err) { setError(mensaje(err)); return }
        setEditando(null); onCambio()
    }
    async function toggle(a) {
        await supabase.from('areas_consumo').update({ activa: !a.activa }).eq('id', a.id).eq('empresa_id', perfil.empresa_id)
        onCambio()
    }

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Áreas que solicitan</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>
                {areas.map(a => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid #f3f4f6', opacity: a.activa ? 1 : 0.5 }}>
                        {editando?.id === a.id ? (
                            <>
                                <input value={editando.nombre} autoFocus onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditando(null) }}
                                    style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }} />
                                <button onClick={guardarEdicion} style={{ padding: '6px 10px', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: '12px', cursor: 'pointer' }}>Guardar</button>
                            </>
                        ) : (
                            <>
                                <span style={{ flex: 1, fontSize: '14px', color: '#1f2937' }}>{a.nombre}{!a.activa && ' (inactiva)'}</span>
                                <button onClick={() => { setEditando({ id: a.id, nombre: a.nombre }); setError('') }}
                                    style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>Renombrar</button>
                                <button onClick={() => toggle(a)}
                                    style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', color: a.activa ? '#dc2626' : '#16a34a', cursor: 'pointer' }}>
                                    {a.activa ? 'Desactivar' : 'Activar'}
                                </button>
                            </>
                        )}
                    </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                    <input value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregar()}
                        placeholder="Nueva área…" style={{ ...inputStyle, fontSize: '13px' }} />
                    <button onClick={agregar}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <Plus size={14} /> Agregar
                    </button>
                </div>
                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginTop: '12px' }}>{error}</div>}
                <p style={{ fontSize: '12px', color: '#9ca3af', margin: '12px 0 0' }}>Las áreas no se borran (quedan en requisiciones anteriores): se desactivan.</p>
            </div>
        </div>
    )
}
