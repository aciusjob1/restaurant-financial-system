#!/usr/bin/env pwsh
# Build the RFS installer end to end.
# Every external command has an exit-code guard — a failure here stops the build,
# it does not silently produce a stale installer.
$ErrorActionPreference = 'Stop'
$root = 'C:\Users\kmasu\restaurant-financial-system'
Set-Location $root

Write-Host '=== 1. Stop running processes ===' -ForegroundColor Cyan
@(4100, 3000, 3001) | ForEach-Object {
  Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2

Write-Host '=== 2. Prisma generate in source backend ===' -ForegroundColor Cyan
Push-Location 'backend'
$env:DATABASE_URL = 'postgresql://rfs:rfs_dev_password@localhost:5432/rfs?schema=public'
node node_modules\prisma\build\index.js generate --schema prisma\schema.prisma
if ($LASTEXITCODE -ne 0) { throw 'source prisma generate failed' }
Pop-Location

Write-Host '=== 3. Build backend / frontend / electron ===' -ForegroundColor Cyan
pnpm --filter @rfs/backend build;   if ($LASTEXITCODE -ne 0) { throw 'backend build failed' }
pnpm --filter @rfs/frontend build;  if ($LASTEXITCODE -ne 0) { throw 'frontend build failed' }
pnpm --filter @rfs/electron build;  if ($LASTEXITCODE -ne 0) { throw 'electron build failed' }

Write-Host '=== 4. Mirror backend dist ===' -ForegroundColor Cyan
Remove-Item 'backend-deployed\dist' -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item 'backend\dist' 'backend-deployed\dist' -Recurse -Force

Write-Host '=== 5. Prisma generate in deployed backend ===' -ForegroundColor Cyan
Push-Location 'backend-deployed'
node ..\backend\node_modules\prisma\build\index.js generate --schema prisma\schema.prisma
if ($LASTEXITCODE -ne 0) { throw 'deployed prisma generate failed' }
Pop-Location

Write-Host '=== 6. Deploy frontend (hoisted) ===' -ForegroundColor Cyan
Remove-Item 'frontend-deployed' -Recurse -Force -ErrorAction SilentlyContinue
pnpm --filter @rfs/frontend deploy --prod --config.node-linker=hoisted frontend-deployed
if ($LASTEXITCODE -ne 0) { throw 'frontend deploy failed' }
Copy-Item 'frontend\.next' 'frontend-deployed\.next' -Recurse -Force

Write-Host '=== 7. Verify deployed folders ===' -ForegroundColor Cyan
if (-not (Test-Path 'frontend-deployed\node_modules\next\dist\bin\next')) { throw 'frontend deploy verification failed' }
if (-not (Test-Path 'backend-deployed\dist\server.js')) { throw 'backend deploy verification failed' }
if (-not (Test-Path 'backend-deployed\node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\.prisma\client')) { throw 'deployed prisma client missing' }

Write-Host '=== 8. Stage into electron/ ===' -ForegroundColor Cyan
Remove-Item 'electron\backend-deployed','electron\frontend-deployed' -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item 'backend-deployed' 'electron\backend-deployed' -Recurse -Force
Copy-Item 'frontend-deployed' 'electron\frontend-deployed' -Recurse -Force

Write-Host '=== 9. Package installer ===' -ForegroundColor Cyan
Remove-Item 'dist-installer' -Recurse -Force -ErrorAction SilentlyContinue
pnpm --filter @rfs/electron exec electron-builder --win nsis
if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed' }

Write-Host '=== 10. Verify packaged contents ===' -ForegroundColor Cyan
$b = (Get-ChildItem 'dist-installer\win-unpacked\resources\backend-deployed' -Recurse -File | Measure-Object Length -Sum).Sum
$f = (Get-ChildItem 'dist-installer\win-unpacked\resources\frontend-deployed' -Recurse -File | Measure-Object Length -Sum).Sum
if (($b/1MB) -lt 100) { throw "packaged backend is $([math]::Round($b/1MB,1)) MB - afterPack failed" }
if (($f/1MB) -lt 500) { throw "packaged frontend is $([math]::Round($f/1MB,1)) MB - afterPack failed" }

$exe = 'dist-installer\RFS-Setup-0.1.0.exe'
$size = (Get-Item $exe).Length / 1MB
Write-Host ''
Write-Host ("Installer: {0:N1} MB  (packed: backend {1:N1} MB, frontend {2:N1} MB)" -f $size, ($b/1MB), ($f/1MB)) -ForegroundColor Green
Write-Host ("Location:  $(Resolve-Path $exe)") -ForegroundColor Green