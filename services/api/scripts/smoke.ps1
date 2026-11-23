param([string]$BaseUrl = 'http://127.0.0.1:8788')

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$envFile = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw '.env 파일이 없습니다.' }
$keyLine = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^GROAD_API_KEY=' } | Select-Object -First 1
if (-not $keyLine) { throw '.env에 GROAD_API_KEY가 없습니다.' }
$key = $keyLine.Substring('GROAD_API_KEY='.Length)
$headers = @{ Authorization = "Bearer $key" }

$health = Invoke-RestMethod -Uri "$BaseUrl/health" -TimeoutSec 10
if ($health.status -ne 'ok') { throw 'API 프로세스 상태가 올바르지 않습니다.' }

$body = @{
  origin = @{ lat = 37.8813; lng = 127.7298 }
  destination = @{ lat = 37.7519; lng = 128.8761 }
  option = 'recommended'
} | ConvertTo-Json -Depth 5 -Compress
$response = Invoke-RestMethod -Method Post -Uri "$BaseUrl/v1/routes/driving" -Headers $headers -ContentType 'application/json' -Body $body -TimeoutSec 30
$route = $response.route
if ($route.provider -ne 'groad-osrm' -or $route.distanceMeters -le 1000 -or $route.geometry.coordinates.Count -lt 2) {
  throw '춘천~강릉 자동차 경로 응답이 올바르지 않습니다.'
}
[PSCustomObject]@{
  Provider = $route.provider
  DistanceKm = [Math]::Round($route.distanceMeters / 1000, 1)
  DurationMinutes = [Math]::Round($route.durationSeconds / 60)
  GeometryPoints = $route.geometry.coordinates.Count
  TrafficAware = $route.trafficAware
}
