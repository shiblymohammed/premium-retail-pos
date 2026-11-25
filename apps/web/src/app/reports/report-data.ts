import type { TableData } from './report-ui';

export const EXTRA_REPORTS = {
  ledger: 'movement-ledger',
  lowStock: 'low-stock',
  productPerformance: 'product-performance',
  transferDiscrepancies: 'transfer-discrepancies',
  auditVariances: 'audit-variances',
  priceChanges: 'price-changes',
  cancellations: 'cancellations',
  itemDeletions: 'item-deletions',
} as const;

type DataRow = Record<string, unknown>;

function object(value: unknown): DataRow {
  return value && typeof value === 'object' ? value as DataRow : {};
}

function records(value: unknown): DataRow[] {
  return Array.isArray(value) ? value.map(object) : [];
}

function cell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function at(value: unknown, ...keys: string[]) {
  return cell(keys.reduce<unknown>((current, key) => object(current)[key], value));
}

function route(row: unknown) {
  return `${at(row, 'sourceLocation', 'name')} → ${at(row, 'destLocation', 'name')}`;
}

function table(title: string, headers: string[], rows: string[][], description = `${rows.length} records`): TableData {
  return { title, headers, rows, description };
}

export function toReportTable(report: keyof typeof EXTRA_REPORTS, raw: unknown): TableData {
  const list = records(raw);
  switch (report) {
    case 'ledger':
      return table('Movement ledger', ['Date', 'Movement', 'Location', 'Product', 'SKU', 'Quantity', 'Stock state', 'Route', 'Reference', 'Actor'],
        list.map((item) => [
          cell(item.createdAt), cell(item.type), at(item, 'location', 'name'),
          at(item, 'variant', 'product', 'name'), at(item, 'variant', 'sku'),
          `${cell(item.quantityBaseUnits)} ${at(item, 'variant', 'product', 'baseUnit')}`,
          cell(item.stockState), item.transferRoute ? route(item.transferRoute) : '—',
          `${cell(item.referenceType)} · ${cell(item.documentNumber ?? item.referenceId)}`, at(item, 'actor', 'email'),
        ]));
    case 'lowStock': {
      const lowStock = records(object(raw).lowStock);
      const requests = records(object(raw).replenishments);
      const stockRows = lowStock.map((item) => [
        'Low stock', cell(item.locationName), cell(item.productName), cell(item.sku),
        `${cell(item.available)} ${cell(item.baseUnit)}`, cell(item.reorderLevelBase), '—',
      ]);
      const requestRows = requests.flatMap((request) => records(request.lines).map((line) => [
        'Replenishment', route(request), at(line, 'variant', 'product', 'name'),
        `${at(line, 'variant', 'sku')} · ${cell(request.requestNumber)}`, cell(line.availableQtyBase),
        cell(request.status), cell(line.managerApprovedQtyBase ?? line.systemSuggestedQtyBase),
      ]));
      return table('Low stock & replenishment', ['Type', 'Location / route', 'Product', 'SKU / request', 'Available', 'Reorder / status', 'Suggested quantity'],
        [...stockRows, ...requestRows], `${lowStock.length} stock alerts · ${requests.length} replenishment requests`);
    }
    case 'productPerformance':
      return table('Product performance', ['Product', 'Variant', 'SKU', 'Base unit', 'Net units sold', 'Net sales', 'Available now'],
        list.map((item) => [cell(item.product), cell(item.variant), cell(item.sku), cell(item.baseUnit), cell(item.sold), cell(item.netSales), cell(item.available)]));
    case 'transferDiscrepancies':
      return table('Transfer discrepancies', ['Transfer', 'Status', 'Route', 'Updated', 'SKU', 'Short', 'Damaged', 'Excess'],
        list.flatMap((item) => records(item.lines).map((line) => [
          cell(item.transferNumber), cell(item.status), route(item), cell(item.updatedAt),
          at(line, 'variant', 'sku'), cell(line.shortQtyBase), cell(line.damagedQtyBase), cell(line.excessQtyBase),
        ])));
    case 'auditVariances':
      return table('Stock audit variances', ['Audit', 'Location', 'Status', 'Product', 'SKU', 'Expected', 'Counted', 'Variance', 'Recount'],
        list.map((item) => [
          at(item, 'auditSession', 'id'), at(item, 'auditSession', 'location', 'name'), at(item, 'auditSession', 'status'),
          at(item, 'variant', 'product', 'name'), at(item, 'variant', 'sku'), cell(item.expectedQtyBase),
          cell(item.approvedQtyBase ?? item.recountQtyBase ?? item.countedQtyBase), cell(item.varianceBase),
          item.requiresRecount ? 'Required' : 'No',
        ]));
    case 'priceChanges':
      return table('Price change history', ['Date', 'Product', 'Field', 'Old value', 'New value', 'Reason', 'Changed by'],
        list.map((item) => [
          cell(item.createdAt), at(item, 'product', 'name'), cell(item.fieldChanged), cell(item.oldValue),
          cell(item.newValue), cell(item.reason), at(item, 'changedBy', 'email'),
        ]));
    case 'cancellations':
      return table('Cancelled sales', ['Invoice', 'Location', 'Cancelled at', 'Reason', 'Net total', 'Refunds'],
        list.map((item) => [
          cell(item.invoiceNumber), at(item, 'location', 'name'), cell(item.cancelledAt), cell(item.cancellationReason),
          cell(item.netTotal), cell(records(item.refunds).length),
        ]));
    case 'itemDeletions':
      return table('Item deactivation audit', ['Date', 'Product', 'Actor', 'Action', 'Reason'],
        list.map((item) => [cell(item.createdAt), cell(item.productName), at(item, 'actor', 'email'), cell(item.action), cell(item.reason)]));
  }
}
