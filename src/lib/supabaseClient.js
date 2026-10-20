import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fecha y hora UTC del build (vite.config.js). La base la lee del encabezado
// x-app-version y rechaza escrituras de una pestaña con una versión vieja.
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { 'x-app-version': APP_VERSION } },
})
