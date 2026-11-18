# Page Specification: POS Terminal (`/`)

## 1. What is this Page?
The **POS Terminal** is the primary checkout screen in retail stores. Cashiers and store managers use this single screen during their entire shift to scan products, add items to a customer's cart, apply permitted discounts, collect payments, print receipts, and handle offline sales if the internet drops.

---

## 2. Header & Session Controls

### Store & Cashier Identification Badge
- **What is it?** A top-bar indicator displaying the current store branch name (e.g., *Downtown Store*), the cashier's full name, and avatar initials.
- **Why is it needed?** Retail stores have multiple cashiers and terminals. Every sale, discount, and deletion must be permanently tied to the exact user and physical store location for legal invoicing and financial accountability.
- **How does it work?** On page load, it reads the active authenticated user profile and terminal session. If no session is active, it prompts for login.

### Network & Resilient Queue Status Pill
- **What is it?** A live connectivity badge showing `Online (Connected)` with a green dot, or `Offline Mode (Resilient Queue Active)` with an amber/red dot.
- **Why is it needed?** Retail checkouts cannot freeze when internet drops. Cashiers need to know immediately whether transactions are syncing directly to the server or being queued safely in the browser's offline database (`OD-11`).
- **How does it work?** Listens to browser online/offline events and API heartbeat probes. When offline, checkout transactions are written directly to IndexedDB without delay. When back online, it shows how many sales are waiting to sync.

### Profile Switcher & Clock-Out Link
- **What is it?** Quick buttons to switch cashier shift or clock out.
- **Why is it needed?** Allows shift handoffs between morning and evening cashiers at the same terminal without restarting the terminal browser.

---

## 3. Product Lookup & Catalogue Panel (Left Side)

### Barcode Scanner & Search Input
- **What is it?** A prominent search bar that always maintains focus for physical USB/Bluetooth handheld barcode scanners or manual typing.
- **Why is it needed?** Cashiers need to ring up items in under 2 seconds. They cannot waste time clicking into search fields between items.
- **How does it work?**
  - **Hardware Scanner Wedge:** Hardware scanners send keystrokes rapidly followed by an `Enter` key. When the scanner scans a barcode, the system detects this fast sequence, queries the product database, and **immediately appends the item to the cart** without requiring the cashier to click anything.
  - **Manual Search:** Cashiers can type product names (e.g., "coffee") or SKU codes (e.g., "BEV-1048"). A debounced dropdown filters matching items live.
  - **Clear Button (`×`):** Resets the search bar with one click or via `F4` hotkey.

### Category Filter Tabs
- **What is it?** A horizontal scrollable bar of category pills: `All Categories`, `Beverages`, `Personal care`, `Home & living`, `Snacks`, `Pantry`.
- **Why is it needed?** For items without barcodes (e.g. fresh bakery, fruits, impulse merchandise near the counter), cashiers can quickly filter by department.
- **How does it work?** Clicking a category filters the product grid below immediately without reloading the page.

### Product Card Grid
- **What is it?** A grid of touch-friendly cards showing products available for sale.
- **What is inside each card?**
  1. **Product Name & Variant:** E.g., *Arabica Ground Coffee · Medium roast 250g*. Clearly shows package size so the cashier doesn't pick the wrong weight.
  2. **SKU Code Badge:** Unique inventory SKU (e.g. `BEV-1048`) for quick visual verification against the physical box.
  3. **Selling Price Tag:** Formatted retail price (e.g., `₹485.00`).
  4. **Live Stock Health Badge:**
     - **Green (`Healthy`):** Stock > 10 units. Normal sale.
     - **Amber (`Low Stock`):** Stock between 1 and 10 units. Alerts cashier that inventory is running out.
     - **Red (`Negative Stock` - `OD-03`):** Stock $\le 0$. Displays a bold warning banner: *"Negative Stock: sale recorded with backorder flag"*.
  5. **`+ Add to Basket` Action:** Clicking the card or button adds 1 base unit of this variant to the active cart.
- **Why is the Negative Stock feature needed (`OD-03`)?** In fast-paced retail, physical stock might be on the shelf even if the warehouse delivery hasn't been keyed into the computer yet. Blocking the cashier from selling it loses customer revenue. The system allows the sale, records negative inventory in the ledger, and alerts store management to reconcile it.

---

## 4. Active Customer Basket / Cart Panel (Right Side)

### Cart Header
- **What is it?** Displays the active transaction ID, total item count, and a `Clear Basket` button.
- **Why is it needed?** Allows cashiers to verify how many physical items are in the customer's shopping bag at a glance.

### Itemized Line Items Table
- **What is inside each line?**
  1. **Variant Title & SKU:** Shows item name, variant size, and SKU.
  2. **Unit Rate:** The selling price per canonical base unit.
  3. **Quantity Stepper (`[-]` `[ Qty Input ]` `[+]`):**
     - Decrement `[-]`: Lowers quantity by 1.
     - Manual input: Allows typing high quantities (e.g., 24 packets) directly without clicking 24 times.
     - Increment `[+]`: Adds 1 unit.
  4. **Line-Item Discount Input (%):**
     - Allows entering a percentage discount for that specific product (e.g., 5% off damaged packaging).
     - **Enforces Cashier Limit Cap:** If cashier tries to enter 10% but their assigned limit is 5%, the input turns red and rejects the value with an error: *"Exceeds cashier discount limit (5%). Store Manager required."*
  5. **Line Subtotal:** Automatically calculates $\text{Qty} \times \text{Unit Price} \times (1 - \text{Discount}\%)$.
  6. **Delete Item Button (Trash Icon):**
     - Removes the item from the cart.
     - **Audit Logging:** To prevent cashiers from scanning items, showing price to customer, taking cash, and deleting the item, every line deletion from an active cart is logged to the audit stream.

### Bill-Level Discount & Order Summary
- **What is inside?**
  1. **Gross Subtotal:** Total sum before discounts.
  2. **Cart-Level (Bill-Level) Discount Input:**
     - Allows applying an overall discount to the entire bill.
     - **Mutual Exclusion Rule (`OD-07`):** Line discounts and bill discounts cannot be stacked. If line discounts exist, this input is disabled with a note: *"Remove line discounts to apply a whole-bill discount."*
  3. **Total Discount Deducted:** Total rupee value saved by the customer.
  4. **Net Payable Due:** Bold, prominent display (large font) of the exact total the customer must pay.

### Primary Cart Actions
- **`Clear Basket` Button:** Resets the cart after a confirmation prompt if a customer abandons their purchase.
- **`Proceed to Checkout` Button (Hotkey: `F12` or `Enter`):**
  - Opens the Checkout & Payment Modal.
  - Disabled if the basket has 0 items.

---

## 5. Checkout & Payment Modal

- **What is it?** A popup dialog that appears when clicking "Proceed to Checkout".
- **Why is it needed?** To collect payment, validate that full payment has been received, calculate change for cash, and finalize the invoice.

### Payment Method Selector (`OD-10`)
- **What is inside?** 3 large touch buttons: `💵 Cash (1)`, `💳 Card (2)`, `📱 Online / UPI (3)`.
- **Why only these 3 methods?** Under confirmed business decision `OD-10`, the system accepts Cash, Card, or Online UPI. Split payments across multiple methods are excluded to keep checkout fast and avoid cash reconciliation errors.
- **Keyboard hotkeys:** Pressing `1`, `2`, or `3` instantly selects the method.

### Cash Tender & Change Calculator (When Cash is selected)
- **What is inside?**
  1. **Cash Tendered Input:** Cashier types how much physical cash the customer handed over (e.g. ₹2,000).
  2. **Quick Cash Chips:** Tap buttons for exact net total, ₹500, ₹1000, and ₹2000 notes.
  3. **Live Change Due Indicator:** Bold green highlight showing exact cash to hand back: $\text{Change} = \text{Tendered} - \text{Net Due}$.
  4. **Validation:** If tendered cash is less than net due, the submit button is disabled and shows: *"Tender amount is ₹X short"*.

### Card & Online Fields (When Card or Online is selected)
- **What is inside?**
  - Instructions reminding the cashier to complete payment on the bank machine or verify UPI app notification.
  - An optional external transaction reference / auth slip number input.
- **PCI Security Rule:** Card numbers, expiry dates, CVVs, and PINs are **strictly never collected or stored** (`OD-10`).

### `Complete Sale & Print` Button
- Submits the sale with an `Idempotency-Key` (UUID) to prevent double charges.
- Triggers the receipt modal and automatically opens the printer dialog.

---

## 6. Thermal Receipt & Print Preview Modal

- **What is it?** A formatted preview of the sales slip designed specifically for standard 80mm ESC/POS thermal receipt printers (`OD-15`).
- **Why is it needed?** Proof of purchase for the customer and required for future product returns.
- **What is printed on the receipt?**
  1. Store Name, Branch Address, and Tax Status.
  2. Unique Invoice Number (e.g. `INV-2026-0842`) and exact timestamp.
  3. Cashier Name and Terminal ID.
  4. Itemized table: Item name, quantity, unit price, and line total.
  5. Subtotal, discounts saved, and net total paid.
  6. Payment method, cash tendered, and change given.
  7. Store return policy disclaimer: *"Returns accepted within policy with original invoice."*
- **Actions:**
  - `Print Receipt` (Hotkey: `Enter` or `Ctrl+P`): Sends raw receipt formatting to thermal printer.
  - `Close / New Sale` (Hotkey: `Esc`): Closes receipt and resets POS terminal for the next customer.

---

## 7. Offline Resilient Queue Drawer (`OD-11`)

- **What is it?** A slide-out panel that displays transactions stored in the browser's IndexedDB database during internet outages.
- **Why is it needed?** Store staff need total transparency over which sales are waiting to upload to headquarters and must be able to resolve any sync errors manually.
- **What is inside the drawer?**
  1. **Sync Status Banner:** Shows `Synced`, `Syncing (Attempt X)`, or `Needs Review`.
  2. **Queued Transactions List:** Shows offline invoice reference, timestamp, item count, and total amount.
  3. **`Needs Review` Conflict Card:** If a sale failed to upload (e.g. duplicate key or sequence conflict), it shows the error, allows inspecting the raw order lines, and provides a `Retry Sync` button.
  4. **`Force Resync Now` Button:** Immediately triggers the background sync worker.
  5. **`Export Local Backup` Button:** Downloads an encrypted JSON file of queued transactions for emergency data safety.

---

## 8. Bottom Admin & Operations Entry Bar
- Links at the bottom of the screen allowing authorized users to jump directly to:
  - **Open client demo dashboard (`/dashboard`)**
  - **Admin: manage discount limits (`/admin/discount-limits`)**
  - **Admin: manage cancellation and return permissions (`/admin/sales-permissions`)**
  - **Assigned users: process cancellations and returns (`/sales-controls`)**
  - **Operations test bench (`/operations`)**
