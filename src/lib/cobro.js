// Reglas de saldo compartidas por CxC y por los tres caminos de facturación.
//
// Una nota de entrega puede salir en $0: muestras, reposiciones, cortesías. No
// hay nada que cobrar, así que no es una cuenta por cobrar — pero si nace
// 'pendiente' queda atrapada: la ventana de cobro rechaza el 0 por "ingresa un
// monto" y rechaza cualquier otra cifra por "supera el saldo pendiente". Sin
// un valor que pase ambas validaciones, la factura no podía cerrarse nunca.
//
// Vive aquí y no copiado en cada pantalla porque la regla ya se escribió tres
// veces distinto entre Ventas, Pedidos y NuevoPedido, y la diferencia era el bug.

// Tolerancia de centavos, la misma que usan los cálculos de cobro.
export const EPSILON_SALDO = 0.01

// ¿Este monto es cero a efectos de cobranza?
export const sinSaldoQueCobrar = (monto) => Math.abs(Number(monto || 0)) <= EPSILON_SALDO
