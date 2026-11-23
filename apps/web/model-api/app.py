"""G-ROAD inference API for the exact saved HGB model.

Run from the site directory:
  uvicorn model-api.app:app --reload --port 8000

The endpoint accepts a feature dictionary because the production feature
builder is responsible for recreating the 34 training definitions exactly.
Missing values are rejected; they are never silently filled with zero.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


SITE_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = SITE_ROOT.parent
DEFAULT_MODEL = WORKSPACE_ROOT / "outputs" / "강원고속도로_사고위험_HGB_최종모델.joblib"
DEFAULT_META = WORKSPACE_ROOT / "outputs" / "강원고속도로_사고위험_HGB_모델정보.json"
DEFAULT_VALIDATION = WORKSPACE_ROOT / "outputs" / "강원고속도로_HGB_2차검증.json"

MODEL_PATH = Path(os.environ.get("GROAD_MODEL_PATH", DEFAULT_MODEL))
META_PATH = Path(os.environ.get("GROAD_MODEL_META_PATH", DEFAULT_META))
VALIDATION_PATH = Path(os.environ.get("GROAD_VALIDATION_PATH", DEFAULT_VALIDATION))

metadata = json.loads(META_PATH.read_text(encoding="utf-8"))
validation = json.loads(VALIDATION_PATH.read_text(encoding="utf-8"))
model = joblib.load(MODEL_PATH)
features: list[str] = metadata["features_in_order"]
thresholds: dict[str, float] = validation["risk_band_thresholds_from_2023_2024_training_predictions"]


class PredictionRequest(BaseModel):
    segment_id: str = Field(min_length=1, max_length=64)
    timestamp: str = Field(min_length=10, max_length=40)
    features: dict[str, float | int | None]


def band(probability: float) -> str:
    if probability >= thresholds["심각_min"]:
        return "심각"
    if probability >= thresholds["위험_min"]:
        return "위험"
    if probability >= thresholds["주의_min"]:
        return "주의"
    return "안전"


def predict_one(payload: PredictionRequest) -> dict[str, Any]:
    missing = [name for name in features if name not in payload.features or payload.features[name] is None]
    extras = sorted(set(payload.features) - set(features))
    if missing:
        raise HTTPException(status_code=422, detail={"message": "필수 모델 입력값이 없습니다.", "missing": missing})
    frame = pd.DataFrame([[payload.features[name] for name in features]], columns=features)
    probability = float(model.predict_proba(frame)[0, 1])
    if not 0.0 <= probability <= 1.0:
        raise HTTPException(status_code=500, detail="모델 확률 범위 오류")
    return {
        "segment_id": payload.segment_id,
        "timestamp": payload.timestamp,
        "probability": probability,
        "risk_band": band(probability),
        "model_sha256": metadata["sha256"],
        "ignored_extra_features": extras,
        "interpretation": metadata["probability_interpretation"],
    }


app = FastAPI(title="G-ROAD HGB Inference API", version="1.0.0")
origins = [value.strip() for value in os.environ.get("GROAD_CORS_ORIGINS", "http://localhost:3000").split(",") if value.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["Content-Type"])


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "model": metadata["model_type"], "sha256": metadata["sha256"], "features": len(features)}


@app.get("/model-info")
def model_info() -> dict[str, Any]:
    return {"model_type": metadata["model_type"], "features_in_order": features, "thresholds": thresholds, "holdout_2025": metadata["holdout_2025"], "probability_interpretation": metadata["probability_interpretation"]}


@app.post("/predict")
def predict(payload: PredictionRequest) -> dict[str, Any]:
    return predict_one(payload)


@app.post("/batch-predict")
def batch_predict(payloads: list[PredictionRequest]) -> list[dict[str, Any]]:
    if not payloads or len(payloads) > 1000:
        raise HTTPException(status_code=422, detail="1~1000개 요청만 허용됩니다.")
    return [predict_one(payload) for payload in payloads]
