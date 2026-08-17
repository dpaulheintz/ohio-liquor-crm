'use client';

import { useState, useMemo } from 'react';
import {
  type BarrelPick,
  type PipelineStage,
  PIPELINE_STAGES,
  BARREL_TYPES,
  CUSTOMER_TYPES,
} from '@/app/actions/barrel-pick-constants';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO, differenceInDays } from 'date-fns';

const STAGE_LABELS: Record<PipelineStage, string> = {
  prospect: 'Prospect',
  scheduled: 'Scheduled',
  picked: 'Picked',
  in_production: 'In Production',
  ready_for_delivery: 'Ready',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STAGE_BADGE_CLASS: Record<PipelineStage, string> = {
  prospect: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  picked: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  in_production: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  ready_for_delivery: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  delivered: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

type SortKey = 'customer' | 'type' | 'barrel' | 'status' | 'pick_date' | 'yield' | 'value' | 'rep' | 'days';
type Rep = { id: string; full_name: string | null; email: string };

interface Props {
  picks: BarrelPick[];
  reps: Rep[];
  onRefresh: () => void;
  onSelect: (id: string) => void;
}

export function BarrelPickList({ picks, reps, onSelect }: Props) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [barrelFilter, setBarrelFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [repFilter, setRepFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('customer');
  const [sortAsc, setSortAsc] = useState(true);

  const filtered = useMemo(() => {
    let list = picks;
    if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter);
    if (barrelFilter !== 'all') list = list.filter(p => p.barrel_type === barrelFilter);
    if (typeFilter !== 'all') list = list.filter(p => p.customer_type === typeFilter);
    if (repFilter !== 'all') list = list.filter(p => p.rep_id === repFilter);
    return list;
  }, [picks, statusFilter, barrelFilter, typeFilter, repFilter]);

  const sorted = useMemo(() => {
    const now = new Date();
    const list = [...filtered];
    list.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'customer': cmp = a.customer_name.localeCompare(b.customer_name); break;
        case 'type': cmp = a.customer_type.localeCompare(b.customer_type); break;
        case 'barrel': cmp = a.barrel_type.localeCompare(b.barrel_type); break;
        case 'status': cmp = PIPELINE_STAGES.indexOf(a.status as PipelineStage) - PIPELINE_STAGES.indexOf(b.status as PipelineStage); break;
        case 'pick_date': cmp = (a.pick_date ?? '').localeCompare(b.pick_date ?? ''); break;
        case 'yield': cmp = (a.actual_yield ?? a.expected_yield) - (b.actual_yield ?? b.expected_yield); break;
        case 'value': cmp = Number(a.total_value) - Number(b.total_value); break;
        case 'rep': cmp = (a.rep?.full_name ?? '').localeCompare(b.rep?.full_name ?? ''); break;
        case 'days': {
          const da = differenceInDays(now, parseISO(a.updated_at));
          const db = differenceInDays(now, parseISO(b.updated_at));
          cmp = da - db;
          break;
        }
      }
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(true); }
  }

  function exportCsv() {
    const headers = ['Customer', 'Type', 'Barrel Type', 'Half', 'Status', 'Pick Date', 'Expected Yield', 'Actual Yield', 'Price/Bottle', 'Total Value', 'Rep', 'Days in Stage'];
    const rows = sorted.map(p => [
      p.customer_name,
      p.customer_type,
      p.barrel_type,
      p.is_half_barrel ? 'Yes' : 'No',
      STAGE_LABELS[p.status as PipelineStage],
      p.pick_date ?? '',
      p.expected_yield,
      p.actual_yield ?? '',
      p.price_per_bottle,
      p.total_value,
      p.rep?.full_name ?? '',
      differenceInDays(new Date(), parseISO(p.updated_at)),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `barrel-picks-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const SortHeader = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort(k)}>
      <span className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn('h-3 w-3', sortKey === k ? 'text-foreground' : 'text-muted-foreground/50')} />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {PIPELINE_STAGES.map(s => <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={barrelFilter} onValueChange={setBarrelFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Barrel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Barrels</SelectItem>
            {BARREL_TYPES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Customer Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {CUSTOMER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={repFilter} onValueChange={setRepFilter}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="Rep" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reps</SelectItem>
            {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name ?? r.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="ml-auto h-8 text-xs" onClick={exportCsv}>
          <Download className="h-3 w-3 mr-1" /> CSV
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHeader k="customer">Customer</SortHeader>
              <SortHeader k="type">Type</SortHeader>
              <SortHeader k="barrel">Barrel</SortHeader>
              <SortHeader k="status">Status</SortHeader>
              <SortHeader k="pick_date">Pick Date</SortHeader>
              <SortHeader k="yield">Yield</SortHeader>
              <SortHeader k="value">Total Value</SortHeader>
              <SortHeader k="rep">Rep</SortHeader>
              <SortHeader k="days">Days in Stage</SortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  No barrel picks match the current filters
                </TableCell>
              </TableRow>
            ) : sorted.map(p => (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelect(p.id)}
              >
                <TableCell className="font-medium">{p.customer_name}</TableCell>
                <TableCell className="text-xs">{p.customer_type}</TableCell>
                <TableCell>
                  <span className="text-xs">{p.barrel_type}</span>
                  {p.is_half_barrel && <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">Half</Badge>}
                </TableCell>
                <TableCell>
                  <Badge className={cn('text-[10px]', STAGE_BADGE_CLASS[p.status as PipelineStage])}>
                    {STAGE_LABELS[p.status as PipelineStage]}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {p.pick_date ? format(parseISO(p.pick_date), 'MMM d, yyyy') : '—'}
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {p.actual_yield ?? p.expected_yield}
                  {p.actual_yield && <span className="text-muted-foreground ml-1">(actual)</span>}
                </TableCell>
                <TableCell className="font-medium tabular-nums">
                  ${Number(p.total_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </TableCell>
                <TableCell className="text-xs">{p.rep?.full_name ?? '—'}</TableCell>
                <TableCell className="text-xs tabular-nums">
                  {differenceInDays(new Date(), parseISO(p.updated_at))}d
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
