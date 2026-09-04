import { apiRequest } from "./client";

export interface RemedialRecommendationRow {
  recommendationId: number;
  section: string;
  subject: string;
  hourDeficit: number;
  additionalSessionsNeeded: number;
  generatedAt: string;
}

export function getRemedialRecommendations() {
  return apiRequest<RemedialRecommendationRow[]>("/api/remedialrecommendations");
}