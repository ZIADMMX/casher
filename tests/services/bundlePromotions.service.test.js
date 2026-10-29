jest.mock('../../electron/repositories/settings.repository', () => ({
  get: jest.fn(() => null),
  set: jest.fn(),
}));
jest.mock('../../electron/repositories/productVariants.repository', () => ({
  getById: jest.fn((id) => (id > 0 ? { id, selling_price: id === 1 ? 10 : 20 } : null)),
}));

const SettingsRepository = require('../../electron/repositories/settings.repository');
const bundlePromotionsService = require('../../electron/services/bundlePromotions.service');

describe('bundlePromotions.service', () => {
  const buyTwoGetOne = {
    id: 'free-one',
    name: 'اشتر قطعتين والثالثة مجانًا',
    type: 'buy_x_get_y',
    buyQuantity: 2,
    freeQuantity: 1,
    eligibleVariantIds: [1, 2],
    active: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('calculates the cheapest eligible units as free across mixed selected products', () => {
    const promotion = bundlePromotionsService.getBestBundlePromotion([
      { variantId: 1, quantity: 2, unitPrice: 20 },
      { variantId: 2, quantity: 1, unitPrice: 10 },
      { variantId: 3, quantity: 5, unitPrice: 100 },
    ], [buyTwoGetOne], Date.parse('2026-10-06T12:00:00Z'));

    expect(promotion).toEqual({ id: 'free-one', name: buyTwoGetOne.name, discount: 10 });
  });

  test('uses the highest saving and does not stack matching offers', () => {
    const fixedPrice = {
      id: 'fixed',
      name: 'قطعتان بسعر خاص',
      type: 'fixed_bundle_price',
      bundleQuantity: 2,
      bundlePrice: 35,
      eligibleVariantIds: [1, 2],
      active: true,
    };

    const items = [
      { variantId: 1, quantity: 2, unitPrice: 20 },
      { variantId: 2, quantity: 1, unitPrice: 10 },
    ];

    expect(bundlePromotionsService.getBestBundlePromotion(
      items, [buyTwoGetOne, fixedPrice], Date.parse('2026-10-06T12:00:00Z')
    )).toEqual({
      id: 'free-one',
      name: buyTwoGetOne.name,
      discount: 10,
    });
    expect(bundlePromotionsService.getBestBundlePromotion(
      items, [fixedPrice], Date.parse('2026-10-06T12:00:00Z')
    )?.discount).toBe(5);
  });

  test('honors activation dates through the end of the selected end date', () => {
    const datedOffer = {
      ...buyTwoGetOne,
      startsAt: '2026-10-06',
      endsAt: '2026-10-06',
    };
    const items = [{ variantId: 1, quantity: 3, unitPrice: 10 }];

    expect(bundlePromotionsService.getBestBundlePromotion(
      items, [datedOffer], Date.parse('2026-10-06T23:59:59Z')
    )?.discount).toBe(10);
    expect(bundlePromotionsService.getBestBundlePromotion(
      items, [datedOffer], Date.parse('2026-10-07T00:00:00Z')
    )).toBeNull();
  });

  test('rejects offers with missing eligible product variants', () => {
    expect(() => bundlePromotionsService.saveBundlePromotions([{
      ...buyTwoGetOne,
      eligibleVariantIds: [1, -1],
    }])).toThrow('اختر متغيرين مختلفين على الأقل');
    expect(SettingsRepository.set).not.toHaveBeenCalled();
  });

  test('persists normalized promotion definitions', () => {
    const saved = bundlePromotionsService.saveBundlePromotions([{
      ...buyTwoGetOne,
      eligibleVariantIds: ['1', '2'],
      buyQuantity: '2',
      freeQuantity: '1',
    }]);

    expect(saved[0]).toEqual(expect.objectContaining({
      name: buyTwoGetOne.name,
      buyQuantity: 2,
      freeQuantity: 1,
      eligibleVariantIds: [1, 2],
    }));
    expect(SettingsRepository.set).toHaveBeenCalledWith('bundle_promotions', JSON.stringify(saved));
  });

  test('previews offers using the current database prices rather than renderer prices', () => {
    SettingsRepository.get.mockReturnValue(JSON.stringify([buyTwoGetOne]));
    const promotion = bundlePromotionsService.previewBundlePromotions([
      { variantId: 1, quantity: 2, unitPrice: 9999 },
      { variantId: 2, quantity: 1, unitPrice: 0 },
    ]);

    expect(promotion.discount).toBe(10);
  });
});
