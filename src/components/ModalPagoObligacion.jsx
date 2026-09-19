// Ventana única de registro de pago para cualquier obligación por pagar.
//
// Antes cada módulo tenía su propia ventana: CxP (recepciones), CxP (gastos) y
// Gastos mostraban tres diseños distintos para lo mismo — pagar algo que se
// debe — y la gente se confundía. Este componente es la ventana de CxP
// (recepciones), que era la más completa, convertida en pieza compartida.
//
// El componente maneja TODO el formulario (fecha + tasa de esa fecha, montos
// USD/Bs, métodos, cuenta bancaria, nota, validaciones) y delega en el llamador
// únicamente la escritura en base de datos, vía `onConfirmar`.
//
// El llamador aporta:
//   - el resumen de la obligación (total, abonado, saldo)
//   - `saldoEfectivo`: cuánto queda por pagar EN DINERO tras descuentos y
//     créditos (NDs). Es el tope del abono y el valor que prellena Monto USD.
//   - `extras`: bloques propios del dominio (descuento por pronto pago, notas
//     de débito) que se dibujan entre el resumen y el formulario.
//   - `proveedorId` (opcional): habilita el botón "Cuentas del proveedor", una
//     consulta de solo lectura de `cuentas_proveedor` para saber a dónde pagar.
//     No se guarda a qué cuenta se pagó.
//
// Usado por: CxP → ModalPago (recepciones) y ModalPagoGasto (gastos, también
// montado desde el módulo Gastos).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import SelectorFechaTasa, { useTasasFecha, hoyYMD, fmtFechaCorta } from './SelectorFechaTasa'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

// Vocabulario único de métodos de pago para todas las cuentas por pagar.
export const METODOS_USD = [
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'zelle', label: 'Zelle' },
    { value: 'cheque', label: 'Cheque' },
]

export const METODOS_BS = [
    { value: '', label: '— ninguno —' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'pago_movil', label: 'Pago móvil' },
]

// Etiqueta legible de un método guardado ('pago_movil' → 'Pago móvil').
// Los registros viejos ya traen texto legible: se devuelven tal cual.
export const labelMetodo = (v) =>
    [...METODOS_USD, ...METODOS_BS].find(m => m.value === v)?.label || v || null

const inputS = {
    width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
    borderRadius: '8px', fontSize: '13px', color: '#374151', boxSizing: 'border-box',
}
const selectS = { ...inputS, backgroundColor: '#fff' }
const labelS = { fontSize: '12px', fontWeight: 500, color: '#374151', display: 'block', marginBottom: '5px' }

const TIPOS_CUENTA = { corriente: 'Corriente', ahorro: 'Ahorro', pago_movil: 'Pago Móvil' }

// Consulta de las cuentas bancarias registradas del proveedor (Administración →
// Proveedores). Se carga al abrirla por primera vez.
function CuentasProveedor({ proveedorId }) {
    const { perfil } = useAuth()
    const [cuentas, setCuentas] = useState(null)
    const [copiada, setCopiada] = useState(null)

    useEffect(() => {
        supabase.from('cuentas_proveedor')
            .select('id, banco, tipo_cuenta, numero_cuenta, titular, rif_titular, es_predeterminada')
            .eq('empresa_id', perfil.empresa_id).eq('proveedor_id', proveedorId)
            .order('es_predeterminada', { ascending: false }).order('created_at')
            .then(({ data }) => setCuentas(data || []))
    }, [proveedorId, perfil.empresa_id])

    function copiar(c) {
        navigator.clipboard?.writeText(c.numero_cuenta).then(() => {
            setCopiada(c.id)
            setTimeout(() => setCopiada(id => (id === c.id ? null : id)), 1500)
        })
    }

    return (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {cuentas === null ? <span style={{ fontSize: '12px', color: '#9ca3af' }}>Cargando cuentas…</span>
                : cuentas.length === 0 ? <span style={{ fontSize: '12px', color: '#9ca3af' }}>Este proveedor no tiene cuentas registradas. Se cargan en Administración → Proveedores.</span>
                : cuentas.map(c => (
                    <div key={c.id} style={{ backgroundColor: c.es_predeterminada ? '#f0fdf4' : '#f9fafb', borderRadius: '6px', padding: '8px 10px', fontSize: '12px', color: '#374151' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                            <strong style={{ fontSize: '13px', color: '#1f2937' }}>{c.banco}</strong>
                            <span style={{ color: '#6b7280' }}>· {TIPOS_CUENTA[c.tipo_cuenta] || c.tipo_cuenta}</span>
                            {c.es_predeterminada && <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: '#166534' }}>Predeterminada</span>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '13px', color: '#1f2937' }}>{c.numero_cuenta}</span>
                            <button type="button" onClick={() => copiar(c)}
                                style={{ fontSize: '11px', color: copiada === c.id ? '#16a34a' : '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                {copiada === c.id ? '✓ Copiado' : 'Copiar'}
                            </button>
                        </div>
                        {(c.titular || c.rif_titular) && (
                            <div style={{ color: '#6b7280' }}>{[c.titular, c.rif_titular].filter(Boolean).join(' · ')}</div>
                        )}
                    </div>
                ))}
        </div>
    )
}

export default function ModalPagoObligacion({
    titulo = 'Registrar pago',
    subtitulo,
    total,                       // total de la obligación (opcional)
    abonado = 0,                 // ya pagado antes de esta ventana
    saldo = 0,                   // saldo pendiente de la obligación
    saldoEfectivo = null,        // tope a pagar tras descuentos/créditos (default: saldo)
    cargandoSaldo = false,
    extras = null,               // bloques del dominio (descuento, NDs)
    proveedorId = null,          // habilita la consulta de cuentas del proveedor
    metodosUsd = METODOS_USD,
    metodosBs = METODOS_BS,
    textoConfirmar = 'Confirmar pago',
    onConfirmar,                 // async (datos) => string | void   (string = mensaje de error)
    onCerrar,
}) {
    const { perfil } = useAuth()
    const tope = saldoEfectivo === null ? saldo : saldoEfectivo

    const [fecha, setFecha] = useState(hoyYMD())
    const [tipoTasa, setTipoTasa] = useState('tasa_bcv')
    const [montoUsd, setMontoUsd] = useState('')
    const [montoBs, setMontoBs] = useState('')
    const [metodoUsd, setMetodoUsd] = useState(metodosUsd[0]?.value ?? '')
    const [metodoBs, setMetodoBs] = useState(metodosBs[0]?.value ?? '')
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')
    const [nota, setNota] = useState('')
    const [cuentasBancarias, setCuentasBancarias] = useState([])
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [verCuentasProv, setVerCuentasProv] = useState(false)

    useEffect(() => {
        if (!perfil?.empresa_id) return
        supabase.from('cuentas_bancarias').select('id, nombre, banco, moneda')
            .eq('empresa_id', perfil.empresa_id).eq('activa', true)
            .then(({ data }) => setCuentasBancarias(data || []))
    }, [perfil?.empresa_id])

    // El monto propuesto es siempre el saldo efectivo: cambia al cargar los
    // abonos previos, al aplicar un descuento o al marcar una nota de débito.
    // Se compara redondeado para no reescribir el input por ruido de coma flotante.
    const topeKey = tope.toFixed(2)
    useEffect(() => {
        if (cargandoSaldo) return
        setMontoUsd(tope > 0.001 ? tope.toFixed(2) : '')
        setMontoBs('')
    }, [topeKey, cargandoSaldo])   // eslint-disable-line react-hooks/exhaustive-deps

    // La tasa sale de la FECHA DE PAGO elegida, no de la vigente de hoy.
    const { tasasFecha, cargandoTasas } = useTasasFecha(perfil?.empresa_id, fecha)
    const tasaDia = Number(tasasFecha?.[tipoTasa]) || 0
    const tasa = tasaDia > 0 ? tasaDia : 1   // evita dividir entre 0 mientras no hay tasa
    const sinTasa = !cargandoTasas && tasaDia <= 0
    const totalEnUsd = Number(montoUsd || 0) + Number(montoBs || 0) / tasa

    // Rellena Bs. con lo que falte para saldar, dado el USD ya ingresado.
    function saldarRestoEnBs() {
        const resto = (tope - Number(montoUsd || 0)) * tasa
        setMontoBs(resto > 0 ? resto.toFixed(2) : '0')
    }

    async function confirmar() {
        if (sinTasa) { setError(`No hay tasa registrada para el ${fmtFechaCorta(fecha)}`); return }
        if (tope > 0.001 && totalEnUsd <= 0.001) { setError('Ingresa un monto válido'); return }
        if (totalEnUsd > tope + 0.01) { setError(`El monto no puede superar el saldo pendiente de ${fmt(tope)}`); return }

        setGuardando(true); setError('')
        const msg = await onConfirmar({
            fecha, tipoTasa, tasa,
            montoUsd: Number(montoUsd || 0),
            montoBs: Number(montoBs || 0),
            totalEnUsd,
            metodoUsd, metodoBs: metodoBs || null,
            // Etiquetas legibles, para las columnas que se muestran tal cual
            metodoUsdLabel: metodosUsd.find(m => m.value === metodoUsd)?.label || metodoUsd,
            metodoBsLabel: metodosBs.find(m => m.value === metodoBs)?.label || metodoBs || null,
            cuentaBancariaId: cuentaBancariaId || null,
            nota: nota || null,
        })
        if (msg) { setError(msg); setGuardando(false) }
    }

    const hayResumenExtendido = total !== undefined && total !== null

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>

                <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1 }}>
                        <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#1f2937', margin: '0 0 4px' }}>{titulo}</h2>
                        {subtitulo && <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>{subtitulo}</p>}
                    </div>
                    {proveedorId && (
                        <button type="button" onClick={() => setVerCuentasProv(v => !v)}
                            style={{ flexShrink: 0, padding: '6px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', border: '1px solid', borderColor: verCuentasProv ? '#1d4ed8' : '#e5e7eb', backgroundColor: verCuentasProv ? '#eff6ff' : '#fff', color: verCuentasProv ? '#1d4ed8' : '#374151' }}>
                            🏦 Cuentas del proveedor
                        </button>
                    )}
                </div>

                {proveedorId && verCuentasProv && <CuentasProveedor proveedorId={proveedorId} />}

                {/* Resumen de la obligación */}
                <div style={{ backgroundColor: '#eff6ff', borderRadius: '8px', padding: '12px 16px', marginBottom: extras ? '12px' : '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {hayResumenExtendido && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280' }}>
                            <span>Total</span><span style={{ fontWeight: 600, color: '#374151' }}>{fmt(total)}</span>
                        </div>
                    )}
                    {abonado > 0.001 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280' }}>
                            <span>Abonado</span><span style={{ fontWeight: 600, color: '#16a34a' }}>-{fmt(abonado)}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...(hayResumenExtendido ? { borderTop: '1px solid #dbeafe', paddingTop: '6px' } : {}) }}>
                        <span style={{ fontSize: '13px', color: '#16a34a' }}>Saldo pendiente</span>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#16a34a' }}>{cargandoSaldo ? '…' : fmt(saldo)}</span>
                    </div>
                </div>

                {extras}

                {tope > 0.001 && <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Fecha del pago + tasa de ESA fecha */}
                    <div>
                        <SelectorFechaTasa
                            fecha={fecha} onFecha={setFecha}
                            tasasFecha={tasasFecha} cargandoTasas={cargandoTasas}
                            tipoTasa={tipoTasa} onTipoTasa={setTipoTasa}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={labelS}>Monto USD</label>
                            <input type="number" min="0" step="0.01" value={montoUsd} placeholder="0.00"
                                onChange={e => setMontoUsd(e.target.value)} style={inputS} />
                        </div>
                        <div>
                            <label style={labelS}>Método USD</label>
                            <select value={metodoUsd} onChange={e => setMetodoUsd(e.target.value)} style={selectS}>
                                {metodosUsd.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div style={{ fontSize: '12px', color: '#6b7280', backgroundColor: '#f9fafb', borderRadius: '6px', padding: '8px 12px' }}>
                        Equivalente: {(Number(montoUsd || 0) * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151' }}>Monto Bs. (opcional)</label>
                                <button type="button" onClick={saldarRestoEnBs}
                                    style={{ fontSize: '11px', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                                    Saldar resto
                                </button>
                            </div>
                            <input type="number" min="0" step="0.01" value={montoBs} placeholder="0.00"
                                onChange={e => setMontoBs(e.target.value)} style={inputS} />
                        </div>
                        <div>
                            <label style={labelS}>Método Bs.</label>
                            <select value={metodoBs} onChange={e => setMetodoBs(e.target.value)} style={selectS}>
                                {metodosBs.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {(Number(montoUsd) > 0 && Number(montoBs) > 0) && (
                        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#166534', fontWeight: 600 }}>
                            Total del abono: {fmt(totalEnUsd)}
                        </div>
                    )}

                    {cuentasBancarias.length > 0 && (
                        <div>
                            <label style={labelS}>Cuenta bancaria (opcional)</label>
                            <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)} style={selectS}>
                                <option value="">— Efectivo / sin cuenta —</option>
                                {cuentasBancarias.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.banco} · {c.moneda})</option>)}
                            </select>
                        </div>
                    )}

                    <div>
                        <label style={labelS}>Nota (opcional)</label>
                        <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Referencia, observación..." style={inputS} />
                    </div>
                </div>}

                {error && (
                    <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: '#dc2626', marginTop: '14px' }}>
                        {error}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                    <button onClick={onCerrar}
                        style={{ flex: 1, padding: '10px', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '14px', color: '#374151', backgroundColor: '#fff', cursor: 'pointer' }}>
                        Cancelar
                    </button>
                    <button onClick={confirmar} disabled={guardando || sinTasa || cargandoTasas || cargandoSaldo}
                        style={{ flex: 2, padding: '10px', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: '#fff', backgroundColor: sinTasa || cargandoTasas || cargandoSaldo ? '#d1d5db' : '#16a34a', cursor: sinTasa || cargandoTasas || cargandoSaldo ? 'default' : 'pointer', opacity: guardando ? 0.6 : 1 }}>
                        {guardando ? 'Procesando...' : textoConfirmar}
                    </button>
                </div>
            </div>
        </div>
    )
}
