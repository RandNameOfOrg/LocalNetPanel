<#
.SYNOPSIS
  Create a distributable .zip of the Local Network Panel project — source only.

.DESCRIPTION
  Packs the project tree while EXCLUDING dependencies, build output, local
  runtime data, logs, and secrets:
    - directories: node_modules, dist, data, logs, .git, .vscode, coverage
    - files:       *.db / *.db-shm / *.db-wal, *.log, *.zip, *.tsbuildinfo
    - secrets:     .env (and .env.* — but .env.example IS kept)

  Excluded directories are pruned during traversal, so node_modules is never
  walked (fast). The archive contains a single top-level folder named after
  the project so it extracts cleanly.

.PARAMETER OutDir
  Where to write the .zip. Defaults to the project's parent directory
  (so the archive never tries to include itself).

.EXAMPLE
  .\create-archive.ps1
  .\create-archive.ps1 -OutDir C:\Temp
#>
[CmdletBinding()]
param(
  [string]$OutDir
)

$ErrorActionPreference = 'Stop'

$root        = $PSScriptRoot
$projectName = Split-Path $root -Leaf
if (-not $OutDir) { $OutDir = Split-Path $root -Parent }
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

$timestamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$zipPath   = Join-Path $OutDir "${projectName}_${timestamp}.zip"

# Directory names skipped anywhere in the tree.
$excludeDirs = @('node_modules', 'dist', 'data', 'logs', '.git', '.vscode', 'coverage')
# File-name patterns skipped anywhere in the tree.
$excludeFiles = @('*.db', '*.db-shm', '*.db-wal', '*.log', '*.zip', '*.tsbuildinfo')

function Test-FileIncluded($file) {
  foreach ($pat in $excludeFiles) { if ($file.Name -like $pat) { return $false } }
  # Never ship real secrets, but keep the .env.example template.
  if ($file.Name -eq '.env') { return $false }
  if ($file.Name -like '.env.*' -and $file.Name -ne '.env.example') { return $false }
  return $true
}

# Recursive walk that prunes excluded directories (so node_modules is never entered).
function Get-ProjectFiles($dir) {
  foreach ($item in Get-ChildItem -LiteralPath $dir -Force) {
    if ($item.PSIsContainer) {
      if ($excludeDirs -contains $item.Name) { continue }
      Get-ProjectFiles $item.FullName
    }
    elseif (Test-FileIncluded $item) {
      $item
    }
  }
}

Write-Host "Packing '$projectName' ..." -ForegroundColor Cyan
$files = @(Get-ProjectFiles $root)

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($f in $files) {
    $rel       = $f.FullName.Substring($root.Length).TrimStart('\', '/') -replace '\\', '/'
    $entryName = "$projectName/$rel"
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $f.FullName, $entryName, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
}
finally {
  $zip.Dispose()
}

$sizeMb = (Get-Item $zipPath).Length / 1MB
Write-Host ("Done: {0} files, {1:N2} MB" -f $files.Count, $sizeMb) -ForegroundColor Green
Write-Host $zipPath
