# Rebuild cloudflared quick tunnel: start -> grab domain -> VERIFY passthrough (curl) -> write .env.
# Quick-tunnel domain is random each time; edge registration can flake, so we verify real passthrough
# (not just the banner domain) and retry once. Run from repo root:
#   powershell -ExecutionPolicy Bypass -File scripts/tunnel-up.ps1
# After success: restart frontend vite (npm run dev). Backend NOT needed (key unchanged).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $root ".env"
$log = Join-Path $root "blade\.tunnel.log"

$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) { $cf = "C:\Users\ak\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe" }
if (-not (Test-Path $cf)) { Write-Error "cloudflared not found; run: winget install Cloudflare.cloudflared"; exit 1 }

function Start-CfTunnel {
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  if (Test-Path $log) { Remove-Item $log -Force }
  Start-Process -FilePath $cf -ArgumentList "tunnel","--url","http://localhost:8000" -RedirectStandardError $log -WindowStyle Hidden
}
function Get-CfDomain {
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $log) {
      $m = Select-String -Path $log -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($m) { return $m.Matches[0].Value }
    }
  }
  return $null
}
function Test-CfPassthrough($domain) {
  for ($i = 0; $i -lt 12; $i++) {
    $code = (& curl.exe -m 8 -s -o NUL -w "%{http_code}" "$domain/api/health" 2>$null)
    if ($code -eq "200") { return $true }
    Start-Sleep -Seconds 3
  }
  return $false
}

$domain = $null; $ok = $false
foreach ($attempt in 1, 2) {
  Write-Output "Attempt $attempt : starting quick tunnel (-> localhost:8000)"
  Start-CfTunnel
  $domain = Get-CfDomain
  if (-not $domain) { Write-Warning "  no domain banner; retrying"; continue }
  Write-Output "  domain: $domain  (verifying real passthrough via curl...)"
  if (Test-CfPassthrough $domain) { $ok = $true; break }
  Write-Warning "  edge not ready (passthrough != 200); retrying"
}
if (-not $ok) { Write-Error "tunnel failed after 2 attempts (backend up? port 7844 outbound?). Rerun."; exit 1 }

Write-Output "Passthrough OK (200). Writing .env VITE_SMART_DOC_API (key untouched)"
# Line-by-line (NOT -raw regex): a -replace on raw content can merge the value
# into a preceding comment line. Match only at line start; append if absent.
$lines = Get-Content $envPath
$found = $false
$out = foreach ($l in $lines) {
  if ($l -match '^VITE_SMART_DOC_API=') { $found = $true; "VITE_SMART_DOC_API=$domain" }
  else { $l }
}
if (-not $found) { $out = @($out) + "VITE_SMART_DOC_API=$domain" }
[System.IO.File]::WriteAllText($envPath, (($out -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding $false))

Write-Output ""
Write-Output "OK: $domain  ready and written to .env."
Write-Output "Next: restart frontend (npm run dev), then open a NEW session. Backend restart NOT needed."
