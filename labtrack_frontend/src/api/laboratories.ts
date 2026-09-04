import { apiRequest } from "./client";

export interface LaboratorySummary {
  labId: number;
  name: string;
  roomCode: string;
  capacity: number;
  isActive: boolean;
  workstationCount: number;
}

export interface WorkstationBlueprintEntry {
  workstationId: number;
  seatLabel: string;
  deviceIdentifier: string;
  status: "Offline" | "Active" | "Idle";
  lastHeartbeat: string | null;
}

export interface LabBlueprint {
  labId: number;
  name: string;
  roomCode: string;
  capacity: number;
  workstations: WorkstationBlueprintEntry[];
}

export function getLaboratories() {
  return apiRequest<LaboratorySummary[]>("/api/laboratories");
}

export function getLabBlueprint(labId: number) {
  return apiRequest<LabBlueprint>(`/api/laboratories/${labId}/blueprint`);
}