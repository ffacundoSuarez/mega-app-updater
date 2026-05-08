# Limpiador — Contrato de QC

Documenta qué tablas y columnas escribe el motor de QC durante un job. Sirve
como referencia para alinear este motor (TypeScript, local) con el schema
existente en mega-dashboard y para diseñar la UI de F1.

> **Estado:** F0 + paso 4 (flags enriquecidos + similaridad por embeddings).
> Requiere haber corrido `docs/migrations/2026-05-paso4-flags-enriched.sql`
> en el proyecto Supabase corporativo antes de ejecutar el motor.

## Origen del schema

Las tablas viven en el proyecto Supabase corporativo. El SQL fuente está en
`mega-dashboard/docs/migrations/2025-01-29_create-limpiador-tables.sql` (más
migraciones posteriores en `supabase/migrations/`). RLS actual: permisiva
(`USING (true)`); por eso la app desktop puede operar sólo con la **anon key**.

## Entrada del job

`runCleaningJob(versionId)` necesita que **antes** existan en la base:

- 1 fila en `cleaning_versions` con `status = 'pending'` (o `'processing'`,
  para reanudar) y `total_rows > 0`.
- N filas en `cleaning_rows` ligadas a esa versión, con `row_number` empezando
  en 1 y `data` (JSONB) con un valor por columna del schema.
- 0..N filas en `cleaning_rules` del proyecto padre con `is_active = true`.

Entrada en runtime:

- **Settings store:** `supabase.url`, `supabase.anon_key`, `openai.api_key`
  (todas obligatorias; el job tira `MissingSupabaseSettingsError` /
  `MissingOpenAiKeyError` si falta alguna).

## Lecturas (durante el job)

| Operación | Tabla | Filtro | Notas |
|---|---|---|---|
| `getVersion` | `cleaning_versions` (+ `cleaning_projects`) | `id = versionId` | Trae la versión y el proyecto padre embebido. |
| `getProjectRules` | `cleaning_rules` | `project_id = version.project_id`, `is_active = true`, ordenadas por `order_index` | Si falla la query, devuelve `[]` y sigue. |
| `getRows` | `cleaning_rows` | `version_id`, `row_number > cursor`, ordenadas asc, `limit = batchSize` | Paginación por cursor. |
| `getMaxProcessedRow` | `cleaning_flags` ⨝ `cleaning_rows` | `version_id` | Mayor `row_number` ya flagueado. Se usa para reconciliar `cursor` cuando un job se reanuda. |

## Escrituras (durante el job)

### 1. Estado de la versión — `cleaning_versions`

| Cuándo | Updates |
|---|---|
| Al iniciar | `{ status: 'processing' }` |
| Después de cada batch exitoso | `{ processed_rows: <maxRowDelBatch>, progress_percentage: <0..100> }` |
| Al cancelar | `{ status: 'error', processed_rows, progress_percentage, error_message: 'Cancelled by user' }` |
| Al terminar OK | `{ status: 'completed', processed_rows: cursor, progress_percentage: 100, completed_at: <ISO> }` |
| Al terminar con cursor < total | `{ status: 'error', processed_rows, progress_percentage, completed_at: null }` |
| Al fallar antes/durante | `{ status: 'error', error_message: <mensaje> }` (best-effort) |

### 2. Flags — `cleaning_flags`

Tras analizar el batch con OpenAI, se filtran resultados con `flag !== 'none'`
y se hace **upsert** por `onConflict: 'version_id,row_id'` (reintentos no
duplican). Cada inserción tiene la forma:

```ts
{
  version_id: string,
  row_id: string,                       // FK a cleaning_rows
  flag_type: 'red' | 'yellow',
  reason: string,                       // del modelo, fallback "No reason provided"
  matched_rules: string[],              // ids de reglas o nombres de patrón ("gibberish", etc.)
  confidence: number,                   // 0..1, default 0.5 si el modelo no la da
  user_decision: null,                  // siempre null: el review humano lo setea después

  // Campos enriquecidos del paso 4
  friendly_explanation: string | null,  // texto en español para humano (UI 5.B)
  recommendation: 'remove' | 'review' | 'keep' | null,  // mapeo default red→remove, yellow→review
  affected_question_ids: string[],      // column ids del schema que dispararon el flag
  similar_response_ids: []              // se llena en la pasada de similaridad (ver §3)
}
```

**Filas con `flag = 'none'` no se persisten.** Esto sigue el comportamiento
del servicio Lightsail original.

### 3. Similaridad — `cleaning_flags.similar_response_ids`

Después de terminar el bucle de QC y sólo si la versión completa OK, se ejecuta
una pasada de similaridad sobre las filas flagueadas:

1. Identifica columnas "abiertas" del schema (vía `qp_question_type` o
   heurística sobre el texto del header en proyectos Qualtrics).
2. Por cada columna abierta, calcula embeddings con `text-embedding-3-small`
   (1536 dim) sobre los textos de las filas flagueadas, en batches de 256.
3. Computa cosine similarity pairwise. Pares con `sim > 0.85` se vinculan.
4. Para cada fila vinculada con ≥ 1 par, se guardan los `response_id` (o
   `row_id` como fallback) de las otras filas del cluster en
   `similar_response_ids` vía update directo (no upsert).

Si OpenAI falla, la pasada se saltea best-effort: el job termina exitoso y
`similar_response_ids` queda en `[]` para todos los flags. La UI de review
debe tratarlo como opcional.

## Lo que el motor NO toca

- **`cleaning_rows.data`** — el motor sólo lee.
- **`cleaning_flags.user_decision` / `decided_at`** — son del review humano (F1).
- **`cleaning_rules`** — sólo lectura.
- **`cleaning_projects`** — sólo se lee como join de `getVersion`.

## Eventos emitidos al UI (in-process)

Sin polling HTTP. El controller del job expone:

- `onProgress(event)` — invocado tras cada batch persistido, con
  `{ versionId, totalRows, processedRows, progressPercentage, totalFlagged,
   lastBatchFlags, lastBatchRows }`.
- `onLog(level, message)` — todo el logging que el original mandaba a
  `console.log`. La app desktop puede engancharlo a su propio panel.
- `controller.cancel()` — pone el flag de cancelación. El batch en curso
  termina y persiste; recién después se aborta. Mismo compromiso que el
  servicio Lightsail.

## Resume (reanudación)

El job es idempotente respecto a la versión: si se interrumpe (cancel, error,
crash), volver a llamar `runCleaningJob(versionId)` retoma desde el último
`row_number` que tenga flag persistido (vía `getMaxProcessedRow`). Las filas
ya flagueadas no se reprocesan; las que no tenían flag pero ya pasaron por
OpenAI (resultaron `none`) **sí se reprocesarán** — es el mismo
comportamiento del original.

## Lo que queda fuera de F0

- Crear proyecto / versión / cargar Excel — F1.
- Sugerencia de reglas con IA (`suggest-rules`) — F1.
- Enriquecimiento de schema con QuestionPro — F1.
- Vista de review (decidir keep/remove sobre flags) — F1.
- Export del Excel limpio — F1.
- UI del Toolbar para entrar al Limpiador — F1.
