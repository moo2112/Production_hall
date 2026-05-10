// const { db } = require("../config/firebase");

// /**
//  * Batch Model
//  * Represents a production batch (patch) record.
//  *
//  * Quality Control extension:
//  *   qualityStatus: null | 'pending' | 'accepted' | 'rejected'
//  *   qualityUpdatedAt: Date | null
//  */
// class Batch {
//   static collectionName = "batches";

//   static async create(data) {
//     try {
//       const docRef = await db.collection(this.collectionName).add({
//         batchNumber: data.batchNumber,
//         itemId: data.itemId,
//         itemName: data.itemName,
//         itemType: data.itemType || "",
//         formTemplateId: data.formTemplateId || null,
//         formTemplateName: data.formTemplateName || null,
//         fieldValues: data.fieldValues || {},
//         qualityStatus: null,
//         qualityUpdatedAt: null,
//         createdAt: new Date(),
//         updatedAt: new Date(),
//       });
//       return { id: docRef.id, ...data };
//     } catch (error) {
//       throw new Error(`Error creating batch: ${error.message}`);
//     }
//   }

//   /** Get all batches, newest first. */
//   static async getAll() {
//     try {
//       const snapshot = await db
//         .collection(this.collectionName)
//         .orderBy("createdAt", "desc")
//         .get();
//       return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
//     } catch (error) {
//       throw new Error(`Error fetching batches: ${error.message}`);
//     }
//   }

//   /** Get a single batch by Firestore document ID. */
//   static async getById(id) {
//     try {
//       const doc = await db.collection(this.collectionName).doc(id).get();
//       if (!doc.exists) return null;
//       return { id: doc.id, ...doc.data() };
//     } catch (error) {
//       throw new Error(`Error fetching batch: ${error.message}`);
//     }
//   }

//   /** Delete a batch record. */
//   static async delete(id) {
//     try {
//       await db.collection(this.collectionName).doc(id).delete();
//       return true;
//     } catch (error) {
//       throw new Error(`Error deleting batch: ${error.message}`);
//     }
//   }

//   /**
//    * Update the quality control status of a batch.
//    * Called by the Quality Control standalone app — Production Hall reads this field.
//    * @param {string}      id     - Firestore document ID
//    * @param {string|null} status - 'accepted' | 'rejected' | 'pending' | null
//    */
//   static async updateQualityStatus(id, status) {
//     try {
//       const allowed = ["accepted", "rejected", "pending", null];
//       if (!allowed.includes(status)) {
//         throw new Error(`Invalid quality status: ${status}`);
//       }
//       await db.collection(this.collectionName).doc(id).update({
//         qualityStatus: status,
//         qualityUpdatedAt: new Date(),
//         updatedAt: new Date(),
//       });
//       return await this.getById(id);
//     } catch (error) {
//       throw new Error(`Error updating quality status: ${error.message}`);
//     }
//   }

//   /**
//    * Check whether a given batch document ID has been rejected by QC.
//    * Returns true if rejected, false for any other status (including null / pending / accepted).
//    * Safe to call with '__manual__' or null — always returns false for those.
//    */
//   static async isRejected(batchId) {
//     if (!batchId || batchId === "__manual__") return false;
//     try {
//       const batch = await this.getById(batchId);
//       return !!(batch && batch.qualityStatus === "rejected");
//     } catch (_) {
//       return false;
//     }
//   }

//   /** Validate required fields before creating a batch. */
//   static validate(data) {
//     const errors = [];
//     if (!data.batchNumber || String(data.batchNumber).trim() === "")
//       errors.push("Batch Number is required");
//     if (!data.itemId || String(data.itemId).trim() === "")
//       errors.push(
//         "Item Name is required — please select a product from the list",
//       );
//     return errors;
//   }
// }

// module.exports = Batch;

const { db } = require("../config/firebase");

/**
 * Batch Model
 * Represents a production batch (patch) record.
 *
 * Quality Control extension:
 *   qualityStatus: null | 'pending' | 'accepted' | 'rejected'
 *   qualityUpdatedAt: Date | null
 */
class Batch {
  static collectionName = "batches";

  static async create(data) {
    try {
      const docRef = await db.collection(this.collectionName).add({
        batchNumber: data.batchNumber,
        itemId: data.itemId,
        itemName: data.itemName,
        itemType: data.itemType || "",
        formTemplateId: data.formTemplateId || null,
        formTemplateName: data.formTemplateName || null,
        fieldValues: data.fieldValues || {},
        qualityStatus: null,
        qualityUpdatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id: docRef.id, ...data };
    } catch (error) {
      throw new Error(`Error creating batch: ${error.message}`);
    }
  }

  /** Get all batches, newest first. */
  static async getAll() {
    try {
      const snapshot = await db
        .collection(this.collectionName)
        .orderBy("createdAt", "desc")
        .get();
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      throw new Error(`Error fetching batches: ${error.message}`);
    }
  }

  /** Get a single batch by Firestore document ID. */
  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Error fetching batch: ${error.message}`);
    }
  }

  /** Delete a batch record. */
  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Error deleting batch: ${error.message}`);
    }
  }

  /** Update only the dynamic/custom field values of a batch. */
  static async updateFieldValues(id, fieldValues) {
    try {
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({
          fieldValues: fieldValues || {},
          updatedAt: new Date(),
        });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating batch custom fields: ${error.message}`);
    }
  }

  /**
   * Update the quality control status of a batch.
   * Called by the Quality Control standalone app — Production Hall reads this field.
   * @param {string}      id     - Firestore document ID
   * @param {string|null} status - 'accepted' | 'rejected' | 'pending' | null
   */
  static async updateQualityStatus(id, status) {
    try {
      const allowed = ["accepted", "rejected", "pending", null];
      if (!allowed.includes(status)) {
        throw new Error(`Invalid quality status: ${status}`);
      }
      await db.collection(this.collectionName).doc(id).update({
        qualityStatus: status,
        qualityUpdatedAt: new Date(),
        updatedAt: new Date(),
      });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating quality status: ${error.message}`);
    }
  }

  /**
   * Check whether a given batch document ID has been rejected by QC.
   * Returns true if rejected, false for any other status (including null / pending / accepted).
   * Safe to call with '__manual__' or null — always returns false for those.
   */
  static async isRejected(batchId) {
    if (!batchId || batchId === "__manual__") return false;
    try {
      const batch = await this.getById(batchId);
      return !!(batch && batch.qualityStatus === "rejected");
    } catch (_) {
      return false;
    }
  }

  /** Validate required fields before creating a batch. */
  static validate(data) {
    const errors = [];
    if (!data.batchNumber || String(data.batchNumber).trim() === "")
      errors.push("Batch Number is required");
    if (!data.itemId || String(data.itemId).trim() === "")
      errors.push(
        "Item Name is required — please select a product from the list",
      );
    return errors;
  }
}

module.exports = Batch;
