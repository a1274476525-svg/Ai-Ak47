# AI OS — Setup Script (Windows PowerShell)
# Run: .\infra\scripts\setup.ps1

Write-Host "==> AI OS Setup" -ForegroundColor Cyan

# 1. Copy .env if not exists
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "  [OK] .env created from .env.example — edit your secrets!" -ForegroundColor Yellow
} else {
    Write-Host "  [SKIP] .env already exists" -ForegroundColor Gray
}

# 2. Start infrastructure
Write-Host "`n==> Starting infrastructure (PostgreSQL, Redis, Qdrant)..." -ForegroundColor Cyan
docker compose up -d postgres redis qdrant

# 3. Wait for health checks
Write-Host "`n==> Waiting for services to be healthy..." -ForegroundColor Cyan
$timeout = 60
$start = Get-Date
while ($true) {
    $healthy = docker compose ps --format json 2>$null |
        ConvertFrom-Json |
        Where-Object { $_.Health -eq "healthy" } |
        Measure-Object | Select-Object -ExpandProperty Count

    if ($healthy -ge 3) {
        Write-Host "  [OK] All 3 services are healthy!" -ForegroundColor Green
        break
    }

    if (((Get-Date) - $start).TotalSeconds -gt $timeout) {
        Write-Host "  [WARN] Timeout — check: docker compose ps" -ForegroundColor Red
        break
    }

    Write-Host "  ... waiting ($healthy/3 healthy)" -ForegroundColor Gray
    Start-Sleep 3
}

Write-Host "`n==> Services:" -ForegroundColor Cyan
Write-Host "  PostgreSQL  → localhost:5432" -ForegroundColor White
Write-Host "  Redis       → localhost:6379" -ForegroundColor White
Write-Host "  Qdrant      → localhost:6333  (UI: http://localhost:6333/dashboard)" -ForegroundColor White
Write-Host "`n  Done! Next: setup gateway and ai-brain." -ForegroundColor Green
