'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DateTimePickerProps {
  /** Combined value in datetime-local format: "YYYY-MM-DDTHH:mm" */
  value: string;
  onChange: (datetimeLocal: string) => void;
  idPrefix?: string;
  disabled?: boolean;
}

/**
 * Split date + time picker. Uses the native calendar popup on supported
 * browsers/mobile and keeps the combined datetime-local string in sync.
 * Value format: "YYYY-MM-DDTHH:mm".
 */
export function DateTimePicker({
  value,
  onChange,
  idPrefix = 'dt',
  disabled,
}: DateTimePickerProps) {
  const [datePart, timePart] = (value || '').split('T');

  function handleDateChange(newDate: string) {
    onChange(`${newDate}T${timePart || '00:00'}`);
  }

  function handleTimeChange(newTime: string) {
    const time = newTime.length === 5 ? newTime : `${newTime}:00`.slice(0, 5);
    onChange(`${datePart || new Date().toISOString().slice(0, 10)}T${time}`);
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-date`} className="text-xs text-muted-foreground">
          Date
        </Label>
        <Input
          id={`${idPrefix}-date`}
          type="date"
          value={datePart || ''}
          onChange={(e) => handleDateChange(e.target.value)}
          disabled={disabled}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${idPrefix}-time`} className="text-xs text-muted-foreground">
          Time
        </Label>
        <Input
          id={`${idPrefix}-time`}
          type="time"
          value={timePart?.slice(0, 5) || ''}
          onChange={(e) => handleTimeChange(e.target.value)}
          disabled={disabled}
          required
        />
      </div>
    </div>
  );
}
