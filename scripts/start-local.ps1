# 一键拉起 smart-doc「本地无隧道」整套：
#   后端(0.0.0.0:8000) -> docker blade-agent 栈(:8020,含强制沙盒) -> 校验/刷 api-key -> 前端(:3200)
# 用法（仓库根）：  powershell -ExecutionPolicy Bypass -File scripts\start-local.ps1
# 前提：Docker Desktop 已启动；已拉 blade-agent:v0.5.16 + blade-sandbox:latest；backend/.venv 就绪、MySQL(3306) 在跑。
# 旧隧道版在 scripts\start-all.ps1（两者互不影响）。
# 注：不全局 Stop —— docker 往 stderr 写进度会被 PS5.1 当致命错。改用显式退出码 + 健康检查。
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
$py = Join-Path $backendDir ".venv\Scripts\python.exe"
$envFile = Join-Path $root ".env"
$agent = "http://localhost:8020"

function Test-Health($url) {
  return ((& curl.exe -m 5 -s -o NUL -w "%{http_code}" $url 2>$null) -eq "200")
}

# ---------- 0. Docker 就绪 + 必需镜像 ----------
docker info *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "Docker daemon 连不上：请先启动 Docker Desktop" -ForegroundColor Red; exit 1 }
foreach ($img in @("registry.cn-beijing.aliyuncs.com/bladeai/blade-agent:v0.5.16",
                   "registry.cn-beijing.aliyuncs.com/bladeai/blade-sandbox:latest")) {
  docker image inspect $img *> $null
  if ($LASTEXITCODE -ne 0) { Write-Host "缺镜像 $img —— 先拉：docker pull $img（沙盒镜像约 11G）" -ForegroundColor Red; exit 1 }
}

# ---------- 1. 后端 (0.0.0.0:8000) ----------
if (Test-Health "http://localhost:8000/api/health") {
  Write-Host "[backend] 已在运行 (:8000)，跳过" -ForegroundColor Yellow
} else {
  if (-not (Test-Path $py)) { Write-Host "找不到 venv: $py" -ForegroundColor Red; exit 1 }
  Write-Host "[backend] 启动中 (:8000, host 0.0.0.0)..." -ForegroundColor Cyan
  # run.py 默认绑 0.0.0.0:8000 并读 backend/.env(含 SMART_API_KEY)；容器内 shim 经 host.docker.internal 回连必须 0.0.0.0
  Start-Process -FilePath "powershell" `
    -ArgumentList "-NoExit","-Command","Set-Location '$backendDir'; `$env:PYTHONIOENCODING='utf-8'; & '$py' run.py" `
    -WindowStyle Normal
  $up = $false; foreach ($i in 1..20) { Start-Sleep 1; if (Test-Health "http://localhost:8000/api/health") { $up=$true; break } }
  if (-not $up) { Write-Host "[backend] 20s 未就绪；检查 MySQL(3306)、新窗口报错" -ForegroundColor Red; exit 1 }
  Write-Host "[backend] OK (200, 0.0.0.0)" -ForegroundColor Green
}

# ---------- 2. blade-agent 栈 (:8020) —— 已健康则跳过 compose（避免重建容器使 key 失效）----------
if (Test-Health "$agent/api/health") {
  Write-Host "[agent] 已在运行 (:8020)，跳过 compose" -ForegroundColor Yellow
} else {
  Write-Host "[agent] docker compose up -d --no-deps blade-agent ..." -ForegroundColor Cyan
  Push-Location $root
  docker compose up -d --no-deps blade-agent *> $null
  $rc = $LASTEXITCODE
  Pop-Location
  if ($rc -ne 0) { Write-Host "[agent] compose up 失败(rc=$rc)；看 docker logs smart-blade-agent" -ForegroundColor Red; exit 1 }
  $up = $false; foreach ($i in 1..20) { Start-Sleep 2; if (Test-Health "$agent/api/health") { $up=$true; break } }
  if (-not $up) { Write-Host "[agent] 40s 未就绪；沙盒 preflight 需 docker.sock + blade-sandbox 镜像（docker logs smart-blade-agent）" -ForegroundColor Red; exit 1 }
  Write-Host "[agent] OK (200, :8020)" -ForegroundColor Green
}

# ---------- 3. api-key：先验现有，失效才重 mint ----------
$tok = (Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -match '^\s*VITE_BLADE_TOKEN=' } | Select-Object -First 1) -replace '^\s*VITE_BLADE_TOKEN=', ''
$keyOk = $false
if ($tok) { $keyOk = ((& curl.exe -s -o NUL -w "%{http_code}" -H "Authorization: Bearer $tok" "$agent/api/auth/me" -m 8) -eq "200") }
$keyRefreshed = $false
if ($keyOk) {
  Write-Host "[key] 现有 api-key 仍有效，跳过 mint" -ForegroundColor Yellow
} else {
  Write-Host "[key] 现有 key 失效（多为容器重建），刷新中..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "refresh-local-key.ps1")
  if ($LASTEXITCODE -ne 0) { Write-Host "[key] 刷新失败" -ForegroundColor Red; exit 1 }
  $keyRefreshed = $true
}

# ---------- 4. 前端 (:3200) ----------
$feUp = Test-Health "http://localhost:3200/"
if ($feUp -and -not $keyRefreshed) {
  Write-Host "[frontend] 已在运行 (:3200)，key 未变，跳过" -ForegroundColor Yellow
} else {
  if ($feUp -and $keyRefreshed) {
    Write-Host "[frontend] key 已刷新 → 重启 vite 以读新值" -ForegroundColor Cyan
    $c = Get-NetTCPConnection -LocalPort 3200 -State Listen -ErrorAction SilentlyContinue
    if ($c) { $c.OwningProcess | Select-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; Start-Sleep 1 }
  } else {
    Write-Host "[frontend] 启动中 (:3200)..." -ForegroundColor Cyan
  }
  Start-Process -FilePath "powershell" `
    -ArgumentList "-NoExit","-Command","Set-Location '$root'; npm run dev" `
    -WindowStyle Normal
  foreach ($i in 1..15) { Start-Sleep 1; if (Test-Health "http://localhost:3200/") { break } }
  Write-Host "[frontend] -> http://localhost:3200/" -ForegroundColor Green
}

Write-Host ""
Write-Host "==== 本地无隧道整套已拉起 ====" -ForegroundColor Green
Write-Host "后端:   http://localhost:8000/api/health  (0.0.0.0)"
Write-Host "agent:  http://localhost:8020/api/health  (docker, 强制沙盒)"
Write-Host "前端:   http://localhost:3200/"
Write-Host "提示：浏览器开 localhost:3200 → 新建会话 → 传规则文件说『这是规则文件』即入库，全程无隧道。"

