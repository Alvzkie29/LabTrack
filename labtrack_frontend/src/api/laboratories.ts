import { apiRequest } from "./client";

export interface LaboratorySummary {
  labId: number;
  name: string;
  roomCode: string;
  capacity: number;
  isActive: boolean;
  workstationCount: number;
}

export interface WorkstationEntry {
  workstationId: number;
  seatLabel: string;
  pcIdentifier: string;
  isActive: boolean;
}

export function getLaboratories() {
  return apiRequest<LaboratorySummary[]>("/api/laboratories");
}

/** The registered PCs of one lab (the seating list). There is no live status any more. */
export function getLabWorkstations(labId: number) {
  return apiRequest<WorkstationEntry[]>(`/api/laboratories/${labId}/workstations`);
}
