const { db } = require("../config/firebase");

/**
 * Attendance model
 * ─────────────────────────────────────────────────────────────────────────────
 * Records worker attendance per calendar day. The present-worker count feeds the
 * Production-Day planner so it can flag tasks whose required workers exceed the
 * workers actually available that day.
 *
 * One document per day (id = "YYYY-MM-DD"):
 *   { date, records: [{ workerId, workerName, present, checkIn, checkOut }],
 *     createdAt, updatedAt }
 * ─────────────────────────────────────────────────────────────────────────────
 */
class Attendance {
  static collectionName = "attendance";

  static todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  static async getByDate(date) {
    try {
      const key = date || this.todayKey();
      const doc = await db.collection(this.collectionName).doc(key).get();
      if (!doc.exists) return { date: key, records: [] };
      return { date: key, ...doc.data() };
    } catch (e) {
      throw new Error(`Error fetching attendance: ${e.message}`);
    }
  }

  /**
   * Upsert the full attendance record for a day. `records` is the complete list
   * of workers with their present flag — last write wins for that day.
   */
  static async setForDate(date, records) {
    try {
      const key = date || this.todayKey();
      const clean = (Array.isArray(records) ? records : []).map((r) => ({
        workerId: r.workerId || null,
        workerName: r.workerName || "",
        present: !!r.present,
        // Lateness tracking recorded when opening the day.
        late: !!r.late,
        minutesLate:
          r.minutesLate != null && !isNaN(parseFloat(r.minutesLate))
            ? parseFloat(r.minutesLate)
            : 0,
        checkIn: r.checkIn || null,
        checkOut: r.checkOut || null,
      }));
      await db
        .collection(this.collectionName)
        .doc(key)
        .set(
          { date: key, records: clean, updatedAt: new Date() },
          { merge: true },
        );
      return { date: key, records: clean };
    } catch (e) {
      throw new Error(`Error saving attendance: ${e.message}`);
    }
  }

  static presentCount(attendance) {
    if (!attendance || !Array.isArray(attendance.records)) return 0;
    return attendance.records.filter((r) => r.present).length;
  }

  static async getRecent(limit = 14) {
    try {
      const snap = await db.collection(this.collectionName).get();
      return snap.docs
        .map((d) => ({ date: d.id, ...d.data() }))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, limit);
    } catch (e) {
      throw new Error(`Error fetching attendance history: ${e.message}`);
    }
  }
}

module.exports = Attendance;
