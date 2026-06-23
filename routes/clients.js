const express = require("express");
const router = express.Router();
const Client = require("../models/client");

// List + manage clients
router.get("/", async (req, res) => {
  try {
    const clients = await Client.getAll();
    res.render("clients", {
      title: "Clients",
      clients,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("clients", {
      title: "Clients",
      clients: [],
      error: error.message,
      success: null,
    });
  }
});

// JSON list (used by the invoice maker)
router.get("/list", async (req, res) => {
  try {
    res.json(await Client.getAll());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    await Client.create(req.body);
    res.redirect("/clients?success=Client saved");
  } catch (error) {
    res.redirect("/clients?error=" + encodeURIComponent(error.message));
  }
});

router.put("/:id", async (req, res) => {
  try {
    await Client.update(req.params.id, req.body);
    res.redirect("/clients?success=Client updated");
  } catch (error) {
    res.redirect("/clients?error=" + encodeURIComponent(error.message));
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Client.delete(req.params.id);
    res.redirect("/clients?success=Client deleted");
  } catch (error) {
    res.redirect("/clients?error=" + encodeURIComponent(error.message));
  }
});

module.exports = router;
