'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2, Plus, X, Check, Loader2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  createAccountGroup,
  updateAccountGroup,
  deleteAccountGroup,
  previewAccountGroup,
  type AccountGroup,
  type PreviewResult,
} from '@/app/actions/account-groups';

// ─── Color palette ────────────────────────────────────────────────────────────

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#10b981', '#0ea5e9', '#a855f7', '#78716c',
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={cn(
            'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110',
            value === c ? 'border-foreground scale-110' : 'border-transparent'
          )}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
      {/* Custom color */}
      <div className="relative">
        <button
          type="button"
          className={cn(
            'h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 overflow-hidden',
            !PRESET_COLORS.includes(value) ? 'border-foreground scale-110' : 'border-muted-foreground/40'
          )}
          style={{ backgroundColor: value }}
          onClick={() => inputRef.current?.click()}
          title="Custom color"
        />
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </div>
      <span className="text-xs text-muted-foreground font-mono ml-1">{value}</span>
    </div>
  );
}

// ─── Live preview ─────────────────────────────────────────────────────────────

function PreviewPane({ terms, matchColumns }: { terms: string[]; matchColumns: 'wholesaler' | 'dba' | 'both' }) {
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetch = useCallback(async (t: string[], m: 'wholesaler' | 'dba' | 'both') => {
    const clean = t.map(s => s.trim()).filter(Boolean);
    if (clean.length === 0) { setResult(null); return; }
    setLoading(true);
    try {
      const res = await previewAccountGroup(clean, m);
      setResult(res);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetch(terms, matchColumns), 350);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [terms, matchColumns, fetch]);

  if (terms.filter(t => t.trim()).length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
      <div className="flex items-center gap-2 font-medium">
        {loading ? (
          <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking matches…</>
        ) : result ? (
          <><Users className="h-3.5 w-3.5" />
            <span>
              <strong>{result.count.toLocaleString()}</strong> matching rows
            </span>
          </>
        ) : null}
      </div>
      {!loading && result && result.samples.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.samples.map((s) => (
            <span key={s} className="inline-flex items-center rounded-md bg-background border px-2 py-0.5 text-xs">
              {s}
            </span>
          ))}
          {result.count > result.samples.length && (
            <span className="text-xs text-muted-foreground self-center">
              +{(result.count - result.samples.length).toLocaleString()} more…
            </span>
          )}
        </div>
      )}
      {!loading && result && result.count === 0 && (
        <p className="text-xs text-muted-foreground">No matches found in wholesale data.</p>
      )}
    </div>
  );
}

// ─── Group form (create + edit) ───────────────────────────────────────────────

interface GroupFormProps {
  initial?: Partial<AccountGroup>;
  onSave: (data: Omit<AccountGroup, 'id' | 'created_at'>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}

function GroupForm({ initial, onSave, onCancel, saving, submitLabel }: GroupFormProps) {
  const [name, setName] = useState(initial?.group_name ?? '');
  const [termsInput, setTermsInput] = useState((initial?.match_terms ?? []).join(', '));
  const [matchColumns, setMatchColumns] = useState<'wholesaler' | 'dba' | 'both'>(
    initial?.match_columns ?? 'both'
  );
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0]);

  const parsedTerms = termsInput.split(',').map(t => t.trim()).filter(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Group name is required'); return; }
    if (parsedTerms.length === 0) { toast.error('At least one match term required'); return; }
    await onSave({ group_name: name.trim(), match_terms: parsedTerms, match_columns: matchColumns, color });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Group Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Giant Eagle"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label>Match Column</Label>
          <Select value={matchColumns} onValueChange={(v) => setMatchColumns(v as typeof matchColumns)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="wholesaler">Wholesaler name</SelectItem>
              <SelectItem value="dba">DBA (doing business as)</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label>
          Match Terms
          <span className="ml-1.5 text-xs text-muted-foreground font-normal">
            comma-separated — partial, case-insensitive match
          </span>
        </Label>
        <Input
          value={termsInput}
          onChange={(e) => setTermsInput(e.target.value)}
          placeholder="e.g. Giant Eagle, GetGo"
        />
        {parsedTerms.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {parsedTerms.map((t) => (
              <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1">
        <Label>Color</Label>
        <ColorPicker value={color} onChange={setColor} />
      </div>

      <PreviewPane terms={parsedTerms} matchColumns={matchColumns} />

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</> : submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ─── Group card (collapsed row) ───────────────────────────────────────────────

interface GroupCardProps {
  group: AccountGroup;
  onEdit: () => void;
  onDelete: () => void;
  deleting: boolean;
}

function GroupCard({ group, onEdit, onDelete, deleting }: GroupCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border p-3 hover:bg-muted/20 transition-colors">
      <div className="flex items-start gap-3 min-w-0">
        {/* Color swatch */}
        <span
          className="mt-0.5 h-4 w-4 rounded-full shrink-0 border border-black/10"
          style={{ backgroundColor: group.color }}
        />
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-sm">{group.group_name}</p>
          <div className="flex flex-wrap gap-1">
            {group.match_terms.map((t) => (
              <Badge key={t} variant="outline" className="text-xs px-1.5 py-0">{t}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground capitalize">
            Match: {group.match_columns === 'both' ? 'wholesaler + DBA' : group.match_columns}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {confirmDelete ? (
          <>
            <span className="text-xs text-destructive mr-1">Delete?</span>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs"
              onClick={onDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => setConfirmDelete(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main client component ────────────────────────────────────────────────────

export function AccountGroupsClient({ initialGroups }: { initialGroups: AccountGroup[] }) {
  const router = useRouter();
  const [groups, setGroups] = useState<AccountGroup[]>(initialGroups);
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleCreate(data: Omit<AccountGroup, 'id' | 'created_at'>) {
    setSaving(true);
    try {
      await createAccountGroup(data);
      toast.success(`"${data.group_name}" created`);
      setShowCreate(false);
      router.refresh();
    } catch {
      toast.error('Failed to create group');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: string, data: Omit<AccountGroup, 'id' | 'created_at'>) {
    setSaving(true);
    try {
      await updateAccountGroup(id, data);
      toast.success(`"${data.group_name}" updated`);
      setEditingId(null);
      router.refresh();
    } catch {
      toast.error('Failed to update group');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteAccountGroup(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      toast.success('Group deleted');
    } catch {
      toast.error('Failed to delete group');
    } finally {
      setDeletingId(null);
    }
  }

  // Keep local list in sync when router.refresh() updates server props
  useEffect(() => { setGroups(initialGroups); }, [initialGroups]);

  return (
    <div className="space-y-4">
      {/* Create form */}
      {showCreate ? (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-semibold mb-3">New Group</p>
            <GroupForm
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
              saving={saving}
              submitLabel="Create Group"
            />
          </CardContent>
        </Card>
      ) : (
        <Button size="sm" onClick={() => { setShowCreate(true); setEditingId(null); }}>
          <Plus className="mr-1.5 h-4 w-4" /> New Group
        </Button>
      )}

      {/* Group list */}
      {groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No account groups yet. Create one above.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map((group) =>
            editingId === group.id ? (
              <Card key={group.id}>
                <CardContent className="pt-4">
                  <p className="text-sm font-semibold mb-3">Edit — {group.group_name}</p>
                  <GroupForm
                    initial={group}
                    onSave={(data) => handleUpdate(group.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                    submitLabel="Save Changes"
                  />
                </CardContent>
              </Card>
            ) : (
              <GroupCard
                key={group.id}
                group={group}
                onEdit={() => { setEditingId(group.id); setShowCreate(false); }}
                onDelete={() => handleDelete(group.id)}
                deleting={deletingId === group.id}
              />
            )
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {groups.length} group{groups.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}
