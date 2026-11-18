# Page Specification: Sales Controls · Cancellations & Returns (`/sales-controls`)

## 1. What is this Page?
The **Sales Controls** screen is a restricted supervisor interface used to handle after-sale operations: looking up past customer invoices, processing line-item returns with item inspection, and voiding full invoices with automated ledger reversals and manual refund tracking (`OD-08`).

---

## 2. Access Control & Operator Permissions Check
- When an operator opens this page, it checks their assigned permissions from the database:
  - `canCancelSales`: Allows full invoice cancellations.
  - `canProcessReturns`: Allows processing partial/full item returns.
- If the user lacks both permissions, the screen displays: *"Access Restricted: You are not authorized to cancel sales or process customer returns. Contact an Administrator."*

---

## 3. Invoice Lookup Section

### Search Bar by Invoice Number
- **Input:** Single search input expecting the unique invoice sequence (e.g., `INV-2026-0842`).
- **Lookup Action:** Clicking `Find Invoice` or pressing `Enter` fetches the full invoice document, line items, payment record, and historical return logs.

### Active Invoice Summary Card
- **Invoice Number & Timestamp:** When the sale occurred.
- **Store Location & Cashier Name:** Where and who rang up the bill.
- **Financial Breakdown:** Gross Subtotal, Discounts applied, and Net Amount paid.
- **Current Invoice Status:**
  - `FINALIZED`: Eligible for return or cancellation.
  - `CANCELLED`: Already voided (shows cancellation date, reason, and authorizer name; blocks further cancellation).

---

## 4. Invoice Cancellation Panel (Full Void)

- **What is it?** A supervisor action to void an entire completed transaction.
- **Why is it needed?** For situations where a cashier rang up a bill by mistake, charged a customer twice, or the customer backed out immediately after billing.
- **How does it work step-by-step?**
  1. **Permission Check:** Requires `canCancelSales == true`.
  2. **Mandatory Cancellation Reason Dropdown:** Operator must select a reason:
     - `Customer billing error`
     - `Cashier input mistake`
     - `Defective goods on purchase`
     - `System duplicate charge`
     - `Other (specify below)`
  3. **Detailed Notes Input:** Text box for additional explanation.
  4. **Manual Refund Recording (`OD-08`):**
     - Displays the exact refund amount (locked to the invoice's net paid total).
     - Method dropdown: `Cash`, `Card`, `Online`, or `Other`.
     - Optional refund slip reference.
  5. **Confirmation Modal:** Prompts: *"Void invoice INV-XXXX? This will mark the invoice CANCELLED, append positive reversal movements to the ledger for all items, and log a manual refund."*
- **Database Safeguards (Invariant 4 & 8):** The invoice is **never deleted**. The status is updated to `CANCELLED`, and compensating `SALE_CANCELLATION` movements are written to the inventory ledger to return all units to stock.

---

## 5. Sales Returns & Item Inspection Panel (Partial Returns)

- **What is it?** An interface to return specific items from a bill without voiding the entire transaction.
- **Why is it needed?** Customers frequently return 1 or 2 items out of a 5-item shopping basket days later.
- **How does it work step-by-step (`OD-08`)?**
  1. **Permission Check:** Requires `canProcessReturns == true`.
  2. **Item Return Selection:** Each line item from the invoice has a checkbox to select it for return.
  3. **Return Quantity Input:** Stepper allowing return of 1 to $N$ units. The system prevents entering more units than were originally sold or remaining unreturned.
  4. **Item Inspection & Disposition Selector:**
     - For every returned item, the supervisor must select where the physical item goes:
       - **`RESTOCKED` (Saleable):** Packaging is intact; item goes immediately back into store `AVAILABLE` inventory for resale.
       - **`QUARANTINED` (Damaged / Defective):** Item is spoiled, opened, or broken; item goes into `QUARANTINED` inventory so it cannot be sold.
  5. **Mandatory Inspection Notes:** Text field explaining the item's condition (e.g., *"Box unopened, seals intact"* or *"Customer reported broken seal"*).
  6. **Manual Refund Recording (`OD-08`):**
     - System calculates exact refund due based on the item's discounted purchase rate.
     - Selects refund method (`Cash`, `Card`, `Online`) and optional reference.
  7. **Submit Return:** Writes a `RETURN_INWARD` movement to the ledger and generates a Return Voucher number.
