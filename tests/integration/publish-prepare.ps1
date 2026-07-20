$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$packageConfig = Get-Content -LiteralPath (Join-Path $projectRoot "app-source\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$releaseInfo = Join-Path $projectRoot "desktop-versions\windows\$($packageConfig.version)\release-info.json"
if (-not (Test-Path -LiteralPath $releaseInfo -PathType Leaf)) {
  throw "Build lane must create release-info.json before publish integration test"
}
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "magiorix-publish-test-$([Guid]::NewGuid().ToString('N'))"
$mutatedReleaseInfo = Join-Path (Split-Path -Parent $releaseInfo) "release-info-mutated-test.json"
$unsafeReleaseInfo = Join-Path (Split-Path -Parent $releaseInfo) "release-info-unsafe-test.json"
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  $publishScript = Join-Path $projectRoot "scripts\publish-magiorix-windows-release.ps1"
  & $publishScript -Stage Prepare -ReleaseInfoPath $releaseInfo -PublicRoot $tempRoot
  $versionManifest = Join-Path $tempRoot "releases\windows\$($packageConfig.version).json"
  $assetsPath = Join-Path $tempRoot "assets\desktop\$($packageConfig.assetsVersion)\assets.zip"
  if (-not (Test-Path -LiteralPath $versionManifest -PathType Leaf)) { throw "Prepare did not write the version manifest" }
  if (-not (Test-Path -LiteralPath $assetsPath -PathType Leaf)) { throw "Prepare did not copy assets" }

  $failedAsExpected = $false
  try {
    & $publishScript -Stage Prepare -ReleaseInfoPath $releaseInfo -PublicRoot $tempRoot
  } catch {
    $failedAsExpected = $_.Exception.Message -match "immutable"
  }
  if (-not $failedAsExpected) { throw "Prepare must reject replacing an existing candidate by default" }

  $mutatedRelease = Get-Content -LiteralPath $releaseInfo -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 20
  $mutatedRelease.releaseNotes = @("changed after prepare")
  $mutatedRelease | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $mutatedReleaseInfo -Encoding UTF8
  $failedAsExpected = $false
  try {
    & $publishScript -Stage Promote -ReleaseInfoPath $mutatedReleaseInfo -PublicRoot $tempRoot
  } catch {
    $failedAsExpected = $_.Exception.Message -match "changed after Prepare"
  }
  if (-not $failedAsExpected) { throw "Promote must reject release info changed after Prepare" }

  $unsafeRelease = Get-Content -LiteralPath $releaseInfo -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 20
  $unsafeRelease.desktop.fileName = "..\outside.exe"
  $unsafeRelease | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $unsafeReleaseInfo -Encoding UTF8
  $failedAsExpected = $false
  try {
    & $publishScript -Stage Prepare -ReleaseInfoPath $unsafeReleaseInfo -PublicRoot (Join-Path $tempRoot "unsafe")
  } catch {
    $failedAsExpected = $_.Exception.Message -match "safe base file name"
  }
  if (-not $failedAsExpected) { throw "Prepare must reject path traversal in artifact fileName" }

  Remove-Item -LiteralPath $versionManifest -Force
  Set-Content -LiteralPath $assetsPath -Value "corrupt asset fixture" -Encoding UTF8
  $failedAsExpected = $false
  try {
    & $publishScript -Stage Prepare -ReleaseInfoPath $releaseInfo -PublicRoot $tempRoot
  } catch {
    $failedAsExpected = $_.Exception.Message -match "mismatch"
  }
  if (-not $failedAsExpected) { throw "Prepare must not overwrite an existing asset version with different bytes" }
}
finally {
  Remove-Item -LiteralPath $mutatedReleaseInfo, $unsafeReleaseInfo -Force -ErrorAction SilentlyContinue
  $resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot)
  $systemTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedTempRoot.StartsWith($systemTempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTempRoot)) {
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
}

Write-Output "Publish prepare integration passed."
