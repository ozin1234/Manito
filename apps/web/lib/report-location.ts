import type { UwatLocation } from "./uwat-types";
import { locationErrorMessage, locationPreflight } from "./location-diagnostics.ts";

export function hasReportLocation<T extends { lat?: number | null; lng?: number | null }>(value: T): value is T & { lat: number; lng: number } {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && value.lat! >= 33 && value.lat! <= 39 && value.lng! >= 124 && value.lng! <= 132;
}
export function currentReportLocation(): Promise<UwatLocation> {
  const issue = locationPreflight();
  if (issue) return Promise.reject(new Error(issue));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(({ coords, timestamp }) => {
      const point = { lat: coords.latitude, lng: coords.longitude };
      if (!hasReportLocation(point) || !Number.isFinite(coords.accuracy) || coords.accuracy < 0 || !Number.isFinite(timestamp) || coords.accuracy > 10_000 || Math.abs(Date.now() - timestamp) > 300_000) { reject(new Error("현장 위치를 정확히 확인하지 못했습니다. 지도에서 직접 골라 주세요.")); return; }
      resolve({ ...point, locationSource: "gps", locationAccuracyM: coords.accuracy, locationCapturedAt: new Date(timestamp).toISOString() });
    }, (error) => reject(new Error(locationErrorMessage(error))), { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
  });
}
