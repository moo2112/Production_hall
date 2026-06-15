/**
 * aiUnify.js
 * ---------------------------------------------------------------------------
 * Uses the OpenAI API to group worker names that refer to the SAME person but
 * were recorded in different formats — Arabic vs English, or spelling /
 * transliteration variants (e.g. "ebrahim" / "ibrahim" / "إبراهيم").
 *
 * The API key is supplied by the user at request time and is NOT stored.
 *
 * Returns: { clusters: [ { canonical: string, members: string[] }, ... ] }
 * Only clusters with 2+ members are meaningful (a merge); singletons are
 * filtered out by the caller.
 */

const SYSTEM_PROMPT = `You are a data-cleaning assistant for a factory's worker database.
You are given a JSON array of worker names. Some names refer to the SAME real person but were typed differently:
- Arabic vs English spelling of the same name (e.g. "إبراهيم" and "Ibrahim").
- Transliteration / spelling variants (e.g. "ebrahim", "ibrahim", "ibraheem").
- Extra/missing spaces, diacritics, or honorifics.

Group together ONLY names that are clearly the same person. NEVER merge two clearly different people (e.g. "Sara" and "Mariam" are different; "Ahmed" and "Mohamed" are different).
When unsure, keep them separate.

For each group, choose a "canonical" display name: prefer a clean, fully-spelled form; if both Arabic and English exist, pick the form that appears most complete and correct.

Return STRICT JSON only, no prose, in exactly this shape:
{"clusters":[{"canonical":"<name>","members":["<name>","<name>"]}]}
Include every input name in exactly one cluster (a name with no variant is a cluster with a single member).`;

/**
 * @param {Object} opts
 * @param {string} opts.apiKey   OpenAI API key (user-provided, not stored)
 * @param {string} [opts.model]  model id, default gpt-4.1-mini
 * @param {string[]} opts.names  unique worker names to cluster
 * @returns {Promise<{clusters: Array<{canonical:string, members:string[]}>}>}
 */
async function unifyNamesWithAI({ apiKey, model, names }) {
  if (!apiKey || !String(apiKey).trim()) {
    throw new Error("OpenAI API key is required");
  }
  const cleanNames = (names || [])
    .map((n) => String(n == null ? "" : n).trim())
    .filter(Boolean);
  if (cleanNames.length === 0) return { clusters: [] };

  const useModel = (model && String(model).trim()) || "gpt-4.1-mini";

  const body = {
    model: useModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: "Cluster these worker names:\n" + JSON.stringify(cleanNames),
      },
    ],
  };

  let resp;
  try {
    resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + String(apiKey).trim(),
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Could not reach OpenAI: " + e.message);
  }

  if (!resp.ok) {
    let detail = "";
    try {
      const errJson = await resp.json();
      detail =
        (errJson.error && errJson.error.message) || JSON.stringify(errJson);
    } catch (_) {
      detail = await resp.text().catch(() => "");
    }
    if (resp.status === 401) {
      throw new Error("OpenAI rejected the API key (401). Check the key.");
    }
    if (resp.status === 404) {
      throw new Error(
        `Model "${useModel}" not found for this key (404). Try gpt-4.1-mini or gpt-4o-mini.`,
      );
    }
    throw new Error(`OpenAI error ${resp.status}: ${detail}`);
  }

  let data;
  try {
    data = await resp.json();
  } catch (e) {
    throw new Error("OpenAI returned invalid JSON envelope: " + e.message);
  }

  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  if (!content) throw new Error("OpenAI returned an empty response");

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    throw new Error("Could not parse the model's JSON output");
  }

  const clusters = Array.isArray(parsed.clusters) ? parsed.clusters : [];

  // Validate: members must be from the input set; canonical falls back to first member.
  const known = new Set(cleanNames.map((n) => n.toLowerCase()));
  const cleaned = [];
  for (const c of clusters) {
    const members = (Array.isArray(c.members) ? c.members : [])
      .map((m) => String(m == null ? "" : m).trim())
      .filter((m) => m && known.has(m.toLowerCase()));
    if (members.length === 0) continue;
    let canonical = String(c.canonical || "").trim();
    if (
      !canonical ||
      !members.some((m) => m.toLowerCase() === canonical.toLowerCase())
    ) {
      // prefer a member that contains Latin letters, else the longest
      canonical =
        members.find((m) => /[A-Za-z]/.test(m)) ||
        members.slice().sort((a, b) => b.length - a.length)[0];
    }
    cleaned.push({ canonical, members });
  }

  return { clusters: cleaned };
}

module.exports = { unifyNamesWithAI };
