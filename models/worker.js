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
 *   batchesMade:     [ { batchId, batchNumber, itemName, fieldKey, fieldLabel, recordedAt } ]
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
        batchesMade: [],
        aliases: Array.isArray(data.aliases) ? data.aliases : [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const docRef = await db.collection(this.collectionName).add(payload);
      // explicit creation overrides any prior tombstone for this name
      await this.removeSuppressedNames([payload.name]);
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

  /**
   * Find a worker by (case-insensitive) name OR any of its aliases. Aliases are
   * the alternative spellings/transliterations merged in by the AI unify step,
   * so every old name variant still resolves to the single canonical profile.
   * Returns the first match or null.
   */
  static async getByName(name) {
    try {
      const target = String(name || "")
        .trim()
        .toLowerCase();
      if (!target) return null;
      const all = await this.getAll();
      return (
        all.find((w) => {
          if (String(w.name || "").toLowerCase() === target) return true;
          const aliases = Array.isArray(w.aliases) ? w.aliases : [];
          return aliases.some((a) => String(a || "").toLowerCase() === target);
        }) || null
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

  /**
   * Find a worker by name (case-insensitive) or create one if missing.
   * Used when recording a batch (the chosen names already exist as profiles)
   * and by the startup migration (which back-fills missing profiles).
   *
   * @param {Set<string>} [suppressed]  optional pre-loaded set of suppressed
   *   (deleted) lower-cased names. If the name is suppressed, returns null
   *   instead of recreating the profile.
   */
  static async findOrCreateByName(name, role = "", suppressed = null) {
    const clean = String(name || "").trim();
    if (!clean) throw new Error("Worker name is required");
    const existing = await this.getByName(clean);
    if (existing) return existing;
    const block = suppressed || (await this.getSuppressedNames());
    if (block.has(clean.toLowerCase())) return null; // deleted on purpose
    return await this.create({ name: clean, role });
  }

  /**
   * Record that a worker made / participated in a batch. Idempotent: a given
   * (batchId, fieldKey) pair is only stored once per worker.
   * @param {string} id        Worker document id
   * @param {Object} batchInfo { batchId, batchNumber, itemName, fieldKey, fieldLabel }
   */
  static async addBatchMade(id, batchInfo) {
    try {
      const worker = await this.getById(id);
      if (!worker) throw new Error("Worker not found");
      const list = Array.isArray(worker.batchesMade) ? worker.batchesMade : [];

      const batchId = batchInfo.batchId || null;
      const fieldKey = String(batchInfo.fieldKey || "").trim();
      const already = list.some(
        (b) =>
          (b.batchId || null) === batchId &&
          String(b.fieldKey || "").trim() === fieldKey,
      );
      if (already) return worker.batchesMade;

      list.push({
        batchId,
        batchNumber: String(batchInfo.batchNumber || "").trim(),
        itemName: String(batchInfo.itemName || "").trim(),
        fieldKey,
        fieldLabel: String(batchInfo.fieldLabel || "").trim(),
        recordedAt: new Date().toISOString(),
      });

      await db.collection(this.collectionName).doc(id).update({
        batchesMade: list,
        updatedAt: new Date(),
      });
      return list;
    } catch (error) {
      throw new Error(`Error recording batch for worker: ${error.message}`);
    }
  }

  /** Replace a worker's whole batchesMade list (used by the migration rebuild). */
  static async setBatchesMade(id, list) {
    try {
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({
          batchesMade: Array.isArray(list) ? list : [],
          updatedAt: new Date(),
        });
      return true;
    } catch (error) {
      throw new Error(`Error setting batches made: ${error.message}`);
    }
  }

  /**
   * Merge several duplicate worker profiles into one canonical profile, then
   * delete the duplicates. Combines batchesMade / qualityRounds /
   * productionErrors (de-duplicated) and records every merged-away name as an
   * alias so old name variants still resolve to this profile.
   *
   * @param {string}   canonicalId   id of the profile to keep
   * @param {string[]} duplicateIds  ids of the profiles to merge in and delete
   * @param {string}   [canonicalName] optional preferred display name
   * @returns {Object} the updated canonical worker
   */
  static async mergeWorkers(canonicalId, duplicateIds, canonicalName) {
    try {
      const canonical = await this.getById(canonicalId);
      if (!canonical) throw new Error("Canonical worker not found");

      const dups = [];
      for (const dId of duplicateIds || []) {
        if (dId === canonicalId) continue;
        const d = await this.getById(dId);
        if (d) dups.push(d);
      }

      const batchesMade = [...(canonical.batchesMade || [])];
      const qualityRounds = [...(canonical.qualityRounds || [])];
      const productionErrors = [...(canonical.productionErrors || [])];
      const aliasSet = new Set((canonical.aliases || []).map((a) => String(a)));

      const batchSig = new Set(
        batchesMade.map((b) => (b.batchId || "") + "|" + (b.fieldKey || "")),
      );

      dups.forEach((d) => {
        // remember the duplicate's name + its aliases as aliases of canonical
        if (d.name && d.name !== canonical.name) aliasSet.add(d.name);
        (d.aliases || []).forEach((a) => {
          if (a && a !== canonical.name) aliasSet.add(String(a));
        });
        (d.batchesMade || []).forEach((b) => {
          const sig = (b.batchId || "") + "|" + (b.fieldKey || "");
          if (batchSig.has(sig)) return;
          batchSig.add(sig);
          batchesMade.push(b);
        });
        (d.qualityRounds || []).forEach((r) => qualityRounds.push(r));
        (d.productionErrors || []).forEach((e) => productionErrors.push(e));
      });

      const patch = {
        batchesMade,
        qualityRounds,
        productionErrors,
        aliases: Array.from(aliasSet),
        updatedAt: new Date(),
      };
      if (canonicalName && String(canonicalName).trim()) {
        patch.name = String(canonicalName).trim();
      }

      await db.collection(this.collectionName).doc(canonicalId).update(patch);

      // delete the merged-away duplicates
      for (const d of dups) {
        await db.collection(this.collectionName).doc(d.id).delete();
      }

      return await this.getById(canonicalId);
    } catch (error) {
      throw new Error(`Error merging workers: ${error.message}`);
    }
  }

  // ── Suppression (tombstones) ───────────────────────────────────────────────
  // When a worker is deleted, their name (and aliases) are remembered here so the
  // startup migration and the Quality-Control page do NOT silently re-create the
  // profile from names still stored in old patches.
  static suppressionDocPath() {
    return { collection: "appMeta", doc: "suppressedNames" };
  }

  /** Returns a Set of suppressed names (lower-cased). */
  static async getSuppressedNames() {
    try {
      const ref = this.suppressionDocPath();
      const snap = await db.collection(ref.collection).doc(ref.doc).get();
      const names =
        snap.exists && Array.isArray(snap.data().names)
          ? snap.data().names
          : [];
      return new Set(names.map((n) => String(n || "").toLowerCase()));
    } catch (error) {
      // never block on this — treat as "nothing suppressed"
      return new Set();
    }
  }

  static async addSuppressedNames(names) {
    try {
      const ref = this.suppressionDocPath();
      const set = await this.getSuppressedNames();
      (names || []).forEach((n) => {
        const v = String(n || "").trim();
        if (v) set.add(v.toLowerCase());
      });
      await db
        .collection(ref.collection)
        .doc(ref.doc)
        .set({ names: Array.from(set), updatedAt: new Date() });
      return true;
    } catch (error) {
      throw new Error(`Error suppressing names: ${error.message}`);
    }
  }

  static async removeSuppressedNames(names) {
    try {
      const ref = this.suppressionDocPath();
      const set = await this.getSuppressedNames();
      (names || []).forEach((n) => set.delete(String(n || "").toLowerCase()));
      await db
        .collection(ref.collection)
        .doc(ref.doc)
        .set({ names: Array.from(set), updatedAt: new Date() });
      return true;
    } catch (error) {
      // non-fatal
      return false;
    }
  }

  /**
   * Permanently delete a worker AND remember its name/aliases so it won't be
   * recreated from old patch data. Use this for explicit user deletions.
   */
  static async deleteAndSuppress(id) {
    try {
      const worker = await this.getById(id);
      if (worker) {
        const names = [worker.name, ...(worker.aliases || [])].filter(Boolean);
        await this.addSuppressedNames(names);
      }
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (error) {
      throw new Error(`Error deleting worker: ${error.message}`);
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
