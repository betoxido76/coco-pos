-- Constraint de catálogo de unidades de medida (aplicado en Supabase prod 2026-06-25).
-- Garantía a nivel BD de que `unidad_medida` solo acepte valores del catálogo,
-- cerrando todas las vías que se saltan el dropdown del frontend: carga masiva
-- (CargaDatos.jsx), migración (migrate_pos.py) y SQL/API directo.
--
-- El catálogo debe mantenerse en sync con src/lib/unidades.js (UNIDADES).
-- NULL pasa el CHECK (comportamiento estándar de Postgres); las 4 tablas
-- igualmente reciben siempre un valor por defecto desde la app.

alter table productos_terminados add constraint chk_unidad_medida_catalogo
  check (unidad_medida in ('unidad','kg','g','litro','ml','caja','bolsa','rollo','metro','paquete','par','juego','otro'));

alter table materias_primas add constraint chk_unidad_medida_catalogo
  check (unidad_medida in ('unidad','kg','g','litro','ml','caja','bolsa','rollo','metro','paquete','par','juego','otro'));

alter table materiales_empaque add constraint chk_unidad_medida_catalogo
  check (unidad_medida in ('unidad','kg','g','litro','ml','caja','bolsa','rollo','metro','paquete','par','juego','otro'));

alter table consumibles add constraint chk_unidad_medida_catalogo
  check (unidad_medida in ('unidad','kg','g','litro','ml','caja','bolsa','rollo','metro','paquete','par','juego','otro'));
