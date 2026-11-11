import { bucketAppointments, sectorTermsFor, whatsappUrl } from '../../src/pages/TodayPage.jsx';

describe('Today page sector cards', () => {
  test('booking sectors get appointment cards, everything else gets stock cards', () => {
    for (const key of ['auto_workshop', 'maintenance', 'salon_barbershop', 'subscriptions_gym']) {
      expect(sectorTermsFor(key).mode).toBe('appointments');
    }
    for (const key of ['grocery', 'retail', 'electronics', 'spare_parts', 'cafe_restaurant', 'custom', undefined]) {
      expect(sectorTermsFor(key).mode).toBe('stock');
    }
    expect(sectorTermsFor('grocery').title).toContain('سوبر ماركت');
  });
});

const now = new Date(2026, 10, 11, 12, 0);
const appt = (id, status, start, end) => ({ id, status, start, end });

describe('Today page appointment buckets', () => {
  const list = [
    appt(1, 'booked', new Date(2026, 10, 11, 9, 0), new Date(2026, 10, 11, 18, 0)),
    appt(2, 'confirmed', new Date(2026, 10, 10, 9, 0), new Date(2026, 10, 10, 17, 0)),
    appt(3, 'completed', new Date(2026, 10, 11, 8, 0), new Date(2026, 10, 11, 9, 0)),
    appt(4, 'cancelled', new Date(2026, 10, 11, 10, 0), new Date(2026, 10, 11, 11, 0)),
    appt(5, 'booked', new Date('bad'), new Date('bad')),
  ];
  const { schedule, pending, late } = bucketAppointments(list, now);

  test('schedule holds today only, without cancelled ones', () => {
    expect(schedule.map((a) => a.id)).toEqual([1, 3]);
  });

  test('pending is booked and not yet due; late is open and past its end', () => {
    expect(pending.map((a) => a.id)).toEqual([1]);
    expect(late.map((a) => a.id)).toEqual([2]);
  });

  test('local Egyptian numbers get the country code', () => {
    expect(whatsappUrl('010-1234 5678')).toBe('https://wa.me/201012345678');
    expect(whatsappUrl('+201012345678')).toBe('https://wa.me/201012345678');
  });
});
