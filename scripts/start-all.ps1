# 一键启动 smart-doc：后端(8000) -> 隧道(cloudflared) -> 前端(3200)
# 用法（在仓库根目录）：
#   powershell -ExecutionPolicy Bypass -File scripts\start-all.ps1
# 可选开关：
#   -NoTunnel   只起后端+前端，跳过隧道（本机开发、不需要远端 Blade agent 入库时）
#   -NoFrontend 只起后端+隧道
# 后端、前端各自在新窗口里长驻；关掉对应窗口即停止该进程。
param(
  [switch]$NoTunnel,
  [switch]$NoFrontend
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
$py = Join-Path $backendDir ".venv\Scripts\python.exe"
$tunnelScript = Join-Path $PSScriptRoot "tunnel-up.ps1"

function Test-Health($url) {
  try { $c = (& curl.exe -m 5 -s -o NUL -w "%{http_code}" $url 2>$null); return ($c -eq "200") }
  catch { return $false }
}

# ---------- 1. 后端 ----------
if (Test-Health "http://localhost:8000/api/health") {
  Write-Host "[backend] 已在运行 (:8000)，跳过启动" -ForegroundColor Yellow
} else {
  if (-not (Test-Path $py)) { Write-Error "找不到 venv: $py（先在 backend/ 建好 .venv 并装依赖）"; exit 1 }
  Write-Host "[backend] 启动中 (:8000)..." -ForegroundColor Cyan
  Start-Process -FilePath "powershell" `
    -ArgumentList "-NoExit","-Command","Set-Location '$backendDir'; & '$py' run.py" `
    -WindowStyle Normal
  $up = $false
  foreach ($i in 1..20) {
    Start-Sleep -Seconds 1
    if (Test-Health "http://localhost:8000/api/health") { $up = $true; break }
  }
  if (-not $up) { Write-Error "[backend] 20s 内未就绪；检查 MySQL(3306) 是否在跑、新窗口里有无报错"; exit 1 }
  Write-Host "[backend] OK (200)" -ForegroundColor Green
}

# ---------- 2. 隧道 ----------
if ($NoTunnel) {
  Write-Host "[tunnel] 已跳过 (-NoTunnel)" -ForegroundColor Yellow
} else {
  $ok = $false
  foreach ($attempt in 1..3) {
    Write-Host "[tunnel] 第 $attempt 次尝试..." -ForegroundColor Cyan
    try { & $tunnelScript } catch { Write-Host "  本次失败：$($_.Exception.Message)" -ForegroundColor DarkYellow }
    # 用写进 .env 的域名做最终校验，避免脚本告警造成误判
    $dom = (Get-Content (Join-Path $root ".env") | Where-Object { $_ -match '^VITE_SMART_DOC_API=' }) -replace '^VITE_SMART_DOC_API=', ''
    if ($dom -and (Test-Health "$dom/api/health")) { $ok = $true; Write-Host "[tunnel] OK -> $dom" -ForegroundColor Green; break }
    Start-Sleep -Seconds 2
  }
  if (-not $ok) { Write-Error "[tunnel] 3 次仍失败（quick tunnel 抖动）。可单独重跑 scripts\tunnel-up.ps1，或加 -NoTunnel 跳过"; exit 1 }
}

# ---------- 3. 前端 ----------
if ($NoFrontend) {
  Write-Host "[frontend] 已跳过 (-NoFrontend)" -ForegroundColor Yellow
} elseif (Test-Health "http://localhost:3200/") {
  Write-Host "[frontend] 已在运行 (:3200)，跳过启动（如改了 .env 隧道域名需手动重启该窗口）" -ForegroundColor Yellow
} else {
  Write-Host "[frontend] 启动中 (:3200)..." -ForegroundColor Cyan
  Start-Process -FilePath "powershell" `
    -ArgumentList "-NoExit","-Command","Set-Location '$root'; npm run dev" `
    -WindowStyle Normal
  foreach ($i in 1..15) {
    Start-Sleep -Seconds 1
    if (Test-Health "http://localhost:3200/") { break }
  }
  Write-Host "[frontend] -> http://localhost:3200/" -ForegroundColor Green
}

Write-Host ""
Write-Host "==== 启动完成 ====" -ForegroundColor Green
Write-Host "后端:  http://localhost:8000/api/health"
if (-not $NoTunnel) {
  $dom = (Get-Content (Join-Path $root ".env") | Where-Object { $_ -match '^VITE_SMART_DOC_API=' }) -replace '^VITE_SMART_DOC_API=', ''
  Write-Host "隧道:  $dom"
}
if (-not $NoFrontend) { Write-Host "前端:  http://localhost:3200/" }
