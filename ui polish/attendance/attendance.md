# Page Specification: Staff Daily Attendance (`/attendance`)

## 1. What is this Page?
The **Staff Attendance** screen is a mobile-responsive daily workspace where retail store cashiers, sales associates, and warehouse employees record the start and end of their workday. It validates employee physical presence via rotating workplace QR codes, detects late arrivals against location shift targets, and displays a tamper-evident daily punch timeline.

---

## 2. Authentication & Shift Identification

### Staff Account Sign-In Form
- **What is it?** A streamlined login form requiring Email and Password.
- **Why is it needed?** Employees check in from personal mobile devices or store counter tablets. Every attendance punch must be cryptographically signed by the employee's JWT and verified by the server.
- **How does it work?** Calling `POST /auth/login` returns an access token. The page immediately calls `GET /attendance/me/today` to load the employee's assigned store branch, today's schedule, and existing punches.

### Header Navigation & Actions
- **Brand Title:** Displays *Premium Retail · Staff Attendance*.
- **Manager View Link:** If the signed-in user holds supervisory privileges (`STORE_MANAGER`, `ADMIN`), a "Manager view" shortcut appears linking directly to `/attendance/manage`.
- **Sign Out Button:** Revokes the active token session and returns to the sign-in form.

---

## 3. Daily Workcard & Status Header

### Employee Profile & Local Date Badge
- **What is inside?**
  - Current local date at the workplace (e.g. *Today · 2026-11-18*).
  - Employee Greeting (e.g. *Hello, Ravi*).
  - Workplace Location Name (e.g. *Downtown Store*).
  - Official Employee ID Code (e.g. *EMP-0842*).
- **Why is it needed?** Ensures the worker confirms they are clocking into the correct physical branch under their legal staff identity.

### Workday Lifecycle Status Badge
- Displays one of three states:
  1. **`Not started`:** Employee has not yet clocked in for today's shift.
  2. **`At work`:** Employee has clocked in and their shift is actively in progress.
  3. **`Completed`:** Employee has clocked out and concluded their workday.

---

## 4. Live Clock & Guidance Card

### Interactive Clock Indicator
- **What is inside?**
  - Status heading: *"Your workday is in progress"*, *"Your attendance is complete"*, or *"Ready to start?"*
  - Contextual guidance note:
    - If QR is required: *"Scan the current workplace QR code before marking your next punch."*
    - If QR scanned: *"Workplace QR is ready to verify this punch."*
    - If shift has target start time: *"Target start time: 09:00 AM. Clocking in later will be marked late."*
    - If completed: *"Your start and end times are recorded below."*
- **Why is it needed?** Prevents confusion by telling the worker exactly what action is expected next.

---

## 5. Attendance Action Controls (Punch Button)

### Single-Tap Punch Button (`Start work` / `End work`)
- **What is it?** The primary action button that dynamically reads `Start work →` (when next action is `IN`) or `End work →` (when next action is `OUT`).
- **Why is it needed?** One-touch interaction keeps clock-in effortless during busy store opening rush.
- **How does it work?**
  - Sends `POST /attendance/me/punch`.
  - Automatically submits the temporary `qrToken` if scanned from the workplace wallboard.
  - Returns punch timestamp, late flag, and target start time.
- **Disable Conditions:**
  - Disabled while request is saving.
  - Disabled if location requires workplace QR verification and no valid QR has been scanned yet.

---

## 6. Rotating Workplace QR Code Verification Workflow

### How Workplace Verification Works
1. To prevent staff from clocking in while still at home or on the bus, stores can require a **Workplace QR Code**.
2. The store manager displays a live rotating QR code on a counter tablet or wallboard via `/attendance/manage`.
3. The QR code encodes a secure URL containing a temporary one-time hash: `/attendance#qr=TOKEN_HERE`.
4. The worker scans the wallboard QR with their phone camera, which opens `/attendance` with the token pre-loaded.
5. The page displays: *"Workplace QR scanned. Sign in and mark attendance before the code expires."*
6. When the punch is submitted, the server validates that the QR token was generated within the last 60 seconds for that specific location, confirming the employee is physically present inside the store.

---

## 7. Late Arrival Detection Logic

- **Target Start Time Comparison:** If the store location has configured an expected start time (e.g. `09:00 AM`), the server checks the clock-in timestamp.
- **Late Marking:** If the employee clocks in at `09:16 AM`, the punch is permanently flagged with an `isLate: true` attribute.
- **Visual Alert:** The timeline displays a high-visibility badge: *"Late · After target 09:00"*.

---

## 8. Today's Punches Timeline

### Itemized Punch Entries
- Displays every attendance event recorded for today in chronological order.
- **What is inside each punch entry?**
  1. **Direction Icon:** `↗` for Clock-In (`IN`), `↙` for Clock-Out (`OUT`).
  2. **Event Title:** *"Work started"* or *"Work ended"*.
  3. **Verification Tag:**
     - `QR verified · server recorded`: Confirms employee scanned the rotating workplace code.
     - `Server recorded`: Standard clock-in.
  4. **Late Status Badge:** Bold notification if clocked in past target time.
  5. **Correction Audit Note:** If a store manager adjusted this punch, it displays: *"Corrected: [Reason entered by manager] · Original time retained in manager audit log"*.
  6. **Local Timestamp:** Time formatted in the store location's configured timezone (e.g. `10:14 AM`).
