// Registro de un abono a un gasto programado.
//
// Es la MISMA ventana que usa CxP para pagar una recepción (ModalPagoObligacion)
// con la lógica propia del gasto: la obligación queda intacta y cada abono es
// una fila en `pagos` (origen_tipo='gasto'); el estado se deriva comparando los
// abonos contra el total. Ver motor_pagos_fase1.sql.
//
// Montado desde el módulo Gastos y desde CxP → tab Gastos, para que pagar un
// gasto se vea y funcione igual desde ambos lados.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import ModalPagoObligacion from './ModalPagoObligacion'

const pagoEnUsd = p => Number(p.monto_usd || 0) + Number(p.monto_bs || 0) / (Number(p.tasa_cambio) || 1)

export default function ModalPagoGasto({ gasto, tasas = {}, onPagado, onCerrar }) {
    const { perfil } = useAuth()
    const [pagosPrevios, setPagosPrevios] = useState([])
    const [cargandoPagos, setCargandoPagos] = useState(true)

    // Total de la obligación en USD (congelado; NO se toca al abonar)
    const totalObligacion = Number(gasto.monto || 0) > 0
        ? Number(gasto.monto)
        : Number(gasto.monto_usd || 0) + Number(gasto.monto_bs || 0) / (tasas[gasto.tipo_tasa] || tasas.tasa_bcv || 1)

    const pagadoPrevio = pagosPrevios.reduce((s, p) => s + pagoEnUsd(p), 0)
    const saldo = Math.max(0, totalObligacion - pagadoPrevio)

    useEffect(() => {
        if (!perfil?.empresa_id) return
        setCargandoPagos(true)
        supabase.from('pagos')
            .select('monto_usd, monto_bs, tasa_cambio')
            .eq('empresa_id', perfil.empresa_id)
            .eq('origen_tipo', 'gasto').eq('origen_id', gasto.id)
            .then(({ data }) => { setPagosPrevios(data || []); setCargandoPagos(false) })
    }, [perfil?.empresa_id, gasto.id])

    async function confirmar({ fecha, tipoTasa, tasa, montoUsd, montoBs, metodoUsd, metodoBs, metodoUsdLabel, cuentaBancariaId, nota }) {
        const { data: { user } } = await supabase.auth.getUser()

        // 1) El abono es una fila nueva en `pagos` — la obligación queda intacta
        const { error: errPago } = await supabase.from('pagos').insert({
            empresa_id: perfil.empresa_id,
            origen_tipo: 'gasto',
            origen_id: gasto.id,
            fecha,
            monto_usd: montoUsd,
            monto_bs: montoBs,
            tasa_cambio: tasa,
            tipo_tasa: tipoTasa,
            metodo_usd: metodoUsd,
            metodo_bs: metodoBs,
            cuenta_bancaria_id: cuentaBancariaId,
            nota,
            usuario_id: user.id,
        })
        if (errPago) return 'Error: ' + errPago.message

        // 2) Estado derivado: releer todos los abonos y comparar contra la obligación
        const { data: todos } = await supabase.from('pagos')
            .select('monto_usd, monto_bs, tasa_cambio')
            .eq('empresa_id', perfil.empresa_id)
            .eq('origen_tipo', 'gasto').eq('origen_id', gasto.id)
        const pagadoTotal = (todos || []).reduce((s, p) => s + pagoEnUsd(p), 0)
        const nuevoEstado = pagadoTotal >= totalObligacion - 0.01 ? 'pagado' : 'parcial'

        const { error: err } = await supabase.from('gastos').update({
            estado: nuevoEstado,
            metodo_pago: metodoUsdLabel,
            cuenta_bancaria_id: cuentaBancariaId,
        }).eq('id', gasto.id)
        if (err) return 'Error al actualizar el gasto: ' + err.message

        onPagado()
    }

    return (
        <ModalPagoObligacion
            titulo="Registrar pago de gasto"
            subtitulo={[gasto.numero_gasto, gasto.nombre].filter(Boolean).join(' · ')}
            total={totalObligacion}
            abonado={pagadoPrevio}
            saldo={saldo}
            cargandoSaldo={cargandoPagos}
            onConfirmar={confirmar}
            onCerrar={onCerrar}
        />
    )
}
