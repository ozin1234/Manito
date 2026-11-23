"""Build an inspectable G-ROAD demo feed from the saved HGB model.

The deployed Site is static and cannot execute a scikit-learn joblib.  This
script therefore runs the exact saved model over the complete-case 2025 panel
and exports one real peak-risk observation per road segment.  The UI labels
the result as holdout/demo data; live inference is served by model-api/app.py.
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "work" / "pydeps"))

import joblib
import pandas as pd
from pyproj import Transformer


SITE_ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = ROOT / "outputs"
MODEL_PATH = OUTPUTS / "강원고속도로_사고위험_HGB_최종모델.joblib"
META_PATH = OUTPUTS / "강원고속도로_사고위험_HGB_모델정보.json"
VALIDATION_PATH = OUTPUTS / "강원고속도로_HGB_2차검증.json"
SENSITIVITY_PATH = OUTPUTS / "KEC좌표기반_비선형AI_민감도.json"
PANEL_PATH = OUTPUTS / "강원고속도로_AWS지형_완전격자패널.csv"
DESTINATION = SITE_ROOT / "public" / "data" / "risk-feed.json"


def risk_band(probability: float, thresholds: dict[str, float]) -> str:
    if probability >= thresholds["심각_min"]:
        return "심각"
    if probability >= thresholds["위험_min"]:
        return "위험"
    if probability >= thresholds["주의_min"]:
        return "주의"
    return "안전"


def main() -> None:
    metadata = json.loads(META_PATH.read_text(encoding="utf-8"))
    validation = json.loads(VALIDATION_PATH.read_text(encoding="utf-8"))
    sensitivity = json.loads(SENSITIVITY_PATH.read_text(encoding="utf-8"))
    features = metadata["features_in_order"]
    thresholds = validation["risk_band_thresholds_from_2023_2024_training_predictions"]

    panel = pd.read_csv(PANEL_PATH, low_memory=False)
    panel["timestamp"] = pd.to_datetime(panel["timestamp"], errors="coerce")
    test = panel.loc[panel["timestamp"].dt.year.eq(2025)].copy()
    complete = test.dropna(subset=features).copy()

    model = joblib.load(MODEL_PATH)
    complete["risk_probability"] = model.predict_proba(complete[features])[:, 1]
    if len(complete) != metadata["holdout_2025"].get("test_rows", len(complete)):
        # Older metadata did not store test_rows. The validation file is the authority.
        expected = validation["model_reload_and_probability_bounds"]["test_rows"]
        if len(complete) != expected:
            raise RuntimeError(f"Expected {expected} complete 2025 rows, found {len(complete)}")

    peak_index = complete.groupby("segment_id")["risk_probability"].idxmax()
    peaks = complete.loc[peak_index].sort_values("risk_probability", ascending=False)
    transformer = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)
    lon, lat = transformer.transform(peaks["segment_x"].to_numpy(), peaks["segment_y"].to_numpy())
    peaks = peaks.assign(longitude=lon, latitude=lat)

    route_names = {
        "50": "영동고속도로",
        "55": "중앙고속도로",
        "60": "서울양양고속도로",
        "65": "동해고속도로",
    }
    items: list[dict[str, object]] = []
    for rank, (_, row) in enumerate(peaks.iterrows(), start=1):
        route_code, start_km = str(row["segment_id"]).split("_", 1)
        probability = float(row["risk_probability"])
        factors: list[str] = []
        if float(row.get("lag2h_aws_freezing_wet_rate", 0) or 0) > 0:
            factors.append("결빙·습윤")
        if float(row.get("lag2h_aws_rain_sum_mm", 0) or 0) > 0:
            factors.append("강수")
        if float(row.get("lag2h_congestion_rate", 0) or 0) > 0.05:
            factors.append("정체")
        if float(row.get("tunnel_rate", 0) or 0) > 0.2:
            factors.append("터널 밀집")
        if float(row.get("slope_max_deg", 0) or 0) > 20:
            factors.append("급경사")
        if not factors:
            factors.append("교통·지형 복합")
        items.append(
            {
                "id": str(row["segment_id"]),
                "rank": rank,
                "routeCode": route_code,
                "routeName": route_names.get(route_code, f"노선 {route_code}"),
                "segmentLabel": f"{float(start_km):g}–{float(start_km) + 10:g} km",
                "timestamp": row["timestamp"].isoformat(),
                "lat": round(float(row["latitude"]), 6),
                "lng": round(float(row["longitude"]), 6),
                "probability": probability,
                "riskBand": risk_band(probability, thresholds),
                "relativeToObserved": probability / metadata["holdout_2025"]["observed_rate"],
                "temperatureC": round(float(row["lag2h_aws_temperature_mean_c"]), 1),
                "rainMm": round(float(row["lag2h_aws_rain_sum_mm"]), 1),
                "windMs": round(float(row["lag2h_aws_wind_max_ms"]), 1),
                "speedKmh": round(float(row["lag2h_weighted_speed_kmh"]), 1),
                "flowLog": round(float(row["lag2h_log_mean_flow"]), 3),
                "factors": factors[:3],
            }
        )

    checksum = hashlib.sha256(MODEL_PATH.read_bytes()).hexdigest()
    payload = {
        "generatedFrom": "2025 holdout complete-case panel",
        "dataMode": "validated_demo",
        "model": {
            "type": "HistGradientBoostingClassifier",
            "sha256": checksum,
            "trainingRows": metadata["training_rows"],
            "testRows": validation["model_reload_and_probability_bounds"]["test_rows"],
            "features": len(features),
            "auc": metadata["holdout_2025"]["roc_auc"],
            "logLoss": metadata["holdout_2025"]["log_loss"],
            "baselineLogLoss": sensitivity["models"]["baseline"]["holdout_2025"]["log_loss"],
            "deltaLogLoss": sensitivity["paired_calendar_day_bootstrap_2025"]["full_vs_baseline"]["logloss_difference"],
            "holmP": sensitivity["familywise_holm_logloss"]["full"]["holm_adjusted_p_value"],
            "top1PctLift": metadata["holdout_2025"]["top1pct_lift"],
            "probabilityMin": validation["model_reload_and_probability_bounds"]["minimum_probability"],
            "probabilityMax": validation["model_reload_and_probability_bounds"]["maximum_probability"],
            "negativeProbabilityCount": validation["model_reload_and_probability_bounds"]["negative_probability_count"],
            "aboveOneCount": validation["model_reload_and_probability_bounds"]["probability_above_one_count"],
            "h1HolmP": validation["half_year_robustness"]["2025_H1"]["holm_adjusted_logloss_p_value"],
            "h2HolmP": validation["half_year_robustness"]["2025_H2"]["holm_adjusted_logloss_p_value"],
        },
        "thresholds": thresholds,
        "segments": items,
    }
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    DESTINATION.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {DESTINATION} with {len(items)} segment peaks")


if __name__ == "__main__":
    main()
