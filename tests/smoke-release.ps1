$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageConfig = Get-Content -LiteralPath (Join-Path $projectRoot "app-source\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$packageConfig.version
$releaseDir = Join-Path $projectRoot "desktop-versions\windows\$version"
$releaseInfoPath = Join-Path $releaseDir "release-info.json"
if (-not (Test-Path -LiteralPath $releaseInfoPath -PathType Leaf)) {
  throw "Release info missing after build: $releaseInfoPath"
}
$release = Get-Content -LiteralPath $releaseInfoPath -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 20
if ([int]$release.schemaVersion -ne 1) { throw "Release info schemaVersion must be 1" }
if ([string]$release.desktop.version -ne $version) { throw "Desktop version does not match package.json" }
if ([string]$release.assets.version -ne [string]$packageConfig.assetsVersion) { throw "Assets version does not match package.json" }

foreach ($entry in @(
  @{ Name = "desktop"; Artifact = $release.desktop },
  @{ Name = "assets"; Artifact = $release.assets }
)) {
  $artifactPath = Join-Path $releaseDir ([string]$entry.Artifact.fileName)
  if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) { throw "$($entry.Name) artifact missing" }
  $item = Get-Item -LiteralPath $artifactPath
  $hash = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($item.Length -ne [long]$entry.Artifact.size) { throw "$($entry.Name) size mismatch" }
  if ($hash -ne ([string]$entry.Artifact.sha256).ToLowerInvariant()) { throw "$($entry.Name) SHA256 mismatch" }
}

$desktopPath = Join-Path $releaseDir ([string]$release.desktop.fileName)
$versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($desktopPath)
foreach ($expected in @{
  FileVersion = $version
  ProductVersion = $version
  ProductName = "magiorix"
  FileDescription = "magiorix"
}.GetEnumerator()) {
  if ([string]$versionInfo.($expected.Key) -ne [string]$expected.Value) {
    throw "Desktop EXE metadata mismatch for $($expected.Key): $($versionInfo.($expected.Key))"
  }
}
Add-Type -AssemblyName System.Drawing
$icon = [Drawing.Icon]::ExtractAssociatedIcon($desktopPath)
if ($null -eq $icon) { throw "Desktop EXE icon could not be extracted" }

$runtimeSource = Get-Content -LiteralPath (Join-Path $projectRoot "app-source\dist-electron\index.js") -Raw -Encoding UTF8
foreach ($marker in @("pgyHasSingleInstanceLock", "pgyDesktopUpdateActive", ".partial-", "pgyAssetExpectedChecksum", "pgyVersionPointerBackup")) {
  if (-not $runtimeSource.Contains($marker)) { throw "Runtime build is missing marker: $marker" }
}

Write-Output "Release smoke passed for magiorix $version."
