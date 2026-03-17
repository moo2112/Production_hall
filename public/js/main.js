// Main JavaScript file for Production Hall

// Edit Consumable
async function editConsumable(id) {
  try {
    const response = await fetch(`/consumables/${id}`);
    const consumable = await response.json();

    // Populate edit form
    document.getElementById("edit_name").value = consumable.name;
    document.getElementById("edit_quantity").value = consumable.quantity;
    document.getElementById("editConsumableForm").action =
      `/consumables/${id}?_method=PUT`;

    // Show modal
    const modal = new bootstrap.Modal(
      document.getElementById("editConsumableModal"),
    );
    modal.show();
  } catch (error) {
    console.error("Error fetching consumable:", error);
    alert("Failed to load consumable data");
  }
}

// Edit Primary Product
async function editProduct(id) {
  try {
    const response = await fetch(`/primary/${id}`);
    const product = await response.json();
    if (product.error) throw new Error(product.error);

    document.getElementById("edit_name").value = product.name || "";
    document.getElementById("edit_quantity").value = product.quantity || 0;
    document.getElementById("edit_description").value =
      product.description || "";
    document.getElementById("editProductForm").action = `/primary/${id}`;

    const modal = new bootstrap.Modal(
      document.getElementById("editProductModal"),
    );
    modal.show();
  } catch (error) {
    console.error("Error fetching product:", error);
    alert("Failed to load product data");
  }
}

// ── Shared helper: build a component picker inside editComponentsList ──────────
function buildEditComponentPicker(
  products,
  currentComponents,
  iconHtml,
  badgeClass,
  noProductsMsg,
) {
  const listEl = document.getElementById("editComponentsList");
  listEl.innerHTML = "";

  if (!products || products.length === 0) {
    listEl.innerHTML = `<p class="text-muted small mb-0">${noProductsMsg}</p>`;
    return {};
  }

  const editSelectedComps = {};

  products.forEach((p) => {
    const existing = currentComponents.find((c) => c.productId === p.id);
    const isSelected = !!existing;
    const qty = isSelected ? parseFloat(existing.quantity) : 1;

    if (isSelected) {
      editSelectedComps[p.id] = {
        productId: p.id,
        quantity: qty,
        name: p.name,
      };
    }

    const row = document.createElement("div");
    row.className =
      "d-flex align-items-center justify-content-between p-1 rounded mb-1" +
      (isSelected ? " bg-light" : "");
    row.dataset.id = p.id;
    row.dataset.name = p.name;
    row.innerHTML = `
      <span>${iconHtml}<strong>${p.name}</strong><small class="text-muted ms-2">(stock: ${p.quantity || 0})</small></span>
      <div class="d-flex align-items-center gap-1">
        <button type="button" class="btn btn-sm btn-outline-success ec-add" data-id="${p.id}"${isSelected ? ' style="display:none"' : ""}>+ Add</button>
        <button type="button" class="btn btn-sm btn-outline-danger ec-dec" data-id="${p.id}"${!isSelected ? ' style="display:none"' : ""}>−</button>
        <input type="number" class="form-control form-control-sm ec-qty" data-id="${p.id}"
               style="width:75px;${!isSelected ? "display:none;" : ""}" value="${qty}" min="0.01" step="0.01">
        <button type="button" class="btn btn-sm btn-outline-success ec-inc" data-id="${p.id}"${!isSelected ? ' style="display:none"' : ""}>+</button>
      </div>`;
    listEl.appendChild(row);
  });

  // Wire up Add
  listEl.querySelectorAll(".ec-add").forEach((btn) => {
    btn.addEventListener("click", function () {
      const pid = this.dataset.id;
      const row = this.closest("[data-id]");
      editSelectedComps[pid] = {
        productId: pid,
        quantity: 1,
        name: row.dataset.name,
      };
      this.style.display = "none";
      row.querySelector(".ec-dec").style.display = "";
      const inp = row.querySelector(".ec-qty");
      inp.style.display = "";
      inp.value = "1";
      row.querySelector(".ec-inc").style.display = "";
      row.classList.add("bg-light");
      refreshEditSelectedDisplay(editSelectedComps, badgeClass);
    });
  });

  // Wire up Increase
  listEl.querySelectorAll(".ec-inc").forEach((btn) => {
    btn.addEventListener("click", function () {
      const pid = this.dataset.id;
      const inp = listEl.querySelector(`.ec-qty[data-id="${pid}"]`);
      const newVal = parseFloat(inp.value) + 1;
      inp.value = newVal.toFixed(2);
      if (editSelectedComps[pid]) editSelectedComps[pid].quantity = newVal;
      refreshEditSelectedDisplay(editSelectedComps, badgeClass);
    });
  });

  // Wire up Decrease / Remove
  listEl.querySelectorAll(".ec-dec").forEach((btn) => {
    btn.addEventListener("click", function () {
      const pid = this.dataset.id;
      const inp = listEl.querySelector(`.ec-qty[data-id="${pid}"]`);
      const v = parseFloat(inp.value);
      if (v > 1) {
        inp.value = (v - 1).toFixed(2);
        if (editSelectedComps[pid]) editSelectedComps[pid].quantity = v - 1;
      } else {
        delete editSelectedComps[pid];
        const row = this.closest("[data-id]");
        row.querySelector(".ec-add").style.display = "";
        this.style.display = "none";
        inp.style.display = "none";
        row.querySelector(".ec-inc").style.display = "none";
        row.classList.remove("bg-light");
      }
      refreshEditSelectedDisplay(editSelectedComps, badgeClass);
    });
  });

  // Wire up manual input
  listEl.querySelectorAll(".ec-qty").forEach((inp) => {
    inp.addEventListener("input", function () {
      const pid = this.dataset.id;
      const v = parseFloat(this.value);
      if (editSelectedComps[pid]) {
        editSelectedComps[pid].quantity = isNaN(v) || v < 0.01 ? 0.01 : v;
        refreshEditSelectedDisplay(editSelectedComps, badgeClass);
      }
    });
  });

  refreshEditSelectedDisplay(editSelectedComps, badgeClass);
  return editSelectedComps;
}

function refreshEditSelectedDisplay(editSelectedComps, badgeClass) {
  const container = document.getElementById("editSelectedComponents");
  if (!container) return;
  const keys = Object.keys(editSelectedComps);
  if (keys.length === 0) {
    container.innerHTML =
      '<p class="text-muted small mb-0">No components selected yet</p>';
  } else {
    container.innerHTML =
      '<div class="d-flex flex-wrap gap-2 mt-1">' +
      keys
        .map((k) => {
          const c = editSelectedComps[k];
          return `<span class="badge ${badgeClass}">${c.name} × ${c.quantity}</span>`;
        })
        .join("") +
      "</div>";
  }
}

// Edit Secondary Product
async function editSecondaryProduct(id) {
  try {
    const response = await fetch(`/secondary/${id}`);
    const product = await response.json();
    if (product.error) throw new Error(product.error);

    document.getElementById("edit_name").value = product.name || "";
    document.getElementById("edit_quantity").value = product.quantity || 0;
    document.getElementById("edit_description").value =
      product.description || "";
    document.getElementById("editProductForm").action = `/secondary/${id}`;

    const editSelectedComps = buildEditComponentPicker(
      typeof primaryProducts !== "undefined" ? primaryProducts : [],
      product.components || [],
      '<i class="bi bi-circle-fill text-success me-1" style="font-size:.6rem"></i>',
      "bg-success",
      "No primary products available.",
    );

    document.getElementById("editProductForm").onsubmit = function (e) {
      const arr = Object.values(editSelectedComps).map((c) => ({
        productId: c.productId,
        quantity: c.quantity,
      }));
      if (arr.length === 0) {
        e.preventDefault();
        alert("Please select at least one primary component.");
        return false;
      }
      document.getElementById("editComponentsJson").value = JSON.stringify(arr);
      return true;
    };

    const modal = new bootstrap.Modal(
      document.getElementById("editProductModal"),
    );
    modal.show();
  } catch (error) {
    console.error("Error fetching product:", error);
    alert("Failed to load product data");
  }
}

// Edit Tertiary Product
async function editTertiaryProduct(id) {
  try {
    const response = await fetch(`/tertiary/${id}`);
    const product = await response.json();
    if (product.error) throw new Error(product.error);

    document.getElementById("edit_name").value = product.name || "";
    document.getElementById("edit_quantity").value = product.quantity || 0;
    document.getElementById("edit_description").value =
      product.description || "";
    document.getElementById("editProductForm").action = `/tertiary/${id}`;

    const editSelectedComps = buildEditComponentPicker(
      typeof secondaryProducts !== "undefined" ? secondaryProducts : [],
      product.components || [],
      '<i class="bi bi-layer-forward text-warning me-1"></i>',
      "bg-warning text-dark",
      "No secondary products available.",
    );

    document.getElementById("editProductForm").onsubmit = function (e) {
      const arr = Object.values(editSelectedComps).map((c) => ({
        productId: c.productId,
        quantity: c.quantity,
      }));
      if (arr.length === 0) {
        e.preventDefault();
        alert("Please select at least one secondary component.");
        return false;
      }
      document.getElementById("editComponentsJson").value = JSON.stringify(arr);
      return true;
    };

    const modal = new bootstrap.Modal(
      document.getElementById("editProductModal"),
    );
    modal.show();
  } catch (error) {
    console.error("Error fetching product:", error);
    alert("Failed to load product data");
  }
}

// Auto-dismiss alerts after 5 seconds
document.addEventListener("DOMContentLoaded", function () {
  const alerts = document.querySelectorAll(".alert");
  alerts.forEach((alert) => {
    setTimeout(() => {
      const bsAlert = new bootstrap.Alert(alert);
      bsAlert.close();
    }, 5000);
  });
});

// Form validation
document.addEventListener("DOMContentLoaded", function () {
  const forms = document.querySelectorAll("form");
  forms.forEach((form) => {
    form.addEventListener("submit", function (event) {
      if (!form.checkValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      form.classList.add("was-validated");
    });
  });
});
