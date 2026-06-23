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
const { db } = require("./config/firebase");

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
const workersRoutes = require("./routes/workers");
const statisticsRoutes = require("./routes/statistics");
const workflowsRoutes = require("./routes/workflows");
const productionDayRoutes = require("./routes/productionDay");
const invoicesRoutes = require("./routes/invoices");
const costsRoutes = require("./routes/costs");
const clientsRoutes = require("./routes/clients");
const bridgesRoutes = require("./routes/bridges");

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
app.use("/workers", workersRoutes);
app.use("/statistics", statisticsRoutes);
app.use("/workflows", workflowsRoutes);
app.use("/production-day", productionDayRoutes);
app.use("/invoices", invoicesRoutes);
app.use("/costs", costsRoutes);
app.use("/clients", clientsRoutes);
app.use("/bridges", bridgesRoutes);

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
