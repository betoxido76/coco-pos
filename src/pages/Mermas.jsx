import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Search, X, Check, AlertTriangle } from 'lucide-react'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

const TIPOS_MERMA = [
    { key: 'inventario', label: 'Inventario',       bg: '#fef9c3', color: '#854d0e' },
    { key: 'despacho',   label: 'Despacho/Entrega', bg: '#dbeafe', color: '#1e40af' },
]

const MOTIVOS = {
    inventario: ['Vencimiento', 'Daño físico', 'Contaminación', 'Robo/Hurto', 'Otro'],
    despacho:   ['Rotura en entrega', 'Producto incorrecto', 'Daño en transporte', 'Error de despacho', 'Otro'],
}

const TIPOS_ITEM = [
    { key: 'producto_terminado', label: 'Producto terminado',  tabla: 'productos_terminados', campoNombre: 'nombre', campoCodigo: 'sku',    campoCosto: 'costo_promedio' },
    { key: 'materia_prima',      label: 'Materia prima',       tabla: 'materias_primas',      campoNombre: 'nombre', campoCodigo: 'codigo', campoCosto: 'costo_compra_promedio' },
    { key: 'empaque',            label: 'Material de empaque', tabla: 'materiales_empaque',   campoNombre: 'nombre', campoCodigo: 'codigo', campoCosto: 'costo_compra_promedio' },
    { key: 'consumible',         label: 'Consumible',          tabla: 'consumibles',          campoNombre: 'nombre', campoCodigo: 'codigo', campoCosto: 'costo_compra_promedio' },
]

function BadgeTipo({ tipo }) {
    const t = TIPOS_MERMA.find(x => x.key === tipo) || TIPOS_MERMA[0]
    return (
        <span style={{ backgroundColor: t.bg, color: t.color, padding: '2px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>
            {t.label}
        </span>
    )
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Mermas() {
    const { perfil } = useAuth()
    const [mermas, setMermas]             = useState([])
    const [loading, setLoading]           = useState(true)
    const [vista, setVista]               = useState('lista')
    const [filtroTipo, setFiltroTipo]     = useState('todos')
    const [filtroMes, setFiltroMes]       = useState('')
    const [busqueda, setBusqueda]         = useState('')
    const [modalAnular, setModalAnular]   = useState(null)

    useEffect(() => { cargar() }, [filtroTipo, filtroMes])

    async function cargar() {
        setLoading(true)
        let q = supabase
            .from('mermas')
            .select('*, ventas(numero_factura), ubicaciones(nombre), usuarios(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .eq('anulada', false)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })

        if (filtroTipo !== 'todos') q = q.eq('tipo_merma', filtroTipo)

        if (filtroMes) {
            const [anio, mes] = filtroMes.split('-')
            const desde = `${anio}-${mes}-01`
            const hasta = new Date(Number(anio), Number(mes), 0).toISOString().split('T')[0]
            q = q.gte('fecha', desde).lte('fecha', hasta)
        }

        const { data } = await q
        if (data) setMermas(data)
        setLoading(false)
    }

    async function anular(merma, motivoAnulacion) {
        // Revertir stock en la tabla correspondiente
        const def = TIPOS_ITEM.find(t => t.key === merma.tipo_item)
        if (def) {
            const { data: item } = await supabase
                .from(def.tabla).select('stock_actual').eq('id', merma.item_id).single()
            if (item) {
                await supabase.from(def.tabla)
                    .update({ stock_actual: item.stock_actual + Number(merma.cantidad) })
                    .eq('id', merma.item_id)
            }
        }
        await supabase.from('mermas')
            .update({ anulada: true, motivo_anulacion: motivoAnulacion })
            .eq('id', merma.id)
        setModalAnular(null)
        cargar()
    }

    // KPIs
    const mermasHoy     = mermas.filter(m => m.fecha === new Date().toISOString().split('T')[0]).length
    const perdidaTotal  = mermas.reduce((s, m) => s + (Number(m.cantidad) * Number(m.costo_unitario || 0)), 0)
    const porInventario = mermas.filter(m => m.tipo_merma === 'inventario').length
    const porDespacho   = mermas.filter(m => m.tipo_merma === 'despacho').length

    const filtradas = mermas.filter(m =>
        m.item_nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
        m.item_codigo?.toLowerCase().includes(busqueda.toLowerCase()) ||
        m.motivo?.toLowerCase().includes(busqueda.toLowerCase())
    )

    if (vista === 'nueva')
        return <NuevaMerma
            onRegistrada={() => { cargar(); setVista('lista') }}
            onCancelar={() => setVista('lista')}
        />

    return (
        <div style={{ padding: '24px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Mermas</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Registro de pérdidas de inventario y despacho</p>
                </div>
                <button onClick={() => setVista('nueva')}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                    <Plus size={16} /> Registrar merma
                </button>
            </div>

            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'Total registradas', valor: mermas.length,   color: '#1f2937' },
                    { label: 'Mermas hoy',         valor: mermasHoy,       color: mermasHoy > 0 ? '#dc2626' : '#1f2937' },
                    { label: 'De inventario',      valor: porInventario,   color: '#854d0e' },
                    { label: 'De despacho',        valor: porDespacho,     color: '#1e40af' },
                ].map(k => (
                    <div key={k.label} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                        <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{k.label}</p>
                        <p style={{ fontSize: '24px', fontWeight: 700, color: k.color, margin: 0 }}>{k.valor}</p>
                    </div>
                ))}
            </div>

            {/* Pérdida estimada */}
            {perdidaTotal > 0 && (
                <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <AlertTriangle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                    <span style={{ fontSize: '13px', color: '#854d0e', fontWeight: 500 }}>
                        Pérdida estimada acumulada: <strong>{fmt(perdidaTotal)}</strong>
                        <span style={{ fontWeight: 400, marginLeft: '6px' }}>(basada en costos promedio al momento del registro)</span>
                    </span>
                </div>
            )}

            {/* Filtros */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                    <input type="text" placeholder="Buscar por ítem, código o motivo..."
                        value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', boxSizing: 'border-box' }} />
                </div>

                {[['todos', 'Todas'], ['inventario', 'Inventario'], ['despacho', 'Despacho']].map(([val, lbl]) => (
                    <button key={val} onClick={() => setFiltroTipo(val)}
                        style={{ padding: '8px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid', cursor: 'pointer',
                            borderColor: filtroTipo === val ? '#16a34a' : '#e5e7eb',
                            backgroundColor: filtroTipo === val ? '#16a34a' : '#fff',
                            color: filtroTipo === val ? '#fff' : '#6b7280' }}>
                        {lbl}
                    </button>
                ))}

                <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff' }} />

                {filtroMes && (
                    <button onClick={() => setFiltroMes('')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px' }}>
                        <X size={16} />
                    </button>
                )}
            </div>

            {/* Tabla */}
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                {loading ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>Cargando...</div>
                ) : filtradas.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>No hay mermas registradas</div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Fecha', 'Tipo', 'Ítem', 'Cantidad', 'Motivo', 'Pérdida est.', 'Factura vinculada', 'Usuario', ''].map((h, i) => (
                                    <th key={i} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtradas.map(m => (
                                <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                        {new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-VE')}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <BadgeTipo tipo={m.tipo_merma} />
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{m.item_nombre}</div>
                                        {m.item_codigo && (
                                            <div style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>{m.item_codigo}</div>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>
                                        -{Number(m.cantidad).toLocaleString('es-VE')} {m.unidad_medida}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <div style={{ fontSize: '13px', color: '#374151' }}>{m.motivo}</div>
                                        {m.descripcion && (
                                            <div style={{ fontSize: '11px', color: '#9ca3af', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {m.descripcion}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '13px', color: '#854d0e', fontWeight: 500 }}>
                                        {m.costo_unitario ? fmt(Number(m.cantidad) * Number(m.costo_unitario)) : '—'}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>
                                        {m.ventas?.numero_factura
                                            ? <span style={{ fontFamily: 'monospace', color: '#1d4ed8' }}>{m.ventas.numero_factura}</span>
                                            : '—'}
                                    </td>
                                    <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>
                                        {m.usuarios?.nombre || '—'}
                                    </td>
                                    <td style={{ padding: '12px 14px' }}>
                                        <button onClick={() => setModalAnular(m)}
                                            style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}>
                                            <X size={12} /> Anular
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {modalAnular && (
                <ModalAnular
                    merma={modalAnular}
                    onConfirmar={(motivo) => anular(modalAnular, motivo)}
                    onCerrar={() => setModalAnular(null)}
                />
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// NUEVA MERMA
// ══════════════════════════════════════════════════════════════
function NuevaMerma({ onRegistrada, onCancelar }) {
    const { perfil } = useAuth()
    const [tipoMerma,    setTipoMerma]    = useState('inventario')
    const [tipoItem,     setTipoItem]     = useState('producto_terminado')
    const [items,        setItems]        = useState([])
    const [busqueda,     setBusqueda]     = useState('')
    const [itemSel,      setItemSel]      = useState(null)
    const [cantidad,     setCantidad]     = useState('')
    const [motivo,       setMotivo]       = useState('')
    const [descripcion,  setDescripcion]  = useState('')
    const [fecha,        setFecha]        = useState(new Date().toISOString().split('T')[0])
    const [ventaId,      setVentaId]      = useState('')
    const [ventas,       setVentas]       = useState([])
    const [guardando,    setGuardando]    = useState(false)
    const [error,        setError]        = useState('')

    const def = TIPOS_ITEM.find(t => t.key === tipoItem)

    // Cargar ítems cuando cambia el tipo
    useEffect(() => {
        if (!def) return
        supabase.from(def.tabla)
            .select(`id, ${def.campoNombre}, ${def.campoCodigo}, ${def.campoCosto}, unidad_medida, stock_actual`)
            .eq('activo', true)
            .eq('empresa_id', perfil.empresa_id)
            .order(def.campoNombre)
            .then(({ data }) => setItems(data || []))
        setItemSel(null)
        setBusqueda('')
    }, [tipoItem])

    // Cargar ventas recientes para vincular (solo tipo despacho)
    useEffect(() => {
        if (tipoMerma !== 'despacho') { setVentaId(''); return }
        supabase.from('ventas')
            .select('id, numero_factura, clientes(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .order('created_at', { ascending: false })
            .limit(30)
            .then(({ data }) => setVentas(data || []))
    }, [tipoMerma])

    const itemsFiltrados = items.filter(i => {
        const nombre = i[def?.campoNombre] || ''
        const codigo = i[def?.campoCodigo] || ''
        const q = busqueda.toLowerCase()
        return nombre.toLowerCase().includes(q) || codigo.toLowerCase().includes(q)
    })

    function seleccionarItem(item) {
        setItemSel(item)
        setBusqueda(item[def.campoNombre])
    }

    async function guardar() {
        if (!itemSel)                       { setError('Selecciona un ítem'); return }
        if (!cantidad || Number(cantidad) <= 0) { setError('Ingresa una cantidad válida'); return }
        if (!motivo)                        { setError('Selecciona un motivo'); return }
        if (Number(cantidad) > itemSel.stock_actual) {
            setError(`Stock insuficiente. Disponible: ${itemSel.stock_actual} ${itemSel.unidad_medida}`)
            return
        }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()

        // 1. Registrar la merma
        const { error: errMerma } = await supabase.from('mermas').insert({
            empresa_id:    perfil.empresa_id,
            tipo_item:     tipoItem,
            item_id:       itemSel.id,
            item_nombre:   itemSel[def.campoNombre],
            item_codigo:   itemSel[def.campoCodigo] || null,
            unidad_medida: itemSel.unidad_medida,
            cantidad:      Number(cantidad),
            costo_unitario: itemSel[def.campoCosto] || null,
            tipo_merma:    tipoMerma,
            motivo,
            descripcion:   descripcion.trim() || null,
            venta_id:      ventaId || null,
            usuario_id:    user.id,
            fecha,
        })

        if (errMerma) { setError('Error: ' + errMerma.message); setGuardando(false); return }

        // 2. Descontar stock
        await supabase.from(def.tabla)
            .update({ stock_actual: itemSel.stock_actual - Number(cantidad) })
            .eq('id', itemSel.id)

        setGuardando(false)
        onRegistrada()
    }

    const inputStyle = {
        width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
        borderRadius: '8px', fontSize: '14px', color: '#374151',
        backgroundColor: '#fff', boxSizing: 'border-box',
    }

    return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Registrar merma</h1>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Tipo de merma */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Tipo de merma *</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {TIPOS_MERMA.map(t => (
                            <button key={t.key} onClick={() => { setTipoMerma(t.key); setMotivo('') }}
                                style={{ flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, border: '1px solid', cursor: 'pointer',
                                    borderColor: tipoMerma === t.key ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: tipoMerma === t.key ? '#f0fdf4' : '#fff',
                                    color: tipoMerma === t.key ? '#16a34a' : '#6b7280' }}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tipo de ítem */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Tipo de ítem *</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {TIPOS_ITEM.map(t => (
                            <button key={t.key} onClick={() => setTipoItem(t.key)}
                                style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', border: '1px solid', cursor: 'pointer',
                                    borderColor: tipoItem === t.key ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: tipoItem === t.key ? '#16a34a' : '#fff',
                                    color: tipoItem === t.key ? '#fff' : '#6b7280' }}>
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Búsqueda de ítem */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Ítem afectado *</label>
                    <div style={{ position: 'relative' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
                        <input type="text" placeholder="Buscar por nombre o código..."
                            value={busqueda}
                            onChange={e => { setBusqueda(e.target.value); setItemSel(null) }}
                            style={{ ...inputStyle, paddingLeft: '32px' }} />
                    </div>

                    {busqueda && !itemSel && (
                        <div style={{ marginTop: '4px', border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', maxHeight: '200px', overflowY: 'auto' }}>
                            {itemsFiltrados.length === 0
                                ? <div style={{ padding: '12px', fontSize: '13px', color: '#9ca3af', textAlign: 'center' }}>Sin resultados</div>
                                : itemsFiltrados.map(i => (
                                    <div key={i.id} onClick={() => seleccionarItem(i)}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6', fontSize: '13px' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                        <div>
                                            <span style={{ fontWeight: 500, color: '#1f2937' }}>{i[def.campoNombre]}</span>
                                            {i[def.campoCodigo] && (
                                                <span style={{ color: '#9ca3af', marginLeft: '8px', fontFamily: 'monospace', fontSize: '11px' }}>{i[def.campoCodigo]}</span>
                                            )}
                                        </div>
                                        <span style={{ fontSize: '12px', color: i.stock_actual <= 0 ? '#dc2626' : '#16a34a', fontWeight: 500 }}>
                                            Stock: {i.stock_actual} {i.unidad_medida}
                                        </span>
                                    </div>
                                ))}
                        </div>
                    )}

                    {itemSel && (
                        <div style={{ marginTop: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#166534' }}>{itemSel[def.campoNombre]}</span>
                                {itemSel[def.campoCodigo] && (
                                    <span style={{ fontSize: '11px', color: '#16a34a', marginLeft: '8px', fontFamily: 'monospace' }}>{itemSel[def.campoCodigo]}</span>
                                )}
                                <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '2px' }}>
                                    Stock disponible: {itemSel.stock_actual} {itemSel.unidad_medida}
                                    {itemSel[def.campoCosto] ? ` · Costo: ${fmt(itemSel[def.campoCosto])}` : ''}
                                </div>
                            </div>
                            <button onClick={() => { setItemSel(null); setBusqueda('') }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a' }}>
                                <X size={16} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Cantidad y fecha */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Cantidad a dar de baja * {itemSel ? `(${itemSel.unidad_medida})` : ''}
                        </label>
                        <input type="number" min="0.001" step="0.001" value={cantidad}
                            onChange={e => setCantidad(e.target.value)}
                            placeholder="0"
                            style={{ ...inputStyle, borderColor: itemSel && cantidad && Number(cantidad) > itemSel.stock_actual ? '#f87171' : '#d1d5db' }} />
                        {itemSel && cantidad && Number(cantidad) > itemSel.stock_actual && (
                            <p style={{ fontSize: '12px', color: '#dc2626', margin: '4px 0 0' }}>
                                Supera el stock disponible ({itemSel.stock_actual})
                            </p>
                        )}
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Fecha *</label>
                        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
                    </div>
                </div>

                {/* Motivo */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Motivo *</label>
                    <select value={motivo} onChange={e => setMotivo(e.target.value)} style={inputStyle}>
                        <option value="">Seleccionar motivo...</option>
                        {MOTIVOS[tipoMerma].map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>

                {/* Descripción */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        Descripción <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                        rows={2} placeholder="Detalles adicionales sobre la pérdida..."
                        style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                {/* Factura vinculada — solo despacho */}
                {tipoMerma === 'despacho' && (
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                            Vincular a factura <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                        </label>
                        <select value={ventaId} onChange={e => setVentaId(e.target.value)} style={inputStyle}>
                            <option value="">Sin vincular</option>
                            {ventas.map(v => (
                                <option key={v.id} value={v.id}>
                                    {v.numero_factura} — {v.clientes?.nombre || '—'}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Resumen antes de confirmar */}
                {itemSel && cantidad && Number(cantidad) > 0 && motivo && (
                    <div style={{ backgroundColor: '#fef9c3', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 16px' }}>
                        <p style={{ fontSize: '12px', color: '#854d0e', fontWeight: 600, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Resumen del registro
                        </p>
                        <p style={{ fontSize: '13px', color: '#78350f', margin: '0 0 2px' }}>
                            Se darán de baja <strong>{cantidad} {itemSel.unidad_medida}</strong> de <strong>{itemSel[def.campoNombre]}</strong>
                        </p>
                        <p style={{ fontSize: '13px', color: '#78350f', margin: '0 0 2px' }}>
                            Motivo: <strong>{motivo}</strong> · Tipo: <strong>{tipoMerma}</strong>
                        </p>
                        {itemSel[def.campoCosto] && (
                            <p style={{ fontSize: '13px', color: '#78350f', margin: 0 }}>
                                Pérdida estimada: <strong>{fmt(Number(cantidad) * Number(itemSel[def.campoCosto]))}</strong>
                            </p>
                        )}
                    </div>
                )}

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.7 : 1 }}>
                        <Check size={16} /> {guardando ? 'Registrando...' : 'Confirmar merma'}
                    </button>
                    <button onClick={onCancelar}
                        style={{ padding: '12px 20px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// MODAL ANULACIÓN
// ══════════════════════════════════════════════════════════════
function ModalAnular({ merma, onConfirmar, onCerrar }) {
    const [motivo, setMotivo] = useState('')
    const [error,  setError]  = useState('')

    function confirmar() {
        if (!motivo.trim()) { setError('Ingresa el motivo de anulación'); return }
        onConfirmar(motivo.trim())
    }

    return (
        <>
            <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 40 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '420px', zIndex: 50, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <AlertTriangle size={36} style={{ color: '#d97706', marginBottom: '10px' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: '0 0 6px' }}>Anular merma</h3>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                        Se revertirá el stock de <strong>{merma.item_nombre}</strong> ({merma.cantidad} {merma.unidad_medida})
                    </p>
                </div>
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        Motivo de anulación *
                    </label>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
                        placeholder="Explica por qué se anula este registro..."
                        style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#dc2626', marginBottom: '12px' }}>
                        {error}
                    </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onCerrar}
                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#374151', fontSize: '14px', cursor: 'pointer', fontWeight: 500 }}>
                        Cancelar
                    </button>
                    <button onClick={confirmar}
                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: '#dc2626', color: '#fff', fontSize: '14px', cursor: 'pointer', fontWeight: 600 }}>
                        Confirmar anulación
                    </button>
                </div>
            </div>
        </>
    )
}
