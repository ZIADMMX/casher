import { describe, expect, it } from 'vitest';
import { buildTree } from '../../src/components/crm/CRMCompaniesGrid.jsx';

describe('CRM companies tree', () => {
  it('lists every descendant branch under its top-level company', () => {
    const tree = buildTree([
      { id: 1, name: 'الدلتا' },
      { id: 2, name: 'فرع طنطا', parent_company_id: 1 },
      { id: 3, name: 'فرع طنطا 2', parent_company_id: 2 },
      { id: 4, name: 'الأمانة' },
    ]);
    expect(tree.map((company) => company.id)).toEqual([1, 4]);
    expect(tree[0].branches.map((branch) => branch.id)).toEqual([2, 3]);
    expect(tree[1].branches).toEqual([]);
  });

  it('treats a branch whose parent is missing as a top-level company', () => {
    const tree = buildTree([{ id: 5, name: 'يتيم', parent_company_id: 99 }]);
    expect(tree.map((company) => company.id)).toEqual([5]);
  });
});
