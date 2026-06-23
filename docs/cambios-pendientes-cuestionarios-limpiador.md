# Cambios pendientes — Cuestionarios y Limpiador

> Documento de trabajo. Recopila los cambios pedidos para las herramientas
> **Cuestionarios** y **Limpiador**, con el análisis del código actual y las
> decisiones tomadas hasta ahora.
>
> **Estado:** PARCIAL. Batch de parseo/validación implementado (2026-06-17).
> Re-verificado contra el código el 2026-06-23: todo lo marcado ✅ sigue en el
> código y nada nuevo se implementó desde entonces. Faltan todavía:
> - ⏳ Los **ejemplos de sugerencias "tontas"** que el usuario va a pasar para
>   diagnosticar el check de sugerencias (`checkAmbiguousInstructions` en
>   `ai-checks.ts` es el único que emite `sugerencia`).
> - ⏳ La **lista de cambios de Limpiador** + ideas adicionales.
>
> Última actualización: 2026-06-23 (verificación contra código; sin cambios de estado).

---

## Herramienta: Cuestionarios (QuestionPro)

Archivos clave:
- Vista/flujo: `src/tools/cuestionario/CuestionarioView.tsx`, `routes/*`
- Lógica: `src/lib/cuestionario/` (`parser.ts`, `docx-extract.ts`, `checks.ts`,
  `ai-checks.ts`, `validation-job.ts`, `qp-publish.ts`, `questionnaire-repository.ts`, `types.ts`)
- Reporte/UI de issues: `src/tools/cuestionario/routes/ValidationReport.tsx`

### 1. Porcentaje al parsear con IA — ⏳ DIFERIDO

**Hoy:** el parseo es **una sola llamada** a OpenAI (`gpt-5-mini`,
`response_format: json_object`) en `parser.ts`. Solo se muestra un spinner.
La barra de progreso real ya existe, pero en la **validación** (6 checks IA,
`ValidationReport.tsx` → `ProgressPanel`), no en el parseo.

**Problema:** un porcentaje "real" sobre una sola llamada LLM es difícil sin
inventarlo. Opciones:
- **Streaming** de la respuesta + parseo del JSON parcial → mostrar "N preguntas
  detectadas" en vivo. *(recomendado)*
- **Progreso por etapas** (Extrayendo texto → Enviando a IA → Estructurando →
  Validando) con indeterminado animado. Lo más barato y honesto.
- **Chunking** del documento por bloques → porcentaje real, pero mucho más
  trabajo y riesgo de partir preguntas.

**Pendiente:** elegir enfoque (preliminar: streaming + contador de preguntas, o
etapas si se quiere algo rápido).

### 2. La matriz no toma las columnas — ✅ RESUELTO (2026-06-17)

**Confirmado (bug de prompt).** El modelo SÍ soporta matriz:
filas = `enunciados[]`, columnas = `opciones[]` (`types.ts`). El prompt de
parseo no instruía explícitamente que las columnas van en `opciones`.

**Fix aplicado:** prompt-engineering en `parser.ts` — regla explícita
(filas→`enunciados`, columnas→`opciones`) + ejemplo de matriz (P8).

### 2b. Escalas marcadas en error "no tiene opciones" — ✅ RESUELTO (2026-06-17)

**Causa:** `checks.ts` incluía `escala` en `isOptionedType()`, exigiendo
`opciones[]` aunque el modelo canónico usa `min`/`max` (P9 "del 1 al 10").

**Fix aplicado:** `escala` fuera de `isOptionedType()`; validación acepta
`min/max` OR opciones explícitas. Alineado con `qp-publish.ts`.

### 2c. Condiciones en lenguaje natural (`contains`) — ✅ RESUELTO (2026-06-17)

**Causa:** la IA inventaba condiciones tipo `A1 contains…`. No se publican a QP
pero generaban falsos errores en `checkConditionReferences`.

**Fix aplicado:** prompt estricto (solo `ID=codigo` con AND/OR) +
`sanitizeCondition()` post-parse + KEYWORDS extra en `extractIdRefs`.

### 2d. Convenciones Word Mega (texto rojo, siglas, códigos) — ✅ RESUELTO (2026-06-17)

**Contexto:** los Word de operaciones usan texto en **rojo** para instrucciones
de programación (RU, RM, ROTAR, PROGRAMACIÓN, PROGRAMADOR, cuotas). Ese texto
no va al encuestado pero la IA lo necesita para inferir estructura.

**Arquitectura (dos canales):**
- `docx-extract.ts` lee `word/document.xml` con JSZip y separa runs rojos vs.
  visibles.
- `visibleText` → enunciados y opciones.
- `programmerHints` → bloque aparte en el prompt user (no se copia al JSON
  visible).

**Siglas documentadas en el prompt:**
| Sigla | Significado | Acción en JSON |
|-------|-------------|----------------|
| RU | Respuesta única | `cerrada_unica` |
| RM | Respuesta múltiple | `cerrada_multiple` |
| ROTAR | Aleatorizar frases/opciones | `aleatorizar: true` |
| RA | Respuesta abierta asociada | opción con `especificar` |
| ANCLAR | Posición fija | opción con `fijar` |
| EXCLUSIVA | Deselecciona resto | opción con `exclusiva` |

**Códigos de pregunta:** `F1.`, `P9.`, `A4.` → van en `id`, nunca al inicio de
`texto`. Post-procesado: `stripQuestionCodePrefix()`.

**Referencia de prueba:** `incoming/676 - CUEST PEP - AMP Xtreme Guatemala.docx`.

**Pegar texto:** sin color; mismas reglas en prompt + heurísticas
(`PROGRAMACIÓN:`, `PROGRAMADOR:`).

### 3. Sugerencias "tontas" — ⏳ PENDIENTE

**Diagnóstico:** de los checks IA, las **advertencias** son 5 checks
(redundancia, escalas invertidas, sesgo, tipo equivocado, opciones no-MECE) —
esos quedaron bien. Las **sugerencias** salen de **UN solo check**:
`checkAmbiguousInstructions` (instrucciones poco claras). O sea, todo lo
"sugerencia" viene de la parte más débil.

**Pendiente:** ⏳ recibir los ejemplos para decidir si conviene endurecer el
prompt, hacerlo más conservador, o reemplazarlo.

### 4. Comentarios IA exportables con selección del usuario — ⏳ DIFERIDO

**Contexto:** el equipo de operaciones hace las encuestas pero no puede
modificarlas a gusto; necesita exportar comentarios para que los revise/aplique
quien corresponda.

**Hoy ya existe casi toda la infraestructura:** la IA genera issues (`QCIssue`),
se muestran por pregunta en el reporte y se persisten enteros en Supabase
(`questionnaire_validations`). **NO existe:** marcar/desmarcar issues
individuales ni exportar (el export estaba planeado y se difirió).

**Decisión tomada:**
- **Reusar los issues existentes** (no una pasada nueva en prosa). Agregar a cada
  issue un estado **incluir/excluir** (checkbox) en el reporte.
- Botón **Exportar** que genere un **Word (.docx)** con los comentarios
  seleccionados → agregar dependencia `docx`.
- Esto además es el **cimiento del punto 6** (aprendizaje).

### 5. Preguntas obligatorias (`required: true`) — ⏳ DIFERIDO

**Hoy:** `qp-publish.ts` crea **todas** las preguntas con `required: false`
(comentario explícito: "por seguridad... así el usuario decide").

**Decisión:** cambiar el default a `required: true` para preguntas de respuesta.
Matiz: en tipos donde "obligatorio" no aplica (texto/instrucción/abierta) evaluar
caso. Dejar la puerta para overrides por pregunta más adelante.

### 6. IA que se retroalimenta de aceptación/rechazo (idea a futuro) — ⏳ DIFERIDO

"Que la IA se modifique a sí misma" en sentido literal = fine-tuning (caro y
complejo). Camino práctico (ya usado en Limpiador, que tiene few-shot):
1. Persistir cada decisión (aceptado/rechazado) **con motivo** en Supabase.
2. Usar esos casos como **few-shot dinámico** inyectado en los prompts (los
   rechazos enseñan qué NO marcar).
3. Periódicamente, un LLM analiza los rechazos y refina el system-prompt / genera
   un doc de "lecciones" que se antepone.

**Clave:** el **punto 4 (selección + persistencia) es el cimiento del punto 6**.
Si se construye bien el accept/reject ahora, el loop de aprendizaje después es
casi gratis — y sirve igual para Limpiador. Se retoma más adelante.

---

## Herramienta: Limpiador

⏳ **Pendiente.** El usuario va a pasar la lista de cambios e ideas adicionales.

---

## Decisiones registradas

| Tema | Decisión |
|------|----------|
| Modelo de "comentarios" | Reusar los issues existentes (checkbox incluir/excluir + export) |
| Formato de export | Word (`.docx`), dependencia `docx` |
| `required` por defecto | `true` para preguntas de respuesta |
| Aprendizaje IA | A futuro; depende del accept/reject del punto 4 |
| Word: texto rojo | Dos canales (`docx-extract.ts`): visible vs. programmerHints |
| Escalas numéricas | `min`/`max` sin opciones; no exigir opciones en checks |
| Condiciones | Solo `ID=codigo`; sanitizar `contains` y similares |
