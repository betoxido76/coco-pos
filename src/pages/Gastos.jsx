import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Plus, X, Check, Pencil, Trash2, Settings, AlertTriangle } from 'lucide-react'

const fmt = n => `$${Number(n || 0).toFixed(2)}`
const fmtBs = n => `${Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`

const OPCIONES_TASA = [
    { key: 'tasa_bcv',     label: 'USD · BCV' },
    { key: 'tasa_euro',    label: 'EUR · BCV' },
    { key: 'tasa_binance', label: 'USD · Binance' },
]

const METODOS_PAGO = ['Efectivo USD', 'Efectivo Bs.', 'Zelle', 'Transferencia', 'Pago Móvil', 'Punto de Venta', 'Otro']

const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '14px', color: '#374151',
    backgroundColor: '#fff', boxSizing: 'border-box',
}

// ══════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════
export default function Gastos() {
    const { perfil } = useAuth()
    const [tab, setTab] = useState('gastos') // 'gastos' | 'tipos'
    const [gastos, setGastos] = useState([])
    const [loading, setLoading] = useState(true)
    const [vista, setVista] = useState('lista') // 'lista' | 'nuevo'
    const [tasas, setTasas] = useState({ tasa_bcv: 1, tasa_euro: 1, tasa_binance: 1 })

    // Filtros
    const [filtroTipo, setFiltroTipo] = useState('')
    const [filtroMes, setFiltroMes] = useState('')
    const [tipos, setTipos] = useState([])

    useEffect(() => { cargarTasas(); cargarTipos() }, [])
    useEffect(() => { cargarGastos() }, [filtroTipo, filtroMes])

    async function cargarTasas() {
        const { data } = await supabase.from('configuracion')
            .select('clave, valor').eq('empresa_id', perfil.empresa_id)
            .in('clave', ['tasa_bcv', 'tasa_euro', 'tasa_binance'])
        if (data) {
            const t = {}
            data.forEach(r => { t[r.clave] = Number(r.valor) })
            setTasas(t)
        }
    }

    async function cargarTipos() {
        const { data } = await supabase.from('tipos_gastos')
            .select('id, nombre').eq('empresa_id', perfil.empresa_id)
            .eq('activo', true).order('nombre')
        if (data) setTipos(data)
    }

    async function cargarGastos() {
        setLoading(true)
        let q = supabase.from('gastos')
            .select('*, tipos_gastos(nombre), usuarios(nombre)')
            .eq('empresa_id', perfil.empresa_id)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })

        if (filtroTipo) q = q.eq('tipo_gasto_id', filtroTipo)
        if (filtroMes) {
            const [anio, mes] = filtroMes.split('-')
            const desde = `${anio}-${mes}-01`
            const hasta = new Date(Number(anio), Number(mes), 0).toISOString().split('T')[0]
            q = q.gte('fecha', desde).lte('fecha', hasta)
        }

        const { data } = await q
        if (data) setGastos(data)
        setLoading(false)
    }

    // KPIs
    const totalUsd = gastos.reduce((s, g) => s + Number(g.monto_usd || 0), 0)
    const totalBs = gastos.reduce((s, g) => s + Number(g.monto_bs || 0), 0)
    const totalEnUsd = totalUsd + (totalBs / (tasas.tasa_bcv || 1))

    if (vista === 'nuevo') return (
        <NuevoGasto
            tasas={tasas}
            tipos={tipos}
            onGuardado={() => { cargarGastos(); setVista('lista') }}
            onCancelar={() => setVista('lista')}
        />
    )

    return (
        <div style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Gastos</h1>
                    <p style={{ fontSize: '13px', color: '#6b7280', margin: '4px 0 0' }}>Registro y control de gastos operativos</p>
                </div>
                {tab === 'gastos' && (
                    <button onClick={() => setVista('nuevo')}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 16px', fontSize: '14px', fontWeight: 500, cursor: 'pointer' }}>
                        <Plus size={16} /> Registrar gasto
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                {[
                    { key: 'gastos', label: 'Gastos' },
                    { key: 'tipos', label: '⚙️ Tipos de gasto' },
                ].map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                            border: '1px solid', cursor: 'pointer',
                            borderColor: tab === t.key ? '#16a34a' : '#e5e7eb',
                            backgroundColor: tab === t.key ? '#f0fdf4' : '#fff',
                            color: tab === t.key ? '#16a34a' : '#6b7280',
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab Gastos */}
            {tab === 'gastos' && (
                <>
                    {/* KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
                        {[
                            { label: 'Total en USD', valor: fmt(totalEnUsd), sub: 'Equivalente total' },
                            { label: 'Pagado en USD', valor: fmt(totalUsd), sub: `${gastos.length} registros` },
                            { label: 'Pagado en Bs.', valor: fmtBs(totalBs), sub: `Tasa BCV: ${tasas.tasa_bcv}` },
                        ].map(k => (
                            <div key={k.label} style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '16px 20px' }}>
                                <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 4px' }}>{k.label}</p>
                                <p style={{ fontSize: '22px', fontWeight: 700, color: '#1f2937', margin: '0 0 2px' }}>{k.valor}</p>
                                <p style={{ fontSize: '11px', color: '#9ca3af', margin: 0 }}>{k.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Filtros */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff' }}>
                            <option value="">Todos los tipos</option>
                            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                        <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
                            style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff' }} />
                        {(filtroTipo || filtroMes) && (
                            <button onClick={() => { setFiltroTipo(''); setFiltroMes('') }}
                                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '13px', cursor: 'pointer' }}>
                                <X size={14} /> Limpiar
                            </button>
                        )}
                    </div>

                    {/* Tabla */}
                    <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                        {loading ? (
                            <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>Cargando...</div>
                        ) : gastos.length === 0 ? (
                            <div style={{ padding: '48px', textAlign: 'center', color: '#9ca3af' }}>No hay gastos registrados</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                        {['Fecha', 'Nombre', 'Tipo', 'Método', 'Monto USD', 'Monto Bs.', 'Tasa', 'Usuario'].map((h, i) => (
                                            <th key={i} style={{ padding: '10px 14px', fontSize: '12px', fontWeight: 500, color: '#6b7280', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {gastos.map(g => (
                                        <tr key={g.id} style={{ borderBottom: '1px solid #f3f4f6' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f9fafb'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                                {new Date(g.fecha + 'T00:00:00').toLocaleDateString('es-VE')}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{g.nombre}</div>
                                                {g.descripcion && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>{g.descripcion}</div>}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', color: '#6b7280' }}>
                                                {g.tipos_gastos?.nombre || g.categoria || '—'}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>{g.metodo_pago || '—'}</td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#dc2626' }}>
                                                {Number(g.monto_usd) > 0 ? fmt(g.monto_usd) : '—'}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: '13px', fontWeight: 600, color: '#d97706' }}>
                                                {Number(g.monto_bs) > 0 ? fmtBs(g.monto_bs) : '—'}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>
                                                {g.tipo_tasa ? OPCIONES_TASA.find(o => o.key === g.tipo_tasa)?.label : '—'}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontSize: '12px', color: '#6b7280' }}>
                                                {g.usuarios?.nombre || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}

            {/* Tab Tipos de gasto */}
            {tab === 'tipos' && (
                <TiposGasto tipos={tipos} onActualizado={cargarTipos} />
            )}
        </div>
    )
}

// ══════════════════════════════════════════════════════════════
// NUEVO GASTO
// ══════════════════════════════════════════════════════════════
function NuevoGasto({ tasas, tipos, onGuardado, onCancelar }) {
    const { perfil } = useAuth()
    const [nombre, setNombre] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [tipoGastoId, setTipoGastoId] = useState('')
    const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0])
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [montoUsd, setMontoUsd] = useState('')
    const [montoBs, setMontoBs] = useState('')
    const [metodoPago, setMetodoPago] = useState('Efectivo USD')
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')

    const tasa = tasas[tipoTasa] || 1
    const totalEnUsd = Number(montoUsd || 0) + (Number(montoBs || 0) / tasa)

    function handleUsdChange(val) {
        setMontoUsd(val)
    }

    function handleBsChange(val) {
        setMontoBs(val)
    }

    async function guardar() {
        if (!nombre.trim()) { setError('El nombre del gasto es obligatorio'); return }
        if (!tipoGastoId) { setError('Selecciona el tipo de gasto'); return }
        if (Number(montoUsd) <= 0 && Number(montoBs) <= 0) { setError('Ingresa al menos un monto'); return }
        setGuardando(true); setError('')

        const { data: { user } } = await supabase.auth.getUser()

        const { error: err } = await supabase.from('gastos').insert({
            empresa_id: perfil.empresa_id,
            nombre: nombre.trim(),
            descripcion: descripcion.trim() || null,
            tipo_gasto_id: tipoGastoId,
            fecha,
            monto_usd: Number(montoUsd || 0),
            monto_bs: Number(montoBs || 0),
            tasa_cambio: tasa,
            tipo_tasa: tipoTasa,
            metodo_pago: metodoPago,
            usuario_id: user.id,
            // Compatibilidad con columna vieja
            monto: Number(montoUsd || 0) + (Number(montoBs || 0) / tasa),
        })

        if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        setGuardando(false)
        onGuardado()
    }

    return (
        <div style={{ padding: '24px', maxWidth: '680px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '13px' }}>← Volver</button>
                <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#1f2937', margin: 0 }}>Registrar gasto</h1>
            </div>

            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Nombre y tipo */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Nombre del gasto *</label>
                        <input value={nombre} onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: Pago de alquiler" style={inputStyle} autoFocus />
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Tipo de gasto *</label>
                        <select value={tipoGastoId} onChange={e => setTipoGastoId(e.target.value)} style={inputStyle}>
                            <option value="">Seleccionar tipo...</option>
                            {tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                        </select>
                        {tipos.length === 0 && (
                            <p style={{ fontSize: '11px', color: '#ef4444', margin: '4px 0 0' }}>
                                No hay tipos configurados. Ve a la pestaña "Tipos de gasto" para crearlos.
                            </p>
                        )}
                    </div>
                </div>

                {/* Fecha y método de pago */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Fecha *</label>
                        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Método de pago</label>
                        <select value={metodoPago} onChange={e => setMetodoPago(e.target.value)} style={inputStyle}>
                            {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                </div>

                {/* Tasa */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '8px' }}>Tasa de referencia</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {OPCIONES_TASA.map(o => (
                            <button key={o.key} onClick={() => setTipoTasa(o.key)}
                                style={{
                                    padding: '7px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
                                    border: '1px solid', cursor: 'pointer',
                                    borderColor: tipoTasa === o.key ? '#16a34a' : '#e5e7eb',
                                    backgroundColor: tipoTasa === o.key ? '#f0fdf4' : '#fff',
                                    color: tipoTasa === o.key ? '#16a34a' : '#6b7280',
                                }}>
                                {o.label}
                                <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.7 }}>
                                    {tasas[o.key]?.toLocaleString('es-VE')} Bs.
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Montos */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Monto en USD</label>
                        <input type="number" min="0" step="0.01" value={montoUsd}
                            onChange={e => handleUsdChange(e.target.value)}
                            placeholder="0.00" style={inputStyle} />
                    </div>
                    <div>
                        <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>Monto en Bs.</label>
                        <input type="number" min="0" step="1" value={montoBs}
                            onChange={e => handleBsChange(e.target.value)}
                            placeholder="0.00" style={inputStyle} />
                    </div>
                </div>

                {/* Resumen */}
                {(Number(montoUsd) > 0 || Number(montoBs) > 0) && (
                    <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px' }}>
                        <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: 600, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Total equivalente
                        </p>
                        <p style={{ fontSize: '18px', fontWeight: 700, color: '#166534', margin: 0 }}>
                            {fmt(totalEnUsd)}
                        </p>
                        <p style={{ fontSize: '11px', color: '#16a34a', margin: '2px 0 0' }}>
                            {fmt(montoUsd || 0)} USD + {fmtBs(montoBs || 0)} ÷ {tasa.toLocaleString('es-VE')}
                        </p>
                    </div>
                )}

                {/* Descripción */}
                <div>
                    <label style={{ fontSize: '13px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '6px' }}>
                        Descripción <span style={{ color: '#9ca3af', fontWeight: 400 }}>(opcional)</span>
                    </label>
                    <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)}
                        rows={2} placeholder="Notas adicionales sobre este gasto..."
                        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={guardar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '12px 24px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', opacity: guardando ? 0.7 : 1 }}>
                        <Check size={16} /> {guardando ? 'Guardando...' : 'Confirmar gasto'}
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
// TIPOS DE GASTO
// ══════════════════════════════════════════════════════════════
function TiposGasto({ tipos, onActualizado }) {
    const { perfil } = useAuth()
    const [nuevoNombre, setNuevoNombre] = useState('')
    const [guardando, setGuardando] = useState(false)
    const [editando, setEditando] = useState(null) // { id, nombre }
    const [error, setError] = useState('')

    async function agregar() {
        if (!nuevoNombre.trim()) { setError('Ingresa un nombre'); return }
        setGuardando(true); setError('')
        const { error: err } = await supabase.from('tipos_gastos').insert({
            empresa_id: perfil.empresa_id,
            nombre: nuevoNombre.trim(),
        })
        if (err) { setError('Error: ' + err.message); setGuardando(false); return }
        setNuevoNombre('')
        setGuardando(false)
        onActualizado()
    }

    async function guardarEdicion() {
        if (!editando.nombre.trim()) return
        await supabase.from('tipos_gastos').update({ nombre: editando.nombre.trim() }).eq('id', editando.id)
        setEditando(null)
        onActualizado()
    }

    async function eliminar(id) {
        // Verificar si tiene gastos asociados
        const { count } = await supabase.from('gastos')
            .select('id', { count: 'exact', head: true })
            .eq('tipo_gasto_id', id)
        if (count > 0) {
            setError(`No se puede eliminar — tiene ${count} gasto(s) asociado(s). Puedes renombrarlo en su lugar.`)
            return
        }
        await supabase.from('tipos_gastos').delete().eq('id', id)
        onActualizado()
    }

    return (
        <div style={{ maxWidth: '560px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>Tipos de gasto ({tipos.length})</span>
                </div>

                {/* Lista */}
                {tipos.length === 0 ? (
                    <div style={{ padding: '32px', textAlign: 'center', color: '#9ca3af', fontSize: '13px' }}>
                        No hay tipos configurados. Agrega el primero abajo.
                    </div>
                ) : tipos.map(t => (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #f9fafb' }}>
                        {editando?.id === t.id ? (
                            <div style={{ display: 'flex', gap: '8px', flex: 1, marginRight: '8px' }}>
                                <input value={editando.nombre}
                                    onChange={e => setEditando({ ...editando, nombre: e.target.value })}
                                    onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(); if (e.key === 'Escape') setEditando(null) }}
                                    style={{ ...inputStyle, padding: '6px 10px', fontSize: '13px' }}
                                    autoFocus />
                                <button onClick={guardarEdicion}
                                    style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#16a34a', color: '#fff', fontSize: '12px', cursor: 'pointer', fontWeight: 500 }}>
                                    Guardar
                                </button>
                                <button onClick={() => setEditando(null)}
                                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e5e7eb', backgroundColor: '#fff', color: '#6b7280', fontSize: '12px', cursor: 'pointer' }}>
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            <>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{t.nombre}</span>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => { setEditando({ id: t.id, nombre: t.nombre }); setError('') }}
                                        style={{ background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#6b7280' }}>
                                        <Pencil size={13} />
                                    </button>
                                    <button onClick={() => { setError(''); eliminar(t.id) }}
                                        style={{ background: 'none', border: '1px solid #fecaca', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#dc2626' }}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))}

                {/* Agregar nuevo */}
                <div style={{ padding: '14px 16px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '8px' }}>
                    <input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && agregar()}
                        placeholder="Nuevo tipo de gasto..."
                        style={{ ...inputStyle, padding: '8px 12px', fontSize: '13px' }} />
                    <button onClick={agregar} disabled={guardando}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <Plus size={14} /> Agregar
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#dc2626', marginTop: '12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                    {error}
                </div>
            )}

            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
                Los tipos con gastos asociados no pueden eliminarse — solo renombrarse.
            </p>
        </div>
    )
}
