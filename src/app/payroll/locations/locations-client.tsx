'use client';

import { saveLocation } from '@/app/actions/payroll';
import type { PayrollLocation } from '@/lib/payroll/types';
import { EditableTable } from '../editable-table';

export function LocationsClient({ locations }: { locations: PayrollLocation[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        “Toast location name” is matched against the Location column and file names to auto-detect each upload. A run can’t be approved until every location it uses has a Paycom location code.
      </p>
      <EditableTable
        columns={[
          { key: 'name', label: 'Location' },
          { key: 'toast_location_name', label: 'Toast location name' },
          { key: 'paycom_location_code', label: 'Paycom location code', mono: true, placeholder: 'blank until confirmed' },
          { key: 'paycom_department_code', label: 'Default Paycom department', mono: true },
          { key: 'active', label: 'Active', type: 'checkbox', width: '70px' },
          { key: 'sort_order', label: 'Order', type: 'number', width: '80px' },
        ]}
        rows={locations}
        blank={{ name: '', toast_location_name: '', paycom_location_code: '', paycom_department_code: '', active: true, sort_order: 100 }}
        onSave={(id, r) => saveLocation(id, {
          name: String(r.name ?? ''), toast_location_name: String(r.toast_location_name ?? ''), paycom_location_code: String(r.paycom_location_code ?? ''),
          paycom_department_code: String(r.paycom_department_code ?? ''), active: !!r.active, sort_order: Number(r.sort_order) || 0,
        })}
        addLabel="Add location"
      />
    </div>
  );
}
