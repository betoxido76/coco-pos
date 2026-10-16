// Aviso de cliente exonerado de IVA al tomar un pedido o facturar
// (docs/plan-exoneracion-iva.md). Solo presenta: la exoneración la busca el
// llamador con exoneracionVigente() de src/lib/exoneracion.js.
import { estadoExoneracion } from '../lib/exoneracion'

export default function AvisoExoneracion({ exoneracion, facturando = false, style }) {
    if (!exoneracion) return null
    const est = estadoExoneracion(exoneracion)
    return (
        <div style={{ backgroundColor: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', color: '#312e81', marginBottom: '16px', ...style }}>
            <strong>Cliente exonerado de IVA</strong> · Ref. <span style={{ fontFamily: 'monospace' }}>{exoneracion.referencia}</span>
            {exoneracion.vigente_hasta && <> · vigente hasta {exoneracion.vigente_hasta.split('-').reverse().join('/')}</>}
            <div style={{ fontSize: '12px', color: '#4338ca', marginTop: '2px' }}>
                {facturando ? 'La nota sale sin IVA en todos los productos.' : 'El pedido se calcula sin IVA.'}
                {est.porVencer && <span style={{ color: '#d97706', fontWeight: 600 }}> La exoneración vence en {est.dias} días.</span>}
            </div>
        </div>
    )
}
