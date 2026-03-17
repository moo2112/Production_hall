const { db } = require('../config/firebase');

/**
 * ActivityLog Model
 * Tracks all system events for the Activity Timeline page.
 */
class ActivityLog {
  static collectionName = 'activityLogs';

  /**
   * Log a new activity event.
   * @param {Object} data
   * @param {string} data.action        - Human-readable action description
   * @param {string} data.itemName      - Name of the item involved
   * @param {string} data.itemType      - 'Consumable' | 'Primary' | 'Secondary' | 'Tertiary' | 'Batch' | 'FormTemplate'
   * @param {string} [data.batchNumber] - Batch number if applicable
   * @param {number} [data.quantity]    - Quantity involved
   * @param {string} [data.status]      - 'Finished' | 'Damaged' | null
   * @param {string} [data.notes]       - Additional notes
   */
  static async log(data) {
    try {
      await db.collection(this.collectionName).add({
        action:      data.action      || '',
        itemName:    data.itemName    || '',
        itemType:    data.itemType    || '',
        batchNumber: data.batchNumber || null,
        quantity:    data.quantity    != null ? parseFloat(data.quantity) : null,
        status:      data.status      || null,
        notes:       data.notes       || null,
        timestamp:   new Date(),
      });
    } catch (error) {
      // Logging should never crash the main flow
      console.error('ActivityLog error:', error.message);
    }
  }

  /**
   * Get all activity logs ordered by newest first.
   */
  static async getAll() {
    try {
      const snapshot = await db
        .collection(this.collectionName)
        .orderBy('timestamp', 'desc')
        .get();

      return snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          // Convert Firestore Timestamp to JS Date
          timestamp: d.timestamp && d.timestamp.toDate
            ? d.timestamp.toDate()
            : new Date(d.timestamp),
        };
      });
    } catch (error) {
      throw new Error(`Error fetching activity logs: ${error.message}`);
    }
  }
}

module.exports = ActivityLog;
