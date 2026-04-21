# Guía para devs

Notas operativas para el equipo que mantiene Mega App.
Guía del **usuario final** (instalación / SmartScreen): ver `USER_GUIDE.md` (pendiente).

---

## 1. Setup inicial (una vez por máquina)

### Requisitos

- Windows 10/11 x64.
- Node.js 20+ (o la versión que fije `package.json/engines` cuando se agregue).
- Rust toolchain (`rustup` con target `stable-x86_64-pc-windows-msvc`).
- Visual Studio Build Tools (para compilar las deps nativas).
- Git.

### Primer clone

```powershell
git clone https://github.com/ffacundoSuarez/mega-app-updater.git
cd mega-app-updater
npm install
npm run bundle:python     # baja y prepara el sidecar de Python (Fase 2)
npm run tauri dev         # app con hot-reload
```

---

## 2. Auto-updater (Fase 4)

### Arquitectura

```
Build en CI (con privkey)  →  MSI + firma Ed25519  →  GitHub Release
                                                            │
                                                            ▼
                                                   App del usuario
                                                   (tiene pubkey en binario)
                                                            │
                                  chequea al iniciar ─────►  │
                                  si hay update:            │
                                    1. descarga MSI          │
                                    2. verifica firma        │
                                    3. installMode passive   │
                                    4. Windows instala       │
                                    5. se relanza sola       │
```

Configuración en `src-tauri/tauri.conf.json` → `plugins.updater`.

### Claves Ed25519

Se usan para que la app valide que un MSI efectivamente viene de nosotros.
Son **dos archivos**:

| Archivo | Secreto | Dónde | Para qué |
|---|---|---|---|
| `mega-app.key` (privada) | **SÍ** | `%USERPROFILE%\.tauri\` localmente + `TAURI_SIGNING_PRIVATE_KEY` en GitHub Actions | Firmar el MSI al generar un release |
| `mega-app.key.pub` (pública) | NO | En `tauri.conf.json` → `plugins.updater.pubkey` | Verificar la firma en la app del usuario |

**La privada NO se commitea.** `.gitignore` bloquea `*.key` y `*.key.pub` por
si se copia al repo por error.

### Rotar las claves

Se hace con cuidado: si hay instalaciones en la naturaleza, **pierden la capacidad
de auto-actualizar** porque la pubkey embebida en su binario no va a matchear
la firma del nuevo release.

Pasos cuando sea estrictamente necesario:

1. Generar nuevo keypair:
   ```powershell
   npx @tauri-apps/cli signer generate --write-keys "$env:USERPROFILE\.tauri\mega-app.key" --ci --force
   ```
   (Agregá `--password "..."` si querés protegerla con contraseña.)

2. Reemplazar `pubkey` en `tauri.conf.json` con el contenido de
   `%USERPROFILE%\.tauri\mega-app.key.pub`.

3. Actualizar el secret `TAURI_SIGNING_PRIVATE_KEY` en GitHub Actions con el
   contenido de `mega-app.key`.

4. Si usaste password, actualizar el secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

5. Publicar un nuevo release. Usuarios nuevos (que instalen a partir de este
   MSI) seguirán actualizándose normalmente. Usuarios con instalaciones
   anteriores tienen que **reinstalar manualmente** el MSI nuevo.

### Secrets necesarios en GitHub Actions

Se configuran en el repo desde **Settings → Secrets and variables → Actions
→ New repository secret**:

| Secret | Valor | Cuándo se necesita |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenido del archivo `mega-app.key` (texto plano) | En cada build firmado |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password de la clave | Solo si la clave tiene password (la actual no tiene, omitir) |
| `UPDATER_GITHUB_TOKEN` | Fine-grained PAT con `Contents: Read-only` al repo | Se embebe en el binario para autenticar al bajar assets de releases privados |

**Nota**: el flujo de Fase 4 ya deja el código Rust leyendo el PAT vía
`option_env!("UPDATER_GITHUB_TOKEN")`. Si la var no está seteada en build-time,
queda vacía y el updater no puede acceder a releases privados. Para dev local
eso está bien: el chequeo simplemente falla y la app arranca igual.

### Paso a paso: setup inicial de secrets (se hace 1 sola vez por repo)

#### 1. `TAURI_SIGNING_PRIVATE_KEY`

Desde PowerShell, copiá el contenido de la clave privada al clipboard:

```powershell
Get-Content "$env:USERPROFILE\.tauri\mega-app.key" | Set-Clipboard
```

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
- **Name**: `TAURI_SIGNING_PRIVATE_KEY`
- **Secret**: pegar con Ctrl+V.
- Save.

#### 2. `UPDATER_GITHUB_TOKEN`

Generar un fine-grained Personal Access Token:

1. Ir a https://github.com/settings/personal-access-tokens/new
2. **Token name**: `mega-app-updater-read` (o lo que prefieras).
3. **Resource owner**: `ffacundoSuarez`.
4. **Expiration**: 1 año.
5. **Repository access**: "Only select repositories" → `mega-app-updater`.
6. **Permissions → Repository permissions**:
   - `Contents`: **Read-only**.
   - Todos los demás: "No access" (default).
7. **Generate token** → copiar el string `github_pat_...`.

En el repo, **Settings → Secrets and variables → Actions → New repository secret**:
- **Name**: `UPDATER_GITHUB_TOKEN`
- **Secret**: pegar el PAT.
- Save.

**Recordatorio**: el PAT expira en 1 año. Poner recordatorio en calendario.
Cuando expire, regenerar y actualizar el secret. El binario actual seguirá
funcionando hasta que GitHub invalide el PAT; la app dejará de auto-actualizarse
cuando eso pase.

### Publicar una nueva versión

Después del primer `v1.0.0`, cada release siguiente se hace así:

```powershell
# 1. Bumpear versión en los 4 archivos (sincronizados)
#    - src-tauri/tauri.conf.json → "version"
#    - src-tauri/Cargo.toml → version
#    - package.json → "version"
#    - src/App.tsx → APP_VERSION
#    (dejará Cargo.lock desactualizado; lo regenera `cargo check`)

# 2. Commitear el bump
git add -A
git commit -m "chore: bump to vX.Y.Z"
git push

# 3. Taggear y pushear el tag
git tag vX.Y.Z
git push --tags
```

El workflow `release.yml` se dispara con el push del tag. El Release tarda
unos 10-15 min en estar disponible (compilación, sidecar, firma, upload).

### Qué ve el usuario final

1. Abre la app → en background se chequea si hay update (silencioso, ~1-2 s).
2. Si hay update:
   - Aparece un diálogo modal **obligatorio** (no se puede cerrar, no hay
     "Más tarde"): muestra versión actual, versión nueva y changelog.
   - Click en "Actualizar ahora" → barra de progreso con MB descargados.
   - Descarga completa → verificación de firma (silenciosa) → Windows toma
     el relevo y muestra su propia ventana de instalación (modo `passive`).
   - La app se cierra y se relanza sola en la versión nueva.
3. Si no hay update (o el endpoint falla): la app abre normalmente.

### Probar el update end-to-end (Fase 5)

Todavía no está automatizado. Será parte de Fase 5 cuando haya CI/CD:

1. Instalar manualmente v0.1.0 en una VM limpia.
2. Bumpear versión a v0.1.1 en `tauri.conf.json` y `Cargo.toml`.
3. Taggear y pushear para disparar el workflow de release.
4. Esperar a que el workflow publique el release con el `latest.json` firmado.
5. Reabrir la app v0.1.0 instalada → debería detectar el update, bajarlo,
   instalar v0.1.1 y relanzarse sola.

---

## 3. Python sidecar (Fase 2)

Ver `scripts/bundle-python.ps1` y `python-scripts/`.

`npm run bundle:python` baja python-build-standalone, instala deps, copia
scripts a `src-tauri/binaries/`. `npm run bundle:python:force` borra todo y
rehace el bundle desde cero.

---

## 4. Estructura de ramas

```
main                 ← solo código estable, releases se tagean desde acá
 │
 ├── feature/*       ← nuevas herramientas o features
 ├── fix/*           ← fixes
 └── chore/*         ← mantenimiento
```

- Cada push a feature branch dispara `ci.yml` (Fase 5), que compila y sube un
  MSI como artifact para QA manual.
- El updater **nunca** ve estos MSI de artifact (no están adjuntos a tags).

---

## 5. Versionado y release

1. Mergear PR a `main`.
2. Bumpear versión en:
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `version`
   - `package.json` → `version` (opcional, pero recomendable tenerlos sincronizados)
   - `src/App.tsx` → `APP_VERSION` (hasta que se reemplace por `getVersion()` en runtime)
3. `git tag v1.2.0 && git push --tags`.
4. Workflow `release.yml` (Fase 5) toma el tag, compila, firma y publica el release.
