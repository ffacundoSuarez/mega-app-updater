-- =============================================================================
-- Paso 4 — Flags enriquecidos
-- =============================================================================
-- Agrega 4 columnas a `cleaning_flags` para que el motor de QC pueda guardar
-- explicaciones humanas, recomendación, IDs de columnas afectadas y respuestas
-- similares (detectadas vía embeddings).
--
-- Hay que correr esto en el proyecto Supabase corporativo ANTES de subir un
-- build con el cleaning-service.ts del paso 4. Si la app ejecuta el motor sin
-- estas columnas, el insert va a fallar con "column does not exist".
--
-- Coordinación: este schema lo comparten mega-dashboard y mega-app-updater.
-- Aplicar una sola vez. Las columnas son nullable / con default vacío para no
-- romper datos existentes ni rows escritos por la versión anterior del motor.
-- =============================================================================

-- 1. Recomendación: 'remove' / 'review' / 'keep' / NULL.
--    NULL para flags pre-paso-4 o cuando el modelo no devuelve el campo.
ALTER TABLE cleaning_flags
  ADD COLUMN IF NOT EXISTS recommendation TEXT
    CHECK (recommendation IN ('remove', 'review', 'keep'));

-- 2. Texto en español pensado para humanos. Reemplaza visualmente al `reason`
--    en la nueva UI de review (5.B), aunque `reason` se mantiene como respaldo
--    para compatibilidad y debugging.
ALTER TABLE cleaning_flags
  ADD COLUMN IF NOT EXISTS friendly_explanation TEXT;

-- 3. Lista de column ids del schema (Q1, Q22, META_PAIS, etc.) que el flag
--    señala como problemáticas. Vacío por default cuando el modelo no las da.
ALTER TABLE cleaning_flags
  ADD COLUMN IF NOT EXISTS affected_question_ids TEXT[]
    NOT NULL DEFAULT '{}';

-- 4. response_id de otras filas con texto similar (cosine sim > 0.85 sobre
--    embeddings de preguntas abiertas). Lo llena la pasada de similaridad al
--    final del job, después del QC IA. Vacío por default cuando no hay
--    similares o cuando los embeddings no se calculan.
ALTER TABLE cleaning_flags
  ADD COLUMN IF NOT EXISTS similar_response_ids TEXT[]
    NOT NULL DEFAULT '{}';

-- Índice para filtrar el dashboard de review por recomendación.
CREATE INDEX IF NOT EXISTS idx_cleaning_flags_recommendation
  ON cleaning_flags (recommendation)
  WHERE recommendation IS NOT NULL;
