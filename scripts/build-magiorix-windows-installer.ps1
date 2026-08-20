[CmdletBinding()]
param(
  [switch]$OverwriteCandidate,
  # 仅用于已获用户确认的本机修复候选包：允许复用已发布版本号，但绝不改写
  # 发布 manifest/latest，也不能用于上传或晋升发布。
  [switch]$LocalRepairCandidate,
  [string]$InstallerBaseUrl = "https://redmagic.oss-cn-beijing.aliyuncs.com/exe",
  [string]$AssetsBaseUrl = "https://magiorix.red-magic.cn/assets/desktop"
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageConfigPath = Join-Path $projectRoot "app-source\package.json"
$packageConfig = Get-Content -LiteralPath $packageConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$packageConfig.version
$assetsVersion = [string]$packageConfig.assetsVersion
if ($version -notmatch '^\d+\.\d+\.\d+$') {
  throw "Invalid app version in app-source/package.json: $version"
}
if ($assetsVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw "Invalid assetsVersion in app-source/package.json: $assetsVersion"
}
$platform = "windows"
$appId = "magiorix-desktop"
$sourceAppDir = Join-Path $projectRoot "runtime\magiorix-desktop"
$sourceAssetsDir = Join-Path $projectRoot "assets\$assetsVersion"
$appSourceDir = Join-Path $projectRoot "app-source"
$outDir = Join-Path $projectRoot "desktop-versions\$platform\$version"
$buildWorkDir = Join-Path $outDir "_build"
$payloadDir = Join-Path $buildWorkDir "payload"
$installerDir = Join-Path $buildWorkDir "installer"
$setupFileName = "$appId-$version-$platform.exe"
$setupExe = Join-Path $outDir $setupFileName
$assetsZipFileName = "$appId-$assetsVersion-assets.zip"
$appDisplayName = "magiorix"
$appFileDescription = "magiorix"
$appInstallDirName = "magiorix"
$shortcutName = "magiorix"
$sourceExeName = "magiorix.exe"
$installedExeName = "$appInstallDirName.exe"
$appIconResource = "app.ico"
$installLogPath = "%TEMP%\magiorix-install.log"
$outAssetsZip = Join-Path $outDir $assetsZipFileName
$setupSha256Path = Join-Path $outDir "$($setupFileName).sha256.txt"
$releaseInfoPath = Join-Path $outDir "release-info.json"
$publishedReleaseDir = Join-Path $projectRoot "red-magic-api\public\releases\windows"
$publishedVersionManifest = Join-Path $publishedReleaseDir "$version.json"
$publishedLatestManifest = Join-Path $publishedReleaseDir "latest.json"

function Get-FullPath([string]$Path) {
  return [System.IO.Path]::GetFullPath($Path)
}

function Remove-DirectorySafe([string]$Path, [string]$Root) {
  $fullPath = Get-FullPath $Path
  $fullRoot = (Get-FullPath $Root).TrimEnd('\') + '\'
  if (-not $fullPath.StartsWith($fullRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove outside build output root: $fullPath"
  }
  if (Test-Path -LiteralPath $fullPath) {
    Remove-Item -LiteralPath $fullPath -Recurse -Force
  }
}

function Find-Makensis {
  # 某些受控终端会缺失 ProgramFiles(x86)；先判断环境变量再 Join-Path，
  # 否则路径探测本身会因 null 参数失败，掩盖真正的 NSIS 可用性结果。
  $candidates = @(
    $env:NSIS_MAKENSIS,
    $(if (-not [string]::IsNullOrWhiteSpace(${env:ProgramFiles(x86)})) { Join-Path ${env:ProgramFiles(x86)} "NSIS\makensis.exe" }),
    $(if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) { Join-Path $env:ProgramFiles "NSIS\makensis.exe" }),
    "C:\Program Files (x86)\NSIS\makensis.exe",
    "C:\Program Files\NSIS\makensis.exe"
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  $cmd = Get-Command "makensis.exe" -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  return $null
}

function Find-Rcedit {
  $candidates = @(
    (Join-Path $projectRoot "tools\rcedit-x64.exe")
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

function Assert-Rcedit {
  $rcedit = Find-Rcedit
  if (-not $rcedit) {
    throw "Pinned rcedit is required at tools\rcedit-x64.exe; refusing to build an unbranded Candidate."
  }
  $checksumPath = Join-Path $projectRoot "tools\rcedit-x64.exe.sha256"
  if (-not (Test-Path -LiteralPath $checksumPath -PathType Leaf)) {
    throw "Pinned rcedit checksum is missing: $checksumPath"
  }
  $checksumText = Get-Content -LiteralPath $checksumPath -Raw -Encoding ASCII
  $expected = [regex]::Match($checksumText, '(?i)\b[0-9a-f]{64}\b').Value.ToLowerInvariant()
  if ($expected -notmatch '^[0-9a-f]{64}$') {
    throw "Pinned rcedit checksum is invalid: $checksumPath"
  }
  $actual = (Get-FileHash -LiteralPath $rcedit -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expected) {
    throw "Pinned rcedit checksum mismatch. Expected $expected, got $actual"
  }
  $metadataPath = Join-Path $projectRoot "tools\rcedit-x64.exe.metadata.json"
  if (-not (Test-Path -LiteralPath $metadataPath -PathType Leaf)) {
    throw "Pinned rcedit provenance is missing: $metadataPath"
  }
  $metadata = Get-Content -LiteralPath $metadataPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $metadataHash = ([string]$metadata.sha256).ToLowerInvariant()
  if ([string]$metadata.package -ne "rcedit" -or [string]$metadata.version -ne "5.0.2" -or [string]$metadata.artifact -ne "rcedit-x64.exe" -or $metadataHash -ne $actual) {
    throw "Pinned rcedit provenance does not match the checked binary"
  }
  return $rcedit
}

function Set-ExeBrand([string]$ExePath, [string]$IconPath, [string]$OriginalFilename = $installedExeName) {
  $rcedit = Assert-Rcedit
  if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Executable not found for branding: $ExePath"
  }
  if (-not (Test-Path -LiteralPath $IconPath)) {
    throw "Icon not found for branding: $IconPath"
  }

  $args = @(
    $ExePath,
    "--set-icon", $IconPath,
    "--set-version-string", "FileDescription", $appFileDescription,
    "--set-version-string", "ProductName", $appDisplayName,
    "--set-version-string", "InternalName", $appDisplayName,
    "--set-version-string", "OriginalFilename", $OriginalFilename,
    "--set-file-version", $version,
    "--set-product-version", $version
  )
  $process = Start-Process -FilePath $rcedit -ArgumentList $args -WindowStyle Hidden -PassThru
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "rcedit failed for $ExePath with exit code $($process.ExitCode)"
  }
  $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($ExePath)
  $metadata = @{
    FileVersion = [string]$versionInfo.FileVersion
    ProductVersion = [string]$versionInfo.ProductVersion
    ProductName = [string]$versionInfo.ProductName
    FileDescription = [string]$versionInfo.FileDescription
  }
  if ($metadata.FileVersion -ne $version -or $metadata.ProductVersion -ne $version) {
    throw "Executable version metadata mismatch: FileVersion=$($metadata.FileVersion), ProductVersion=$($metadata.ProductVersion), expected $version"
  }
  if ($metadata.ProductName -ne $appDisplayName -or $metadata.FileDescription -ne $appFileDescription) {
    throw "Executable product metadata mismatch: ProductName=$($metadata.ProductName), FileDescription=$($metadata.FileDescription)"
  }
  Write-Output ("Validated executable metadata: {0}" -f (@{
      file = [System.IO.Path]::GetFileName($ExePath)
      FileVersion = $metadata.FileVersion
      ProductVersion = $metadata.ProductVersion
      ProductName = $metadata.ProductName
      FileDescription = $metadata.FileDescription
      OriginalFilename = [string]$versionInfo.OriginalFilename
    } | ConvertTo-Json -Compress))
}

function New-IntegrityManifest([string]$AssetsDir) {
  if (-not (Test-Path -LiteralPath $AssetsDir)) {
    throw "Assets directory not found: $AssetsDir"
  }

  $files = Get-ChildItem -LiteralPath $AssetsDir -Recurse -File |
    Where-Object {
      $relative = [System.IO.Path]::GetRelativePath($AssetsDir, $_.FullName).Replace('\', '/')
      $_.Extension -in @(".html", ".js", ".css") -and $relative -ne "integrity-manifest.json"
    } |
    Sort-Object FullName

  $entries = foreach ($file in $files) {
    [ordered]@{
      path = [System.IO.Path]::GetRelativePath($AssetsDir, $file.FullName).Replace('\', '/')
      size = $file.Length
      sha256 = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  }

  $manifest = [ordered]@{
    version = $assetsVersion
    algorithm = "sha256"
    files = @($entries)
  }

  $manifestPath = Join-Path $AssetsDir "integrity-manifest.json"
  $manifestJson = $manifest | ConvertTo-Json -Depth 6
  $currentManifest = if (Test-Path -LiteralPath $manifestPath) {
    Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8
  } else {
    $null
  }
  $currentNormalized = if ($null -eq $currentManifest) { "" } else { $currentManifest.Trim() }
  if ($currentNormalized -ne $manifestJson.Trim()) {
    Set-Content -LiteralPath $manifestPath -Value $manifestJson -Encoding UTF8
  }
  return $manifestPath
}

function New-AssetsZip([string]$AssetsDir, [string]$ZipPath) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ZipPath) | Out-Null
  if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
  }
  Compress-Archive -Path (Join-Path $AssetsDir "*") -DestinationPath $ZipPath -CompressionLevel Optimal
}

function Invoke-CheckedProcess([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
  Push-Location $WorkingDirectory
  try {
    & $FilePath $Arguments
    if ($LASTEXITCODE -ne 0) {
      throw "$FilePath failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Escape-NsisPath([string]$Path) {
  return $Path.Replace('\', '\\')
}

if (-not (Test-Path -LiteralPath $sourceAppDir)) {
  throw "Source app directory not found: $sourceAppDir"
}
if (-not (Test-Path -LiteralPath $sourceAssetsDir)) {
  throw "Source assets directory not found: $sourceAssetsDir"
}
if (-not (Test-Path -LiteralPath $appSourceDir)) {
  throw "Electron app source directory not found: $appSourceDir"
}

$makensis = Find-Makensis
if (-not $makensis) {
  throw "NSIS makensis.exe not found. Install NSIS or set NSIS_MAKENSIS. Expected: C:\Program Files (x86)\NSIS\makensis.exe"
}

$node = (Get-Command "node.exe" -ErrorAction SilentlyContinue)
if (-not $node) {
  $node = Get-Command "node" -ErrorAction SilentlyContinue
}
if (-not $node) {
  throw "node executable not found; cannot patch frontend assets or pack app.asar"
}

Assert-Rcedit | Out-Null

if ($LocalRepairCandidate -and -not $OverwriteCandidate) {
  throw "LocalRepairCandidate requires -OverwriteCandidate and is limited to a local repair candidate."
}
$allowPublishedVersionLocalRepair = $LocalRepairCandidate -and $OverwriteCandidate
if (Test-Path -LiteralPath $publishedVersionManifest -PathType Leaf) {
  if (-not $allowPublishedVersionLocalRepair) {
    throw "Version $version already has a published manifest and is immutable. Bump the patch version."
  }
  Write-Warning "Building a local repair candidate for published version $version. The published manifest will not be modified."
}
if (Test-Path -LiteralPath $publishedLatestManifest -PathType Leaf) {
  $publishedLatest = Get-Content -LiteralPath $publishedLatestManifest -Raw -Encoding UTF8 | ConvertFrom-Json
  if ([string]$publishedLatest.desktop.version -eq $version -and -not $allowPublishedVersionLocalRepair) {
    throw "Version $version is already latest and is immutable. Bump the patch version."
  }
  if ([string]$publishedLatest.desktop.version -eq $version -and $allowPublishedVersionLocalRepair) {
    Write-Warning "latest.json remains untouched; this candidate is for local installation verification only."
  }
}
if ((Test-Path -LiteralPath $outDir) -and -not $OverwriteCandidate) {
  $existingCandidate = @($setupExe, $outAssetsZip, $releaseInfoPath) | Where-Object { Test-Path -LiteralPath $_ }
  if ($existingCandidate.Count -gt 0) {
    throw "Release candidate already exists for $version. Use -OverwriteCandidate only before this version is published."
  }
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Remove-DirectorySafe -Path $buildWorkDir -Root $outDir
New-Item -ItemType Directory -Force -Path $payloadDir, $installerDir | Out-Null

Write-Output "Applying frontend asset patches..."
Invoke-CheckedProcess -FilePath $node.Source -Arguments @((Join-Path $PSScriptRoot "apply-magiorix-frontend-patches.js")) -WorkingDirectory $projectRoot

Write-Output "Generating resource integrity manifest..."
$manifestPath = New-IntegrityManifest -AssetsDir $sourceAssetsDir
Write-Output "Manifest: $manifestPath"

Write-Output "Rebuilding assets.zip..."
New-AssetsZip -AssetsDir $sourceAssetsDir -ZipPath $outAssetsZip

Write-Output "Rebuilding bundled PGY chart renderer..."
Invoke-CheckedProcess -FilePath (Join-Path $PSHOME "pwsh.exe") -Arguments @("-NoProfile", "-File", (Join-Path $PSScriptRoot "build-pgy-chart-renderer.ps1")) -WorkingDirectory $projectRoot

Write-Output "Packing Electron app.asar from app-source..."
$sourceResourcesDir = Join-Path $sourceAppDir "resources"
$asarOut = Join-Path $sourceResourcesDir "app.asar"
$asarOutputOverride = [string]$env:MAGIORIX_ASAR_OUTPUT
if (-not [string]::IsNullOrWhiteSpace($asarOutputOverride)) {
  $asarOut = [System.IO.Path]::GetFullPath($asarOutputOverride)
  $resourcesRoot = ([System.IO.Path]::GetFullPath($sourceResourcesDir)).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $asarOut.StartsWith($resourcesRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "MAGIORIX_ASAR_OUTPUT must stay inside the runtime resources directory: $resourcesRoot"
  }
  Write-Output "Using ASAR output override: $asarOut"
}
Invoke-CheckedProcess -FilePath $node.Source -Arguments @((Join-Path $PSScriptRoot "apply-magiorix-runtime-patches.js")) -WorkingDirectory $projectRoot
Invoke-CheckedProcess -FilePath $node.Source -Arguments @((Join-Path $PSScriptRoot "pack-asar.js"), $appSourceDir, $asarOut, "--require", "node_modules/unzipper/package.json") -WorkingDirectory $projectRoot
Invoke-CheckedProcess -FilePath $node.Source -Arguments @((Join-Path $PSScriptRoot "verify-asar-entries.js"), $asarOut, "node_modules/unzipper/package.json", "node_modules/unzipper/unzip.js") -WorkingDirectory $projectRoot

$payloadAppDir = Join-Path $payloadDir "app"
$payloadAssetsRoot = Join-Path $payloadDir "assets"
$payloadAssetsVersionDir = Join-Path $payloadAssetsRoot $assetsVersion
New-Item -ItemType Directory -Force -Path $payloadAppDir, $payloadAssetsVersionDir | Out-Null

$rootFiles = @(
  "chrome_100_percent.pak",
  "chrome_200_percent.pak",
  "d3dcompiler_47.dll",
  "ffmpeg.dll",
  "icudtl.dat",
  "libEGL.dll",
  "libGLESv2.dll",
  "LICENSE.electron.txt",
  "LICENSES.chromium.html",
  "resources.pak",
  "snapshot_blob.bin",
  "v8_context_snapshot.bin",
  "vk_swiftshader_icd.json",
  "vk_swiftshader.dll",
  "vulkan-1.dll"
)

$sourceExe = Join-Path $sourceAppDir $sourceExeName
if (-not (Test-Path -LiteralPath $sourceExe)) {
  throw "Required runtime file not found: $sourceExe"
}
Copy-Item -LiteralPath $sourceExe -Destination (Join-Path $payloadAppDir $installedExeName) -Force

foreach ($file in $rootFiles) {
  $source = Join-Path $sourceAppDir $file
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Required runtime file not found: $source"
  }
  Copy-Item -LiteralPath $source -Destination $payloadAppDir -Force
}

New-Item -ItemType Directory -Force -Path (Join-Path $payloadAppDir "resources") | Out-Null
foreach ($file in @("app.asar", "app-update.yml", "elevate.exe", "pgy-chart-renderer.exe", $appIconResource)) {
  $source = if ($file -eq "app.asar") { $asarOut } else { Join-Path $sourceResourcesDir $file }
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Required resource file not found: $source"
  }
    Copy-Item -LiteralPath $source -Destination (Join-Path $payloadAppDir "resources") -Force
}

# 交付防线：安装 payload 内的 app.asar 必须与刚刚打包完成的运行包逐字节一致。
# 这避免“源码/项目 runtime 已更新，但安装包仍携带旧主进程”的前后端错配。
$payloadAsar = Join-Path $payloadAppDir "resources\app.asar"
$sourceAsarHash = (Get-FileHash -LiteralPath $asarOut -Algorithm SHA256).Hash
$payloadAsarHash = (Get-FileHash -LiteralPath $payloadAsar -Algorithm SHA256).Hash
if ($sourceAsarHash -ne $payloadAsarHash) {
  throw "Installer payload app.asar hash mismatch. Source=$sourceAsarHash Payload=$payloadAsarHash"
}
Write-Output "Verified installer payload app.asar SHA256: $payloadAsarHash"

Set-ExeBrand -ExePath (Join-Path $payloadAppDir $installedExeName) -IconPath (Join-Path $payloadAppDir "resources\$appIconResource")

New-Item -ItemType Directory -Force -Path (Join-Path $payloadAppDir "locales") | Out-Null
foreach ($file in @("zh-CN.pak", "en-US.pak")) {
  $source = Join-Path (Join-Path $sourceAppDir "locales") $file
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Required locale file not found: $source"
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $payloadAppDir "locales") -Force
}

Copy-Item -Path (Join-Path $sourceAssetsDir "*") -Destination $payloadAssetsVersionDir -Recurse -Force

$iconPath = Join-Path (Join-Path $sourceAppDir "resources") $appIconResource
$nsiPath = Join-Path $installerDir "magiorix-Setup.nsi"
$payloadAppNsis = Escape-NsisPath $payloadAppDir
$payloadAssetsNsis = Escape-NsisPath $payloadAssetsVersionDir
$setupExeNsis = Escape-NsisPath $setupExe
$iconNsis = Escape-NsisPath $iconPath

$nsi = @"
Unicode true
!include "MUI2.nsh"
!include "StrFunc.nsh"
`${Using:StrFunc} StrStr

Name "$appDisplayName"
OutFile "$setupExeNsis"
VIProductVersion "$version.0"
VIAddVersionKey /LANG=2052 "ProductName" "$appDisplayName"
VIAddVersionKey /LANG=2052 "FileDescription" "$appFileDescription"
VIAddVersionKey /LANG=2052 "LegalCopyright" "magiorix"
VIAddVersionKey /LANG=2052 "FileVersion" "$version"
VIAddVersionKey /LANG=2052 "ProductVersion" "$version"
VIAddVersionKey /LANG=2052 "InternalName" "$appDisplayName"
VIAddVersionKey /LANG=2052 "OriginalFilename" "$setupFileName"
InstallDir "`$LOCALAPPDATA\Programs\$appInstallDirName"
RequestExecutionLevel user
ShowInstDetails show
XPStyle on
SetCompressor /SOLID lzma

!define MUI_ICON "$iconNsis"
!define MUI_UNICON "$iconNsis"
!define MUI_FINISHPAGE_RUN "`$INSTDIR\$installedExeName"
!define MUI_FINISHPAGE_RUN_TEXT "打开$appDisplayName"
!define MUI_FINISHPAGE_SHOWREADME ""
!define MUI_FINISHPAGE_SHOWREADME_TEXT "添加桌面快捷方式"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateDesktopShortcut
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"

!define APP_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\magiorix"

Var InstallLog
Var AssetsRoot
Var AssetsTarget
Var AssetsStage
Var AssetsBackup

Function .onInit
  SetShellVarContext current
  StrCpy `$InstallLog "`$TEMP\magiorix-install.log"
  Delete "`$InstallLog"
  FileOpen `$0 "`$InstallLog" w
  FileWrite `$0 "magiorix installer log$\r$\n"
  FileClose `$0
  Push "等待旧版 magiorix 进程退出"
  Call Log
  Call WaitForMagiorix
  Call StopHelperProcesses
FunctionEnd

Function Log
  Exch `$0
  DetailPrint "`$0"
  FileOpen `$1 "`$InstallLog" a
  FileWrite `$1 "`$0$\r$\n"
  FileClose `$1
  Pop `$0
FunctionEnd

Function WaitForMagiorix
  StrCpy `$2 0
  wait_for_magiorix:
    nsExec::ExecToStack '"`$SYSDIR\tasklist.exe" /NH /FO CSV /FI "IMAGENAME eq magiorix.exe"'
    Pop `$0
    Pop `$1
    `${StrStr} `$3 `$1 "magiorix.exe"
    StrCmp `$3 "" magiorix_stopped
    Sleep 500
    IntOp `$2 `$2 + 1
    IntCmp `$2 60 magiorix_timeout wait_for_magiorix magiorix_timeout
  magiorix_timeout:
    Push "等待 magiorix.exe 退出超时（30 秒）。请在任务管理器结束进程后重试。"
    Call FailInstall
  magiorix_stopped:
    Push "旧版 magiorix 进程已退出"
    Call Log
FunctionEnd

Function StopHelperProcesses
  ; 内置绘图程序与提权助手都是短暂的辅助进程，安装前先等待其退出，
  ; 等待无果时强制结束，避免残留句柄锁住安装目录中的文件导致复制失败。
  StrCpy `$4 "pgy-chart-renderer.exe"
  Call WaitThenKillProcess
  StrCpy `$4 "elevate.exe"
  Call WaitThenKillProcess
FunctionEnd

Function WaitThenKillProcess
  StrCpy `$2 0
  wait_then_kill:
    nsExec::ExecToStack '"`$SYSDIR\tasklist.exe" /NH /FO CSV /FI "IMAGENAME eq `$4"'
    Pop `$0
    Pop `$1
    `${StrStr} `$3 `$1 "`$4"
    StrCmp `$3 "" helper_stopped
    Sleep 500
    IntOp `$2 `$2 + 1
    IntCmp `$2 30 helper_force_kill wait_then_kill helper_force_kill
  helper_force_kill:
    nsExec::ExecToStack '"`$SYSDIR\taskkill.exe" /IM "`$4" /F'
    Pop `$0
    Pop `$1
    Push "已强制结束残留辅助进程：`$4"
    Call Log
  helper_stopped:
FunctionEnd

Function FailInstall
  Exch `$0
  Push "安装失败：`$0"
  Call Log
  MessageBox MB_ICONSTOP|MB_OK "安装失败：`$0$\r$\n$\r$\n日志路径：`$InstallLog"
  Abort
FunctionEnd

Function CreateDesktopShortcut
  SetShellVarContext current
  CreateShortCut "`$DESKTOP\$shortcutName.lnk" "`$INSTDIR\$installedExeName" "" "`$INSTDIR\resources\$appIconResource" 0
  IfErrors 0 +3
    MessageBox MB_ICONEXCLAMATION|MB_OK "桌面快捷方式创建失败：`$DESKTOP\$shortcutName.lnk"
    ClearErrors
FunctionEnd

!macro Step TEXT
  Push "`${TEXT}"
  Call Log
!macroend

!macro CheckErrors STAGE
  IfErrors 0 +3
    Push "`${STAGE}"
    Call FailInstall
!macroend

Section "Install"
  SetShellVarContext current
  SetDetailsView show
  SetOverwrite on

  !insertmacro Step "1/7 准备安装目录：`$INSTDIR"
  CreateDirectory "`$INSTDIR"
  !insertmacro CheckErrors "准备安装目录失败：`$INSTDIR"
  SetOutPath "`$INSTDIR"

  !insertmacro Step "2/7 解压安装包"
  !insertmacro Step "3/7 复制主程序"
  File /r "$payloadAppNsis\*.*"
  !insertmacro CheckErrors "复制主程序失败，请确认安装目录可写且程序未在运行：`$INSTDIR"
  ClearErrors
  FileOpen `$0 "`$INSTDIR\.magiorix-install" w
  IfErrors 0 +3
    Push "创建安装标记失败：`$INSTDIR\.magiorix-install"
    Call FailInstall
  FileWrite `$0 "installedAt=installed$\r$\n"
  IfErrors 0 +3
    Push "写入安装标记失败：`$INSTDIR\.magiorix-install"
    Call FailInstall
  FileClose `$0
  IfErrors 0 +3
    Push "关闭安装标记失败：`$INSTDIR\.magiorix-install"
    Call FailInstall

  !insertmacro Step "4/7 暂存前端资源：`$APPDATA\magiorix-desktop\assets\$assetsVersion.installing"
  StrCpy `$AssetsRoot "`$APPDATA\magiorix-desktop\assets"
  StrCpy `$AssetsTarget "`$AssetsRoot\$assetsVersion"
  StrCpy `$AssetsStage "`$AssetsRoot\$assetsVersion.installing"
  StrCpy `$AssetsBackup "`$AssetsRoot\$assetsVersion.previous"
  CreateDirectory "`$AssetsRoot"
  !insertmacro CheckErrors "创建前端资源根目录失败：`$AssetsRoot"
  ClearErrors
  RMDir /r "`$AssetsStage"
  IfErrors 0 +3
    Push "清理资源暂存目录失败：`$AssetsStage"
    Call FailInstall
  CreateDirectory "`$AssetsStage"
  !insertmacro CheckErrors "创建资源暂存目录失败：`$AssetsStage"
  SetOutPath "`$AssetsStage"
  File /r "$payloadAssetsNsis\*.*"
  !insertmacro CheckErrors "写入资源暂存目录失败：`$AssetsStage"
  ; Windows 不允许重命名进程当前所在目录，切换回资源根目录后再提升暂存资源。
  SetOutPath "`$AssetsRoot"
  !insertmacro CheckErrors "退出资源暂存目录失败：`$AssetsRoot"

  !insertmacro Step "5/7 生成资源 manifest/校验文件"
  IfFileExists "`$AssetsStage\integrity-manifest.json" +3 0
    Push "资源完整性校验文件缺失：`$AssetsStage\integrity-manifest.json"
    Call FailInstall
  ClearErrors
  RMDir /r "`$AssetsBackup"
  IfErrors 0 +3
    Push "清理资源回滚目录失败：`$AssetsBackup"
    Call FailInstall
  IfFileExists "`$AssetsTarget\*.*" 0 promote_assets
    ClearErrors
    Rename "`$AssetsTarget" "`$AssetsBackup"
    IfErrors 0 promote_assets
      Push "备份当前资源目录失败，请确认 magiorix 已完全退出：`$AssetsTarget"
      Call FailInstall
  promote_assets:
    ClearErrors
    Rename "`$AssetsStage" "`$AssetsTarget"
    IfErrors 0 assets_promoted
      Rename "`$AssetsBackup" "`$AssetsTarget"
      Push "启用新资源目录失败，已尝试恢复旧资源：`$AssetsTarget"
      Call FailInstall
  assets_promoted:
    ClearErrors
    FileOpen `$0 "`$AssetsRoot\version.json.tmp" w
    IfErrors version_pointer_failed 0
    FileWrite `$0 "{$\"version$\":$\"$assetsVersion$\",$\"appliedAt$\":$\"installed$\"}"
    IfErrors version_pointer_failed_close 0
    FileClose `$0
    IfErrors version_pointer_failed 0
    Delete "`$AssetsRoot\version.json.previous"
    IfFileExists "`$AssetsRoot\version.json" 0 +2
      Rename "`$AssetsRoot\version.json" "`$AssetsRoot\version.json.previous"
    ClearErrors
    Rename "`$AssetsRoot\version.json.tmp" "`$AssetsRoot\version.json"
    IfErrors version_pointer_failed 0
    Goto version_pointer_written
  version_pointer_failed_close:
    FileClose `$0
  version_pointer_failed:
    ClearErrors
    Delete "`$AssetsRoot\version.json.tmp"
    Delete "`$AssetsRoot\version.json"
    IfFileExists "`$AssetsRoot\version.json.previous" 0 +2
      Rename "`$AssetsRoot\version.json.previous" "`$AssetsRoot\version.json"
    ClearErrors
    RMDir /r "`$AssetsTarget"
    IfFileExists "`$AssetsBackup\*.*" 0 +2
      Rename "`$AssetsBackup" "`$AssetsTarget"
    Push "切换资源版本指针失败，已尝试恢复旧资源和版本指针：`$AssetsRoot\version.json"
    Call FailInstall
  version_pointer_written:
    Delete "`$AssetsRoot\version.json.previous"
    RMDir /r "`$AssetsBackup"

  !insertmacro Step "6/7 创建开始菜单快捷方式"
  CreateShortCut "`$SMPROGRAMS\$shortcutName.lnk" "`$INSTDIR\$installedExeName" "" "`$INSTDIR\resources\$appIconResource" 0
  !insertmacro CheckErrors "创建开始菜单所有应用快捷方式失败：`$SMPROGRAMS\$shortcutName.lnk"
  CreateDirectory "`$SMPROGRAMS\$shortcutName"
  CreateShortCut "`$SMPROGRAMS\$shortcutName\$shortcutName.lnk" "`$INSTDIR\$installedExeName" "" "`$INSTDIR\resources\$appIconResource" 0
  !insertmacro CheckErrors "创建开始菜单快捷方式失败：`$SMPROGRAMS\$shortcutName\$shortcutName.lnk"

  WriteUninstaller "`$INSTDIR\Uninstall.exe"
  !insertmacro CheckErrors "写入卸载程序失败：`$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "`${APP_REG_KEY}" "DisplayName" "$appDisplayName"
  WriteRegStr HKCU "`${APP_REG_KEY}" "DisplayVersion" "$version"
  WriteRegStr HKCU "`${APP_REG_KEY}" "Publisher" "$appDisplayName"
  WriteRegStr HKCU "`${APP_REG_KEY}" "InstallLocation" "`$INSTDIR"
  WriteRegStr HKCU "`${APP_REG_KEY}" "DisplayIcon" "`$INSTDIR\$installedExeName"
  WriteRegStr HKCU "`${APP_REG_KEY}" "UninstallString" "$\"`$INSTDIR\Uninstall.exe$\""
  WriteRegDWORD HKCU "`${APP_REG_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "`${APP_REG_KEY}" "NoRepair" 1
  !insertmacro CheckErrors "写入系统应用注册信息失败：HKCU\`${APP_REG_KEY}"

  !insertmacro Step "7/7 安装文件写入完成，请在完成页选择是否打开软件/添加桌面快捷方式。安装日志：`$InstallLog"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "`$DESKTOP\$shortcutName.lnk"
  Delete "`$SMPROGRAMS\$shortcutName.lnk"
  Delete "`$SMPROGRAMS\$shortcutName\$shortcutName.lnk"
  RMDir "`$SMPROGRAMS\$shortcutName"
  DeleteRegKey HKCU "`${APP_REG_KEY}"
  Delete "`$INSTDIR\Uninstall.exe"
  RMDir /r "`$INSTDIR"
SectionEnd
"@

Set-Content -LiteralPath $nsiPath -Value $nsi -Encoding UTF8

if (Test-Path -LiteralPath $setupExe) {
  Remove-Item -LiteralPath $setupExe -Force
}

Write-Output "Building NSIS installer with: $makensis"
Invoke-CheckedProcess -FilePath $makensis -Arguments @("/INPUTCHARSET", "UTF8", $nsiPath) -WorkingDirectory $projectRoot

if (-not (Test-Path -LiteralPath $setupExe)) {
  throw "Setup exe was not created: $setupExe"
}

$setupItem = Get-Item -LiteralPath $setupExe
$setupHash = (Get-FileHash -LiteralPath $setupExe -Algorithm SHA256).Hash
$asarHashPath = Join-Path $outDir "$appId-$version-app.asar.sha256.txt"
Set-Content -LiteralPath $asarHashPath -Value "$sourceAsarHash  app.asar" -Encoding ASCII
$assetsItem = Get-Item -LiteralPath $outAssetsZip
$assetsHash = (Get-FileHash -LiteralPath $outAssetsZip -Algorithm SHA256).Hash

Set-Content -LiteralPath $setupSha256Path -Value "$setupHash  $setupFileName" -Encoding ASCII
$releaseInfo = [ordered]@{
  schemaVersion = 1
  channel = "stable"
  desktop = [ordered]@{
    version = $version
    fileName = $setupFileName
    downloadUrl = "$($InstallerBaseUrl.TrimEnd('/'))/$setupFileName"
    size = $setupItem.Length
    sha256 = $setupHash
  }
  assets = [ordered]@{
    version = $assetsVersion
    fileName = $assetsZipFileName
    downloadUrl = "$($AssetsBaseUrl.TrimEnd('/'))/$assetsVersion/assets.zip"
    size = $assetsItem.Length
    sha256 = $assetsHash
  }
  releaseNotes = @("magiorix $version update")
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
} | ConvertTo-Json -Depth 5
Set-Content -LiteralPath $releaseInfoPath -Value $releaseInfo -Encoding UTF8
Remove-DirectorySafe -Path $buildWorkDir -Root $outDir

Write-Output "Created installer: $setupExe"
Write-Output "Installer size: $($setupItem.Length)"
Write-Output "Installer SHA256: $setupHash"
Write-Output "Created assets zip: $outAssetsZip"
Write-Output "Assets zip size: $($assetsItem.Length)"
Write-Output "Assets zip SHA256: $assetsHash"
Write-Output "Created SHA256 file: $setupSha256Path"
Write-Output "Created runtime ASAR SHA256 file: $asarHashPath"
Write-Output "Created release info: $releaseInfoPath"
Write-Output "Install log path: $installLogPath"
