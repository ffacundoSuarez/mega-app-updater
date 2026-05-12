# Limpiador — Sync a QuestionPro (5.C) + ideas de rediseño del Review + notas de IA

## Context

El Limpiador hoy cubre el flow end-to-end: crear proyecto → subir Excel → reglas → ejecutar QC → revisar flags (con edición inline) → exportar XLSX limpio. Las migraciones de paso 4 (flags enriquecidos) y 5.A (`cleaning_row_edits`) ya están aplicadas; las ediciones se mergean en `getCleanedRows`. Falta lo siguiente y por eso este plan:

1. **Paso 5.C — Sync a QuestionPro**: hoy las decisiones (`remove`) y las ediciones del review quedan locales. El XLSX limpio refleja todo, pero la encuesta en QP sigue intacta. Hay que cerrar ese loop.
2. **Rediseño UI/UX del Review**: el flujo funciona pero el usuario reporta que la pantalla de revisión no es cómoda. Quiere algo más dinámico y distinto. **Propuesta de varias ideas para evaluar otro día — sin compromiso ni implementación ahora**.
3. **IA del QC**: tras los ajustes de prompt de la sesión anterior, responde técnicamente bien pero "habla siempre de lo mismo o de cosas extrañas". Funciona, pero hay que seguir trabajando — notas para la próxima iteración, no cambios en este plan.

Este documento estructura las tres áreas: **5.C es ejecutable ya** (el usuario aprobó el alcance); **el rediseño es un menú** con recomendación destacada para discutir; **las notas de IA** documentan trabajo pendiente.

---

## Estado actual relevante (verificado)

- **Migraciones presentes**: `docs/migrations/2026-05-paso4-flags-enriched.sql` y `docs/migrations/2026-05-paso5a-row-edits.sql`. Verificar que estén aplicadas en el Supabase corporativo antes de probar 5.C (la del 5.A está como untracked en el repo — ver `git status`).
- **Settings**: `questionpro.api_key` ya integrada en `src/lib/settings.ts` y la card en `src/tools/settings/SettingsView.tsx`.
- `**src/lib/questionpro.ts`**: tiene `validateSurvey`, `getSurveyQuestions`, `matchExcelColumnsToQuestionpro`. **No tiene** `getResponse`, `deleteResponse`, `createResponse` — hay que agregarlos.
- `**src/lib/cleaning/row-edits-repository.ts`**: `upsertRowEdit/revertRowEdit/getVersionEdits/getCleanedRows/countEditedRows` listos. Campos `synced_to_qp` y `synced_at` reservados, sin uso todavía.
- `**src/lib/cleaning/flags-repository.ts**`: list/count/decide single y bulk + reset.
- `**Review.tsx**`: friendly_explanation, recommendation badge, affected questions con edit inline, similar_response_ids collapsable, FullRowGrid expandible, 3 filtros, bulk decisions. Mucho ya construido.
- `**Export.tsx**`: XLSX 2 hojas con edits ya mergeados; sin sync a QP.
- `**ProjectDetail.tsx**`: "Ejecutar/Reanudar QC" con progress live + cancel.

---

## Sección A — Plan ejecutable: Paso 5.C (Sync a QuestionPro)

### Modelo mental aprobado

Un único botón **"Sincronizar con QuestionPro"** al final del review. El usuario hace todo el laburo de revisar (marcar remove, editar celdas) y al cerrar la revisión, un solo click propaga todo a QP en batch:

- Cada fila con `user_decision = 'remove'` → `DELETE /surveys/{id}/responses/{response_id}`.
- Cada fila con edits y `synced_to_qp = false` → `GET response → mergear edits → DELETE → POST` preservando metadata (timestamp, IP, duplicate, etc.).
- Una fila con remove **+** edits gana el remove (no tiene sentido editar y borrar — sólo borrar).

### A.1 — Tipos y funciones HTTP en `src/lib/questionpro.ts`

Agregar al archivo existente (mismo patrón que `validateSurvey`):

```ts
export interface QPFullResponse {
  responseID: number;
  surveyID: number;
  timestamp: string;
  ipAddress: string;
  location?: { country?: string; region?: string; city?: string };
  duplicate: boolean;
  timeTaken: number;
  responseStatus: "Completed" | "Started" | "Terminated";
  customVariables?: Record<string, string>;
  languageID?: number;
  operatingSystem?: string;
  osDeviceType?: string;
  browser?: string;
  responseSet: Array<{ questionID: number; answerValues: unknown[] }>;
}

export type QPResponsePayload = Omit<QPFullResponse, "responseID" | "surveyID">;

export async function getResponse(surveyId, responseId, apiKey): Promise<QPFullResponse>
export async function deleteResponse(surveyId, responseId, apiKey): Promise<void>
export async function createResponse(surveyId, payload, apiKey): Promise<{ responseID: number }>
```

Mismo error handling que `validateSurvey` (401/403/404 con mensaje claro). Validar contra la doc de [QP Create Response](https://www.questionpro.com/api/create-response.html) — confirmar shape exacto al implementar (puede haber drift menor).

### A.2 — Nuevo módulo `src/lib/cleaning/sync-to-questionpro.ts`

Orquestador. Una sola función pública:

```ts
export interface SyncToQPResult {
  removed: { ok: number; failed: Array<{ rowId: string; reason: string }> };
  edited:  { ok: number; failed: Array<{ rowId: string; reason: string }> };
  // ok = total de operaciones exitosas
  // failed = operaciones que tiraron error pero el resto siguió
}

export interface SyncToQPProgress {
  phase: "deleting" | "editing";
  processed: number;
  total: number;
  lastRowId?: string;
}

export async function syncReviewToQP(
  versionId: string,
  onProgress?: (e: SyncToQPProgress) => void
): Promise<SyncToQPResult>
```

Lógica interna:

1. Leer `cleaning_versions` + `cleaning_projects` para obtener `qp_survey_id`. Si `source !== 'questionpro'` o no hay `qp_survey_id` → tirar error.
2. Leer `getQuestionproApiKey()` de settings. Si vacía → `MissingQuestionproKeyError`.
3. **Fase deletes** (recorre flags con `user_decision='remove'` y `cleaning_rows.response_id`):
  - Por cada fila: `deleteResponse(surveyId, response_id, apiKey)`.
  - Marcar localmente algo como `qp_deleted=true` — alternativa: agregar un campo nuevo `removed_from_qp_at` en `cleaning_flags` (migración chiquita) o derivarlo desde un contador. **Decisión simple**: nueva columna `removed_from_qp_at TIMESTAMPTZ` en `cleaning_flags` (única migración nueva del 5.C).
4. **Fase edits** (recorre filas con edits + `synced_to_qp=false`, ignora las que ya se borraron en fase 1):
  - `getResponse(surveyId, response_id, apiKey)`.
  - Mergear edits sobre `responseSet` (mapear `column_id` ↔ `qp_question_id` vía el `version.schema`).
  - Mapeo de campos traducidos al hacer POST: `Estado` Completada→Completed, Iniciada→Started, Terminada→Terminated; `Duplicado` Sí→true, No→false (tomar de `docs/limpiador-plan.md` línea 388-390).
  - `deleteResponse` original → `createResponse` con payload mergeado → recibo `nuevoResponseID`.
  - `markRowEditsSynced(rowId, nuevoResponseID)`: actualiza `cleaning_row_edits.synced_to_qp=true, synced_at=now()` para todos los edits de esa fila + `cleaning_rows.response_id = nuevoResponseID`.
5. Robustez: si una fila falla, registrar en `failed[]` y seguir con la siguiente. No abortar todo el batch.

### A.3 — Migración mínima

`docs/migrations/2026-05-paso5c-qp-sync.sql`:

```sql
ALTER TABLE cleaning_flags
  ADD COLUMN IF NOT EXISTS removed_from_qp_at TIMESTAMPTZ;
```

Sólo eso. Los campos `synced_to_qp/synced_at` ya existen en `cleaning_row_edits`.

### A.4 — Repositorio: ajustes

`src/lib/cleaning/row-edits-repository.ts`:

- Nueva función `markRowEditsSynced(rowId, newResponseId, txClient?)` que setea `synced_to_qp=true, synced_at=now()` para todos los edits de la fila **y** actualiza `cleaning_rows.response_id`. Si el cliente Supabase no soporta tx en JS, hacer las dos updates secuenciales y aceptar el riesgo (es desktop single-user, idempotente).

`src/lib/cleaning/flags-repository.ts`:

- Nueva función `markFlagRemovedFromQP(flagId)` para setear `removed_from_qp_at`.

### A.5 — UI

`**Review.tsx`**:

- Nuevo botón en el header del review: **"Sincronizar con QuestionPro"**. Visible sólo si `project.source === 'questionpro'` y hay (a) flags con decision=remove sin `removed_from_qp_at`, **o** (b) edits con `synced_to_qp=false`. Si no hay nada que sincronizar, queda deshabilitado con tooltip "No hay cambios pendientes".
- Click → modal de confirmación con preview:
  > Vas a aplicar a QuestionPro:
  > • Eliminar **3** respuestas marcadas para remover.
  > • Re-crear **5** respuestas con tus ediciones (esto cambia su `responseID` en QP — el resto de metadata se preserva).
- Al confirmar → barra de progreso live (con `onProgress`). Mientras corre, deshabilita el resto de la UI del review.
- Resultado → toast con `removed.ok + edited.ok` exitosas y, si hubo fallos, panel expandible con la lista de errores por rowId.
- Badge sutil al lado de cada flag o fila ya sincronizada (icono de nube + check) — opcional, lift bajo.

`**Export.tsx`**:

- Banner pasivo (no bloqueante) si `project.source === 'questionpro'` y hay edits/removes sin sincronizar:
  > Tenés N cambios que sólo se aplicaron al XLSX. Para impactarlos también en QuestionPro, sincronizá desde la pantalla de Revisión.
- Link al review.

### A.6 — Verificación de 5.C

1. Crear proyecto QP de test con 3-5 respuestas reales en una encuesta sandbox.
2. Bajar el Excel, subir, ejecutar QC.
3. En el review: marcar 1 fila remove + editar 1 celda en otra fila + dejar 1 fila intacta.
4. Click "Sincronizar con QuestionPro" → confirmar el modal.
5. Verificar en QP:
  - La fila marcada remove **no** aparece.
  - La fila editada **no** aparece con su `responseID` original; aparece una nueva con el valor editado y mismo `timestamp/ipAddress/duplicate/timeTaken`.
  - La fila intacta sigue como estaba.
6. Verificar en DB:
  - El flag de la fila eliminada tiene `removed_from_qp_at` no-null.
  - Los edits de la fila editada tienen `synced_to_qp=true, synced_at=...`.
  - `cleaning_rows.response_id` de esa fila se actualizó al nuevo `responseID` que devolvió QP.
7. Probar happy-failure: apagar internet → "Sincronizar" → error claro, sin estado corrupto en DB.
8. Probar key inválida → mensaje "API key de QuestionPro inválida o sin permisos para esta encuesta".

### A.7 — Lo que NO va en 5.C

- No re-correr QC sobre las respuestas re-creadas: el `cleaning_flags` original sigue válido como auditoría de la decisión humana. Si el usuario quiere QC sobre lo nuevo, baja Excel de nuevo.
- No bloqueo blando "esta fila ya se sincronizó, no la edites" — overengineering. El usuario puede re-sincronizar; la idempotencia del re-DELETE+POST está cubierta por el flag `synced_to_qp`.
- No retry automático en fallos. Si hay errores, el usuario reintenta el botón — la lógica vuelve a empezar desde lo no sincronizado.

### Archivos críticos (5.C)

- `src/lib/questionpro.ts` — agregar tipos + 3 funciones HTTP.
- `src/lib/cleaning/sync-to-questionpro.ts` — NUEVO. Orquestador.
- `src/lib/cleaning/row-edits-repository.ts` — agregar `markRowEditsSynced`.
- `src/lib/cleaning/flags-repository.ts` — agregar `markFlagRemovedFromQP` y filtro "remove sin sincronizar".
- `src/tools/limpiador/routes/Review.tsx` — botón header + modal de preview + progreso + toast de resultado.
- `src/tools/limpiador/routes/Export.tsx` — banner pasivo si hay cambios sin sincronizar.
- `docs/migrations/2026-05-paso5c-qp-sync.sql` — NUEVO. Una sola línea (`removed_from_qp_at`).
- `docs/LIMPIADOR_QC_CONTRACT.md` — actualizar con la sección 5.C (escrituras nuevas).

---

## Sección B — Menú abierto de ideas UI/UX para el rediseño del Review (revisión otro día)

> El usuario revisa estas ideas otro día. **No implementar nada de B en esta iteración.** Son input para discutir.

El review ya tiene mucho (filtros, friendly_explanation, edit inline, bulk, FullRowGrid). El problema es que es **estático y monolítico** — todo en una página, sin jerarquía visual fuerte, sin atajos, sin alternativas de vista.

### Idea 1 — Layout split-pane tipo "Inbox"

**Cambio**: lista compacta de flags a la izquierda (1 línea por flag: severidad + pregunta + respondente), panel de detalle a la derecha que cambia al click. Estilo Outlook/Linear/Gmail.
**Beneficio**: pasás 10× más rápido entre flags. Decidís sin scroll. Selección múltiple persiste mientras navegás.
**Costo**: refactor mediano de Review.tsx (separar `FlagListItem` compacto + `FlagDetailPanel`). La lógica actual se conserva.

### Idea 2 — Severidad por color con score acumulado (de qc-survey-app)

**Cambio**: cada flag tiene un color (verde/amarillo/naranja/rojo) por `scoreToRuleColor(confidence × peso_recomendación)`. La lista se ordena por severidad. El stats card pasa a tabs por color.
**Beneficio**: jerarquía visual al toque — "primero los rojos, después amarillos". No hay que pensar.
**Costo**: utility `scoreToRuleColor` + refactor de StatsCard. Sin cambios de DB.

### Idea 3 — Vista "Por respondente" (toggle)

**Cambio**: switch arriba que cambia entre **Por flag** (actual) y **Por respondente** (tabla con filas = respondentes, columnas = nivel_máximo, count de flags, columnas afectadas, decisión global). Click en respondente → expande con sus flags.
**Beneficio**: cuando un respondente tiene 5 flags, hoy decidís uno por uno. La vista por respondente te deja decidir "este respondente entero out" en un click.  
**Costo**: medio. Nueva agregación en `flags-repository.ts` (`groupFlagsByRespondent`). Render nuevo de tabla.

### Idea 4 — Filtros como chips removibles

**Cambio**: los 3 dropdowns actuales (tipo/decisión/recomendación) pasan a chips encima de la lista, estilo Notion/GitHub: `🔴 red ×  ⏳ pendiente ×  + Agregar filtro`. Removibles individuales. Botón "+" abre menú con todos los filtros disponibles, incluyendo nuevos: por respondente, por pregunta afectada, por confianza, por fecha.
**Beneficio**: visible qué filtros hay aplicados. Removible al toque. Cabe expandir filtros sin saturar la barra.
**Costo**: bajo. Lógica de filtrado ya existe; sólo cambia el control.

### Idea 5 — Drawer de comparación al editar

**Cambio**: al editar una celda, en vez del input que reemplaza el valor, abre un Sheet a la derecha con: valor original (gris), valor nuevo (editable), y si hay similar_response_ids → preview de las respuestas similares también editadas (para mantener coherencia entre ediciones).
**Beneficio**: editás con contexto, no a ciegas. También sirve para ver "qué cambió" después.
**Costo**: bajo-medio. Componente nuevo `EditDrawer`, reutiliza Sheet de shadcn.

### Idea 6 — Paleta de comandos (Cmd+K)

**Cambio**: Cmd+K abre un input que ofrece "ir al flag #N", "decidir keep/remove sobre la selección", "filtrar por pregunta X", "saltar al siguiente flag pendiente".
**Beneficio**: power-user de un dataset largo decide en segundos.
**Costo**: medio. Implementar con `cmdk` (shadcn). Vale la pena si los datasets crecen.

### Idea 7 — Heatmap de columnas problemáticas

**Cambio**: arriba del review, una barrita por columna mostrando cuántos flags tiene cada pregunta. Click una columna → filtra el listado a esa pregunta.
**Beneficio**: ves de un vistazo qué pregunta concentra el ruido (ej: una abierta mal redactada). Habilita decisiones macro.
**Costo**: bajo. Una barra HTML/CSS sobre `groupBy(flags, affected_question_id)`.

### Idea 8 — Stats card narrativo

**Cambio**: el panel actual (8 números en grilla 4×2) pasa a un párrafo + barra:

> Detectamos **23 problemas** en **187 respuestas** (12%). Recomendamos eliminar **8** (4%) y revisar **15** (8%). Llevás **6 / 23 decisiones** tomadas.

Click en cualquier número → filtra. Barra de progreso de decisiones.
**Beneficio**: información narrativa, comprensible al toque. Menos parking lot de números.
**Costo**: bajo. Refactor del componente, lógica igual.

### Idea 9 — Inspector de respuesta similar inline

**Cambio**: en lugar de mostrar `response_id`s en `similar_response_ids`, mostrar el snippet real (de `cleaning_rows.data` para la columna afectada). Click → modal con la respuesta entera.
**Beneficio**: hoy los IDs son inutilizables sin saber qué dice cada uno. Mostrar el texto crudo permite entender el cluster.
**Costo**: bajo. Lookup en `cleaning_rows` ya disponible.

### Idea 10 — Kanban de decisiones

**Cambio**: vista alternativa con 3 columnas (Pendientes / A mantener / A eliminar) y drag-drop entre ellas. Cada flag es una card.
**Beneficio**: muy visual e intuitivo para datasets chicos.
**Costo**: medio-alto. Lib de drag-drop (`dnd-kit`). Probablemente no escala con muchos flags. Mencionable como concepto, no recomendado.

---

### **Recomendación destacada (apostaría a estas 3)**

Si hay que elegir, las que combinan mayor impacto percibido con menor riesgo y compatibilidad entre sí:

1. **Idea 1 — Split-pane (Inbox)**.
2. **Idea 2 — Severidad por color**.
3. **Idea 4 — Chips de filtros**.

Las tres son refactors acotados que no tocan DB, no rompen lógica existente y visualmente transforman la pantalla. Si después suma capacidad: **Idea 5 (drawer de edición)**, **Idea 7 (heatmap)** y **Idea 8 (stats narrativo)** son refinamientos baratos para una segunda iteración. La **Idea 3 (vista por respondente)** vale la pena pero implica más laburo y, según volumen de flags por respondente típico, podría no justificarse.

### Patrones de qc-survey-app que **no** valen para esta iteración

(Evaluados según el contexto desktop single-user con datasets chicos.)


| Patrón                                                 | Por qué no                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `usage_events` + tracking de adopción                  | Single-user, no aporta.                                                                          |
| `sharing_mode`                                         | No hay colaboración entre operadores.                                                            |
| Modelo question-centric (`project_question_rules`)     | Cambio de schema enorme; reglas globales funcionan bien con datasets chicos.                     |
| Tabla `cleaning_rule_overrides` con `instruccion_hash` | Útil si las reglas se regeneran solas; en este flujo son mostly manuales.                        |
| Schema rico con `FlowRule` + `Section`                 | Requiere descargar más data de la API QP. Útil sólo si se integra con módulo Validador post-MVP. |
| Match IA como fallback determinístico                  | El match por texto normalizado cubre 90%+. Overengineering.                                      |
| Prompt caching                                         | gpt-4o-mini ya es barato; vale con volúmenes mucho mayores.                                      |


### Patrones de qc-survey-app que vale la pena considerar **más adelante** (no ahora)

- **Capa pre-IA determinística** (portar `field-checks.ts`): validaciones puras (IPs duplicadas, straight-lining, abierta-corta, "otros especificar" que matchea opción) antes de mandar a OpenAI. Reduce 60-80% de costo y agrega base sólida. Se discute en la Sección C porque está más cerca de "mejorar la IA" que de UI.
- **Schema rico `cleaning_case_results`** (`nivel_maximo`, `eliminado_de_base`, `row_snapshot`): habilita la vista por respondente (Idea 3) con datos enriquecidos. Requiere migración. Tiene sentido si se adopta la Idea 3.
- **Tipos canónicos `ProjectRuleTipo`**: refactor de tipos rico. Habilita reglas por tipo de pregunta y mejora la UI de reglas — pero es un refactor que toca mucho.
- **SSE para progreso del QC**: hoy la progress bar funciona vía in-process callback. SSE aplicaría si en algún momento el motor pasa al lado de un servicio. No urgente.

---

## Sección C — IA del QC: hay que seguir trabajando (notas, no cambios este plan)

Después de los ajustes de prompt de la sesión anterior (filtrar metadata, schema enriquecido con `qp_options`, español, `temperature: 0`, `seed: 42`), el motor responde técnicamente bien. Pero el usuario reporta dos patologías:

1. **"Habla siempre de lo mismo"** — los `reason` se repiten flag tras flag. Sospecha: el modelo se ancla en un patrón de razonamiento fácil ("respuesta corta", "no hay nombre") y no explora otros ángulos. Es bias del prompt + falta de diversidad de reglas.
2. **"Habla de cosas extrañas"** — alucinación residual. Temperature 0 + filtro de nulls reducen pero no eliminan.

Funciona — el usuario aclaró que **parece** que funciona. La calidad es aceptable para producción pero no fina. **No es bloqueante para 5.C ni para el rediseño UI.**

### Direcciones para próxima sesión (en orden de retorno esperado)

1. **Capa pre-IA determinística** (alto impacto). Portar `field-checks.ts` de qc-survey-app: IP duplicates, straight-lining, longitud/repetición en abiertas, "otros especificar" que matchea opción codificada. La IA recibe sólo lo que las reglas determinísticas no agarraron. Reduce ruido del prompt + costo + mejora consistencia. Es la pieza que más probablemente arregla el "habla siempre de lo mismo": le saca al modelo lo trivial.
2. **Logging de prompts en modo debug** (alto impacto, lift bajo). Opción `debugPromptLogger?: (prompt, response) => void` en `AnalyzeOptions`. Sin esto, mejorar el prompt es a ciegas. Mencionado como punto 6 deferido en la sesión anterior.
3. **Few-shot examples en el prompt** (impacto medio). Hoy es zero-shot. Pasar 3-5 ejemplos buenos de cada tipo de flag sube la calidad y baja la "rareza" sin tocar arquitectura.
4. **Reason templates por tipo de regla** (impacto medio). Pedir el `reason` en formato estructurado ("La respuesta a la pregunta X presenta el problema Y porque Z") en lugar de texto libre. Reduce variabilidad y "cosas extrañas".
5. **Modelo más fuerte como segunda pasada** (impacto medio, costo medio). gpt-4o-full sobre los flags red de baja confianza. Mantener gpt-4o-mini para el batch general.
6. **Framework A/B casero** (impacto largo plazo). Guardar dos runs sobre la misma versión con prompts distintos y comparar contadores red/yellow + casos puntuales. Permite mejorar el prompt empíricamente.

**No son cambios de este plan.** Son guías para la próxima iteración cuando el usuario decida volver a tocar el motor de IA.

---

## Funciones existentes a reusar (5.C)

- `getQuestionproApiKey()` y `getLimpiadorConnectionSettings()` en `src/lib/settings.ts` — para leer la API key de QP.
- `validateSurvey` en `src/lib/questionpro.ts:85` — patrón de error handling a copiar.
- `getVersionEdits` en `src/lib/cleaning/row-edits-repository.ts:105` — devuelve los edits indexados por rowId; útil para la fase de sync.
- `listFlags` en `src/lib/cleaning/flags-repository.ts:34` — filtrar por `userDecision='remove'` ya está soportado.
- Schema `version.schema.columns[].qp_question_id` — necesario para mapear `column_id` ↔ `questionID` al hacer POST.

## Lo que NO se toca (5.C)

- Motor de QC (`cleaning-service.ts`, `cleaning-job.ts`, `similarity-detector.ts`). Las notas de IA son guía, no cambios.
- Parser de Excel.
- Reglas y sugerencias.
- Pantalla de Settings (la card de QP ya existe).
- Auto-updater, capabilities Tauri.
- Vista del Toolbar y router.

## Verificación end-to-end (recap)

1. Migración nueva aplicada: `\d cleaning_flags` muestra `removed_from_qp_at`.
2. Migración 5.A aplicada: `\d cleaning_row_edits` existe (verificar antes — está untracked en el repo).
3. Test manual contra encuesta QP sandbox: 1 remove + 1 edit + 1 intacta → click sincronizar → verificar QP + DB (ver A.6).
4. Test de fallos: red caída → mensaje claro, sin estado corrupto.
5. Test de re-sync: correr sincronizar de nuevo después del primero → debería decir "no hay cambios pendientes" (botón deshabilitado o toast explicativo).
6. Banner de Export aparece sólo si quedan cambios sin sincronizar; desaparece después del sync.

