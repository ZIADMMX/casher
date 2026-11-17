/**
 * @file posPartsLinks.test.jsx
 * @description The POS shortcuts to stock, suppliers and the stock count appear only for a sector that
 * turns the `partsLinks` feature on (no built-in sector does now), and each one opens the right screen/tab
 * (and hides without its permission).
 */
import { describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PosTopBar from '../../src/components/pos/PosTopBar.jsx';
import { getSectorConfig, SECTOR_CONFIGS } from '../../src/utils/sectorConfig.js';

const admin = { username: 'owner', role: 'admin', permissions: [] };
const cashier = { username: 'sara', role: 'cashier', permissions: ['inventory.view'] };

const withParts = () => ({ ...getSectorConfig('retail'), features: { ...getSectorConfig('retail').features, partsLinks: true } });

function bar(sectorKey, { user = admin, onOpenPage = vi.fn() } = {}) {
  const sectorConfig = sectorKey === 'parts' ? withParts() : getSectorConfig(sectorKey);
  render(<PosTopBar storeName="متجر" sectorConfig={sectorConfig} activeShift={null} posSessionUser={user} attendance={{}} onOpenPage={onOpenPage} />);
  return onOpenPage;
}

describe('POS parts shortcuts', () => {
  test('no built-in sector has the flag', () => {
    const flagged = Object.values(SECTOR_CONFIGS).filter((c) => c.features?.partsLinks).map((c) => c.key);
    expect(flagged).toEqual([]);
  });

  test('a sector with the flag shows the four shortcuts and each opens its screen', () => {
    const onOpenPage = bar('parts');
    fireEvent.click(screen.getByRole('button', { name: /المخزون/ }));
    fireEvent.click(screen.getByRole('button', { name: /الأصناف/ }));
    fireEvent.click(screen.getByRole('button', { name: /الموردين/ }));
    fireEvent.click(screen.getByRole('button', { name: /جرد المخزن/ }));
    expect(onOpenPage.mock.calls).toEqual([
      ['branches', { tab: 'stock' }], ['products', {}], ['suppliers', {}], ['branches', { tab: 'counts' }],
    ]);
  });

  test('a cashier without the permission does not see that shortcut', () => {
    bar('parts', { user: cashier });
    expect(screen.getByRole('button', { name: /المخزون/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /الموردين/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /الأصناف/ })).toBeNull();
  });

  test.each(['retail', 'auto_workshop', 'subscriptions_gym'])('%s has no parts shortcuts', (key) => {
    bar(key);
    expect(screen.queryByRole('button', { name: /جرد المخزن/ })).toBeNull();
  });
});
