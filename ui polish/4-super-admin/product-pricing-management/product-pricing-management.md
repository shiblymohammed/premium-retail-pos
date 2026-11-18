# Super Admin · Product Catalogue & Master Price Controls

## 1. Executive Summary & Page Purpose
The **Master Product Catalogue & Price Controls** interface allows Super Admins to define products, variant specifications (size, colour, packaging), SKU codes, barcode assignments, carton-to-base unit conversion ratios, and holds the **exclusive** authority to alter purchase and selling prices.

## 2. Target Role & Access Control
- **Exclusive Authority (Invariant 10):** *"Only users holding the `SUPER_ADMIN` role may modify purchase or selling prices."* Non-Super Admin roles receive HTTP 403 Forbidden.
- **Price Change Audit Log (Invariant 10):** Every initial price or price change is transactionally recorded in `PriceChangeLog` with old value, new value, actor ID, timestamp, and mandatory reason.

## 3. UI Layout & Pricing Form
```
+-----------------------------------------------------------------------+
| MASTER PRODUCT CATALOGUE & PRICING CONTROLS                           |
+-----------------------------------------------------------------------+
| [ + CREATE NEW MASTER PRODUCT ]      SEARCH: [ Search Catalogue...   ]|
+-----------------------------------------------------------------------+
| PRODUCT MASTER: Arabica Ground Coffee (Code: PRD-1048)                |
| Category: Beverages · Canonical Base Unit: [ pack ] (Invariant 1)      |
| Packaging Type: Carton Converted · Ratio: [ 1 Carton = 12 Packs ]      |
+-----------------------------------------------------------------------+
| VARIANTS & PRICE CONFIGURATION (SUPER ADMIN EXCLUSIVE):               |
| Variant Name: Medium roast · 250 g                                    |
| SKU: [ BEV-1048 ]    Barcode: [ 8901048203612 ]                       |
|                                                                       |
| CURRENT PRICING:                                                      |
| • Purchase Cost Price: ₹ 320.00                                       |
| • Retail Selling Price: ₹ 485.00  (Gross Margin: 34.02%)              |
+-----------------------------------------------------------------------+
| PRICE MODIFICATION DRAWER (Triggers on Edit Price):                   |
| * New Selling Price:   [ ₹ 510.00                                   ] |
| * New Purchase Price:  [ ₹ 340.00                                   ] |
| * Mandatory Reason:    [ Supplier annual price increase for Q4 2026 ] |
| * Effective Date:      [ Immediate (12-Nov-2026 15:00)              ] |
|                                                                       |
| [ CANCEL ]                          [ UPDATE PRICES & COMMIT AUDIT ]  |
+-----------------------------------------------------------------------+
| PRICE REVISION AUDIT HISTORY (PriceChangeLog Table):                  |
| Date        Actor          Old Sell  New Sell  Old Cost  New Cost  Reason
| 12-Nov-2026 Super Admin    ₹ 485.00  ₹ 510.00  ₹ 320.00  ₹ 340.00  Supplier Q4
| 15-Jun-2026 Super Admin    ₹ 450.00  ₹ 485.00  ₹ 300.00  ₹ 320.00  Opening launch
+-----------------------------------------------------------------------+
```

## 4. Architectural Rules & Invariants
1. **Base Unit Immutability (Invariant 1):** The canonical base unit cannot be edited once inventory ledger movements exist.
2. **Carton Conversion (Invariant 2 & 3):** Products sold in cartons require positive integer ratios; packet-only products set conversion ratio to null.
