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

    // Populate edit form
    document.getElementById("edit_name").value = product.name;
    document.getElementById("edit_description").value =
      product.description || "";
    document.getElementById("edit_quantity").value = product.quantity || 0;
    document.getElementById("editProductForm").action =
      `/primary/${id}?_method=PUT`;

    // Show modal
    const modal = new bootstrap.Modal(
      document.getElementById("editProductModal"),
    );
    modal.show();
  } catch (error) {
    console.error("Error fetching product:", error);
    alert("Failed to load product data");
  }
}

// Show increase quantity modal
function showIncreaseModal(productId, type) {
  const form = document.getElementById("increaseQuantityForm");
  form.action = `/${type}/${productId}/increase-quantity`;

  // Reset form
  document.getElementById("increase_amount").value = "";

  // Show modal
  const modal = new bootstrap.Modal(
    document.getElementById("increaseQuantityModal"),
  );
  modal.show();
}

// Edit Secondary Product
async function editSecondaryProduct(id) {
  try {
    const response = await fetch(`/secondary/${id}`);
    const product = await response.json();

    // Populate form
    document.getElementById("edit_name").value = product.name;
    document.getElementById("edit_description").value =
      product.description || "";
    document.getElementById("editProductForm").action =
      `/secondary/${id}?_method=PUT`;

    // Create edit components list
    let editSelectedComponents = {};
    const editComponentsList = document.getElementById("editComponentsList");
    editComponentsList.innerHTML = "";

    primaryProducts.forEach((primary) => {
      const existingComp = product.components
        ? product.components.find((c) => c.productId === primary.id)
        : null;
      const isSelected = existingComp !== null && existingComp !== undefined;
      const qty = isSelected ? existingComp.quantity : 1;

      if (isSelected) {
        editSelectedComponents[primary.id] = {
          productId: primary.id,
          quantity: qty,
          name: primary.name,
        };
      }

      editComponentsList.innerHTML += `
        <div class="component-item mb-3 p-3 border rounded ${isSelected ? "bg-light" : ""}" data-id="${primary.id}" data-name="${primary.name}">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>${primary.name}</strong>
              <br><small class="text-muted">${primary.description || "No description"}</small>
            </div>
            <div class="d-flex align-items-center">
              <button type="button" class="btn btn-sm btn-outline-danger me-2 edit-decrease-btn" ${!isSelected ? 'style="display:none;"' : ""} data-id="${primary.id}">
                <i class="bi bi-dash"></i>
              </button>
              <input type="number" class="form-control form-control-sm text-center edit-quantity-input" 
                     style="width: 70px; ${!isSelected ? "display:none;" : ""}" 
                     data-id="${primary.id}" 
                     min="1" 
                     value="${qty}" 
                     readonly>
              <button type="button" class="btn btn-sm btn-outline-success ms-2 edit-increase-btn" ${!isSelected ? 'style="display:none;"' : ""} data-id="${primary.id}">
                <i class="bi bi-plus"></i>
              </button>
              <button type="button" class="btn btn-sm btn-success edit-add-btn" ${isSelected ? 'style="display:none;"' : ""} data-id="${primary.id}">
                <i class="bi bi-plus-circle"></i> Add
              </button>
            </div>
          </div>
        </div>
      `;
    });

    // Update edit selected display
    updateEditSelectedDisplay(editSelectedComponents);

    // Setup event listeners for edit modal
    setupEditModalListeners(editSelectedComponents);

    // Show modal
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

    // Populate form
    document.getElementById("edit_name").value = product.name;
    document.getElementById("edit_description").value =
      product.description || "";
    document.getElementById("editProductForm").action =
      `/tertiary/${id}?_method=PUT`;

    // Create edit components list
    let editSelectedComponents = {};
    const editComponentsList = document.getElementById("editComponentsList");
    editComponentsList.innerHTML = "";

    secondaryProducts.forEach((secondary) => {
      const existingComp = product.components
        ? product.components.find((c) => c.productId === secondary.id)
        : null;
      const isSelected = existingComp !== null && existingComp !== undefined;
      const qty = isSelected ? existingComp.quantity : 1;

      if (isSelected) {
        editSelectedComponents[secondary.id] = {
          productId: secondary.id,
          quantity: qty,
          name: secondary.name,
        };
      }

      editComponentsList.innerHTML += `
        <div class="component-item mb-3 p-3 border rounded ${isSelected ? "bg-light" : ""}" data-id="${secondary.id}" data-name="${secondary.name}">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>${secondary.name}</strong>
              <br><small class="text-muted">${secondary.description || "No description"}</small>
            </div>
            <div class="d-flex align-items-center">
              <button type="button" class="btn btn-sm btn-outline-danger me-2 edit-decrease-btn" ${!isSelected ? 'style="display:none;"' : ""} data-id="${secondary.id}">
                <i class="bi bi-dash"></i>
              </button>
              <input type="number" class="form-control form-control-sm text-center edit-quantity-input" 
                     style="width: 70px; ${!isSelected ? "display:none;" : ""}" 
                     data-id="${secondary.id}" 
                     min="1" 
                     value="${qty}" 
                     readonly>
              <button type="button" class="btn btn-sm btn-outline-success ms-2 edit-increase-btn" ${!isSelected ? 'style="display:none;"' : ""} data-id="${secondary.id}">
                <i class="bi bi-plus"></i>
              </button>
              <button type="button" class="btn btn-sm btn-danger edit-add-btn" ${isSelected ? 'style="display:none;"' : ""} data-id="${secondary.id}">
                <i class="bi bi-plus-circle"></i> Add
              </button>
            </div>
          </div>
        </div>
      `;
    });

    // Update edit selected display
    updateEditSelectedDisplay(editSelectedComponents);

    // Setup event listeners for edit modal
    setupEditModalListeners(editSelectedComponents);

    // Show modal
    const modal = new bootstrap.Modal(
      document.getElementById("editProductModal"),
    );
    modal.show();
  } catch (error) {
    console.error("Error fetching product:", error);
    alert("Failed to load product data");
  }
}

// Setup edit modal listeners
function setupEditModalListeners(editSelectedComponents) {
  // Add component
  document.querySelectorAll(".edit-add-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const id = this.dataset.id;
      const item = this.closest(".component-item");
      const name = item.dataset.name;

      editSelectedComponents[id] = { productId: id, quantity: 1, name: name };

      this.style.display = "none";
      item.querySelector(".edit-decrease-btn").style.display = "inline-block";
      item.querySelector(".edit-quantity-input").style.display = "inline-block";
      item.querySelector(".edit-increase-btn").style.display = "inline-block";
      item.classList.add("bg-light");

      updateEditSelectedDisplay(editSelectedComponents);
    });
  });

  // Increase quantity
  document.querySelectorAll(".edit-increase-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const id = this.dataset.id;
      const input = document.querySelector(
        `.edit-quantity-input[data-id="${id}"]`,
      );
      const currentQty = parseInt(input.value);
      input.value = currentQty + 1;
      editSelectedComponents[id].quantity = currentQty + 1;
      updateEditSelectedDisplay(editSelectedComponents);
    });
  });

  // Decrease quantity
  document.querySelectorAll(".edit-decrease-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const id = this.dataset.id;
      const input = document.querySelector(
        `.edit-quantity-input[data-id="${id}"]`,
      );
      const currentQty = parseInt(input.value);

      if (currentQty > 1) {
        input.value = currentQty - 1;
        editSelectedComponents[id].quantity = currentQty - 1;
      } else {
        delete editSelectedComponents[id];
        const item = this.closest(".component-item");
        item.querySelector(".edit-add-btn").style.display = "inline-block";
        this.style.display = "none";
        input.style.display = "none";
        item.querySelector(".edit-increase-btn").style.display = "none";
        item.classList.remove("bg-light");
      }

      updateEditSelectedDisplay(editSelectedComponents);
    });
  });

  // Form submission
  document.getElementById("editProductForm").onsubmit = function (e) {
    const componentsArray = Object.values(editSelectedComponents);
    if (componentsArray.length === 0) {
      e.preventDefault();
      alert("Please select at least one component");
      return false;
    }
    document.getElementById("editComponentsJson").value =
      JSON.stringify(componentsArray);
    return true;
  };
}

// Update edit selected display
function updateEditSelectedDisplay(editSelectedComponents) {
  const container = document.getElementById("editSelectedComponents");
  const keys = Object.keys(editSelectedComponents);

  if (keys.length === 0) {
    container.innerHTML =
      '<p class="text-muted small">No components selected yet</p>';
  } else {
    let html = "";
    const currentPath = window.location.pathname;
    const badgeClass = currentPath.includes("/secondary")
      ? "bg-success"
      : "bg-warning text-dark";
    keys.forEach((key) => {
      const comp = editSelectedComponents[key];
      html += `<span class="badge ${badgeClass} me-1 mb-1">${comp.name} × ${comp.quantity}</span>`;
    });
    container.innerHTML = html;
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
