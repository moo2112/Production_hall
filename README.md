# Production Hall

A comprehensive multi-level production item management system built with Node.js, Express, and Firebase Firestore.

## Overview

Production Hall is a web application designed to manage production items across multiple hierarchical levels:

- **Consumables**: Raw materials and supplies
- **Primary Products**: Base-level products
- **Secondary Products**: Products built from primary product components
- **Tertiary Products**: Final-level products built from secondary product components

## Features

✅ **Full CRUD Operations**: Create, Read, Update, Delete for all entities  
✅ **Hierarchical Product Relationships**: Link products across three production levels  
✅ **Component Selection**: Build complex products from simpler components  
✅ **Real-time Data**: Powered by Firebase Firestore  
✅ **Modern UI**: Clean, responsive Bootstrap 5 interface  
✅ **Form Validation**: Client and server-side validation  
✅ **Relationship Protection**: Prevents deletion of products used as components  

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: Firebase Firestore
- **Frontend**: EJS templating, Bootstrap 5
- **Icons**: Bootstrap Icons
- **Middleware**: body-parser, method-override

## Project Structure

```
production-hall/
├── config/
│   ├── firebase.js              # Firebase configuration
│   └── serviceAccountKey.json   # Firebase credentials (you need to add this)
├── models/
│   ├── consumable.js            # Consumable data model
│   ├── primaryProduct.js        # Primary product model
│   ├── secondaryProduct.js      # Secondary product model
│   └── tertiaryProduct.js       # Tertiary product model
├── routes/
│   ├── consumables.js           # Consumables routes
│   ├── primary.js               # Primary products routes
│   ├── secondary.js             # Secondary products routes
│   └── tertiary.js              # Tertiary products routes
├── views/
│   ├── partials/
│   │   ├── header.ejs           # Header template
│   │   └── footer.ejs           # Footer template
│   ├── index.ejs                # Home page
│   ├── consumables.ejs          # Consumables page
│   ├── primary.ejs              # Primary products page
│   ├── secondary.ejs            # Secondary products page
│   ├── tertiary.ejs             # Tertiary products page
│   └── error.ejs                # Error page
├── public/
│   ├── css/
│   │   └── style.css            # Custom styles
│   └── js/
│       └── main.js              # Client-side JavaScript
├── app.js                       # Main application file
├── package.json                 # Project dependencies
├── .env.example                 # Environment variables template
└── README.md                    # This file
```

## Installation & Setup

### Prerequisites

- Node.js (v14 or higher)
- npm (Node Package Manager)
- Firebase account with Firestore enabled

### Step 1: Clone or Download the Project

```bash
# If you have the project as a zip file, extract it
# Or if you're cloning from a repository:
git clone <repository-url>
cd production-hall
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages:
- express
- ejs
- firebase-admin
- body-parser
- express-validator
- dotenv
- method-override

### Step 3: Set Up Firebase Firestore

#### A. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add Project" or select an existing project
3. Follow the setup wizard to create your project

#### B. Enable Firestore Database

1. In your Firebase project, navigate to **Firestore Database**
2. Click **Create Database**
3. Choose **Production mode** or **Test mode** (for development)
4. Select a location for your database

#### C. Get Service Account Credentials

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Navigate to the **Service Accounts** tab
3. Click **Generate New Private Key**
4. Download the JSON file
5. Rename it to `serviceAccountKey.json`
6. **IMPORTANT**: Move it to the `config/` folder in your project:
   ```
   production-hall/config/serviceAccountKey.json
   ```

**Security Warning**: Never commit `serviceAccountKey.json` to version control!

#### D. Alternative: Use Environment Variables

Instead of using `serviceAccountKey.json`, you can use environment variables:

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Firebase credentials:
   ```
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-client-email@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour private key here\n-----END PRIVATE KEY-----\n"
   ```

You can find these values in the downloaded `serviceAccountKey.json` file.

### Step 4: Configure Firestore Security Rules (Optional)

For production, configure Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true; // Change this for production!
    }
  }
}
```

### Step 5: Run the Application

#### Development Mode (with auto-restart):

```bash
npm run dev
```

#### Production Mode:

```bash
npm start
```

The application will start on `http://localhost:3000`

## Usage Guide

### Home Page

When you open the application, you'll see two main options:
- **Consumables**: Manage raw materials and supplies
- **Products**: Manage hierarchical product levels

### Managing Consumables

1. Click on **Consumables**
2. Click **New Item** to add a consumable
3. Enter the name and quantity
4. Click **Save Consumable**
5. Edit or delete consumables using the action buttons

### Managing Primary Products

1. Click on **Products** (or navigate to Primary Products)
2. Click **Add Product**
3. Enter product details (name, description, quantity)
4. Click **Save Product**
5. Navigate to **Secondary Products** using the button at the bottom

### Managing Secondary Products

1. From Primary Products, click **Go to Secondary Products**
2. Click **Add Product**
3. Enter product details
4. **Select components** from the list of Primary Products (at least one required)
5. Click **Save Product**
6. Navigate to **Tertiary Products** using the button at the bottom

### Managing Tertiary Products

1. From Secondary Products, click **Go to Tertiary Products**
2. Click **Add Product**
3. Enter product details
4. **Select components** from the list of Secondary Products (at least one required)
5. Click **Save Product**

### Important Notes

- **Relationships are protected**: You cannot delete a product if it's used as a component in higher-level products
- **Validation is enforced**: All required fields must be filled before saving
- **Components are required**: Secondary and Tertiary products must have at least one component

## Firestore Database Structure

The application creates the following collections in Firestore:

### consumables
```javascript
{
  name: "String",
  quantity: Number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### primaryProducts
```javascript
{
  name: "String",
  description: "String",
  quantity: Number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### secondaryProducts
```javascript
{
  name: "String",
  description: "String",
  quantity: Number,
  components: ["primaryProductId1", "primaryProductId2"],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### tertiaryProducts
```javascript
{
  name: "String",
  description: "String",
  quantity: Number,
  components: ["secondaryProductId1", "secondaryProductId2"],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

## API Endpoints

### Consumables
- `GET /consumables` - List all consumables
- `POST /consumables` - Create new consumable
- `GET /consumables/:id` - Get single consumable
- `PUT /consumables/:id` - Update consumable
- `DELETE /consumables/:id` - Delete consumable

### Primary Products
- `GET /primary` - List all primary products
- `POST /primary` - Create new primary product
- `GET /primary/:id` - Get single primary product
- `PUT /primary/:id` - Update primary product
- `DELETE /primary/:id` - Delete primary product

### Secondary Products
- `GET /secondary` - List all secondary products
- `POST /secondary` - Create new secondary product
- `GET /secondary/:id` - Get single secondary product
- `PUT /secondary/:id` - Update secondary product
- `DELETE /secondary/:id` - Delete secondary product

### Tertiary Products
- `GET /tertiary` - List all tertiary products
- `POST /tertiary` - Create new tertiary product
- `GET /tertiary/:id` - Get single tertiary product
- `PUT /tertiary/:id` - Update tertiary product
- `DELETE /tertiary/:id` - Delete tertiary product

## Troubleshooting

### Firebase Connection Issues

**Problem**: "Error initializing Firebase"

**Solutions**:
1. Verify `serviceAccountKey.json` is in the `config/` folder
2. Check that the JSON file is valid
3. Ensure your Firebase project has Firestore enabled
4. Try using environment variables instead

### Port Already in Use

**Problem**: "Port 3000 is already in use"

**Solution**: Change the port in `.env`:
```
PORT=3001
```

### Missing Dependencies

**Problem**: Module not found errors

**Solution**: Reinstall dependencies:
```bash
rm -rf node_modules package-lock.json
npm install
```

## Future Enhancements

Possible improvements for the application:

- [ ] User authentication and authorization
- [ ] Batch operations (bulk import/export)
- [ ] Advanced search and filtering
- [ ] Inventory alerts and notifications
- [ ] Production planning and scheduling
- [ ] Reporting and analytics dashboard
- [ ] PDF export for reports
- [ ] Multi-language support
- [ ] Mobile app version
- [ ] REST API documentation with Swagger

## Security Considerations

For production deployment:

1. **Never commit** `serviceAccountKey.json` to version control
2. Add to `.gitignore`:
   ```
   config/serviceAccountKey.json
   .env
   node_modules/
   ```
3. Use environment variables for sensitive data
4. Implement proper Firestore security rules
5. Add user authentication
6. Use HTTPS in production
7. Implement rate limiting
8. Add input sanitization

## Contributing

To contribute to this project:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For issues or questions:
- Check the troubleshooting section
- Review Firebase Firestore documentation
- Check Node.js and Express.js documentation

## Author

Created for managing multi-level production systems with hierarchical product relationships.

---

**Happy Production Management! 🏭**
