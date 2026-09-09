param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Destination
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
$outputPath = [IO.Path]::GetFullPath($Destination)
if ($outputPath.StartsWith($sourceRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'ZIP output must be outside source' }
$files = @(Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | Sort-Object FullName)
$expected = @{}
foreach ($file in $files) {
  $entryName = $file.FullName.Substring($sourceRoot.Length).Replace('\', '/')
  if ($entryName.Contains('\') -or $entryName.Contains('..') -or $entryName.StartsWith('/') -or $entryName.StartsWith('./') -or $entryName.Contains(':')) { throw "Unsafe entry: $entryName" }
  if ($expected.ContainsKey($entryName)) { throw "Duplicate entry: $entryName" }
  $expected[$entryName] = $file.FullName
}
if (-not $expected.ContainsKey('index.html')) { throw 'Missing root index.html' }
$temporary = $outputPath + '.' + [Guid]::NewGuid().ToString('N') + '.tmp'
try {
  $archive = [IO.Compression.ZipFile]::Open($temporary, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in $files) {
      $entryName = $file.FullName.Substring($sourceRoot.Length).Replace('\', '/')
      $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
      $entry.LastWriteTime = [DateTimeOffset]::new(2020, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
      $inputStream = $file.OpenRead()
      $outputStream = $entry.Open()
      try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose(); $inputStream.Dispose() }
    }
  } finally { $archive.Dispose() }
  $archive = [IO.Compression.ZipFile]::OpenRead($temporary)
  try {
    if ($archive.Entries.Count -ne $expected.Count) { throw 'ZIP entry count mismatch' }
    $seen = @{}
    foreach ($entry in $archive.Entries) {
      $entryName = $entry.FullName
      if ($entryName.Contains('\') -or $entryName.Contains('..') -or $entryName.StartsWith('/') -or $entryName.StartsWith('./') -or -not $expected.ContainsKey($entryName)) { throw "Invalid stored path: $entryName" }
      if ($seen.ContainsKey($entryName)) { throw "Duplicate stored path: $entryName" }
      $seen[$entryName] = $true
      $entryStream = $entry.Open()
      $sha256 = [Security.Cryptography.SHA256]::Create()
      try { $actualHash = [BitConverter]::ToString($sha256.ComputeHash($entryStream)).Replace('-', '') } finally { $sha256.Dispose(); $entryStream.Dispose() }
      $expectedHash = (Get-FileHash -LiteralPath $expected[$entryName] -Algorithm SHA256).Hash
      if ($actualHash -ne $expectedHash) { throw "Content mismatch: $entryName" }
      Write-Output "Verified: $entryName"
    }
    if (-not $seen.ContainsKey('index.html')) { throw 'Missing stored root index.html' }
  } finally { $archive.Dispose() }
  if ((Get-Item -LiteralPath $temporary).Length -gt 10MB) { throw 'ZIP exceeds 10 MiB' }
  Move-Item -LiteralPath $temporary -Destination $outputPath -Force
} finally {
  if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
}
