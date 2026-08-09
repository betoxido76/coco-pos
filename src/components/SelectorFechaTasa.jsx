// Fecha del movimiento + tasa de cambio de ESA fecha.
//
// Un pago se registra a menudo días después de recibirse. Tomar la tasa vigente
// de hoy distorsiona el equivalente en USD, así que la fecha manda: las tres
// tasas salen del histórico `tasas_cambio` para el día elegido.
//
// Si la fecha no tiene tasas cargadas, el bloque avisa y el formulario que lo
// usa debe bloquear el guardado (`sinTasa`). Cargarlas es responsabilidad de
// Administración → Tasas de Cambio.
//
// Usado por CxC (cobros), CxP (pagos a proveedor), Gastos y Compras.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export const OPCIONES_TASA = [
    { key: 'tasa_bcv', label: 'USD · BCV' },
    { key: 'tasa_euro', label: 'EUR · BCV' },
    { key: 'tasa_binance', label: 'USD · Binance' },
]

export const hoyYMD = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const fmtFechaCorta = (ymd) =>
    new Date(ymd + 'T00:00:00').toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })

// Mediodía: guardar solo 'YYYY-MM-DD' en una columna timestamptz correría la
// fecha un día hacia atrás en husos negativos como el de Venezuela.
export const fechaAtimestamp = (ymd) => `${ymd}T12:00:00`

// Tasas de una fecha concreta. Devuelve null si ese día no tiene tasas cargadas.
export function useTasasFecha(empresaId, fecha) {
    const [tasasFecha, setTasasFecha] = useState(null)
    const [cargando, setCargando] = useState(true)
    useEffect(() => {
        if (!empresaId || !fecha) return
        let cancel = false
        setCargando(true)
        supabase.from('tasas_cambio')
            .select('tasa_bcv, tasa_euro, tasa_binance')
            .eq('empresa_id', empresaId).eq('fecha', fecha).maybeSingle()
            .then(({ data }) => { if (!cancel) { setTasasFecha(data || null); setCargando(false) } })
        return () => { cancel = true }
    }, [empresaId, fecha])
    return { tasasFecha, cargandoTasas: cargando }
}

export default function SelectorFechaTasa({
    fecha, onFecha, tasasFecha, cargandoTasas, tipoTasa, onTipoTasa,
    opciones = OPCIONES_TASA, label = 'Fecha del pago', maxHoy = true,
}) {
    return (
        <>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                <input type="date" value={fecha} max={maxHoy ? hoyYMD() : undefined} onChange={e => onFecha(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '14px', color: '#1f2937', backgroundColor: '#fff', boxSizing: 'border-box' }} />
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#6b7280', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Tasa de cambio del {fmtFechaCorta(fecha)}
                </label>
                {cargandoTasas ? (
                    <div style={{ fontSize: '13px', color: '#9ca3af', padding: '8px 0' }}>Cargando tasas…</div>
                ) : !tasasFecha ? (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#991b1b' }}>
                        ⛔ No hay tasas registradas para esta fecha. Cárgalas en <strong>Administración → Tasas de Cambio</strong> eligiendo ese día, o selecciona otra fecha.
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {opciones.map(op => {
                            const v = Number(tasasFecha[op.key]) || 0
                            const activa = tipoTasa === op.key
                            return (
                                <button key={op.key} onClick={() => v > 0 && onTipoTasa(op.key)} disabled={v <= 0}
                                    style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, border: '1px solid', cursor: v > 0 ? 'pointer' : 'not-allowed', borderColor: activa ? '#16a34a' : '#e5e7eb', backgroundColor: activa ? '#f0fdf4' : '#fff', color: v <= 0 ? '#d1d5db' : activa ? '#16a34a' : '#6b7280' }}>
                                    <div>{op.label}</div>
                                    <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 400 }}>
                                        {v > 0 ? `${v.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.` : 'sin tasa'}
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </>
    )
}
