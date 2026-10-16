// Bloque "Retenciones del cliente" de las ventanas de cobro de CxC
// (docs/plan-retenciones-clientes.md). Espejo de BloqueRetenciones (CxP).
//
// Solo presenta: el cálculo lo hace retencionesPorRegistrar (src/lib/retencionesCliente.js)
// y la cifra oficial la escribe la RPC registrar_retenciones_venta. Cada
// retención se puede desmarcar (p. ej. el comprobante aún no llegó) y
// registrarse después desde la misma ventana.
//
//   lineas:      { iva: { pct, base, monto } | null, islr: … }  (suma de las notas)
//   aplicar:     { iva: bool, islr: bool }
//   registradas: monto ya registrado en la(s) nota(s), solo informativo
const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

export default function BloqueRetencionesCobro({ lineas, aplicar, onAplicar, comprobante, onComprobante, registradas = 0, varias = false }) {
    const tipos = ['iva', 'islr'].filter(t => lineas?.[t])
    if (tipos.length === 0 && !(registradas > 0)) return null
    const monto = tipos.reduce((s, t) => s + (aplicar[t] ? lineas[t].monto : 0), 0)

    return (
        <div style={{ backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Retenciones del cliente (contribuyente especial)
            </div>
            {registradas > 0 && (
                <div style={{ fontSize: '12px', color: '#4338ca', marginBottom: tipos.length ? '8px' : 0 }}>
                    Ya registradas: <strong>{fmt(registradas)}</strong>
                </div>
            )}
            {tipos.map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', cursor: 'pointer', fontSize: '13px', color: '#312e81' }}>
                    <input type="checkbox" checked={!!aplicar[t]} onChange={e => onAplicar({ ...aplicar, [t]: e.target.checked })}
                        style={{ width: '15px', height: '15px', accentColor: '#4338ca', cursor: 'pointer' }} />
                    <span>
                        Retención {t.toUpperCase()} {lineas[t].pct}%
                        <span style={{ color: '#6366f1', fontSize: '12px' }}>
                            {' '}de {fmt(lineas[t].base)} {t === 'iva' ? 'de IVA' : 'de base imponible'}
                        </span>
                    </span>
                    <strong style={{ marginLeft: 'auto', textDecoration: aplicar[t] ? 'none' : 'line-through', color: aplicar[t] ? '#312e81' : '#a5b4fc' }}>
                        −{fmt(lineas[t].monto)}
                    </strong>
                </label>
            ))}
            {tipos.length > 0 && monto > 0 && (
                <div style={{ marginTop: '8px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 500, color: '#4338ca', display: 'block', marginBottom: '4px' }}>
                        N° de comprobante {varias ? '(el mismo para todas las notas)' : ''} — opcional
                    </label>
                    <input value={comprobante} onChange={e => onComprobante(e.target.value)} placeholder="Ej: 20261000012345"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #c7d2fe', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', fontFamily: 'monospace' }} />
                </div>
            )}
            {tipos.some(t => !aplicar[t]) && (
                <div style={{ fontSize: '11px', color: '#6366f1', marginTop: '6px' }}>
                    La retención sin marcar queda por registrar: la nota sigue en CxC hasta que llegue el comprobante.
                </div>
            )}
        </div>
    )
}
