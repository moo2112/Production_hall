const { db } = require("../config/firebase");

/**
 * Invoice model
 * ─────────────────────────────────────────────────────────────────────────────
 * Customer invoices for selling (typically) tertiary products. A pending invoice
 * represents an order that still needs to be prepared, so the Production-Day
 * planner surfaces pending invoices as "prepare this order" tasks.
 *
 * Document shape (collection `invoices`):
 *   {
 *     invoiceNumber, customer:{ name, phone, email, address },
 *     items:[{ productId, productName, quantity, unitPrice, lineTotal }],
 *     subtotal, taxRate, taxAmount, total,
 *     notes, date, dueDate,
 *     status: 'pending'|'prepared'|'paid',
 *     createdAt, updatedAt
 *   }
 * ─────────────────────────────────────────────────────────────────────────────
 */

function num(v, f = 0) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : f;
}
function round2(v) {
  return Math.round((num(v) + Number.EPSILON) * 100) / 100;
}

class Invoice {
  static collectionName = "invoices";

  /** Generate the next sequential invoice number like INV-0001. */
  static async nextNumber() {
    try {
      const snap = await db.collection(this.collectionName).get();
      let max = 0;
      snap.docs.forEach((d) => {
        const m = String(d.data().invoiceNumber || "").match(/(\d+)\s*$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      });
      return "INV-" + String(max + 1).padStart(4, "0");
    } catch (e) {
      // Fallback to a timestamp-based number if the count query fails.
      return "INV-" + Date.now().toString().slice(-6);
    }
  }

  /** Compute item line totals + subtotal/tax/total from raw items. */
  static computeTotals(rawItems, taxRate) {
    const items = (Array.isArray(rawItems) ? rawItems : [])
      .map((it) => {
        const quantity = num(it.quantity, 0);
        const unitPrice = num(it.unitPrice, 0);
        return {
          productId: it.productId || null,
          productName: String(it.productName || "").trim(),
          quantity,
          unitPrice,
          lineTotal: round2(quantity * unitPrice),
        };
      })
      .filter((it) => it.productName !== "" && it.quantity > 0);

    const subtotal = round2(items.reduce((s, it) => s + it.lineTotal, 0));
    const rate = Math.max(0, num(taxRate, 0));
    const taxAmount = round2(subtotal * (rate / 100));
    const total = round2(subtotal + taxAmount);
    return { items, subtotal, taxRate: rate, taxAmount, total };
  }

  static async create(data) {
    try {
      const { items, subtotal, taxRate, taxAmount, total } = this.computeTotals(
        data.items,
        data.taxRate,
      );
      const payload = {
        invoiceNumber: data.invoiceNumber || (await this.nextNumber()),
        customer: {
          name: String((data.customer && data.customer.name) || "").trim(),
          phone: String((data.customer && data.customer.phone) || "").trim(),
          email: String((data.customer && data.customer.email) || "").trim(),
          address: String(
            (data.customer && data.customer.address) || "",
          ).trim(),
        },
        items,
        subtotal,
        taxRate,
        taxAmount,
        total,
        notes: data.notes || "",
        date: data.date || new Date().toISOString().slice(0, 10),
        dueDate: data.dueDate || "",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const ref = await db.collection(this.collectionName).add(payload);
      return { id: ref.id, ...payload };
    } catch (e) {
      throw new Error(`Error creating invoice: ${e.message}`);
    }
  }

  static async getAll() {
    try {
      const snap = await db.collection(this.collectionName).get();
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const av =
            a.createdAt && a.createdAt.seconds ? a.createdAt.seconds : 0;
          const bv =
            b.createdAt && b.createdAt.seconds ? b.createdAt.seconds : 0;
          return bv - av;
        });
    } catch (e) {
      throw new Error(`Error fetching invoices: ${e.message}`);
    }
  }

  static async getPending() {
    const all = await this.getAll();
    return all.filter((i) => i.status === "pending");
  }

  static async getById(id) {
    try {
      const doc = await db.collection(this.collectionName).doc(id).get();
      if (!doc.exists) return null;
      return { id: doc.id, ...doc.data() };
    } catch (e) {
      throw new Error(`Error fetching invoice: ${e.message}`);
    }
  }

  static async updateStatus(id, status) {
    try {
      const allowed = ["pending", "prepared", "paid"];
      if (!allowed.includes(status)) throw new Error("Invalid status");
      await db
        .collection(this.collectionName)
        .doc(id)
        .update({ status, updatedAt: new Date() });
      return await this.getById(id);
    } catch (e) {
      throw new Error(`Error updating invoice status: ${e.message}`);
    }
  }

  static async delete(id) {
    try {
      await db.collection(this.collectionName).doc(id).delete();
      return true;
    } catch (e) {
      throw new Error(`Error deleting invoice: ${e.message}`);
    }
  }

  static validate(data) {
    const errors = [];
    if (!data.customer || !String(data.customer.name || "").trim())
      errors.push("Customer name is required");
    const { items } = this.computeTotals(data.items, data.taxRate);
    if (items.length === 0)
      errors.push(
        "At least one line item with a name and quantity is required",
      );
    return errors;
  }
}

module.exports = Invoice;
