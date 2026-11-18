# Action Plan: Missing Things & Needed Additions for POS Terminal (`/`)

> Generated from live UI audit of the POS Terminal screen.

---

## 1. High Priority (Critical Usability & Business Logic Fixes)

### 1.1 Navigation & Side Navbar Access
- **The Issue:** The page is currently an isolated screen with zero navigation links. Cashiers or managers cannot navigate to Attendance (`/attendance`), Dashboard (`/dashboard`), or Returns (`/sales-controls`) without manually typing URLs.
- **What to Add:**
  - Add a **Top-Left Hamburger Menu (`☰`)** or collapsible sidebar toggle next to the `[P] POS Terminal` logo.
  - Clicking it slides out the global navigation drawer with links to:
    - *Sales & POS Terminal* (`/`)
    - *Staff Attendance & Clock-In* (`/attendance`)
    - *Store Dashboard* (`/dashboard`)
    - *Inventory & Products* (`/products`)
    - *Returns & Cancellations* (`/sales-controls`)
    - *Reports & Exports* (`/reports`)

### 1.2 Stock Health Pill Color Bug (`OD-03`)
- **The Issue:** The product card currently displays `0 packets = 0 packets in stock` inside a **Green Pill**. In retail, 0 or negative stock must **never** be colored green.
- **What to Add:**
  - **Stock > 10:** Green pill (`Healthy`).
  - **Stock 1–10:** Amber pill (`Low stock`).
  - **Stock $\le$ 0:** Red/Amber alert badge (`Negative Stock`). Under rule `OD-03`, keep the `+ Add` button enabled, but show an alert: *"Backorder: Sale recorded to ledger"*.

### 1.3 Dedicated Checkout & Tender Modal (Replace Squished Bottom Form)
- **The Issue:** Payment method dropdown, cash tendered, and change are permanently squished at the bottom of the right cart panel. When the cart has 5–10 items, cashiers must constantly scroll up and down, causing errors and slow checkout.
- **What to Add:**
  - Keep the right panel strictly for **Cart Lines, Item Discounts, and Total Due**.
  - Clicking **`Complete Sale (F12 / Enter)`** should open a clean, accessible **Checkout Modal**.
  - **Inside the Checkout Modal:**
    - 3 large tactile buttons: `💵 Cash (1)`, `💳 Card (2)`, `📱 Online / UPI (3)` (`OD-10`).
    - **Quick Cash Note Chips:** Instant tap buttons for `[Exact]`, `[₹100]`, `[₹200]`, `[₹500]`, `[₹2000]`.
    - **Live Change Display:** Prominent green display of change to return: $\text{Change} = \text{Tendered} - \text{Net Total}$.
    - Single-click `Finalize & Print Receipt` button.

---

## 2. Medium Priority (Cart & Catalog Enhancements)

### 2.1 Cart Item Quantity Steppers (`[-]` `[Qty]` `[+]`)
- **The Issue:** Adding an item to the cart currently has no quick way to increase or decrease quantities without re-scanning or deleting.
- **What to Add:**
  - Add `[-]`, manual numeric input, and `[+]` buttons directly on each active cart item row.
  - Stepping to `0` or clicking a trash icon removes the item and logs the removal to the audit stream.

### 2.2 Line-Item Discount Field
- **The Issue:** The cart only has a whole-bill discount (`Bill discount (%)`). Cashiers cannot discount a single damaged or clearance item.
- **What to Add:**
  - Add an optional discount `%` input on each individual line item.
  - Enforce the cashier's assigned limit cap (e.g. max 5%). If exceeded, highlight red with error: *"Exceeds cashier cap (5%). Requires manager override."*
  - Enforce mutual exclusion (`OD-07`): Applying line discounts disables whole-bill discounts, and vice versa.

### 2.3 Department Category Pills
- **The Issue:** Only `All categories` is currently displayed above the product grid.
- **What to Add:**
  - Populate actual store category pills: `All Categories`, `Beverages`, `Snacks`, `Pantry`, `Personal care`, `Home & living`.
  - Clicking a category filters the catalog instantly so cashiers can quickly find items without barcodes.

---

## 3. Low Priority (Keyboard & Operational Polish)

### 3.1 Keyboard Shortcuts & Tooltips
- **The Issue:** Cashiers use barcode scanners and physical keyboards. Relying on a mouse slows down checkout lines.
- **What to Add:**
  - Visual keyboard cues on screen:
    - `F2` or `/`: Focus barcode search input.
    - `F4`: Clear search input.
    - `F12` or `Ctrl+Enter`: Trigger Checkout modal.
    - `Esc`: Close modal or cancel prompt.

### 3.2 Shift Attendance & Terminal Lane ID
- **The Issue:** Header shows `Retail Store Downtown · CASHIER`, but lacks terminal lane context and clock-in visibility.
- **What to Add:**
  - Add terminal register ID (e.g. `Lane 01` or `POS-T01`).
  - Add a small shift indicator or link: `Clocked In (09:02 AM)` with a direct link to `/attendance`.

### 3.3 Offline Queue Inspection Drawer
- **The Issue:** The green `● Online` status pill is static.
- **What to Add:**
  - When connection is lost, switch pill to amber: `● Offline (X sales queued)`.
  - Clicking the pill opens the offline sync drawer showing pending transactions, retry actions, and conflict inspection (`OD-11`).
