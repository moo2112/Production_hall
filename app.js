// const express = require('express');
// const bodyParser = require('body-parser');
// const methodOverride = require('method-override');
// const path = require('path');
// require('dotenv').config();

// const app = express();
// const PORT = process.env.PORT || 3000;

// // Middleware
// app.use(bodyParser.urlencoded({ extended: true }));
// app.use(bodyParser.json());
// app.use(methodOverride('_method'));
// app.use(express.static(path.join(__dirname, 'public')));

// // View engine setup
// app.set('view engine', 'ejs');
// app.set('views', path.join(__dirname, 'views'));

// // Import routes
// const consumablesRoutes  = require('./routes/consumables');
// const primaryRoutes      = require('./routes/primary');
// const secondaryRoutes    = require('./routes/secondary');
// const tertiaryRoutes     = require('./routes/tertiary');
// const batchRoutes        = require('./routes/batch');
// const formBuilderRoutes  = require('./routes/formBuilder');
// const timelineRoutes     = require('./routes/timeline');

// // Home route
// app.get('/', (req, res) => {
//   res.render('index', { title: 'Production Hall' });
// });

// // Use routes
// app.use('/consumables',  consumablesRoutes);
// app.use('/primary',      primaryRoutes);
// app.use('/secondary',    secondaryRoutes);
// app.use('/tertiary',     tertiaryRoutes);
// app.use('/batch',        batchRoutes);
// app.use('/form-builder', formBuilderRoutes);
// app.use('/timeline',     timelineRoutes);

// // Error handling middleware
// app.use((req, res) => {
//   res.status(404).render('error', { title: 'Page Not Found', message: 'The page you are looking for does not exist.' });
// });

// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).render('error', { title: 'Server Error', message: 'Something went wrong on the server.' });
// });

// // Start server
// app.listen(PORT, () => {
//   console.log(`🚀 Production Hall server running on http://localhost:${PORT}`);
//   console.log(`📊 Firebase Firestore connected successfully`);
// });

// module.exports = app;

const express = require("express");
const bodyParser = require("body-parser");
const methodOverride = require("method-override");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Firebase health check ─────────────────────────────────────────────────────
// If Firebase failed to init, show a clear error instead of a silent reload
const { db } = require("./config/firebase");
if (!db) {
  app.use((req, res) => {
    res.status(500).send(`
      <h2 style="font-family:sans-serif;color:red">Firebase Not Configured</h2>
      <p style="font-family:sans-serif">
        Cannot connect to Firestore. Set these environment variables in Vercel dashboard:<br><br>
        <b>FIREBASE_PROJECT_ID</b><br>
        <b>FIREBASE_CLIENT_EMAIL</b><br>
        <b>FIREBASE_PRIVATE_KEY</b>
      </p>
    `);
  });
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

// ── View engine ───────────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Routes ────────────────────────────────────────────────────────────────────
const consumablesRoutes = require("./routes/consumables");
const primaryRoutes = require("./routes/primary");
const secondaryRoutes = require("./routes/secondary");
const tertiaryRoutes = require("./routes/tertiary");
const batchRoutes = require("./routes/batch");
const formBuilderRoutes = require("./routes/formBuilder");
const timelineRoutes = require("./routes/timeline");

app.get("/", (req, res) => {
  res.render("index", { title: "Production Hall" });
});

app.use("/consumables", consumablesRoutes);
app.use("/primary", primaryRoutes);
app.use("/secondary", secondaryRoutes);
app.use("/tertiary", tertiaryRoutes);
app.use("/batch", batchRoutes);
app.use("/form-builder", formBuilderRoutes);
app.use("/timeline", timelineRoutes);

// ── Error handlers ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render("error", {
    title: "Page Not Found",
    message: "The page you are looking for does not exist.",
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render("error", {
    title: "Server Error",
    message: "Something went wrong on the server.",
  });
});

// ── Start server (local only — Vercel handles this itself) ────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Production Hall running on http://localhost:${PORT}`);
  });
}

// Required for Vercel serverless deployment
module.exports = app;
