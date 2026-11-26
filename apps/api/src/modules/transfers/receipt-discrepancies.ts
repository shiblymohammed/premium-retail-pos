import { Prisma } from '@prisma/client';

type ReceiptDiscrepancy = {
  transferId: string;
  transferNumber: string;
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

export function receiptDiscrepancies(db: Prisma.TransactionClient, filter: Prisma.Sql, limit?: number) {
  // Receipt movements are append-only. PostgreSQL assigns the same transaction timestamp
  // to the movements written by one receipt, including records made before this report.
  return db.$queryRaw<ReceiptDiscrepancy[]>(Prisma.sql`
    SELECT t.id AS "transferId", t.transfer_number AS "transferNumber", v.id AS "variantId", v.sku,
      source.name AS "sourceName", dest.name AS "destinationName", m.created_at AS "receivedAt", c.timezone,
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
    GROUP BY t.id, v.id, source.name, dest.name, c.timezone, m.created_at, m.actor_id
    ORDER BY m.created_at DESC, t.id, v.id, m.actor_id
    ${limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
  `);
}
