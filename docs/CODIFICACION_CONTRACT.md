# Contrato Codificación (desktop)

Herramienta **Codificación** en Mega App: clasificación de respuestas abiertas con libro de códigos e IA. Reutiliza el esquema Supabase del dashboard (`mega-dashboard`); el worker Lightsail **no** se ejecuta en servidor — la lógica corre en el renderer (TypeScript + `fetch` a OpenAI), igual que el Limpiador.

## Configuración

| Clave (Ajustes) | Uso |
|-----------------|-----|
| `supabaseUrl` | Proyecto Supabase corporativo |
| `supabaseAnonKey` | Lectura/escritura (RLS permisivo) |
| `openaiApiKey` | Entrenamiento de muestras y clasificación masiva |

Sin estas tres claves la vista muestra aviso y no renderiza el flujo.

## Tablas Supabase

| Tabla | Rol |
|-------|-----|
| `projects` | Agrupa encuestas/codificaciones |
| `jobs` | Una pregunta + metadata de corrida |
| `categories` | Libro de códigos por job |
| `responses` | Filas del Excel (ID + texto) |
| `sample_classifications` | Muestras de entrenamiento (few-shot) |
| `classifications` | Resultado por respuesta |

Códigos especiales: **998** (no responde), **999** (otro). En UI/export se muestran como **98** y **99** (`category-display.ts`).

## Flujo de pantallas

1. **Lista** — estilo dashboard: encabezado + selector de proyecto + "Crear Proyecto"; 4 tarjetas de stats (Total / Completadas / Pendientes / Necesitan Entrenamiento); búsqueda + filtro de estados + "Crear Encuesta". Cada fila: badge de estado inline + metadata (proyecto · archivo · fecha · respuestas) + botón primario según estado (Entrenar Muestras / Ejecutar·Continuar / Cancelar / Descargar) + Análisis (si `processed_responses>0`) + "Ver detalles" + menú ⋮ con **Eliminar encuesta** (diálogo de confirmación, no `window.confirm`).
2. **Nuevo proyecto** — `projects` insert.
3. **Nueva codificación** — wizard de 3 pasos con stepper (Datos y Excel / Libro de Códigos / Configurar y Crear) → `jobs`, `categories`, `responses`.
4. **Entrenamiento** — wizard de una muestra por vez: ~15 muestras, preclasificación OpenAI con sugerencia + confianza, navegación por pills, "Aceptar sugerencia", estado "Entrenamiento Completado" (+ opción "Cargar 15 muestras más") → `sample_classifications`, `jobs.sample_training_completed = true`.
5. **Editar encuesta** ("Ver detalles") — `EditJob.tsx`: edita pregunta/descripción (`updateJob`) y reemplaza el libro de códigos (`replaceCategories` = delete + insert). Muestra aviso de integridad si `processed_responses>0` (cambiar categorías puede dejar inconsistentes Análisis/export hasta recodificar). No toca `classifications`.
6. **Worker local** — `runClassificationJob()` en `classification-job.ts`: chunks 500, batches 10, delay 1s, modelo `gpt-5-mini`, reanudación por `processed_responses` / `getMaxClassifiedRow`. El controlador se hostea en `CodificacionView` para sobrevivir la navegación dentro de la herramienta; salir a otra herramienta cancela la corrida.
7. **Análisis** — conteos por categoría, drill-down, edición de `category_ids`, export Excel.

## Notificaciones

Al terminar una corrida, `CodificacionView` muestra un **toast** (`sonner`) y registra un evento en el centro de notificaciones (`logActivity`, tipos `codificacion_done` / `codificacion_error`; `startRunningJob`/`endRunningJob` para la tarea en curso). Ya no se usan `window.alert`.

## Estados de `jobs.status`

- `pending` — creado, sin correr o listo para continuar
- `processing` — corrida en curso
- `completed` — todas las filas procesadas
- `error` — fallo o cancelación (mensaje en `error_message`)

## Cancelación

`ClassificationJobController.cancel()` marca cancelación entre batches (no corta un batch OpenAI en vuelo). El job queda en `error` con mensaje de cancelación si aplica.

## Exportación

- **Por job:** `exportJobResults(jobId)` — hoja Resultados + Información.
- **Por proyecto:** `exportAllProjectResults(projectId)` — solo jobs `completed`, formato matriz multi-pregunta.

En Tauri, `XLSX.writeFile` dispara guardado/descarga según el entorno del WebView.

## Archivos principales

| Ruta | Responsabilidad |
|------|-----------------|
| `src/tools/codificacion/CodificacionView.tsx` | State machine de pantallas + hostea la corrida del job + toast/notificaciones |
| `src/lib/codificacion/*` | Repos, motor IA, job, export |
| `src/tools/codificacion/routes/*` | UI por paso (`JobList`, `NewProject`, `NewJob`, `SampleTraining`, `EditJob`, `AnalysisSummary`, `CategoryDetail`) |

## Fuera de alcance (MVP)

- Endpoint `/parse-spss` y importación `.sav`
- Servidor Express Lightsail como dependencia runtime
- Auth por usuario (jobs con `user_id` null en desktop)
- Corrida del job en background entre herramientas (salir de Codificación cancela la corrida; requeriría un gestor de jobs global a nivel `App`)

## Referencia legacy

Lógica portada desde `incoming/LIGHTSAIL--serv-aws/app/classification-service/` (gitignored en este repo). UI inspirada en `mega-dashboard` → `codificacion/`.
