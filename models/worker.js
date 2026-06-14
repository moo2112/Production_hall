const { db } = require("../config/firebase");

/**
 * Worker Model
 * Represents a production-room worker and their quality record.
 *
 * Document shape (collection "workers"):
 * {
 *   name:            string
 *   role:            string
 *   qualityRounds:   [ { id, date, area, precautions: 'yes'|'no', notes, recordedAt } ]
 *   productionErrors:[ { id, batchNumber, batchId, fieldLabel, fieldValue, description, date, recordedAt } ]
 *   createdAt, updatedAt: Date
 * }
 */
class Worker {
  static collectionName = "workers";

  static genId(prefix) {
    return (
      prefix +
      "_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 7)
    );
  }

  static async create(data) {
    try {
      const payload = {
        name: String(data.name || "").trim(),
        role: String(data.role || "").trim(),
        qualityRounds: [],
        productionErrors: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const docRef = await db.collection(this.collectionName).add(payload);
      return { id: docRef.id, ...payload };
    } catch (error) {
      throw new Error(`Error creating worker: ${error.message}`);
    }
  }

  static async getAll() {
    try {
      const snapshot = await db.collection(this.collectionName).get();
      const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      rows.sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || "")),
      );
      return rows;
    } catch (error) {
      throw new Error(`Error fetching workers: ${error.message}`);
    }
  }

  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      throw new Error(`Error fetching worker: ${error.message}`);
    }
  }

  /** Find a worker by (case-insensitive) name. Returns the first match or null. */
  static async getByName(name) {
    try {
      const target = String(name || "")
        .trim()
        .toLowerCase();
      if (!target) return null;
      const all = await this.getAll();
      return (
        all.find((w) => String(w.name || "").toLowerCase() === target) || null
      );
    } catch (error) {
      throw new Error(`Error finding worker by name: ${error.message}`);
    }
  }

  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Error deleting worker: ${error.message}`);
    }
  }

  /** Update a worker's basic info (name / role). */
  static async update(id, data) {
    try {
      const patch = { updatedAt: new Date() };
      if (data.name != null) patch.name = String(data.name).trim();
      if (data.role != null) patch.role = String(data.role).trim();
      await db.collection(this.collectionName).doc(id).update(patch);
      return await this.getById(id);
    } catch (error) {
      throw new Error(`Error updating worker: ${error.message}`);
    }
  }

  /** Edit a single quality round by its id. */
  static async updateRound(id, roundId, data) {
    try {
      const worker = await this.getById(id);
      if (!worker) throw new Error("Worker not found");
      const rounds = Array.isArray(worker.qualityRounds)
        ? worker.qualityRounds
        : [];
      const idx = rounds.findIndex((r) => r.id === roundId);
      if (idx < 0) throw new Error("Round not found");
      rounds[idx] = {
        ...rounds[idx],
        date: data.date != null ? data.date : rounds[idx].date,
        area: data.area != null ? String(data.area).trim() : rounds[idx].area,
        precautions:
          data.precautions != null
            ? data.precautions === "yes"
              ? "yes"
              : "no"
            : rounds[idx].precautions,
        notes:
          data.notes != null ? String(data.notes).trim() : rounds[idx].notes,
        editedAt: new Date().toISOString(),
      };
      await db.collection(this.collectionName).doc(id).update({
        qualityRounds: rounds,
        updatedAt: new Date(),
      });
      return rounds[idx];
    } catch (error) {
      throw new Error(`Error updating round: ${error.message}`);
    }
  }

  /** Remove a single quality round by its id. */
  static async deleteRound(id, roundId) {
    try {
      const worker = await this.getById(id);
      if (!worker) throw new Error("Worker not found");
      const rounds = (worker.qualityRounds || []).filter(
        (r) => r.id !== roundId,
      );
      await db.collection(this.collectionName).doc(id).update({
        qualityRounds: rounds,
        updatedAt: new Date(),
      });
      return true;
    } catch (error) {
      throw new Error(`Error deleting round: ${error.message}`);
    }
  }

  /** Edit a single production error by its id. */
  static async updateError(id, errorId, data) {
    try {
      const worker = await this.getById(id);
      if (!worker) throw new Error("Worker not found");
      const errors = Array.isArray(worker.productionErrors)
        ? worker.productionErrors
        : [];
      const idx = errors.findIndex((e) => e.id === errorId);
      if (idx < 0) throw new Error("Error entry not found");
      errors[idx] = {
        ...errors[idx],
        batchNumber:
          data.batchNumber != null
            ? String(data.batchNumber).trim()
            : errors[idx].batchNumber,
        fieldLabel:
          data.fieldLabel != null
            ? String(data.fieldLabel).trim()
            : errors[idx].fieldLabel,
        description:
          data.description != null
            ? String(data.description).trim()
            : errors[idx].description,
        date: data.date != null ? data.date : errors[idx].date,
        editedAt: new Date().toISOString(),
      };
      await db.collection(this.collectionName).doc(id).update({
        productionErrors: errors,
        updatedAt: new Date(),
      });
      return errors[idx];
    } catch (error) {
      throw new Error(`Error updating production error: ${error.message}`);
    }
  }

  /** Remove a single production error by its id. */
  static async deleteError(id, errorId) {
    try {
      const worker = await this.getById(id);
      if (!worker) throw new Error("Worker not found");
      const errors = (worker.productionErrors || []).filter(
        (e) => e.id !== errorId,
      );
      await db.collection(this.collectionName).doc(id).update({
        productionErrors: errors,
        updatedAt: new Date(),
      });
      return true;
    } catch (error) {
      throw new Error(`Error deleting production error: ${error.message}`);
    }
  }

  /** Append a quality precaution round to a worker's profile. */
  static async addQualityRound(id, round) {
    try {
      const worker = await this.getById(id);
      if (!worker) throw new Error("Worker not found");
      const rounds = Array.isArray(worker.qualityRounds)
        ? worker.qualityRounds
        : [];
      const entry = {
        id: this.genId("round"),
        date: round.date || new Date().toISOString().slice(0, 10),
        area: String(round.area || "").trim(),
        precautions: round.precautions === "yes" ? "yes" : "no",
        notes: String(round.notes || "").trim(),
        recordedAt: new Date().toISOString(),
      };
      rounds.push(entry);
      await db.collection(this.collectionName).doc(id).update({
        qualityRounds: rounds,
        updatedAt: new Date(),
      });
      return entry;
    } catch (error) {
      throw new Error(`Error recording quality round: ${error.message}`);
    }
  }

  /** Append a production error to a worker's profile. */
  static async addError(id, error) {
    try {
      const worker = await this.getById(id);
      if (!worker) throw new Error("Worker not found");
      const errors = Array.isArray(worker.productionErrors)
        ? worker.productionErrors
        : [];
      const entry = {
        id: this.genId("err"),
        batchNumber: String(error.batchNumber || "").trim(),
        batchId: error.batchId || null,
        fieldLabel: String(error.fieldLabel || "").trim(),
        fieldValue: String(error.fieldValue || "").trim(),
        description: String(error.description || "").trim(),
        date: error.date || new Date().toISOString().slice(0, 10),
        recordedAt: new Date().toISOString(),
      };
      errors.push(entry);
      await db.collection(this.collectionName).doc(id).update({
        productionErrors: errors,
        updatedAt: new Date(),
      });
      return entry;
    } catch (err) {
      throw new Error(`Error recording production error: ${err.message}`);
    }
  }

  static validate(data) {
    const errors = [];
    if (!data.name || String(data.name).trim() === "")
      errors.push("Worker name is required");
    return errors;
  }
}

module.exports = Worker;
