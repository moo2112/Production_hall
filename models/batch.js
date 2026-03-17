const { db } = require('../config/firebase');

/**
 * Batch Model
 * Represents a production batch (patch) record.
 * Every batch must have a Batch Number and Item Name (linked to an existing product).
 */
class Batch {
  static collectionName = 'batches';

  /**
   * Create a new batch record.
   * @param {Object} data
   * @param {string} data.batchNumber      - Required
   * @param {string} data.itemId           - Required — ID of the product
   * @param {string} data.itemName         - Required — Name of the product (denormalised for display)
   * @param {string} data.itemType         - 'Primary' | 'Secondary' | 'Tertiary'
   * @param {string} data.formTemplateId   - ID of the form template used
   * @param {string} data.formTemplateName - Name of the template (denormalised)
   * @param {Object} data.fieldValues      - Dynamic field values from the form
   */
  static async create(data) {
    try {
      const docRef = await db.collection(this.collectionName).add({
        batchNumber:      data.batchNumber,
        itemId:           data.itemId,
        itemName:         data.itemName,
        itemType:         data.itemType         || '',
        formTemplateId:   data.formTemplateId   || null,
        formTemplateName: data.formTemplateName || null,
        fieldValues:      data.fieldValues      || {},
        createdAt:        new Date(),
        updatedAt:        new Date(),
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
        .orderBy('createdAt', 'desc')
        .get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      throw new Error(`Error fetching batches: ${error.message}`);
    }
  }

  /** Get a single batch by ID. */
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

  /** Validate required fields. */
  static validate(data) {
    const errors = [];
    if (!data.batchNumber || data.batchNumber.trim() === '')
      errors.push('Batch Number is required');
    if (!data.itemId || data.itemId.trim() === '')
      errors.push('Item Name is required — please select a product from the list');
    return errors;
  }
}

module.exports = Batch;
