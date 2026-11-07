// Prep stations (grill, bar, desserts...) from the `prep_stations` setting.
// Same rules as electron/services/kitchenTicket.service.js: an item goes to the
// station that lists its category, otherwise to the main kitchen.

export function parsePrepStations(json) {
  let list;
  try {
    list = JSON.parse(json || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((station) => ({
      name: String(station?.name ?? '').trim(),
      printer: String(station?.printer ?? '').trim(),
      categoryIds: Array.isArray(station?.categoryIds)
        ? station.categoryIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
        : [],
    }))
    .filter((station) => station.name);
}

// The station name an item is prepared at, or '' for the main kitchen.
export function stationOf(item, stations) {
  return stations.find((station) => station.categoryIds.includes(Number(item.category_id)))?.name || '';
}
