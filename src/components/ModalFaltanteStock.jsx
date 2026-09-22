// Aviso de stock insuficiente antes de facturar.
//
// El sistema no bloquea el despacho: bloquear con un dato de inventario que
// puede estar desviado frenaría salidas de mercancía que existe físicamente.
// En vez de eso avisa, deja decidir a quien opera, y marca el movimiento.
//
// Los movimientos que se registren así quedan sin almacén y con una nota, para
// que el hueco se vea después en la auditoría en lugar de desaparecer.
import { AlertTriangle, X } from 'lucide-react'

const fmtCant = n => Number(n || 0).toLocaleString('es-VE', { maximumFractionDigits: 2 })

export default function ModalFaltanteStock({ faltantes = [], onConfirmar, onCancelar, procesando = false }) {
    if (!faltantes.length) return null

    return (
        <>
            <div onClick={procesando ? undefined : onCancelar}
                style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 60 }} />
            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', backgroundColor: '#fff', borderRadius: '16px', padding: '26px', width: '560px', maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', zIndex: 61, boxShadow: '0 20px 60px rgba(0,0,0,0.22)' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <AlertTriangle size={20} color="#d97706" />
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', margin: 0 }}>
                            Stock insuficiente en el almacén
                        </h3>
                    </div>
                    {!procesando && (
                        <button onClick={onCancelar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>
                            <X size={18} />
                        </button>
                    )}
                </div>

                <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px', lineHeight: 1.5 }}>
                    El sistema no tiene existencias suficientes para {faltantes.length === 1 ? 'este producto' : 'estos productos'}.
                    Si la mercancía sí salió del almacén, continúa: el movimiento queda registrado y marcado para revisión.
                </p>

                <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                                {['Producto', 'Necesita', 'Hay', 'Falta'].map((h, i) => (
                                    <th key={h} style={{ padding: '9px 12px', fontSize: '11px', fontWeight: 600, color: '#6b7280', textAlign: i === 0 ? 'left' : 'right', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {faltantes.map(f => (
                                <tr key={f.item_id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                    <td style={{ padding: '10px 12px', fontSize: '13px', color: '#1f2937' }}>
                                        {f.codigo ? <span style={{ fontFamily: 'monospace', color: '#6b7280', marginRight: '6px' }}>{f.codigo}</span> : null}
                                        {f.nombre}
                                    </td>
                                    <td style={{ padding: '10px 12px', fontSize: '13px', color: '#374151', textAlign: 'right' }}>{fmtCant(f.requerido)}</td>
                                    <td style={{ padding: '10px 12px', fontSize: '13px', color: '#374151', textAlign: 'right' }}>{fmtCant(f.disponible)}</td>
                                    <td style={{ padding: '10px 12px', fontSize: '13px', fontWeight: 700, color: '#dc2626', textAlign: 'right' }}>{fmtCant(f.faltante)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '11px 14px', marginBottom: '18px', fontSize: '12px', color: '#92400e', lineHeight: 1.5 }}>
                    Si el faltante te sorprende, cancela y revisa el inventario del almacén antes de facturar.
                    Continuar deja el stock en negativo, que es justamente la señal de que algo no cuadra.
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onCancelar} disabled={procesando}
                        style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #d1d5db', backgroundColor: '#fff', color: '#374151', fontSize: '14px', fontWeight: 600, cursor: procesando ? 'default' : 'pointer' }}>
                        Cancelar
                    </button>
                    <button onClick={onConfirmar} disabled={procesando}
                        style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', backgroundColor: procesando ? '#d1d5db' : '#d97706', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: procesando ? 'default' : 'pointer' }}>
                        {procesando ? 'Registrando...' : 'Continuar de todos modos'}
                    </button>
                </div>
            </div>
        </>
    )
}
