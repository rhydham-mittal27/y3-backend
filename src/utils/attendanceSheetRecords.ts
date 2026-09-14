import { IDailyAttendanceRecord, IAttendanceSheetDocument } from '../models/AttendanceSheet';

/**
 * Flattened, per-day attendance record shaped to resemble the legacy
 * per-session `Attendance` document as closely as possible, so callers that
 * used to query `Attendance.find(...)` can be repointed at `AttendanceSheet`
 * with minimal rewriting.
 *
 * `AttendanceSheet` is the live system (per-cycle document with an embedded
 * `records[]` array); the old `Attendance` model is legacy and no longer
 * written to. See audit/BROKEN_BUSINESS_LOGIC.md.
 *
 * Fields NOT carried over because they don't exist on AttendanceSheet's
 * embedded record schema (kept `undefined` rather than guessed):
 * `parentApprovedBy`, `parentApprovedAt`, `swotAnalysis`, `resources`,
 * `rejectedBy`/`rejectedAt` (those exist at the sheet level, not per-record).
 */
export interface FlatAttendanceRecord {
  sessionDate: Date;
  status: IDailyAttendanceRecord['status'];
  studentAttendanceStatus: IDailyAttendanceRecord['studentAttendanceStatus'];
  topicCovered?: string;
  notes?: string;
  submittedBy?: IDailyAttendanceRecord['submittedBy'];
  tutor?: IDailyAttendanceRecord['tutor'];
  finalClass?: IAttendanceSheetDocument['finalClass'];
  groupClass?: IAttendanceSheetDocument['groupClass'];
  coordinator?: IAttendanceSheetDocument['coordinator'];
  sheetId: IAttendanceSheetDocument['_id'];
  sheetStatus: IAttendanceSheetDocument['status'];
}

/**
 * Flattens a list of AttendanceSheet documents into individual per-day
 * records, each carrying its parent sheet's finalClass/groupClass/coordinator
 * for convenience, optionally filtered to a date range.
 */
export const flattenAttendanceSheets = (
  sheets: IAttendanceSheetDocument[],
  dateRange?: { start?: Date; end?: Date }
): FlatAttendanceRecord[] => {
  const out: FlatAttendanceRecord[] = [];
  for (const sheet of sheets) {
    for (const record of sheet.records || []) {
      const d = new Date(record.sessionDate);
      if (dateRange?.start && d < dateRange.start) continue;
      if (dateRange?.end && d >= dateRange.end) continue;
      out.push({
        sessionDate: record.sessionDate,
        status: record.status,
        studentAttendanceStatus: record.studentAttendanceStatus,
        topicCovered: record.topicCovered,
        notes: record.notes,
        submittedBy: record.submittedBy,
        tutor: record.tutor,
        finalClass: sheet.finalClass,
        groupClass: sheet.groupClass,
        coordinator: sheet.coordinator,
        sheetId: sheet._id,
        sheetStatus: sheet.status,
      });
    }
  }
  return out;
};

/**
 * Convenience wrapper: queries AttendanceSheet for a class (final or group)
 * and returns the flattened, date-filtered per-day records. Pass the
 * AttendanceSheet model in explicitly so this stays trivially unit-testable
 * without a real DB connection.
 */
export const getFlattenedAttendanceRecords = async (
  AttendanceSheetModel: { find: (query: any) => any },
  params: {
    finalClass?: string | { toString(): string };
    groupClass?: string | { toString(): string };
    start?: Date;
    end?: Date;
  }
): Promise<FlatAttendanceRecord[]> => {
  const { finalClass, groupClass, start, end } = params;
  if (!finalClass && !groupClass) return [];

  const query: any = finalClass ? { finalClass } : { groupClass };
  const sheets: IAttendanceSheetDocument[] = await AttendanceSheetModel.find(query);
  return flattenAttendanceSheets(sheets, { start, end });
};
