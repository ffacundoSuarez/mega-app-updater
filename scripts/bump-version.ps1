# Sincroniza la versión en los cuatro archivos que deben coincidir antes de un release.
# Uso: .\scripts\bump-version.ps1 -Version "1.2.2"

param(
    [Parameter(Mandatory = $true)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Error "La versión debe ser semver (ej. 1.2.2), recibido: $Version"
}

function Read-JsonFile($path) {
    Get-Content -Raw -Path $path | ConvertFrom-Json
}

function Write-JsonFile($path, $obj) {
    $json = $obj | ConvertTo-Json -Depth 20
    # ConvertTo-Json en Windows puede no respetar indentación del original; tauri.conf usa 2 espacios.
    Set-Content -Path $path -Value $json -Encoding utf8NoBOM
}

$packagePath = Join-Path $root "package.json"
$tauriConfPath = Join-Path $root "src-tauri\tauri.conf.json"
$cargoPath = Join-Path $root "src-tauri\Cargo.toml"
$appPath = Join-Path $root "src\App.tsx"

Write-Host "Actualizando versión a $Version ..."

# package.json
$pkg = Read-JsonFile $packagePath
$pkg.version = $Version
Write-JsonFile $packagePath $pkg

# tauri.conf.json
$tauri = Read-JsonFile $tauriConfPath
$tauri.version = $Version
Write-JsonFile $tauriConfPath $tauri

# Cargo.toml
$cargo = Get-Content -Raw -Path $cargoPath
$cargo = $cargo -replace '(?m)^version = "[^"]+"', "version = `"$Version`""
Set-Content -Path $cargoPath -Value $cargo -Encoding utf8NoBOM -NoNewline

# App.tsx APP_VERSION
$app = Get-Content -Raw -Path $appPath
$app = $app -replace 'export const APP_VERSION = "[^"]+"', "export const APP_VERSION = `"$Version`""
Set-Content -Path $appPath -Value $app -Encoding utf8NoBOM -NoNewline

Write-Host "Listo. Archivos actualizados:"
Write-Host "  - package.json"
Write-Host "  - src-tauri/tauri.conf.json"
Write-Host "  - src-tauri/Cargo.toml"
Write-Host "  - src/App.tsx"
Write-Host ""
Write-Host "Próximo paso: git commit, tag v$Version y push del tag."
