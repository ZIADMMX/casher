// Display helpers for the salon page (services, appointments, team).

// Statuses from the salon_appointments CHECK constraint, with the moves the front desk makes.
export const APPOINTMENT_STATUS = {
  booked: { label: 'محجوز', tone: 'info', next: ['confirmed', 'cancelled'] },
  confirmed: { label: 'مؤكد', tone: 'brand', next: ['in_service', 'no_show', 'cancelled'] },
  in_service: { label: 'جاري التنفيذ', tone: 'warning', next: ['completed'] },
  completed: { label: 'تم', tone: 'success', next: [] },
  cancelled: { label: 'ملغي', tone: 'danger', next: [] },
  no_show: { label: 'لم يحضر', tone: 'danger', next: [] },
};

export function commissionLabel(service) {
  const value = Number(service?.commission_value) || 0;
  if (!value) return 'بدون عمولة';
  return service.commission_type === 'fixed'
    ? `${value.toLocaleString('ar-EG')} ج.م ثابت`
    : `${value.toLocaleString('ar-EG')}%`;
}

/** Totals over the rows of getSalonBarbersWithStats; only staff who served someone count as active. */
export function summarizeTeam(barbers = []) {
  return barbers.reduce((sum, b) => ({
    services: sum.services + (Number(b.servicesCount) || 0),
    sales: sum.sales + (Number(b.totalSales) || 0),
    commission: sum.commission + (Number(b.totalCommission) || 0),
    tips: sum.tips + (Number(b.totalTips) || 0),
    active: sum.active + (Number(b.servicesCount) > 0 ? 1 : 0),
  }), { services: 0, sales: 0, commission: 0, tips: 0, active: 0 });
}

/** Counts per status for the day's appointments, plus how many are still to come. */
export function summarizeAppointments(appointments = []) {
  const counts = { total: appointments.length, waiting: 0, completed: 0, lost: 0 };
  for (const a of appointments) {
    if (a.status === 'booked' || a.status === 'confirmed' || a.status === 'in_service') counts.waiting += 1;
    else if (a.status === 'completed') counts.completed += 1;
    else counts.lost += 1;
  }
  return counts;
}

export function stylistName(person) {
  return person?.full_name || person?.stylist_name || person?.username || person?.stylist_username || '—';
}
