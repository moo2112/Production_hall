# Quick Start Guide - Production Hall

## Fastest Way to Get Started

### 1. Install Dependencies (30 seconds)
```bash
cd production-hall
npm install
```

### 2. Set Up Firebase Firestore (5 minutes)

#### Option A: Using Service Account Key (Recommended)
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Enable Firestore Database
4. Go to Project Settings → Service Accounts
5. Click "Generate New Private Key"
6. Download the JSON file
7. Rename it to `serviceAccountKey.json`
8. Move it to `production-hall/config/serviceAccountKey.json`

#### Option B: Using Environment Variables
1. Copy `.env.example` to `.env`
2. Add your Firebase credentials to `.env`

### 3. Run the Application (10 seconds)
```bash
npm start
```

### 4. Open in Browser
Navigate to: `http://localhost:3000`

## That's It! 🎉

You should now see the Production Hall home page with two options:
- **Consumables**: For managing raw materials
- **Products**: For managing hierarchical products

## First Steps in the App

1. **Start with Consumables**
   - Click "Consumables"
   - Add some raw materials (e.g., "Steel", "Plastic")

2. **Create Primary Products**
   - Click "Products"
   - Add base products (e.g., "Metal Frame", "Plastic Casing")

3. **Build Secondary Products**
   - Click "Go to Secondary Products"
   - Create products using Primary Products as components
   - Example: "Laptop Base" using "Metal Frame" + "Plastic Casing"

4. **Assemble Tertiary Products**
   - Click "Go to Tertiary Products"
   - Create final products using Secondary Products
   - Example: "Complete Laptop" using "Laptop Base" + other components

## Common Issues

### "Error initializing Firebase"
→ Check that `serviceAccountKey.json` is in the `config/` folder

### "Port 3000 already in use"
→ Change PORT in `.env` file or stop other apps using port 3000

### "Cannot find module"
→ Run `npm install` again

## Need Help?
Check the full README.md for detailed documentation!
