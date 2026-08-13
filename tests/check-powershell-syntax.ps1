$ErrorActionPreference = "Stop"

$files = @(
  "scripts/build-pgy-chart-renderer.ps1",
  "scripts/build-magiorix-windows-installer.ps1",
  "scripts/publish-magiorix-windows-release.ps1",
  "scripts/verify-magiorix-windows-release.ps1",
  "tests/check-powershell-syntax.ps1",
  "tests/integration/publish-prepare.ps1",
  "tests/smoke-release.ps1"
)

$failed = $false
foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    Write-Error "PowerShell file is missing: $file"
    $failed = $true
    continue
  }
  $tokens = $null
  $errors = $null
  [Management.Automation.Language.Parser]::ParseFile(
    (Resolve-Path -LiteralPath $file),
    [ref]$tokens,
    [ref]$errors
  ) | Out-Null
  if ($errors.Count -gt 0) {
    $failed = $true
    foreach ($errorItem in $errors) {
      Write-Error "$file :: $($errorItem.Message)"
    }
  }
}

if ($failed) { exit 1 }
Write-Output "PowerShell syntax checks passed for $($files.Count) files."
