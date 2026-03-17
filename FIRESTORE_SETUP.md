# Firebase Firestore Setup Guide

This guide will walk you through setting up Firebase Firestore for the Production Hall application.

## What is Firebase Firestore?

Firebase Firestore is a flexible, scalable NoSQL cloud database from Google. It's perfect for this application because:
- ✅ Real-time data synchronization
- ✅ Automatic scaling
- ✅ Offline support
- ✅ Easy to use
- ✅ Free tier available (up to 1GB storage and 50,000 reads/day)

## Step-by-Step Setup

### Step 1: Create a Firebase Account

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Sign in with your Google account
3. If you don't have a Google account, create one first

### Step 2: Create a New Firebase Project

1. Click the **"Add Project"** button
2. Enter a project name (e.g., "production-hall")
3. Click **Continue**
4. (Optional) Enable Google Analytics if you want analytics
5. Click **Create Project**
6. Wait for the project to be created (takes ~30 seconds)
7. Click **Continue** when ready

### Step 3: Enable Firestore Database

1. In the left sidebar, click **Firestore Database**
2. Click **Create Database**
3. Choose a starting mode:
   - **Production mode**: Recommended for production apps (stricter security rules)
   - **Test mode**: Good for development (open access for 30 days)
   
   For this app, you can start with **Test mode** for development.

4. Click **Next**
5. Choose a location for your database:
   - Select the region closest to your users
   - **Note**: This cannot be changed later!
6. Click **Enable**
7. Wait for Firestore to be created (~1 minute)

### Step 4: Get Your Service Account Key

This is the most important step - you'll get credentials to connect your app to Firestore.

1. Click the **gear icon** (⚙️) next to "Project Overview" in the sidebar
2. Select **Project Settings**
3. Navigate to the **Service Accounts** tab
4. You should see a section that says "Firebase Admin SDK"
5. Select **Node.js** as the language
6. Click **Generate New Private Key**
7. A popup will appear - click **Generate Key**
8. A JSON file will download to your computer
   - This file contains your Firebase credentials
   - **KEEP IT SECURE** - Never share it publicly!

### Step 5: Add the Credentials to Your Project

#### Method A: Using Service Account File (Easiest)

1. Find the downloaded JSON file (usually in your Downloads folder)
   - It will have a name like: `your-project-name-firebase-adminsdk-xxxxx.json`

2. **Rename** it to exactly: `serviceAccountKey.json`

3. **Move** it to your project's `config` folder:
   ```
   production-hall/
   └── config/
       └── serviceAccountKey.json   ← Put it here
   ```

4. That's it! The app will automatically detect and use it.

#### Method B: Using Environment Variables (More Secure for Production)

1. Open the downloaded JSON file in a text editor
2. Find these values:
   - `project_id`
   - `client_email`
   - `private_key`

3. Create a `.env` file in your project root:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file and add:
   ```
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-email@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour key here\n-----END PRIVATE KEY-----\n"
   ```

   **Important**: The private key must be in quotes and keep the `\n` characters!

### Step 6: Configure Security Rules (Production)

For production apps, you should set up proper security rules.

1. In Firebase Console, go to **Firestore Database**
2. Click the **Rules** tab
3. You'll see the current rules

**For Development** (Test Mode):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2024, 12, 31);
    }
  }
}
```

**For Production** (Secure):
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only authenticated users can read/write
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
    
    // Or make all data public for read, but restrict writes
    match /{document=**} {
      allow read: if true;
      allow write: if false; // Only server can write
    }
  }
}
```

4. Click **Publish** to save your rules

### Step 7: Verify Connection

1. Start your application:
   ```bash
   npm start
   ```

2. Check the terminal output:
   ```
   ✅ Firebase Firestore initialized successfully
   🚀 Production Hall server running on http://localhost:3000
   ```

3. If you see errors, check:
   - Is `serviceAccountKey.json` in the right location?
   - Is the file valid JSON?
   - Did you enable Firestore in Firebase Console?

## Understanding Your Firestore Database

### Collections

Your app will create these collections automatically:

1. **consumables** - Stores consumable items
2. **primaryProducts** - Stores primary products
3. **secondaryProducts** - Stores secondary products (with primary product references)
4. **tertiaryProducts** - Stores tertiary products (with secondary product references)

### Viewing Your Data

1. Go to Firebase Console → Firestore Database
2. Click the **Data** tab
3. You'll see your collections and documents
4. Click on any document to view/edit its data

### Monitoring Usage

1. Go to Firebase Console → Firestore Database
2. Click the **Usage** tab
3. Monitor:
   - Document reads/writes
   - Storage used
   - Network bandwidth

### Free Tier Limits

Firebase offers a generous free tier:
- **Storage**: 1 GB
- **Document Reads**: 50,000 per day
- **Document Writes**: 20,000 per day
- **Document Deletes**: 20,000 per day
- **Network Egress**: 10 GB per month

This is more than enough for most small to medium applications!

## Troubleshooting

### Error: "Error initializing Firebase"

**Cause**: Can't find or read serviceAccountKey.json

**Solution**:
1. Check file location: `production-hall/config/serviceAccountKey.json`
2. Verify file name is exactly: `serviceAccountKey.json`
3. Check file is valid JSON (open in text editor)

### Error: "Permission denied"

**Cause**: Firestore security rules are blocking access

**Solution**:
1. Go to Firestore → Rules
2. Set to test mode temporarily:
   ```javascript
   allow read, write: if true;
   ```
3. Remember to secure for production!

### Error: "Project not found"

**Cause**: Wrong project ID in credentials

**Solution**:
1. Check project ID in Firebase Console (Project Settings)
2. Verify it matches the one in your serviceAccountKey.json

### Error: "Quota exceeded"

**Cause**: Exceeded free tier limits

**Solution**:
1. Check usage in Firebase Console
2. Optimize queries to reduce reads
3. Consider upgrading to paid plan if needed

## Best Practices

### Security
- ✅ Never commit `serviceAccountKey.json` to version control
- ✅ Add it to `.gitignore`
- ✅ Use environment variables for production
- ✅ Set up proper security rules
- ✅ Rotate keys periodically

### Performance
- ✅ Index frequently queried fields
- ✅ Minimize document reads
- ✅ Use batch operations when possible
- ✅ Cache data when appropriate

### Cost Optimization
- ✅ Monitor your usage regularly
- ✅ Delete unused data
- ✅ Use pagination for large datasets
- ✅ Implement caching strategies

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Quickstart](https://firebase.google.com/docs/firestore/quickstart)
- [Security Rules Guide](https://firebase.google.com/docs/firestore/security/get-started)
- [Pricing Information](https://firebase.google.com/pricing)

## Support

If you encounter issues:
1. Check the Firebase Console for errors
2. Review this guide step by step
3. Check Firebase Status: [status.firebase.google.com](https://status.firebase.google.com/)
4. Search Firebase documentation
5. Check Stack Overflow for similar issues

---

**You're all set! Your Firestore database is ready to power Production Hall! 🚀**
