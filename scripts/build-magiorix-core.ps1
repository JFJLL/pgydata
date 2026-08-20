[CmdletBinding()]
param(
  [switch]$UnsignedLocal,
  [switch]$SkipCopy
)

$ErrorActionPreference = 'Stop'
# Production Candidates embed distinct public Ticket and policy trust roots in the native binary.
if (-not $UnsignedLocal) {
  $mode = ($env:MAGIORIX_TASK_AUTH_MODE ?? 'required').Trim().ToLowerInvariant()
  if ($mode -in @('off', 'shadow')) { throw 'Production Candidate cannot use MAGIORIX_TASK_AUTH_MODE=off or shadow' }
  foreach ($name in @('MAGIORIX_TICKET_PUBLIC_KEYS_JSON', 'MAGIORIX_POLICY_PUBLIC_KEYS_JSON')) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "Production Candidate requires $name (a public-key JSON trust root)" }
  }
}
$RepoRoot = Split-Path -Parent $PSScriptRoot
$CoreRoot = Join-Path $RepoRoot 'native\magiorix-core'
$Target = 'x86_64-pc-windows-msvc'
$Toolchain = '1.85.0'
$SourceExe = Join-Path $CoreRoot "target\$Target\release\magiorix-core.exe"
$RuntimeResources = Join-Path $RepoRoot 'runtime\magiorix-desktop\resources'
$RuntimeExe = Join-Path $RuntimeResources 'magiorix-core.exe'
$MetadataPath = Join-Path $RuntimeResources 'magiorix-core.metadata.json'

if (-not (Test-Path -LiteralPath $CoreRoot -PathType Container)) { throw "Native core source is missing: $CoreRoot" }
if (-not (Get-Command rustup -ErrorAction SilentlyContinue)) { throw 'rustup 1.85.0 is required only in the protected Windows build environment' }

& rustup toolchain install $Toolchain --profile minimal
if ($LASTEXITCODE -ne 0) { throw 'Unable to install the locked Rust toolchain' }
& rustup target add $Target --toolchain $Toolchain
if ($LASTEXITCODE -ne 0) { throw 'Unable to install the Windows MSVC target' }

Push-Location $CoreRoot
try {
  & cargo "+$Toolchain" build --locked --release --target $Target
  if ($LASTEXITCODE -ne 0) { throw 'Native core release compilation failed' }
} finally {
  Pop-Location
}

if (-not (Test-Path -LiteralPath $SourceExe -PathType Leaf)) { throw "Native core executable was not produced: $SourceExe" }
if (-not $SkipCopy) {
  New-Item -ItemType Directory -Force -Path $RuntimeResources | Out-Null
  Copy-Item -LiteralPath $SourceExe -Destination $RuntimeExe -Force
  $sha256 = (Get-FileHash -LiteralPath $RuntimeExe -Algorithm SHA256).Hash.ToUpperInvariant()
  $metadata = [ordered]@{
    appVersion = '1.4.2'
    coreVersion = '1.4.2'
    coreProtocolVersion = 1
    coreSha256 = $sha256
    minimumCoreVersion = '1.4.2'
    authenticode = if ($UnsignedLocal) { 'unsigned-local' } else { 'unsigned-pending-signature' }
  }
  $metadata | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $MetadataPath -Encoding utf8NoBOM
  if (-not $UnsignedLocal) {
    throw 'Refusing to mark a production core ready before the protected signing pipeline applies and verifies Authenticode'
  }
  Write-Output "Native core copied in explicit unsigned-local mode: $RuntimeExe"
}
