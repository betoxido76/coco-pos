import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Plus, Search, Trash2, Check, CheckCircle, FileText, X, AlertTriangle, Truck, ClipboardList, ArrowRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

// ─── Componente principal ──────────────────────────────────────
const PAGE_SIZE = 50

export default function Compras() {
    const { perfil } = useAuth()
    const [tabActiva, setTabActiva] = useState('ordenes')
    const [vista, setVista] = useState('lista')
    const [loading, setLoading] = useState(true)

    const [ordenes, setOrdenes] = useState([])
    const [ordenActual, setOrdenActual] = useState(null)
    const [recepciones, setRecepciones] = useState([])
    const [recepcionActual, setRecepcionActual] = useState(null)

    const [paginaOrdenes, setPaginaOrdenes] = useState(0)
    const [totalOrdenes, setTotalOrdenes] = useState(0)
    const [paginaRecepciones, setPaginaRecepciones] = useState(0)
    const [totalRecepciones, setTotalRecepciones] = useState(0)

    useEffect(() => {
        if (tabActiva === 'ordenes') cargarOrdenes()
        else cargarRecepciones()
    }, [tabActiva, paginaOrdenes, paginaRecepciones])

    async function cargarOrdenes() {
        setLoading(true)
        const { data, count } = await supabase
            .from('ordenes_compra')
            .select(`*, proveedores(nombre)`, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(paginaOrdenes * PAGE_SIZE, (paginaOrdenes + 1) * PAGE_SIZE - 1)
        if (data) setOrdenes(data)
        if (count !== null) setTotalOrdenes(count)
        setLoading(false)
    }

    async function cargarRecepciones() {
        setLoading(true)
        const { data, count } = await supabase
            .from('compras')
            .select(`*, proveedores(nombre), ordenes_compra(numero_oc)`, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(paginaRecepciones * PAGE_SIZE, (paginaRecepciones + 1) * PAGE_SIZE - 1)
        if (data) setRecepciones(data)
        if (count !== null) setTotalRecepciones(count)
        setLoading(false)
    }

    function abrirDetalleOC(oc) { setOrdenActual(oc); setVista('detalle_oc') }
    function abrirDetalleRecepcion(rec) { setRecepcionActual(rec); setVista('detalle_recepcion') }

    if (vista === 'nueva_oc')
        return <NuevaOrden onCreada={(oc) => { cargarOrdenes(); setOrdenActual(oc); setVista('detalle_oc') }} onCancelar={() => setVista('lista')} />

    if (vista === 'nueva_recepcion')
        return <NuevaRecepcion
            onCreada={(rec) => { cargarRecepciones(); setRecepcionActual(rec); setVista('detalle_recepcion') }}
            onCancelar={() => setVista('lista')}
        />

    if (vista === 'detalle_oc')
        return <DetalleOrden orden={ordenActual} onVolver={() => { cargarOrdenes(); setVista('lista') }} />

    if (vista === 'detalle_recepcion')
        return <DetalleRecepcion recepcion={recepcionActual} onVolver={() => { cargarRecepciones(); setVista('lista') }} />

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Gestión de Compras</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Órdenes de compra y recepción de inventario</p>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'ordenes', label: 'Órdenes de Compra', icon: ClipboardList },
                    { key: 'recepciones', label: 'Recepciones', icon: Truck }
                ].map(tab => (
                    <button key={tab.key} onClick={() => { setTabActiva(tab.key); setVista('lista') }}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: tabActiva === tab.key ? '#16a34a' : '#e5e7eb',
                            backgroundColor: tabActiva === tab.key ? '#f0fdf4' : '#fff',
                            color: tabActiva === tab.key ? '#16a34a' : '#6b7280'
                        }}>
                        <tab.icon size={14} /> {tab.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                <button onClick={() => setVista(tabActiva === 'ordenes' ? 'nueva_oc' : 'nueva_recepcion')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> {tabActiva === 'ordenes' ? 'Nueva Orden' : 'Nueva Recepción'}
                </button>
            </div>

            {tabActiva === 'ordenes' && (
                <>
                    <TablaOrdenes ordenes={ordenes} loading={loading} onVer={abrirDetalleOC} />
                    {totalOrdenes > PAGE_SIZE && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', marginTop: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                Mostrando {paginaOrdenes * PAGE_SIZE + 1}–{Math.min((paginaOrdenes + 1) * PAGE_SIZE, totalOrdenes)} de {totalOrdenes}
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setPaginaOrdenes(p => p - 1)} disabled={paginaOrdenes === 0}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: paginaOrdenes === 0 ? '#d1d5db' : '#374151', cursor: paginaOrdenes === 0 ? 'default' : 'pointer' }}>
                                    ← Anterior
                                </button>
                                <button onClick={() => setPaginaOrdenes(p => p + 1)} disabled={(paginaOrdenes + 1) * PAGE_SIZE >= totalOrdenes}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: (paginaOrdenes + 1) * PAGE_SIZE >= totalOrdenes ? '#d1d5db' : '#374151', cursor: (paginaOrdenes + 1) * PAGE_SIZE >= totalOrdenes ? 'default' : 'pointer' }}>
                                    Siguiente →
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
            {tabActiva === 'recepciones' && (
                <>
                    <TablaRecepciones recepciones={recepciones} loading={loading} onVer={abrirDetalleRecepcion} />
                    {totalRecepciones > PAGE_SIZE && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', marginTop: '8px' }}>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>
                                Mostrando {paginaRecepciones * PAGE_SIZE + 1}–{Math.min((paginaRecepciones + 1) * PAGE_SIZE, totalRecepciones)} de {totalRecepciones}
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setPaginaRecepciones(p => p - 1)} disabled={paginaRecepciones === 0}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: paginaRecepciones === 0 ? '#d1d5db' : '#374151', cursor: paginaRecepciones === 0 ? 'default' : 'pointer' }}>
                                    ← Anterior
                                </button>
                                <button onClick={() => setPaginaRecepciones(p => p + 1)} disabled={(paginaRecepciones + 1) * PAGE_SIZE >= totalRecepciones}
                                    style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: (paginaRecepciones + 1) * PAGE_SIZE >= totalRecepciones ? '#d1d5db' : '#374151', cursor: (paginaRecepciones + 1) * PAGE_SIZE >= totalRecepciones ? 'default' : 'pointer' }}>
                                    Siguiente →
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// ─── Tablas de Listado ──────────────────────────────────────
function TablaOrdenes({ ordenes, loading, onVer }) {
    return (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {loading ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div> : ordenes.length === 0 ?
                <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No hay órdenes registradas.</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['OC #', 'Proveedor', 'Emisión', 'Entrega', 'Total', 'Estado', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', textAlign: i === 4 ? 'right' : 'left', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {ordenes.map(o => (
                                <tr key={o.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{o.numero_oc}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{o.proveedores?.nombre || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{new Date(o.fecha_emision).toLocaleDateString('es-VE')}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{o.fecha_entrega_esperada ? new Date(o.fecha_entrega_esperada).toLocaleDateString('es-VE') : '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(o.total)}</td>
                                    <td style={{ padding: '12px 16px' }}><BadgeOC estado={o.estado} /></td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <button onClick={() => onVer(o)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                            <FileText size={13} /> Ver
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
        </div>
    )
}

function TablaRecepciones({ recepciones, loading, onVer }) {
    return (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            {loading ? <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div> : recepciones.length === 0 ?
                <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No hay recepciones registradas.</div> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Doc', 'Proveedor', 'Fecha', 'OC Vinculada', 'Total', 'Cobro', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 16px', textAlign: i === 4 ? 'right' : 'left', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {recepciones.map(r => (
                                <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontFamily: 'monospace', color: '#374151' }}>{r.numero_doc || 'S/N'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#374151' }}>{r.proveedores?.nombre || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', color: '#6b7280' }}>{new Date(r.fecha_compra).toLocaleDateString('es-VE')}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '12px', color: '#6b7280' }}>{r.ordenes_compra?.numero_oc || '—'}</td>
                                    <td style={{ padding: '12px 16px', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(r.total)}</td>
                                    <td style={{ padding: '12px 16px' }}><BadgeCobro estado={r.estado_cobro || 'pendiente'} /></td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <button onClick={() => onVer(r)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#374151', cursor: 'pointer' }}>
                                            <FileText size={13} /> Ver
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
        </div>
    )
}

// ─── Badges ────────────────────────────────────────────────────
function BadgeOC({ estado }) {
    const estilos = {
        pendiente: { bg: '#fef9c3', color: '#854d0e' },
        aprobada: { bg: '#dbeafe', color: '#1e40af' },
        recibida_parcial: { bg: '#f0fdf4', color: '#166534' },
        recibida_total: { bg: '#dcfce7', color: '#166534' },
        cancelada: { bg: '#fee2e2', color: '#991b1b' },
    }
    const s = estilos[estado] || estilos.pendiente
    return <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{estado.replace('_', ' ')}</span>
}

function BadgeCobro({ estado }) {
    const estilos = { pendiente: { bg: '#fef9c3', color: '#854d0e' }, parcial: { bg: '#dbeafe', color: '#1e40af' }, pagado: { bg: '#dcfce7', color: '#166534' } }
    const s = estilos[estado] || estilos.pendiente
    return <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>{estado}</span>
}

// ─── Panel búsqueda avanzada autopartes (compartido OC y Recepción) ──
function PanelBusquedaAutopartes({ perfil, insumos, onAgregar }) {
    const [filtroNroParte, setFiltroNroParte] = useState('')
    const [filtroMarca, setFiltroMarca] = useState('')
    const [filtroTipo, setFiltroTipo] = useState('')
    const [filtroCat, setFiltroCat] = useState('')
    const [busqueda, setBusqueda] = useState('')
    const [marcasRepuesto, setMarcasRepuesto] = useState([])
    const [tiposRepuesto, setTiposRepuesto] = useState([])
    const [categoriasRepuesto, setCategoriasRepuesto] = useState([])
    const [marcaV, setMarcaV] = useState('')
    const [modeloV, setModeloV] = useState('')
    const [anioV, setAnioV] = useState('')
    const [marcasV, setMarcasV] = useState([])
    const [modelosV, setModelosV] = useState([])
    const [resultados, setResultados] = useState(null)
    const [buscando, setBuscando] = useState(false)

    useEffect(() => {
        supabase.from('productos_autopartes').select('marca').eq('empresa_id', perfil.empresa_id).not('marca', 'is', null)
            .then(({ data }) => setMarcasRepuesto([...new Set((data || []).map(p => p.marca).filter(Boolean))].sort()))
        supabase.from('productos_autopartes').select('tipo').eq('empresa_id', perfil.empresa_id).not('tipo', 'is', null)
            .then(({ data }) => setTiposRepuesto([...new Set((data || []).map(p => p.tipo).filter(Boolean))].sort()))
        supabase.from('productos_terminados').select('categoria_1').eq('empresa_id', perfil.empresa_id).eq('activo', true).not('categoria_1', 'is', null)
            .then(({ data }) => setCategoriasRepuesto([...new Set((data || []).map(p => p.categoria_1).filter(Boolean))].sort()))
        supabase.from('vehiculos').select('marca').eq('empresa_id', perfil.empresa_id).order('marca')
            .then(({ data }) => setMarcasV([...new Set((data || []).map(v => v.marca).filter(Boolean))].sort()))
    }, [])

    useEffect(() => {
        if (!marcaV) { setModelosV([]); setModeloV(''); return }
        supabase.from('vehiculos').select('modelo').eq('empresa_id', perfil.empresa_id).eq('marca', marcaV).order('modelo')
            .then(({ data }) => { setModelosV([...new Set((data || []).map(v => v.modelo))].sort()); setModeloV('') })
    }, [marcaV])

    async function buscar() {
        const tieneNroParte = filtroNroParte.trim()
        const tieneAutoparteFilter = tieneNroParte || filtroMarca || filtroTipo
        const tieneVehiculoFilter = !!marcaV
        if (!tieneAutoparteFilter && !tieneVehiculoFilter && !filtroCat && !busqueda.trim()) return
        setBuscando(true); setResultados(null)

        let ptIds = null
        if (tieneVehiculoFilter) {
            let vQ = supabase.from('vehiculos').select('id').eq('empresa_id', perfil.empresa_id).eq('marca', marcaV)
            if (modeloV) vQ = vQ.eq('modelo', modeloV)
            const { data: vData } = await vQ
            const vehiculoIds = (vData || []).map(v => v.id)
            if (vehiculoIds.length === 0) { setResultados([]); setBuscando(false); return }
            const { data: pvData } = await supabase.from('producto_vehiculo')
                .select('producto_id, año_inicio, año_fin').eq('empresa_id', perfil.empresa_id).in('vehiculo_id', vehiculoIds)
            let pvFiltrado = pvData || []
            if (anioV.trim()) {
                const y = Number(anioV)
                pvFiltrado = pvFiltrado.filter(pv => y >= pv.año_inicio && y <= pv.año_fin)
            }
            ptIds = [...new Set(pvFiltrado.map(pv => pv.producto_id))]
            if (ptIds.length === 0) { setResultados([]); setBuscando(false); return }
        }

        if (tieneAutoparteFilter || tieneVehiculoFilter) {
            let apQ = supabase.from('productos_autopartes')
                .select('nro_parte, marca, tipo, producto_id, productos_terminados!inner(id, nombre, sku, categoria_1)')
                .eq('empresa_id', perfil.empresa_id).eq('productos_terminados.activo', true)
            if (tieneNroParte) apQ = apQ.ilike('nro_parte', `%${tieneNroParte}%`)
            if (filtroMarca) apQ = apQ.eq('marca', filtroMarca)
            if (filtroTipo) apQ = apQ.eq('tipo', filtroTipo)
            if (ptIds !== null) apQ = apQ.in('producto_id', ptIds)
            if (filtroCat) apQ = apQ.eq('productos_terminados.categoria_1', filtroCat)
            if (busqueda.trim()) apQ = apQ.or(
                `nombre.ilike.%${busqueda.trim()}%,sku.ilike.%${busqueda.trim()}%`,
                { referencedTable: 'productos_terminados' }
            )
            const { data } = await apQ
            setResultados((data || []).map(r => ({ producto_id: r.producto_id, nro_parte: r.nro_parte, marca: r.marca, tipo: r.tipo, pt: r.productos_terminados })))
        } else {
            let ptQ = supabase.from('productos_terminados')
                .select('id, nombre, sku, categoria_1').eq('empresa_id', perfil.empresa_id).eq('activo', true)
            if (filtroCat) ptQ = ptQ.eq('categoria_1', filtroCat)
            if (busqueda.trim()) ptQ = ptQ.or(`nombre.ilike.%${busqueda.trim()}%,sku.ilike.%${busqueda.trim()}%`)
            const { data: ptData } = await ptQ
            const ids = (ptData || []).map(p => p.id)
            const apMap = {}
            if (ids.length > 0) {
                const { data: apData } = await supabase.from('productos_autopartes')
                    .select('producto_id, nro_parte, marca, tipo').eq('empresa_id', perfil.empresa_id).in('producto_id', ids)
                ;(apData || []).forEach(ap => { apMap[ap.producto_id] = ap })
            }
            setResultados((ptData || []).map(p => ({ producto_id: p.id, nro_parte: apMap[p.id]?.nro_parte ?? null, marca: apMap[p.id]?.marca ?? null, tipo: apMap[p.id]?.tipo ?? null, pt: p })))
        }
        setBuscando(false)
    }

    const hayFiltros = filtroNroParte || filtroMarca || filtroTipo || filtroCat || marcaV || busqueda
    const inStyle = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '7px', fontSize: '13px', boxSizing: 'border-box' }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '3px' }}>N° de parte</label>
                    <input value={filtroNroParte} onChange={e => setFiltroNroParte(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
                        placeholder="Ej: 0001-234..." style={inStyle} />
                </div>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '3px' }}>Marca repuesto</label>
                    <select value={filtroMarca} onChange={e => setFiltroMarca(e.target.value)} style={{ ...inStyle, backgroundColor: '#fff' }}>
                        <option value="">— Todas —</option>
                        {marcasRepuesto.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '3px' }}>Tipo</label>
                    <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={{ ...inStyle, backgroundColor: '#fff' }}>
                        <option value="">— Todos —</option>
                        {tiposRepuesto.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: '11px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '3px' }}>Categoría</label>
                    <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ ...inStyle, backgroundColor: '#fff' }}>
                        <option value="">— Todas —</option>
                        {categoriasRepuesto.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
            </div>
            <div style={{ padding: '8px 10px', backgroundColor: '#f0f9ff', borderRadius: '7px', border: '1px solid #bae6fd' }}>
                <p style={{ fontSize: '11px', fontWeight: 600, color: '#0369a1', margin: '0 0 6px' }}>Vehículo compatible</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: '8px' }}>
                    <div>
                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '3px' }}>Marca</label>
                        <select value={marcaV} onChange={e => setMarcaV(e.target.value)} style={{ ...inStyle, backgroundColor: '#fff' }}>
                            <option value="">— Todas —</option>
                            {marcasV.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '3px' }}>Modelo</label>
                        <select value={modeloV} onChange={e => setModeloV(e.target.value)} disabled={!marcaV}
                            style={{ ...inStyle, backgroundColor: '#fff', opacity: !marcaV ? 0.5 : 1 }}>
                            <option value="">— Todos —</option>
                            {modelosV.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '11px', color: '#6b7280', display: 'block', marginBottom: '3px' }}>Año</label>
                        <input type="number" value={anioV} onChange={e => setAnioV(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
                            placeholder="2015" style={inStyle} />
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
                        placeholder="Descripción o SKU (opcional)..."
                        style={{ ...inStyle, padding: '7px 10px 7px 28px' }} />
                </div>
                <button onClick={buscar} disabled={buscando}
                    style={{ padding: '7px 16px', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', opacity: buscando ? 0.6 : 1 }}>
                    {buscando ? 'Buscando...' : 'Buscar'}
                </button>
                {hayFiltros && (
                    <button onClick={() => { setFiltroNroParte(''); setFiltroMarca(''); setFiltroTipo(''); setFiltroCat(''); setMarcaV(''); setModeloV(''); setAnioV(''); setBusqueda(''); setResultados(null) }}
                        style={{ padding: '7px 10px', backgroundColor: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '7px', fontSize: '12px', cursor: 'pointer' }}>
                        Limpiar
                    </button>
                )}
            </div>
            {resultados !== null && (
                <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '260px', overflowY: 'auto' }}>
                    {resultados.length === 0 ? (
                        <div style={{ padding: '16px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>Sin resultados</div>
                    ) : resultados.map((item, idx) => {
                        const ins = insumos.find(i => i.id === item.producto_id)
                        return (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderBottom: '1px solid #f3f4f6' }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.pt?.nombre}</div>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
                                        <span style={{ fontFamily: 'monospace' }}>{item.pt?.sku}</span>
                                        {item.nro_parte && <span>N° {item.nro_parte}</span>}
                                        {item.marca && <span>{item.marca}</span>}
                                        {item.tipo && <span style={{ backgroundColor: '#f3f4f6', padding: '0 5px', borderRadius: '4px' }}>{item.tipo}</span>}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151' }}>{fmt(ins?.costo || 0)}</div>
                                    {ins && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '1px' }}>Stock: {ins.stock_actual ?? '—'}</div>}
                                </div>
                                {ins ? (
                                    <button onClick={() => onAgregar(ins)}
                                        style={{ padding: '5px 10px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                                        +
                                    </button>
                                ) : (
                                    <span style={{ fontSize: '11px', color: '#9ca3af', padding: '5px' }}>No en catálogo</span>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ─── Nueva Orden de Compra ──────────────────────────────────────
function NuevaOrden({ onCreada, onCancelar }) {
    const { perfil } = useAuth()
    const esAutopartes = perfil?.empresas?.perfil_negocio === 'autopartes'
    const [proveedores, setProveedores] = useState([])
    const [insumos, setInsumos] = useState([])
    const [proveedorId, setProveedorId] = useState('')
    const [busqueda, setBusqueda] = useState('')
    const [items, setItems] = useState([])
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [fechaEntrega, setFechaEntrega] = useState('')
    const [ocPendiente, setOcPendiente] = useState(null)
    const [modoAvanzadoOC, setModoAvanzadoOC] = useState(false)
    const [mostrarNuevoInsumo, setMostrarNuevoInsumo] = useState(false)

    useEffect(() => {
        supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre')
            .then(({ data }) => setProveedores(data || []))

        Promise.all([
            supabase.from('materias_primas').select('id, nombre, codigo, stock_actual, unidad_medida, costo_compra_promedio, aplica_iva').eq('activo', true),
            supabase.from('materiales_empaque').select('id, nombre, codigo, stock_actual, unidad_medida, costo_compra_promedio, aplica_iva').eq('activo', true),
            supabase.from('productos_terminados').select('id, nombre, sku, stock_actual, unidad_medida, costo_promedio, tipo_producto, aplica_iva').eq('activo', true)
        ]).then(([mp, emp, pt]) => {
            const unidos = [
                ...(mp.data || []).map(i => ({ ...i, tipo: 'materias_primas', costo: i.costo_compra_promedio })),
                ...(emp.data || []).map(i => ({ ...i, tipo: 'materiales_empaque', costo: i.costo_compra_promedio })),
                ...(pt.data || []).filter(p => p.tipo_producto === 'comprado').map(i => ({ ...i, tipo: 'productos_terminados', costo: i.costo_promedio, codigo: i.sku }))
            ]
            setInsumos(unidos)
        })
    }, [])

    const insumosFiltrados = insumos.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || p.codigo?.toLowerCase().includes(busqueda.toLowerCase())
    )

    function agregarInsumo(ins) {
        setItems(prev => {
            const existe = prev.find(i => i.id === ins.id && i.tipo === ins.tipo)
            if (existe) return prev.map(i => (i.id === ins.id && i.tipo === ins.tipo) ? { ...i, cantidad: i.cantidad + 1 } : i)
            return [...prev, { id: ins.id, tipo: ins.tipo, nombre: ins.nombre, codigo: ins.codigo, cantidad: 1, precio_unitario: ins.costo || 0, precio_original: ins.costo || 0, aplica_iva: ins.aplica_iva ?? true }]
        })
        setBusqueda('')
    }

    function cambiarCantidad(id, tipo, valor) {
        const n = parseInt(valor)
        if (isNaN(n) || n < 1) return
        setItems(prev => prev.map(i => (i.id === id && i.tipo === tipo) ? { ...i, cantidad: n } : i))
    }

    function cambiarPrecio(id, tipo, valor) {
        const n = parseFloat(valor)
        if (isNaN(n) || n < 0) return
        setItems(prev => prev.map(i => (i.id === id && i.tipo === tipo) ? { ...i, precio_unitario: n } : i))
    }

    function eliminarItem(id, tipo) { setItems(prev => prev.filter(i => !(i.id === id && i.tipo === tipo))) }

    const total = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
    const subtotal = items.reduce((s, i) => {
        const linea = i.cantidad * i.precio_unitario
        return s + ((i.aplica_iva ?? true) ? linea / 1.16 : linea)
    }, 0)
    const iva = total - subtotal

    async function confirmar() {
        if (!proveedorId) { setError('Selecciona un proveedor'); return }
        if (items.length === 0) { setError('Agrega al menos un insumo'); return }
        if (!perfil?.empresa_id) { setError('Error de sesión, recarga la página'); return }
        setGuardando(true); setError('')

        try {
            const { data: { user } } = await supabase.auth.getUser()
            const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_oc_numero', {
                p_empresa_id: perfil.empresa_id
            })
            const numero = numeroConsecutivo || 'OC-000001'

            const payload = {
                proveedor_id: proveedorId, usuario_id: user.id, numero_oc: numero,
                subtotal, total, estado: 'pendiente',
                fecha_emision: new Date().toISOString(),
                fecha_entrega_esperada: fechaEntrega || null
            }

            const { data: oc, error: err } = await supabase
                .from('ordenes_compra')
                .insert({ ...payload, empresa_id: perfil.empresa_id })
                .select().single()

            if (err) { setError('Error al crear la orden: ' + err.message); setGuardando(false); return }

            const tipoMap = {
                materias_primas: 'materia_prima',
                materiales_empaque: 'empaque',
                productos_terminados: 'producto_terminado',
                consumibles: 'consumible',
            }

            const { error: errItems } = await supabase.from('orden_compra_items').insert(
                items.map(i => ({
                    orden_id: oc.id,
                    empresa_id: perfil.empresa_id,
                    tipo_insumo: tipoMap[i.tipo] || i.tipo,
                    insumo_id: i.id,
                    cantidad_solicitada: i.cantidad,
                    cantidad_recibida: 0,
                    precio_unitario_esperado: (i.aplica_iva ?? true) ? i.precio_unitario / 1.16 : i.precio_unitario,
                }))
            )

            if (errItems) { setError('Error al guardar los items: ' + errItems.message); setGuardando(false); return }

            const cambiados = items.filter(i => Number(i.precio_unitario) !== Number(i.precio_original))
            if (cambiados.length > 0) {
                setOcPendiente({ ocObj: { ...oc, proveedores: { nombre: proveedores.find(p => p.id === proveedorId)?.nombre } }, cambiados })
                setGuardando(false)
                return
            }
            setGuardando(false)
            onCreada({ ...oc, proveedores: { nombre: proveedores.find(p => p.id === proveedorId)?.nombre } })
        } catch (e) {
            setError('Error inesperado: ' + e.message)
            setGuardando(false)
        }
    }

    const TABLA_COSTO = {
        materias_primas:    { tabla: 'materias_primas',    campo: 'costo_compra_promedio' },
        materiales_empaque: { tabla: 'materiales_empaque', campo: 'costo_compra_promedio' },
        productos_terminados: { tabla: 'productos_terminados', campo: 'costo_promedio' },
        consumibles:        { tabla: 'consumibles',        campo: 'costo_compra_promedio' },
    }

    async function aplicarActualizacionCostos(actualizar) {
        if (actualizar) {
            for (const item of ocPendiente.cambiados) {
                const map = TABLA_COSTO[item.tipo]
                if (map) {
                    await supabase.from(map.tabla)
                        .update({ [map.campo]: item.precio_unitario })
                        .eq('id', item.id)
                        .eq('empresa_id', perfil.empresa_id)
                }
            }
        }
        const datos = ocPendiente.ocObj
        setOcPendiente(null)
        onCreada(datos)
    }

    return (
        <div style={{ padding: '24px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Nueva Orden de Compra</h1>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Proveedor</label>
                        <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                            <option value="">Seleccionar proveedor...</option>
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                        <div style={{ marginTop: '12px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Fecha entrega esperada</label>
                            <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                        </div>
                    </div>

                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Agregar insumos</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setMostrarNuevoInsumo(true)}
                                    style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #d97706', cursor: 'pointer', backgroundColor: '#fffbeb', color: '#d97706', fontWeight: 500 }}>
                                    + Crear nuevo
                                </button>
                                {esAutopartes && (
                                    <button onClick={() => setModoAvanzadoOC(m => !m)}
                                        style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid', cursor: 'pointer',
                                            borderColor: modoAvanzadoOC ? '#1d4ed8' : '#d1d5db',
                                            backgroundColor: modoAvanzadoOC ? '#eff6ff' : '#f9fafb',
                                            color: modoAvanzadoOC ? '#1d4ed8' : '#6b7280', fontWeight: 500 }}>
                                        {modoAvanzadoOC ? 'Búsqueda simple' : 'Búsqueda avanzada'}
                                    </button>
                                )}
                            </div>
                        </div>
                        {!modoAvanzadoOC ? (
                            <>
                                <div style={{ position: 'relative' }}>
                                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                    <input type="text" placeholder="Buscar por nombre o código..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                                </div>
                                {busqueda && (
                                    <div style={{ marginTop: '8px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                                        {insumosFiltrados.length === 0 ? (
                                            <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                                Sin resultados
                                                <button onClick={() => setMostrarNuevoInsumo(true)}
                                                    style={{ fontSize: '12px', color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                                                    + Crear "{busqueda}"
                                                </button>
                                            </div>
                                        ) : insumosFiltrados.map(p => (
                                                <div key={`${p.id}-${p.tipo}`} onClick={() => agregarInsumo(p)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}
                                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <div><span style={{ fontWeight: 500, color: '#1f2937' }}>{p.nombre}</span><span style={{ color: '#9ca3af', marginLeft: '8px', fontFamily: 'monospace', fontSize: '11px' }}>{p.codigo}</span></div>
                                                    <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 600, color: '#16a34a' }}>{fmt(p.costo)}</div></div>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <PanelBusquedaAutopartes perfil={perfil} insumos={insumos} onAgregar={agregarInsumo} />
                        )}
                    </div>

                    {items.length > 0 && (
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['Insumo', 'Tipo', 'Precio', 'Cant.', 'Subtotal', ''].map((h, i) => (<th key={i} style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>))}
                                </tr></thead>
                                <tbody>
                                    {items.map(item => (
                                        <tr key={`${item.id}-${item.tipo}`} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#1f2937' }}>{item.nombre}</td>
                                            <td style={{ padding: '10px 12px', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{item.tipo.replace('_', ' ')}</td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={item.precio_unitario}
                                                    onChange={e => cambiarPrecio(item.id, item.tipo, e.target.value)}
                                                    style={{
                                                        width: '80px',
                                                        padding: '4px 8px',
                                                        border: '1px solid #d1d5db',
                                                        borderRadius: '6px',
                                                        fontSize: '13px',
                                                        textAlign: 'right'
                                                    }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px 12px' }}><input type="number" min="1" value={item.cantidad} onChange={e => cambiarCantidad(item.id, item.tipo, e.target.value)} style={{ width: '60px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }} /></td>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{fmt(item.cantidad * item.precio_unitario)}</td>
                                            <td style={{ padding: '10px 12px' }}><button onClick={() => eliminarItem(item.id, item.tipo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}><Trash2 size={14} /></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', height: 'fit-content', position: 'sticky', top: '24px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: '0 0 16px' }}>Resumen de OC</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280' }}> <span>Subtotal</span> <span>{fmt(subtotal)}</span> </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280' }}> <span>IVA (16%)</span> <span>{fmt(iva)}</span> </div>
                        <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, color: '#1f2937' }}><span>Total</span><span style={{ color: '#16a34a' }}>{fmt(total)}</span></div>
                    </div>
                    {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}
                    <button onClick={confirmar} disabled={guardando || items.length === 0}
                        style={{ width: '100%', backgroundColor: items.length === 0 ? '#d1d5db' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: items.length === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <CheckCircle size={16} /> {guardando ? 'Procesando...' : 'Crear Orden'}
                    </button>
                </div>
            </div>

            {mostrarNuevoInsumo && (
                <ModalNuevoInsumo
                    perfil={perfil}
                    onCerrar={() => setMostrarNuevoInsumo(false)}
                    onCreado={insumo => { setInsumos(prev => [...prev, insumo]); agregarInsumo(insumo); setMostrarNuevoInsumo(false) }}
                />
            )}

            {ocPendiente && (
                <>
                    <div onClick={() => aplicarActualizacionCostos(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '480px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '80vh', overflowY: 'auto' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>Actualizar costos en catálogo</h3>
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 18px' }}>Se modificaron los siguientes costos de compra. ¿Deseas actualizar el catálogo?</p>
                        <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: '20px' }}>
                            {ocPendiente.cambiados.map(item => (
                                <div key={`${item.tipo}-${item.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f3f4f6' }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{item.nombre}</div>
                                        {item.codigo && <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{item.codigo}</div>}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                                        <span style={{ color: '#9ca3af', textDecoration: 'line-through' }}>{fmt(item.precio_original)}</span>
                                        <span style={{ color: '#6b7280' }}>→</span>
                                        <span style={{ fontWeight: 700, color: '#16a34a' }}>{fmt(item.precio_unitario)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => aplicarActualizacionCostos(true)}
                                style={{ flex: 2, padding: '11px', borderRadius: '8px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}>
                                Sí, actualizar catálogo
                            </button>
                            <button onClick={() => aplicarActualizacionCostos(false)}
                                style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                                No, continuar
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}

// ─── Nueva Recepción (con opción de vincular OC) ──────────────
function NuevaRecepcion({ onCreada, onCancelar }) {
    const { perfil } = useAuth()
    const esAutopartes = perfil?.empresas?.perfil_negocio === 'autopartes'
    const [proveedores, setProveedores] = useState([])
    const [ocsPendientes, setOcsPendientes] = useState([])
    const [ocSeleccionada, setOcSeleccionada] = useState('')
    const [modo, setModo] = useState('libre')
    const [items, setItems] = useState([])
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [mostrarModal, setMostrarModal] = useState(false)
    const [mapaNombres, setMapaNombres] = useState({})

    const [nroDocProveedor, setNroDocProveedor] = useState('')
    const [condicionProveedorInicial, setCondicionProveedorInicial] = useState('contado')
    const [diasCreditoProveedorInicial, setDiasCreditoProveedorInicial] = useState(0)

    // Para recepción libre
    const [insumos, setInsumos] = useState([])
    const [busquedaInsumo, setBusquedaInsumo] = useState('')
    const [proveedorLibreId, setProveedorLibreId] = useState('')
    const [modoAvanzadoRec, setModoAvanzadoRec] = useState(false)
    const [mostrarNuevoInsumo, setMostrarNuevoInsumo] = useState(false)

    // Almacén destino
    const [almacenes, setAlmacenes] = useState([])
    const [almacenId, setAlmacenId] = useState('')

    useEffect(() => {
        supabase.from('almacenes').select('id, nombre, es_default')
            .eq('empresa_id', perfil.empresa_id).eq('activo', true)
            .order('es_default', { ascending: false }).order('nombre')
            .then(({ data }) => {
                if (data) {
                    setAlmacenes(data)
                    const def = data.find(a => a.es_default) || data[0]
                    if (def) setAlmacenId(def.id)
                }
            })
    }, [])

    useEffect(() => {
        supabase.from('proveedores').select('id, nombre, condicion_pago, dias_credito').eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setProveedores(data || []))

        Promise.all([
            supabase.from('materias_primas').select('id, nombre, codigo, unidad_medida, costo_compra_promedio, aplica_iva').eq('empresa_id', perfil.empresa_id),
            supabase.from('materiales_empaque').select('id, nombre, codigo, unidad_medida, costo_compra_promedio, aplica_iva').eq('empresa_id', perfil.empresa_id),
            supabase.from('productos_terminados').select('id, nombre, sku, unidad_medida, costo_promedio, aplica_iva').eq('empresa_id', perfil.empresa_id),
            supabase.from('consumibles').select('id, nombre, codigo, unidad_medida, costo_compra_promedio, aplica_iva').eq('empresa_id', perfil.empresa_id),
        ]).then(([mp, me, pt, con]) => {
            const mapa = {}
            const todos = [
                ...(mp.data || []).map(i => ({ ...i, tipo: 'materias_primas', costo: i.costo_compra_promedio })),
                ...(me.data || []).map(i => ({ ...i, tipo: 'materiales_empaque', costo: i.costo_compra_promedio })),
                ...(pt.data || []).map(i => ({ ...i, tipo: 'productos_terminados', costo: i.costo_promedio, codigo: i.sku })),
                ...(con.data || []).map(i => ({ ...i, tipo: 'consumibles', costo: i.costo_compra_promedio })),
            ]
            todos.forEach(i => { mapa[i.id] = i.nombre })
            setMapaNombres(mapa)
            setInsumos(todos)
        })
    }, [])

    useEffect(() => {
        if (modo === 'contra_oc' && proveedores.length > 0) {
            supabase.from('ordenes_compra').select(`*, proveedores(nombre), orden_compra_items(*)`)
                .eq('empresa_id', perfil.empresa_id)
                .in('estado', ['pendiente', 'aprobada', 'recibida_parcial'])
                .order('created_at', { ascending: false })
                .then(({ data }) => setOcsPendientes(data || []))
        }
    }, [modo, proveedores])

    function cargarItemsDeOC(ocId) {
        const oc = ocsPendientes.find(o => o.id === ocId)
        if (!oc) return
        // OC guarda tipo_insumo en singular ('materia_prima', 'empaque'…)
        // confirmarRecepcion espera plural igual que agregarInsumoLibre
        const tipoToPlural = {
            materia_prima: 'materias_primas',
            empaque: 'materiales_empaque',
            material_empaque: 'materiales_empaque',
            consumible: 'consumibles',
            producto_terminado: 'productos_terminados',
        }
        setItems(oc.orden_compra_items.map(i => {
            const insumo = insumos.find(ins => ins.id === i.insumo_id)
            return {
                id: i.insumo_id,
                tipo: tipoToPlural[i.tipo_insumo] || 'materias_primas',
                nombre: mapaNombres[i.insumo_id] || 'Cargando...',
                cantidad: i.cantidad_solicitada - i.cantidad_recibida,
                precio_unitario: i.precio_unitario_esperado,
                pendiente: i.cantidad_solicitada - i.cantidad_recibida,
                orden_item_id: i.id,
                aplica_iva: insumo?.aplica_iva ?? true,
            }
        }))
    }

    function agregarInsumoLibre(insumo) {
        setItems(prev => {
            const existe = prev.find(i => i.id === insumo.id)
            if (existe) return prev.map(i => i.id === insumo.id ? { ...i, cantidad: i.cantidad + 1 } : i)
            return [...prev, {
                id: insumo.id,
                tipo: insumo.tipo,
                nombre: insumo.nombre,
                cantidad: 1,
                precio_unitario: insumo.costo || 0,
                aplica_iva: insumo.aplica_iva ?? true,
            }]
        })
        setBusquedaInsumo('')
    }

    const insumosFiltrados = insumos.filter(i =>
        i.nombre.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
        i.codigo?.toLowerCase().includes(busquedaInsumo.toLowerCase())
    )

    const total = items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
    const subtotal = items.reduce((s, i) => {
        const linea = i.cantidad * i.precio_unitario
        return s + ((i.aplica_iva ?? true) ? linea / 1.16 : linea)
    }, 0)
    const iva = total - subtotal

    function abrirConfirmacion() {
        if (modo === 'contra_oc' && !ocSeleccionada) { setError('Selecciona una OC'); return }
        if (items.length === 0) { setError('Agrega insumos o selecciona una OC'); return }
        if (!almacenId) { setError('Selecciona el almacén de destino'); return }
        setError(''); setMostrarModal(true)
    }

    async function confirmarRecepcion(datosPago) {
        setGuardando(true); setError('')
        const { data: { user } } = await supabase.auth.getUser()
        const { data: numeroConsecutivo } = await supabase.rpc('obtener_siguiente_recepcion_numero', {
            p_empresa_id: perfil.empresa_id
        })
        const numero = numeroConsecutivo || 'REC-000001'
        const proveedorId = modo === 'contra_oc'
            ? ocsPendientes.find(o => o.id === ocSeleccionada)?.proveedor_id
            : proveedorLibreId || null

        const payload = {
            proveedor_id: proveedorId, usuario_id: user.id, numero_doc: nroDocProveedor.trim() || numero,
            subtotal, total, estado: 'recibida', fecha_compra: new Date().toISOString(),
            orden_compra_id: modo === 'contra_oc' ? ocSeleccionada : null,
            ...datosPago
        }

        const { data: rec, error: err } = await supabase.from('compras').insert({ ...payload, empresa_id: perfil.empresa_id }).select().single()
        if (err) { setError('Error: ' + err.message); setGuardando(false); return }

        await supabase.from('compra_items').insert(
            items.map(i => ({
                compra_id: rec.id,
                empresa_id: perfil.empresa_id,  // 👈 AGREGAR ESTO
                tipo_insumo: i.tipo === 'materias_primas' ? 'materia_prima'
                    : i.tipo === 'materiales_empaque' ? 'empaque'
                        : i.tipo === 'consumibles' ? 'consumible'
                            : i.tipo === 'productos_terminados' ? 'producto_terminado'
                                : 'materia_prima',
                insumo_id: i.id,
                cantidad: i.cantidad,
                precio_unitario: i.precio_unitario
            }))
        )

        for (const item of items) {
            const tabla = item.tipo === 'materias_primas' ? 'materias_primas'
                : item.tipo === 'materiales_empaque' ? 'materiales_empaque'
                    : item.tipo === 'consumibles' ? 'consumibles'
                        : 'productos_terminados'
            const { data: actual } = await supabase.from(tabla).select('stock_actual').eq('id', item.id).single()
            const nuevoStock = (actual?.stock_actual || 0) + item.cantidad

            await supabase.from(tabla).update({ stock_actual: nuevoStock }).eq('id', item.id)

            // Actualizar stock_ubicacion en el almacén seleccionado
            const tipoItemMap = {
                materias_primas: 'materia_prima',
                materiales_empaque: 'material_empaque',
                consumibles: 'consumible',
                productos_terminados: 'producto_terminado',
            }
            const tipoItem = tipoItemMap[item.tipo] || 'materia_prima'

            // Buscar si ya existe registro en ese almacén
            const { data: stockExistente } = await supabase.from('stock_ubicacion')
                .select('id, cantidad')
                .eq('almacen_id', almacenId)
                .eq('tipo_item', tipoItem)
                .eq('item_id', item.id)
                .eq('empresa_id', perfil.empresa_id)
                .is('almacen_ubicacion_id', null)
                .maybeSingle()

            if (stockExistente) {
                await supabase.from('stock_ubicacion')
                    .update({ cantidad: Number(stockExistente.cantidad) + item.cantidad, updated_at: new Date().toISOString() })
                    .eq('id', stockExistente.id)
            } else {
                await supabase.from('stock_ubicacion').insert({
                    almacen_id: almacenId,
                    almacen_ubicacion_id: null,
                    tipo_item: tipoItem,
                    item_id: item.id,
                    cantidad: item.cantidad,
                    empresa_id: perfil.empresa_id,
                    updated_at: new Date().toISOString(),
                })
            }

            // Registrar movimiento
            await supabase.from('movimientos_inventario').insert({
                empresa_id: perfil.empresa_id,
                tipo_item: tipoItem,
                item_id: item.id,
                item_nombre: item.nombre,
                item_codigo: item.codigo || item.sku || '',
                tipo_movimiento: 'entrada',
                cantidad: item.cantidad,
                stock_anterior: actual?.stock_actual || 0,
                stock_actual: nuevoStock,
                origen: 'recepcion_compra',
                almacen_id: almacenId,
                fecha: new Date().toISOString()
            })

            if (item.orden_item_id) {
                const { data: current } = await supabase.from('orden_compra_items').select('cantidad_recibida').eq('id', item.orden_item_id).single()
                const nuevoRecibido = (current?.cantidad_recibida || 0) + item.cantidad
                await supabase.from('orden_compra_items').update({ cantidad_recibida: nuevoRecibido }).eq('id', item.orden_item_id)
            }
        }

        if (modo === 'contra_oc' && ocSeleccionada) {
            const { data: itemsOC } = await supabase.from('orden_compra_items').select('cantidad_solicitada, cantidad_recibida').eq('orden_id', ocSeleccionada)
            const totalSolicitado = itemsOC.reduce((s, i) => s + i.cantidad_solicitada, 0)
            const totalRecibido = itemsOC.reduce((s, i) => s + i.cantidad_recibida, 0)
            const nuevoEstado = totalRecibido >= totalSolicitado ? 'recibida_total' : 'recibida_parcial'
            await supabase.from('ordenes_compra').update({ estado: nuevoEstado }).eq('id', ocSeleccionada)
        }

        setGuardando(false); setMostrarModal(false)
        const provNombre = modo === 'contra_oc'
            ? ocsPendientes.find(o => o.id === ocSeleccionada)?.proveedores?.nombre
            : proveedores.find(p => p.id === proveedorLibreId)?.nombre || 'Recepción Libre'
        onCreada({ ...rec, proveedores: { nombre: provNombre } })
    }

    const TIPO_LABEL = {
        materias_primas: 'MP',
        materiales_empaque: 'Empaque',
        productos_terminados: 'PT',
        consumibles: 'Consumible',
    }

    return (
        <div style={{ padding: '24px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Nueva Recepción</h1>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {['libre', 'contra_oc'].map(m => (
                    <button key={m} onClick={() => { setModo(m); setItems([]); setOcSeleccionada('') }}
                        style={{
                            flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid', cursor: 'pointer',
                            borderColor: modo === m ? '#16a34a' : '#e5e7eb', backgroundColor: modo === m ? '#f0fdf4' : '#fff', color: modo === m ? '#16a34a' : '#6b7280'
                        }}>
                        {m === 'libre' ? 'Recepción Libre' : 'Contra Orden de Compra'}
                    </button>
                ))}
            </div>

            {/* Selector de almacén destino — aplica a ambos modos */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '16px' }}>
                <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>
                    Almacén de destino *
                </label>
                {almacenes.length === 0 ? (
                    <p style={{ fontSize: '13px', color: '#ef4444', margin: 0 }}>
                        No hay almacenes configurados — créalos en Administración → Almacenes
                    </p>
                ) : (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {almacenes.map(a => (
                            <button key={a.id} onClick={() => setAlmacenId(a.id)}
                                style={{
                                    padding: '7px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                    border: '1px solid', cursor: 'pointer',
                                    borderColor: almacenId === a.id ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: almacenId === a.id ? '#f0fdf4' : '#fff',
                                    color: almacenId === a.id ? '#16a34a' : '#6b7280',
                                }}>
                                {a.nombre}
                                {a.es_default && <span style={{ fontSize: '10px', marginLeft: '6px', opacity: 0.6 }}>(principal)</span>}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Modo libre — proveedor y buscador de insumos */}
            {modo === 'libre' && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '16px' }}>
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Proveedor <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span></label>
                        <select value={proveedorLibreId} onChange={e => {
                            const pid = e.target.value
                            setProveedorLibreId(pid)
                            const p = proveedores.find(x => x.id === pid)
                            if (p) { setCondicionProveedorInicial(p.condicion_pago || 'contado'); setDiasCreditoProveedorInicial(p.dias_credito || 0) }
                        }}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                            <option value="">— Sin proveedor —</option>
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Agregar insumos</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button onClick={() => setMostrarNuevoInsumo(true)}
                                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #d97706', cursor: 'pointer', backgroundColor: '#fffbeb', color: '#d97706', fontWeight: 500 }}>
                                + Crear nuevo
                            </button>
                            {esAutopartes && (
                                <button onClick={() => setModoAvanzadoRec(m => !m)}
                                    style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', border: '1px solid', cursor: 'pointer',
                                        borderColor: modoAvanzadoRec ? '#1d4ed8' : '#d1d5db',
                                        backgroundColor: modoAvanzadoRec ? '#eff6ff' : '#f9fafb',
                                        color: modoAvanzadoRec ? '#1d4ed8' : '#6b7280', fontWeight: 500 }}>
                                    {modoAvanzadoRec ? 'Búsqueda simple' : 'Búsqueda avanzada'}
                                </button>
                            )}
                        </div>
                    </div>
                    {!modoAvanzadoRec ? (
                        <>
                            <div style={{ position: 'relative' }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                                <input type="text" placeholder="Buscar por nombre o código..."
                                    value={busquedaInsumo} onChange={e => setBusquedaInsumo(e.target.value)}
                                    style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                            </div>
                            {busquedaInsumo && (
                                <div style={{ marginTop: '6px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '220px', overflowY: 'auto' }}>
                                    {insumosFiltrados.length === 0 ? (
                                        <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                            Sin resultados
                                            <button onClick={() => setMostrarNuevoInsumo(true)}
                                                style={{ fontSize: '12px', color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                                                + Crear "{busquedaInsumo}"
                                            </button>
                                        </div>
                                    ) : insumosFiltrados.map(i => (
                                            <div key={`${i.tipo}-${i.id}`} onClick={() => agregarInsumoLibre(i)}
                                                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                <div>
                                                    <span style={{ fontWeight: 500, color: '#1f2937' }}>{i.nombre}</span>
                                                    {i.codigo && <span style={{ color: '#9ca3af', marginLeft: '8px', fontFamily: 'monospace', fontSize: '11px' }}>{i.codigo}</span>}
                                                    <span style={{ marginLeft: '8px', fontSize: '11px', backgroundColor: '#f3f4f6', color: '#6b7280', padding: '1px 6px', borderRadius: '10px' }}>
                                                        {TIPO_LABEL[i.tipo] || i.tipo}
                                                    </span>
                                                </div>
                                                <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 500 }}>{fmt(i.costo || 0)}</span>
                                            </div>
                                        ))
                                    }
                                </div>
                            )}
                        </>
                    ) : (
                        <PanelBusquedaAutopartes perfil={perfil} insumos={insumos} onAgregar={agregarInsumoLibre} />
                    )}
                </div>
            )}

            {/* Modo contra OC */}
            {modo === 'contra_oc' && (
                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px', marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Seleccionar OC Pendiente</label>
                    <select value={ocSeleccionada} onChange={e => {
                        const ocId = e.target.value
                        setOcSeleccionada(ocId)
                        cargarItemsDeOC(ocId)
                        const oc = ocsPendientes.find(o => o.id === ocId)
                        if (oc) { const p = proveedores.find(x => x.id === oc.proveedor_id); if (p) { setCondicionProveedorInicial(p.condicion_pago || 'contado'); setDiasCreditoProveedorInicial(p.dias_credito || 0) } }
                    }}
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>
                        <option value="">Buscar orden...</option>
                        {ocsPendientes.map(o => <option key={o.id} value={o.id}>{o.numero_oc} · {o.proveedores?.nombre} · {fmt(o.total)}</option>)}
                    </select>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {items.length > 0 && (
                        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                    {['Insumo', 'Tipo', 'Precio', 'Cant.', 'Subtotal', ''].map((h, i) => (<th key={i} style={{ padding: '10px 12px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left' }}>{h}</th>))}
                                </tr></thead>
                                <tbody>
                                    {items.map((item, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', color: '#1f2937' }}>{item.nombre}</td>
                                            <td style={{ padding: '10px 12px', fontSize: '11px', color: '#6b7280' }}>
                                                <span style={{ backgroundColor: '#f3f4f6', padding: '1px 6px', borderRadius: '10px' }}>
                                                    {TIPO_LABEL[item.tipo] || item.tipo}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input type="number" min="0" step="0.01" value={item.precio_unitario}
                                                    onChange={e => setItems(prev => prev.map((it, j) => j === idx ? { ...it, precio_unitario: Number(e.target.value) } : it))}
                                                    style={{ width: '80px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />
                                            </td>
                                            <td style={{ padding: '10px 12px' }}>
                                                <input type="number" min="1" max={item.pendiente || undefined} value={item.cantidad}
                                                    onChange={e => { const n = parseInt(e.target.value); if (n > 0) setItems(prev => prev.map((it, j) => j === idx ? { ...it, cantidad: n } : it)) }}
                                                    style={{ width: '60px', padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', textAlign: 'center' }} />
                                            </td>
                                            <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 600, color: '#1f2937' }}>{fmt(item.cantidad * item.precio_unitario)}</td>
                                            <td style={{ padding: '10px 12px' }}><button onClick={() => setItems(prev => prev.filter((_, j) => j !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}><Trash2 size={14} /></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {items.length === 0 && modo === 'libre' && (
                        <div style={{ backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db', padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                            Busca y agrega insumos o consumibles al recibo
                        </div>
                    )}
                </div>

                <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '20px', height: 'fit-content', position: 'sticky', top: '24px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937', margin: '0 0 16px' }}>Resumen</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280' }}> <span>Subtotal</span> <span>{fmt(subtotal)}</span> </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280' }}> <span>IVA (16%)</span> <span>{fmt(iva)}</span> </div>                        <div style={{ height: '1px', backgroundColor: '#e5e7eb', margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, color: '#1f2937' }}><span>Total</span><span style={{ color: '#16a34a' }}>{fmt(total)}</span></div>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nro. Doc. Proveedor</label>
                        <input
                            type="text"
                            placeholder="Ej. NE-00123 o FAC-456"
                            value={nroDocProveedor}
                            onChange={e => setNroDocProveedor(e.target.value)}
                            style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }}
                        />
                    </div>
                    {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}
                    <button onClick={abrirConfirmacion} disabled={guardando || items.length === 0}
                        style={{ width: '100%', backgroundColor: items.length === 0 ? '#d1d5db' : '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: items.length === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <CheckCircle size={16} /> {guardando ? 'Procesando...' : 'Confirmar Recepción'}
                    </button>
                </div>
            </div>

            {mostrarNuevoInsumo && (
                <ModalNuevoInsumo
                    perfil={perfil}
                    onCerrar={() => setMostrarNuevoInsumo(false)}
                    onCreado={insumo => { setInsumos(prev => [...prev, insumo]); agregarInsumoLibre(insumo); setMostrarNuevoInsumo(false) }}
                />
            )}

            {mostrarModal && <ModalPagoCompra total={total} condicionInicial={condicionProveedorInicial} diasInicial={diasCreditoProveedorInicial} onCerrar={() => setMostrarModal(false)} onConfirmar={confirmarRecepcion} />}
        </div>
    )
}

// ─── Modal Nuevo Insumo / Producto ────────────────────────────
const TIPOS_INSUMO = [
    { value: 'materias_primas',      label: 'Materia Prima' },
    { value: 'materiales_empaque',   label: 'Material de Empaque' },
    { value: 'consumibles',          label: 'Consumible' },
    { value: 'productos_terminados', label: 'Producto Terminado (comprado)' },
]
const TIPOS_PRODUCTO_INS = ['producido', 'comprado']
const UNIDADES_INSUMO = ['unidad', 'kg', 'g', 'litro', 'ml', 'caja', 'bolsa', 'rollo', 'metro', 'paquete', 'par', 'juego']

function ModalNuevoInsumo({ perfil, onCreado, onCerrar }) {
    const [tipo, setTipo] = useState('materias_primas')
    const [proveedores, setProveedores] = useState([])

    const [nombre, setNombre] = useState('')
    const [codigo, setCodigo] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [unidad, setUnidad] = useState('kg')
    const [costo, setCosto] = useState('')
    const [stockActual, setStockActual] = useState('')
    const [stockMinimo, setStockMinimo] = useState('')
    const [proveedorId, setProveedorId] = useState('')
    const [cat1, setCat1] = useState('')
    const [cat2, setCat2] = useState('')
    const [cat3, setCat3] = useState('')
    const [cat4, setCat4] = useState('')
    const [aplicaIva, setAplicaIva] = useState(true)
    const [activo, setActivo] = useState(true)

    // MP y ME
    const [tipoProducto, setTipoProducto] = useState('comprado')
    const [fechaVencimiento, setFechaVencimiento] = useState('')

    // PT
    const [precioVenta, setPrecioVenta] = useState('')
    const [vidaUtilDias, setVidaUtilDias] = useState('')
    const [unidadVenta2, setUnidadVenta2] = useState('')
    const [factorConversion2, setFactorConversion2] = useState('')

    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    const esPT = tipo === 'productos_terminados'
    const esConsumible = tipo === 'consumibles'
    const esMPomE = tipo === 'materias_primas' || tipo === 'materiales_empaque'

    useEffect(() => {
        supabase.from('proveedores').select('id, nombre')
            .eq('activo', true).eq('empresa_id', perfil.empresa_id).order('nombre')
            .then(({ data }) => setProveedores(data || []))
    }, [])

    useEffect(() => {
        setUnidad(esPT || esConsumible ? 'unidad' : 'kg')
    }, [tipo])

    async function guardar() {
        if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
        if (!codigo.trim() && !esConsumible) { setError('El código es obligatorio'); return }
        setGuardando(true); setError('')

        const codigoNorm = codigo.trim().toUpperCase() || null
        const payload = {
            empresa_id: perfil.empresa_id,
            nombre: nombre.trim(),
            [esPT ? 'sku' : 'codigo']: codigoNorm,
            descripcion: descripcion.trim() || null,
            unidad_medida: unidad,
            [esPT ? 'costo_promedio' : 'costo_compra_promedio']: costo !== '' ? Number(costo) : null,
            stock_actual: stockActual !== '' ? Number(stockActual) : 0,
            stock_minimo: stockMinimo !== '' ? Number(stockMinimo) : 0,
            proveedor_preferido_id: proveedorId || null,
            categoria_1: cat1 || null,
            categoria_2: cat2 || null,
            categoria_3: cat3 || null,
            categoria_4: cat4 || null,
            aplica_iva: aplicaIva,
            activo,
            ...(esMPomE ? { tipo_producto: tipoProducto, fecha_vencimiento: fechaVencimiento || null } : {}),
            ...(esPT ? {
                tipo_producto: 'comprado',
                precio_venta: precioVenta !== '' ? Number(precioVenta) : null,
                vida_util_dias: vidaUtilDias !== '' ? Number(vidaUtilDias) : null,
                unidad_venta_2: unidadVenta2.trim() || null,
                factor_conversion_2: factorConversion2 !== '' ? Number(factorConversion2) : null,
            } : {}),
        }

        const { data, error: err } = await supabase.from(tipo).insert(payload).select('id').single()
        if (err) {
            setGuardando(false)
            setError(err.code === '23505' ? `El código "${codigoNorm}" ya existe. Elige otro.` : 'Error: ' + err.message)
            return
        }

        onCreado({
            id: data.id, tipo,
            nombre: nombre.trim(),
            codigo: codigoNorm,
            unidad_medida: unidad,
            costo: costo !== '' ? Number(costo) : 0,
            aplica_iva: aplicaIva,
            stock_actual: stockActual !== '' ? Number(stockActual) : 0,
        })
    }

    const inStyle = { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', outline: 'none', boxSizing: 'border-box' }
    const lbl = { fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '560px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Nuevo insumo</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>

                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={lbl}>Tipo *</label>
                        <select value={tipo} onChange={e => setTipo(e.target.value)} style={inStyle}>
                            {TIPOS_INSUMO.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={lbl}>Nombre *</label>
                        <input value={nombre} onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: Azúcar refinada" style={inStyle} autoFocus />
                    </div>

                    <div>
                        <label style={lbl}>{esPT ? 'SKU *' : esConsumible ? 'Código (opcional)' : 'Código *'}</label>
                        <input value={codigo} onChange={e => setCodigo(e.target.value)}
                            placeholder={esPT ? 'Ej: ACN-500' : 'Ej: MP-001'} style={inStyle} />
                    </div>

                    <div>
                        <label style={lbl}>Unidad de medida</label>
                        <select value={unidad} onChange={e => setUnidad(e.target.value)} style={inStyle}>
                            {UNIDADES_INSUMO.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={lbl}>Descripción</label>
                        <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                            rows={2} placeholder="Descripción opcional..." style={{ ...inStyle, resize: 'vertical' }} />
                    </div>

                    {esMPomE && (
                        <div>
                            <label style={lbl}>Tipo de insumo</label>
                            <select value={tipoProducto} onChange={e => setTipoProducto(e.target.value)} style={inStyle}>
                                {TIPOS_PRODUCTO_INS.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                    )}

                    {esPT && (
                        <div>
                            <label style={lbl}>Precio de venta ($)</label>
                            <input type="number" min="0" step="0.01" value={precioVenta}
                                onChange={e => setPrecioVenta(e.target.value)} placeholder="0.00" style={inStyle} />
                        </div>
                    )}

                    <div>
                        <label style={lbl}>Costo de compra ($)</label>
                        <input type="number" min="0" step="0.01" value={costo}
                            onChange={e => setCosto(e.target.value)} placeholder="0.00" style={inStyle} />
                    </div>

                    <div>
                        <label style={lbl}>Stock inicial</label>
                        <input type="number" min="0" value={stockActual}
                            onChange={e => setStockActual(e.target.value)} placeholder="0" style={inStyle} />
                    </div>

                    <div>
                        <label style={lbl}>Stock mínimo (alerta)</label>
                        <input type="number" min="0" value={stockMinimo}
                            onChange={e => setStockMinimo(e.target.value)} placeholder="0" style={inStyle} />
                    </div>

                    {esMPomE && (
                        <div>
                            <label style={lbl}>Fecha de vencimiento</label>
                            <input type="date" value={fechaVencimiento}
                                onChange={e => setFechaVencimiento(e.target.value)} style={inStyle} />
                        </div>
                    )}

                    {esPT && (
                        <>
                            <div>
                                <label style={lbl}>Vida útil (días)</label>
                                <input type="number" min="0" value={vidaUtilDias}
                                    onChange={e => setVidaUtilDias(e.target.value)} placeholder="Ej: 30" style={inStyle} />
                            </div>
                            <div>
                                <label style={lbl}>Unidad venta 2 (opcional)</label>
                                <input value={unidadVenta2} onChange={e => setUnidadVenta2(e.target.value)}
                                    placeholder="ej: caja, bulto" style={inStyle} />
                            </div>
                            <div>
                                <label style={lbl}>Factor conversión</label>
                                <input type="number" min="0.0001" step="0.0001" value={factorConversion2}
                                    onChange={e => setFactorConversion2(e.target.value)}
                                    placeholder="ej: 12" style={inStyle} disabled={!unidadVenta2.trim()} />
                            </div>
                        </>
                    )}

                    <div style={{ gridColumn: 'span 2' }}>
                        <label style={lbl}>Proveedor preferido</label>
                        <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} style={inStyle}>
                            <option value="">— Sin asignar —</option>
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                        <p style={{ fontSize: '13px', fontWeight: 500, color: '#374151', margin: '0 0 8px' }}>Clasificación</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                            {[{ n: 1, v: cat1, s: setCat1 }, { n: 2, v: cat2, s: setCat2 }, { n: 3, v: cat3, s: setCat3 }, { n: 4, v: cat4, s: setCat4 }].map(({ n, v, s }) => (
                                <div key={n}>
                                    <label style={{ fontSize: '12px', color: '#6b7280', display: 'block', marginBottom: '4px' }}>Categoría {n}</label>
                                    <input value={v} onChange={e => s(e.target.value)} placeholder={`Nivel ${n}...`} style={inStyle} />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" id="ni_activo" checked={activo} onChange={e => setActivo(e.target.checked)}
                            style={{ width: '16px', height: '16px', accentColor: '#16a34a' }} />
                        <label htmlFor="ni_activo" style={{ fontSize: '14px', color: '#374151', cursor: 'pointer' }}>
                            Activo (visible en producción y compras)
                        </label>
                    </div>

                    <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                        <div>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: '#374151' }}>Aplica IVA (16%)</div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Activa si este insumo está gravado con IVA</div>
                        </div>
                        <input type="checkbox" id="ni_iva" checked={aplicaIva} onChange={e => setAplicaIva(e.target.checked)}
                            style={{ width: '18px', height: '18px', accentColor: '#16a34a', cursor: 'pointer' }} />
                    </div>
                </div>

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px 20px', fontSize: '14px', fontWeight: 600, cursor: guardando ? 'default' : 'pointer', opacity: guardando ? 0.7 : 1 }}>
                        <Check size={16} /> {guardando ? 'Guardando...' : 'Crear y agregar'}
                    </button>
                    <button onClick={onCerrar}
                        style={{ flex: 1, backgroundColor: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '11px 20px', fontSize: '14px', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                </div>
            </div>
        </>
    )
}

// ─── Modal de Pago Compra ──────────────────────────────────────
function ModalPagoCompra({ total, condicionInicial = 'contado', diasInicial = 0, onCerrar, onConfirmar }) {
    const OPCIONES_TASA = [
        { key: 'tasa_bcv', label: 'USD · BCV' },
        { key: 'tasa_euro', label: 'EUR · BCV' },
        { key: 'tasa_binance', label: 'USD · Binance' },
    ]
    const [condicion, setCondicion] = useState(condicionInicial)
    const [diasCredito, setDiasCredito] = useState(diasInicial || 30)
    const [tasas, setTasas] = useState({ tasa_bcv: 1, tasa_euro: 1, tasa_binance: 1 })
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [pagoUsd, setPagoUsd] = useState(total)
    const [pagoBs, setPagoBs] = useState(0)
    const [metodoUsd, setMetodoUsd] = useState('Transferencia USD')
    const [metodoBs, setMetodoBs] = useState('Pago Móvil')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        supabase.from('configuracion').select('clave, valor').then(({ data }) => {
            if (data) { const m = {}; data.forEach(r => m[r.clave] = Number(r.valor)); setTasas({ tasa_bcv: m.tasa_bcv || 1, tasa_euro: m.tasa_euro || 1, tasa_binance: m.tasa_binance || 1 }) }
        })
    }, [])

    const tasa = tasas[tipoTasa] || 1
    const fechaVenc = condicion === 'credito' ? new Date(Date.now() + diasCredito * 86400000).toISOString().split('T')[0] : null

    function handleUsdChange(val) { const n = Math.max(0, Number(val)); setPagoUsd(n); setPagoBs(parseFloat((Math.max(0, total - n) * tasa).toFixed(2))) }

    function handleTasaChange(nuevaTasa) {
        setTipoTasa(nuevaTasa)
        const t = tasas[nuevaTasa] || 1
        setPagoBs(parseFloat((Math.max(0, total - pagoUsd) * t).toFixed(2)))
    }

    async function confirmar() {
        const abonoEnUsd = pagoUsd + (pagoBs / tasa)
        if (abonoEnUsd < total - 0.01 && condicion === 'contado') { setError('El monto pagado no cubre el total'); return }
        setGuardando(true); setError('')
        await onConfirmar({ condicion_pago: condicion, dias_credito: condicion === 'credito' ? diasCredito : 0, fecha_vencimiento_pago: fechaVenc, estado_cobro: condicion === 'contado' ? 'pagado' : 'pendiente', tasa_cambio: tasa, tipo_tasa: tipoTasa, pago_usd: pagoUsd, pago_bs: pagoBs, metodo_usd: metodoUsd, metodo_bs: metodoBs })
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '460px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#1f2937', margin: 0 }}>Confirmar pago</h2>
                    <button onClick={onCerrar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}><X size={20} /></button>
                </div>
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Total a pagar</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#16a34a' }}>{fmt(total)}</div>
                </div>

                {/* Condición de pago */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    {['contado', 'credito'].map(c => (
                        <button key={c} onClick={() => setCondicion(c)} style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid', cursor: 'pointer', borderColor: condicion === c ? '#16a34a' : '#e5e7eb', backgroundColor: condicion === c ? '#f0fdf4' : '#fff', color: condicion === c ? '#16a34a' : '#6b7280' }}>
                            {c.charAt(0).toUpperCase() + c.slice(1)}
                        </button>
                    ))}
                </div>
                {condicion === 'credito' && (
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Días de crédito</label>
                        <input type="number" min="1" value={diasCredito} onChange={e => setDiasCredito(Number(e.target.value))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' }} />
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Vence: {new Date(fechaVenc).toLocaleDateString('es-VE')}</div>
                    </div>
                )}

                {/* Selector de tasa */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tasa de cambio</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {OPCIONES_TASA.map(op => (
                            <button key={op.key} onClick={() => handleTasaChange(op.key)}
                                style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid', cursor: 'pointer', borderColor: tipoTasa === op.key ? '#16a34a' : '#e5e7eb', backgroundColor: tipoTasa === op.key ? '#f0fdf4' : '#fff', color: tipoTasa === op.key ? '#16a34a' : '#6b7280' }}>
                                <div>{op.label}</div>
                                <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 400 }}>{tasas[op.key].toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Montos */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div><label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Pago USD ($)</label><input type="number" min="0" step="0.01" value={pagoUsd} onChange={e => handleUsdChange(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px', fontWeight: 600, boxSizing: 'border-box' }} /></div>
                    <div><label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Vía USD</label><select value={metodoUsd} onChange={e => setMetodoUsd(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>{['Transferencia USD', 'Efectivo', 'Zelle', 'Otro'].map(m => <option key={m}>{m}</option>)}</select></div>
                    <div><label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Pago Bs.</label><input type="number" min="0" step="1" value={pagoBs} onChange={e => setPagoBs(Math.max(0, Number(e.target.value)))} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '15px', fontWeight: 600, boxSizing: 'border-box' }} /></div>
                    <div><label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Vía Bs.</label><select value={metodoBs} onChange={e => setMetodoBs(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', backgroundColor: '#fff' }}>{['Pago Móvil', 'Transferencia', 'Punto de Venta', 'Efectivo Bs.'].map(m => <option key={m}>{m}</option>)}</select></div>
                </div>

                {/* Equivalente en Bs */}
                {pagoUsd > 0 && (
                    <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px', fontSize: '12px', color: '#6b7280' }}>
                        ${pagoUsd.toFixed(2)} × {tasa.toLocaleString('es-VE', { minimumFractionDigits: 2 })} = <strong style={{ color: '#374151' }}>{(pagoUsd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</strong>
                    </div>
                )}

                {error && <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>{error}</div>}
                <button onClick={confirmar} disabled={guardando} style={{ width: '100%', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: 700, cursor: 'pointer' }}>{guardando ? 'Registrando...' : 'Confirmar recepción y pago'}</button>
            </div>
        </>
    )
}

// ─── Detalle Orden ────────────────────────────────────────────
function DetalleOrden({ orden, onVolver }) {
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [mapaNombres, setMapaNombres] = useState({})

    useEffect(() => {
        if (!orden?.empresa_id) return

        Promise.all([
            supabase.from('materias_primas').select('id, nombre').eq('empresa_id', orden.empresa_id),
            supabase.from('materiales_empaque').select('id, nombre').eq('empresa_id', orden.empresa_id),
            supabase.from('productos_terminados').select('id, nombre').eq('empresa_id', orden.empresa_id),
            supabase.from('consumibles').select('id, nombre').eq('empresa_id', orden.empresa_id)
        ]).then(([mp, emp, pt, con]) => {
            const mapa = {}
                ;[...(mp.data || []), ...(emp.data || []), ...(pt.data || []), ...(con.data || [])]
                    .forEach(i => mapa[i.id] = i.nombre)
            setMapaNombres(mapa)
        })

        supabase.from('orden_compra_items').select('*')
            .eq('orden_id', orden.id)
            .eq('empresa_id', orden.empresa_id)
            .then(({ data }) => {
                if (data) setItems(data)
                setLoading(false)
            })
    }, [orden.id, orden.empresa_id])

    const total = orden.total || 0
    const subtotal = orden.subtotal || 0
    const iva = total - subtotal

    return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>
            {/* ESTILOS PARA IMPRESIÓN */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .print-target, .print-target * { visibility: visible; }
                    .print-target {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        padding: 20px !important;
                        border: none !important;
                        box-shadow: none !important;
                        background: white !important;
                    }
                    .no-print { display: none !important; }
                }
            `}</style>

            {/* Encabezado (se oculta al imprimir) */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Orden de Compra</h1>

                <button onClick={() => window.print()}
                    style={{ marginLeft: 'auto', marginRight: '8px', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                    🖨️ Imprimir
                </button>
            </div>

            {/* Documento (lo único que se imprime) */}
            <div className="print-target" style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <div style={{ fontSize: '22px', marginBottom: '4px' }}>📋</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>Orden de Compra</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{orden.numero_oc}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{new Date(orden.fecha_emision).toLocaleDateString('es-VE')}</div>
                        <div style={{ marginTop: '6px' }}>
                            <BadgeOC estado={orden.estado} />
                        </div>
                    </div>
                </div>

                <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proveedor</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{orden.proveedores?.nombre || '—'}</div>
                </div>

                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Cargando items...</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                {['Insumo', 'Tipo', 'Solicitado', 'Recibido', 'Precio', 'Total'].map((h, i) => (
                                    <th key={i} style={{ padding: '8px 0', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i > 1 ? 'right' : 'left' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#1f2937' }}>{mapaNombres[item.insumo_id] || item.insumo_id}</td>
                                    <td style={{ padding: '10px 0', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>{item.tipo_insumo.replace('_', ' ')}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{item.cantidad_solicitada}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: item.cantidad_recibida >= item.cantidad_solicitada ? '#16a34a' : '#d97706', textAlign: 'right', fontWeight: 600 }}>{item.cantidad_recibida}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>{fmt(item.precio_unitario_esperado)}</td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>{fmt(item.cantidad_solicitada * item.precio_unitario_esperado)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                    {[['Subtotal', fmt(subtotal)], ['IVA (16%)', fmt(iva)]].map(([l, v]) => (
                        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#6b7280', marginBottom: '6px' }}>
                            <span>{l}</span> <span>{v}</span>
                        </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#1f2937', marginTop: '8px', paddingTop: '8px', borderTop: '2px solid #e5e7eb' }}>
                        <span>Total</span> <span style={{ color: '#16a34a' }}>{fmt(total)}</span>
                    </div>
                </div>

                <div style={{ marginTop: '32px', textAlign: 'center', fontSize: '12px', color: '#d1d5db' }}>Documento generado electrónicamente</div>
            </div>
        </div>
    )
}

// ─── Detalle Recepción ────────────────────────────────────────
// ─── Detalle Recepción (CORREGIDO) ────────────────────────────
function DetalleRecepcion({ recepcion, onVolver }) {
    const { perfil } = useAuth() // 👈 AGREGADO: Necesario para RLS
    const [items, setItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [mapaNombres, setMapaNombres] = useState({})

    useEffect(() => {
        if (!perfil?.empresa_id) return // Esperar a que cargue el perfil

        // Cargar nombres de TODOS los tipos de insumos (incluyendo consumibles)
        Promise.all([
            supabase.from('materias_primas').select('id, nombre').eq('empresa_id', perfil.empresa_id),
            supabase.from('materiales_empaque').select('id, nombre').eq('empresa_id', perfil.empresa_id),
            supabase.from('productos_terminados').select('id, nombre').eq('empresa_id', perfil.empresa_id),
            supabase.from('consumibles').select('id, nombre').eq('empresa_id', perfil.empresa_id)
        ]).then(([mp, emp, pt, con]) => {
            const mapa = {}
                ;[...(mp.data || []), ...(emp.data || []), ...(pt.data || []), ...(con.data || [])]
                    .forEach(i => mapa[i.id] = i.nombre)
            setMapaNombres(mapa)
        })

        // Cargar items con filtro empresa_id para RLS
        supabase.from('compra_items').select('*')
            .eq('compra_id', recepcion.id)
            .eq('empresa_id', perfil.empresa_id) // 👈 CRÍTICO: Sin esto RLS bloquea
            .then(({ data, error }) => {
                if (error) console.error('Error cargando items:', error)
                if (data) {
                    setItems(data)
                    console.log('Items cargados:', data.length) // Debug
                }
                setLoading(false)
            })
    }, [recepcion.id, perfil?.empresa_id]) // 👈 Agregar perfil.empresa_id a dependencias

    if (!recepcion) return null

    return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onVolver} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Detalle de Recepción</h1>
            </div>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '32px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>Recepción</div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>{recepcion.numero_doc}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>{new Date(recepcion.fecha_compra).toLocaleDateString('es-VE')}</div>
                        <div style={{ marginTop: '6px', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <BadgeCobro estado={recepcion.estado_cobro || 'pendiente'} />
                        </div>
                    </div>
                </div>
                {recepcion.ordenes_compra && (
                    <div style={{ backgroundColor: '#f0fdf4', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <ArrowRight size={14} style={{ color: '#16a34a' }} />
                        <span style={{ fontSize: '13px', color: '#166534' }}>Vinculada a OC: <strong>{recepcion.ordenes_compra.numero_oc}</strong></span>
                    </div>
                )}
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px' }}>
                    <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Proveedor</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1f2937' }}>{recepcion.proveedores?.nombre || '—'}</div>
                </div>
                {loading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af' }}>Cargando items...</div>
                ) : items.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>
                        No hay items registrados en esta recepción
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                                {['Insumo', 'Tipo', 'Cant.', 'Precio unit.', 'Total'].map((h, i) => (
                                    <th key={i} style={{ padding: '8px 0', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: i > 1 ? 'right' : 'left' }}>
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#1f2937' }}>
                                        {mapaNombres[item.insumo_id] || item.insumo_id}
                                    </td>
                                    <td style={{ padding: '10px 0', fontSize: '11px', color: '#6b7280', textTransform: 'uppercase' }}>
                                        {item.tipo_insumo?.replace('_', ' ') || '—'}
                                    </td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>
                                        {item.cantidad}
                                    </td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', color: '#6b7280', textAlign: 'right' }}>
                                        {fmt(item.precio_unitario)}
                                    </td>
                                    <td style={{ padding: '10px 0', fontSize: '13px', fontWeight: 600, color: '#1f2937', textAlign: 'right' }}>
                                        {fmt(item.cantidad * item.precio_unitario)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>
                        <span>Total</span>
                        <span style={{ color: '#16a34a' }}>{fmt(recepcion.total)}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}