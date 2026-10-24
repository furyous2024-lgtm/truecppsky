$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ephe = Join-Path $root 'ephe'
New-Item -ItemType Directory -Force -Path $ephe | Out-Null
$base = 'https://github.com/aloistr/swisseph/raw/master/ephe'
$files = @(
  'seplm06.se1','semom06.se1','seasm06.se1',
  'sepl_00.se1','semo_00.se1','seas_00.se1',
  'sepl_06.se1','semo_06.se1','seas_06.se1',
  'sepl_12.se1','semo_12.se1','seas_12.se1',
  'sepl_18.se1','semo_18.se1','seas_18.se1',
  'sefstars.txt'
)
foreach ($f in $files) {
  $dest = Join-Path $ephe $f
  if (Test-Path $dest -PathType Leaf) { Write-Host "OK $f"; continue }
  $url = "$base/$f"
  Write-Host "Baixando $f"
  try {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
  } catch {
    Write-Host "Falhou pelo repositório principal, tentando mirror antigo para $f"
    $mirror = "https://github.com/chapagain/php-swiss-ephemeris/raw/master/sweph/$f"
    Invoke-WebRequest -Uri $mirror -OutFile $dest -UseBasicParsing
  }
}
Write-Host 'Efemerides Swiss baixadas.'
