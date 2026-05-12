-- =============================================================================
-- Paso 5.A — Edición local de respuestas
-- =============================================================================
-- Crea la tabla `cleaning_row_edits` para registrar ediciones inline que el
-- usuario hace sobre celdas de `cleaning_rows.data` durante el review.
--
-- Cada edit guarda el valor original (para poder revertir / auditar) y el
-- valor nuevo. Al exportar el Excel limpio, los edits se mergean sobre las
-- filas no eliminadas (ver `getCleanedRows` en `row-edits-repository.ts`).
--
-- Las columnas `synced_to_qp` y `synced_at` quedan reservadas para la etapa
-- 5.C (sync vía DELETE+POST a QuestionPro). Mientras 5.C no exista, queda
-- NULL/false.
--
-- Coordinación: schema compartido con mega-dashboard. Aplicar una sola vez.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cleaning_row_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id UUID NOT NULL REFERENCES cleaning_rows(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES cleaning_versions(id) ON DELETE CASCADE,
  column_id TEXT NOT NULL,
  original_value JSONB,
  new_value JSONB,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_by UUID,
  synced_to_qp BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMPTZ,
  UNIQUE (row_id, column_id)
);

-- Acceso primario: traer todos los edits de una versión para mergear al exportar
-- y para mostrar el indicador "Editado" en el review.
CREATE INDEX IF NOT EXISTS idx_cleaning_row_edits_version
  ON cleaning_row_edits (version_id);

-- Acceso secundario: para 5.C cuando filtremos edits no sincronizados a QP.
CREATE INDEX IF NOT EXISTS idx_cleaning_row_edits_unsynced
  ON cleaning_row_edits (version_id)
  WHERE synced_to_qp = false;

-- RLS: misma política permisiva que el resto de tablas del Limpiador
-- (USING true). La app desktop opera con anon key; la auth fina es F3.
ALTER TABLE cleaning_row_edits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cleaning_row_edits'
      AND policyname = 'cleaning_row_edits_all'
  ) THEN
    CREATE POLICY cleaning_row_edits_all
      ON cleaning_row_edits
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
