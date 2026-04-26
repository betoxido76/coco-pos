import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({})

const SESSION_KEY = 'mipos_session_token'

const TODOS_LOS_MODULOS = [
    'dashboard', 'inventario', 'ventas', 'pedidos', 'pedidos_campo',
    'compras', 'cxc', 'cxp', 'gastos', 'produccion', 'cambios', 'mermas', 'administracion',
    'cotizador', 'finanzas',
]

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [perfil, setPerfil] = useState(null)
    const [modulosActivos, setModulosActivos] = useState(null) // null = cargando
    const [loading, setLoading] = useState(true)

    // Suscripción a cambios de auth
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null)
            if (session?.user) cargarPerfil(session.user.id)
            else setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (_event, session) => {
                setUser(session?.user ?? null)
                if (session?.user) cargarPerfil(session.user.id)
                else { setPerfil(null); setModulosActivos(null); setLoading(false) }
            }
        )
        return () => subscription.unsubscribe()
    }, [])

    // Verificación periódica de sesión única (cada 5 min + al recuperar foco)
    useEffect(() => {
        if (!user || loading) return

        const userId = user.id
        const check = () => verificarSesion(userId)

        // Verificar inmediatamente al cargar (session restore tras refresh)
        // verificarSesion retorna early si no hay token local → sin riesgo en login fresco
        check()

        const interval = setInterval(check, 5 * 60 * 1000)
        const onVisible = () => { if (document.visibilityState === 'visible') check() }
        document.addEventListener('visibilitychange', onVisible)

        return () => {
            clearInterval(interval)
            document.removeEventListener('visibilitychange', onVisible)
        }
    }, [user, loading])

    async function verificarSesion(userId) {
        const localToken = localStorage.getItem(SESSION_KEY)
        if (!localToken) return // login reciente aún no tiene token, o ya hizo logout

        const { data } = await supabase
            .from('usuarios')
            .select('session_token')
            .eq('id', userId)
            .single()

        // Solo expulsar si la BD tiene un token distinto (no si es null — columna nueva sin valor)
        if (data?.session_token && data.session_token !== localToken) {
            await logout()
        }
    }

    async function cargarPerfil(userId) {
        const { data } = await supabase
            .from('usuarios')
            .select('*, empresas(nombre, rif, logo_url, activo, perfil_negocio)')
            .eq('id', userId)
            .single()

        // Empresa desactivada → bloquear acceso inmediatamente
        if (data && data.rol !== 'superadmin' && data.empresas?.activo === false) {
            await logout()
            return
        }

        setPerfil(data)

        if (data?.rol === 'superadmin') {
            setModulosActivos(TODOS_LOS_MODULOS)
        } else if (data) {
            const { data: mods } = await supabase
                .from('usuario_modulos')
                .select('modulo_id')
                .eq('usuario_id', userId)
                .eq('empresa_id', data.empresa_id)
                .eq('activo', true)
            setModulosActivos(mods ? mods.map(m => m.modulo_id) : [])
        } else {
            setModulosActivos([])
        }

        setLoading(false)
    }

    async function login(email, password) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) return { error }

        // Generar token de sesión único — invalida cualquier sesión anterior
        const token = crypto.randomUUID()
        await supabase.from('usuarios').update({ session_token: token }).eq('id', data.user.id)
        localStorage.setItem(SESSION_KEY, token)

        return { error: null }
    }

    async function logout() {
        localStorage.removeItem(SESSION_KEY)
        await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider value={{ user, perfil, modulosActivos, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)