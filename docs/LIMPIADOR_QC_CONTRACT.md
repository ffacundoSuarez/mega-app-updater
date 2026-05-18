# Limpiador — Contrato de QC

Documenta qué tablas y columnas escribe el motor de QC durante un job. Sirve
como referencia para alinear este motor (TypeScript, local) con el schema
existente en mega-dashboard y para diseñar la UI de F1.

> **Estado:** F0 + paso 4 (flags enriquecidos + similaridad por embeddings) +
> paso 5.A (edición inline) + paso 5.C (sync a QuestionPro — ver sección al
> final) + capa pre-IA determinística + few-shot en el prompt + modo debug del
> prompt (ver §"Capa pre-IA" y §"Modo debug"). Requiere haber corrido en el
> proyecto Supabase corporativo, antes de usar el Limpiador:
> `docs/migrations/2026-05-paso4-flags-enriched.sql`,
> `docs/migrations/2026-05-paso5a-row-edits.sql` y
> `docs/migrations/2026-05-paso5c-qp-sync.sql`. (La capa pre-IA, el few-shot y
> el modo debug NO requieren migración: reutilizan columnas existentes de
> `cleaning_flags`.)

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

## Capa pre-IA (chequeos determinísticos)

Antes del bucle de la IA, el job corre chequeos determinísticos puros
(`src/lib/cleaning/field-checks.ts`, orquestados por `pre-ai-checks.ts`) sobre
**todas** las filas de la versión. Las filas que esta capa flaguea **no** se
mandan a OpenAI (baja costo + consistencia: le saca al modelo lo trivial).

Reglas v1 (id que va en `cleaning_flags.matched_rules`):

| Regla | Disparo | flag | recommendation | conf | Columna |
|---|---|---|---|---|---|
| `ip_duplicada` | la IP del encuestado aparece en ≥2 filas | yellow | review | 0.7 | `META_IP` (QP) o por nombre |
| `duracion_corta` | duración < percentil 5 del set | yellow | review | 0.6 | `META_MINUTOS` (QP) o por nombre |
| `duracion_larga` | duración > percentil 95 del set | yellow | review | 0.4 | idem |
| `abierta_pocas_palabras` | respuesta abierta no vacía con <3 palabras | yellow | review | 0.85 | columnas con `qp_question_type` de texto |
| `abierta_caracteres_repetidos` | abierta con un mismo carácter ≥5 veces seguidas | red | remove | 1.0 | idem |

Notas:
- **Una fila → a lo sumo un flag** (la tabla tiene `UNIQUE(version_id,row_id)`):
  si dispara varias reglas gana la de mayor prioridad (`abierta_caracteres_repetidos`
  > `ip_duplicada` > `duracion_corta` > `abierta_pocas_palabras` > `duracion_larga`).
- La detección de columna IP/duración es **confiable sólo en proyectos QuestionPro**
  (metadata estándar `META_IP` / `META_MINUTOS`). Para Qualtrics es best-effort por
  nombre de columna; si no se identifica, se omite ese chequeo (log informativo).
- Las abiertas sólo se chequean si el schema fue **enriquecido con QP** y la columna
  tiene un `qp_question_type` de texto — sin tipo no se asume abierta (evita falsos
  positivos sobre preguntas cerradas en Qualtrics).
- `friendly_explanation` y `reason` se **redactan acá** (la IA no los provee para
  estas filas) siguiendo el mismo formato que los flags de IA.
- Es **best-effort**: si la carga de filas o el `saveFlags` fallan, el job sigue sin
  pre-filtro (la IA procesa todo). Es **idempotente**: re-correr el job re-aplica los
  mismos flags vía upsert.
- `getMaxProcessedRow` (resume) **excluye** los flags cuyo `matched_rules` está
  compuesto sólo por ids determinísticos: esos pueden caer en cualquier `row_number`
  y no implican que la IA haya procesado las filas previas.

## Lecturas (durante el job)

| Operación | Tabla | Filtro | Notas |
|---|---|---|---|
| `getVersion` | `cleaning_versions` (+ `cleaning_projects`) | `id = versionId` | Trae la versión y el proyecto padre embebido. |
| `getProjectRules` | `cleaning_rules` | `project_id = version.project_id`, `is_active = true`, ordenadas por `order_index` | Si falla la query, devuelve `[]` y sigue. |
| `getAllRows` | `cleaning_rows` | `version_id`, todas, paginadas de a 1000 | Para los chequeos cross-row de la capa pre-IA (IPs, percentiles de duración). |
| `getRows` | `cleaning_rows` | `version_id`, `row_number > cursor`, ordenadas asc, `limit = batchSize` | Paginación por cursor (bucle de IA). |
| `getMaxProcessedRow` | `cleaning_flags` ⨝ `cleaning_rows` | `version_id` | Mayor `row_number` ya procesado por IA (excluye flags puramente determinísticos). Reconcilia `cursor` al reanudar. |
| `getDeterministicFlaggedRowIds` | `cleaning_flags` | `version_id` | Filas con flag puramente determinístico — para no re-mandarlas a la IA al reanudar si falló la pasada pre-IA. |

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
- `debugPromptLogger(entry)` — opcional. Si se pasa, recibe por cada batch
  `{ batchIndex, model, rowCount, systemPrompt, userPrompt, rawResponse }`.

## Few-shot y modo debug del prompt

- **Few-shot:** `buildPrompt` inyecta un bloque de ejemplos (`FEW_SHOT_BLOCK` en
  `cleaning-service.ts`) — casos a flaguear (galimatías, copy-paste, vaga,
  contradicción) **y** casos legítimos que NO se flaguean (respuesta corta pero
  correcta, answerID de cerrada, comentario opcional). Lo último reduce el
  patrón "habla siempre de lo mismo". Son ejemplos genéricos, no de una encuesta
  puntual.
- **Modo debug:** `analyzeBatch`/`runCleaningJob` aceptan `debugPromptLogger`.
  En la app, la pantalla de detalle de proyecto lo conecta a `console.debug`
  cuando el setting `limpiador.debug_prompts` está activo (toggle en Ajustes →
  "Modo debug del Limpiador"). Vuelca el prompt completo (system + user) y la
  respuesta cruda de OpenAI por batch. Útil para iterar el prompt; visible con
  devtools (en `tauri dev`). No persiste nada.
- **Modelo:** default `gpt-5-mini` vía `/v1/chat/completions`. Como es un
  modelo de razonamiento, el body **no lleva** `temperature` ni `seed` (la
  API rechaza esos params en la familia GPT-5). `reasoning_effort` queda en
  su default (`medium`). `max_completion_tokens` está holgado (6000) porque
  los reasoning tokens también descuentan de ahí.

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

---

## Paso 5.C — Sync del review a QuestionPro

Fuera del motor de QC: lo dispara el usuario desde el botón "Sincronizar con
QuestionPro" en el review (`syncReviewToQP(versionId, onProgress?)` en
`src/lib/cleaning/sync-to-questionpro.ts`). Sólo aplica a proyectos con
`source = 'questionpro'` y `qp_survey_id` no nulo.

Requiere la migración `docs/migrations/2026-05-paso5c-qp-sync.sql`
(`cleaning_flags.removed_from_qp_at`) y la de 5.A
(`cleaning_row_edits`, con `synced_to_qp` / `synced_at`).

### Entrada en runtime

- **Settings store:** `questionpro.api_key` (obligatoria; tira
  `MissingQuestionproKeyError` si falta). Más `supabase.url` / `supabase.anon_key`
  como cualquier operación del Limpiador.

### Lecturas

| Operación | Tabla | Filtro | Notas |
|---|---|---|---|
| `getVersion` | `cleaning_versions` (+ `cleaning_projects`) | `id = versionId` | Para el `schema` (mapa `column_id ↔ qp_question_id`) y el `project_id`. |
| `getProject` | `cleaning_projects` | `id = version.project_id` | `source`, `qp_survey_id`. |
| `listFlags` | `cleaning_flags` ⨝ `cleaning_rows` | `version_id`, `user_decision = 'remove'` | Filas a borrar; la fila join'ada aporta `response_id`. |
| `getVersionEdits` | `cleaning_row_edits` | `version_id` | Edits indexados por `row_id`. Se sincronizan las filas con ≥1 edit `synced_to_qp = false` que **no** estén marcadas remove. |
| (select directo) | `cleaning_rows` | `id IN (filas con edits)` | `response_id` actual de cada fila a re-crear. |

### Llamadas a la API de QuestionPro

Por fila marcada `remove` (y `removed_from_qp_at` NULL):

1. `DELETE /a/api/v2/surveys/{surveyId}/responses/{responseId}` (un 404 se
   trata como éxito — idempotencia del re-sync).

Por fila con edits sin sincronizar:

1. `GET /a/api/v2/surveys/{surveyId}/responses/{responseId}` → respuesta completa.
2. Merge de los edits sobre `responseSet` (por `questionID`, preservando el
   shape de `answerValues`); `META_ESTADO` → `responseStatus`
   (Completada→Completed, Iniciada→Started, Terminada→Terminated) y
   `META_DUPLICADO` → `duplicate` (Sí→true, No→false). Otras columnas metadata
   editadas **no** se propagan (warning en el resultado).
3. `DELETE` de la respuesta original.
4. `POST /a/api/v2/surveys/{surveyId}/responses` con el payload mergeado
   (preserva `timestamp`, `ipAddress`, `location`, `duplicate`, `timeTaken`,
   `responseStatus`, `customVariables`, `languageID`, `operatingSystem`,
   `osDeviceType`, `browser`). Devuelve un `responseID` nuevo.

`DELETE`+`POST` no es atómico: si el POST falla tras un DELETE exitoso, esa
respuesta se perdió en QP (sigue en el XLSX limpio con sus ediciones). El
`reason` del fallo lo dice y el modal de confirmación lo anticipa.

### Escrituras (en Supabase)

| Cuándo | Tabla | Update |
|---|---|---|
| Tras `DELETE` OK de una fila `remove` | `cleaning_flags` | `{ removed_from_qp_at: now() }` (vía `markFlagRemovedFromQP`) |
| Tras `POST` OK de una fila editada | `cleaning_row_edits` | `{ synced_to_qp: true, synced_at: now() }` para **todos** los edits de la fila (vía `markRowEditsSynced`) |
| Tras `POST` OK de una fila editada | `cleaning_rows` | `{ response_id: <nuevo responseID de QP> }` (mismo `markRowEditsSynced`) |

`markRowEditsSynced` hace los dos updates secuenciales (sin transacción): si el
segundo falla, los edits quedan `synced` pero `response_id` stale — re-correr el
sync lo reconcilia (el DELETE por el `response_id` viejo devuelve 404 → OK → se
re-crea de nuevo).

### Robustez

Si una fila falla, se registra en `result.removed.failed[]` / `result.edited.failed[]`
y el batch sigue. No hay retry automático: el usuario reintenta el botón y la
lógica vuelve a empezar desde lo no sincronizado. `result.warnings[]` lista
filas que se sincronizaron pero con caveats (p. ej. columnas metadata editadas
no propagables).
