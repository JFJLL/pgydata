[CmdletBinding()]
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)
$ErrorActionPreference = 'Stop'
$projectRoot = $ProjectRoot
$electronDist = Join-Path $projectRoot 'node_modules\electron\dist'
$runtimeDir = Join-Path $projectRoot 'runtime\magiorix-desktop'
$backupRoot = Join-Path (Split-Path -Parent $projectRoot) 'pgydata-agent-backups\electron-runtime-33.0.2'
$preserveDir = Join-Path ([IO.Path]::GetTempPath()) ('magiorix-runtime-preserve-' + [guid]::NewGuid().ToString('N'))
if (-not (Test-Path -LiteralPath (Join-Path $electronDist 'electron.exe') -PathType Leaf)) { throw "Electron 35.7.5 distribution is not installed: $electronDist" }
if (-not (Test-Path -LiteralPath $runtimeDir -PathType Container)) { throw "Runtime directory is missing: $runtimeDir" }
$version = (Get-Content -Raw -LiteralPath (Join-Path $electronDist 'version')).Trim()
if ($version -ne '35.7.5') { throw "Expected Electron 35.7.5, got $version" }
New-Item -ItemType Directory -Force -Path $preserveDir | Out-Null
$preserved = @('app.asar','app-update.yml','app.ico','elevate.exe','pgy-chart-renderer.exe','pgy-chart-renderer.build.sha256','magiorix-core.exe','magiorix-core.metadata.json')
foreach ($name in $preserved) {
  $source = Join-Path $runtimeDir "resources\$name"
  if (Test-Path -LiteralPath $source -PathType Leaf) { Copy-Item -LiteralPath $source -Destination (Join-Path $preserveDir $name) -Force }
}
if (Test-Path -LiteralPath $backupRoot) { throw "Rollback backup already exists: $backupRoot" }
Move-Item -LiteralPath $runtimeDir -Destination $backupRoot
try {
  Copy-Item -LiteralPath $electronDist -Destination $runtimeDir -Recurse -Force
  foreach ($name in $preserved) {
    $source = Join-Path $preserveDir $name
    if (Test-Path -LiteralPath $source -PathType Leaf) { Copy-Item -LiteralPath $source -Destination (Join-Path $runtimeDir "resources\$name") -Force }
  }
  Rename-Item -LiteralPath (Join-Path $runtimeDir 'electron.exe') -NewName 'magiorix.exe'
  Set-Content -LiteralPath (Join-Path $runtimeDir 'electron-version.txt') -Value $version -Encoding ascii
  Write-Output "Electron runtime upgraded to $version. Rollback backup: $backupRoot"
} catch {
  if (Test-Path -LiteralPath $runtimeDir) { Move-Item -LiteralPath $runtimeDir -Destination ($runtimeDir + '.failed') -Force }
  Move-Item -LiteralPath $backupRoot -Destination $runtimeDir
  throw
} finally {
  if ((Test-Path -LiteralPath $preserveDir) -and (Test-Path -LiteralPath $backupRoot)) {
    Move-Item -LiteralPath $preserveDir -Destination (Join-Path $backupRoot 'preserved-resources') -Force
  }
}
