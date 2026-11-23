param([switch]$SkipTiles, [switch]$RoutesOnly)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$dataRoot = Join-Path $projectRoot 'data'
$sourcePbf = Join-Path $dataRoot 'south-korea-latest.osm.pbf'
$regionPbf = Join-Path $dataRoot 'gangwon-buffer.osm.pbf'
$regionMarker = Join-Path $dataRoot '.groad-region-ready-gangwon'
$readyMarker = Join-Path $dataRoot '.groad-osrm-ready-gangwon'
$tileMarker = Join-Path $dataRoot '.groad-tiles-ready-gangwon'

docker info --format '{{.ServerVersion}}' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop 또는 Docker 서버를 먼저 실행하세요.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw '.env에 GROAD_API_KEY를 설정하세요.' }
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath $sourcePbf) -or (Get-Item -LiteralPath $sourcePbf).Length -lt 100MB) {
  Write-Host '한국 OpenStreetMap 원본을 다운로드합니다.'
  $partial = "$sourcePbf.partial"
  Invoke-WebRequest -Uri 'https://download.geofabrik.de/asia/south-korea-latest.osm.pbf' -OutFile $partial
  if ((Get-Item -LiteralPath $partial).Length -lt 100MB) { throw '한국 OSM 파일 다운로드가 완전하지 않습니다.' }
  Move-Item -LiteralPath $partial -Destination $sourcePbf -Force
}

if (-not (Test-Path -LiteralPath $regionMarker)) {
  Write-Host '한국 원본에서 강원 및 인접 도로 범위를 추출합니다.'
  docker build -f (Join-Path $projectRoot 'Osmium.Dockerfile') -t groad-osmium $projectRoot
  if ($LASTEXITCODE -ne 0) { throw '지역 추출 도구 빌드에 실패했습니다.' }
  $mount = "${dataRoot}:/data"
  docker run --rm -v $mount groad-osmium extract --bbox=126.8,36.6,129.8,38.8 --strategy=complete_ways --set-bounds --overwrite /data/south-korea-latest.osm.pbf -o /data/gangwon-buffer.osm.pbf
  if ($LASTEXITCODE -ne 0) { throw '강원 도로 범위 추출에 실패했습니다.' }
  [System.IO.File]::WriteAllText($regionMarker, 'prepared')
}

if (-not (Test-Path -LiteralPath $readyMarker)) {
  Write-Host 'OSRM 자동차 도로 그래프를 준비합니다. 시간이 걸릴 수 있습니다.'
  $mount = "${dataRoot}:/data"
  docker run --rm -v $mount ghcr.io/project-osrm/osrm-backend:latest osrm-extract --threads 2 -p /opt/car.lua /data/gangwon-buffer.osm.pbf
  if ($LASTEXITCODE -ne 0) { throw 'OSRM 추출에 실패했습니다.' }
  docker run --rm -v $mount ghcr.io/project-osrm/osrm-backend:latest osrm-partition --threads 2 /data/gangwon-buffer.osrm
  if ($LASTEXITCODE -ne 0) { throw 'OSRM 분할에 실패했습니다.' }
  docker run --rm -v $mount ghcr.io/project-osrm/osrm-backend:latest osrm-customize --threads 2 /data/gangwon-buffer.osrm
  if ($LASTEXITCODE -ne 0) { throw 'OSRM 그래프 완성에 실패했습니다.' }
  [System.IO.File]::WriteAllText($readyMarker, 'prepared')
}

if (-not $RoutesOnly -and -not $SkipTiles -and -not (Test-Path -LiteralPath $tileMarker)) {
  Write-Host '자체 지도 타일 데이터베이스를 준비합니다. 처음 실행 시 시간이 걸릴 수 있습니다.'
  docker build -f (Join-Path $projectRoot 'Tile.Dockerfile') -t groad-tiles:latest $projectRoot
  if ($LASTEXITCODE -ne 0) { throw '지도 타일 이미지 빌드에 실패했습니다.' }
  docker volume create groad_tile_db | Out-Null
  docker volume create groad_tile_cache | Out-Null
  $pbfMount = "${regionPbf}:/data/region.osm.pbf:ro"
  docker run --rm --shm-size=256m -v $pbfMount -v groad_tile_db:/data/database/ -v groad_tile_cache:/data/tiles/ groad-tiles:latest import
  if ($LASTEXITCODE -ne 0) { throw '지도 타일 데이터 가져오기에 실패했습니다.' }
  [System.IO.File]::WriteAllText($tileMarker, 'prepared')
}

Push-Location $projectRoot
try {
  if ($RoutesOnly) {
    docker compose up -d --build api osrm
  } else {
    docker compose up -d --build
  }
  if ($LASTEXITCODE -ne 0) { throw 'G-ROAD 컨테이너 시작에 실패했습니다.' }
} finally { Pop-Location }

Write-Host '로컬 API 주소: http://127.0.0.1:8788'
if ($RoutesOnly) {
  Write-Host '경로 엔진만 시작했습니다. 장소 검색과 지도 타일은 전체 구성 실행 후 제공됩니다.'
} else {
  Write-Host 'Nominatim 장소 데이터는 첫 실행 시 백그라운드에서 가져옵니다. 준비 상태를 확인하세요.'
}
