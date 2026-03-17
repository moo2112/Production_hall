# Production Hall - System Architecture

## Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT (Browser)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           EJS Templates + Bootstrap 5 UI             │  │
│  │  - index.ejs (Home)                                  │  │
│  │  - consumables.ejs                                   │  │
│  │  - primary.ejs, secondary.ejs, tertiary.ejs         │  │
│  └────────────────────┬─────────────────────────────────┘  │
└────────────────────────┼────────────────────────────────────┘
                         │ HTTP Requests
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   app.js (Main)                      │  │
│  │  - Middleware (body-parser, method-override)         │  │
│  │  - View Engine (EJS)                                 │  │
│  │  - Static Files (CSS, JS)                            │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              ROUTES LAYER                            │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │consumables │  │  primary   │  │ secondary  │     │  │
│  │  │  routes    │  │   routes   │  │   routes   │     │  │
│  │  └────────────┘  └────────────┘  └────────────┘     │  │
│  │                     ┌────────────┐                    │  │
│  │                     │  tertiary  │                    │  │
│  │                     │   routes   │                    │  │
│  │                     └────────────┘                    │  │
│  └────────────────────┬─────────────────────────────────┘  │
│                       │                                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              MODELS LAYER                            │  │
│  │  ┌──────────────┐  ┌──────────────┐                  │  │
│  │  │  Consumable  │  │    Primary   │                  │  │
│  │  │    Model     │  │    Product   │                  │  │
│  │  └──────────────┘  └──────────────┘                  │  │
│  │  ┌──────────────┐  ┌──────────────┐                  │  │
│  │  │  Secondary   │  │   Tertiary   │                  │  │
│  │  │   Product    │  │    Product   │                  │  │
│  │  └──────────────┘  └──────────────┘                  │  │
│  │       │                 │                             │  │
│  │       └────────┬────────┘                             │  │
│  │                │                                       │  │
│  │  ┌─────────────▼────────────────────────────────┐    │  │
│  │  │       Firebase Configuration                 │    │  │
│  │  │  - firebase.js                               │    │  │
│  │  │  - Service Account Authentication            │    │  │
│  │  └──────────────────────────────────────────────┘    │  │
│  └────────────────────┬─────────────────────────────────┘  │
└────────────────────────┼────────────────────────────────────┘
                         │ Firebase Admin SDK
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  FIREBASE FIRESTORE                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  COLLECTIONS                         │  │
│  │                                                       │  │
│  │  📦 consumables/                                     │  │
│  │     └── {id} → { name, quantity, ... }              │  │
│  │                                                       │  │
│  │  🔧 primaryProducts/                                 │  │
│  │     └── {id} → { name, description, quantity, ... } │  │
│  │                                                       │  │
│  │  🔨 secondaryProducts/                               │  │
│  │     └── {id} → { name, components: [...], ... }     │  │
│  │                      ↓ (references)                  │  │
│  │                  primaryProducts                      │  │
│  │                                                       │  │
│  │  🏭 tertiaryProducts/                                │  │
│  │     └── {id} → { name, components: [...], ... }     │  │
│  │                      ↓ (references)                  │  │
│  │                secondaryProducts                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Creating a Tertiary Product (Example Flow)

```
1. USER ACTION
   │
   ├─→ Clicks "Add Product" on Tertiary Products page
   │
2. FRONTEND
   │
   ├─→ Modal opens with form
   ├─→ Loads available Secondary Products as checkboxes
   ├─→ User fills: name, description, quantity
   ├─→ User selects components (Secondary Products)
   ├─→ User clicks "Save"
   │
3. ROUTES LAYER
   │
   ├─→ POST /tertiary
   ├─→ Extracts form data
   ├─→ Validates component selection
   │
4. MODELS LAYER
   │
   ├─→ TertiaryProduct.validate() checks:
   │   • Name is not empty
   │   • At least one component selected
   │   • Quantity is valid
   │
   ├─→ TertiaryProduct.create() builds document:
   │   {
   │     name: "Complete Laptop",
   │     description: "Final assembled product",
   │     quantity: 10,
   │     components: ["secondaryId1", "secondaryId2"],
   │     createdAt: Timestamp,
   │     updatedAt: Timestamp
   │   }
   │
5. FIREBASE CONFIG
   │
   ├─→ firebase.js establishes connection
   ├─→ Uses serviceAccountKey.json credentials
   │
6. FIRESTORE
   │
   ├─→ Adds document to tertiaryProducts collection
   ├─→ Auto-generates document ID
   ├─→ Returns success
   │
7. RESPONSE
   │
   ├─→ Redirect to /tertiary?success=...
   ├─→ Page reloads with success message
   └─→ New product appears in table
```

## Hierarchical Relationships

```
CONSUMABLES
    ↓ (raw materials)
    
PRIMARY PRODUCTS
    ↓ (components)
    
SECONDARY PRODUCTS
    ↓ (components)
    
TERTIARY PRODUCTS
    (final products)
```

### Example Hierarchy

```
📦 Consumables
├─ Steel (100 kg)
├─ Plastic (50 kg)
└─ Screws (1000 units)

🔧 Primary Products
├─ Metal Frame [uses: Steel]
├─ Plastic Casing [uses: Plastic]
└─ Circuit Board [uses: various consumables]

🔨 Secondary Products
├─ Laptop Base [components: Metal Frame, Plastic Casing]
├─ Screen Assembly [components: Circuit Board, Plastic Casing]
└─ Keyboard Unit [components: Plastic Casing, Circuit Board]

🏭 Tertiary Products
└─ Complete Laptop [components: Laptop Base, Screen Assembly, Keyboard Unit]
```

## CRUD Operations Flow

### CREATE
```
User Form → Validation → Model.create() → Firestore.add() → Success
```

### READ
```
Page Load → Model.getAll() → Firestore.get() → Render Table
```

### UPDATE
```
Edit Button → Fetch Data → Show Modal → Submit → Model.update() → Firestore.update()
```

### DELETE
```
Delete Button → Confirm → Check References → Model.delete() → Firestore.delete()
                              ↓ (if used in components)
                           Error: Cannot delete
```

## Security Flow

```
Client Request
    ↓
Express Middleware
    ↓
Form Validation
    ↓
Model Validation
    ↓
Firestore Security Rules
    ↓
Database Operation
```

## File Organization

```
production-hall/
├── app.js                    # Entry point, Express setup
├── package.json              # Dependencies
│
├── config/
│   ├── firebase.js           # Firebase initialization
│   └── serviceAccountKey.json # Credentials (gitignored)
│
├── models/                   # Data layer
│   ├── consumable.js         # Consumable CRUD
│   ├── primaryProduct.js     # Primary Product CRUD
│   ├── secondaryProduct.js   # Secondary Product CRUD + relationships
│   └── tertiaryProduct.js    # Tertiary Product CRUD + relationships
│
├── routes/                   # API endpoints
│   ├── consumables.js        # /consumables routes
│   ├── primary.js            # /primary routes
│   ├── secondary.js          # /secondary routes
│   └── tertiary.js           # /tertiary routes
│
├── views/                    # Frontend templates
│   ├── partials/
│   │   ├── header.ejs        # Navbar, head tags
│   │   └── footer.ejs        # Footer, scripts
│   ├── index.ejs             # Home page
│   ├── consumables.ejs       # Consumables management
│   ├── primary.ejs           # Primary products
│   ├── secondary.ejs         # Secondary products
│   ├── tertiary.ejs          # Tertiary products
│   └── error.ejs             # Error pages
│
└── public/                   # Static assets
    ├── css/
    │   └── style.css         # Custom styles
    └── js/
        └── main.js           # Client-side JavaScript
```

## Technology Stack Details

### Backend
- **Node.js**: JavaScript runtime
- **Express.js**: Web framework
- **Firebase Admin SDK**: Firestore connection
- **body-parser**: Parse request bodies
- **method-override**: Support PUT/DELETE in forms
- **dotenv**: Environment variables

### Frontend
- **EJS**: Templating engine
- **Bootstrap 5**: UI framework
- **Bootstrap Icons**: Icon library
- **Vanilla JavaScript**: Client-side logic

### Database
- **Firebase Firestore**: NoSQL cloud database
- **Collections**: consumables, primaryProducts, secondaryProducts, tertiaryProducts

## Component Interaction

```
┌──────────────────────────────────────────────────────┐
│              User Interface (Browser)                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │  Home Page │→ │Consumables │  │  Products  │    │
│  └────────────┘  └────────────┘  └─────┬──────┘    │
│                                          │           │
│                    ┌────────────────────┼─────┐     │
│                    │                    │     │     │
│              ┌─────▼─────┐      ┌──────▼──┐  │     │
│              │  Primary  │      │Secondary│  │     │
│              │  Products │─────→│Products │  │     │
│              └───────────┘      └────┬────┘  │     │
│                                      │       │     │
│                                ┌─────▼─────┐ │     │
│                                │ Tertiary  │ │     │
│                                │ Products  │◄┘     │
│                                └───────────┘       │
└──────────────────────────────────────────────────────┘
```

This architecture ensures:
- ✅ Clean separation of concerns
- ✅ Scalable structure
- ✅ Maintainable codebase
- ✅ Secure data handling
- ✅ Efficient database operations
