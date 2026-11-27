import { Prisma } from '@prisma/client';

type ReceiptDiscrepancy = {
  transferId: string;
  transferNumber: string;
  receiptId: string | null;
  variantId: string;
  sku: string;
  sourceName: string;
  destinationName: string;
  receivedAt: Date;
  timezone: string;
  short: number;
  damaged: number;
  excess: number;
  note: string | null;
};

function receiptDiscrepancyRows(filter: Prisma.Sql) {
  // Old ledger rows lack a receipt ID. Keep their original timestamp grouping
  // so separate legacy receipts cannot be merged based on timing or note text.
  return Prisma.sql`
    SELECT t.id AS "transferId", t.transfer_number AS "transferNumber", m.receipt_id AS "receiptId",
      v.id AS "variantId", v.sku, source.name AS "sourceName", dest.name AS "destinationName",
      MIN(m.created_at) AS "receivedAt", c.timezone,
      SUM(CASE WHEN m.reference_type = 'transfer_shortage' THEN -(m.quantity_base_units::bigint) ELSE 0 END)::float8 AS short,
      SUM(CASE WHEN m.reference_type = 'transfer' THEN m.quantity_base_units ELSE 0 END)::float8 AS damaged,
      SUM(CASE WHEN m.reference_type = 'transfer_excess' THEN m.quantity_base_units ELSE 0 END)::float8 AS excess,
      string_agg(DISTINCT NULLIF(m.notes, ''), ' / ' ORDER BY NULLIF(m.notes, '')) AS note
    FROM inventory_movements m
    JOIN transfers t ON t.id = m.reference_id
    JOIN variants v ON v.id = m.variant_id
    JOIN locations source ON source.id = t.source_location_id
    JOIN locations dest ON dest.id = t.dest_location_id
    JOIN companies c ON c.id = dest.company_id
    WHERE m.type = 'TRANSFER_RECEIPT'
      AND ((m.reference_type = 'transfer_shortage' AND m.location_id = t.source_location_id
            AND m.stock_state = 'IN_TRANSIT' AND m.quantity_base_units < 0)
        OR (m.reference_type IN ('transfer', 'transfer_excess') AND m.location_id = t.dest_location_id
            AND m.stock_state = 'QUARANTINED' AND m.quantity_base_units > 0))
      AND (${filter})
    GROUP BY t.id, v.id, source.name, dest.name, c.timezone, m.receipt_id, m.actor_id,
      CASE WHEN m.receipt_id IS NULL THEN m.created_at END
  `;
}

export function receiptDiscrepancies(db: Prisma.TransactionClient, filter: Prisma.Sql, limit?: number) {
  return db.$queryRaw<ReceiptDiscrepancy[]>(Prisma.sql`
    SELECT * FROM (${receiptDiscrepancyRows(filter)}) receipt
    ORDER BY "receivedAt" DESC, "transferId", "variantId", "receiptId", short, damaged, excess, note
    ${limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
  `);
}

type ReceiptAlert = Pick<ReceiptDiscrepancy, 'transferId' | 'transferNumber' | 'receiptId' | 'sourceName' | 'destinationName'
  | 'receivedAt' | 'timezone' | 'short' | 'damaged' | 'excess'>;

export function receiptDiscrepancyAlerts(db: Prisma.TransactionClient, filter: Prisma.Sql) {
  return db.$queryRaw<ReceiptAlert[]>(Prisma.sql`
    SELECT "transferId", "transferNumber", "receiptId", "sourceName", "destinationName", timezone,
      MAX("receivedAt") AS "receivedAt", SUM(short) AS short, SUM(damaged) AS damaged, SUM(excess) AS excess
    FROM (${receiptDiscrepancyRows(filter)}) receipt
    GROUP BY "transferId", "transferNumber", "receiptId", "sourceName", "destinationName", timezone
    ORDER BY "receivedAt" DESC, "transferId", "receiptId" LIMIT 100
  `);
}
