# Plan de Proyecto: Mega App Updater

> Aplicación de escritorio auto-actualizable para herramientas internas de la empresa.
> Distribución sin instalación de Python por parte del usuario final.

---

## 1. Visión General

Construir una aplicación nativa de Windows que:

- Agrupe múltiples herramientas internas bajo una misma UI (toolbar).
- Permita al equipo de desarrollo publicar nuevas herramientas y actualizaciones
  sin que el usuario final tenga que hacer nada manual.
- No requiera que los usuarios tengan Python, Node, ni ningún runtime instalado.
- Pueda ejecutar scripts Python existentes (ej. Excel → PowerPoint) internamente.

**Usuario objetivo**: <50 empleados internos, perfil no técnico.

---

## 2. Stack Tecnológico

| Capa | Tecnología | Justificación |
|---|---|---|
| Shell de la app | **Tauri 2** (Rust) | Binarios chicos (~10 MB base), updater oficial, menos falsos positivos de antivirus que PyInstaller |
| Frontend | **React 18 + TypeScript** | Stack conocido por el equipo |
| Bundler | **Vite** | Estándar de Tauri. Next.js no aporta nada en una app de escritorio |
| UI components | **shadcn/ui + Tailwind CSS** | Rápido de iterar, moderno, totalmente customizable |
| Runtime Python | **python-build-standalone** | Python embebible sin instalación previa |
| Lógica Python | Scripts existentes + `pandas`, `openpyxl`, `python-pptx` | Reutiliza código actual |
| Updater | **`tauri-plugin-updater`** (oficial) | Integrado con Tauri, verificación criptográfica |
| Distribución | **GitHub Releases (repo privado)** | Ya tenemos acceso, no requiere infraestructura extra |
| Autenticación de updates | **PAT embebido** (read-only) | Simple, aceptable para uso interno |
| CI/CD | **GitHub Actions** (runner Windows) | Builds reproducibles y automáticos |
| Plataformas soportadas | **Windows 10/11 x64** | Descartado Mac/Linux |

### Stacks descartados y por qué

- **Python + Flet + PyInstaller**: bundles de 150+ MB, falsos positivos de antivirus,
  updater hay que escribirlo a mano.
- **Electron**: ecosistema más maduro pero binarios 10x más grandes que Tauri.
- **.NET MAUI / WPF**: lock-in con el ecosistema Microsoft, curva de aprendizaje
  mayor para el equipo.
- **Next.js** (como frontend): innecesario en Tauri, no hay SSR ni API routes que aprovechar.

---

## 3. Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────┐
│  Aplicación Tauri (WebView2 + Rust)                      │
│                                                          │
│  ┌─────────────────────┐     ┌─────────────────────┐    │
│  │   Frontend React    │◄────┤    Backend Rust     │    │
│  │                     │     │                     │    │
│  │  - Toolbar          │     │  - Tauri commands   │    │
│  │  - Vista de tools   │ IPC │  - Updater logic    │    │
│  │  - Forms / outputs  │     │  - Sidecar manager  │    │
│  │                     │     │  - FS, dialogs      │    │
│  └─────────────────────┘     └──────────┬──────────┘    │
│                                         │                │
│                                         ▼                │
│                             ┌──────────────────────┐     │
│                             │  Python Sidecar      │     │
│                             │  (proceso separado)  │     │
│                             │                      │     │
│                             │  - python.exe        │     │
│                             │  - scripts/*.py      │     │
│                             │  - pandas, pptx...   │     │
│                             └──────────────────────┘     │
└──────────────────────────────────────────────────────────┘
                          ▲
                          │ HTTPS (PAT header)
                          ▼
              ┌────────────────────────┐
              │  GitHub Releases       │
              │  (repo privado)        │
              │  - MSI firmado updater │
              │  - latest.json         │
              └────────────────────────┘
```

### Comunicación Frontend ↔ Backend

- React llama a Rust con `invoke("nombre_comando", { args })`.
- Rust expone comandos con el macro `#[tauri::command]`.
- Eventos asíncronos (progress, logs) usan `app.emit("evento", payload)`.

### Comunicación Backend ↔ Python Sidecar

- Rust ejecuta el sidecar como subproceso (`tauri-plugin-shell`).
- **Protocolo**: argumentos por CLI + respuesta JSON por stdout, errores por stderr.
- Para operaciones largas, el script Python puede imprimir eventos JSON línea a línea
  (streaming) que Rust reenvía a React como eventos de progreso.

---

## 4. Python Sidecar: Estrategia

### Build-time (una vez, o al cambiar dependencias)

1. Script PowerShell (`scripts/bundle-python.ps1`) descarga
   [python-build-standalone](https://github.com/astral-sh/python-build-standalone/releases)
   versión Windows x86_64 (Python 3.12).
2. Extrae en `src-tauri/binaries/python-runtime/`.
3. Ejecuta `pip install --target ./lib -r python-scripts/requirements.txt`.
4. Copia los scripts `.py` a `src-tauri/binaries/scripts/`.
5. Renombra el `python.exe` según el target triple que Tauri espera
   (`python-runner-x86_64-pc-windows-msvc.exe`).

### Bundle-time (cada release)

- `tauri.conf.json` declara el sidecar en `bundle.externalBin`.
- El MSI final contiene: app Tauri + runtime Python + dependencias + scripts.

### Runtime (cuando el usuario usa una herramienta)

```
React clic "Generar PPT"
   │
   ▼
invoke("generate_pptx", { excelPath })
   │
   ▼
Rust command → tauri-plugin-shell.sidecar("python-runner")
                .args(["scripts/excel_to_pptx.py", excelPath])
   │
   ▼
Python: lee Excel → genera PPTX → print(json)
   │
   ▼
Rust parsea JSON → devuelve a React
   │
   ▼
React muestra resultado / abre archivo
```

### Tamaño estimado del bundle

| Componente | Tamaño aprox. |
|---|---|
| Tauri app base | ~10 MB |
| Python runtime standalone | ~20 MB |
| pandas + numpy | ~40 MB |
| openpyxl + python-pptx | ~5 MB |
| **Total MSI estimado** | **~70-80 MB** |

Si pandas no es imprescindible, bajar a ~35-40 MB.

---

## 5. Updater: Flujo Detallado

### Firmas (clarificación importante)

Existen **dos firmas** distintas:

| Firma | ¿Obligatoria? | ¿Cuesta? | Qué hace |
|---|---|---|---|
| **Firma de Windows (Authenticode)** | No, pero recomendada | ~$100-300/año | Evita SmartScreen warning |
| **Firma Ed25519 del updater Tauri** | **Sí** | Gratis | Verifica que el update vino de nosotros |

→ **Decisión actual**: NO firmar con Authenticode (asumimos el SmartScreen warning
en el primer install). **SÍ firmar con Ed25519** (gratis y obligatorio para el updater).

### Configuración `tauri.conf.json`

```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://api.github.com/repos/ORG/mega-app-updater/releases/latest"
      ],
      "pubkey": "<clave-publica-ed25519>",
      "windows": { "installMode": "passive" }
    }
  }
}
```

### Secuencia al iniciar la app

```
1. App arranca
2. Plugin updater hace GET al endpoint con Authorization: Bearer <PAT>
3. Compara versión local (tauri.conf.json) vs tag_name del release
4. Si remote > local:
     a. Descarga el MSI adjunto al release
     b. Verifica firma Ed25519 contra pubkey embebida
     c. Muestra diálogo "Hay una actualización, ¿instalar?"
     d. Si sí: lanza MSI en modo passive, cierra app, reabre nueva versión
5. Si no hay update: continúa normalmente
```

### Autenticación al repo privado

- Crear **fine-grained PAT** con:
  - Scope: solo este repo
  - Permisos: `Contents: Read-only`
  - Expiración: 1 año (renovar)
- Embeberlo en el binario como constante Rust (aceptamos el riesgo para uso interno).
- En caso de leak, revocar y generar uno nuevo (requiere republicar la app).

### Rollback plan

- Si una versión queda rota en producción:
  1. Marcar el release como "draft" o borrarlo en GitHub.
  2. Publicar un nuevo tag con número mayor con el fix.
  3. Los usuarios que ya actualizaron a la versión rota: se arregla con el siguiente update.
  4. Los usuarios que aún no actualizaron: ya no ven la versión rota.

---

## 6. Estructura del Repositorio

```
mega-app-updater/
├── src/                              # Frontend React
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── Toolbar.tsx
│   │   ├── ui/                       # shadcn/ui components
│   │   └── UpdateDialog.tsx
│   ├── tools/                        # Una carpeta por herramienta
│   │   └── excel-to-pptx/
│   │       ├── ExcelToPptxView.tsx
│   │       └── types.ts
│   ├── lib/
│   │   ├── tauri.ts                  # Wrappers de invoke
│   │   └── utils.ts
│   └── styles/
│       └── globals.css
│
├── src-tauri/                        # Backend Rust
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   │   ├── mod.rs
│   │   │   └── excel_pptx.rs
│   │   ├── python_bridge.rs
│   │   └── updater.rs
│   ├── icons/
│   └── binaries/                     # (gitignored) sidecars compilados
│       ├── python-runner-x86_64-pc-windows-msvc.exe
│       └── python-runtime/
│
├── python-scripts/                   # Código Python fuente
│   ├── excel_to_pptx.py
│   ├── _shared/
│   │   └── io_helpers.py
│   └── requirements.txt
│
├── scripts/                          # Scripts de build
│   ├── bundle-python.ps1
│   └── prepare-release.ps1
│
├── .github/
│   └── workflows/
│       ├── ci.yml                    # Build en PRs (artifact)
│       └── release.yml               # Release en tags
│
├── docs/
│   ├── USER_GUIDE.md                 # Guía para usuarios finales (instalación)
│   └── DEV_GUIDE.md                  # Guía para el equipo de desarrollo
│
├── .gitignore
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── components.json                   # shadcn/ui config
├── PLAN.md                           # (este archivo)
└── README.md
```

---

## 7. Workflow de Desarrollo y Release

### Desarrollo local (día a día)

```bash
# Primera vez: bundle del Python sidecar
npm run bundle:python

# Development con hot-reload
npm run tauri dev
```

En modo dev, el frontend corre en Vite (http://localhost:1420) y Tauri lo embebe.
El sidecar Python se ejecuta igual que en producción.

### Branches y PRs

```
main                 ← solo código estable, releases se hacen desde acá
 │
 ├── feature/tool-x  ← nuevas herramientas o features
 ├── fix/bug-123     ← fixes
 └── chore/upgrade   ← mantenimiento
```

- Cada push a una feature branch → CI compila y deja un **MSI como artifact**.
- Los devs descargan el artifact y prueban la app completa antes de mergear.
- El updater **nunca** ve estos builds (no son releases con tag).

### Proceso de release

1. Mergear PR a `main`.
2. Bump de versión en `src-tauri/tauri.conf.json` y `src-tauri/Cargo.toml`.
3. `git tag v1.2.0 && git push --tags`.
4. GitHub Action `release.yml` se dispara:
   - Compila app con sidecar Python.
   - Firma el MSI con la clave Ed25519.
   - Crea un GitHub Release con el MSI y el `latest.json`.
5. Próxima vez que cada usuario abra la app → se actualiza automáticamente.

### Secrets de GitHub Actions necesarios

| Secret | Descripción |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Clave privada Ed25519 para firmar updates |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password de la clave |
| `UPDATER_GITHUB_TOKEN` | PAT para embeber (puede ser el mismo que usa el workflow) |

---

## 8. Roadmap por Fases

### Fase 1 — Scaffold del proyecto (1-2 días)
- [x] `npm create tauri-app@latest` con template React + TypeScript + Vite
- [x] Configurar Tailwind CSS
- [x] Inicializar shadcn/ui (`npx shadcn@latest init`)
- [x] UI mínima: ventana + sidebar + vista placeholder
- [x] Verificar compilación en Windows (`npm run tauri build`)
- [x] Commit inicial

### Fase 2 — Python sidecar (2-3 días) ✅
- [x] Script `bundle-python.ps1` descargando python-build-standalone 3.12
- [x] `requirements.txt` con deps del script (openpyxl, python-pptx — pandas queda fuera por ahora)
- [x] Instalar deps al bundle
- [x] Configurar `externalBin` en `tauri.conf.json` — **ver nota abajo, se usó `bundle.resources`**
- [x] Command Rust de prueba que ejecute un `hello.py` (`run_python_hello`)
- [x] Verificar que en el MSI buildado el Python se ejecuta correctamente *(pendiente de un build + instalación real)*

> **Nota de implementación**: el PLAN original preveía usar `externalBin` con el
> sidecar renombrado a `python-runner-x86_64-pc-windows-msvc.exe`. En la práctica
> `externalBin` de Tauri solo soporta un único ejecutable, pero `python.exe`
> necesita sus DLLs + `Lib/` + `DLLs/` co-ubicados. Se optó por `bundle.resources`
> mapeando `src-tauri/binaries/python-runtime` → `python-runtime` y
> `src-tauri/binaries/python-scripts` → `python-scripts`. Rust resuelve con
> `BaseDirectory::Resource` y spawnea vía `tauri-plugin-shell`. Ver
> `src-tauri/src/python_bridge.rs`.

### Fase 3 — Primera herramienta: Brand Audit (YPF hardcoded) ✅

> **Estado**: completada el 23/04/2026. Motor Brand Audit integrado end-to-end:
> el usuario elige 2 `.sav` + ola en la UI, el motor corre como sidecar Python,
> y la app devuelve un PowerPoint (~126 slides) + Excel de tablas.
> El scope y deps se decidieron según lo descripto en sección 3.bis.

- [x] Copiar paquete `brand_audit/` (main, config, utils, tabulation_engine,
      process_data, create_slides, visual_engine, generador_ia, config_loader)
      + assets (`INFORME COMPLETO YPF MONITOR.pptx` + `cuestionario.xlsx`) a
      `python-scripts/brand_audit/`.
- [x] Wrapper `python-scripts/run_brand_audit.py` que parsea argv, monkey-patchea
      `brand_audit.config` con valores dinámicos (SAV principal, SAV secundario,
      wave filter, wave name, toggles IA), cambia CWD a `output_dir`, y emite
      líneas JSON de progreso + 1 línea final con paths de outputs.
- [x] Ampliar `requirements.txt`: `pandas==2.2.3`, `numpy==2.1.3`, `scipy==1.14.1`,
      `pyreadstat==1.3.4` (la 1.2.8 tenía bug de "Unknown error"),
      `google-generativeai==0.8.6` + `google-genai==1.58.0` (el motor usa los dos).
      Runtime final: ~610 MB.
- [x] Forzar UTF-8 en stdout/stderr del sidecar (`PYTHONIOENCODING=utf-8` +
      `PYTHONUTF8=1` desde Rust; `sys.stdout.reconfigure` en el wrapper).
      Sin esto, los emojis del logger crasheaban en `cp1252`.
- [x] Ampliar `python_bridge.rs`: soporte para env vars (`opts.env`), `cwd`
      opcional, y streaming línea-por-línea de stdout/stderr como eventos
      Tauri (`brand-audit-progress`) para log en vivo en la UI.
- [x] Command Rust `run_brand_audit(BrandAuditParams) -> BrandAuditResult` con:
      resolución de `Documents\MegaApp\`, copia de assets en el primer run,
      creación de subcarpeta por timestamp, spawn del sidecar con progreso,
      parseo de la última línea JSON de stdout.
- [x] Plugins sumados: `tauri-plugin-dialog`, `tauri-plugin-fs`,
      `tauri-plugin-store`. Permissions en `capabilities/default.json`.
- [x] Vista React `src/tools/brand-audit/BrandAuditView.tsx` con file pickers
      (principal obligatoria + secundaria opcional), inputs de ola,
      toggles IA, log en vivo, y botones para abrir outputs.
- [x] Vista `src/tools/settings/SettingsView.tsx` para configurar la API key
      de Gemini (persistida con `tauri-plugin-store` en
      `%APPDATA%\Mega App\settings.json`).
- [x] Toolbar actualizada: entrada "Brand Audit · YPF" + "Ajustes".
      Placeholder `excel-to-pptx` removido.
- [x] **Probado end-to-end** con `YPF ABRIL.sav` (1667 columnas) + `CONDUCTORES.sav`
      en `npm run tauri dev`: genera informe completo (PPT ~126 slides + Excels).

**Decisiones tomadas sobre lo que estaba pendiente en 3.bis** (y sus respuestas):
- **Scope**: integrar el motor completo hardcoded al estudio YPF. Generalizar
  después, cuando esté probado.
- **Parámetros dinámicos**: vienen por UI (argv al wrapper) — SAV principal,
  SAV secundario, wave filter, wave name, toggles IA. Todo lo demás de
  `config.py` queda hardcoded dentro del paquete.
- **Dependencias**: se aceptaron todas (bundle 610 MB). Prioridad fue
  funcionalidad sobre tamaño.
- **Módulo IA**: integrado y funcional, OFF por default. La key la
  configura cada usuario en Ajustes.
- **API key Gemini**: persistida localmente con `tauri-plugin-store`. Se
  propaga al sidecar vía env var (`GEMINI_API_KEY`), nunca por argv.
- **Outputs**: `Documents\MegaApp\YPF Monitor\<timestamp>\`. Nunca se sobreescriben.
- **Template `.pptx` y assets**: bundleados en los resources del MSI, y en el
  primer run se copian a `Documents\MegaApp\assets\` (editable por el usuario
  sin esperar release nuevo, no se pisan en corridas posteriores).
- **Base secundaria**: opcional en la UI.
- **`manual_tasks.csv`**: el motor ya lo trata como opcional; queda pendiente
  de recibirlo del usuario (cuando se pase, va en `Documents\MegaApp\assets\`).

**Pendiente como follow-up (no bloquea Fase 3 cerrada)**:
- [ ] Probar IA real cuando el usuario tenga API key de Gemini.
- [ ] Generalizar el motor para soportar otros estudios (sección 7.?).
- [ ] Migrar `google.generativeai` (deprecated EOL nov-2025) a `google.genai`
      puro, para poder bajar una dependencia.
- [ ] Optimizar tamaño del bundle (actualmente 610 MB). Candidatos:
      `.pyc`-only (`python -m compileall -b`), borrado de `__pycache__`,
      removeer tests/docs de site-packages.

### Fase 3.bis — Análisis del script real recibido (21/04/2026)

> El script que se creía era un simple "Excel → PPT" en realidad es un motor de
> **Brand Audit / Tracking de Marca** sustancialmente más complejo. Esta sección
> documenta el estado hallado para que al retomar Fase 3 no haya que redescubrir.

#### Ubicación de los fuentes
- ZIP entregado por el usuario, descomprimido en `incoming/pruebaPythonOK/` (ignorado por git).
- 10 archivos Python (~400 KB de código) + `cuestionario.xlsx` de ejemplo.

#### Estructura del proyecto recibido

| Archivo | Rol | Tamaño |
|---|---|---|
| `main.py` | Orquestador: carga bases, arma tareas, genera PPT y Excel | 33 KB |
| `config.py` | Configuración completa del estudio (hardcoded YPF) | **128 KB** |
| `config_loader.py` | Lee `manual_tasks.csv` | 5 KB |
| `tabulation_engine.py` | Motor de tabulación (SRQ, MRQ, grids, escalas) | 57 KB |
| `process_data.py` | Procesamiento de escalas/singles/duales | 14 KB |
| `utils.py` | Carga SPSS con `pyreadstat`, banners, diccionario | 43 KB |
| `create_slides.py` | Inyección de datos en plantilla PPTX | 105 KB |
| `visual_engine.py` | Helpers gráficos | 15 KB |
| `generador_ia.py` | Integración Gemini (títulos + executive summary) | 7 KB |
| `__init__.py` | Marca como paquete (imports relativos) | 0 B |

#### Flujo real (no es "Excel → PPT")

```
Inputs:
  - SPSS principal (.sav)              ← vía pyreadstat (NO es Excel)
  - SPSS secundario opcional (.sav)
  - Template PowerPoint (.pptx)
  - Diccionario del estudio (.xlsx)
  - Tareas manuales (.csv)
  - Config (config.py) ← hoy hardcoded al estudio YPF

Procesa (tabulación + gráficos + opcional IA) →

Outputs (escritos al CWD):
  - informe_<STUDY_ID>.pptx
  - Tablas_Principal_<STUDY_ID>.xlsx
  - Tablas_Secundaria_<STUDY_ID>.xlsx (si aplica)
  - debug_ejecucion.log
```

#### Choques con el PLAN original

1. **Input es SPSS, no Excel.** Renombrar `excel_to_pptx` a algo como
   `brand_audit` / `sav_to_report` cuando se integre.

2. **Dependencias pesadas** (habíamos excluido pandas en Fase 2):

   | Dep | Estado | ¿Obligatoria? |
   |---|---|---|
   | `openpyxl` | ✅ ya está | sí |
   | `python-pptx` | ✅ ya está | sí |
   | `pandas` | ❌ faltaba | **sí** |
   | `numpy` | ❌ faltaba | **sí** (dep de pandas y pyreadstat) |
   | `pyreadstat` | ❌ faltaba | **sí** (C extensions, Windows wheels OK) |
   | `google-generativeai` o `google-genai` | ❌ faltaba | solo si se mantiene módulo IA |

   Impacto: el bundle pasa de ~35 MB estimados a **~100 MB**. Hay que asumirlo
   o evaluar recortar features (ej: quitar SPSS y forzar conversión previa a
   Parquet; quitar IA del cliente).

3. **Imports relativos** (`from . import config`). Obliga a ejecutar como paquete:
   `python -m brand_audit.main`. El `python_bridge.rs` actual corre
   `python.exe <script>.py [args]`; hay que añadir soporte para `-m paquete.módulo`
   o usar un `run.py` en la raíz del paquete como wrapper.

4. **`config.py` está hardcoded al estudio YPF.** Contiene:
   - Paths literales (`"YPF ABRIL.sav"`, `"INFORME COMPLETO YPF MONITOR.pptx"`).
   - IDs del estudio, nombres de olas, variables de ponderación.
   - Listas gigantes de variables "basura" a limpiar.
   - Mapa completo de gráficos/tablas a inyectar (nombres exactos de shapes en la plantilla).

   Para usarlo desde una app genérica hay que **externalizar los parámetros
   por estudio** (archivo `study.json` o similar), manteniendo las constantes
   del negocio adentro del paquete.

5. **Outputs al CWD.** El script hace `prs.save(f"informe_{STUDY_ID}.pptx")`
   contra el directorio actual. En la app instalada el CWD es el dir de
   instalación (read-only o peor). Hay que:
   - Pasar `output_dir` como parámetro, o
   - Cambiar CWD del subproceso Python al dir de outputs antes de ejecutar.

6. **Gemini API key** hardcoded como `"MI_API_KEY"` placeholder en `main.py`.
   Hay que definir dónde guardarla (opciones barajadas: `tauri-plugin-store`
   cifrado, input en UI por sesión, variable de entorno del usuario).

#### Decisiones pendientes (bloquean el retome de Fase 3)

- [ ] **Alcance**: ¿integramos el motor completo tal cual, o primero hacemos
  una herramienta MVP más chica (ej. un `excel_to_pptx` genuino) y este motor
  queda para más adelante?
- [ ] **Cómo pasar parámetros del estudio**:
  - (a) `study.json` por estudio (simple, requiere que el usuario entienda el formato)
  - (b) UI completa con form y file pickers (mejor UX, mucho frontend)
  - (c) Híbrido: "Carpeta de estudio" con convención fija (`study.json` + `data/*.sav` + `template.pptx` + ...)
- [ ] **Dependencias pesadas**: ¿asumimos bundle ~100 MB o recortamos features?
- [ ] **Módulo IA**: ¿lo dejamos para esta primera versión o lo sacamos del MVP?
- [ ] **Dónde guardar API key de Gemini** (si IA queda).
- [ ] **Dónde van los outputs**: carpeta elegida por run, fija en
  `%USERPROFILE%\Documents\MegaApp\<estudio>\`, o junto a los inputs.

#### Plan tentativo para cuando se retome

Esto es una propuesta, no está aprobada aún:

1. Crear `python-scripts/brand_audit/` con el paquete tal cual (sin los archivos
   no-código del zip: `.xlsx`, `.code-workspace`).
2. Agregar wrapper `python-scripts/run_brand_audit.py` que:
   - Lea un `study.json` (path por argv).
   - Monkey-patchee `brand_audit.config` con los valores del JSON.
   - Cambie CWD al `output_dir` del estudio.
   - Llame a `main.run_brand_audit()`.
   - Imprima al final una línea JSON con los paths de outputs generados.
3. Actualizar `python-scripts/requirements.txt` con las deps que faltan y
   correr `npm run bundle:python` para re-bundlear.
4. Ampliar `python_bridge.rs` para soportar ejecución como módulo (o seguir
   invocando `run_brand_audit.py` como wrapper).
5. Command Rust `run_brand_audit(study_json_path) -> BrandAuditResult`.
6. Vista React en `src/tools/brand-audit/` con form mínimo (selector de
   carpeta de estudio) + `tauri-plugin-opener` para abrir el PPT final.

---

### Fase 4 — Auto-updater (1-2 días) ✅ (pendiente prueba end-to-end)
- [x] Generar keypair: `mega-app.key` en `%USERPROFILE%\.tauri\` (sin password, Ed25519)
- [x] Pubkey en `tauri.conf.json` → `plugins.updater.pubkey`
- [x] Endpoint configurado: `https://github.com/ffacundoSuarez/mega-app-updater/releases/latest/download/latest.json`
- [x] `installMode: passive` para que Windows muestre la UI nativa del MSI
- [x] `createUpdaterArtifacts: true` en `bundle` para que `tauri build` emita `.sig`
- [x] Plugins Rust (`tauri-plugin-updater`, `tauri-plugin-process`) registrados en `lib.rs`
- [x] Header `Authorization: Bearer <PAT>` inyectado en runtime desde `option_env!("UPDATER_GITHUB_TOKEN")` (build-time)
- [x] Permisos `updater:default`, `process:default`, `process:allow-restart` en capabilities
- [x] shadcn/ui `dialog` + `progress` instalados
- [x] `src/lib/updater.ts` con wrappers `checkForUpdate` / `installUpdate`
- [x] `UpdateDialog` reescrito con estados available → downloading → installing → error.
      Sin botón "Más tarde" (update obligatorio), no se cierra con Esc ni click afuera.
- [x] Hook silencioso en `App.tsx` que chequea al iniciar; errores (offline, 404 pre-primer-release) se ignoran para no bloquear el arranque
- [x] `.gitignore` protege `*.key` / `*.key.pub`
- [x] `docs/DEV_GUIDE.md` documenta claves, rotación y secrets necesarios
- [ ] **Probar update end-to-end** (se hace en Fase 5 con CI): instalar v0.1.0, publicar v0.1.1, verificar update real

> **Decisiones de producto tomadas en Fase 4**:
> - Chequeo **al iniciar** la app (no periódico, no manual).
> - Update **obligatorio**, sin botón "Más tarde".
> - `installMode: passive` (Windows muestra barra de progreso nativa, sin preguntas).
> - **Se muestra el changelog** del release en el diálogo (campo `body` que Tauri toma de las release notes).
> - Keypair **sin password** por simplicidad del CI. Se puede rotar a una con
>   password más adelante si es necesario, teniendo en cuenta el costo para
>   instalaciones ya distribuidas (ver `DEV_GUIDE.md` § Rotar las claves).

### Fase 5 — CI/CD (1 día) ✅ (pipeline listo, pendiente primer tag)
- [x] Workflow `ci.yml` para PRs (compila + sube artifact firmado como zip, 14 días de retención)
- [x] Workflow `release.yml` para tags `v*.*.*` (usa `tauri-apps/tauri-action@v0`,
      firma, genera `latest.json`, crea GitHub Release)
- [x] Cache del sidecar Python (hash de `requirements.txt` + `bundle-python.ps1`)
- [x] Cache de Rust (`Swatinem/rust-cache@v2`)
- [x] Versiones bumpeadas a `1.0.0` en `tauri.conf.json`, `Cargo.toml`,
      `package.json`, `App.tsx`
- [x] **Usuario**: configurar 3 secrets en GitHub Actions (ver `docs/DEV_GUIDE.md` §2)
- [x] **Usuario**: push del commit + tag `v1.0.0` para disparar el primer release
- [x] **Usuario**: verificar instalación del MSI generado

### Fase 6 — Distribución (0.5 día)
- [ ] Escribir `USER_GUIDE.md` con screenshots del SmartScreen workaround
- [ ] Compartir MSI inicial con primeros usuarios (onboarding manual)
- [ ] Desde ahí, los siguientes updates son automáticos

### Fase 7 — Iteración continua
- [ ] Agregar nuevas herramientas según pedidos del equipo
- [ ] Cada herramienta sigue el patrón: carpeta en `src/tools/` + script en `python-scripts/`
- [ ] Mantener changelog por release

**Estimación total MVP (Fases 1-6)**: ~7-10 días de trabajo.

---

## 9. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| SmartScreen bloquea primer install | Alta | Medio | Documentar workaround con screenshots |
| Windows Defender marca el MSI | Media | Alto | Submit for analysis a Microsoft (gratis, 24-48h) |
| Antivirus corporativo bloquea sidecar Python | Baja | Alto | Coordinar con IT si pasa; whitelist por hash |
| PAT embebido se filtra | Baja | Bajo | Permisos read-only al repo; revocar y rotar |
| Versión rota publicada afecta a todos | Media | Alto | Plan de rollback; testing en artifact antes de tag |
| MSI muy pesado (>100 MB) | Media | Medio | Evaluar si pandas es necesario; usar `--target` con `--no-deps` |
| Paths con unicode/espacios rompen el sidecar | Alta | Medio | Testing específico con paths tipo `C:\Users\José Pérez\` |
| Python-build-standalone deja de mantenerse | Muy baja | Alto | Es proyecto de Astral (uv, ruff), muy activo |

---

## 10. Decisiones Tomadas

- **Plataforma**: solo Windows 10/11 x64.
- **Stack**: Tauri 2 + React + Vite + shadcn/ui + Python sidecar.
- **Firma Windows**: no, asumimos SmartScreen warning inicial.
- **Firma updater**: sí, Ed25519 (gratis y obligatoria para Tauri updater).
- **Auth al repo privado**: PAT embebido con scope mínimo.
- **Canal beta**: no, pero CI genera artifacts para testing previo a release.
- **Python version**: 3.12.
- **Primer caso de uso**: ~~Excel → PowerPoint~~ → **Brand Audit** (Tracking YPF,
  SPSS → PPT + Excel). Ver Fase 3.

## 11. Decisiones Pendientes

- [ ] Nombre definitivo de la app (aparece en título de ventana y menú inicio).
- [ ] Icono de la app (.ico de 256x256 con múltiples resoluciones).
- [ ] Revisar el script Python actual para saber deps exactas.
- [ ] ¿La app tiene configuración persistente? (si sí, usar `tauri-plugin-store`).
- [ ] ¿Logs locales para debugging? (recomendado: `tauri-plugin-log`).
- [ ] ¿Telemetría de uso? (no, por ahora).

---

## 12. Referencias

- [Tauri v2 docs](https://v2.tauri.app/)
- [Tauri Updater Plugin](https://v2.tauri.app/plugin/updater/)
- [Tauri Shell Plugin (sidecars)](https://v2.tauri.app/plugin/shell/)
- [python-build-standalone](https://github.com/astral-sh/python-build-standalone)
- [shadcn/ui](https://ui.shadcn.com/)
- [Vite](https://vite.dev/)
