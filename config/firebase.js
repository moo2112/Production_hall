// const admin = require("firebase-admin");

// // Initialize Firebase Admin SDK
// // You need to download your service account key from Firebase Console
// // and save it as serviceAccountKey.json in the config folder
// let db;

// try {
//   const serviceAccount = require("./serviceAccountKey.json");

//   admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount),
//   });

//   db = admin.firestore();
//   console.log("✅ Firebase Firestore initialized successfully");
// } catch (error) {
//   console.error("❌ Error initializing Firebase:", error.message);
//   console.log(
//     "⚠️  Please ensure serviceAccountKey.json is present in the config folder",
//   );

//   // Fallback: Use environment variables for Firestore credentials
//   if (process.env.FIREBASE_PROJECT_ID) {
//     admin.initializeApp({
//       credential: admin.credential.cert({
//         projectId: process.env.FIREBASE_PROJECT_ID,
//         clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
//         privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
//       }),
//     });
//     db = admin.firestore();
//     console.log("✅ Firebase Firestore initialized with environment variables");
//   }
// }

// module.exports = { db, admin };

const admin = require("firebase-admin");

let db;

if (!admin.apps.length) {
  try {
    // ── Option A: serviceAccountKey.json (local only) ─────────────────────────
    const serviceAccount = require("./serviceAccountKey.json");
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log("✅ Firebase initialized from serviceAccountKey.json");
  } catch (fileError) {
    // ── Option B: Environment variables (Vercel) ──────────────────────────────
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    console.log("Firebase env check:");
    console.log(
      "  FIREBASE_PROJECT_ID   :",
      projectId ? "✅ set" : "❌ missing",
    );
    console.log(
      "  FIREBASE_CLIENT_EMAIL :",
      clientEmail ? "✅ set" : "❌ missing",
    );
    console.log(
      "  FIREBASE_PRIVATE_KEY  :",
      privateKey ? "✅ set (" + privateKey.length + " chars)" : "❌ missing",
    );

    if (projectId && clientEmail && privateKey) {
      // Vercel can store the key in several ways — handle all of them
      // 1. Replace literal \n with real newlines
      privateKey = privateKey.replace(/\\n/g, "\n");
      // 2. Strip wrapping quotes if Vercel added them
      privateKey = privateKey.replace(/^["']|["']$/g, "");
      // 3. Ensure the header/footer lines have real newlines around them
      if (!privateKey.includes("\n")) {
        privateKey = privateKey
          .replace(
            "-----BEGIN PRIVATE KEY-----",
            "-----BEGIN PRIVATE KEY-----\n",
          )
          .replace(
            "-----END PRIVATE KEY-----",
            "\n-----END PRIVATE KEY-----\n",
          );
      }

      console.log("  Key starts with       :", privateKey.substring(0, 40));

      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
        console.log("✅ Firebase initialized from environment variables");
      } catch (envError) {
        console.error("❌ Firebase initializeApp failed:", envError.message);
      }
    } else {
      const missing = [];
      if (!projectId) missing.push("FIREBASE_PROJECT_ID");
      if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
      if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
      console.error("❌ Missing env vars:", missing.join(", "));
    }
  }
}

try {
  db = admin.app().firestore();
  console.log("✅ Firestore db instance ready");
} catch (e) {
  console.error("❌ Could not get Firestore instance:", e.message);
}

module.exports = { db, admin };
