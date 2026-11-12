import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import SalonPage from '../../src/pages/SalonPage.jsx';
import * as salonApi from '../../src/api/salon.js';

vi.mock('../../src/api/salon.js', () => {
  const method = (value) => vi.fn().mockResolvedValue(value);
  return {
    getSalonAppointments: method([
      { id: 7, status: 'booked', start_time: '14:30', end_time: '15:00', customer_name: 'أحمد', customer_phone: '01012345678', service_name: 'قص شعر', service_price: 150, stylist_id: null, chair_name: null },
    ]),
    getAllSalonServices: method([{ id: 1, name: 'قص شعر', category: 'شعر', duration_minutes: 30, price: 150, commission_type: 'percentage', commission_value: 20 }]),
    getSalonBarbersWithStats: method([{ id: 3, full_name: 'محمود', servicesCount: 2, totalSales: 300, totalCommission: 60, totalTips: 10, isCheckedIn: true }]),
    getAllSalonChairs: method([]),
    getSalonTipPoolSummary: method({ total_tip_pool: 0 }),
    getAllSalonPackages: method([]),
    getAllSalonCoupons: method([]),
    createSalonService: method({ id: 2 }),
    updateSalonAppointmentStatus: method({}),
    getSalonWhatsAppReminderLink: method({ url: 'https://api.whatsapp.com/send?phone=201012345678' }),
  };
});

describe('SalonPage', () => {
  it('opens on the day schedule and moves an appointment to confirmed', async () => {
    render(<SalonPage />);
    const row = (await screen.findByText('أحمد')).closest('tr');
    fireEvent.click(within(row).getByRole('button', { name: 'مؤكد' }));
    expect(salonApi.updateSalonAppointmentStatus).toHaveBeenCalledWith(7, 'confirmed');
    expect(await screen.findByText('الحالة بقت: مؤكد.')).toBeInTheDocument();
  });

  it('opens WhatsApp with the reminder link from the main process', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<SalonPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'تذكير واتساب' }));
    await screen.findByText(/اتفتح واتساب/);
    expect(open).toHaveBeenCalledWith('https://api.whatsapp.com/send?phone=201012345678', '_blank');
    open.mockRestore();
  });

  it('shows team commissions and refuses a service without a price', async () => {
    render(<SalonPage />);
    fireEvent.click(screen.getByRole('button', { name: /الحلاقين والعمولات/ }));
    expect(await screen.findByText('محمود')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /الخدمات والأسعار/ }));
    fireEvent.click(await screen.findByRole('button', { name: /خدمة جديدة/ }));
    const form = screen.getByRole('form', { name: 'خدمة جديدة' });
    fireEvent.change(within(form).getByLabelText('اسم الخدمة *'), { target: { value: 'ذقن' } });
    fireEvent.submit(form);
    expect(await within(form).findByRole('alert')).toHaveTextContent('سعر صحيح');
    expect(salonApi.createSalonService).not.toHaveBeenCalled();
  });
});
