import { describe, expect, it } from 'vitest';
import { getSectorIdentity } from '../../src/utils/sectorIdentity.js';

describe('sectorIdentity utility', () => {
  it('returns legal identity for law_firm', () => {
    const identity = getSectorIdentity('law_firm');
    expect(identity.type).toBe('legal');
    expect(identity.isService).toBe(true);
    expect(identity.stepTitle).toContain('التخصصات القضائية');
    expect(identity.serviceBadgeText).toContain('أتعاب قضائية');
    expect(identity.itemColHeader).toContain('الخدمة القانونية');
    expect(identity.priceColHeader).toContain('الأتعاب');
    expect(identity.primaryActionTitle).toContain('ملف قضية');
  });

  it('returns gym identity for subscriptions_gym', () => {
    const identity = getSectorIdentity('subscriptions_gym');
    expect(identity.type).toBe('gym');
    expect(identity.isService).toBe(true);
    expect(identity.serviceBadgeText).toContain('عضوية');
    expect(identity.primaryActionTitle).toContain('مشترك');
  });

  it('returns salon identity for salon_barbershop', () => {
    const identity = getSectorIdentity('salon_barbershop');
    expect(identity.type).toBe('salon');
    expect(identity.isService).toBe(true);
    expect(identity.serviceBadgeText).toContain('خدمة صالون');
  });

  it('returns a standalone CRM identity', () => {
    const identity = getSectorIdentity('crm');
    expect(identity.type).toBe('crm');
    expect(identity.isService).toBe(true);
    expect(identity.successTitle('FOX')).toContain('FOX');
    expect(identity.primaryActionTitle).toContain('عميل');
  });

  it('gives cafes their own menu wording on top of the retail base', () => {
    const identity = getSectorIdentity('cafe_restaurant');
    expect(identity.type).toBe('cafe');
    expect(identity.isService).toBe(false);
    expect(identity.itemsTitle).toContain('المنيو');
    expect(identity.footerReadyText(3, 2)).toContain('المنيو');
    expect(identity.stockColHeader).toBe('المخزون الأولي');
  });

  it('returns retail identity as fallback for undefined or retail', () => {
    const identity = getSectorIdentity('retail');
    expect(identity.type).toBe('retail');
    expect(identity.isService).toBe(false);
    expect(identity.stockColHeader).toBe('المخزون الأولي');

    const fallback = getSectorIdentity(undefined);
    expect(fallback.type).toBe('retail');
  });
});
