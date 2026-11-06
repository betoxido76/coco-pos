import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useNavigate } from 'react-router-dom'
import { PantallaAcceso } from '../components/MarcaSoma'

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

    const input = 'w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm text-[#0F1F3D] focus:outline-none focus:ring-2 focus:ring-[#00BFA5] focus:border-transparent'
    const label = 'block text-sm font-semibold text-slate-600 mb-1'

    return (
        <PantallaAcceso titulo="Nueva contraseña" subtitulo="Elige una contraseña segura para tu cuenta">
            {listo ? (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm px-4 py-3 rounded-lg">
                    Contraseña actualizada correctamente. Redirigiendo...
                </div>
            ) : !sesionValida ? (
                <div>
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-6">
                        {error}
                    </div>
                    <button onClick={() => navigate('/login')}
                        className="w-full text-sm text-slate-500 hover:text-[#0F1F3D] py-2">
                        ← Volver al login
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="nueva" className={label}>Nueva contraseña</label>
                        <input id="nueva" type="password" value={password} onChange={e => setPassword(e.target.value)}
                            required minLength={6} className={input} placeholder="Mínimo 6 caracteres" autoFocus autoComplete="new-password" />
                    </div>

                    <div>
                        <label htmlFor="confirmar" className={label}>Confirmar contraseña</label>
                        <input id="confirmar" type="password" value={confirmar} onChange={e => setConfirmar(e.target.value)}
                            required className={input} placeholder="Repite la contraseña" autoComplete="new-password" />
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">
                            {error}
                        </div>
                    )}

                    <button type="submit" disabled={loading}
                        className="w-full bg-[#00BFA5] hover:bg-[#00A892] disabled:opacity-50 text-[#0F1F3D] font-bold py-2.5 rounded-lg text-sm transition-colors">
                        {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
                    </button>
                </form>
            )}
        </PantallaAcceso>
    )
}
