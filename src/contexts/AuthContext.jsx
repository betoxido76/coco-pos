import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({})

const TODOS_LOS_MODULOS = [
    'dashboard', 'inventario', 'ventas', 'pedidos', 'pedidos_campo',
    'compras', 'cxc', 'cxp', 'gastos', 'produccion', 'cambios', 'mermas', 'administracion',
]

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [perfil, setPerfil] = useState(null)
    const [modulosActivos, setModulosActivos] = useState(null) // null = cargando
    const [loading, setLoading] = useState(true)

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

    async function cargarPerfil(userId) {
        const { data } = await supabase
            .from('usuarios')
            .select('*, empresas(nombre, rif, logo_url)')
            .eq('id', userId)
            .single()
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
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error }
    }

    async function logout() {
        await supabase.auth.signOut()
    }

    return (
        <AuthContext.Provider value={{ user, perfil, modulosActivos, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)