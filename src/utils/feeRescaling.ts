/**
 * Proportionally rescales a group class's per-student fees so they sum to
 * `newTotal`, preserving each student's relative share of the old total
 * (rather than crudely splitting evenly, which would erase intentional
 * per-student pricing differences captured at lead intake). Falls back to an
 * even split if the old total is zero (nothing to scale from).
 *
 * Extracted into its own zero-dependency file (rather than living inline in
 * finalClassService.ts) so it can be unit-tested in isolation without
 * pulling in the rest of that service's heavy import graph.
 * See audit/BROKEN_BUSINESS_LOGIC.md (group-class renewal fee bug).
 */
export const recalculateStudentFeesForNewTotal = <T extends { fees: number }>(
  studentDetails: T[],
  newTotal: number
): T[] => {
  if (!Array.isArray(studentDetails) || studentDetails.length === 0) return studentDetails;

  const oldTotal = studentDetails.reduce((sum, s) => sum + (Number(s.fees) || 0), 0);

  if (oldTotal > 0) {
    return studentDetails.map((s) => ({
      ...s,
      fees: Math.round(((Number(s.fees) || 0) / oldTotal) * newTotal * 100) / 100,
    }));
  }

  // Nothing to scale from — split the new total evenly instead.
  const evenShare = Math.round((newTotal / studentDetails.length) * 100) / 100;
  return studentDetails.map((s) => ({ ...s, fees: evenShare }));
};
