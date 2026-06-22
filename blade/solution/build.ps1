# Package the smartdoc_review Solution into an uploadable zip.
# Usage (from repo root or this dir):
#   powershell -ExecutionPolicy Bypass -File blade/solution/build.ps1
#
# Steps: (1) refresh the bundled shim copy from the canonical source
#            backend/agent_shim/smart_doc_add.py
#        (2) warn if api_base.txt is still the placeholder (non-blocking)
#        (3) Compress-Archive -> blade/solution/smartdoc_review.zip
# Upload the zip to: http://115.190.152.1:8020/studio/skill-editor
#
# NOTE: keep this script ASCII-only. Windows PowerShell 5.1 reads .ps1 as the
# system ANSI code page, so non-ASCII text here would be mojibake'd and break parsing.

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path      # blade/solution
$repo = Resolve-Path (Join-Path $here "..\..")               # repo root
$pkg  = Join-Path $here "smartdoc_review"
$zip  = Join-Path $here "smartdoc_review.zip"

# (1) refresh shim copy (single source of truth lives in backend/agent_shim)
$src = Join-Path $repo "backend\agent_shim\smart_doc_add.py"
$dst = Join-Path $pkg  "skills\save_rule_doc\scripts\smart_doc_add.py"
Copy-Item $src $dst -Force
Write-Host "[build] refreshed shim copy -> $dst"

# (2) placeholder check
$apiFile = Join-Path $pkg "skills\save_rule_doc\scripts\api_base.txt"
$api = (Get-Content $apiFile -Raw).Trim()
if ($api -like "*REPLACE-WITH-YOUR-TUNNEL-DOMAIN*" -or [string]::IsNullOrWhiteSpace($api)) {
    Write-Warning "[build] api_base.txt is still the placeholder/empty: '$api' -- set it to the backend-reachable URL (tunnel domain) before uploading."
} else {
    Write-Host "[build] api_base.txt = $api"
}

# (3) zip with forward-slash entry names (PS5.1 Compress-Archive stores backslashes,
#     which a Linux-side validator may fail to read as a directory tree).
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $zip) { Remove-Item $zip -Force }
$pkgFull = (Resolve-Path $pkg).Path.TrimEnd('\') + '\'
$archive = [System.IO.Compression.ZipFile]::Open($zip, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    Get-ChildItem -Path $pkg -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($pkgFull.Length) -replace '\\', '/'
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $rel) | Out-Null
        Write-Host "[build]   + $rel"
    }
} finally {
    $archive.Dispose()
}
Write-Host "[build] wrote $zip"
