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

1. **Lista** — proyectos, jobs, iniciar/continuar codificación, exportar, eliminar.
2. **Nuevo proyecto** — `projects` insert.
3. **Nueva codificación** — Excel respuestas + libro de códigos → `jobs`, `categories`, `responses`.
4. **Entrenamiento** — ~15 muestras, preclasificación OpenAI, corrección manual → `sample_classifications`, `jobs.sample_training_completed = true`.
5. **Worker local** — `runClassificationJob()` en `classification-job.ts`: chunks 500, batches 10, delay 1s, modelo `gpt-5-mini`, reanudación por `processed_responses` / `getMaxClassifiedRow`.
6. **Análisis** — conteos por categoría, drill-down, edición de `category_ids`, export Excel.

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
| `src/tools/codificacion/CodificacionView.tsx` | State machine de pantallas |
| `src/lib/codificacion/*` | Repos, motor IA, job, export |
| `src/tools/codificacion/routes/*` | UI por paso |

## Fuera de alcance (MVP)

- Endpoint `/parse-spss` y importación `.sav`
- Servidor Express Lightsail como dependencia runtime
- Auth por usuario (jobs con `user_id` null en desktop)

## Referencia legacy

Lógica portada desde `incoming/LIGHTSAIL--serv-aws/app/classification-service/` (gitignored en este repo). UI inspirada en `mega-dashboard` → `codificacion/`.
