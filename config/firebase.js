const admin = require("firebase-admin");

let db;

// Prevent re-initialising on Vercel warm starts
if (!admin.apps.length) {
  try {
    // ── Option A: serviceAccountKey.json (local development) ─────────────────
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase initialized from serviceAccountKey.json");
  } catch (fileError) {
    // ── Option B: Environment variables (Vercel / production) ─────────────────
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            // Vercel stores \n as literal \\n — handle both forms
            privateKey: privateKey.replace(/\\n/g, "\n"),
          }),
        });
        console.log("✅ Firebase initialized from environment variables");
      } catch (envError) {
        // Do NOT call process.exit() — let the request fail gracefully
        console.error("❌ Firebase env-var init failed:", envError.message);
      }
    } else {
      // Log clearly which variables are missing
      const missing = [];
      if (!projectId) missing.push("FIREBASE_PROJECT_ID");
      if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
      if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
      console.error(
        "❌ Firebase not configured. Missing env vars:",
        missing.join(", "),
      );
      // Do NOT call process.exit() on Vercel — it kills the function silently
    }
  }
}

// Get db from the initialised app (works for both fresh and warm starts)
try {
  db = admin.app().firestore();
} catch (e) {
  console.error("❌ Could not get Firestore instance:", e.message);
}

module.exports = { db, admin };
