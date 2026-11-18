# Page Specification: Physical Stock Audits & Recounts (`/audits`)

## 1. What is this Page?
The **Stock Audits & Recounts** interface is used to conduct periodic physical inventory stocktakes (typically after retail closing hours). Initiating an audit enforces ADR-010 (`Location Freeze`), temporarily locking store sales to prevent inventory drift. Floor counters submit blind physical counts (`OD-06`), the system flags variances exceeding configured thresholds, and managers approve adjustments to synchronize the ledger.

---

## 2. Location Scoping & Active Sessions List

### Location Selector
- Dropdown to select the retail store or warehouse being audited.

### Sessions History & Status Badges
- Displays past and active audit sessions:
  - `ACTIVE` (Blue): Location is currently frozen; counters are actively counting.
  - `SUBMITTED` (Amber): Counting finished; awaiting manager review of variances.
  - `APPROVED` (Green): Variances approved and committed to the ledger.
  - `CLOSED` (Gray): Completed and finalized.
  - `ABORTED` (Red): Cancelled without modifying stock.

---

## 3. ADR-010 Location Freeze Enforcement

### What is the Location Freeze?
- While an audit session is in `ACTIVE` status, the backend `AuditLockGuard` **completely blocks all mutating inventory movements** (`SALE`, `TRANSFER_DISPATCH`, `STOCK_ADJUSTMENT`) at this physical location.
- **Why is it needed?** If cashiers continue selling products while auditors are counting shelves, counts will never match the computer ledger.
- **UI Warning Banner:** Displays a prominent lock indicator: *"Location frozen for stock movements while audit is in progress."*

---

## 4. Audit Schedule & Off-Hours Window Setting

- **Earliest Start Time Picker:** Sets the earliest permitted time of day an audit can begin (e.g. `19:00` / 7:00 PM).
- **Allowed Days:** Restricts physical audits to designated days (e.g. Sundays after store closing).
- **`canStartNow` Validation:** Prevents managers from accidentally freezing an active retail store during peak shopping hours.

---

## 5. Recount Threshold Governance Policies

- **What is it?** Rules defining what level of discrepancy triggers an automatic physical recount before adjustments can be accepted.
- **Policy Controls:**
  1. **Policy Scope:** Can be set globally (`default`) or customized per product category (e.g. higher scrutiny for expensive *Beverages* or *Electronics*).
  2. **Recount Variance Percentage (%):** E.g., any discrepancy $> 2.0\%$ requires a recount.
  3. **Recount Variance Units:** E.g., any absolute difference $> 5$ units requires a recount.
  4. **High Count Alert Quantity:** Flags absurdly high counts (e.g. typing 100 instead of 10) to catch clerical typos.
  5. **Policy Reason:** Mandatory explanation required when altering variance tolerance rules.

---

## 6. Physical Count Entry (Blind Count Mode - `OD-06`)

### Blind Count Table
- **What is it?** The data entry table used by floor staff walking the aisles.
- **Blind Count Standard (`OD-06`):** The system **strictly conceals expected ledger stock** from the counter.
- **Why is expected stock hidden?** If counters see "Expected: 24", human nature tempts them to assume 24 without counting every dusty box on the top shelf. Blind counting guarantees genuine verification.
- **Inputs:** Numeric stepper or text input for counted base units per SKU.
- **`Submit Counts` Action:** Sends counts to the backend. The server compares counted units against ledger balances and computes variances.

---

## 7. Variance Resolution & Recount Workflow

### Post-Submission Variance Audit Table
- Displayed to the Store Manager after counts are submitted:
  1. **Product & SKU:** Variant description and code.
  2. **System Expected Qty:** Now revealed to the manager.
  3. **Physical Counted Qty:** Units entered by the counter.
  4. **Variance (Delta):** Difference in base units (e.g. `-2 packs` or `+1 bottle`) and percentage.
  5. **Status Pill:**
     - `Match` (Green): Count matches ledger.
     - `Deficit` (Red): Physical units missing (shrinkage/breakage).
     - `Surplus` (Amber): Physical units found exceeding computer records.
     - `Requires Recount` (Yellow): Variance exceeded threshold policy; manager must send a second counter to recount before approval.

### Recount Input Field
- If flagged, a dedicated `Recount Qty` input appears. The recount value overrides the first count upon verification.

---

## 8. Final Resolution & Ledger Adjustment

### Manager Sign-Off Section
- **Mandatory Resolution Reason:** Text field explaining the root cause of variances (e.g. *"Damaged carton discovered behind shelf 3; wrote off 2 units"*).
- **Actions:**
  - **`Approve Adjustments & Commit Ledger` Button:**
    - Atomically creates `STOCK_ADJUSTMENT` append-only movements in the ledger to reconcile system balances to physical counts.
    - Transitions session from `SUBMITTED` to `APPROVED`.
    - **Unfreezes the location**, restoring normal POS sales.
  - **`Abort Audit` Button:**
    - Discards counts without altering inventory balances.
    - Unfreezes the location immediately.
