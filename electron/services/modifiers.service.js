// Item add-ons ("extra cheese", "no onion"). The list is the `sector_addons`
// setting that onboarding already saves and the settings screen edits. Each
// sold line keeps its own copy of the add-ons, so later price edits never
// change an old receipt.
const SettingsRepository = require('../repositories/settings.repository');

const MAX_PER_LINE = 10;

function parseModifiers(json) {
  try {
    const list = JSON.parse(json || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function getCatalog() {
  return parseModifiers(SettingsRepository.get('sector_addons'))
    .map((addon) => ({ name: String(addon?.name ?? '').trim(), price: Number(addon?.price) }))
    .filter((addon) => addon.name && Number.isFinite(addon.price) && addon.price >= 0);
}

// Turns the add-on names the till sent into catalog entries, priced here and
// not by the till. Returns them with the amount they add to one unit.
function resolveModifiers(names, catalog = getCatalog()) {
  if (names == null) return { modifiers: [], extra: 0 };
  if (!Array.isArray(names) || names.length > MAX_PER_LINE) throw new Error('الإضافات غير صالحة');
  const modifiers = [...new Set(names.map((name) => String(name ?? '').trim()))].map((name) => {
    const found = catalog.find((addon) => addon.name === name);
    if (!found) throw new Error(`الإضافة "${name}" مش موجودة في قائمة الإضافات`);
    return found;
  });
  const extra = Math.round(modifiers.reduce((sum, addon) => sum + addon.price, 0) * 100) / 100;
  return { modifiers, extra };
}

// The free kitchen note on one line ("no onion"). Plain text, kept short.
const MAX_NOTE_LENGTH = 120;
function cleanNote(note) {
  if (note == null) return null;
  if (typeof note !== 'string') throw new Error('ملاحظة الصنف غير صالحة');
  const text = note.replace(/\s+/g, ' ').trim();
  if (text.length > MAX_NOTE_LENGTH) throw new Error(`ملاحظة الصنف أطول من ${MAX_NOTE_LENGTH} حرف`);
  return text || null;
}

function serializeModifiers(modifiers) {
  return modifiers?.length ? JSON.stringify(modifiers) : null;
}

module.exports = { getCatalog, resolveModifiers, parseModifiers, serializeModifiers, cleanNote, MAX_NOTE_LENGTH };
