[CmdletBinding()]
param(
  [ValidateSet("Prepare", "Promote")]
  [string]$Stage = "Prepare",
  [string]$ReleaseInfoPath,
  [string]$PublicRoot
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageConfig = Get-Content -LiteralPath (Join-Path $projectRoot "app-source\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$packageConfig.version
if (-not $PublicRoot) {
  $PublicRoot = Join-Path $projectRoot "red-magic-api\public"
}
$resolvedPublicRoot = [IO.Path]::GetFullPath($PublicRoot)
if (-not $ReleaseInfoPath) {
  $ReleaseInfoPath = Join-Path $projectRoot "desktop-versions\windows\$version\release-info.json"
}
$resolvedReleaseInfo = [IO.Path]::GetFullPath($ReleaseInfoPath)
if (-not (Test-Path -LiteralPath $resolvedReleaseInfo -PathType Leaf)) {
  throw "Release info not found: $resolvedReleaseInfo"
}
$release = Get-Content -LiteralPath $resolvedReleaseInfo -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 20
if ([int]$release.schemaVersion -ne 1) { throw "Unsupported release manifest schemaVersion" }
if ([string]$release.desktop.version -ne $version) {
  throw "Release version $($release.desktop.version) does not match app-source/package.json $version"
}
foreach ($artifactName in @("desktop", "assets")) {
  if ([string]$release.$artifactName.version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Release $artifactName version must be a stable semantic version"
  }
}

function Normalize-Sha256([string]$Value) {
  return ($Value.Trim().ToLowerInvariant() -replace '^sha256:', '')
}

function Assert-SafeFileName([string]$Value, [string]$Field) {
  if ([string]::IsNullOrWhiteSpace($Value) -or
      [IO.Path]::GetFileName($Value) -ne $Value -or
      $Value -in @(".", "..") -or
      $Value.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -ge 0) {
    throw "$Field must be a safe base file name"
  }
}

function ConvertTo-CanonicalJson([object]$Value) {
  return ($Value | ConvertTo-Json -Depth 20 -Compress)
}

function Assert-LocalArtifact([string]$Path, [object]$Artifact, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "$Name artifact not found: $Path" }
  $item = Get-Item -LiteralPath $Path
  $sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($item.Length -ne [long]$Artifact.size) {
    throw "$Name size mismatch. Manifest=$($Artifact.size), local=$($item.Length)"
  }
  if ($sha256 -ne (Normalize-Sha256 ([string]$Artifact.sha256))) {
    throw "$Name SHA256 mismatch. Manifest=$($Artifact.sha256), local=$sha256"
  }
}

function Write-JsonAtomically([string]$Path, [object]$Value) {
  $directory = Split-Path -Parent $Path
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $tempPath = "$Path.tmp-$PID"
  $json = $Value | ConvertTo-Json -Depth 20
  [IO.File]::WriteAllText($tempPath, $json, [Text.UTF8Encoding]::new($false))
  [IO.File]::Move($tempPath, $Path, $true)
}

function Copy-ArtifactAtomically([string]$Source, [string]$Destination, [object]$Artifact, [string]$Name) {
  $directory = Split-Path -Parent $Destination
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
  $tempPath = "$Destination.tmp-$PID"
  try {
    Copy-Item -LiteralPath $Source -Destination $tempPath
    Assert-LocalArtifact $tempPath $Artifact $Name
    [IO.File]::Move($tempPath, $Destination, $false)
  }
  finally {
    if (Test-Path -LiteralPath $tempPath) {
      Remove-Item -LiteralPath $tempPath -Force
    }
  }
}

$releaseDirectory = Split-Path -Parent $resolvedReleaseInfo
Assert-SafeFileName ([string]$release.desktop.fileName) "desktop.fileName"
Assert-SafeFileName ([string]$release.assets.fileName) "assets.fileName"
$installerPath = Join-Path $releaseDirectory ([string]$release.desktop.fileName)
$assetsPath = Join-Path $releaseDirectory ([string]$release.assets.fileName)
$publicAssetsPath = Join-Path $resolvedPublicRoot "assets\desktop\$($release.assets.version)\assets.zip"
$publicReleaseDir = Join-Path $resolvedPublicRoot "releases\windows"
$versionManifestPath = Join-Path $publicReleaseDir "$($release.desktop.version).json"
$latestManifestPath = Join-Path $publicReleaseDir "latest.json"

Assert-LocalArtifact $installerPath $release.desktop "desktop"
Assert-LocalArtifact $assetsPath $release.assets "assets"

if ($Stage -eq "Prepare") {
  if (Test-Path -LiteralPath $latestManifestPath) {
    $latest = Get-Content -LiteralPath $latestManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 20
    if ([string]$latest.desktop.version -eq [string]$release.desktop.version) {
      throw "Version $version is already promoted and is immutable"
    }
  }
  if (Test-Path -LiteralPath $versionManifestPath) {
    throw "Version manifest already exists and is immutable: $versionManifestPath"
  }
  if (Test-Path -LiteralPath $publicAssetsPath) {
    Assert-LocalArtifact $publicAssetsPath $release.assets "published assets"
    Write-Output "Reusing immutable assets: $publicAssetsPath"
  } else {
    Copy-ArtifactAtomically $assetsPath $publicAssetsPath $release.assets "assets"
    Write-Output "Prepared assets atomically: $publicAssetsPath"
  }
  Write-JsonAtomically $versionManifestPath $release
  Write-Output "Prepared immutable version manifest: $versionManifestPath"
  Write-Output "Deploy the assets and version manifest, upload the installer, then run this script with -Stage Promote."
  exit 0
}

if (-not (Test-Path -LiteralPath $versionManifestPath -PathType Leaf)) {
  throw "Prepare stage has not created the version manifest: $versionManifestPath"
}
$preparedRelease = Get-Content -LiteralPath $versionManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json -Depth 20
if ((ConvertTo-CanonicalJson $preparedRelease) -ne (ConvertTo-CanonicalJson $release)) {
  throw "Release info changed after Prepare; rebuild and prepare a new version"
}
$verifyScript = Join-Path $PSScriptRoot "verify-magiorix-windows-release.ps1"
& $verifyScript -ManifestPath $versionManifestPath -SkipApi
Write-JsonAtomically $latestManifestPath $preparedRelease
Write-Output "Promoted latest manifest: $latestManifestPath"
Write-Output "Deploy latest.json last, restart the API, then run verify-magiorix-windows-release.ps1 without -SkipApi."
