import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'

export default function ResetPassword() {
    const navigate = useNavigate()
    const [password, setPassword] = useState('')
    const [confirmar, setConfirmar] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [listo, setListo] = useState(false)
    const [sesionValida, setSesionValida] = useState(false)

    useEffect(() => {
        // Supabase maneja el token del link automáticamente
        // Solo verificamos que haya una sesión activa
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setSesionValida(true)
            else setError('El link de recuperación es inválido o ha expirado. Solicita uno nuevo.')
        })
    }, [])

    async function handleSubmit(e) {
        e.preventDefault()
        if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
        if (password !== confirmar) { setError('Las contraseñas no coinciden'); return }
        setLoading(true); setError('')

        const { error: err } = await supabase.auth.updateUser({ password })
        if (err) {
            setError('Error al actualizar la contraseña: ' + err.message)
            setLoading(false)
        } else {
            setListo(true)
            setTimeout(() => navigate('/'), 3000)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8">

                <div className="text-center mb-8">
                    <div className="text-4xl mb-3">🥥</div>
                    <h1 className="text-xl font-semibold text-gray-800">Nueva contraseña</h1>
                    <p className="text-sm text-gray-500 mt-1">Elige una contraseña segura para tu cuenta</p>
                </div>

                {listo ? (
                    <div className="text-center">
                        <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">
                            ✅ Contraseña actualizada correctamente. Redirigiendo...
                        </div>
                    </div>
                ) : !sesionValida ? (
                    <div>
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">
                            {error}
                        </div>
                        <button onClick={() => navigate('/login')}
                            className="w-full text-sm text-gray-500 hover:text-gray-700 py-2">
                            ← Volver al login
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Nueva contraseña
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                minLength={6}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                placeholder="Mínimo 6 caracteres"
                                autoFocus
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Confirmar contraseña
                            </label>
                            <input
                                type="password"
                                value={confirmar}
                                onChange={e => setConfirmar(e.target.value)}
                                required
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                placeholder="Repite la contraseña"
                            />
                        </div>

                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                                {error}
                            </div>
                        )}

                        <button type="submit" disabled={loading}
                            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                            {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    )
}
