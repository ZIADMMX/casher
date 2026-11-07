import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import RolesPage, { countChanges } from '../../src/pages/RolesPage.jsx';
import * as enterpriseApi from '../../src/api/enterprise.js';

vi.mock('../../src/api/enterprise.js', () => ({
  getSystemRoles: vi.fn(),
  createSystemRole: vi.fn(),
  setRolePermissions: vi.fn(),
}));

const ROLES = [
  { role_key: 'admin', role_name: 'مدير النظام (Admin)', is_system: 1, user_count: 1, permissions: ['*'] },
  { role_key: 'cashier', role_name: 'كاشير مبيعات (Cashier)', is_system: 1, user_count: 8, permissions: ['pos.view'] },
];

test('countChanges counts added and removed permissions', () => {
  expect(countChanges(['a', 'b'], ['b', 'c'])).toBe(2);
  expect(countChanges(['a'], ['a'])).toBe(0);
});

test('toggling a permission shows the unsaved bar and saves the draft', async () => {
  enterpriseApi.getSystemRoles.mockResolvedValue(ROLES);
  enterpriseApi.setRolePermissions.mockResolvedValue(ROLES);
  render(<RolesPage />);

  fireEvent.click(await screen.findByRole('button', { name: /كاشير مبيعات/ }));
  fireEvent.click(screen.getByRole('switch', { name: /إتمام عملية بيع/ }));

  expect(screen.getByText(/1 تغييرات/)).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: 'حفظ الصلاحيات' }).at(-1));

  await waitFor(() => expect(enterpriseApi.setRolePermissions)
    .toHaveBeenCalledWith('cashier', ['pos.view', 'pos.sell']));
});

test('admin switches are locked', async () => {
  enterpriseApi.getSystemRoles.mockResolvedValue(ROLES);
  render(<RolesPage />);
  expect(await screen.findByRole('switch', { name: /فتح شاشة الكاشير/ })).toBeDisabled();
});
