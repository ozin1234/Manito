"""Download public standard road link geometry for joining keyed ITS traffic speeds.

Source: Esri Korea public mirror of the national standard node/link dataset.
This is road geometry, not a live traffic feed. Run occasionally when the
source changes; an ITS key is still required for speed readings.
"""

import json
import gzip
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

BASE = "https://portal.esrikr.com/arcgis/rest/services/Hosted/ITS_LINK/FeatureServer"
BBOX = "126.8,36.6,129.8,38.8"
OUTPUT = Path(__file__).resolve().parents[1] / "data" / "its-link-shapes.json.gz"


def request(layer, offset):
    params = {
        "where": "road_rank IN ('101','103')",
        "geometry": BBOX,
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "link_id,road_name,road_rank",
        "outSR": "4326",
        "resultOffset": offset,
        "resultRecordCount": 1000,
        "f": "geojson",
    }
    url = f"{BASE}/{layer}/query?{urlencode(params)}"
    for attempt in range(3):
        try:
            with urlopen(url, timeout=60) as response:
                data = json.load(response)
            if data.get("type") != "FeatureCollection":
                raise ValueError(f"Unexpected response: {data.get('error', data)}")
            return data["features"]
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def main():
    by_id = {}
    for layer in (0, 1, 3):
        offset = 0
        while True:
            features = request(layer, offset)
            for feature in features:
                props = feature.get("properties") or {}
                link_id = str(props.get("link_id") or "")
                geometry = feature.get("geometry") or {}
                if link_id and geometry.get("type") in ("LineString", "MultiLineString"):
                    by_id[link_id] = geometry
            offset += len(features)
            print(f"layer {layer}: {offset} fetched, {len(by_id)} unique", flush=True)
            if len(features) < 1000:
                break
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUTPUT, "wt", encoding="utf-8", compresslevel=6) as target:
        json.dump(by_id, target, ensure_ascii=False, separators=(",", ":"))
    print(f"saved {len(by_id)} road links to {OUTPUT} ({OUTPUT.stat().st_size} bytes)", flush=True)


if __name__ == "__main__":
    main()
