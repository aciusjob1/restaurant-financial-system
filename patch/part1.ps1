# RFS System Access UI patch — part 1/4 (head, corrected)
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