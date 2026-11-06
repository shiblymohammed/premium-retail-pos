import { convertToBaseUnits, formatMixedUnitQuantity } from './unit-conversion';

describe('product unit conversion', () => {
  it('converts cartons and loose base units using the product ratio', () => {
    expect(convertToBaseUnits({ cartons: 2, baseUnits: 7, unitsPerCarton: 10 })).toBe(27);
    expect(formatMixedUnitQuantity(27, 'packet', 10)).toBe('27 packets = 2 cartons + 7 packets');
    expect(formatMixedUnitQuantity(-27, 'packet', 10)).toBe('-27 packets = -2 cartons + -7 packets');
    expect(formatMixedUnitQuantity(-20, 'packet', 10)).toBe('-20 packets = -2 cartons');
    expect(formatMixedUnitQuantity(-1, 'packet', null)).toBe('-1 packet');
  });

  it('rejects carton quantities for products without a conversion', () => {
    expect(() => convertToBaseUnits({ cartons: 1, baseUnits: 0, unitsPerCarton: null }))
      .toThrow('This product has no carton conversion');
    expect(convertToBaseUnits({ cartons: 0, baseUnits: 7, unitsPerCarton: null })).toBe(7);
    expect(formatMixedUnitQuantity(7, 'packet', null)).toBe('7 packets');
  });

  it('rejects fractional and overflowing stock quantities', () => {
    expect(() => convertToBaseUnits({ cartons: 1.5, unitsPerCarton: 10 })).toThrow(RangeError);
    expect(() => convertToBaseUnits({ cartons: Number.MAX_SAFE_INTEGER, baseUnits: 1, unitsPerCarton: 1 }))
      .toThrow('Converted quantity is too large');
  });
});
