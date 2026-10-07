// Aviso de versión nueva de la app (PWA).
//
// La app se instala como PWA y guarda su código en el navegador: una pestaña
// abierta sigue con la versión anterior hasta que se recarga. Así se facturó
// NE-001226 (2026-10-02) con un bug que ya estaba corregido una hora antes.
// Ahora la app revisa cada 15 min (y al volver a la pestaña) si hay versión
// nueva y muestra un aviso para recargar. No recarga sola: podría perderse un
// formulario a medio llenar.
import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

const CADA = 15 * 60 * 1000

export default function AvisoNuevaVersion() {
    const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW({
        onRegisteredSW(_url, registro) {
            if (!registro) return
            const revisar = () => { if (navigator.onLine) registro.update().catch(() => {}) }
            setInterval(revisar, CADA)
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') revisar()
            })
        },
    })

    // Si queda abierto mucho rato sin recargar, que se note
    useEffect(() => {
        if (hayNueva) document.title = '↻ Nueva versión · ' + document.title.replace(/^↻ Nueva versión · /, '')
    }, [hayNueva])

    if (!hayNueva) return null
    return (
        <div style={{
            position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center',
            backgroundColor: '#1f2937', color: '#fff', borderRadius: '12px', padding: '12px 16px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)', maxWidth: 'calc(100vw - 32px)', fontSize: '14px',
        }}>
            <span>Hay una versión nueva de MiPOS. Guarda lo que estés haciendo y recarga para usarla.</span>
            <button onClick={() => updateServiceWorker(true)}
                style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Recargar ahora
            </button>
        </div>
    )
}
