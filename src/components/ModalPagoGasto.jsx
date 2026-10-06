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
import BloqueRetenciones from './BloqueRetenciones'
import BloqueCreditosProveedor from './BloqueCreditosProveedor'

const pagoEnUsd = p => Number(p.monto_usd || 0) + Number(p.monto_bs || 0) / (Number(p.tasa_cambio) || 1)

export default function ModalPagoGasto({ gasto, tasas = {}, fechaInicial = null, onPagado, onCerrar }) {
    const { perfil } = useAuth()
    const [pagosPrevios, setPagosPrevios] = useState([])
    const [cargandoPagos, setCargandoPagos] = useState(true)
    // Retenciones de IVA/ISLR (docs/plan-retenciones.md): abono sin caja
    const [ret, setRet] = useState({ monto: 0 })
    // Notas de crédito del proveedor: docs/plan-nc-proveedores.md
    const [creditos, setCreditos] = useState({ total: 0, aplicaciones: [] })

    // Total de la obligación en USD (congelado; NO se toca al abonar)
    const totalObligacion = Number(gasto.monto || 0) > 0
        ? Number(gasto.monto)
        : Number(gasto.monto_usd || 0) + Number(gasto.monto_bs || 0) / (tasas[gasto.tipo_tasa] || tasas.tasa_bcv || 1)

    const pagadoPrevio = pagosPrevios.reduce((s, p) => s + pagoEnUsd(p), 0)
    const saldo = Math.max(0, totalObligacion - pagadoPrevio)
    const fmt = (n) => `$${Number(n || 0).toFixed(2)}`

    useEffect(() => {
        if (!perfil?.empresa_id) return
        setCargandoPagos(true)
        supabase.from('pagos')
            .select('monto_usd, monto_bs, tasa_cambio')
            .eq('empresa_id', perfil.empresa_id)
            .eq('origen_tipo', 'gasto').eq('origen_id', gasto.id)
            .then(({ data }) => { setPagosPrevios(data || []); setCargandoPagos(false) })
    }, [perfil?.empresa_id, gasto.id])

    async function confirmar({ fecha, tipoTasa, tasa, montoUsd, montoBs, totalEnUsd, metodoUsd, metodoBs, metodoUsdLabel, cuentaBancariaId, nota }) {
        const { data: { user } } = await supabase.auth.getUser()
        const hayDinero = Number(totalEnUsd) > 0.001

        // 0) Notas de crédito del proveedor: la RPC valida saldos y escribe el abono sin caja
        for (const ap of creditos.aplicaciones) {
            const { error: errNc } = await supabase.rpc('aplicar_credito_proveedor', {
                p_credito_id: ap.id, p_origen_tipo: 'gasto', p_origen_id: gasto.id, p_monto: ap.monto, p_fecha: fecha,
            })
            if (errNc) return `No se pudo aplicar la nota ${ap.numero}: ${errNc.message}`
        }

        // 1) El abono es una fila nueva en `pagos` — la obligación queda intacta.
        //    Sin dinero (todo lo cubre la retención) no se escribe un abono en 0.
        if (hayDinero) {
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
        }

        // 1b) Retenciones: la RPC calcula, valida contra el saldo que queda (= lo
        //     retenido) y guarda el desglose del gasto si se indicó aquí.
        if (Number(ret.monto) > 0.001) {
            const { error: errRet } = await supabase.rpc('registrar_retenciones', {
                p_origen_tipo: 'gasto', p_origen_id: gasto.id, p_fecha: fecha, p_tasa: tasa, p_tipo_tasa: tipoTasa,
                p_aplicar_iva: !!ret.aplicarIva, p_aplicar_islr: !!ret.aplicarIslr,
                p_base: ret.desgloseNuevo ? ret.base : null, p_iva: ret.desgloseNuevo ? ret.iva : null,
            })
            if (errRet) return `${hayDinero ? 'El pago se registró, pero la retención no' : 'No se pudo registrar la retención'}: ${errRet.message}`
        }

        // 2) Estado derivado: releer todos los abonos y comparar contra la obligación
        const { data: todos } = await supabase.from('pagos')
            .select('monto_usd, monto_bs, tasa_cambio')
            .eq('empresa_id', perfil.empresa_id)
            .eq('origen_tipo', 'gasto').eq('origen_id', gasto.id)
        const pagadoTotal = (todos || []).reduce((s, p) => s + pagoEnUsd(p), 0)
        const nuevoEstado = pagadoTotal >= totalObligacion - 0.01 ? 'pagado' : 'parcial'

        const { error: err } = await supabase.from('gastos').update({
            estado: nuevoEstado,
            ...(hayDinero ? { metodo_pago: metodoUsdLabel, cuenta_bancaria_id: cuentaBancariaId } : {}),
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
            saldoEfectivo={Math.max(0, saldo - Number(creditos.total || 0) - Number(ret.monto || 0))}
            extras={!cargandoPagos && (<>
                <BloqueRetenciones origenTipo="gasto" origenId={gasto.id} proveedorId={gasto.proveedor_id}
                    base={gasto.base_imponible ?? null} iva={gasto.monto_iva} totalDocumento={totalObligacion}
                    saldo={Math.max(0, saldo - Number(creditos.total || 0))} onChange={setRet} />
                <BloqueCreditosProveedor proveedorId={gasto.proveedor_id} saldo={saldo} onChange={setCreditos} />
            </>)}
            bloqueo={ret.error || null}
            confirmacion={Number(ret.monto) > 0.001 ? { aviso: `Se retienen ${fmt(ret.monto)} (${[ret.aplicarIva && 'IVA', ret.aplicarIslr && 'ISLR'].filter(Boolean).join(' y ')}): no se le pagan al proveedor, se le deben al SENIAT.` } : {}}
            proveedorId={gasto.proveedor_id}
            fechaInicial={fechaInicial}
            onConfirmar={confirmar}
            onCerrar={onCerrar}
        />
    )
}
