// const express = require("express");
// const router = express.Router();
// const Consumable = require("../models/consumable");
// const ActivityLog = require("../models/activityLog");

// router.get("/", async (req, res) => {
//   try {
//     const consumables = await Consumable.getAll();
//     res.render("consumables", {
//       title: "Consumables",
//       consumables,
//       error: req.query.error || null,
//       success: req.query.success || null,
//     });
//   } catch (error) {
//     res.render("consumables", {
//       title: "Consumables",
//       consumables: [],
//       error: error.message,
//       success: null,
//     });
//   }
// });

// router.post("/", async (req, res) => {
//   try {
//     const { name, quantity } = req.body;
//     const errors = Consumable.validate({
//       name,
//       quantity: parseFloat(quantity),
//     });
//     if (errors.length > 0) {
//       const consumables = await Consumable.getAll();
//       return res.render("consumables", {
//         title: "Consumables",
//         consumables,
//         error: errors.join(", "),
//         success: null,
//       });
//     }
//     await Consumable.create({ name, quantity: parseFloat(quantity) });
//     await ActivityLog.log({
//       action: "Consumable Created",
//       itemName: name,
//       itemType: "Consumable",
//       quantity: parseFloat(quantity),
//     });
//     res.redirect("/consumables?success=Consumable added successfully");
//   } catch (error) {
//     const consumables = await Consumable.getAll();
//     res.render("consumables", {
//       title: "Consumables",
//       consumables,
//       error: error.message,
//       success: null,
//     });
//   }
// });

// router.post("/:id/adjust", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { action, amount } = req.body;
//     const parsedAmount = parseFloat(amount);
//     if (isNaN(parsedAmount) || parsedAmount <= 0) {
//       return res.redirect("/consumables?error=Invalid amount");
//     }
//     const item = await Consumable.getById(id);
//     if (!item) return res.redirect("/consumables?error=Consumable not found");
//     let newQty;
//     if (action === "subtract") {
//       newQty = parseFloat(item.quantity) - parsedAmount;
//       if (newQty < 0)
//         return res.redirect("/consumables?error=Quantity cannot go below zero");
//     } else {
//       newQty = parseFloat(item.quantity) + parsedAmount;
//     }
//     await Consumable.update(id, { name: item.name, quantity: newQty });
//     const actionLabel = action === "subtract" ? "Subtracted" : "Added";
//     await ActivityLog.log({
//       action: `Consumable ${actionLabel}`,
//       itemName: item.name,
//       itemType: "Consumable",
//       quantity: parsedAmount,
//     });
//     res.redirect("/consumables?success=Quantity updated successfully");
//   } catch (error) {
//     res.redirect("/consumables?error=" + encodeURIComponent(error.message));
//   }
// });

// router.put("/:id", async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, quantity } = req.body;
//     const errors = Consumable.validate({
//       name,
//       quantity: parseFloat(quantity),
//     });
//     if (errors.length > 0)
//       return res.status(400).json({ error: errors.join(", ") });
//     await Consumable.update(id, { name, quantity: parseFloat(quantity) });
//     await ActivityLog.log({
//       action: "Consumable Updated",
//       itemName: name,
//       itemType: "Consumable",
//       quantity: parseFloat(quantity),
//     });
//     res.redirect("/consumables?success=Consumable updated successfully");
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// router.delete("/:id", async (req, res) => {
//   try {
//     const item = await Consumable.getById(req.params.id);
//     await Consumable.delete(req.params.id);
//     if (item)
//       await ActivityLog.log({
//         action: "Consumable Deleted",
//         itemName: item.name,
//         itemType: "Consumable",
//       });
//     res.redirect("/consumables?success=Consumable deleted successfully");
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// router.get("/:id", async (req, res) => {
//   try {
//     const consumable = await Consumable.getById(req.params.id);
//     if (!consumable)
//       return res.status(404).json({ error: "Consumable not found" });
//     res.json(consumable);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// module.exports = router;

const express = require("express");
const router = express.Router();
const Consumable = require("../models/consumable");
const ActivityLog = require("../models/activityLog");

router.get("/", async (req, res) => {
  try {
    const consumables = await Consumable.getAll();
    res.render("consumables", {
      title: "Consumables",
      consumables,
      error: req.query.error || null,
      success: req.query.success || null,
    });
  } catch (error) {
    res.render("consumables", {
      title: "Consumables",
      consumables: [],
      error: error.message,
      success: null,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { name, quantity } = req.body;
    const errors = Consumable.validate({
      name,
      quantity: parseFloat(quantity),
    });
    if (errors.length > 0) {
      const consumables = await Consumable.getAll();
      return res.render("consumables", {
        title: "Consumables",
        consumables,
        error: errors.join(", "),
        success: null,
      });
    }
    await Consumable.create({ name, quantity: parseFloat(quantity) });
    await ActivityLog.log({
      action: "Consumable Created",
      itemName: name,
      itemType: "Consumable",
      quantity: parseFloat(quantity),
    });
    res.redirect("/consumables?success=Consumable added successfully");
  } catch (error) {
    const consumables = await Consumable.getAll();
    res.render("consumables", {
      title: "Consumables",
      consumables,
      error: error.message,
      success: null,
    });
  }
});

router.post("/:id/adjust", async (req, res) => {
  try {
    const { id } = req.params;
    const { action, amount } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.redirect("/consumables?error=Invalid amount");
    }
    const item = await Consumable.getById(id);
    if (!item) return res.redirect("/consumables?error=Consumable not found");
    let newQty;
    if (action === "subtract") {
      newQty = parseFloat(item.quantity) - parsedAmount;
      if (newQty < 0)
        return res.redirect("/consumables?error=Quantity cannot go below zero");
    } else {
      newQty = parseFloat(item.quantity) + parsedAmount;
    }
    await Consumable.update(id, { name: item.name, quantity: newQty });
    const actionLabel = action === "subtract" ? "Subtracted" : "Added";
    await ActivityLog.log({
      action: `Consumable ${actionLabel}`,
      itemName: item.name,
      itemType: "Consumable",
      quantity: parsedAmount,
    });
    res.redirect("/consumables?success=Quantity updated successfully");
  } catch (error) {
    res.redirect("/consumables?error=" + encodeURIComponent(error.message));
  }
});

router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, quantity } = req.body;
    const errors = Consumable.validate({
      name,
      quantity: parseFloat(quantity),
    });
    if (errors.length > 0)
      return res.status(400).json({ error: errors.join(", ") });
    await Consumable.update(id, { name, quantity: parseFloat(quantity) });
    await ActivityLog.log({
      action: "Consumable Updated",
      itemName: name,
      itemType: "Consumable",
      quantity: parseFloat(quantity),
    });
    res.redirect("/consumables?success=Consumable updated successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const item = await Consumable.getById(req.params.id);
    await Consumable.delete(req.params.id);
    if (item)
      await ActivityLog.log({
        action: "Consumable Deleted",
        itemName: item.name,
        itemType: "Consumable",
      });
    res.redirect("/consumables?success=Consumable deleted successfully");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const consumable = await Consumable.getById(req.params.id);
    if (!consumable)
      return res.status(404).json({ error: "Consumable not found" });
    res.json(consumable);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
