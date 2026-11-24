import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { getAcademicYears } from "@/api/academicYears";
import { getAttendanceReport } from "@/api/attendance";
import { getCourseSections, getSectionUtilization } from "@/api/courseSections";
import { getLaboratories, getLabWorkstations } from "@/api/laboratories";
import { getMakeUpClasses } from "@/api/makeUpClasses";
import { getConfirmationsBySection, type ConfirmationRow } from "@/api/sessionConfirmations";

const STALE_TIME = 60_000;
const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function manilaDate(time = Date.now()): string {
  return new Date(time + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Attendance/report timestamps are stored in UTC, even when serialized without a suffix. */
function utcTime(value: string): number {
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}Z`);
}

async function settleWithLimit<T, R>(items: T[], action: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try { results[index] = { status: "fulfilled", value: await action(items[index]) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  }));
  return results;
}

export interface DashboardScheduleEntry {
  key: string;
  sectionId: number;
  sectionCode: string;
  subjectTitle: string;
  laboratory: string;
  roomCode: string;
  startTime: string;
  endTime: string;
  makeUp: boolean;
}

export type DashboardRecentSession = ConfirmationRow & {
  sectionId: number;
  sectionCode: string;
  subjectTitle: string;
};

/**
 * Read-only dashboard aggregation. Recorded PC use is not live occupancy; official
 * compliance comes from the backend rollup, never from unconfirmed session hours.
 */
export function useDashboardOperations(selectedLabId: number | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [today, setToday] = useState(() => manilaDate());
  const enabled = !!user && ["Administrator", "Custodian", "LabAssistant"].includes(user.role);
  // Include the account so a later login cannot reuse another account's cached records.
  const prefix = ["dashboard-operations", user?.userId ?? "signed-out", user?.role ?? "none"] as const;
  const options = { staleTime: STALE_TIME, retry: false as const };

  useEffect(() => {
    const nextMidnight = Date.parse(`${today}T00:00:00+08:00`) + DAY_MS;
    const timer = window.setTimeout(() => setToday(manilaDate()), Math.max(100, nextMidnight - Date.now() + 100));
    return () => window.clearTimeout(timer);
  }, [today]);

  const labsQuery = useQuery({ ...options, queryKey: [...prefix, "labs"], queryFn: getLaboratories, enabled });
  const yearsQuery = useQuery({ ...options, queryKey: [...prefix, "academic-years"], queryFn: getAcademicYears, enabled });
  const labs = labsQuery.data ?? [];
  const semester = yearsQuery.data?.find((year) => year.isActive);
  const ayId = semester?.ayId;
  const semesterEnabled = enabled && ayId !== undefined;
  const sectionsQuery = useQuery({ ...options, queryKey: [...prefix, "sections", ayId],
    queryFn: () => getCourseSections({ ayId: ayId! }), enabled: semesterEnabled });
  const makeUpsQuery = useQuery({ ...options, queryKey: [...prefix, "make-ups", ayId],
    queryFn: () => getMakeUpClasses(ayId!), enabled: semesterEnabled });
  const utilizationQuery = useQuery({ ...options, queryKey: [...prefix, "section-utilization", ayId],
    queryFn: () => getSectionUtilization({ ayId: ayId! }), enabled: semesterEnabled });
  const sections = sectionsQuery.data ?? [];
  const makeUps = makeUpsQuery.data ?? [];
  const selectedLab = selectedLabId === null ? undefined : labs.find((lab) => lab.labId === selectedLabId);
  const scopeLabs = selectedLabId === null ? labs : labs.filter((lab) => lab.labId === selectedLabId);
  const scopedSections = selectedLabId === null ? sections : sections.filter((section) =>
    section.meetings.some((meeting) => meeting.laboratory.labId === selectedLabId)
      || makeUps.some((makeUp) => makeUp.sectionId === section.sectionId && makeUp.labId === selectedLabId));
  const sectionIds = sections.map((section) => section.sectionId);
  const scopedSectionIds = new Set(scopedSections.map((section) => section.sectionId));
  const labIds = labs.map((lab) => lab.labId);

  const workstationsQuery = useQuery({ ...options,
    queryKey: [...prefix, "workstations", labIds], enabled: enabled && labsQuery.isSuccess,
    queryFn: async () => {
      const results = await settleWithLimit(labIds, (labId) => queryClient.fetchQuery({ ...options,
        queryKey: [...prefix, "lab-workstations", labId], queryFn: () => getLabWorkstations(labId) }));
      return {
        rows: results.flatMap((result, index) => result.status === "fulfilled"
          ? result.value.map((workstation) => ({ ...workstation, labId: labIds[index] })) : []),
        failed: results.flatMap((result, index) => result.status === "rejected" ? [labIds[index]] : []),
      };
    },
  });
  const confirmationsQuery = useQuery({ ...options,
    queryKey: [...prefix, "confirmations", ayId, sectionIds], enabled: semesterEnabled && sectionsQuery.isSuccess,
    queryFn: async () => {
      const results = await settleWithLimit(sections, (section) => queryClient.fetchQuery({ ...options,
        queryKey: [...prefix, "section-confirmations", section.sectionId],
        queryFn: () => getConfirmationsBySection(section.sectionId) }));
      return {
        rows: results.flatMap<DashboardRecentSession>((result, index) => result.status === "fulfilled"
          ? result.value.map((confirmation) => ({ ...confirmation, sectionId: sections[index].sectionId,
            sectionCode: sections[index].sectionCode, subjectTitle: sections[index].subject.title })) : []),
        failed: results.flatMap((result, index) => result.status === "rejected" ? [sectionIds[index]] : []),
      };
    },
  });

  const todayStart = Date.parse(`${today}T00:00:00+08:00`);
  const attendanceQuery = useQuery({ ...options,
    queryKey: [...prefix, "today-attendance", ayId, today, selectedLabId], enabled: semesterEnabled,
    queryFn: () => getAttendanceReport({ labId: selectedLabId ?? undefined,
      from: new Date(todayStart).toISOString(), to: new Date(todayStart).toISOString() }),
  });
  // The report endpoint includes the exact next-midnight boundary; exclude it here.
  const attendanceToday = (attendanceQuery.data ?? []).filter((row) => {
    const timestamp = utcTime(row.loginTime);
    return timestamp >= todayStart && timestamp < todayStart + DAY_MS;
  });
  const sectionsReady = sectionsQuery.isSuccess;
  const makeUpsReady = makeUpsQuery.isSuccess;
  const workstationsReady = labsQuery.isSuccess && workstationsQuery.isSuccess
    && !workstationsQuery.data.failed.some((labId) => scopeLabs.some((lab) => lab.labId === labId));
  const scopeWorkstations = (workstationsQuery.data?.rows ?? []).filter((workstation) =>
    selectedLabId === null || workstation.labId === selectedLabId);
  const activeWorkstations = scopeWorkstations.filter((workstation) => workstation.isActive);
  const identifiers = new Set(activeWorkstations.map((workstation) => workstation.pcIdentifier));
  const identifiersUnique = identifiers.size === activeWorkstations.length;
  const active = workstationsReady ? activeWorkstations.length : null;
  const usedToday = attendanceQuery.isSuccess && workstationsReady && identifiersUnique
    ? new Set(attendanceToday.filter((row) => identifiers.has(row.pcIdentifier)).map((row) => row.pcIdentifier)).size : null;
  const recordedPercent = usedToday !== null && active !== null && active > 0 ? Math.round(usedToday / active * 1000) / 10 : null;

  const historicalRows = (utilizationQuery.data ?? []).filter((row) => scopedSectionIds.has(row.sectionId));
  const measuredRows = historicalRows.filter((row) => row.utilizationPercent !== null);
  const historicalAvailable = sectionsReady && utilizationQuery.isSuccess && (selectedLabId === null || makeUpsReady);
  const historicalPercent = historicalAvailable && measuredRows.length
    ? Math.round(measuredRows.reduce((sum, row) => sum + row.utilizationPercent!, 0) / measuredRows.length * 10) / 10 : null;

  function runsOn(termPart: number | null, date: string) {
    if (termPart === null || !semester?.secondTermStart) return true;
    return termPart === 1 ? date < semester.secondTermStart.slice(0, 10) : date >= semester.secondTermStart.slice(0, 10);
  }
  function weekday(date: string) {
    return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-US", { weekday: "long", timeZone: "Asia/Manila" });
  }
  const confirmationRows = (confirmationsQuery.data?.rows ?? []).filter((confirmation) => {
    if (!scopedSectionIds.has(confirmation.sectionId)) return false;
    if (selectedLabId === null || confirmation.sessionType === "Virtual") return true;
    const section = sections.find((entry) => entry.sectionId === confirmation.sectionId);
    const date = confirmation.sessionDate.slice(0, 10);
    const dateMakeUps = makeUps.filter((makeUp) => makeUp.sectionId === confirmation.sectionId && makeUp.date.slice(0, 10) === date);
    // Match the existing utilization endpoint: a make-up date uses its own lab.
    if (dateMakeUps.length > 0) return dateMakeUps.some((makeUp) => makeUp.labId === selectedLabId);
    return !!section && runsOn(section.termPart, date) && section.meetings.some((meeting) =>
      meeting.dayOfWeek === weekday(date) && meeting.laboratory.labId === selectedLabId);
  });
  const confirmationsComplete = sectionsReady && confirmationsQuery.isSuccess
    && !confirmationsQuery.data.failed.some((id) => scopedSectionIds.has(id))
    && (selectedLabId === null || makeUpsReady);
  const pendingFinal = confirmationsComplete ? confirmationRows.filter((row) =>
    row.sessionType === "Physical" && !!row.facultyConfirmedAt && !row.finalConfirmedAt).length : null;
  const attendanceSectionCodes = [...new Set(attendanceToday.map((row) => row.section))];
  const unknownAttendanceSections = sectionsReady && attendanceSectionCodes.some((code) =>
    !sections.some((section) => section.sectionCode === code));
  const awaitingFacultyToday = confirmationsComplete && attendanceQuery.isSuccess && !unknownAttendanceSections
    ? attendanceSectionCodes.filter((sectionCode) => {
      const section = sections.find((entry) => entry.sectionCode === sectionCode);
      if (!section) return false;
      // A final virtual record already accounts for this class day; do not call it pending.
      return !(confirmationsQuery.data?.rows ?? []).some((row) => row.sectionId === section.sectionId
        && row.sessionDate.slice(0, 10) === today
        && (row.sessionType === "Physical" && !!row.facultyConfirmedAt || row.sessionType === "Virtual" && !!row.finalConfirmedAt));
    }).length : null;
  const recent = confirmationRows.filter((row) => !!row.finalConfirmedAt)
    .sort((left, right) => utcTime(right.finalConfirmedAt!) - utcTime(left.finalConfirmedAt!)).slice(0, 5);

  const assessed = scopedSections.filter((section) => section.compliance !== null);
  // Match DashboardSummary's established average, with each section capped at 100%.
  const averagePercent = sectionsReady && assessed.length ? Math.round(assessed.reduce((sum, section) => sum
    + Math.min(1, section.compliance!.confirmedHoursTotal / Math.max(1, section.compliance!.requiredHours)), 0) / assessed.length * 100) : null;
  const compliance = {
    averagePercent,
    compliant: assessed.filter((section) => section.compliance!.status === "Compliant").length,
    atRisk: assessed.filter((section) => section.compliance!.status === "AtRisk").length,
    nonCompliant: assessed.filter((section) => section.compliance!.status === "NonCompliant").length,
    unassessed: scopedSections.length - assessed.length,
  };
  const scheduleAvailable = sectionsReady && makeUpsReady && yearsQuery.isSuccess;
  const todaySchedule: DashboardScheduleEntry[] = [
    ...sections.filter((section) => runsOn(section.termPart, today)).flatMap((section) => section.meetings
      .filter((meeting) => meeting.dayOfWeek === weekday(today) && (selectedLabId === null || meeting.laboratory.labId === selectedLabId))
      .map((meeting) => ({ key: `meeting-${meeting.scheduleId}`, sectionId: section.sectionId, sectionCode: section.sectionCode,
        subjectTitle: section.subject.title, laboratory: meeting.laboratory.name, roomCode: meeting.laboratory.roomCode,
        startTime: meeting.startTime, endTime: meeting.endTime, makeUp: false }))),
    ...makeUps.filter((makeUp) => makeUp.date.slice(0, 10) === today && (selectedLabId === null || makeUp.labId === selectedLabId))
      .map((makeUp) => ({ key: `make-up-${makeUp.makeUpId}`, sectionId: makeUp.sectionId, sectionCode: makeUp.sectionCode,
        subjectTitle: makeUp.subjectTitle, laboratory: makeUp.laboratory, roomCode: makeUp.roomCode,
        startTime: makeUp.startTime, endTime: makeUp.endTime, makeUp: true })),
  ].sort((left, right) => left.startTime.localeCompare(right.startTime) || left.sectionCode.localeCompare(right.sectionCode));

  const issues: string[] = [];
  if (labsQuery.isError) issues.push("Laboratories could not be loaded.");
  if (yearsQuery.isError) issues.push("The active semester could not be loaded.");
  if (yearsQuery.isSuccess && !semester) issues.push("No active semester is configured; semester operations are unavailable.");
  if (sectionsQuery.isError) issues.push("Course sections and compliance could not be loaded.");
  if (makeUpsQuery.isError) issues.push("Make-up classes could not be loaded; schedule and laboratory-specific session coverage may be incomplete.");
  if (attendanceQuery.isError) issues.push("Today's recorded attendance could not be loaded.");
  if (unknownAttendanceSections) issues.push("Some recorded attendance could not be matched to the active semester; faculty-review counts are unavailable. Refresh to try again.");
  if (utilizationQuery.isError) issues.push("Confirmed section utilization could not be loaded.");
  if (workstationsQuery.isError || workstationsQuery.data?.failed.some((id) => scopeLabs.some((lab) => lab.labId === id)))
    issues.push("Some workstation lists could not be loaded; recorded usage is unavailable.");
  if (workstationsReady && !identifiersUnique) issues.push("Duplicate workstation identifiers prevent a reliable recorded-usage count.");
  if (confirmationsQuery.isError || confirmationsQuery.data?.failed.some((id) => scopedSectionIds.has(id)))
    issues.push("Some session confirmations could not be loaded; session counts are unavailable.");
  if (selectedLabId !== null && labsQuery.isSuccess && !selectedLab) issues.push("The selected laboratory is no longer registered.");

  const semesterQueries = [sectionsQuery, makeUpsQuery, utilizationQuery, attendanceQuery];
  const loading = enabled && (labsQuery.isPending || yearsQuery.isPending
    || semesterEnabled && semesterQueries.some((query) => query.isPending)
    || labsQuery.isSuccess && workstationsQuery.isPending
    || semesterEnabled && sectionsQuery.isSuccess && confirmationsQuery.isPending);
  const refreshing = !loading && [labsQuery, yearsQuery, ...semesterQueries, workstationsQuery, confirmationsQuery].some((query) => query.isFetching);
  function refresh() {
    // Mark per-resource caches stale too, so the bounded aggregate workers refresh them.
    void queryClient.invalidateQueries({ queryKey: prefix });
  }

  return {
    labs, sections, selectedLab, scopedSections, loading, refreshing, issues, refresh, today, academicYearId: ayId,
    topologyLoading: labsQuery.isPending,
    topologyAvailable: labsQuery.isSuccess || labsQuery.data !== undefined,
    sectionsAvailable: sectionsQuery.isSuccess || sectionsQuery.data !== undefined,
    utilization: { usedToday, registered: scopeLabs.reduce((sum, lab) => sum + lab.workstationCount, 0), active,
      recordedPercent, historicalPercent, confirmedSessions: historicalRows.reduce((sum, row) => sum + row.confirmedSessions, 0), historicalAvailable },
    sessions: { awaitingFacultyToday, pendingFinal, recent, complete: confirmationsComplete },
    compliance, todaySchedule, scheduleAvailable,
  };
}

export type DashboardOperations = ReturnType<typeof useDashboardOperations>;
