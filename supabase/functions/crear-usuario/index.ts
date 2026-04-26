import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── 1. Verificar que el caller es superadmin usando su JWT ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'No authorization header' }, 401)
    }

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Token inválido' }, 401)
    }

    const { data: perfil } = await supabaseUser
      .from('usuarios')
      .select('rol')
      .eq('id', user.id)
      .single()

    if (perfil?.rol !== 'superadmin') {
      return json({ error: 'Acceso denegado' }, 403)
    }

    // ── 2. Leer payload ──
    const { nombre, email, password, rol, empresa_id } = await req.json()
    if (!nombre || !email || !password || !rol || !empresa_id) {
      return json({ error: 'Faltan campos requeridos' }, 400)
    }

    // ── 3. Cliente admin con service_role para operaciones privilegiadas ──
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Crear usuario en Supabase Auth
    const { data: authData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createError) {
      return json({ error: createError.message }, 400)
    }

    const newUserId = authData.user.id

    // Insertar en tabla usuarios
    const { error: insertError } = await supabaseAdmin.from('usuarios').insert({
      id: newUserId,
      nombre,
      email,
      rol,
      empresa_id,
      activo: true,
    })

    if (insertError) {
      // Rollback: eliminar de Auth si falla el insert
      await supabaseAdmin.auth.admin.deleteUser(newUserId)
      return json({ error: insertError.message }, 500)
    }

    // Asignar todos los módulos que tiene contratados la empresa
    const { data: modEmpresa } = await supabaseAdmin
      .from('empresa_modulos')
      .select('modulo_id')
      .eq('empresa_id', empresa_id)
      .eq('activo', true)

    if (modEmpresa && modEmpresa.length > 0) {
      await supabaseAdmin.from('usuario_modulos').insert(
        modEmpresa.map(m => ({
          usuario_id: newUserId,
          empresa_id,
          modulo_id: m.modulo_id,
          activo: true,
        }))
      )
    }

    return json({ success: true, user_id: newUserId }, 200)

  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
