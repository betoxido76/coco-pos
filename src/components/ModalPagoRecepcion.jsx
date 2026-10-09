// Pago de una recepción (compra) — la única puerta para pagarle a un proveedor
// por mercancía: CxP → Pagar y la recepción de contado ("pagar ahora").
//
// El formulario (fecha + tasa, montos, métodos, cuenta, nota) vive en
// ModalPagoObligacion, compartido con Gastos. Aquí queda lo propio de una
// recepción: descuento por pronto pago, notas de débito, anticipos y el estado
// de la compra. Calcula su propio saldo, así sirve igual desde cualquier lado.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import ModalPagoObligacion from './ModalPagoObligacion'
import { SelectorAnticipos, totalAplicaciones, aplicacionesALista } from './AnticiposOC'
import { fechaAtimestamp } from './SelectorFechaTasa'
import BloqueRetenciones from './BloqueRetenciones'
import BloqueCreditosProveedor from './BloqueCreditosProveedor'

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`
const pagoEnUsd = (p) => Number(p.monto_usd || 0) + Number(p.monto_bs || 0) / Number(p.tasa_cambio || 1)

// Pago registrado en la propia recepción (compras.pago_usd/pago_bs): así se
// guardaban las recepciones de contado antes de pasar por CxP.
export const pagoDirectoCompra = (c) => c?.condicion_pago === 'contado'
    ? Number(c.pago_usd || 0) + Number(c.pago_bs || 0) / Number(c.tasa_cambio || 1)
    : 0

export default function ModalPagoRecepcion({ compra, onCerrar, onPagado }) {
    const { perfil } = useAuth()
    const [pagosPrevios, setPagosPrevios] = useState(null)
    const [descPct, setDescPct] = useState(0)
    // Notas de crédito del proveedor (devoluciones y manuales): docs/plan-nc-proveedores.md
    const [creditos, setCreditos] = useState({ total: 0, aplicaciones: [] })
    const [aplicaciones, setAplicaciones] = useState({}) // anticipo_id -> monto USD
    const [anticiposCargados, setAnticiposCargados] = useState([])
    // Retenciones de IVA/ISLR (docs/plan-retenciones.md): abono sin caja
    const [ret, setRet] = useState({ monto: 0 })

    useEffect(() => {
        supabase.from('pagos_proveedor').select('monto_usd, monto_bs, tasa_cambio')
            .eq('compra_id', compra.id).eq('anulado', false)
            .then(({ data }) => setPagosPrevios(data || []))
    }, [compra.id])

    const cargando = pagosPrevios === null
    const debido = Number(compra.total || 0) - Number(compra.descuento_pago || 0)
    const pagadoPrevio = (pagosPrevios || []).reduce((s, p) => s + pagoEnUsd(p), 0) + pagoDirectoCompra(compra)
    const saldo = Math.max(0, debido - pagadoPrevio)

    const descMonto = saldo * (Number(descPct) / 100)
    const saldoConDesc = Math.max(0, saldo - descMonto)
    const saldoTrasNDs = Math.max(0, saldoConDesc - Number(creditos.total || 0))
    // Anticipos pagados antes de recibir: cubren saldo sin mover dinero hoy
    const montoAnticipos = totalAplicaciones(aplicaciones)
    const saldoTrasAnticipos = Math.max(0, saldoTrasNDs - montoAnticipos)
    // Lo retenido no se le paga al proveedor: se le debe al SENIAT
    const saldoEfectivo = Math.max(0, saldoTrasAnticipos - Number(ret.monto || 0))

    async function confirmar({ fecha, tipoTasa, tasa, montoUsd, montoBs, metodoUsd, metodoBs, cuentaBancariaId, nota }) {
        const { data: { user } } = await supabase.auth.getUser()
        // fecha_pago es timestamptz: 'AAAA-MM-DD' solo se guardaría como medianoche
        // UTC, que en Venezuela es el día ANTERIOR. Mediodía lo deja en su día.
        const fechaPago = fechaAtimestamp(fecha)

        // El descuento reduce el valor de la factura; NO se registra como pago.
        const descuentoTotal = Number(compra.descuento_pago || 0) + (descMonto > 0.001 ? descMonto : 0)

        // Notas de crédito del proveedor: la RPC valida el saldo de la nota y de
        // la recepción, escribe el abono sin caja y recalcula ambos estados.
        for (const ap of creditos.aplicaciones) {
            const { error: errNc } = await supabase.rpc('aplicar_credito_proveedor', {
                p_credito_id: ap.id, p_origen_tipo: 'compra', p_origen_id: compra.id, p_monto: ap.monto, p_fecha: fecha,
            })
            if (errNc) return `No se pudo aplicar la nota ${ap.numero}: ${errNc.message}`
        }

        // Aplicación de anticipos: la RPC valida saldos (del anticipo y de la
        // recepción) y escribe el abono sin cuenta bancaria.
        for (const ap of aplicacionesALista(aplicaciones, anticiposCargados)) {
            const { error: errAp } = await supabase.rpc('aplicar_anticipo_proveedor', {
                p_anticipo_id: ap.anticipo_id, p_compra_id: compra.id, p_monto: ap.monto,
            })
            if (errAp) return `No se pudo aplicar el anticipo ${ap.numero}: ${errAp.message}`
        }

        if (saldoEfectivo > 0.001) {
            const { error: errPago } = await supabase.from('pagos_proveedor').insert({
                compra_id: compra.id, usuario_id: user.id,
                monto_usd: montoUsd, monto_bs: montoBs,
                tasa_cambio: tasa, tipo_tasa: tipoTasa, fecha_pago: fechaPago,
                metodo_usd: metodoUsd, metodo_bs: metodoBs,
                nota, cuenta_bancaria_id: cuentaBancariaId,
                empresa_id: perfil.empresa_id,
            })
            if (errPago) return 'Error: ' + errPago.message
        }

        // Retenciones al final: la RPC recalcula y valida contra el saldo que
        // queda tras el pago (= lo retenido). Si falla, el pago ya quedó y la
        // retención se puede registrar volviendo a Pagar.
        if (Number(ret.monto) > 0.001) {
            const { error: errRet } = await supabase.rpc('registrar_retenciones', {
                p_origen_tipo: 'compra', p_origen_id: compra.id, p_fecha: fecha, p_tasa: tasa, p_tipo_tasa: tipoTasa,
                p_aplicar_iva: !!ret.aplicarIva, p_aplicar_islr: !!ret.aplicarIslr,
            })
            if (errRet) return `${saldoEfectivo > 0.001 ? 'El pago se registró, pero la retención no' : 'No se pudo registrar la retención'}: ${errRet.message}`
        }

        const { data: todosPagos } = await supabase
            .from('pagos_proveedor').select('monto_usd, monto_bs, tasa_cambio').eq('compra_id', compra.id).eq('anulado', false)
        const totalPagado = (todosPagos || []).reduce((s, p) => s + pagoEnUsd(p), 0) + pagoDirectoCompra(compra)
        const montoDebido = Number(compra.total) - descuentoTotal
        const nuevoEstado = totalPagado >= montoDebido - 0.01 ? 'pagado' : 'parcial'
        const { error: errCompra } = await supabase.from('compras')
            .update({ estado_cobro: nuevoEstado, descuento_pago: parseFloat(descuentoTotal.toFixed(2)) })
            .eq('id', compra.id)
        if (errCompra) return 'Error al actualizar la factura: ' + errCompra.message

        onPagado()
    }

    const extras = (
        <>
            {!cargando && (
                <BloqueRetenciones origenTipo="compra" origenId={compra.id} proveedorId={compra.proveedor_id}
                    base={compra.base_gravada == null && compra.base_exenta == null ? null : Number(compra.base_gravada || 0) + Number(compra.base_exenta || 0)}
                    iva={compra.iva} totalDocumento={Number(compra.total || 0)}
                    saldo={saldoTrasAnticipos} onChange={setRet} />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <label style={{ fontSize: '12px', fontWeight: 500, color: '#374151', whiteSpace: 'nowrap' }}>Descuento (%)</label>
                <input type="number" min="0" max="100" step="0.1" value={descPct || ''} placeholder="0"
                    onChange={e => setDescPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                    style={{ width: '80px', padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '13px', textAlign: 'right' }} />
                {descMonto > 0.001 && (
                    <span style={{ fontSize: '13px', color: '#dc2626', fontWeight: 500 }}>
                        -{fmt(descMonto)} · A pagar: {fmt(saldoConDesc)}
                    </span>
                )}
            </div>

            {!cargando && (
                <BloqueCreditosProveedor proveedorId={compra.proveedor_id} saldo={saldoConDesc} onChange={setCreditos} />
            )}

            <SelectorAnticipos proveedorId={compra.proveedor_id} ocId={compra.orden_compra_id || null}
                tope={saldoTrasNDs} aplicaciones={aplicaciones} onChange={setAplicaciones} onCargados={setAnticiposCargados} />
        </>
    )

    return (
        <ModalPagoObligacion
            titulo="Registrar pago"
            subtitulo={[compra.numero_doc, compra.proveedores?.nombre].filter(Boolean).join(' · ')}
            total={Number(compra.total || 0)}
            abonado={pagadoPrevio}
            saldo={saldo}
            saldoEfectivo={saldoEfectivo}
            cargandoSaldo={cargando}
            extras={extras}
            proveedorId={compra.proveedor_id}
            bloqueo={compra.estado_factura === 'pendiente'
                ? 'Esta recepción llegó sin factura: regístrala en Cuentas por Pagar → Ver antes de pagar.'
                : ret.error || null}
            confirmacion={Number(ret.monto) > 0.001 ? { aviso: `Se retienen ${fmt(ret.monto)} (${[ret.aplicarIva && 'IVA', ret.aplicarIslr && 'ISLR'].filter(Boolean).join(' y ')}): no se le pagan al proveedor, se le deben al SENIAT.` } : {}}
            onConfirmar={confirmar}
            onCerrar={onCerrar}
        />
    )
}
