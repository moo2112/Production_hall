/**
 * batchWorkers.js
 * ---------------------------------------------------------------------------
 * Shared helpers for figuring out which field answers in a batch (patch) are
 * worker names. Used in three places:
 *   1. routes/batch.js   — when a new batch is recorded, link it into the
 *                          profile of every worker whose name was chosen.
 *   2. routes/workers.js — on the Quality Control "Record Production Error"
 *                          page, present the profiles of the workers that made
 *                          the looked-up patch.
 *   3. migrations/migrateWorkers.js — back-fill worker profiles + their
 *                          "batches made" list from old patch records.
 *
 * Field answers are stored as plain strings (the worker's NAME), so a name is
 * the key we match on across the whole system.
 */

/** Strip the "field_" prefix Firestore keys sometimes carry. */
function normalizeFieldKey(key) {
  let normalized = String(key || "").trim();
  while (normalized.startsWith("field_field_")) {
    normalized = normalized.replace(/^field_/, "");
  }
  return normalized.replace(/^field_/, "");
}

/** Turn a raw field key into a friendly label when no template label exists. */
function humanizeFieldKey(key) {
  return (
    String(key || "")
      .replace(/^field_/, "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim() || "Field"
  );
}

/**
 * Decide whether a free-text answer looks like a person's name (rather than a
 * number, a date, or an empty placeholder). Used for older patches that have no
 * template, or for answers stored against non-template fields.
 *
 * Deliberately permissive about scripts (Arabic, Latin, …) but rejects values
 * that are clearly NOT names.
 */
function looksLikeName(value) {
  const v = String(value == null ? "" : value).trim();
  if (!v) return false;
  if (v === "—" || v === "-" || v === "--") return false;
  // pure number (phone numbers, counts, batch codes, …)
  if (/^[\d\s.,/+()-]+$/.test(v)) return false;
  // ISO-ish date only
  if (/^\d{4}-\d{2}-\d{2}([ T].*)?$/.test(v)) return false;
  // too long to be a name
  if (v.length > 60) return false;
  return true;
}

/**
 * Build a normalized { key -> value } map of a batch's dynamic field answers.
 */
function normalizedFieldValues(batch) {
  const out = {};
  Object.entries((batch && batch.fieldValues) || {}).forEach(([k, v]) => {
    const key = normalizeFieldKey(k);
    if (key) out[key] = v;
  });
  return out;
}

/**
 * A single field answer may contain MORE THAN ONE worker (e.g. two people did
 * the same task: "ميادة، اسلام" or "ahmed / sara" or "ahmed and sara").
 * Split such a value into individual candidate names.
 */
function splitNames(value) {
  const v = String(value == null ? "" : value).trim();
  if (!v) return [];
  // separators: Arabic/Latin comma, slash, backslash, pipe, semicolon, newline,
  // " and " / " & " / Arabic " و " (as a standalone connector with spaces).
  const parts = v
    .split(/\s*[،,/\\|;\n]+\s*|\s+&\s+|\s+and\s+|\s+\u0648\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [v];
}

/**
 * Return the list of worker-name answers found in a batch.
 *
 * @param {Object} batch     The batch document.
 * @param {Object|null} tmpl The form template (may be null/undefined).
 * @returns {Array<{ name, fieldKey, fieldLabel }>}  one entry per matching answer.
 *
 * Rules:
 *   • If a template is available, fields of type "text" or "worker" are treated
 *     as worker-name fields (these are the ones the new-batch form renders as a
 *     "choose a worker" dropdown). "notes"/"number"/"date"/"dropdown" are skipped.
 *   • Any answer NOT covered by the template (or for templateless batches) is
 *     included only if it passes the looksLikeName() heuristic.
 */
function extractWorkerNames(batch, tmpl) {
  const values = normalizedFieldValues(batch);
  const results = [];
  const usedKeys = new Set();

  const pushIf = (rawValue, fieldKey, fieldLabel) => {
    // one field answer may list several workers — split and add each
    splitNames(rawValue).forEach((name) => {
      const clean = String(name == null ? "" : name).trim();
      if (!looksLikeName(clean)) return; // rejects empty, "—", pure numbers, dates
      results.push({ name: clean, fieldKey, fieldLabel });
    });
  };

  const fields = (tmpl && Array.isArray(tmpl.fields) && tmpl.fields) || [];

  fields.forEach((f) => {
    const key = normalizeFieldKey(f.id);
    const variants = [key, f.id, "field_" + key].map(normalizeFieldKey);
    const matchKey = variants.find((v) =>
      Object.prototype.hasOwnProperty.call(values, v),
    );
    if (!matchKey) return;
    usedKeys.add(matchKey);

    // Only "text" / "worker" fields hold worker names. number/date/dropdown/notes
    // are never treated as names (e.g. a dropdown value like "Pass" is not a worker).
    const isWorkerField = f.type === "worker" || f.type === "text";
    if (!isWorkerField) return;

    const label = f.label || humanizeFieldKey(key);
    pushIf(values[matchKey], matchKey, label);
  });

  // Answers with no matching template field (extra keys, or templateless batch):
  // include only those that look like a name.
  Object.entries(values).forEach(([key, val]) => {
    if (usedKeys.has(key)) return;
    pushIf(val, key, humanizeFieldKey(key));
  });

  return results;
}

/** Unique worker names (case-insensitive) found in a batch. */
function uniqueWorkerNames(batch, tmpl) {
  const seen = new Set();
  const out = [];
  extractWorkerNames(batch, tmpl).forEach((m) => {
    const lc = m.name.toLowerCase();
    if (seen.has(lc)) return;
    seen.add(lc);
    out.push(m);
  });
  return out;
}

module.exports = {
  normalizeFieldKey,
  humanizeFieldKey,
  looksLikeName,
  splitNames,
  extractWorkerNames,
  uniqueWorkerNames,
};
