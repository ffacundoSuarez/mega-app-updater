# Baseline de optimización — Mega App v1.2.1

Medición tomada el 2026-06-26 tras aplicar el plan de optimización (Tanda 0 + técnicas).

## Bundle JS (`npm run build`)

| Chunk | Tamaño | gzip |
|-------|--------|------|
| **index (shell)** | 404 kB | 126 kB |
| xlsx | 870 kB | 323 kB |
| pdfjs | 416 kB | 124 kB |
| docx | 343 kB | 99 kB |
| CuestionarioView | 301 kB | 92 kB |
| supabase | 204 kB | 53 kB |
| LimpiadorView | 158 kB | 47 kB |
| CodificacionView | 79 kB | 23 kB |
| BrandAuditView | 11 kB | 4 kB |
| HomeView | 11 kB | 4 kB |
| CSS | 91 kB | 15 kB |

**Notas:** Code splitting por herramienta activo (`React.lazy`). Chunks pesados (xlsx, pdfjs, docx, supabase) separados vía `manualChunks`.

## Instalador

_Pendiente de medir en máquina con `npm run tauri build` (requiere sidecar Python + clave de firma)._

## Tiempos operativos (manual)

| Flujo | Baseline |
|-------|----------|
| Arranque en frío | _Medir post-deploy_ |
| Job QC Limpiador | _Medir con proyecto de prueba_ |
| Brand Audit | _Medir con SAV de prueba_ |

## Cambios aplicados en este ciclo

- Paleta de marca turquesa `#00a5a3` + acentos por herramienta
- Transiciones, skeletons, virtualización Review, lazy routes
- QC: max-retries por batch, invalidación Supabase, prompt cache
- Python sidecar: timeout + cancelación
- Cargo `[profile.release]` optimizado para tamaño
- CI: solo NSIS en PRs; `bundle:python` omite pip si requirements no cambió
- Dead code: `excel-parser.ts`, `mammoth`, `greet`, `getFlagCounts`
