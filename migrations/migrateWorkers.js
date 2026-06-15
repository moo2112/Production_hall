/**
 * migrateWorkers.js
 * ---------------------------------------------------------------------------
 * One-off (idempotent) data migration that runs when the server boots.
 *
 * It walks every existing batch (patch), finds the worker names recorded in the
 * field answers, and:
 *   1. Creates a worker profile for any name that does not already have one.
 *   2. Rebuilds each worker's "batchesMade" list from the patches they appear in.
 *
 * Safe to run repeatedly: profiles are matched by name (case-insensitive) and
 * the batchesMade list is recomputed from scratch for every worker we touch, so
 * no duplicates accumulate.
 */

const Batch = require("../models/batch");
const FormTemplate = require("../models/formTemplate");
const Worker = require("../models/worker");
const { extractWorkerNames } = require("../utils/batchWorkers");

async function migrateWorkerProfiles() {
  const started = Date.now();
  const batches = await Batch.getAll();

  // cache templates so we only fetch each one once
  const templateCache = new Map();
  async function getTemplate(id) {
    if (!id) return null;
    if (templateCache.has(id)) return templateCache.get(id);
    let tmpl = null;
    try {
      tmpl = await FormTemplate.getById(id);
    } catch (_) {
      tmpl = null;
    }
    templateCache.set(id, tmpl);
    return tmpl;
  }

  // nameLC -> { name, batches: [ {batchId, batchNumber, itemName, fieldKey, fieldLabel} ] }
  const byName = new Map();

  for (const batch of batches) {
    const template = await getTemplate(batch.formTemplateId);
    const matches = extractWorkerNames(batch, template);
    for (const m of matches) {
      const lc = m.name.toLowerCase();
      if (!byName.has(lc)) byName.set(lc, { name: m.name, batches: [] });
      byName.get(lc).batches.push({
        batchId: batch.id || null,
        batchNumber: String(batch.batchNumber || "").trim(),
        itemName: String(batch.itemName || "").trim(),
        fieldKey: m.fieldKey,
        fieldLabel: m.fieldLabel,
        recordedAt: new Date().toISOString(),
      });
    }
  }

  let createdProfiles = 0;
  let updatedProfiles = 0;

  for (const { name, batches: madeList } of byName.values()) {
    let worker = await Worker.getByName(name);
    if (!worker) {
      worker = await Worker.create({ name, role: "" });
      createdProfiles += 1;
    }
    // de-duplicate by (batchId, fieldKey)
    const seen = new Set();
    const deduped = [];
    for (const b of madeList) {
      const sig = (b.batchId || "") + "|" + (b.fieldKey || "");
      if (seen.has(sig)) continue;
      seen.add(sig);
      deduped.push(b);
    }
    await Worker.setBatchesMade(worker.id, deduped);
    updatedProfiles += 1;
  }

  const ms = Date.now() - started;
  console.log(
    `[migrateWorkers] done in ${ms}ms — scanned ${batches.length} patch(es), ` +
      `created ${createdProfiles} new profile(s), refreshed ${updatedProfiles} profile(s).`,
  );
  return { scanned: batches.length, createdProfiles, updatedProfiles };
}

// ── run-once guard (shared across concurrent calls / serverless invocations) ──
let _runPromise = null;
function runWorkerMigrationOnce() {
  if (_runPromise) return _runPromise;
  _runPromise = migrateWorkerProfiles().catch((err) => {
    console.error("[migrateWorkers] FAILED:", err.message);
    // allow a later retry if it failed
    _runPromise = null;
  });
  return _runPromise;
}

module.exports = { migrateWorkerProfiles, runWorkerMigrationOnce };
