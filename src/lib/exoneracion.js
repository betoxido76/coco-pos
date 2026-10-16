// Clientes exonerados de IVA (docs/plan-exoneracion-iva.md).
//
// Una nota va sin IVA en productos gravados solo si el cliente tiene una
// exoneración vigente A LA FECHA DE LA NOTA. La base lo exige con el trigger
// venta_items_exoneracion: la nota debe llevar exoneracion_id. Aquí se busca
// cuál aplica y se resume su estado para mostrarlo.
import { supabase } from './supabaseClient'

const hoy = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const diasEntre = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)

// Aviso de vencimiento con esta anticipación
export const DIAS_AVISO_VENCIMIENTO = 30

// Estado de una exoneración registrada como 'vigente' en una fecha
export function estadoExoneracion(e, fecha = hoy()) {
    if (!e || e.estado !== 'vigente') return { aplica: false }
    const futura = e.vigente_desde > fecha
    const vencida = !!e.vigente_hasta && e.vigente_hasta < fecha
    const dias = e.vigente_hasta ? diasEntre(fecha, e.vigente_hasta) : null
    return {
        aplica: !futura && !vencida,
        futura, vencida, dias,
        porVencer: !vencida && dias != null && dias <= DIAS_AVISO_VENCIMIENTO,
    }
}

// Exoneración que ampara al cliente en la fecha (null = ninguna: se cobra IVA)
export async function exoneracionVigente(clienteId, fecha = hoy()) {
    if (!clienteId) return null
    const { data } = await supabase.from('exoneraciones_iva')
        .select('id, referencia, vigente_desde, vigente_hasta, estado')
        .eq('cliente_id', clienteId).eq('estado', 'vigente')
        .lte('vigente_desde', fecha)
        .or(`vigente_hasta.is.null,vigente_hasta.gte.${fecha}`)
        .maybeSingle()
    return data || null
}

// { cliente_id: exoneración } de las registradas como vigentes (para badges)
export async function exoneracionesPorCliente(empresaId) {
    const { data } = await supabase.from('exoneraciones_iva')
        .select('id, cliente_id, referencia, vigente_desde, vigente_hasta, estado')
        .eq('empresa_id', empresaId).eq('estado', 'vigente')
    const m = {}
    ;(data || []).forEach(e => { m[e.cliente_id] = e })
    return m
}

// IVA de una línea para un cliente exonerado: el producto gravado va sin IVA
// y queda marcado como exonerado (venta_items.iva_exonerado lo fija la base).
export const aplicaIvaCliente = (aplicaIvaProducto, exonerado) => exonerado ? false : !!aplicaIvaProducto

// Texto corto para avisos: "Cliente exonerado de IVA (Ref. 123)"
export const textoExoneracion = (e) => e ? `Cliente exonerado de IVA (Ref. ${e.referencia})` : ''
