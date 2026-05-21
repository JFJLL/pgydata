$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceAppDir = Join-Path $projectRoot "runtime\@zsdesktop"
$sourceAssetsDir = Join-Path $projectRoot "assets\1.1.1"
$appSourceDir = Join-Path $projectRoot "app-source"
$outDir = "D:\download\pic-vec\pgy-data"
$payloadDir = Join-Path $outDir "payload"
$installerDir = Join-Path $outDir "installer"
$setupExe = Join-Path $outDir "EmagicDataCrawler-Setup.exe"
$version = "1.1.1"
$appDisplayName = "易美数据抓取"
$appInstallDirName = "EmagicDataCrawler"
$shortcutName = "EmagicDataCrawler"
$sourceExeName = "PYGdata.exe"
$installedExeName = "$appInstallDirName.exe"
$appIconResource = "app.ico"
$installLogPath = "%TEMP%\PYGdata-install.log"
$redMagicAssetsZip = Join-Path $projectRoot "red-magic-api\public\assets\desktop\$version\assets.zip"
$redMagicInstaller = Join-Path $projectRoot "red-magic-api\public\downloads\EmagicDataCrawler-Setup.exe"
$outAssetsZip = Join-Path $outDir "assets\desktop\$version\assets.zip"

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
  $candidates = @(
    $env:NSIS_MAKENSIS,
    (Join-Path ${env:ProgramFiles(x86)} "NSIS\makensis.exe"),
    (Join-Path $env:ProgramFiles "NSIS\makensis.exe")
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
    $env:RCEDIT_PATH,
    (Join-Path $projectRoot "tools\rcedit-x64.exe"),
    (Join-Path $env:TEMP "pgydata-rcedit\node_modules\rcedit\bin\rcedit-x64.exe"),
    (Join-Path $env:TEMP "pgydata-rcedit\node_modules\rcedit\bin\rcedit.exe")
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

function Set-ExeBrand([string]$ExePath, [string]$IconPath) {
  $rcedit = Find-Rcedit
  if (-not $rcedit) {
    Write-Warning "rcedit not found; skipping executable icon and version metadata update."
    return
  }
  if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Executable not found for branding: $ExePath"
  }
  if (-not (Test-Path -LiteralPath $IconPath)) {
    throw "Icon not found for branding: $IconPath"
  }

  $args = @(
    $ExePath,
    "--set-icon", $IconPath,
    "--set-version-string", "FileDescription", $appDisplayName,
    "--set-version-string", "ProductName", $appDisplayName,
    "--set-version-string", "InternalName", $appDisplayName,
    "--set-version-string", "OriginalFilename", $installedExeName
  )
  $process = Start-Process -FilePath $rcedit -ArgumentList $args -WindowStyle Hidden -PassThru
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "rcedit failed for $ExePath with exit code $($process.ExitCode)"
  }
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
    version = $version
    algorithm = "sha256"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    files = @($entries)
  }

  $manifestPath = Join-Path $AssetsDir "integrity-manifest.json"
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  return $manifestPath
}

function New-AssetsZip([string]$AssetsDir, [string]$ZipPath) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $ZipPath) | Out-Null
  if (Test-Path -LiteralPath $ZipPath) {
    Remove-Item -LiteralPath $ZipPath -Force
  }
  Compress-Archive -Path (Join-Path $AssetsDir "*") -DestinationPath $ZipPath -CompressionLevel Optimal
}

function Sync-AssetsToAppData([string]$AssetsDir) {
  $assetRoots = @(
    (Join-Path $env:APPDATA "pygdata-desktop\assets"),
    (Join-Path $env:APPDATA "@zs\desktop\assets")
  )

  foreach ($assetRoot in $assetRoots) {
    $target = Join-Path $assetRoot $version
    try {
      if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
      }
      New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null
      Copy-Item -LiteralPath $AssetsDir -Destination $assetRoot -Recurse -Force
      $versionInfo = [ordered]@{
        version = $version
        appliedAt = (Get-Date).ToUniversalTime().ToString("o")
      } | ConvertTo-Json
      Set-Content -LiteralPath (Join-Path $assetRoot "version.json") -Value $versionInfo -Encoding UTF8
    } catch {
      Write-Warning "Skipped syncing assets to $assetRoot because files are in use. Installer and server assets were still generated. Close the app and reinstall to apply local assets. $($_.Exception.Message)"
    }
  }
}

function Invoke-CheckedProcess([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory) {
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "$FilePath failed with exit code $($process.ExitCode)"
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

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Remove-DirectorySafe -Path $payloadDir -Root $outDir
Remove-DirectorySafe -Path $installerDir -Root $outDir
New-Item -ItemType Directory -Force -Path $payloadDir, $installerDir | Out-Null

Write-Output "Applying frontend asset patches..."
Invoke-CheckedProcess -FilePath $node.Source -Arguments @((Join-Path $PSScriptRoot "apply-pgydata-frontend-patches.js")) -WorkingDirectory $projectRoot

Write-Output "Generating resource integrity manifest..."
$manifestPath = New-IntegrityManifest -AssetsDir $sourceAssetsDir
Write-Output "Manifest: $manifestPath"

Write-Output "Rebuilding assets.zip..."
New-AssetsZip -AssetsDir $sourceAssetsDir -ZipPath $outAssetsZip
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $redMagicAssetsZip) | Out-Null
Copy-Item -LiteralPath $outAssetsZip -Destination $redMagicAssetsZip -Force

Write-Output "Packing Electron app.asar from app-source..."
$asarOut = Join-Path (Join-Path $sourceAppDir "resources") "app.asar"
Invoke-CheckedProcess -FilePath $node.Source -Arguments @((Join-Path $PSScriptRoot "apply-pgydata-runtime-patches.js")) -WorkingDirectory $projectRoot
Invoke-CheckedProcess -FilePath $node.Source -Arguments @((Join-Path $PSScriptRoot "pack-asar.js"), $appSourceDir, $asarOut) -WorkingDirectory $projectRoot

$payloadAppDir = Join-Path $payloadDir "app"
$payloadAssetsRoot = Join-Path $payloadDir "assets"
$payloadAssetsVersionDir = Join-Path $payloadAssetsRoot $version
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
  $source = Join-Path (Join-Path $sourceAppDir "resources") $file
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Required resource file not found: $source"
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $payloadAppDir "resources") -Force
}

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
$nsiPath = Join-Path $installerDir "PYGdata-Setup.nsi"
$payloadAppNsis = Escape-NsisPath $payloadAppDir
$payloadAssetsNsis = Escape-NsisPath $payloadAssetsVersionDir
$setupExeNsis = Escape-NsisPath $setupExe
$iconNsis = Escape-NsisPath $iconPath

$nsi = @"
Unicode true
!include "MUI2.nsh"

Name "$appDisplayName"
OutFile "$setupExeNsis"
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

!define APP_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PYGdata"

Var InstallLog

Function .onInit
  SetShellVarContext current
  StrCpy `$InstallLog "`$TEMP\PYGdata-install.log"
  Delete "`$InstallLog"
  FileOpen `$0 "`$InstallLog" w
  FileWrite `$0 "PYGdata installer log$\r$\n"
  FileClose `$0
FunctionEnd

Function Log
  Exch `$0
  DetailPrint "`$0"
  FileOpen `$1 "`$InstallLog" a
  FileWrite `$1 "`$0$\r$\n"
  FileClose `$1
  Pop `$0
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
  FileOpen `$0 "`$INSTDIR\.pgydata-install" w
  FileWrite `$0 "installedAt=installed$\r$\n"
  FileClose `$0

  !insertmacro Step "4/7 写入前端资源：`$APPDATA\pygdata-desktop\assets\$version"
  RMDir /r "`$APPDATA\pygdata-desktop\assets\$version"
  CreateDirectory "`$APPDATA\pygdata-desktop\assets\$version"
  SetOutPath "`$APPDATA\pygdata-desktop\assets\$version"
  File /r "$payloadAssetsNsis\*.*"
  !insertmacro CheckErrors "写入前端资源失败：`$APPDATA\pygdata-desktop\assets\$version"
  FileOpen `$0 "`$APPDATA\pygdata-desktop\assets\version.json" w
  FileWrite `$0 "{$\"version$\":$\"$version$\",$\"appliedAt$\":$\"installed$\"}"
  FileClose `$0

  !insertmacro Step "4/7 写入兼容前端资源：`$APPDATA\@zs\desktop\assets\$version"
  RMDir /r "`$APPDATA\@zs\desktop\assets\$version"
  CreateDirectory "`$APPDATA\@zs\desktop\assets\$version"
  SetOutPath "`$APPDATA\@zs\desktop\assets\$version"
  File /r "$payloadAssetsNsis\*.*"
  !insertmacro CheckErrors "写入兼容前端资源失败：`$APPDATA\@zs\desktop\assets\$version"
  FileOpen `$0 "`$APPDATA\@zs\desktop\assets\version.json" w
  FileWrite `$0 "{$\"version$\":$\"$version$\",$\"appliedAt$\":$\"installed$\"}"
  FileClose `$0

  !insertmacro Step "5/7 生成资源 manifest/校验文件"
  IfFileExists "`$APPDATA\pygdata-desktop\assets\$version\integrity-manifest.json" +3 0
    Push "资源完整性校验文件缺失：`$APPDATA\pygdata-desktop\assets\$version\integrity-manifest.json"
    Call FailInstall
  IfFileExists "`$APPDATA\@zs\desktop\assets\$version\integrity-manifest.json" +3 0
    Push "兼容资源完整性校验文件缺失：`$APPDATA\@zs\desktop\assets\$version\integrity-manifest.json"
    Call FailInstall

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

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $redMagicInstaller) | Out-Null
Copy-Item -LiteralPath $setupExe -Destination $redMagicInstaller -Force
Sync-AssetsToAppData -AssetsDir $sourceAssetsDir

$setupItem = Get-Item -LiteralPath $setupExe
$setupHash = (Get-FileHash -LiteralPath $setupExe -Algorithm SHA256).Hash
$assetsItem = Get-Item -LiteralPath $outAssetsZip
$assetsHash = (Get-FileHash -LiteralPath $outAssetsZip -Algorithm SHA256).Hash

Write-Output "Created installer: $setupExe"
Write-Output "Installer size: $($setupItem.Length)"
Write-Output "Installer SHA256: $setupHash"
Write-Output "Created assets zip: $outAssetsZip"
Write-Output "Assets zip size: $($assetsItem.Length)"
Write-Output "Assets zip SHA256: $assetsHash"
Write-Output "Synced server assets zip: $redMagicAssetsZip"
Write-Output "Synced server installer: $redMagicInstaller"
Write-Output "Install log path: $installLogPath"
