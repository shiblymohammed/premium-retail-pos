# Cashier · Receipt & Thermal Print View

## 1. Executive Summary & Page Purpose
The **Receipt & Thermal Print View** displays the final customer invoice upon completed checkout. It formats the receipt for standard 80mm/58mm ESC/POS thermal printers, shows store tax and company identifiers, lists purchased items with unit conversions, itemizes discounts, and provides instant print action.

## 2. Target Role & Hardware Standard
- **Primary Role:** `CASHIER`
- **Hardware Profile (OD-15):** Standard USB and Bluetooth ESC/POS thermal receipt printers. Formatted via CSS `@media print` rules for 80mm continuous roll paper.

## 3. Receipt Layout Specifications
```
+----------------------------------------------------+
|                PREMIUM RETAIL STORE                |
|             Downtown Branch - Outlet #01           |
|              GST / Tax Exempt POS Demo             |
|                                                    |
| Invoice: INV-2026-0842      Date: 12-Nov-26 10:42  |
| Cashier: Ravi Menon (RM)    Terminal: POS-T01      |
| -------------------------------------------------- |
| ITEM                   QTY   RATE            TOTAL |
| -------------------------------------------------- |
| Arabica Coffee 250g    2 pk  ₹ 485.00     ₹ 970.00 |
| Almond Oat Milk 1L     1 bt  ₹ 220.00     ₹ 220.00 |
| Daily Moisture 400ml   1 bt  ₹ 640.00     ₹ 640.00 |
| -------------------------------------------------- |
| Gross Subtotal:                          ₹ 1830.00 |
| Authorized Discount (5%):              - ₹   91.50 |
| -------------------------------------------------- |
| NET TOTAL PAID:                          ₹ 1738.50 |
| -------------------------------------------------- |
| Payment Method: CASH                     ₹ 2000.00 |
| Change Returned:                         ₹  261.50 |
| -------------------------------------------------- |
| Items Sold: 4 base units                           |
| Returns accepted with original invoice within store|
| policy. Returned items subject to inspection.      |
|              *** HAVE A GREAT DAY ***              |
+----------------------------------------------------+
[ PRINT THERMAL RECEIPT (Enter) ]    [ NEW SALE (Esc) ]
```

## 4. Technical Print Specifications
- **CSS Rules:**
  - `@media print { body { visibility: hidden; } .receipt-card { visibility: visible; position: absolute; left: 0; top: 0; width: 80mm; } }`
  - Font: High-legibility monospaced font stack (`Courier New`, `monospace`).
  - Margins: `0mm` padding with auto page cut command trigger.
- **Keyboard Shortcuts:**
  - `Enter` or `Ctrl+P`: Triggers system print dialogue.
  - `Esc`: Closes receipt and resets POS terminal for the next customer.
