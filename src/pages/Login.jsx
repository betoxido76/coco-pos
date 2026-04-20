import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

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
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
                <div className="text-center mb-8">
                    <div className="text-4xl mb-3">🥥</div>
                    <h1 className="text-xl font-semibold text-gray-800">Recuperar contraseña</h1>
                    <p className="text-sm text-gray-500 mt-1">Te enviaremos un link para restablecer tu contraseña</p>
                </div>

                {enviado ? (
                    <div>
                        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg text-center mb-6">
                            ✅ Correo enviado. Revisa tu bandeja de entrada y sigue el link para crear una nueva contraseña.
                        </div>
                        <button onClick={() => { setModoRecuperar(false); setEnviado(false); setEmailRecuperar('') }}
                            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2">
                            ← Volver al login
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleRecuperar} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Correo electrónico
                            </label>
                            <input
                                type="email"
                                value={emailRecuperar}
                                onChange={e => setEmailRecuperar(e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                placeholder="usuario@empresa.com"
                                autoFocus
                            />
                        </div>

                        {errorRecuperar && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                                {errorRecuperar}
                            </div>
                        )}

                        <button type="submit" disabled={loadingRecuperar}
                            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                            {loadingRecuperar ? 'Enviando...' : 'Enviar correo de recuperación'}
                        </button>

                        <button type="button" onClick={() => { setModoRecuperar(false); setErrorRecuperar('') }}
                            className="w-full text-sm text-gray-500 hover:text-gray-700 py-1">
                            ← Volver al login
                        </button>
                    </form>
                )}
            </div>
        </div>
    )

    // ── Vista de login normal ──
    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8">

                <div className="text-center mb-8">
                    <div className="text-4xl mb-3"></div>
                    <h1 className="text-xl font-semibold text-gray-800">MiPOS</h1>
                    <p className="text-sm text-gray-500 mt-1">Sistema de gestión</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Correo electrónico
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder="usuario@empresa.com"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Contraseña
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
                    >
                        {loading ? 'Ingresando...' : 'Ingresar'}
                    </button>

                    <button type="button" onClick={() => { setModoRecuperar(true); setEmailRecuperar(email); setErrorRecuperar('') }}
                        className="w-full text-sm text-gray-500 hover:text-gray-700 py-1 text-center">
                        ¿Olvidaste tu contraseña?
                    </button>
                </form>
            </div>
        </div>
    )
}