import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [perfil, setPerfil] = useState(null)
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
                else { setPerfil(null); setLoading(false) }
            }
        )
        return () => subscription.unsubscribe()
    }, [])

    async function cargarPerfil(userId) {
        const { data } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', userId)
            .single()
        setPerfil(data)
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
        <AuthContext.Provider value={{ user, perfil, loading, login, logout }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext)