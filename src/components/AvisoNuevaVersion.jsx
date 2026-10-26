// Actualización de la app (PWA).
//
// La app se instala como PWA y guarda su código en el navegador: una pestaña
// abierta sigue con la versión anterior hasta que se recarga. Así se facturó
// NE-001226 (2026-10-02) con un bug ya corregido, y una PC de "Ventas Altagua"
// tomó pedidos 18 días con el código de antes del IVA en base (PED-001426).
//
// La app revisa cada 15 min (y al volver a la pestaña) si hay versión nueva y
// se recarga SOLA cuando no se pierde trabajo: al volver a la pestaña o tras
// unos minutos sin uso, siempre que no se haya escrito nada en la pantalla
// actual. Si hay algo escrito, muestra el aviso y espera.
//
// Segunda capa, en la base: cada llamada lleva x-app-version y un trigger
// rechaza escrituras de versiones anteriores a app_version_minima
// (version_app_minima.sql). Aquí se lee esa mínima para avisar antes de que
// un guardado falle.
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { supabase, APP_VERSION } from '../lib/supabaseClient'

const CADA = 15 * 60 * 1000
const INACTIVA = 3 * 60 * 1000

export default function AvisoNuevaVersion() {
    const registroRef = useRef(null)
    const [minima, setMinima] = useState(null)

    async function revisar() {
        if (!navigator.onLine) return
        registroRef.current?.update().catch(() => {})
        const { data } = await supabase.from('sistema_parametros')
            .select('valor').eq('clave', 'app_version_minima').maybeSingle()
        setMinima(data?.valor || null)
    }

    const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW({
        onRegisteredSW(_url, registro) {
            if (!registro) return
            registroRef.current = registro
            setInterval(revisar, CADA)
        },
    })
    const desactualizada = !!minima && APP_VERSION < minima

    // Algo escrito en la pantalla actual = no recargar sola. Se limpia al
    // cambiar de pantalla.
    const { pathname } = useLocation()
    const escritoRef = useRef(false)
    const actividadRef = useRef(Date.now())
    useEffect(() => { escritoRef.current = false }, [pathname])
    useEffect(() => {
        const alEscribir = () => { escritoRef.current = true; actividadRef.current = Date.now() }
        const alUsar = () => { actividadRef.current = Date.now() }
        document.addEventListener('input', alEscribir, true)
        document.addEventListener('pointerdown', alUsar, true)
        document.addEventListener('keydown', alUsar, true)
        return () => {
            document.removeEventListener('input', alEscribir, true)
            document.removeEventListener('pointerdown', alUsar, true)
            document.removeEventListener('keydown', alUsar, true)
        }
    }, [])

    // Recarga sola: al volver a la pestaña o tras INACTIVA sin uso
    const hayNuevaRef = useRef(false)
    hayNuevaRef.current = hayNueva
    useEffect(() => {
        const intentar = () => {
            if (hayNuevaRef.current && !escritoRef.current) updateServiceWorker(true)
        }
        const alVolver = () => {
            if (document.visibilityState !== 'visible') return
            intentar()
            revisar()
        }
        const reloj = setInterval(() => {
            if (Date.now() - actividadRef.current >= INACTIVA) intentar()
        }, 60 * 1000)
        document.addEventListener('visibilitychange', alVolver)
        revisar()
        return () => { clearInterval(reloj); document.removeEventListener('visibilitychange', alVolver) }
    }, [updateServiceWorker])

    // Recién abierta (la app instalada en el teléfono): la versión nueva aparece
    // en los primeros segundos y no hay cambio de pestaña que dispare la recarga.
    useEffect(() => {
        if (hayNueva && performance.now() < 30 * 1000 && !escritoRef.current) updateServiceWorker(true)
    }, [hayNueva, updateServiceWorker])

    // Si queda abierto mucho rato sin recargar, que se note
    useEffect(() => {
        if (hayNueva || desactualizada) document.title = '↻ Nueva versión · ' + document.title.replace(/^↻ Nueva versión · /, '')
    }, [hayNueva, desactualizada])

    if (!hayNueva && !desactualizada) return null
    const recargar = () => (hayNueva ? updateServiceWorker(true) : window.location.reload())
    return (
        <div style={{
            position: 'fixed', bottom: '16px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center',
            backgroundColor: desactualizada ? '#991b1b' : '#1f2937', color: '#fff', borderRadius: '12px', padding: '12px 16px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)', maxWidth: 'calc(100vw - 32px)', fontSize: '14px',
        }}>
            <span>
                {desactualizada
                    ? 'Esta versión de MiPOS ya no puede guardar cambios. Recarga para seguir trabajando.'
                    : 'Hay una versión nueva de MiPOS. Guarda lo que estés haciendo y recarga para usarla.'}
                <span style={{ display: 'block', fontSize: '11px', opacity: 0.7 }}>Versión {APP_VERSION}</span>
            </span>
            <button onClick={recargar}
                style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Recargar ahora
            </button>
        </div>
    )
}
