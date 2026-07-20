[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ManifestPath,
  [string]$ApiBaseUrl = "https://magiorix.red-magic.cn",
  [switch]$SkipApi
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

function Normalize-Sha256([string]$Value) {
  return ($Value.Trim().ToLowerInvariant() -replace '^sha256:', '')
}

function Assert-Artifact([object]$Artifact, [string]$Name) {
  if (-not $Artifact) { throw "Manifest is missing $Name" }
  if ([string]$Artifact.version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Manifest has invalid $Name.version"
  }
  $fileName = [string]$Artifact.fileName
  if ([string]::IsNullOrWhiteSpace($fileName) -or [IO.Path]::GetFileName($fileName) -ne $fileName -or $fileName -in @(".", "..")) {
    throw "Manifest has invalid $Name.fileName"
  }
  if ([string]$Artifact.sha256 -notmatch '^[A-Fa-f0-9]{64}$') {
    throw "Manifest has invalid $Name.sha256"
  }
  if ([long]$Artifact.size -le 0) { throw "Manifest has invalid $Name.size" }
  $uri = $null
  if (-not [Uri]::TryCreate([string]$Artifact.downloadUrl, [UriKind]::Absolute, [ref]$uri) -or $uri.Scheme -notin @('http', 'https')) {
    throw "Manifest has invalid $Name.downloadUrl"
  }
}

function Test-RemoteArtifact([object]$Artifact, [string]$Name, [string]$TempRoot) {
  $downloadPath = Join-Path $TempRoot "$Name.download"
  Write-Output "Downloading $Name from $($Artifact.downloadUrl)"
  Invoke-WebRequest -UseBasicParsing -Uri $Artifact.downloadUrl -OutFile $downloadPath
  $item = Get-Item -LiteralPath $downloadPath
  $actualSha = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $expectedSha = Normalize-Sha256 ([string]$Artifact.sha256)
  if ($item.Length -ne [long]$Artifact.size) {
    throw "$Name remote size mismatch. Expected $($Artifact.size), actual $($item.Length)"
  }
  if ($actualSha -ne $expectedSha) {
    throw "$Name remote SHA256 mismatch. Expected $expectedSha, actual $actualSha"
  }
  Write-Output "Verified $Name size=$($item.Length) sha256=$actualSha"
}

function Assert-ApiArtifact([object]$Actual, [object]$Expected, [string]$Name, [string]$SizeField = "size") {
  if ([string]$Actual.version -ne [string]$Expected.version) { throw "$Name API version does not match manifest" }
  if ([string]$Actual.fileName -ne [string]$Expected.fileName) { throw "$Name API fileName does not match manifest" }
  if ([string]$Actual.downloadUrl -ne [string]$Expected.downloadUrl) { throw "$Name API downloadUrl does not match manifest" }
  if ([long]$Actual.$SizeField -ne [long]$Expected.size) { throw "$Name API $SizeField does not match manifest" }
  if ((Normalize-Sha256 ([string]$Actual.checksum)) -ne (Normalize-Sha256 ([string]$Expected.sha256))) {
    throw "$Name API SHA256 does not match manifest"
  }
}

$resolvedManifest = [IO.Path]::GetFullPath($ManifestPath)
if (-not (Test-Path -LiteralPath $resolvedManifest -PathType Leaf)) {
  throw "Release manifest not found: $resolvedManifest"
}
$manifest = Get-Content -LiteralPath $resolvedManifest -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 20
if ([int]$manifest.schemaVersion -ne 1) { throw "Unsupported release manifest schemaVersion" }
Assert-Artifact $manifest.desktop "desktop"
Assert-Artifact $manifest.assets "assets"

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) "magiorix-release-verify-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $tempRoot | Out-Null
try {
  Test-RemoteArtifact $manifest.desktop "desktop" $tempRoot
  Test-RemoteArtifact $manifest.assets "assets" $tempRoot

  if (-not $SkipApi) {
    $baseUrl = $ApiBaseUrl.TrimEnd('/')
    $desktopResponse = Invoke-RestMethod -Uri "$baseUrl/api/desktop-download/latest"
    $assetsResponse = Invoke-RestMethod -Uri "$baseUrl/api/frontend-assets/latest/desktop"
    $checkResponse = Invoke-RestMethod -Uri "$baseUrl/api/desktop-versions/check?currentVersion=0.0.0&platform=windows"
    if ($desktopResponse.code -ne 200) { throw "Desktop latest API returned code $($desktopResponse.code)" }
    if ($assetsResponse.code -ne 200) { throw "Assets latest API returned code $($assetsResponse.code)" }
    if ($checkResponse.code -ne 200) { throw "Desktop version check API returned code $($checkResponse.code)" }
    Assert-ApiArtifact $desktopResponse.data $manifest.desktop "Desktop latest"
    Assert-ApiArtifact $assetsResponse.data $manifest.assets "Assets latest"
    Assert-ApiArtifact $checkResponse.data $manifest.desktop "Desktop version check" "fileSize"
    if ([string]$checkResponse.data.latestVersion -ne [string]$manifest.desktop.version -or -not [bool]$checkResponse.data.hasUpdate) {
      throw "Desktop version check API update state does not match manifest"
    }
    Write-Output "Verified latest APIs against release manifest"
  }
}
finally {
  $resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot)
  $systemTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if ($resolvedTempRoot.StartsWith($systemTempRoot, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTempRoot)) {
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
}

Write-Output "Release verification passed: $resolvedManifest"
