-- =============================================================================
-- Cuestionario — Inicialización (Iteración 1)
-- =============================================================================
-- Crea las dos tablas del módulo Validador de Cuestionarios (ver
-- docs/cuestionario-validator-plan.md):
--
--   - questionnaires            → un row por cuestionario que el usuario
--                                  construye/importa. `questionnaire_json`
--                                  guarda el Questionnaire canónico (preguntas,
--                                  opciones, flujos, secciones, metadata).
--   - questionnaire_validations → historial de validaciones. Cada vez que el
--                                  usuario corre el validador queda un row con
--                                  el reporte completo en JSONB.
--
-- Mismo patrón que el Limpiador: sin auth.users, RLS permisiva. La app es
-- desktop y todos los usuarios comparten el proyecto Supabase corporativo.
-- La API key de QuestionPro NO se persiste acá; vive sólo en
-- tauri-plugin-store local del usuario (mismo helper que usa el Limpiador).
--
-- Coordinación: este schema lo comparten mega-dashboard y mega-app-updater.
-- Aplicar una sola vez. Todo es IF NOT EXISTS / nullable para que sea
-- idempotente y no rompa instalaciones que ya tengan los objetos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS questionnaires (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  -- 'blanco'           = creado desde cero en el editor.
  -- 'texto'/'docx'/'pdf' = parseado por IA desde el input correspondiente.
  -- 'questionpro_api'  = importado directo desde la API de QP (sin parser IA).
  origen TEXT NOT NULL CHECK (
    origen IN ('blanco', 'texto', 'docx', 'pdf', 'questionpro_api')
  ),
  archivo_nombre TEXT,
  -- Survey ID de QP de origen si origen='questionpro_api'.
  qp_survey_id TEXT,
  -- Survey creada al publicar en QP (Iteración 8). NULL hasta que se publique.
  qp_published_survey_id TEXT,
  qp_published_at TIMESTAMPTZ,
  -- Questionnaire canónico. Ver src/lib/cuestionario/types.ts.
  -- Nullable a propósito: el camino "Empezar en blanco" crea la fila antes
  -- de que el usuario haya agregado nada, y los caminos de parseo persisten
  -- el JSON después de que el parser termina.
  questionnaire_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permitir todo questionnaires" ON questionnaires;
CREATE POLICY "permitir todo questionnaires" ON questionnaires
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_questionnaires_created_at
  ON questionnaires (created_at DESC);

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS questionnaire_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id UUID NOT NULL
    REFERENCES questionnaires(id) ON DELETE CASCADE,
  -- QuestionnaireValidationReport (ver types.ts).
  report JSONB NOT NULL,
  validated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE questionnaire_validations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permitir todo questionnaire_validations"
  ON questionnaire_validations;
CREATE POLICY "permitir todo questionnaire_validations"
  ON questionnaire_validations
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_questionnaire_validations_qid
  ON questionnaire_validations (questionnaire_id, validated_at DESC);
