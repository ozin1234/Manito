param([string]$BaseUrl = 'http://127.0.0.1:8788')

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw '.env 파일이 없습니다.' }
$keyLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^GROAD_API_KEY=' } | Select-Object -First 1
if (-not $keyLine) { throw '.env에 GROAD_API_KEY가 없습니다.' }
$key = $keyLine.Substring('GROAD_API_KEY='.Length)
$headers = @{ Authorization = "Bearer $key" }

$latitude = 37.7
$longitude = 128.4
foreach ($zoom in 7..10) {
  $tilesPerSide = [Math]::Pow(2, $zoom)
  $x = [int][Math]::Floor(($longitude + 180) / 360 * $tilesPerSide)
  $radians = $latitude * [Math]::PI / 180
  $y = [int][Math]::Floor((1 - [Math]::Log([Math]::Tan($radians) + 1 / [Math]::Cos($radians)) / [Math]::PI) / 2 * $tilesPerSide)
  $timer = [System.Diagnostics.Stopwatch]::StartNew()
  $response = Invoke-WebRequest -Uri "$BaseUrl/v1/tiles/$zoom/$x/$y.png" -Headers $headers -TimeoutSec 150
  $contentType = $response.Headers['Content-Type'] | Select-Object -First 1
  if ($response.StatusCode -ne 200 -or $contentType -notlike 'image/png*' -or $response.RawContentLength -lt 1000) {
    throw "지도 타일 $zoom/$x/$y 검증에 실패했습니다."
  }
  [PSCustomObject]@{ Tile = "$zoom/$x/$y"; Bytes = $response.RawContentLength; Seconds = [Math]::Round($timer.Elapsed.TotalSeconds, 1) }
}
