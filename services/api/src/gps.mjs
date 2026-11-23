import { distanceMeters, validPoint } from "./geo.mjs";

export function filterGps(previous, candidate) {
  if (!validPoint(candidate) || !Number.isFinite(candidate.accuracy) || candidate.accuracy <= 0 ||
      candidate.accuracy > 80 || !Number.isFinite(candidate.timestamp))
    return { accepted: false, reason: "weak_fix", point: previous };
  if (!previous) return { accepted: true, reason: "first_fix", point: candidate };
  const elapsedSeconds = (candidate.timestamp - previous.timestamp) / 1000;
  if (elapsedSeconds <= 0) return { accepted: false, reason: "stale_fix", point: previous };
  const separation = distanceMeters(previous, candidate);
  const plausibleMeters = 65 * elapsedSeconds + previous.accuracy + candidate.accuracy;
  if (separation > plausibleMeters) return { accepted: false, reason: "gps_jump", point: previous };
  // High-accuracy fixes count more; smoothing is deliberately light while driving.
  const previousWeight = Math.min(0.75, candidate.accuracy / (previous.accuracy + candidate.accuracy));
  return { accepted: true, reason: "smoothed", point: {
    ...candidate,
    lat: candidate.lat * (1 - previousWeight) + previous.lat * previousWeight,
    lng: candidate.lng * (1 - previousWeight) + previous.lng * previousWeight,
    accuracy: candidate.accuracy,
  } };
}
