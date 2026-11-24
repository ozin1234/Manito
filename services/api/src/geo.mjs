export function validPoint(point) {
  return point && typeof point === "object" &&
    Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    point.lat >= 33 && point.lat <= 39 && point.lng >= 124 && point.lng <= 132;
}
