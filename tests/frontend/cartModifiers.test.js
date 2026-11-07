import { applyModifiers, lineKey, parseAddonCatalog } from '../../src/utils/cartModifiers.js';

const catalog = [
  { name: 'جبنة زيادة', price: 10 },
  { name: 'من غير بصل', price: 0 },
];
const sandwich = { variantId: 7, productName: 'شاورما', unitPrice: 50, quantity: 3 };

describe('cart add-ons', () => {
  test('parseAddonCatalog drops broken entries and bad JSON', () => {
    expect(parseAddonCatalog('[{"name":" جبنة ","price":"5"},{"name":"","price":1},{"name":"x","price":-1}]'))
      .toEqual([{ name: 'جبنة', price: 5 }]);
    expect(parseAddonCatalog('not json')).toEqual([]);
  });

  test('moves part of a line onto add-ons and prices it', () => {
    const cart = applyModifiers([sandwich], sandwich, ['جبنة زيادة', 'من غير بصل'], 1, catalog);
    expect(cart).toHaveLength(2);
    expect(cart[0]).toMatchObject({ quantity: 2, unitPrice: 50 });
    expect(cart[1]).toMatchObject({ quantity: 1, unitPrice: 60, basePrice: 50 });
    expect(cart[1].modifiers.map((m) => m.name)).toEqual(['جبنة زيادة', 'من غير بصل']);
  });

  test('removing all add-ons merges the units back into the plain line', () => {
    const split = applyModifiers([sandwich], sandwich, ['جبنة زيادة'], 1, catalog);
    const merged = applyModifiers(split, split[1], [], 1, catalog);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ quantity: 3, unitPrice: 50 });
  });

  test('same add-ons leave the cart untouched', () => {
    const cart = [sandwich];
    expect(applyModifiers(cart, sandwich, [], 3, catalog)).toBe(cart);
  });

  test('a kitchen note splits units into their own line, trimmed', () => {
    const cart = applyModifiers([sandwich], sandwich, [], 1, catalog, '  من غير   طحينة ');
    expect(cart).toHaveLength(2);
    expect(cart[1]).toMatchObject({ quantity: 1, note: 'من غير طحينة', unitPrice: 50 });
    expect(applyModifiers(cart, cart[1], [], 1, catalog, '')).toHaveLength(1);
  });

  test('lineKey ignores add-on order', () => {
    const a = { variantId: 1, modifiers: [{ name: 'b' }, { name: 'a' }] };
    const b = { variantId: 1, modifiers: [{ name: 'a' }, { name: 'b' }] };
    expect(lineKey(a)).toBe(lineKey(b));
  });
});
