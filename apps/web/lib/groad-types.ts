export type RiskBand = "안전" | "주의" | "위험" | "심각";

export type SegmentRisk = {
  id: string; rank: number; routeCode: string; routeName: string;
  segmentLabel: string; timestamp: string; lat: number; lng: number;
  probability: number; riskBand: RiskBand; relativeToObserved: number;
  temperatureC: number; rainMm: number; windMs: number; speedKmh: number;
  flowLog: number; factors: string[];
};

export type ModelMetrics = {
  type: string; sha256: string; trainingRows: number; testRows: number;
  features: number; auc: number; logLoss: number; baselineLogLoss: number;
  deltaLogLoss: number; holmP: number; top1PctLift: number;
  probabilityMin: number; probabilityMax: number; negativeProbabilityCount: number;
  aboveOneCount: number; h1HolmP: number; h2HolmP: number;
};

export type RiskFeed = {
  generatedFrom: string; dataMode: "validated_demo" | "live";
  model: ModelMetrics; thresholds: Record<string, number>; segments: SegmentRisk[];
};
