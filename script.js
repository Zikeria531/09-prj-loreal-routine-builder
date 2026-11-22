/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectedProductsButton = document.getElementById(
  "clearSelectedProducts"
);
const generateRoutineButton = document.getElementById("generateRoutine");
const userInput = document.getElementById("userInput");
const sendButton = document.getElementById("sendBtn");

let allProducts = [];
let productsPromise = null;
const selectedProducts = [];
const workerUrl = "https://starry-night.zikeriamack12.workers.dev/";
const selectedProductsStorageKey = "lorealRoutineBuilderSelectedProductIds";
const messages = [
  {
    role: "system",
    content:
      "You are a L'Oréal beauty advisor. For routine generation, use only product data from the user's latest routine-generation request. For follow-up questions, answer only about the generated routine or related beauty topics such as skincare, haircare, makeup, fragrance, and general beauty. Politely decline unrelated requests and invite the user to ask about beauty instead. Use the full conversation history for context.",
  },
];
let isRequestInProgress = false;
let hasGeneratedRoutine = false;

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  if (!productsPromise) {
    productsPromise = fetch("products.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load products (status ${response.status}).`);
        }
        return response.json();
      })
      .then((data) => {
        if (!data || !Array.isArray(data.products)) {
          throw new Error("The product file has an unexpected format.");
        }
        allProducts = data.products;
        return allProducts;
      })
      .catch((error) => {
        productsPromise = null;
        throw error;
      });
  }

  return productsPromise;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => {
        const isSelected = selectedProducts.some(
          (selectedProduct) => selectedProduct.id === product.id
        );

        return `
    <article class="product-item">
      <button
        type="button"
        class="product-card${isSelected ? " selected" : ""}"
        data-product-id="${product.id}"
        aria-pressed="${isSelected}"
      >
        <img src="${product.image}" alt="${product.name}">
        <div class="product-info">
          <h3>${product.name}</h3>
          <p>${product.brand}</p>
        </div>
      </button>
      <details class="product-description">
        <summary>About this product</summary>
        <p>${product.description}</p>
      </details>
    </article>
  `;
      }
    )
    .join("");
}

/* Show the selected products and add a remove button for each one */
function displaySelectedProducts() {
  clearSelectedProductsButton.disabled = selectedProducts.length === 0;

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = "<p>No products selected yet.</p>";
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <button
          type="button"
          class="selected-product"
          data-product-id="${product.id}"
          aria-label="Remove ${product.name}"
        >
          ${product.name} <span aria-hidden="true">&times;</span>
        </button>
      `
    )
    .join("");
}

/* Save selected product IDs so the selection can be restored after reload */
function saveSelectedProducts() {
  try {
    const selectedProductIds = selectedProducts.map((product) => product.id);
    localStorage.setItem(
      selectedProductsStorageKey,
      JSON.stringify(selectedProductIds)
    );
  } catch (error) {
    console.error("Could not save selected products:", error);
    displayChatMessage(
      "error",
      "Your product selection could not be saved in this browser."
    );
  }
}

/* Restore saved product IDs using the full product data */
async function restoreSelectedProducts() {
  try {
    const savedProductIds = JSON.parse(
      localStorage.getItem(selectedProductsStorageKey) || "[]"
    );

    if (
      !Array.isArray(savedProductIds) ||
      savedProductIds.some((productId) => !Number.isInteger(productId))
    ) {
      throw new Error("Saved product selections have an unexpected format.");
    }

    if (savedProductIds.length === 0) {
      displaySelectedProducts();
      return;
    }

    const products = await loadProducts();
    savedProductIds.forEach((productId) => {
      const product = products.find((item) => item.id === productId);
      const alreadySelected = selectedProducts.some(
        (selectedProduct) => selectedProduct.id === productId
      );

      if (product && !alreadySelected) {
        selectedProducts.push(product);
      }
    });

    saveSelectedProducts();
    displaySelectedProducts();
  } catch (error) {
    console.error("Could not restore selected products:", error);
    selectedProductsList.innerHTML =
      "<p>Saved selections could not be restored. Please reload the page to try again.</p>";
  }
}

/* Add a message to the chat window without treating it as HTML */
function displayChatMessage(role, content) {
  const messageElement = document.createElement("p");
  messageElement.classList.add("chat-message", role);
  messageElement.textContent = content;
  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Send a user message and retain successful conversation turns */
async function sendMessage(content, isRoutineRequest, showUserMessage = true) {
  if (isRequestInProgress) return;

  isRequestInProgress = true;
  generateRoutineButton.disabled = true;
  sendButton.disabled = true;
  userInput.disabled = true;
  chatWindow.setAttribute("aria-busy", "true");
  if (showUserMessage) {
    displayChatMessage("user", content);
  }

  try {
    const requestMessages = messages.concat({ role: "user", content });
    const response = await fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: requestMessages }),
    });

    if (!response.ok) {
      throw new Error(`The routine service returned status ${response.status}.`);
    }

    const data = await response.json();
    const reply =
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (typeof reply !== "string" || reply.length === 0) {
      throw new Error("The routine service returned an unexpected response.");
    }

    messages.push({ role: "user", content }, { role: "assistant", content: reply });
    if (isRoutineRequest) {
      hasGeneratedRoutine = true;
    }
    displayChatMessage("assistant", reply);
  } catch (error) {
    console.error("Routine request failed:", error);
    displayChatMessage(
      "error",
      isRoutineRequest
        ? "Sorry, the routine could not be generated. Please try again."
        : "Sorry, your message could not be sent. Please try again."
    );
  } finally {
    isRequestInProgress = false;
    generateRoutineButton.disabled = false;
    sendButton.disabled = false;
    userInput.disabled = false;
    chatWindow.setAttribute("aria-busy", "false");
  }
}

/* Send only the selected product details to build a routine */
generateRoutineButton.addEventListener("click", () => {
  if (selectedProducts.length === 0) {
    displayChatMessage("error", "Select at least one product to generate a routine.");
    return;
  }

  const productsForRoutine = selectedProducts.map((product) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    description: product.description,
  }));
  const prompt = `Create a personalized routine using only these selected products. Here is the product data as JSON:\n${JSON.stringify(
    productsForRoutine,
    null,
    2
  )}`;

  sendMessage(prompt, true, false);
});

/* Toggle a product when its card is clicked */
productsContainer.addEventListener("click", (e) => {
  const productCard = e.target.closest(".product-card");
  if (!productCard) return;

  const productId = Number(productCard.dataset.productId);
  const selectedIndex = selectedProducts.findIndex(
    (product) => product.id === productId
  );

  if (selectedIndex === -1) {
    const product = allProducts.find((item) => item.id === productId);
    if (product) selectedProducts.push(product);
  } else {
    selectedProducts.splice(selectedIndex, 1);
  }

  saveSelectedProducts();
  displayProducts(
    allProducts.filter(
      (product) => product.category === categoryFilter.value
    )
  );
  displaySelectedProducts();
});

/* Remove a product when its selected-list button is clicked */
selectedProductsList.addEventListener("click", (e) => {
  const removeButton = e.target.closest(".selected-product");
  if (!removeButton) return;

  const productId = Number(removeButton.dataset.productId);
  const selectedIndex = selectedProducts.findIndex(
    (product) => product.id === productId
  );

  if (selectedIndex !== -1) {
    selectedProducts.splice(selectedIndex, 1);
    saveSelectedProducts();
    if (categoryFilter.value) {
      displayProducts(
        allProducts.filter(
          (product) => product.category === categoryFilter.value
        )
      );
    }
    displaySelectedProducts();
  }
});

/* Clear the entire saved selection */
clearSelectedProductsButton.addEventListener("click", () => {
  selectedProducts.splice(0, selectedProducts.length);
  saveSelectedProducts();

  if (categoryFilter.value) {
    displayProducts(
      allProducts.filter(
        (product) => product.category === categoryFilter.value
      )
    );
  }

  displaySelectedProducts();
});

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  try {
    const products = await loadProducts();
    const selectedCategory = e.target.value;

    /* filter() creates a new array containing only products 
       where the category matches what the user selected */
    const filteredProducts = products.filter(
      (product) => product.category === selectedCategory
    );

    displayProducts(filteredProducts);
  } catch (error) {
    console.error("Could not display products:", error);
    displayChatMessage(
      "error",
      "Products could not be loaded. Please try selecting the category again."
    );
  }
});

restoreSelectedProducts();

/* Send follow-up questions with the conversation history */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const content = userInput.value.trim();
  if (!content) return;

  if (!hasGeneratedRoutine) {
    displayChatMessage(
      "error",
      "Generate a routine first, then ask a follow-up question about it or another beauty topic."
    );
    return;
  }

  userInput.value = "";
  sendMessage(content, false);
});
