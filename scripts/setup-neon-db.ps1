# One-time setup for Neon (or any hosted Postgres used by Vercel)
#
# 1. Neon console → Connection string → use the DIRECT URL (not pooler) for this script
# 2. Vercel → Settings → Environment Variables → DATABASE_URL = POOLED URL for the app
#
# Run:
#   $env:DATABASE_URL = "postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
#   .\scripts\setup-neon-db.ps1

param(
  [string]$DatabaseUrl = $env:DATABASE_URL
)

$ErrorActionPreference = "Stop"

if (-not $DatabaseUrl) {
  Write-Host ""
  Write-Host "DATABASE_URL is not set." -ForegroundColor Red
  Write-Host ""
  Write-Host "Get it from:" -ForegroundColor Yellow
  Write-Host "  Neon:  https://console.neon.tech  → your project → Connect → Connection string"
  Write-Host "  Or:    Vercel → Project → Settings → Environment Variables → DATABASE_URL"
  Write-Host ""
  Write-Host "Then run:" -ForegroundColor Yellow
  Write-Host '  $env:DATABASE_URL = "postgresql://..."' -ForegroundColor Cyan
  Write-Host "  .\scripts\setup-neon-db.ps1" -ForegroundColor Cyan
  Write-Host ""
  exit 1
}

if ($DatabaseUrl -match 'localhost|127\.0\.0\.1') {
  Write-Host "Warning: DATABASE_URL looks local. For Vercel you need your Neon URL." -ForegroundColor Yellow
}

if ($DatabaseUrl -match 'pooler') {
  Write-Host "Tip: If db push fails, use Neon's DIRECT connection string (without -pooler) for this script only." -ForegroundColor Yellow
}

$env:DATABASE_URL = $DatabaseUrl

Push-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Creating tables (prisma db push)..." -ForegroundColor Cyan
npx prisma db push
if ($LASTEXITCODE -ne 0) {
  Write-Host "db push failed. Try Neon's DIRECT connection string." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host "Seeding data (admin user, 34 areas, polling stations)..." -ForegroundColor Cyan
npm run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Success." -ForegroundColor Green
Write-Host "  Login:  admin / admin123" -ForegroundColor Green
Write-Host "  Redeploy Vercel (or wait for latest deploy), then refresh your site." -ForegroundColor Green
Write-Host ""

Pop-Location
