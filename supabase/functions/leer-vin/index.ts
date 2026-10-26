// Laboratorio VIN (solo superadmin): lee el serial de carrocería de una foto con
// Claude (visión) y lo decodifica con NHTSA vPIC. Body:
//   { imagen: <base64 JPEG/PNG sin prefijo>, media_type?: 'image/jpeg' }  → lee + decodifica
//   { vin: '...' }                                                       → solo decodifica
// Secreto requerido: ANTHROPIC_API_KEY (Supabase → Edge Functions → Secrets).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.137.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version',
}

const MODELO = 'claude-opus-5-5'
const MAX_BASE64 = 6_500_000 // ~4,8 MB de imagen; la API acepta hasta 5 MB

const INSTRUCCIONES = `Eres un lector de seriales de vehículos. En la imagen debe haber un VIN (serial de carrocería, 17 caracteres) en una placa del parabrisas, una etiqueta de la puerta, el chasis, o un documento como el carnet de circulación o un título.

Reglas:
- Transcribe exactamente el VIN que ves. Nunca inventes ni completes caracteres que no se leen.
- Un VIN no usa las letras I, O ni Q. Si un carácter parece una de ellas, casi siempre es 1 o 0; anótalo en caracteres_dudosos.
- Si en la imagen hay otros números (serial de motor, placa, fechas), ignóralos: solo el VIN.
- Si no hay un VIN legible, encontrado = false y vin = "".
- caracteres_dudosos: posiciones (1-17) y alternativas posibles, p. ej. "8: B u 8". Vacío si todo es claro.
- notas: una frase corta en español sobre la lectura (reflejo, ángulo, recortado...).`

const ESQUEMA = {
  type: 'object',
  properties: {
    encontrado: { type: 'boolean' },
    vin: { type: 'string' },
    ubicacion: { type: 'string', enum: ['parabrisas', 'puerta', 'chasis_motor', 'documento', 'otro', 'desconocido'] },
    legibilidad: { type: 'string', enum: ['alta', 'media', 'baja'] },
    caracteres_dudosos: { type: 'string' },
    notas: { type: 'string' },
  },
  required: ['encontrado', 'vin', 'ubicacion', 'legibilidad', 'caracteres_dudosos', 'notas'],
  additionalProperties: false,
}

// ── Validación (misma lógica que src/lib/vin.js) ──
const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const PESOS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

function normalizarVin(v: string) {
  return (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function validarVin(v: string) {
  const vin = normalizarVin(v)
  const valido = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin)
  if (!valido) return { vin, valido, digito_ok: null }
  // El dígito verificador solo es obligatorio en vehículos de mercado norteamericano (WMI 1-5)
  if (!/^[1-5]/.test(vin)) return { vin, valido, digito_ok: null }
  const suma = [...vin].reduce((s, c, i) => s + (/\d/.test(c) ? Number(c) : TRANSLIT[c]) * PESOS[i], 0)
  const resto = suma % 11
  return { vin, valido, digito_ok: (resto === 10 ? 'X' : String(resto)) === vin[8] }
}

async function decodificar(vin: string) {
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`,
      { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return { error: `vPIC respondió ${r.status}` }
    const x = (await r.json())?.Results?.[0] || {}
    return {
      marca: x.Make || null,
      modelo: x.Model || null,
      anio: x.ModelYear || null,
      version: x.Trim || null,
      carroceria: x.BodyClass || null,
      tipo: x.VehicleType || null,
      motor_cilindros: x.EngineCylinders || null,
      motor_litros: x.DisplacementL || null,
      combustible: x.FuelTypePrimary || null,
      fabricante: x.Manufacturer || null,
      pais_planta: x.PlantCountry || null,
      aviso: x.ErrorCode && x.ErrorCode !== '0' ? x.ErrorText : null,
    }
  } catch (e) {
    return { error: `No se pudo decodificar: ${(e as Error).message}` }
  }
}

async function leerImagen(imagen: string, mediaType: string) {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })
  // Fallback del servidor ante un rechazo por clasificador (beta). Para fotos de
  // seriales es muy improbable, pero evita que la prueba falle sin explicación.
  const resp: any = await client.beta.messages.create({
    model: MODELO,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ESQUEMA } },
    system: INSTRUCCIONES,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imagen } },
        { type: 'text', text: 'Lee el VIN de esta imagen.' },
      ],
    }],
  } as any)

  if (resp.stop_reason === 'refusal') {
    throw new Error('La IA no procesó la imagen (rechazo). Prueba con otra foto.')
  }
  const texto = resp.content?.find((b: any) => b.type === 'text')?.text
  if (!texto) throw new Error(`Respuesta vacía de la IA (stop_reason: ${resp.stop_reason})`)
  return {
    lectura: JSON.parse(texto),
    modelo: resp.model,
    tokens: { entrada: resp.usage?.input_tokens, salida: resp.usage?.output_tokens },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // ── 1. Solo superadmin ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'No authorization header' }, 401)

    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) return json({ error: 'Token inválido' }, 401)

    const { data: perfil } = await supabaseUser.from('usuarios').select('rol').eq('id', user.id).single()
    if (perfil?.rol !== 'superadmin') return json({ error: 'Acceso denegado' }, 403)

    // ── 2. Leer y/o decodificar ──
    const body = await req.json()

    if (body.vin) {
      const v = validarVin(body.vin)
      return json({ ...v, decodificado: v.valido ? await decodificar(v.vin) : null }, 200)
    }

    const imagen: string = body.imagen
    const mediaType: string = body.media_type || 'image/jpeg'
    if (!imagen) return json({ error: 'Falta la imagen' }, 400)
    if (imagen.length > MAX_BASE64) return json({ error: 'La imagen es demasiado grande' }, 400)
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) {
      return json({ error: 'Formato de imagen no soportado' }, 400)
    }
    if (!Deno.env.get('ANTHROPIC_API_KEY')) {
      return json({ error: 'Falta configurar ANTHROPIC_API_KEY en los secretos de la función' }, 500)
    }

    const t0 = Date.now()
    const { lectura, modelo, tokens } = await leerImagen(imagen, mediaType)
    const v = validarVin(lectura.vin)
    return json({
      ...v,
      vin_leido: lectura.vin,
      lectura,
      decodificado: v.valido ? await decodificar(v.vin) : null,
      modelo, tokens, ms: Date.now() - t0,
    }, 200)
  } catch (err) {
    const e = err as any
    const msg = e?.status ? `IA respondió ${e.status}: ${e.message}` : e.message
    return json({ error: msg }, 500)
  }
})

function json(body: object, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
