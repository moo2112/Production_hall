const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// You need to download your service account key from Firebase Console
// and save it as serviceAccountKey.json in the config folder
let db;

try {
  const serviceAccount = require('./serviceAccountKey.json');

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  db = admin.firestore();
  console.log('✅ Firebase Firestore initialized successfully');
} catch (error) {
  console.error('❌ Error initializing Firebase:', error.message);
  console.log('⚠️  Please ensure serviceAccountKey.json is present in the config folder');
  
  // Fallback: Use environment variables for Firestore credentials
  if (process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
      })
    });
    db = admin.firestore();
    console.log('✅ Firebase Firestore initialized with environment variables');
  }
}

module.exports = { db, admin };
