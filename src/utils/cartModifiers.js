// Item add-ons in the POS cart. Kept pure so it can be tested directly.
// A cart line is one item with one set of add-ons; the same sandwich plain and
// with extra cheese are two lines. unitPrice always includes the add-ons and
// basePrice is the item's own price.

const roundMoney = (value) => Math.round(value * 100) / 100;
const roundQty = (value) => Math.round(value * 1000) / 1000;

// The add-ons list saved in settings (`sector_addons`), cleaned.
export function parseAddonCatalog(json) {
  let list;
  try {
    list = JSON.parse(json || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((addon) => ({ name: String(addon?.name ?? '').trim(), price: Number(addon?.price) }))
    .filter((addon) => addon.name && Number.isFinite(addon.price) && addon.price >= 0);
}

export function lineKey(item) {
  const names = (item.modifiers || []).map((m) => m.name).sort();
  return [item.variantId, item.unitId || '', item.scaleBarcode || '', ...names].join('|');
}

/**
 * Moves `quantity` units of `line` onto the add-ons `names` (from `catalog`).
 * The rest of the line stays as it was; units that end up identical to
 * another line are merged into it.
 */
export function applyModifiers(cart, line, names, quantity, catalog) {
  const key = lineKey(line);
  const qty = Math.min(Math.max(Number(quantity) || 0, 0), line.quantity);
  const basePrice = line.basePrice ?? line.unitPrice;
  const modifiers = catalog.filter((addon) => names.includes(addon.name));
  const moved = {
    ...line,
    quantity: qty,
    basePrice,
    modifiers,
    unitPrice: roundMoney(basePrice + modifiers.reduce((sum, m) => sum + m.price, 0)),
  };
  const movedKey = lineKey(moved);
  if (qty <= 0 || movedKey === key) return cart;

  const rest = cart.flatMap((item) => {
    if (lineKey(item) !== key) return [item];
    const left = roundQty(item.quantity - qty);
    return left > 0 ? [{ ...item, quantity: left }] : [];
  });
  const target = rest.find((item) => lineKey(item) === movedKey);
  return target
    ? rest.map((item) => (item === target ? { ...item, quantity: roundQty(item.quantity + qty) } : item))
    : [...rest, moved];
}
