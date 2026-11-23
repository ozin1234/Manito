export function validPoint(point) {
  return point && typeof point === "object" &&
    Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    point.lat >= 33 && point.lat <= 39 && point.lng >= 124 && point.lng <= 132;
}

export function distanceMeters(a, b) {
  const latitude = ((a.lat + b.lat) / 2) * Math.PI / 180;
  const x = (b.lng - a.lng) * Math.cos(latitude) * 111_320;
  const y = (b.lat - a.lat) * 111_320;
  return Math.hypot(x, y);
}

export function distanceToLineMeters(point, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) return Infinity;
  const latitude = point.lat * Math.PI / 180;
  const project = ([lng, lat]) => [
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

export function shouldReplan({ position, coordinates, consecutiveOffRoute, lastReplanAt, now }) {
  if (!validPoint(position) || !Number.isFinite(position.accuracy) || position.accuracy > 60 ||
      !Number.isFinite(position.timestamp) || now - position.timestamp > 15_000)
    return { replan: false, consecutiveOffRoute: 0, reason: "weak_gps" };
  const distance = distanceToLineMeters(position, coordinates);
  const threshold = Math.max(45, position.accuracy * 1.5);
  const count = distance > threshold ? consecutiveOffRoute + 1 : 0;
  return {
    replan: count >= 3 && now - lastReplanAt >= 30_000,
    consecutiveOffRoute: count,
    distanceMeters: Math.round(distance),
    reason: count >= 3 ? "off_route" : "on_route",
  };
}
