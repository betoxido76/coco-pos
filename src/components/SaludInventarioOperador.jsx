// Salud del inventario de TODAS las empresas — panel del operador.
//
// La misma vista que ve cada cliente en Inventario → Salud, pero cruzada. Sirve
// para enterarse de que el inventario de un cliente se está rompiendo antes de
// que llame, que es como apareció el caso de Grupo Meraki.
//
// Lee v_inventario_descuadre, que respeta RLS: un superadmin ve todas las
// empresas porque las tablas de fondo tienen política is_superadmin().
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { ShieldCheck, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'

const TIPO_LABEL = {
    producto_terminado: 'Prod. terminado', materia_prima: 'Materia prima',
    material_empaque: 'Mat. empaque', consumible: 'Consumible',
}
const fmt = n => Number(n || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })

export default function SaludInventarioOperador() {
    const [filas, setFilas] = useState([])
    const [empresas, setEmpresas] = useState({})
    const [loading, setLoading] = useState(true)
    const [abierto, setAbierto] = useState(false)

    useEffect(() => {
        let cancel = false
        Promise.all([
            supabase.from('v_inventario_descuadre')
                .select('empresa_id, tipo_item, codigo, nombre, stock_catalogo, stock_almacenes, diferencia'),
            supabase.from('empresas').select('id, nombre'),
        ]).then(([{ data: d }, { data: emp }]) => {
            if (cancel) return
            const mapa = {}
            ;(emp || []).forEach(e => { mapa[e.id] = e.nombre })
            setEmpresas(mapa)
            setFilas(d || [])
            setLoading(false)
        })
        return () => { cancel = true }
    }, [])

    if (loading) return null

    // Agrupar por empresa
    const porEmpresa = {}
    for (const f of filas) {
        const k = f.empresa_id
        if (!porEmpresa[k]) porEmpresa[k] = { items: 0, deMas: 0, deMenos: 0, tipos: {} }
        const g = porEmpresa[k]
        g.items++
        if (f.diferencia > 0) g.deMas += Number(f.diferencia)
        else g.deMenos += Number(f.diferencia)
        g.tipos[f.tipo_item] = (g.tipos[f.tipo_item] || 0) + 1
    }
    const lista = Object.entries(porEmpresa)
        .map(([id, g]) => ({ id, nombre: empresas[id] || '(empresa desconocida)', ...g }))
        .sort((a, b) => (Math.abs(b.deMas) + Math.abs(b.deMenos)) - (Math.abs(a.deMas) + Math.abs(a.deMenos)))

    const sano = lista.length === 0

    return (
        <div style={{ backgroundColor: '#fff', borderRadius: '12px', border: `1px solid ${sano ? '#bbf7d0' : '#fde68a'}`, marginBottom: '20px', overflow: 'hidden' }}>
            <div onClick={() => setAbierto(a => !a)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', cursor: sano ? 'default' : 'pointer', backgroundColor: sano ? '#f0fdf4' : '#fffbeb' }}>
                {sano ? <ShieldCheck size={18} color="#16a34a" /> : <AlertTriangle size={18} color="#d97706" />}
                <div style={{ flex: 1 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: sano ? '#166534' : '#92400e', margin: 0 }}>
                        {sano
                            ? 'El inventario cuadra en todas las empresas'
                            : `${lista.length} ${lista.length === 1 ? 'empresa tiene' : 'empresas tienen'} el inventario descuadrado`}
                    </p>
                    <p style={{ fontSize: '12px', color: sano ? '#15803d' : '#a16207', margin: '2px 0 0' }}>
                        {sano
                            ? 'Para cada ítem, el catálogo coincide con la suma de los almacenes.'
                            : `${filas.length} ítems en total. El catálogo y los almacenes dicen cosas distintas.`}
                    </p>
                </div>
                {!sano && (abierto ? <ChevronDown size={16} color="#92400e" /> : <ChevronRight size={16} color="#92400e" />)}
            </div>

            {!sano && abierto && (
                <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '1px solid #fde68a' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                            {['Empresa', 'Ítems', 'Detalle', 'De más', 'De menos'].map((h, i) => (
                                <th key={h} style={{ padding: '9px 16px', fontSize: '11px', fontWeight: 600, color: '#6b7280', textAlign: i > 2 ? 'right' : 'left', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {lista.map(e => (
                            <tr key={e.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 500, color: '#1f2937' }}>{e.nombre}</td>
                                <td style={{ padding: '10px 16px', fontSize: '13px', color: '#374151' }}>{e.items}</td>
                                <td style={{ padding: '10px 16px', fontSize: '12px', color: '#6b7280' }}>
                                    {Object.entries(e.tipos).map(([t, n]) => `${TIPO_LABEL[t] || t}: ${n}`).join(' · ')}
                                </td>
                                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: e.deMas > 0 ? '#d97706' : '#d1d5db', textAlign: 'right' }}>
                                    {e.deMas > 0 ? '+' + fmt(e.deMas) : '—'}
                                </td>
                                <td style={{ padding: '10px 16px', fontSize: '13px', fontWeight: 600, color: e.deMenos < 0 ? '#dc2626' : '#d1d5db', textAlign: 'right' }}>
                                    {e.deMenos < 0 ? fmt(e.deMenos) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    )
}
