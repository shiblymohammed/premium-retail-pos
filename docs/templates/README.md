# Client data templates

These CSV files are blank import-preparation templates. They do not load data into the application; there is no bulk CSV importer in the current release. Use them to collect and validate client data before entering it through the authenticated screens or approved APIs.

## Suggested order

1. `companies.csv`: create the company and confirm currency, timezone, and invoice prefix.
2. `locations.csv`: create the main warehouse first, then sub-warehouses and retail stores. Use exact company and parent names for mapping.
3. `products.csv`: create categories first if needed. Super Admins and Admins can edit selling prices by default. Super Admins and staff with an explicit price grant plus product cost access can edit purchase prices. Each change requires a reason. For products with variants, put one row per variant and use consistent product-level fields.
4. `opening-stock.csv`: load only after locations and SKUs exist. Quantities are canonical base units, not cartons; the opening-stock API creates permanent ledger movements.
5. `staff.csv`: create accounts, assign location access, then link employee profiles. Create passwords in the app; never put passwords in a spreadsheet.

## Handling

- Keep files in approved encrypted storage and share them only with authorized client staff.
- Do not add live credentials, payment references, or unnecessary personal data.
- Keep a copy of the client-approved source file and record who entered the data and when.
- These templates use names for human review; the application APIs use IDs. Resolve names to the exact records before manual entry.
