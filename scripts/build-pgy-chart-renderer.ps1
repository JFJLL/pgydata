[CmdletBinding()]
param(
  [string]$PythonPath = $env:PGY_RENDERER_PYTHON,
  [string]$OutputPath,
  [ValidateRange(5, 120)]
  [int]$SmokeTimeoutSeconds = 30,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot "tools\pgy_chart_renderer.py"
$requiredPyInstallerVersion = "6.18.0"
$requiredPillowVersion = "10.4.0"
$rendererBuildSchema = "renderer-v2;pyinstaller=$requiredPyInstallerVersion;pillow=$requiredPillowVersion;onefile;console;exclude=numpy"
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $projectRoot "runtime\magiorix-desktop\resources\pgy-chart-renderer.exe"
}

function Find-RendererPython {
  $candidates = [System.Collections.Generic.List[string]]::new()
  if (-not [string]::IsNullOrWhiteSpace($PythonPath)) {
    $candidates.Add($PythonPath)
  }
  foreach ($name in @("python.exe", "python")) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($command) {
      $candidates.Add($command.Source)
    }
  }

  foreach ($candidate in $candidates | Select-Object -Unique) {
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      continue
    }
    & $candidate -c "import PyInstaller, PIL; assert PyInstaller.__version__ == '$requiredPyInstallerVersion'; assert PIL.__version__ == '$requiredPillowVersion'" 2>$null
    if ($LASTEXITCODE -eq 0) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  throw "Python with PyInstaller $requiredPyInstallerVersion and Pillow $requiredPillowVersion was not found. Set PGY_RENDERER_PYTHON to the build interpreter."
}

function Get-NormalizedText([string]$Path) {
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n").Replace("`r", "`n")
}

function Get-RendererBuildHash {
  $hashInput = "$rendererBuildSchema`n--- source ---`n$(Get-NormalizedText $sourcePath)`n--- build ---`n$(Get-NormalizedText $PSCommandPath)"
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($hashInput)
  $hash = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $hash.Dispose()
  }
}

function Invoke-RendererSmokeTest([string]$RendererPath, [string]$WorkRoot) {
  $pngPath = Join-Path $WorkRoot "daily-note-smoke.png"
  $payload = [ordered]@{
    charts = @([ordered]@{
      field = "dailyNotePerformanceChart"
      type = "daily-note-performance"
      data = [ordered]@{
        noteNumber = 7
        noteType = @([ordered]@{ contentTag = "美食"; percent = "100" })
        impMedian = 80586
        readMedian = 9287
      }
      output = $pngPath
    })
  } | ConvertTo-Json -Depth 8 -Compress

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $RendererPath
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $startInfo.StandardInputEncoding = [System.Text.UTF8Encoding]::new($false)
  $startInfo.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $startInfo.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
  $process = [System.Diagnostics.Process]::Start($startInfo)
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.StandardInput.Write($payload)
  $process.StandardInput.Close()
  if (-not $process.WaitForExit($SmokeTimeoutSeconds * 1000)) {
    try { $process.Kill($true) } catch { $process.Kill() }
    $process.WaitForExit()
    throw "PGY chart renderer smoke test timed out after $SmokeTimeoutSeconds seconds: $RendererPath"
  }
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) {
    throw "PGY chart renderer smoke test exited $($process.ExitCode): $stderr"
  }

  $resultLine = @($stdout -split "`r?`n" | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })[-1]
  $result = $resultLine | ConvertFrom-Json
  if ([string]$result.paths.dailyNotePerformanceChart -ne $pngPath) {
    throw "PGY chart renderer did not return dailyNotePerformanceChart: $resultLine"
  }
  if (-not (Test-Path -LiteralPath $pngPath -PathType Leaf)) {
    throw "PGY chart renderer did not create the daily note PNG: $pngPath"
  }
  $bytes = [System.IO.File]::ReadAllBytes($pngPath)
  $signature = [byte[]](0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
  $validSignature = $bytes.Length -ge 24
  for ($index = 0; $validSignature -and $index -lt $signature.Length; $index++) {
    $validSignature = $bytes[$index] -eq $signature[$index]
  }
  if (-not $validSignature) {
    throw "PGY chart renderer created an invalid PNG: $pngPath"
  }
  [Array]::Reverse($bytes, 16, 4)
  [Array]::Reverse($bytes, 20, 4)
  $width = [BitConverter]::ToUInt32($bytes, 16)
  $height = [BitConverter]::ToUInt32($bytes, 20)
  if ($width -ne 808 -or $height -ne 378) {
    throw "PGY daily note chart has unexpected dimensions: ${width}x${height}"
  }
}

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "PGY chart renderer source not found: $sourcePath"
}

$buildHash = Get-RendererBuildHash
$buildHashPath = [System.IO.Path]::ChangeExtension($OutputPath, "build.sha256")
$tempRoot = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) "magiorix-pgy-chart-renderer-$PID"))
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
if (-not $tempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use renderer build directory outside the temp root: $tempRoot"
}

try {
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  if (-not $Force -and (Test-Path -LiteralPath $OutputPath -PathType Leaf) -and (Test-Path -LiteralPath $buildHashPath -PathType Leaf)) {
    $builtFromHash = (Get-Content -LiteralPath $buildHashPath -Raw -Encoding UTF8).Trim().ToLowerInvariant()
    if ($builtFromHash -eq $buildHash) {
      try {
        Invoke-RendererSmokeTest -RendererPath $OutputPath -WorkRoot $tempRoot
        Write-Output "PGY chart renderer is current and passed smoke verification: $OutputPath"
        return
      } catch {
        Write-Warning "Existing PGY chart renderer failed smoke verification and will be rebuilt: $($_.Exception.Message)"
      }
    }
  }

  $python = Find-RendererPython
  $distPath = Join-Path $tempRoot "dist"
  $workPath = Join-Path $tempRoot "work"
  $specPath = Join-Path $tempRoot "spec"
  $bootstrapPath = Join-Path $tempRoot "run-pyinstaller.py"
  $bootstrap = @'
import importlib.metadata as metadata
import sys

real_distribution = metadata.distribution


def build_distribution(name):
    # Some managed Python environments retain obsolete backport metadata even
    # though imports correctly resolve to the standard-library implementations.
    if str(name).lower() in {"enum34", "typing", "pathlib"}:
        raise metadata.PackageNotFoundError(name)
    return real_distribution(name)


metadata.distribution = build_distribution

from PyInstaller.__main__ import run

run(sys.argv[1:])
'@
  [System.IO.File]::WriteAllText($bootstrapPath, $bootstrap, [System.Text.UTF8Encoding]::new($false))
  Write-Output "Building PGY chart renderer with: $python"
  & $python $bootstrapPath --noconfirm --clean --onefile --console --exclude-module numpy --name "pgy-chart-renderer" --distpath $distPath --workpath $workPath --specpath $specPath $sourcePath
  if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller failed with exit code $LASTEXITCODE"
  }

  $builtPath = Join-Path $distPath "pgy-chart-renderer.exe"
  if (-not (Test-Path -LiteralPath $builtPath -PathType Leaf)) {
    throw "PyInstaller did not create the renderer: $builtPath"
  }
  Invoke-RendererSmokeTest -RendererPath $builtPath -WorkRoot $tempRoot
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath) | Out-Null
  Copy-Item -LiteralPath $builtPath -Destination $OutputPath -Force
  [System.IO.File]::WriteAllText($buildHashPath, "$buildHash`n", [System.Text.UTF8Encoding]::new($false))
  Write-Output "PGY chart renderer: $OutputPath"
  Write-Output "PGY chart renderer SHA256: $((Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash)"
} finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
