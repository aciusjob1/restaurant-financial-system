# RFS System Access UI patch â€” part 1/4 (head, corrected)
$Apply = $true
$ErrorActionPreference = 'Stop'
$Repo = 'C:\Users\kmasu\restaurant-financial-system'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Stop-Safely([string]$Message) { throw "ABORT: $Message" }
if (-not (Test-Path -LiteralPath $Repo -PathType Container)) { Stop-Safely "Repository folder not found: $Repo" }
Set-Location -LiteralPath $Repo

$opsPath  = Join-Path $Repo 'frontend\components\ops\OpsShell.tsx'
$enPath   = Join-Path $Repo 'frontend\lib\i18n\en.ts'
$swPath   = Join-Path $Repo 'frontend\lib\i18n\sw.ts'
$pagePath = Join-Path $Repo 'frontend\app\ops\system-access\page.tsx'
foreach ($p in @($opsPath, $enPath, $swPath)) {
  if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { Stop-Safely "Required file is missing: $p" }
}
if (Test-Path -LiteralPath $pagePath) { Stop-Safely "Target already exists: $pagePath" }

$opsText = [System.IO.File]::ReadAllText($opsPath, $Utf8NoBom)
$enText  = [System.IO.File]::ReadAllText($enPath, $Utf8NoBom)
$swText  = [System.IO.File]::ReadAllText($swPath, $Utf8NoBom)
$opsNewline = if ($opsText.Contains("`r`n")) { "`r`n" } else { "`n" }

if ($opsText -match 'href\s*:\s*[''"]?/ops/system-access[''"]?') { Stop-Safely 'System Access nav entry already exists.' }
if ($enText -match '[''"]ops\.systemAccess\.title[''"]' -or $swText -match '[''"]ops\.systemAccess\.title[''"]') { Stop-Safely 'System Access keys already exist.' }

# --- locate /ops/settings nav entry ---
$opsLines = [regex]::Split($opsText, "\r?\n")
$settingsIndexes = @()
for ($i = 0; $i -lt $opsLines.Count; $i++) {
  if ($opsLines[$i] -match 'href\s*:\s*[''"]/ops/settings[''"]') { $settingsIndexes += $i }
}
if ($settingsIndexes.Count -ne 1) { Stop-Safely "Expected exactly one /ops/settings entry; found $($settingsIndexes.Count)." }
$settingsIndex = $settingsIndexes[0]
$settingsLine = $opsLines[$settingsIndex]
if ($settingsLine -notmatch '^\s*\{.*\}\s*,\s*$') { Stop-Safely '/ops/settings entry is not a single-line object ending in comma.' }

# --- add Wifi to the lucide-react import (line-based, no cross-import regex) ---
$lucideLine = -1
for ($i = 0; $i -lt $opsLines.Count; $i++) {
  if ($opsLines[$i] -match 'from\s*[''"]lucide-react[''"]') { $lucideLine = $i; break }
}
if ($lucideLine -lt 0) { Stop-Safely 'No lucide-react import found.' }
$openLine = -1
for ($j = $lucideLine; $j -ge 0; $j--) {
  if ($opsLines[$j] -match '^\s*import\s*\{') { $openLine = $j; break }
}
if ($openLine -lt 0) { Stop-Safely 'Could not find the opening of the lucide import.' }
$already = $false
for ($k = $openLine; $k -le $lucideLine; $k++) {
  if ($opsLines[$k] -match '(^|[,\s])Wifi([,\s]|$)') { $already = $true; break }
}
if (-not $already) {
  $newLines = New-Object 'System.Collections.Generic.List[string]'
  for ($m = 0; $m -lt $opsLines.Count; $m++) {
    $newLines.Add($opsLines[$m])
    if ($m -eq $openLine) { $newLines.Add('  Wifi,') }
  }
  $opsLines = $newLines.ToArray()
}
# rebuild $opsText with current newline convention
$opsText = $opsLines -join $opsNewline

# --- insert nav line after /ops/settings ---
$opsLines2 = [regex]::Split($opsText, "\r?\n")
$settingsIndexes2 = @()
for ($i = 0; $i -lt $opsLines2.Count; $i++) {
  if ($opsLines2[$i] -match 'href\s*:\s*[''"]/ops/settings[''"]') { $settingsIndexes2 += $i }
}
if ($settingsIndexes2.Count -ne 1) { Stop-Safely 'The /ops/settings anchor became ambiguous.' }
$settingsIndex2 = $settingsIndexes2[0]
$indent = ([regex]::Match($opsLines2[$settingsIndex2], '^\s*')).Value
$newNavLine = $indent + "{ href: '/ops/system-access', labelKey: 'nav.ops.systemAccess', icon: Wifi },"
$finalLines = New-Object 'System.Collections.Generic.List[string]'
for ($i = 0; $i -lt $opsLines2.Count; $i++) {
  $finalLines.Add($opsLines2[$i])
  if ($i -eq $settingsIndex2) { $finalLines.Add($newNavLine) }
}
$opsText = $finalLines -join $opsNewline

# --- locale insertion helper (unchanged) ---
function Add-FlatLocaleKeys([string]$Text, [System.Collections.IDictionary]$Values, [string]$Label) {
  $closeMatches = [regex]::Matches($Text, '(?m)^[ \t]*\}[ \t]*(?:as[ \t]+const)?[ \t]*;?[ \t]*$')
  if ($closeMatches.Count -ne 1) { Stop-Safely "Expected exactly one closing brace in $Label, found $($closeMatches.Count)." }
  $closing = $closeMatches[0]
  $newline = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $insertAt = $closing.Index
  $lastNonWhitespace = -1
  for ($j = $insertAt - 1; $j -ge 0; $j--) {
    if (-not [char]::IsWhiteSpace($Text[$j])) { $lastNonWhitespace = $j; break }
  }
  if ($lastNonWhitespace -lt 0) { Stop-Safely "$Label object appears empty." }
  if ($Text[$lastNonWhitespace] -ne ',') {
    $lineStart = $Text.LastIndexOf("`n", [Math]::Max(0, $lastNonWhitespace)) + 1
    $previousLine = $Text.Substring($lineStart, $lastNonWhitespace - $lineStart + 1).TrimEnd("`r")
    if ($previousLine -match '^\s*//') { Stop-Safely "Last entry in $Label has adjacent comment." }
    $Text = $Text.Insert($lastNonWhitespace + 1, ',')
    $insertAt++
  }
  $entries = foreach ($key in $Values.Keys) { "  '$key': '$($Values[$key])'," }
  return $Text.Insert($insertAt, (($entries -join $newline) + $newline))
}
# RFS System Access UI patch â€” part 2/4 (English dictionary + apply call)
$en = [ordered]@{
  'ops.systemAccess.title' = 'System Access'
  'ops.systemAccess.subtitle' = 'Share this address with devices on the restaurant Wi-Fi.'
  'ops.systemAccess.label' = 'Restaurant access link'
  'ops.systemAccess.copy' = 'Copy'
  'ops.systemAccess.copied' = 'Copied'
  'ops.systemAccess.copyFailed' = 'Copy failed. Select and copy the link manually.'
  'ops.systemAccess.connected' = 'Connected'
  'ops.systemAccess.unavailable' = 'Server unavailable'
  'ops.systemAccess.checking' = 'Checking...'
  'ops.systemAccess.retry' = 'Retry'
  'ops.systemAccess.sessionExpiredLabel' = 'Session expired'
  'ops.systemAccess.permissionDeniedLabel' = 'Access denied'
  'ops.systemAccess.signedout' = 'Your session has expired. Sign in again to view this page.'
  'ops.systemAccess.forbidden' = 'You do not have permission to view system access details.'
  'ops.systemAccess.error' = 'System error'
  'ops.systemAccess.errorBody' = 'The server responded but could not provide access details. Check the service and retry.'
  'ops.systemAccess.unavailableBody' = 'The server is not responding. Check that the restaurant PC is on and retry.'
  'ops.systemAccess.ambiguousTitle' = 'More than one network address'
  'ops.systemAccess.ambiguousBody' = 'This PC has several local addresses. Try the first; if a phone cannot connect, try the other listed addresses.'
  'ops.systemAccess.howTitle' = 'How to connect'
  'ops.systemAccess.how1' = 'Connect the device to the restaurant Wi-Fi.'
  'ops.systemAccess.how2' = 'Open the copied link in a browser.'
  'ops.systemAccess.how3' = 'Sign in with the account you were given.'
  'ops.systemAccess.noAddress' = 'No local network address was found. Check that this PC is connected to the Wi-Fi.'
  'nav.ops.systemAccess' = 'System Access'
}
$enText = Add-FlatLocaleKeys -Text $enText -Values $en -Label 'en.ts'
# RFS System Access UI patch â€” part 3/4 (Swahili dictionary + apply call)
$sw = [ordered]@{
  'ops.systemAccess.title' = 'Ufikiaji wa Mfumo'
  'ops.systemAccess.subtitle' = 'Shiriki anwani hii na vifaa vilivyounganishwa kwenye Wi-Fi ya mgahawa.'
  'ops.systemAccess.label' = 'Kiungo cha kufikia mfumo wa mgahawa'
  'ops.systemAccess.copy' = 'Nakili'
  'ops.systemAccess.copied' = 'Imenakiliwa'
  'ops.systemAccess.copyFailed' = 'Imeshindikana kunakili. Chagua na unakili kiungo hiki kwa mkono.'
  'ops.systemAccess.connected' = 'Imeunganishwa'
  'ops.systemAccess.unavailable' = 'Seva haipatikani'
  'ops.systemAccess.checking' = 'Inakagua...'
  'ops.systemAccess.retry' = 'Jaribu tena'
  'ops.systemAccess.sessionExpiredLabel' = 'Kipindi kimeisha'
  'ops.systemAccess.permissionDeniedLabel' = 'Ufikiaji umekataliwa'
  'ops.systemAccess.signedout' = 'Kipindi chako cha kuingia kimeisha. Ingia tena ili kuona ukurasa huu.'
  'ops.systemAccess.forbidden' = 'Huna ruhusa ya kuona maelezo ya ufikiaji wa mfumo.'
  'ops.systemAccess.error' = 'Hitilafu ya mfumo'
  'ops.systemAccess.errorBody' = 'Seva imejibu lakini imeshindwa kutoa maelezo ya ufikiaji. Kagua huduma na ujaribu tena.'
  'ops.systemAccess.unavailableBody' = 'Seva haijibu. Hakikisha kompyuta ya mgahawa imewashwa na ujaribu tena.'
  'ops.systemAccess.ambiguousTitle' = 'Anwani zaidi ya moja ya mtandao'
  'ops.systemAccess.ambiguousBody' = 'Kompyuta hii ina anwani kadhaa za ndani. Jaribu ya kwanza; simu ikishindwa kuunganishwa, jaribu anwani nyingine zilizoorodheshwa.'
  'ops.systemAccess.howTitle' = 'Jinsi ya kuunganisha'
  'ops.systemAccess.how1' = 'Unganisha kifaa kwenye Wi-Fi ya mgahawa.'
  'ops.systemAccess.how2' = 'Fungua kiungo kilichonakiliwa kwenye kivinjari.'
  'ops.systemAccess.how3' = 'Ingia kwa kutumia akaunti uliyopewa.'
  'ops.systemAccess.noAddress' = 'Hakuna anwani ya mtandao wa ndani iliyopatikana. Hakikisha kompyuta hii imeunganishwa kwenye Wi-Fi.'
  'nav.ops.systemAccess' = 'Ufikiaji wa Mfumo'
}
$swText = Add-FlatLocaleKeys -Text $swText -Values $sw -Label 'sw.ts'

# ---- page content (read from disk; no embedding) ----
$pageSourcePath = Join-Path $PSScriptRoot 'page.tsx'
if (-not (Test-Path -LiteralPath $pageSourcePath)) { Stop-Safely "Missing page.tsx at $pageSourcePath" }
$pageText = [System.IO.File]::ReadAllText($pageSourcePath, $Utf8NoBom)

if ($opsText -notmatch 'href\s*:\s*[''"]/ops/system-access[''"]') { Stop-Safely 'Staged OpsShell missing nav entry.' }
if ($opsText -notmatch '\bWifi\b') { Stop-Safely 'Staged OpsShell missing Wifi import.' }
foreach ($key in $en.Keys) {
  if (([regex]::Matches($enText, [regex]::Escape("'$key'"))).Count -ne 1) { Stop-Safely "en.ts staged key count wrong: $key" }
  if (([regex]::Matches($swText, [regex]::Escape("'$key'"))).Count -ne 1) { Stop-Safely "sw.ts staged key count wrong: $key" }
}
if ($pageText -notmatch "fetch\('/health'" -or $pageText -notmatch 'err\.status === 401' -or $pageText -notmatch 'err\.status === 403') {
  Stop-Safely 'Page source failed validation.'
}

$previewDir = Join-Path $env:TEMP ('rfs-system-access-preview-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $previewDir | Out-Null
$opsPreview  = Join-Path $previewDir 'OpsShell.tsx'
$enPreview   = Join-Path $previewDir 'en.ts'
$swPreview   = Join-Path $previewDir 'sw.ts'
$pagePreview = Join-Path $previewDir 'page.tsx'
$emptyFile   = Join-Path $previewDir 'empty.tsx'
[System.IO.File]::WriteAllText($opsPreview,  $opsText,  $Utf8NoBom)
[System.IO.File]::WriteAllText($enPreview,   $enText,   $Utf8NoBom)
[System.IO.File]::WriteAllText($swPreview,   $swText,   $Utf8NoBom)
[System.IO.File]::WriteAllText($pagePreview, $pageText, $Utf8NoBom)
[System.IO.File]::WriteAllText($emptyFile,   '',        $Utf8NoBom)

Write-Host ''
Write-Host 'PREVIEW ONLY - source files not changed.' -ForegroundColor Cyan
Write-Host "Preview files: $previewDir"

$pairs = @(
  @{ Old = $opsPath;  New = $opsPreview;  Label = 'OpsShell.tsx' },
  @{ Old = $enPath;   New = $enPreview;   Label = 'en.ts' },
  @{ Old = $swPath;   New = $swPreview;   Label = 'sw.ts' },
  @{ Old = $emptyFile; New = $pagePreview; Label = 'NEW system-access/page.tsx' }
)
foreach ($pair in $pairs) {
  Write-Host ''
  Write-Host "===== $($pair.Label) =====" -ForegroundColor Yellow
  & git diff --no-index -- $pair.Old $pair.New
  $global:LASTEXITCODE = 0
}

if (-not $Apply) {
  Write-Host ''
  Write-Host 'PREVIEW COMPLETE. Nothing written to the repo.' -ForegroundColor Green
  Write-Host 'Review the diffs. Then set $Apply = $true at the top of part1.ps1, re-assemble, and re-run.' -ForegroundColor Yellow
  return
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($p in @($opsPath, $enPath, $swPath)) {
  $bak = "$p.bak-system-access-$stamp"
  if (Test-Path -LiteralPath $bak) { Stop-Safely "Backup exists: $bak" }
  Copy-Item -LiteralPath $p -Destination $bak
}
$stage = @(
  @{ Target = $opsPath; Content = $opsText },
  @{ Target = $enPath;  Content = $enText },
  @{ Target = $swPath;  Content = $swText }
)
foreach ($s in $stage) {
  $tmp = $s.Target + '.system-access.tmp'
  [System.IO.File]::WriteAllText($tmp, $s.Content, $Utf8NoBom)
}
foreach ($s in $stage) {
  Move-Item -LiteralPath ($s.Target + '.system-access.tmp') -Destination $s.Target -Force
}
$pageDir = Split-Path -Parent $pagePath
if (-not (Test-Path -LiteralPath $pageDir)) { New-Item -ItemType Directory -Path $pageDir -Force | Out-Null }
[System.IO.File]::WriteAllText($pagePath, $pageText, $Utf8NoBom)

$postOps = [System.IO.File]::ReadAllText($opsPath, $Utf8NoBom)
$postEn  = [System.IO.File]::ReadAllText($enPath, $Utf8NoBom)
$postSw  = [System.IO.File]::ReadAllText($swPath, $Utf8NoBom)
$postPg  = [System.IO.File]::ReadAllText($pagePath, $Utf8NoBom)
if (([regex]::Matches($postOps, 'href\s*:\s*[''"]/ops/system-access[''"]')).Count -ne 1) { Stop-Safely 'Post nav assertion failed; backups exist.' }
foreach ($key in $en.Keys) {
  if (([regex]::Matches($postEn, [regex]::Escape("'$key'"))).Count -ne 1) { Stop-Safely "Post en key failed: $key" }
  if (([regex]::Matches($postSw, [regex]::Escape("'$key'"))).Count -ne 1) { Stop-Safely "Post sw key failed: $key" }
}
if ($postPg -notmatch "fetch\('/health'") { Stop-Safely 'Post page assertion failed; backups exist.' }
Write-Host ''
Write-Host 'APPLIED: page, nav entry, en/sw keys.' -ForegroundColor Green
Write-Host "Backups: *.bak-system-access-$stamp"