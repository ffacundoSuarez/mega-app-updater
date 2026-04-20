<#
.SYNOPSIS
  Arma el sidecar Python embebido para Mega App.

.DESCRIPTION
  Se ejecuta en build-time (una vez, o cuando cambian deps / versión de Python):
    1. Descarga el último release de python-build-standalone para Python 3.12
       (Windows x86_64, variante install_only).
    2. Extrae el runtime a src-tauri/binaries/python-runtime/.
    3. Instala las dependencias de python-scripts/requirements.txt dentro
       del mismo runtime (Lib/site-packages/).
    4. Copia los scripts .py a src-tauri/binaries/python-scripts/.

  El resultado (src-tauri/binaries/) está gitignoreado y es declarado como
  bundle.resources en tauri.conf.json. Al build del MSI, Tauri lo empaqueta
  completo; en runtime, Rust resuelve python.exe con BaseDirectory::Resource.

.PARAMETER PythonVersion
  Versión mayor.menor de Python a bundlear. Default: 3.12.

.PARAMETER Force
  Si se especifica, borra y rearma el runtime aunque ya exista.

.EXAMPLE
  npm run bundle:python
  pwsh ./scripts/bundle-python.ps1 -Force
#>

[CmdletBinding()]
param(
    [string]$PythonVersion = "3.12",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# --- Paths ---------------------------------------------------------------
$repoRoot     = Resolve-Path (Join-Path $PSScriptRoot "..")
$binariesDir  = Join-Path $repoRoot "src-tauri\binaries"
$runtimeDir   = Join-Path $binariesDir "python-runtime"
$scriptsDest  = Join-Path $binariesDir "python-scripts"
$scriptsSrc   = Join-Path $repoRoot "python-scripts"
$requirements = Join-Path $scriptsSrc "requirements.txt"
$tempDir      = Join-Path $env:TEMP "mega-app-python-bundle"

# --- Helper: mensaje formateado ------------------------------------------
function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# --- 0. Validaciones previas ---------------------------------------------
if (-not (Test-Path $requirements)) {
    throw "No se encontró $requirements. Esperado desde el PLAN.md (Fase 2)."
}

# tar + curl vienen nativos desde Windows 10 1803+, así que podemos asumirlos.
foreach ($cmd in @("tar", "curl")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        throw "Falta el comando requerido '$cmd' en PATH."
    }
}

# --- 1. Reset del directorio destino si corresponde ----------------------
if (Test-Path $runtimeDir) {
    if ($Force) {
        Write-Step "Limpiando runtime previo ($runtimeDir)..."
        Remove-Item $runtimeDir -Recurse -Force
    } else {
        Write-Host "Runtime ya existe en $runtimeDir. Usá -Force para rearmarlo." -ForegroundColor Yellow
        Write-Host "(se procede a refrescar solo los python-scripts)" -ForegroundColor Yellow
    }
}

New-Item -ItemType Directory -Path $binariesDir -Force | Out-Null
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

# --- 2. Resolver último release de python-build-standalone ---------------
if (-not (Test-Path $runtimeDir)) {
    Write-Step "Consultando último release de python-build-standalone..."

    # Query a GitHub API: buscamos el asset que matchea Python X.Y, x86_64, install_only.
    $apiUrl   = "https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest"
    $headers  = @{ "User-Agent" = "mega-app-updater-bundler" }
    $release  = Invoke-RestMethod -Uri $apiUrl -Headers $headers

    $pattern  = "^cpython-$([regex]::Escape($PythonVersion))\.\d+\+\d+-x86_64-pc-windows-msvc-install_only\.tar\.gz$"
    $asset    = $release.assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1

    if (-not $asset) {
        throw "No se encontró asset para Python $PythonVersion x86_64-windows-msvc en release $($release.tag_name)."
    }

    Write-Host "  release: $($release.tag_name)"
    Write-Host "  asset:   $($asset.name)"
    Write-Host "  size:    $([math]::Round($asset.size / 1MB, 1)) MB"

    $archive = Join-Path $tempDir $asset.name

    # --- 3. Descargar (si no está cacheado) ----------------------------------
    if (Test-Path $archive) {
        Write-Host "  (ya descargado, reutilizando cache)" -ForegroundColor DarkGray
    } else {
        Write-Step "Descargando runtime..."
        curl.exe -L --fail --progress-bar -o $archive $asset.browser_download_url
    }

    # --- 4. Extraer --------------------------------------------------------
    Write-Step "Extrayendo runtime a $runtimeDir..."
    $extractStaging = Join-Path $tempDir "extract"
    if (Test-Path $extractStaging) { Remove-Item $extractStaging -Recurse -Force }
    New-Item -ItemType Directory -Path $extractStaging -Force | Out-Null

    tar -xzf $archive -C $extractStaging
    if ($LASTEXITCODE -ne 0) { throw "Falló la extracción con tar." }

    # El archive contiene una carpeta "python/" con todo adentro. La movemos
    # al destino final y la renombramos implícitamente.
    $extracted = Join-Path $extractStaging "python"
    if (-not (Test-Path $extracted)) {
        throw "Estructura inesperada en el archive: no se encontró 'python/' en $extractStaging."
    }
    Move-Item $extracted $runtimeDir
}

# --- 5. Verificación de que el python embebido arranca ---------------------
$pythonExe = Join-Path $runtimeDir "python.exe"
if (-not (Test-Path $pythonExe)) {
    throw "No existe $pythonExe después de la extracción."
}

Write-Step "Verificando python embebido..."
$actualVersion = & $pythonExe --version
Write-Host "  $actualVersion"

# --- 6. Instalar dependencias con pip --------------------------------------
Write-Step "Instalando dependencias de requirements.txt..."
# Usamos el pip del propio runtime embebido. No tocamos el Python del host.
& $pythonExe -m pip install --disable-pip-version-check --no-warn-script-location -r $requirements
if ($LASTEXITCODE -ne 0) { throw "Falló pip install." }

# --- 7. Copiar scripts Python al bundle ------------------------------------
Write-Step "Copiando python-scripts/ al bundle..."
if (Test-Path $scriptsDest) {
    Remove-Item $scriptsDest -Recurse -Force
}
# Excluimos cachés y el requirements.txt del bundle final (solo relevante en build-time).
$copyParams = @{
    Path        = $scriptsSrc
    Destination = $scriptsDest
    Recurse     = $true
    Force       = $true
    Exclude     = @("__pycache__", "*.pyc", "requirements.txt")
}
Copy-Item @copyParams

# PowerShell Copy-Item con -Exclude no es recursivo, así que limpiamos a mano.
Get-ChildItem $scriptsDest -Recurse -Include "__pycache__" -Force |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $scriptsDest -Recurse -Include "*.pyc" -Force |
    Remove-Item -Force -ErrorAction SilentlyContinue

# --- 8. Resumen final ------------------------------------------------------
Write-Step "Bundle listo."
$runtimeSize = (Get-ChildItem $runtimeDir -Recurse -File -ErrorAction SilentlyContinue |
    Measure-Object -Property Length -Sum).Sum
Write-Host ("  python-runtime:  {0:N1} MB" -f ($runtimeSize / 1MB))
Write-Host ("  python-scripts:  {0}" -f (Get-ChildItem $scriptsDest -Recurse -File).Count) "archivos"
Write-Host ""
Write-Host "Próximo paso: npm run tauri dev" -ForegroundColor Green
