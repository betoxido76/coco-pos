import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'

// Aviso resaltado de con qué documento se le entrega al cliente
// (clientes.documento_entrega: 'factura' | 'nota_entrega'; se carga en
// Administración → Clientes). Lo lee del cliente al mostrarse, así sirve igual
// desde Ventas → Ver y Pedidos → Ver. Sin dato no muestra nada. Lleva la clase
// no-print: es una indicación para el personal, no parte del documento impreso.
const TEXTOS = {
    factura: { titulo: 'Este cliente se entrega con FACTURA', color: '#1e40af', bg: '#eff6ff', borde: '#93c5fd' },
    nota_entrega: { titulo: 'Este cliente se entrega con NOTA DE ENTREGA', color: '#854d0e', bg: '#fffbeb', borde: '#fcd34d' },
}

export default function AvisoDocumentoEntrega({ clienteId, style }) {
    const [doc, setDoc] = useState(null)

    useEffect(() => {
        if (!clienteId) { setDoc(null); return }
        let cancel = false
        supabase.from('clientes').select('documento_entrega').eq('id', clienteId).maybeSingle()
            .then(({ data }) => { if (!cancel) setDoc(data?.documento_entrega || null) })
        return () => { cancel = true }
    }, [clienteId])

    const t = TEXTOS[doc]
    if (!t) return null
    return (
        <div className="no-print" style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            backgroundColor: t.bg, border: `2px solid ${t.borde}`, borderRadius: '10px',
            padding: '12px 16px', marginBottom: '16px', color: t.color, ...style,
        }}>
            <FileText size={18} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '14px', fontWeight: 700 }}>{t.titulo}</span>
        </div>
    )
}
