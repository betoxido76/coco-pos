import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { PantallaAcceso } from '../components/MarcaSoma'

// Estilos de marca soma ops (src/components/MarcaSoma.jsx)
const INPUT = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-[#0F1F3D] focus:outline-none focus:ring-2 focus:ring-[#00BFA5] focus:border-transparent'
const LABEL = 'block text-sm font-semibold text-slate-600 mb-1'
const BOTON = 'w-full bg-[#00BFA5] hover:bg-[#00A892] disabled:opacity-50 text-[#0F1F3D] font-bold py-2.5 rounded-lg text-sm transition-colors'
const LINK = 'w-full text-sm text-slate-500 hover:text-[#0F1F3D] py-1 text-center'

export default function Login() {
    const { login } = useAuth()
    const navigate = useNavigate()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    // Recuperación de contraseña
    const [modoRecuperar, setModoRecuperar] = useState(false)
    const [emailRecuperar, setEmailRecuperar] = useState('')
    const [enviado, setEnviado] = useState(false)
    const [loadingRecuperar, setLoadingRecuperar] = useState(false)
    const [errorRecuperar, setErrorRecuperar] = useState('')

    async function handleSubmit(e) {
        e.preventDefault()
        setLoading(true)
        setError('')
        const { error } = await login(email, password)
        if (error) {
            setError('Email o contraseña incorrectos')
            setLoading(false)
        } else {
            navigate('/')
        }
    }

    async function handleRecuperar(e) {
        e.preventDefault()
        if (!emailRecuperar.trim()) { setErrorRecuperar('Ingresa tu correo'); return }
        setLoadingRecuperar(true); setErrorRecuperar('')
        const { error } = await supabase.auth.resetPasswordForEmail(emailRecuperar.trim(), {
            redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) {
            setErrorRecuperar('Error al enviar el correo. Verifica el email e intenta de nuevo.')
        } else {
            setEnviado(true)
        }
        setLoadingRecuperar(false)
    }

    // ── Vista de recuperación ──
    if (modoRecuperar) return (
        <PantallaAcceso titulo="Recuperar contraseña" subtitulo="Te enviaremos un link para restablecer tu contraseña">
            {enviado ? (
                <div>
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg mb-6">
                        Correo enviado. Revisa tu bandeja de entrada y sigue el link para crear una nueva contraseña.
                    </div>
                    <button onClick={() => { setModoRecuperar(false); setEnviado(false); setEmailRecuperar('') }} className={LINK}>
                        ← Volver al login
                    </button>
                </div>
            ) : (
                <form onSubmit={handleRecuperar} className="space-y-4">
                    <div>
                        <label htmlFor="email-recuperar" className={LABEL}>Correo electrónico</label>
                        <input id="email-recuperar" type="email" value={emailRecuperar}
                            onChange={e => setEmailRecuperar(e.target.value)} required
                            className={INPUT} placeholder="usuario@empresa.com" autoFocus />
                    </div>

                    {errorRecuperar && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                            {errorRecuperar}
                        </div>
                    )}

                    <button type="submit" disabled={loadingRecuperar} className={BOTON}>
                        {loadingRecuperar ? 'Enviando...' : 'Enviar correo de recuperación'}
                    </button>

                    <button type="button" onClick={() => { setModoRecuperar(false); setErrorRecuperar('') }} className={LINK}>
                        ← Volver al login
                    </button>
                </form>
            )}
        </PantallaAcceso>
    )

    // ── Vista de login normal ──
    return (
        <PantallaAcceso titulo="Iniciar sesión" subtitulo="Ingresa con el correo de tu empresa">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="email" className={LABEL}>Correo electrónico</label>
                    <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                        className={INPUT} placeholder="usuario@empresa.com" autoComplete="username" />
                </div>

                <div>
                    <label htmlFor="password" className={LABEL}>Contraseña</label>
                    <input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required
                        className={INPUT} placeholder="••••••••" autoComplete="current-password" />
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                        {error}
                    </div>
                )}

                <button type="submit" disabled={loading} className={BOTON}>
                    {loading ? 'Ingresando...' : 'Ingresar'}
                </button>

                <button type="button" onClick={() => { setModoRecuperar(true); setEmailRecuperar(email); setErrorRecuperar('') }} className={LINK}>
                    ¿Olvidaste tu contraseña?
                </button>
            </form>
        </PantallaAcceso>
    )
}
