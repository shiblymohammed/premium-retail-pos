export interface MixedUnitQuantity {
  cartons?: number;
  baseUnits?: number;
  unitsPerCarton: number | null;
}

/** Convert carton and base-unit counts to the canonical integer quantity. */
export function convertToBaseUnits(input: MixedUnitQuantity): number {
  const cartons = input.cartons ?? 0;
  const baseUnits = input.baseUnits ?? 0;
  if (!Number.isSafeInteger(cartons) || cartons < 0 || !Number.isSafeInteger(baseUnits) || baseUnits < 0) {
    throw new RangeError('Cartons and base units must be non-negative safe integers');
  }
  if (cartons > 0 && (!Number.isSafeInteger(input.unitsPerCarton) || (input.unitsPerCarton ?? 0) < 1)) {
    throw new RangeError('This product has no carton conversion; enter quantity in base units only');
  }
  const result = cartons * (input.unitsPerCarton ?? 0) + baseUnits;
  if (!Number.isSafeInteger(result)) throw new RangeError('Converted quantity is too large');
  return result;
}

/** Format a base-unit quantity and, when configured, its carton equivalent. */
export function formatMixedUnitQuantity(quantity: number, baseUnit: string, unitsPerCarton: number | null): string {
  if (!Number.isSafeInteger(quantity)) throw new RangeError('Quantity must be a safe integer');
  if (unitsPerCarton !== null && (!Number.isSafeInteger(unitsPerCarton) || unitsPerCarton < 1)) {
    throw new RangeError('Carton conversion must be a positive integer or null');
  }
  const unit = baseUnit.trim();
  if (!unit) throw new RangeError('Base unit cannot be blank');
  const absolute = Math.abs(quantity);
  const sign = quantity < 0 ? '-' : '';
  const pluralUnit = pluralize(unit);
  if (unitsPerCarton === null) return `${sign}${absolute} ${absolute === 1 ? unit : pluralUnit}`;

  const cartonCount = Math.floor(absolute / unitsPerCarton);
  const remainder = absolute % unitsPerCarton;
  const cartonLabel = cartonCount === 1 ? 'carton' : 'cartons';
  const mixed = [
    cartonCount > 0 ? `${cartonCount} ${cartonLabel}` : '',
    remainder > 0 || cartonCount === 0 ? `${remainder} ${remainder === 1 ? unit : pluralUnit}` : '',
  ].filter(Boolean).join(' + ');
  return `${sign}${absolute} ${absolute === 1 ? unit : pluralUnit} = ${mixed}`;
}

function pluralize(unit: string): string {
  if (/(s|x|z|ch|sh)$/i.test(unit)) return `${unit}es`;
  if (/[^aeiou]y$/i.test(unit)) return `${unit.slice(0, -1)}ies`;
  return `${unit}s`;
}
