# Page Specification: Store Attendance Management (`/attendance/manage`)

## 1. What is this Page?
The **Attendance Management** dashboard is a supervisor tool used by Store Managers and Administrators. It allows managers to set store shift arrival times, project live rotating QR codes on store displays, inspect today's live employee attendance register, execute reasoned punch corrections with audit retention, and generate period attendance reports with CSV downloads.

---

## 2. Location Scoping & Manager Authentication

### Manager Sign-In Card
- Requires login with an authorized `STORE_MANAGER`, `ADMIN`, or `SUPER_ADMIN` account.
- Queries `GET /locations?isActive=true` to retrieve only the physical branches assigned to this supervisor.

### Location Switcher Dropdown
- Located in the top header. Allows managers overseeing multiple retail branches to toggle between stores (e.g. *Downtown Store · Retail Store* vs *North Mall · Retail Store*).
- Switching stores immediately reloads the live register, QR code, and reports for that location.

---

## 3. Location Policy & QR Code Configuration

### Expected Start Time Setting
- **What is it?** A time picker control (e.g. `09:00 AM`) setting the official daily shift start time for this store.
- **Why is it needed?** Automatically distinguishes punctual arrivals from tardy clock-ins across the team.
- **How does it work?**
  - Manager enters time and clicks `Save time`.
  - Calls `PATCH /attendance/locations/:id/target-time`.
  - Future staff clock-ins after this time will automatically be tagged as `Late`.
  - Clearing the field disables late-arrival flagging for this branch.

### Rotating Workplace QR Code Generator & Display
- **What is it?** A live, high-resolution QR code widget displayed on screen.
- **Why is it needed?** Managers project or place this screen at the employee entrance so staff can scan it to prove physical store presence.
- **Auto-Rotation Security:**
  - The QR token expires every **60 seconds**.
  - A background timer calls `GET /attendance/locations/:id/qr-code` every **25 seconds** to generate a fresh cryptographic token before the old one expires.
  - Screenshots or photos forwarded to absent colleagues expire before they can be used.
- **QR Requirement Toggle:**
  - Checkbox: `Require QR scan for each attendance punch`.
  - When checked, employees cannot punch in without scanning the active code.
  - When unchecked, QR scanning is optional.

---

## 4. Live Daily Staff Register Table

### What is inside the table?
Displays all staff members assigned to this store branch today:
1. **Employee Details:** Full name and employee code (e.g. *Ravi Menon · EMP-0842*).
2. **Current Workday Status:**
   - `On time` (Green): Clocked in on or before the target start time.
   - `Late` (Red): Clocked in after the target start time.
   - `Not started` (Gray): Employee has not clocked in yet.
   - `Completed` (Blue): Employee has clocked in and clocked out.
3. **Clock-In Time:** Exact timestamp formatted in the store's timezone, with note if late.
4. **Clock-Out Time:** Shift end timestamp.
5. **QR Verification Column:** Shows `Verified` (scanned physical workplace code) or `Manual`.
6. **Correction Actions (`Edit in` / `Edit out` buttons):** Allows supervisors to correct accidental punch mistakes.

---

## 5. Reasoned Punch Correction Modal

- **What is it?** A supervisor dialog to fix attendance errors (e.g. employee forgot their phone or clocked out by accident).
- **Why is it strictly controlled?** Invariants prohibit silent or arbitrary editing of staff hours.
- **Required Fields:**
  1. **New Timestamp:** Date and time picker formatted in the store timezone.
  2. **Mandatory Correction Reason:** Text field requiring minimum 5 characters (e.g. *"Staff phone battery died at opening; verified presence via CCTV"*).
- **Audit Retention:** The server permanently stores the original punch timestamp, the corrected timestamp, the manager's user ID, and the explanation reason in the audit trail.

---

## 6. Period Attendance Reports & CSV Export

### Controls & Filters
- **Period Dropdown:** `Daily`, `Weekly`, or `Monthly`.
- **Date Picker:** Selects the target day, week, or month.
- **`Generate` Action:** Queries `GET /attendance/locations/:id/reports`.

### Summary Metric Cards
- **Staff Present Ratio:** Count of scheduled employees who worked (e.g. `7 / 8 present`).
- **Total Present Days:** Sum of individual work shifts across the period.
- **Late Arrivals Count:** Cumulative count of tardy arrivals.
- **Total Recorded Hours:** Total cumulative work time (e.g. `142.5 h`).

### Detailed Employee Summary Table
- Lists every employee with their total days present, completed shifts, late count, and total work hours recorded.

### `Export CSV` Button
- Generates and downloads a clean spreadsheet file: `attendance-[period]-[start]-to-[end].csv` containing full daily clock-in/out records for payroll processing.
