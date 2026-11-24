import { filterPublicComplaints, type PublicComplaint } from "./public-complaints.ts";
import type { ReportTopic } from "./report-topics.ts";

export type ComplaintLocation = {
  complaintId: string; lat: number; lng: number; label: string;
  matchedText: string; precision: "place" | "area"; sourceUrl: string; checkedAt: string;
};
export type MappedComplaint = PublicComplaint & { location: ComplaintLocation };
export function mapComplaints(records: PublicComplaint[], locations: ComplaintLocation[], topic: ReportTopic, region = "all", query = ""): MappedComplaint[] {
  return filterPublicComplaints(records, topic, region, query).flatMap((row) => {
    const location = locations.find((item) => item.complaintId === row.id);
    if (!location || !row.title.includes(location.matchedText) || !location.matchedText ||
      !Number.isFinite(location.lat) || !Number.isFinite(location.lng) || location.lat < 33 || location.lat > 39 || location.lng < 124 || location.lng > 132 ||
      !/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(location.sourceUrl)) return [];
    return [{ ...row, location }];
  });
}
export function neighborhoodView(region: string, points: MappedComplaint[]) {
  const first = points.find((point) => region === "all" || point.region === region);
  if (first) return { lat: first.location.lat, lng: first.location.lng, zoom: 14 };
  return region === "강릉시" ? { lat: 37.752, lng: 128.8756, zoom: 14 } : { lat: 37.8813, lng: 127.7299, zoom: 14 };
}
