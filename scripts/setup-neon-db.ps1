# One-time Neon / production database setup
# Usage:
#   $env:DATABASE_URL = "postgresql://....neon.tech/neondb?sslmode=require"
#   .\scripts\setup-neon-db.ps1

param(
  [string]$DatabaseUrl = $env:DATABASE_URL
)

if (-not $DatabaseUrl) {
  Write-Host "Set DATABASE_URL first (copy from Neon console or Vercel env vars)." -ForegroundColor Red
  exit 1
}

if ($DatabaseUrl -match 'localhost|127\.0\.0\.1') {
  Write-Host "This script is for Neon/production. DATABASE_URL looks local." -ForegroundColor Yellow
}

$env:DATABASE_URL = $DatabaseUrl
Write-Host "Pushing Prisma schema..."
npx prisma db push
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Seeding admin user, areas, polling stations..."
npm run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Redeploy Vercel and log in with admin / admin123" -ForegroundColor Green
