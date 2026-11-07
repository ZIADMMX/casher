// Kitchen tickets: the cook's paper copy of a sale order or a table round.
// Items are split by prep station (grill, bar, desserts...) so each station's
// printer gets only its own items. Stations are the `prep_stations` setting:
// [{ name, printer, categoryIds }]. Items whose category has no station go to
// `kitchen_printer_name`. A station or kitchen without a printer prints nothing.
const SettingsRepository = require('../repositories/settings.repository');
const kitchenRepo = require('../repositories/kitchen.repository');
const tablesRepo = require('../repositories/tables.repository');
const { requireAuth } = require('./auth.service');
const { logError } = require('./logger.service');

const MAX_STATIONS = 20;

function getStations(json = SettingsRepository.get('prep_stations')) {
  let list;
  try {
    list = JSON.parse(json || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_STATIONS)
    .map((station) => ({
      name: String(station?.name ?? '').trim(),
      printer: String(station?.printer ?? '').trim(),
      categoryIds: Array.isArray(station?.categoryIds)
        ? station.categoryIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
        : [],
    }))
    .filter((station) => station.name);
}

// The station an item is prepared at, or null for the main kitchen.
function stationFor(item, stations) {
  return stations.find((station) => station.categoryIds.includes(Number(item.category_id))) || null;
}

// [{ stationName, printer, items }] in station order, main kitchen first; empty groups dropped.
function splitByStation(items, stations, kitchenPrinter) {
  const groups = [{ stationName: null, printer: kitchenPrinter || '', items: [] }]
    .concat(stations.map((station) => ({ stationName: station.name, printer: station.printer, items: [] })));
  for (const item of items) {
    const station = stationFor(item, stations);
    groups[station ? stations.indexOf(station) + 1 : 0].items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}

function loadTicket({ saleId, roundId } = {}) {
  const id = Number(roundId ?? saleId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('رقم الطلب غير صالح');
  const ticket = roundId != null ? tablesRepo.getRoundTicket(id) : kitchenRepo.getSaleTicket(id);
  if (!ticket) throw new Error('طلب المطبخ غير موجود');
  return ticket;
}

// Prints every station's part of the order. One failing printer does not stop
// the others; failures come back so the till can warn the cashier.
async function printKitchenTicket(ref) {
  requireAuth();
  const print = require('./print.service');
  const ticket = loadTicket(ref);
  const groups = splitByStation(ticket.items, getStations(), SettingsRepository.get('kitchen_printer_name'));
  const paperSize = SettingsRepository.get('receipt_paper_size');
  const result = { printed: [], failed: [] };

  for (const group of groups) {
    if (!group.printer) continue;
    const label = group.stationName || 'المطبخ';
    try {
      if (!print.isValidPrinterName(group.printer)) throw new Error('اسم الطابعة غير صالح');
      const html = print.buildKitchenTicketHtml({ ...ticket, items: group.items }, { paperSize, stationName: group.stationName });
      await print.printHtml(html, { printerName: group.printer });
      await print.cutPaper({ printerName: group.printer }).catch(() => {});
      result.printed.push(label);
    } catch (error) {
      logError('KitchenTicketPrint', error);
      result.failed.push({ station: label, error: error.message });
    }
  }
  return result;
}

module.exports = { getStations, stationFor, splitByStation, printKitchenTicket };
