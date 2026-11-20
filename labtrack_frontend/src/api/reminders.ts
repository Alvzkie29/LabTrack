import { apiRequest } from "./client";

export interface MissedMeeting { date: string; hours: number; reason: string }

export interface ClassReminder {
  sectionId: number;
  sectionCode: string;
  subjectCode: string;
  subjectTitle: string;
  faculty: string | null;
  email: string | null;
  confirmedHours: number;
  requiredHours: number;
  missed: MissedMeeting[];
  missedHours: number;
  madeUpHours: number;
  outstandingHours: number;
  sessionHours: number;
  suggestedMakeUps: number;
  sentAt: string | null; // this week's reminder, when sent
  error: string | null;  // this week's reminder, when sending failed
}

export interface RemindersPreview {
  setup: {
    autoSend: boolean;   // the Custodian's switch for the automatic weekly emails
    configured: boolean;
    from: string;
    sendDay: string;
    sendHour: number;
    countMissedFrom: string | null;
  };
  weekStart: string;
  classes: ClassReminder[];
}

export const getReminders = () => apiRequest<RemindersPreview>("/api/reminders");

export const sendRemindersNow = () =>
  apiRequest<{ sent: number; failed: number; noEmail: number; alreadySent: number }>("/api/reminders/send", { method: "POST" });

export const setAutoSend = (on: boolean) =>
  apiRequest<void>("/api/reminders/auto-send", { method: "PUT", body: { on } });

export const sendTestReminder = () => apiRequest<{ message: string }>("/api/reminders/test", { method: "POST" });
