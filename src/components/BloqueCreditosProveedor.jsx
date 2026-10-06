// Bloque "Notas de crédito disponibles" de las ventanas de pago (recepción y
// gasto). docs/plan-nc-proveedores.md
//
// Aparece solo cuando el proveedor tiene notas de crédito con saldo, igual que
// en la ventana de cobro de CxC: al marcar una se aplica lo máximo que sirve
// aquí (ni más de lo que le queda a la nota ni más de lo que falta por cubrir);
// el monto es editable y el remanente queda vivo para el próximo pago. La
// aplicación la escribe la RPC aplicar_credito_proveedor.
//
// onChange({ total, aplicaciones: [{ id, numero, monto }] })
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { cargarCreditosProveedor } from './NotasCreditoProveedor'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export default function BloqueCreditosProveedor({ proveedorId, saldo, onChange }) {
    const { perfil } = useAuth()
    const [notas, setNotas] = useState([])
    const [aplicadas, setAplicadas] = useState({})   // { id: monto }

    useEffect(() => {
        if (!proveedorId || !perfil?.empresa_id) { setNotas([]); return }
        let cancel = false
        cargarCreditosProveedor(perfil.empresa_id, { proveedorId, soloDisponibles: true })
            .then(n => { if (!cancel) setNotas(n) })
        return () => { cancel = true }
    }, [proveedorId, perfil?.empresa_id])

    function emitir(next) {
        setAplicadas(next)
        const aplicaciones = Object.entries(next).filter(([, m]) => m > 0.001)
            .map(([id, monto]) => ({ id, numero: notas.find(n => n.id === id)?.numero_nd || '', monto: r2(monto) }))
        onChange?.({ total: r2(aplicaciones.reduce((s, a) => s + a.monto, 0)), aplicaciones })
    }

    const otras = (id, mapa = aplicadas) => Object.entries(mapa).filter(([k]) => k !== id).reduce((s, [, m]) => s + Number(m || 0), 0)

    function toggle(nc) {
        const next = { ...aplicadas }
        if (nc.id in next) delete next[nc.id]
        else {
            const monto = Math.min(nc.saldo, Math.max(0, Number(saldo) - otras(nc.id)))
            if (monto <= 0.01) return
            next[nc.id] = r2(monto)
        }
        emitir(next)
    }

    function setMonto(nc, valor) {
        const tope = Math.min(nc.saldo, Math.max(0, Number(saldo) - otras(nc.id)))
        emitir({ ...aplicadas, [nc.id]: r2(Math.max(0, Math.min(Number(valor) || 0, tope))) })
    }

    if (notas.length === 0) return null
    const total = Object.values(aplicadas).reduce((s, m) => s + Number(m || 0), 0)

    return (
        <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Notas de crédito disponibles
            </p>
            {notas.map((nc, i) => {
                const marcada = nc.id in aplicadas
                return (
                    <div key={nc.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: i < notas.length - 1 ? '1px solid #fde68a' : 'none' }}>
                        <input type="checkbox" checked={marcada} onChange={() => toggle(nc)} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', color: '#78350f', fontFamily: 'monospace' }}>
                                {nc.numero_nd}{nc.nro_doc_proveedor ? ` · ${nc.nro_doc_proveedor}` : ''}
                            </div>
                            <div style={{ fontSize: '11px', color: '#a16207' }}>
                                {nc.motivo || (nc.origen === 'devolucion' ? 'Devolución' : 'Nota de crédito')} · disponible {fmt(nc.saldo)}
                            </div>
                        </div>
                        {marcada ? (
                            <input type="number" min="0" step="0.01" value={aplicadas[nc.id]} onChange={e => setMonto(nc, e.target.value)}
                                style={{ width: '90px', padding: '4px 8px', border: '1px solid #fcd34d', borderRadius: '6px', fontSize: '13px', textAlign: 'right' }} />
                        ) : (
                            <span style={{ fontSize: '13px', color: '#a16207' }}>{fmt(nc.saldo)}</span>
                        )}
                    </div>
                )
            })}
            {total > 0.001 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '13px' }}>
                    <span style={{ color: '#92400e' }}>Crédito aplicado</span>
                    <span style={{ fontWeight: 700, color: '#dc2626' }}>-{fmt(total)}</span>
                </div>
            )}
        </div>
    )
}
