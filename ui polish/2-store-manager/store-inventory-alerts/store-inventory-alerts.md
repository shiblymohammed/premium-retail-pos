# Page Specification: Products & Inventory Catalogue (`/products`)

## 1. What is this Page?
The **Products & Inventory Catalogue** is the master inventory view for stores and warehouses. It provides visibility into SKU catalog details, retail pricing, stock levels broken down by location, carton-to-packet conversion ratios, and threshold health alerts.

---

## 2. Header & KPI Summary Bar

### Total Valuation & Inventory Health Bar
- **Total Products Tracked:** Total count of active SKU variants in the system (e.g., 248 products).
- **Total Stock Valuation:** Total monetary value of stock on hand based on unit selling prices (e.g., `₹4,820,000.00`).
- **Low Stock Variants Count:** Count of items that have dropped below minimum reorder points.
- **Negative Stock Count:** Number of items with negative balances requiring reconciliation.
- **Stock State Breakdown:** Aggregate counts for Available, In-Transit, Reserved, and Quarantined base units.

---

## 3. Search & Multi-Filter Controls

### Full-Text Search Field
- Searches live against **Product Title**, **Variant Name**, **SKU code**, and **Barcode**.

### Location Filter Dropdown
- Allows switching between `All locations`, `Downtown Store`, `North Mall`, `West End Outlet`, or `Central Warehouse`.
- Filters the table so a manager sees only the inventory inside their physical building.

### Category Filter Chips
- Quick filter buttons: `All categories`, `Beverages`, `Personal care`, `Home & living`, `Snacks`, `Pantry`.

### Stock Health Filter
- Filters items by their health status:
  - `All Items`
  - `Healthy Stock` (Stock > 10)
  - `Low Stock` (Stock between 1 and 10)
  - `Negative Stock` (Stock < 0)

---

## 4. Master Inventory Data Table

### Table Columns & Feature Details

#### 1. Product & Variant Description
- Displays product name (e.g., *Arabica Ground Coffee*) and variant sub-spec (*Medium roast · 250 g*).
- Prevents confusion between different package sizes of the same product.

#### 2. SKU & Barcode Identification
- Displays the primary SKU (e.g., `BEV-1048`) and EAN/UPC barcode number for scanner lookup.

#### 3. Category & Location Tag
- Shows which merchandise department and store branch the row belongs to.

#### 4. Retail Selling Price
- Current selling price per canonical base unit (e.g., `₹485.00`).
- *Note: Price modifications are restricted strictly to Super Admin under Invariant 10.*

#### 5. Available Stock with Mixed-Unit Translation (Invariant 2 & OD-02)
- **What it shows:** Displays stock in canonical base units, plus an automated mixed-unit translation:
  - Example: For a product with 1 carton = 12 packs and 27 available packs, it displays:
    `27 packs (2 cartons + 3 loose packs)`.
- **Why is it needed?** Warehouse workers think in cartons; retail cashiers sell in loose packets. Showing both eliminates conversion mistakes during stock counts.

#### 6. In-Transit Stock (`OD-05`)
- Shows stock that has left the warehouse but has not yet arrived at this store.
- Reminds the manager that replenishment is already on the way before they reorder unnecessarily.

#### 7. Reserved Stock
- Units allocated for pending store transfers or customer orders that cannot be sold to walk-in customers.

#### 8. Packaging Specification
- Identifies whether the item is `Carton Converted` (specifying units per carton, e.g. 12) or `Packet-Only` (single units with no carton packaging).

#### 9. Stock Health Status Badge
- **`Healthy` (Green):** Normal inventory balance.
- **`Low stock` (Amber):** At or below reorder threshold.
- **`Negative` (Red):** Stock is below 0 (`OD-03`). A prominent indicator alerts staff to investigate stock drift or missing vendor receipts.

---

## 5. Table Actions & Replenishment Trigger
- **`Request Replenishment` Button:** Clicking on an item opens a quick drawer to draft a replenishment request to the Central Warehouse for that SKU.
