[CmdletBinding()]
param(
  [switch]$UnsignedLocal,
  [switch]$SkipCopy,
  [string]$StagingDirectory = ""
)

$ErrorActionPreference = 'Stop'
# This script only compiles and stages the core. Candidate signing, verification,
# SHA-256 calculation and signed manifest creation happen in the installer chain.
if (-not $UnsignedLocal) {
  $mode = ($env:MAGIORIX_TASK_AUTH_MODE ?? 'required').Trim().ToLowerInvariant()
  if ($mode -in @('off', 'shadow')) { throw 'Production Candidate cannot use MAGIORIX_TASK_AUTH_MODE=off or shadow' }
  foreach ($name in @('MAGIORIX_TICKET_PUBLIC_KEYS_JSON', 'MAGIORIX_POLICY_PUBLIC_KEYS_JSON')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "Production Candidate requires $name (a public-key JSON trust root)" }
  }
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$CoreRoot = Join-Path $RepoRoot 'native\magiorix-core'
# Production retains the locked MSVC/1.85.0 defaults. A controlled local
# candidate may explicitly select an already-installed compatible toolchain.
$Target = ($env:MAGIORIX_RUST_TARGET ?? 'x86_64-pc-windows-msvc').Trim()
$Toolchain = ($env:MAGIORIX_RUST_TOOLCHAIN ?? '1.85.0').Trim()
if ($Target -notmatch '^x86_64-pc-windows-(msvc|gnu)$') { throw "Unsupported MAGIORIX_RUST_TARGET: $Target" }
if ($Toolchain -notmatch '^(stable|\d+\.\d+\.\d+)$') { throw "Invalid MAGIORIX_RUST_TOOLCHAIN: $Toolchain" }
$SourceExe = Join-Path $CoreRoot "target\$Target\release\magiorix-core.exe"
$RuntimeResources = Join-Path $RepoRoot 'runtime\magiorix-desktop\resources'
$RuntimeExe = Join-Path $RuntimeResources 'magiorix-core.exe'

if (-not (Test-Path -LiteralPath $CoreRoot -PathType Container)) { throw "Native core source is missing: $CoreRoot" }
if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) { throw 'rustup is required in the protected Windows build environment' }

& rustup toolchain install $Toolchain --profile minimal
if ($LASTEXITCODE -ne 0) { throw 'Unable to install the selected Rust toolchain' }
& rustup target add $Target --toolchain $Toolchain
if ($LASTEXITCODE -ne 0) { throw 'Unable to install the selected Windows target' }

Push-Location $CoreRoot
try {
  & cargo "+$Toolchain" build --locked --release --target $Target
  if ($LASTEXITCODE -ne 0) { throw 'Native core release compilation failed' }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $SourceExe -PathType Leaf)) { throw "Native core executable was not produced: $SourceExe" }
if (-not $SkipCopy) {
  $destinationDir = if ([string]::IsNullOrWhiteSpace($StagingDirectory)) { $RuntimeResources } else { $StagingDirectory }
  New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
  $destination = Join-Path $destinationDir 'magiorix-core.exe'
  Copy-Item -LiteralPath $SourceExe -Destination $destination -Force
  Write-Output "Native core compiled and staged: $destination"
}
