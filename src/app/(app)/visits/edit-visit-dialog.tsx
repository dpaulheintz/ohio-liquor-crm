'use client';

import { useState, useEffect } from 'react';
import { updateVisit } from '@/app/actions/visits';
import { VisitLog, KPI_OPTIONS } from '@/lib/types';
import { formatEST } from '@/lib/date-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface EditVisitDialogProps {
  visit: VisitLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function toDatetimeLocal(isoString: string): string {
  const d = new Date(isoString);
  const est = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = est.getFullYear();
  const m = String(est.getMonth() + 1).padStart(2, '0');
  const day = String(est.getDate()).padStart(2, '0');
  const h = String(est.getHours()).padStart(2, '0');
  const min = String(est.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

export function EditVisitDialog({ visit, open, onOpenChange, onSuccess }: EditVisitDialogProps) {
  const [notes, setNotes] = useState('');
  const [kpi, setKpi] = useState('');
  const [visitedAt, setVisitedAt] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visit && open) {
      setNotes(visit.notes || '');
      setKpi(visit.kpi || '');
      setVisitedAt(toDatetimeLocal(visit.visited_at));
    }
  }, [visit, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!visit) return;
    setLoading(true);

    try {
      await updateVisit(visit.id, {
        notes: notes || undefined,
        kpi: kpi || undefined,
        visitedAt: new Date(visitedAt).toISOString(),
      });
      toast.success('Visit updated');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error('Failed to update visit');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Visit</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="visit_notes">Notes</Label>
            <Textarea
              id="visit_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Visit notes..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>KPI</Label>
            <Select value={kpi} onValueChange={setKpi}>
              <SelectTrigger>
                <SelectValue placeholder="Select KPI (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {KPI_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visit_datetime">Date & Time (EST)</Label>
            <Input
              id="visit_datetime"
              type="datetime-local"
              value={visitedAt}
              onChange={(e) => setVisitedAt(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Update'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
