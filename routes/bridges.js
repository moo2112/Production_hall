const express = require("express");
const router = express.Router();
const Bridge = require("../models/bridge");
const TertiaryProduct = require("../models/tertiaryProduct");

function parseJson(str, fb) {
  try {
    return JSON.parse(str);
  } catch {
    return fb;
  }
}

router.get("/", async (req, res) => {
  try {
    const [bridges, tertiary] = await Promise.all([
      Bridge.getAll(),
      TertiaryProduct.getAll().catch(() => []),
    ]);
    res.render("bridges", {
      title: "Bridges",
      bridges,
      tertiaryProducts: tertiary,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("bridges", {
      title: "Bridges",
      bridges: [],
      tertiaryProducts: [],
      error: error.message,
      success: null,
    });
  }
});

// JSON list (used by the invoice maker)
router.get("/list", async (req, res) => {
  try {
    res.json(await Bridge.getAll());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    await Bridge.create({
      name: req.body.name,
      note: req.body.note,
      items: parseJson(req.body.itemsJson, []),
    });
    res.redirect("/bridges?success=Bridge saved");
  } catch (error) {
    res.redirect("/bridges?error=" + encodeURIComponent(error.message));
  }
});

router.put("/:id", async (req, res) => {
  try {
    await Bridge.update(req.params.id, {
      name: req.body.name,
      note: req.body.note,
      items: parseJson(req.body.itemsJson, []),
    });
    res.redirect("/bridges?success=Bridge updated");
  } catch (error) {
    res.redirect("/bridges?error=" + encodeURIComponent(error.message));
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await Bridge.delete(req.params.id);
    res.redirect("/bridges?success=Bridge deleted");
  } catch (error) {
    res.redirect("/bridges?error=" + encodeURIComponent(error.message));
  }
});

module.exports = router;
