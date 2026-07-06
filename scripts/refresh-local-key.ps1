# 本地 blade-agent(mock 模式)api-key 一键刷新：自动登录拿 cookie → mint api-key → 写回 .env 的 VITE_BLADE_TOKEN。
# 仅在「重建/换版本 agent 容器」后需要跑（普通 restart 不失效）。跑完重启 vite(npm run dev)。
# 用法（项目根）：  powershell -ExecutionPolicy Bypass -File scripts/refresh-local-key.ps1
$ErrorActionPreference = "Stop"
$agent = $env:BLADE_AGENT_URL; if (-not $agent) { $agent = "http://localhost:8020" }
$envFile = Join-Path $PSScriptRoot "..\.env" | Resolve-Path | ForEach-Object { $_.Path }

# 等 agent 健康
$ok = $false
for ($i=0; $i -lt 15; $i++) {
  if ((curl.exe -s -o NUL -w "%{http_code}" "$agent/api/health" -m 5) -eq "200") { $ok=$true; break }
  Start-Sleep -Seconds 2
}
if (-not $ok) { Write-Error "agent $agent 未就绪（health != 200）"; exit 1 }

# 1) mock 登录拿 cookie（GET /api/auth/login 直接 302 下发 blade_token）
$jar = New-TemporaryFile
curl.exe -s -o NUL -c $jar.FullName "$agent/api/auth/login" -m 10 | Out-Null

# 2) mint api-key
$resp = curl.exe -s -b $jar.FullName -X POST "$agent/api/user/api-keys/" -H "Content-Type: application/json" -d '{"name":"smart-doc-local"}' -m 10
Remove-Item $jar.FullName -Force -ErrorAction SilentlyContinue
$key = ($resp | ConvertFrom-Json).plaintext
if (-not $key) { Write-Error "mint 失败：$resp"; exit 1 }

# 3) 验证可建会话
$code = curl.exe -s -o NUL -w "%{http_code}" -X POST -H "Authorization: Bearer $key" -H "Content-Type: application/json" -d '{"intent":"x"}' "$agent/api/sessions" -m 15
if ($code -ne "200") { Write-Error "新 key 建会话失败 http=$code"; exit 1 }

# 4) 逐行写回 .env 的 VITE_BLADE_TOKEN（逐行避免整文件 -replace 破坏其它行/中文注释）
$lines = Get-Content $envFile -Encoding UTF8
$found = $false
$out = foreach ($ln in $lines) {
  if ($ln -match '^\s*VITE_BLADE_TOKEN=') { $found = $true; "VITE_BLADE_TOKEN=$key" } else { $ln }
}
if (-not $found) { $out += "VITE_BLADE_TOKEN=$key" }
Set-Content -Path $envFile -Value $out -Encoding UTF8

Write-Host "✅ 新 api-key 已写入 .env（建会话 200）。请重启 vite：npm run dev" -ForegroundColor Green

