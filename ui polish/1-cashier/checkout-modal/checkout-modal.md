# Cashier · Checkout & Payment Modal

## 1. Executive Summary & Page Purpose
The **Checkout & Payment Modal** handles tender collection and transaction finalization. It provides quick-touch tender buttons (Cash, Card, Online), real-time change calculation for cash payments, validates full single-payment completion (`OD-10`), and submits the transaction to the backend or local resilient queue.

## 2. Target Role & Access Control
- **Primary Role:** `CASHIER`
- **Supervisory Access:** `STORE_MANAGER`, `ADMIN`
- **Agreed Payment Rules (OD-10):** Exactly one full payment per sale. Split payments and card terminal integrations are excluded. Card numbers, PINs, CVVs, and magnetic tracks are never collected or stored.

## 3. UI Layout Architecture
```
+------------------------------------------------------------------+
| MODAL HEADER: Finalize Sale · Invoice #INV-2026-XXXX         [✕] |
+------------------------------------------------------------------+
| SUMMARY BANNER: 4 Items · Net Payable Due: ₹ 1,738.50            |
+------------------------------------------------------------------+
| PAYMENT METHOD SELECTION:                                        |
|   [ 💵 CASH (Key 1) ]   [ 💳 CARD (Key 2) ]   [ 📱 ONLINE (Key 3)|
+------------------------------------------------------------------+
| TENDER DETAIL SECTION:                                           |
| When CASH is selected:                                           |
|   • Cash Tendered:   [ ₹ 2,000.00                              ] |
|   • Quick Cash Chips:[ Exact: ₹1,738.50 ] [ ₹1,800 ] [ ₹2,000 ]  |
|   • Change to Return:  ₹ 261.50 (Prominent Green 24px)           |
|                                                                  |
| When CARD is selected:                                           |
|   • Instructions: "Swipe/tap customer card on external POS"      |
|   • Optional Reference / Auth Slip No: [                       ] |
|                                                                  |
| When ONLINE is selected:                                         |
|   • Instructions: "Scan store UPI QR code and confirm receipt"   |
|   • Optional Transaction Ref / UTR:   [                       ] |
+------------------------------------------------------------------+
| FOOTER ACTIONS:                                                  |
|   [ Cancel (Esc) ]             [ COMPLETE SALE & PRINT RECEIPT ] |
+------------------------------------------------------------------+
```

## 4. UI Elements & Form Specifications
- **Payment Method Toggle:** Large tactile buttons for Cash, Card, and Online. Keyboard shortcut keys `1`, `2`, `3` toggle selection.
- **Cash Tendered Input:**
  - Auto-formatted currency input field.
  - Auto-focuses immediately upon opening when Cash is default.
  - Validation: Must be $\ge$ Net Total. If tender < Net Total, shows warning: *"Tendered amount is ₹X short"*.
  - Quick Cash Chips: One-tap chips for exact change, next 100, next 500, and standard currency denominations.
- **Change Calculation:** Live visual display: $\text{Change Due} = \text{Cash Tendered} - \text{Net Total}$.
- **Security & Privacy (OD-10):** Sensitive card data fields are completely omitted to ensure zero PCI DSS compliance friction.

## 5. Business Logic & Error Handling
- **Full Payment Requirement:** The transaction cannot be submitted until tender satisfies the total payable amount.
- **Offline Fallback (OD-11):** If the network is down, the modal writes the sale record to IndexedDB `offline_sales` store and immediately displays the local receipt preview.
