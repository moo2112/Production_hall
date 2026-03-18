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
  throw new Error("Firebase Firestore could not be initialized: " + e.message);
}
module.exports = { db, admin };

// FIREBASE_PROJECT_ID  :   production-hall-82f07
// FIREBASE_CLIENT_EMAIL  :  firebase-adminsdk-fbsvc@production-hall-82f07.iam.gserviceaccount.com
// FIREBASE_PRIVATE_KEY  :  -----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDzSkXjfxvEU3p8\nhJxvNrb0lwZH0eXCZXW/xTyBM13M6QERYTJnvmbS05zfihON4sSkfDt8IXor8h8Q\nwwugjaM9T8fhpn7Ji5BFdq8f1VSNpPhUU3ElDgIRCoWAmDpF3A/CiXhQhd4SWPZ2\nRxhPNA30CJ+1HJObhHzZTR2GjY31kMLQKwU78NyMuwjyAwbyGTRGXuvpFWnQr9j1\nBx5ct0grQ6b3E9EABu/9RLkRkRLc6HqgPHUy3jGnCCr3hU35LC7NGLX4zwd/w73j\nCA8TW8AhIQOfihsqwW6w7Ou0B5NUp62dhkPXqoWEFft7KbdeEoxYeP8baLgj2PsA\nEU5MBfGTAgMBAAECggEAUXvo2H80D5deCOJpep46vMTwZ5GXgHp265nl3+gSXJUV\ntHp3ZWPSEH6rpfsa/YScE/NAAR09TAa1/Ok2tbl6mQhli+A1ys8hrQJJOUI8JYzB\nV4zy8lQ0wPxjJmTV75v6808TqvSLIl4FfivlqnFm0vsocoJ1tbq0DhvT7cLvbvU7\n8tVKoEK/7nCDBYzSxDFxiBuLHVDiFDSyiMNr6XKhb9u1WGTl6snvt5umQ193mDzI\nCJDuqiHV2YQQghyifV10X5qJCjHykAr0eAJqLKPOADW8e2ese57wsmbHTARi0O0h\ntALihUyxaztdBHbTqqT+3/zrVLoCOKtiF9DGgjw5YQKBgQD/XHlVbyICPAcNpNYt\ngD/Mao8SNes5uhjINmkPT6rcxK7Nt5d9V3OTAYaRfIbNYWkFf2yljJVk4yZSR1WC\nBr1GjeX7t3W7nUNRcEtNlMT3XeZry3+AFTAkU7E4zCS1Ct8JtwhDoHEJEt8oVZ+L\nHusKCqKynzocaN+L2QHq6us2ewKBgQDz5hGtrr+Yc+t0399hg+aidUhiMSukHwBr\nTSlaLEx2MeAPYsZP+gfkiNj7EJOOMTN1iEYC+iJz2uHkjxj0KRwCtZDQ61vOiEiH\neLLLKZEhxgH5My9wPjslEvJjup1ZD0KUcgUY6mAa6w8HNjI1vxaaezs8uJSB5p8V\nrzPLwA4RyQKBgF/fOxqNP8pw+QDxWwv4M3uuogpnPeoNaVJ5wxXhhjeejDZl8DU5\nyQVvNDOY+g9PvBs5TPQWhNw8v91yNLM9joBXs/m+VjBbCbQgodT9vrlUgrcDztmq\nmsl4tnephTqHW1eNZUfmi6mpcSj2hJC5yeqaNZ00VJ/n683YanTlP+vTAoGBAO/6\n3EIsw1BaHr8s2Dq28eO/yqzy/KHL7zmk/p8/Hyzc/j2lTsO6nLF9BSJjuQwb1So8\nH8cmH2gnYkTlmAQFvw3bYNZv/jFFXzgMxr+n8qlsjtyIRJEIamGcNutx3wiWP0iY\nt/NACbfyuSK7bMP9dVwjDLI+W8FFDhrj/O7p1e4hAoGAeVzHKTfmtP70sSu6OwrA\nDYxZzq9XApQ3Q3QCWT46VeFKxIfR8s2Zu+NrCN34Q/qA52fZAd/RZkmOq4AhitSC\nQMfQ4jFqdf3sfZE1ZbdAM92FhcPRDypiVdp5u7k5/IuA4N2FAHx8hufpxMpoIrV4\nmBfFcaEym4iMV7/7B3NippE=\n-----END PRIVATE KEY-----\n
