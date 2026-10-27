'use client';

import { savePaycode } from '@/app/actions/payroll';
import type { Paycode } from '@/lib/payroll/types';
import { EditableTable } from '../editable-table';

export function PaycodesClient({ paycodes }: { paycodes: Paycode[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Our earning types → Paycom earning codes. The seeded codes are placeholders until we confirm Paycom’s real codes.</p>
      <EditableTable
        columns={[
          { key: 'earning_type', label: 'Our earning type', mono: true, width: '180px' },
          { key: 'paycom_earning_code', label: 'Paycom earning code', mono: true },
          { key: 'description', label: 'Description' },
          { key: 'kind', label: 'Kind', type: 'select', options: [{ value: 'hours', label: 'Hours × rate' }, { value: 'amount', label: 'Amount' }], width: '140px' },
          { key: 'manual_only', label: 'Manual only', type: 'checkbox', width: '90px' },
          { key: 'sort_order', label: 'Order', type: 'number', width: '80px' },
        ]}
        rows={paycodes}
        blank={{ earning_type: '', paycom_earning_code: '', description: '', kind: 'amount', manual_only: true, sort_order: 100 }}
        onSave={(id, r) => savePaycode(id, {
          earning_type: String(r.earning_type ?? ''), paycom_earning_code: String(r.paycom_earning_code ?? ''), description: String(r.description ?? ''),
          kind: r.kind === 'hours' ? 'hours' : 'amount', manual_only: !!r.manual_only, sort_order: Number(r.sort_order) || 0,
        })}
        addLabel="Add earning type"
      />
    </div>
  );
}
