# Sesión 2026-06 — QuestionPro en Codificación, headers tolerantes y lectura/inserción de Excel en Rust

## Resumen para el próximo agente

Sesión enfocada en tres pedidos del usuario sobre **Codificación** y **Limpiador**:

1. **Codificación** ahora soporta el formato Excel de **QuestionPro** (antes solo Qualtrics).
2. **Limpiador** dejó de ser estricto con los headers (acentos/mayúsculas/orden) y acepta archivos que no vienen de Automatizaciones.
3. **Performance**: subir un Excel grande (10.140 filas × 314 columnas) consumía ~4 GB de RAM en el WebView y al guardar se colgaba. Se movió la lectura + inserción a **Rust con `calamine`**, en streaming.

Como derivado del punto 3 apareció un hallazgo clave: el **export crudo de QuestionPro** (descarga "Excel" desde la web de QP) **no se puede abrir con el lector JS** (`xlsx-js-style`) porque revienta el límite de string de V8 (~536 MB). Eso obligó a que el lector Rust sea el único camino para ingerir el crudo.

> **Nota de estado:** todo esto se verificó compilando contra el `npm run tauri dev` que el usuario tenía corriendo (backend `cargo` recompila al guardar). Compila y corre. La prueba funcional de extremo a extremo (guardar + procesar) la estaba haciendo el usuario al cierre de la sesión.

---

## Contexto técnico que hay que entender primero

### El formato "limpio" de QP NO sale del Excel crudo

El Limpiador (y Codificación) esperan un formato **limpio**: metadata estándar + columnas de pregunta con el texto de la pregunta como header. Ese formato lo produce **Automatizaciones de `mega-dashboard`** a partir de la **API** de QuestionPro (`flattenResponses` en `mega-dashboard/src/lib/questionpro.ts`), con este mapeo de metadata:

| API field        | Header limpio   | columnId interno   |
|------------------|-----------------|--------------------|
| `responseID`     | `ID Respuesta`  | `META_ID_RESPUESTA`|
| `timestamp`      | `Fecha y Hora`  | `META_FECHA_HORA`  |
| `timeTaken`      | `Minutos`       | `META_MINUTOS`     |
| `responseStatus` | `Estado`        | `META_ESTADO`      |
| `ipAddress`      | `IP`            | `META_IP`          |
| `duplicate`      | `Duplicado`     | `META_DUPLICADO`   |
| `country`        | `País`          | `META_PAIS`        |

El **export crudo** (descarga directa de QP web) es otra cosa totalmente distinta:

- Los datos están en la hoja **`Datos sin procesar`** (no en la primera; la primera es "Introducción").
- La metadata tiene **otros labels y otro orden**: `ID de respuesta`, `Estado de respuesta`, `Dirección IP`, `Marca de tiempo (mm/dd/yyyy)`, `Duplicar`, `Tiempo necesario para completar (segundos)`, y `País` aparece recién en la columna ~190.
- Trae ~252 columnas `Variable personalizada N` + columnas de lógica NSE (templates Velocity tipo `#set(...)`, `$[ESTRATO_ARG]`, `$[FSTR…]`, `${custom50}`) que no sirven para el QC.
- La hoja de datos es enorme: el lector JS (`xlsx-js-style`) tira `Cannot create a string longer than 0x1fffffe8 characters` (límite de V8). **No se puede abrir con JS.**

Conclusión: subir el crudo de QP **requiere** un lector streaming (Rust/`calamine`). "Aflojar headers" por sí solo no alcanza.

---

## Cambios por punto

### Punto 1 — Codificación soporta QuestionPro

(Implementado al inicio de la sesión; referencia: `mega-dashboard/src/components/ExcelUploader.tsx`.)

- **`src/lib/codificacion/types.ts`**: se agregó `SurveyPlatform` y los campos `idColumnIndex` / `responseColumnIndex` a `ExcelUploadData`.
- **`src/lib/codificacion/excel-upload.ts`**: `parseResponsesExcel` recibe `platform`. Para QuestionPro autodetecta la columna de ID (`RESPONSE ID` / `ID RESPUESTA`) y deja que el usuario elija la columna de respuesta (devuelve un union: `{ kind: "ready" }` para Qualtrics o `{ kind: "select-column"; pending }` para QP).
- **`src/tools/codificacion/routes/NewJob.tsx`**: selector de plataforma + selector de columna de respuesta (componente `ResponseColumnSelector` con búsqueda + preview + conteo de no-vacías), espejando la UX de mega-dashboard.

### Punto 2a — Limpiador tolerante con headers

**`src/lib/cleaning/excel-parser.ts` → `parseQuestionProSheet`**

- Antes exigía las **7 columnas de metadata exactas, en orden y con grafía exacta** (rechazaba `Pais` vs `País`).
- Ahora:
  - `normalizeHeader()` saca acentos (español), pasa a minúsculas y colapsa espacios.
  - `QP_METADATA_ALIASES`: por cada metadata, lista de alias normalizados (incluye tanto labels del formato limpio como los del crudo de QP).
  - Detecta cada metadata por alias **en cualquier posición**, sin exigir las 7 ni el orden. El resto de columnas pasan a `Q1…Qn`.
  - Si no aparece `ID Respuesta`, usa la primera columna como `response_id`.

> El parser JS sigue existiendo y se usa solo de forma indirecta; el flujo real de subida del Limpiador ahora va por Rust (ver Punto 3). La lógica tolerante se **portó a Rust** también.

### Punto 3 — Lectura + inserción de Excel en Rust (`calamine`)

**Por qué:** el WebView (a) no puede abrir el crudo de QP (límite de V8) y (b) materializa todo el dataset (con copias) → ~4 GB de RAM + swap + cuelgue al guardar.

**Backend nuevo: `src-tauri/src/commands/survey_import.rs`** (dep agregada: `calamine = "0.26"` en `Cargo.toml`; `reqwest` ya estaba). Dos comandos Tauri, registrados en `src-tauri/src/lib.rs` y `src-tauri/src/commands/mod.rs`:

1. **`read_survey_schema(path, source)`**
   - Abre el archivo con `calamine`, elige la hoja (`pick_sheet`: para QuestionPro prefiere `Datos sin procesar` si existe; si no, la primera) y lee **solo headers + preview** (3 filas, 5 columnas). No materializa las filas en el WebView.
   - Replica la **detección tolerante** del Punto 2a en Rust (`normalize_header`, `qp_metadata_defs`, `build_questionpro_columns`) y el caso Qualtrics (`build_qualtrics_columns`: fila 1 = ids, fila 2 = textos).
   - Devuelve `SurveySchemaResult { schema, totalRows, preview, sheetName }`. **Importante**: las columnas del schema usan claves snake_case (`is_metadata`) para coincidir con `SchemaColumn` de TS; por eso `SchemaColumnOut` NO usa `rename_all`.

2. **`import_survey_rows({ path, source, schema, versionId, supabaseUrl, anonKey, batchSize? })`**
   - Recibe el schema (posiblemente enriquecido por QP) y usa solo `columns[].index` + `columns[].id` para mapear celda → `data[id]`.
   - Carga el rango con `calamine` en `spawn_blocking`, luego **streamea**: arma cada batch al vuelo (default 500 filas), lo inserta y lo libera, sin materializar las 10k filas. Inserta vía **PostgREST** (`POST {supabaseUrl}/rest/v1/cleaning_rows`, headers `apikey` + `Authorization: Bearer <anon>` + `Prefer: return=minimal`).
   - Emite progreso por evento Tauri **`survey-import-progress`** (`{ inserted, total }`) tras cada batch.
   - `response_id` se toma de la columna `META_ID_RESPUESTA` o cuyo id contenga `RESPONSEID`; si no, queda `null`.
   - Conversión de celdas: enteros como número (evita `5.0`), fechas a su serial f64 (compat con el viejo `cellDates:false`), errores/vacíos a `null`.

**Frontend:**

- **`src/lib/tauri.ts`**: wrappers `readSurveySchema`, `importSurveyRows`, tipo `SurveySchemaResult`, `ImportSurveyRowsParams`, `SurveyImportProgressPayload` y la const `SURVEY_IMPORT_PROGRESS_EVENT`.
- **`src/tools/limpiador/routes/Upload.tsx`**: reescrito. Usa el **diálogo nativo** (`@tauri-apps/plugin-dialog` `open()`) para obtener la **ruta en disco** → `readSurveySchema` → (si QP) `enrichSchemaWithQuestionPro` → `createVersion` (JS, vía supabase-js) → `importSurveyRows` escuchando el progreso con `listen()`. El WebView ya no carga las filas. (Se sacó el drag&drop porque Rust necesita la ruta, no un `File`.)

> **Cambio de UX:** la pantalla de subida ahora abre el explorador nativo en lugar de arrastrar/soltar.

### Punto 2b — Las customs no se borran, pero la IA las ignora

El usuario quería conservar las customs/`Variable personalizada` (se usan "en el fondo" y en el export), pero que no encarezcan/ensucien el QC. **Decisión tomada: la IA mira solo las columnas que matchearon con la API de QP.**

**`src/lib/cleaning/cleaning-service.ts` → `selectPromptColumns(schema)`** (usado en `buildPrompt`):

- Base = columnas no-metadata (excluye `is_metadata` y `META_*`).
- Si **alguna** columna tiene `qp_question_id` (señal de proyecto QP enriquecido) → la IA mira **solo** las que tienen `qp_question_id`. Esto descarta customs/templates del prompt (nunca matchean) **sin borrarlas** de `cleaning_rows.data`.
- Si **ninguna** tiene `qp_question_id` (Qualtrics, o QP sin matches) → comportamiento previo: todas las no-metadata.

Detección por schema (sin necesitar el `source`): `qp_question_id` lo setea **solo** el enrich de la API de QP (`matchExcelColumnsToQuestionpro`); el Validador (`cuestionario-bridge.ts`) solo agrega `qp_question_type`/`qp_options`, así que Qualtrics nunca activa el modo matched-only.

Se verificó que los otros consumidores del schema **ya ignoraban** las customs:
- `pre-ai-checks.ts` (`isConfidentOpenEndedColumn`) exige `qp_question_type` long-form.
- `similarity-detector.ts` (`isOpenColumn`) exige tipo abierto o palabras de pregunta abierta en el header.

> **Tradeoff aceptado:** si una pregunta real de QP no matcheó automáticamente, queda fuera del QC hasta que se la mapee a mano en la pantalla de subida (la UI ya lo permite y la incluye al setear `qp_question_id`).

---

## Notas de RAM (diagnóstico observado)

- Al **seleccionar** el archivo, el proceso Rust (`mega-tools.exe`) subió a ~1450 MB y **no bajó** tras mostrar la preview. Eso **no es leak**: es el allocator reteniendo páginas liberadas para reusarlas (se reusan en la operación siguiente).
- Al **guardar**, picó a ~3000 MB y bajó a ~1700 MB. Funcionó. (Esto fue **antes** del cambio a streaming; el streaming saca el `Vec` con todas las filas y deja el pico en "rango de calamine + 1 batch").
- **Límite real:** `calamine` carga la hoja entera en memoria (no expone lectura por fila), así que la RAM no queda 100% plana; el rango completo es el piso inevitable. Si en el futuro hace falta menos, habría que un parser xlsx con streaming por fila real.

---

## Archivos tocados

**Backend (Rust)**
- `src-tauri/Cargo.toml` — `calamine = "0.26"`.
- `src-tauri/src/commands/survey_import.rs` — **nuevo**.
- `src-tauri/src/commands/mod.rs` — `pub mod survey_import;`.
- `src-tauri/src/lib.rs` — registra `read_survey_schema` + `import_survey_rows`.

**Frontend (TS/React)**
- `src/lib/tauri.ts` — wrappers + tipos + event const.
- `src/tools/limpiador/routes/Upload.tsx` — reescrito (dialog → path → Rust + progreso).
- `src/lib/cleaning/excel-parser.ts` — `parseQuestionProSheet` tolerante (Punto 2a).
- `src/lib/cleaning/cleaning-service.ts` — `selectPromptColumns` (Punto 2b).
- `src/lib/codificacion/types.ts`, `src/lib/codificacion/excel-upload.ts`, `src/tools/codificacion/routes/NewJob.tsx` — Punto 1.

---

## Pendientes / ideas para retomar

- **Probar end-to-end**: guardar (mirar pico de RAM con streaming) + procesar (rápido y flags solo sobre preguntas reales).
- **Filtrado de columnas del crudo QP**: se decidió **no** borrar columnas del archivo por ahora (el usuario probaba sin filtrar). Si molesta el ruido en el preview/match, la opción más limpia era quedarse con metadata + columnas que matchean la API.
- **`read_survey_schema` y `import_survey_rows` abren el archivo dos veces** (una en preview, otra en import). Es simple y funciona; si el doble parse del crudo gigante molesta, se podría cachear.
- Las 4 archivos de versión (`tauri.conf.json`, `Cargo.toml`, `package.json`, `App.tsx`) **no** se tocaron: no se cortó release en esta sesión.
