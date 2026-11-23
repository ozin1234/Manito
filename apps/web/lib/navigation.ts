export type GpsFix = { lat: number; lng: number; accuracy: number; timestamp: number; heading: number | null; speed: number | null };

export function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const latitude = ((a.lat + b.lat) / 2) * Math.PI / 180;
  return Math.hypot((b.lng - a.lng) * Math.cos(latitude) * 111_320, (b.lat - a.lat) * 111_320);
}

export function filterGps(previous: GpsFix | null, candidate: GpsFix): GpsFix | null {
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng) ||
      !Number.isFinite(candidate.accuracy) || candidate.accuracy <= 0 || candidate.accuracy > 500 ||
      !Number.isFinite(candidate.timestamp)) return null;
  if (!previous) return candidate;
  const elapsed = (candidate.timestamp - previous.timestamp) / 1000;
  if (elapsed <= 0 || metresBetween(previous, candidate) > 65 * elapsed + previous.accuracy + candidate.accuracy) return null;
  const previousWeight = Math.min(0.75, candidate.accuracy / (previous.accuracy + candidate.accuracy));
  return {
    ...candidate,
    lat: candidate.lat * (1 - previousWeight) + previous.lat * previousWeight,
    lng: candidate.lng * (1 - previousWeight) + previous.lng * previousWeight,
  };
}

export function distanceToRoute(point: { lat: number; lng: number }, coordinates: [number, number][]) {
  if (coordinates.length === 0) return Infinity;
  const latitude = point.lat * Math.PI / 180;
  const project = ([lng, lat]: [number, number]) => [
    (lng - point.lng) * Math.cos(latitude) * 111_320,
    (lat - point.lat) * 111_320,
  ];
  let nearest = Infinity;
  for (let index = 0; index < coordinates.length; index++) {
    const [ax, ay] = project(coordinates[index]);
    if (index === coordinates.length - 1) {
      nearest = Math.min(nearest, Math.hypot(ax, ay));
      break;
    }
    const [bx, by] = project(coordinates[index + 1]);
    const lengthSquared = (bx - ax) ** 2 + (by - ay) ** 2;
    const factor = lengthSquared ? Math.max(0, Math.min(1, -(ax * (bx - ax) + ay * (by - ay)) / lengthSquared)) : 0;
    nearest = Math.min(nearest, Math.hypot(ax + factor * (bx - ax), ay + factor * (by - ay)));
  }
  return nearest;
}

export function offRouteDecision(position: GpsFix, coordinates: [number, number][], count: number, lastReplanAt: number, now: number) {
  if (position.accuracy > 60 || now - position.timestamp > 15_000) return { count: 0, replan: false };
  const threshold = Math.max(45, position.accuracy * 1.5);
  const nextCount = distanceToRoute(position, coordinates) > threshold ? count + 1 : 0;
  return { count: nextCount, replan: nextCount >= 3 && now - lastReplanAt >= 30_000 };
}
