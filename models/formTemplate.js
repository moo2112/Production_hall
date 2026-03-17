const { db } = require('../config/firebase');

/**
 * FormTemplate Model
 * Stores custom batch entry form designs.
 *
 * A template has mandatory fixed fields (batchNumber, itemName) that cannot be removed,
 * plus any number of user-defined dynamic fields.
 *
 * Field schema:
 * {
 *   id:       string  — unique within template (e.g. 'field_1')
 *   label:    string  — display label
 *   type:     'text' | 'number' | 'date' | 'dropdown' | 'notes'
 *   required: boolean
 *   options:  string[] — only used when type === 'dropdown'
 * }
 */
class FormTemplate {
  static collectionName = 'formTemplates';

  /** The two mandatory default fields that are always present and required. */
  static MANDATORY_FIELDS = [
    { id: 'batchNumber', label: 'Batch Number', type: 'text',     required: true, fixed: true },
    { id: 'itemName',    label: 'Item Name',    type: 'dropdown', required: true, fixed: true },
  ];

  /**
   * Create a new form template.
   * @param {Object} data
   * @param {string} data.name        - Template name
   * @param {Array}  data.fields      - User-defined dynamic fields (mandatory fields added automatically)
   */
  static async create(data) {
    try {
      const docRef = await db.collection(this.collectionName).add({
        name:      data.name,
        fields:    data.fields || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id: docRef.id, ...data };
    } catch (error) {
      throw new Error(`Error creating form template: ${error.message}`);
    }
  }

  /** Get all templates, newest first. */
  static async getAll() {
    try {
      const snapshot = await db
        .collection(this.collectionName)
        .orderBy('createdAt', 'desc')
        .get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      throw new Error(`Error fetching form templates: ${error.message}`);
    }
  }

  /** Get template by ID. */
  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Error fetching form template: ${error.message}`);
    }
  }

  /** Update an existing template. */
  static async update(id, data) {
    try {
      await db.collection(this.collectionName).doc(id).update({
        name:      data.name,
        fields:    data.fields || [],
        updatedAt: new Date(),
      });
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating form template: ${error.message}`);
    }
  }

  /** Delete a template. */
  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Error deleting form template: ${error.message}`);
    }
  }

  /** Validate template data. */
  static validate(data) {
    const errors = [];
    if (!data.name || data.name.trim() === '')
      errors.push('Template name is required');
    return errors;
  }
}

module.exports = FormTemplate;
