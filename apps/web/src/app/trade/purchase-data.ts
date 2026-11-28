type OrderLine = { variantId: string; quantity: number; unitCost: string; variant: { sku: string; product: { name: string; baseUnit: string; unitsPerCarton?: number | null } } };
export type Order = {
  id: string; number: string; supplierName: string; currency: string;
  lines: OrderLine[];
  receipts: Array<{ id: string; receiptNumber: string; lines: Array<{ variantId: string; quantityBaseUnits: number }> }>;
  payments: Array<{ id: string; amount: string; reference: string; createdAt: string; actor: { email: string } }>;
};

export function receivedQuantities(order?: Order) {
  const quantities = new Map<string, number>();
  for (const receipt of order?.receipts ?? []) {
    for (const line of receipt.lines) {
      quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantityBaseUnits);
    }
  }
  return quantities;
}

export function outstandingLines(order: Order) {
  const received = receivedQuantities(order);
  return order.lines
    .map((line) => ({ ...line, remaining: line.quantity - (received.get(line.variantId) ?? 0) }))
    .filter((line) => line.remaining > 0);
}
