-- ═══════════════════════════════════════════════════════════════════════════
-- Notas de crédito de proveedores — Fase 3: la aplicación solo por RPC
-- docs/plan-nc-proveedores.md. Desde aquí la ventana de pago aplica las notas
-- con aplicar_credito_proveedor; escribir devolucion_proveedor_id a mano
-- (como hacía la versión anterior, todo-o-nada) queda bloqueado.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION _guarda_credito_proveedor_id()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.devolucion_proveedor_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.devolucion_proveedor_id IS DISTINCT FROM OLD.devolucion_proveedor_id)
       AND COALESCE(current_setting('mipos.aplicando_credito', true), '') <> 'on' THEN
        RAISE EXCEPTION 'Las notas de crédito de proveedor se aplican con aplicar_credito_proveedor';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS pagos_proveedor_guarda_credito ON pagos_proveedor;
CREATE TRIGGER pagos_proveedor_guarda_credito
  BEFORE INSERT OR UPDATE OF devolucion_proveedor_id ON pagos_proveedor
  FOR EACH ROW EXECUTE FUNCTION _guarda_credito_proveedor_id();
DROP TRIGGER IF EXISTS pagos_guarda_credito ON pagos;
CREATE TRIGGER pagos_guarda_credito
  BEFORE INSERT OR UPDATE OF devolucion_proveedor_id ON pagos
  FOR EACH ROW EXECUTE FUNCTION _guarda_credito_proveedor_id();

-- El abono de una nota no es caja
ALTER TABLE pagos_proveedor DROP CONSTRAINT IF EXISTS pagos_proveedor_credito_sin_cuenta;
ALTER TABLE pagos_proveedor ADD CONSTRAINT pagos_proveedor_credito_sin_cuenta
  CHECK (devolucion_proveedor_id IS NULL OR cuenta_bancaria_id IS NULL) NOT VALID;
ALTER TABLE pagos DROP CONSTRAINT IF EXISTS pagos_credito_sin_cuenta;
ALTER TABLE pagos ADD CONSTRAINT pagos_credito_sin_cuenta
  CHECK (devolucion_proveedor_id IS NULL OR cuenta_bancaria_id IS NULL);
