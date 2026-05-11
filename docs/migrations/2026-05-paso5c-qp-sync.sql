-- =============================================================================
-- Paso 5.C — Sync a QuestionPro
-- =============================================================================
-- Cierra el loop del review hacia QuestionPro: las decisiones `remove` y las
-- ediciones inline (5.A) hoy quedan locales (sólo impactan el XLSX limpio).
-- Con 5.C un único botón "Sincronizar con QuestionPro" propaga todo en batch:
--   - filas con `user_decision = 'remove'` → DELETE de la respuesta en QP.
--   - filas con edits sin sincronizar → GET → mergear edits → DELETE → POST.
--
-- Esta migración agrega la única columna nueva que necesita 5.C: marca cuándo
-- una respuesta flagueada se eliminó efectivamente de QuestionPro (para no
-- re-intentar el DELETE y para mostrar el estado en el review). Los campos
-- `synced_to_qp` / `synced_at` de `cleaning_row_edits` ya existen (migración 5.A).
--
-- Coordinación: schema compartido con mega-dashboard. Aplicar una sola vez.
-- Columna nullable: no rompe datos existentes ni rows escritos por versiones
-- previas.
-- =============================================================================

ALTER TABLE cleaning_flags
  ADD COLUMN IF NOT EXISTS removed_from_qp_at TIMESTAMPTZ;

-- Índice parcial para filtrar rápido los flags 'remove' que todavía no se
-- eliminaron de QP (el botón de sync usa exactamente este conjunto).
CREATE INDEX IF NOT EXISTS idx_cleaning_flags_pending_qp_removal
  ON cleaning_flags (version_id)
  WHERE user_decision = 'remove' AND removed_from_qp_at IS NULL;
