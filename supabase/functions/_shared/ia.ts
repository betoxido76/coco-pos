// Adaptador de IA compartido por las Edge Functions (docs/plan-asistente-ia.md).
// Hoy: OpenRouter (chat completions, formato de herramientas tipo función). Para
// pasar a la API directa de Anthropic se agrega aquí otro proveedor con la misma
// salida; el resto del código no cambia.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const MODELOS: Record<string, { openrouter: string; entrada: number; salida: number; cacheLectura: number }> = {
  // USD por millón de tokens (precio de lista de Anthropic)
  haiku: { openrouter: 'anthropic/claude-haiku-5.5', entrada: 0.10, salida: 0.50, cacheLectura: 0.01 },
  sonnet: { openrouter: 'anthropic/claude-sonnet-5.5', entrada: 2, salida: 10, cacheLectura: 0.20 },
  opus: { openrouter: 'anthropic/claude-opus-5.5', entrada: 4, salida: 20, cacheLectura: 0.20 },
}

export type Herramienta = { nombre: string; descripcion: string; parametros: Record<string, unknown> }
export type LlamadaHerramienta = { id: string; nombre: string; argumentos: string }
export type RespuestaModelo = {
  mensaje: Record<string, unknown>   // mensaje del asistente tal cual, para devolverlo en la vuelta siguiente
  texto: string
  llamadas: LlamadaHerramienta[]
  fin: string
  modelo: string
  uso: { entrada: number; salida: number; cacheLectura: number; costo: number }
}

// mensajes: formato chat completions (system va aparte)
export async function llamarModelo(opc: {
  modelo: string; system: string; mensajes: Record<string, unknown>[]; herramientas: Herramienta[]; maxTokens?: number; titulo?: string
  soloTexto?: boolean   // obliga a responder sin pedir más herramientas
}): Promise<RespuestaModelo> {
  const m = MODELOS[opc.modelo] || MODELOS.sonnet
  const clave = Deno.env.get('OPENROUTER_API_KEY')
  if (!clave) throw new Error('Falta configurar OPENROUTER_API_KEY en los secretos de las funciones')

  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json', 'X-Title': opc.titulo || 'soma ops' },
    body: JSON.stringify({
      model: m.openrouter,
      max_tokens: opc.maxTokens || 2500,
      usage: { include: true },               // devuelve el costo en USD de la llamada
      // Instrucciones + herramientas son fijas: se cachean (se cobran ~10 % al repetirse)
      messages: [{ role: 'system', content: [{ type: 'text', text: opc.system, cache_control: { type: 'ephemeral' } }] }, ...opc.mensajes],
      ...(opc.herramientas.length ? {
        tools: opc.herramientas.map(h => ({ type: 'function', function: { name: h.nombre, description: h.descripcion, parameters: h.parametros } })),
        ...(opc.soloTexto ? { tool_choice: 'none' } : {}),
      } : {}),
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data.error) throw new Error(`OpenRouter: ${data.error?.message || r.status}`)
  const choice = data.choices?.[0]
  const msg = choice?.message || {}
  const u = data.usage || {}
  const entrada = u.prompt_tokens || 0, salida = u.completion_tokens || 0
  const cacheLectura = u.prompt_tokens_details?.cached_tokens || 0
  // Si el proveedor no informa el costo, se estima con el precio de lista
  const costo = typeof u.cost === 'number' ? u.cost
    : ((entrada - cacheLectura) * m.entrada + cacheLectura * m.cacheLectura + salida * m.salida) / 1e6
  return {
    mensaje: { role: 'assistant', content: msg.content ?? '', ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}),
      ...(msg.reasoning_details ? { reasoning_details: msg.reasoning_details } : {}) },
    texto: typeof msg.content === 'string' ? msg.content : '',
    llamadas: (msg.tool_calls || []).map((t: any) => ({ id: t.id, nombre: t.function?.name, argumentos: t.function?.arguments || '{}' })),
    fin: choice?.finish_reason || '',
    modelo: data.model || m.openrouter,
    uso: { entrada, salida, cacheLectura, costo },
  }
}

// Una fila de ia_consumo por llamada al modelo (cliente con service role)
export async function registrarConsumo(admin: SupabaseClient, fila: {
  proveedor?: string; empresa_id: string; usuario_id: string | null; funcion: string; modelo: string;
  uso: { entrada: number; salida: number; cacheLectura: number; costo: number }; conversacion_id?: string | null
}) {
  const { error } = await admin.from('ia_consumo').insert({
    empresa_id: fila.empresa_id, usuario_id: fila.usuario_id, funcion: fila.funcion, proveedor: fila.proveedor || 'openrouter',
    modelo: fila.modelo, tokens_entrada: fila.uso.entrada, tokens_salida: fila.uso.salida,
    tokens_cache_lectura: fila.uso.cacheLectura, costo_usd: fila.uso.costo, conversacion_id: fila.conversacion_id || null,
  })
  if (error) console.error('No se pudo registrar el consumo de IA:', error.message)
}

// ¿La empresa puede usar IA este mes? El superadmin no tiene límite.
export async function verificarCupo(admin: SupabaseClient, empresaId: string, esSuperadmin: boolean) {
  const { data: emp } = await admin.from('empresas').select('nombre, ia_activa, ia_limite_mensual_usd, ia_modelo').eq('id', empresaId).single()
  const { data: gasto } = await admin.rpc('ia_gasto_mes', { p_empresa: empresaId })
  const usado = Number(gasto || 0)
  const limite = emp?.ia_limite_mensual_usd == null ? null : Number(emp.ia_limite_mensual_usd)
  let motivo: string | null = null
  if (!esSuperadmin) {
    if (!emp?.ia_activa) motivo = 'La IA no está activa para esta empresa.'
    else if (limite == null || usado >= limite) motivo = 'Se agotó el cupo de IA de este mes. Pide al administrador que lo amplíe.'
  }
  return { empresa: emp, usado, limite, motivo }
}
