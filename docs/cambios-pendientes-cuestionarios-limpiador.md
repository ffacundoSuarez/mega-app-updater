# Cambios pendientes — Cuestionarios y Limpiador

> Documento de trabajo. Recopila los cambios pedidos para las herramientas
> **Cuestionarios** y **Limpiador**, con el análisis del código actual y las
> decisiones tomadas hasta ahora.
>
> **Estado:** PARCIAL. Faltan todavía:
> - ⏳ Los **ejemplos de sugerencias "tontas"** que el usuario va a pasar para
>   diagnosticar el check de sugerencias.
> - ⏳ La **lista de cambios de Limpiador** + ideas adicionales.
>
> Última actualización: 2026-06-12.

---

## Herramienta: Cuestionarios (QuestionPro)

Archivos clave:
- Vista/flujo: `src/tools/cuestionario/CuestionarioView.tsx`, `routes/*`
- Lógica: `src/lib/cuestionario/` (`parser.ts`, `checks.ts`, `ai-checks.ts`,
  `validation-job.ts`, `qp-publish.ts`, `questionnaire-repository.ts`, `types.ts`)
- Reporte/UI de issues: `src/tools/cuestionario/routes/ValidationReport.tsx`

### 1. Porcentaje al parsear con IA

**Hoy:** el parseo es **una sola llamada** a OpenAI (`gpt-5-mini`,
`response_format: json_object`) en `parser.ts`. Solo se muestra un spinner.
La barra de progreso real ya existe, pero en la **validación** (6 checks IA,
`ValidationReport.tsx` → `ProgressPanel`), no en el parseo.

**Problema:** un porcentaje "real" sobre una sola llamada LLM es difícil sin
inventarlo. Opciones:
- **Streaming** de la respuesta + parseo del JSON parcial → mostrar "N preguntas
  detectadas" en vivo (progreso real-ish). *(recomendado)*
- **Progreso por etapas** (Extrayendo texto → Enviando a IA → Estructurando →
  Validando) con indeterminado animado. Lo más barato y honesto.
- **Chunking** del documento por bloques → porcentaje real, pero mucho más
  trabajo y riesgo de partir preguntas.

**Pendiente:** elegir enfoque (preliminar: streaming + contador de preguntas, o
etapas si se quiere algo rápido).

### 2. La matriz no toma las columnas

**Confirmado (bug de prompt).** El modelo SÍ soporta matriz:
filas = `enunciados[]`, columnas = `opciones[]` (`types.ts`). Pero el prompt de
parseo (`parser.ts`, ~líneas 282-300) solo aclara bien los `enunciados` (filas)
y **no instruye explícitamente que las columnas van en `opciones`**. Resultado:
llena filas y deja columnas vacías.

**Fix:** prompt-engineering en `parser.ts` — agregar regla explícita
(filas→`enunciados`, columnas→`opciones`) + un ejemplo de matriz completo.
Bajo riesgo.

### 3. Sugerencias "tontas"

**Diagnóstico:** de los checks IA, las **advertencias** son 5 checks
(redundancia, escalas invertidas, sesgo, tipo equivocado, opciones no-MECE) —
esos quedaron bien. Las **sugerencias** salen de **UN solo check**:
`checkAmbiguousInstructions` (instrucciones poco claras). O sea, todo lo
"sugerencia" viene de la parte más débil.

**Pendiente:** ⏳ recibir los ejemplos para decidir si conviene endurecer el
prompt, hacerlo más conservador, o reemplazarlo.

### 4. Comentarios IA exportables con selección del usuario

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

### 5. Preguntas obligatorias (`required: true`)

**Hoy:** `qp-publish.ts` crea **todas** las preguntas con `required: false`
(comentario explícito: "por seguridad... así el usuario decide").

**Decisión:** cambiar el default a `required: true` para preguntas de respuesta.
Matiz: en tipos donde "obligatorio" no aplica (texto/instrucción/abierta) evaluar
caso. Dejar la puerta para overrides por pregunta más adelante.

### 6. IA que se retroalimenta de aceptación/rechazo (idea a futuro)

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
