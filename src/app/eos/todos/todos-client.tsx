'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Todo } from '@/lib/eos/todos';
import { createTodoAction, updateTodoAction, toggleTodoAction, deleteTodoAction, type TodoFormData } from './actions';
import OwnerSelect from '@/components/eos/OwnerSelect';
import SmartAddButton from '@/components/eos/SmartAddButton';
import { cn } from '@/lib/utils';

type Props = { initialTodos: Todo[] };
type Filter = 'active' | 'completed' | 'all';

function fmtDate(d: string | null) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(y, m - 1, day);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = (date.getTime() - now.getTime()) / 86400000;
  if (diff < 0) return `Overdue ${Math.abs(Math.round(diff))}d`;
  if (diff === 0) return 'Due today';
  if (diff <= 7) return `Due in ${Math.round(diff)}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isOverdue(d: string | null, completed: boolean) {
  if (!d || completed) return false;
  const [y, m, day] = d.split('-').map(Number);
  const date = new Date(y, m - 1, day);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return date < now;
}

const EMPTY_FORM: TodoFormData = { title: '', owner_name: '', owner_email: '', due_date: '' };

function TodoFormModal({
  mode,
  todo,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit';
  todo?: Todo;
  onSave: (data: TodoFormData) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<TodoFormData>({
    title: todo?.title ?? '',
    owner_name: todo?.owner_name ?? '',
    owner_email: todo?.owner_email ?? '',
    due_date: todo?.due_date ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function set(field: keyof TodoFormData, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch {
      setError('Failed to save.');
      setSaving(false);
    }
  }

  const inputCls = 'w-full rounded-lg bg-[#1C1510] border border-[#3D2E1E] px-3 py-2 text-sm text-[#F5ECD7] focus:outline-none focus:border-[#C9963A] transition-colors placeholder:text-[#6B5A4A]';

  return (
    <div className="fixed inset-0 bg-[#0E0B07]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1C1510] border border-[#3D2E1E] rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D2E1E]">
          <h2 className="text-lg font-semibold text-[#F5ECD7]">{mode === 'create' ? 'Add To-Do' : 'Edit To-Do'}</h2>
          <button onClick={onClose} className="text-[#B8A99A] hover:text-[#F5ECD7] text-2xl w-7 h-7 flex items-center justify-center transition-colors">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-[#C0392B] bg-[#2E0F0F] border border-[#3D2E1E] rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Task *</label>
            <input autoFocus type="text" value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="e.g. Follow up with distributor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Owner</label>
              <OwnerSelect
                ownerName={form.owner_name}
                ownerEmail={form.owner_email}
                onChange={(name, email) => { set('owner_name', name); set('owner_email', email); }}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#B8A99A] mb-1.5 block">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-[#3D2E1E] text-[#F5ECD7] text-sm hover:bg-[#2A1F14] transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] disabled:opacity-50 text-[#0E0B07] text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : mode === 'create' ? 'Add To-Do' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TodosClient({ initialTodos }: Props) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [filter, setFilter] = useState<Filter>('active');
  const [showModal, setShowModal] = useState(false);
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const filtered = todos.filter(t => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  // In "all" view, sort: incomplete first, then completed (with strikethrough)
  const sorted = filter === 'all'
    ? [...filtered.filter(t => !t.completed), ...filtered.filter(t => t.completed)]
    : filtered;

  async function handleToggle(todo: Todo) {
    const next = !todo.completed;
    setToggling(prev => new Set(prev).add(todo.id));
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: next, completed_at: next ? new Date().toISOString() : null } : t));
    try {
      await toggleTodoAction(todo.id, next);
    } catch {
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: todo.completed } : t));
    } finally {
      setToggling(prev => { const n = new Set(prev); n.delete(todo.id); return n; });
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Delete this to-do?')) return;
    setTodos(prev => prev.filter(t => t.id !== id));
    try {
      await deleteTodoAction(id);
    } catch {
      alert('Failed to delete.');
    }
  }

  async function handleCreate(data: TodoFormData) {
    const created = await createTodoAction(data);
    setTodos(prev => [...prev, created]);
    setShowModal(false);
  }

  async function handleUpdate(data: TodoFormData) {
    if (!editingTodo) return;
    await updateTodoAction(editingTodo.id, data);
    setTodos(prev => prev.map(t =>
      t.id === editingTodo.id
        ? { ...t, title: data.title.trim(), owner_name: data.owner_name.trim() || null, owner_email: data.owner_email.trim() || null, due_date: data.due_date || null }
        : t,
    ));
    setEditingTodo(null);
  }

  const counts = {
    active: todos.filter(t => !t.completed).length,
    completed: todos.filter(t => t.completed).length,
    all: todos.length,
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-[#F5ECD7]" style={{ letterSpacing: '-0.02em' }}>To-Dos</h1>
          <p className="text-[#B8A99A] mt-1 text-sm">7-day action items — carry forward anything unfinished</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] text-[#0E0B07] text-sm font-medium transition-colors"
        >
          + Add To-Do
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 border-b border-[#3D2E1E]">
        {(['active', 'completed', 'all'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-[2px]',
              filter === f
                ? 'border-[#C9963A] text-[#5B9E94]'
                : 'border-transparent text-[#B8A99A] hover:text-[#F5ECD7]',
            )}
          >
            {f} <span className="text-xs opacity-60 ml-1">{counts[f]}</span>
          </button>
        ))}
      </div>

      {/* Todo list */}
      <div className="space-y-1">
        {sorted.map(todo => {
          const overdue = isOverdue(todo.due_date, todo.due_date !== null && todo.completed);
          return (
            <div
              key={todo.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors group/item',
                todo.completed
                  ? 'border-[#3D2E1E]/60 bg-[#1C1510]/60'
                  : 'border-[#3D2E1E] bg-[#1C1510] hover:bg-[#2A1F14]/40',
              )}
            >
              {/* Checkbox */}
              <button
                onClick={() => handleToggle(todo)}
                disabled={toggling.has(todo.id)}
                className={cn(
                  'shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors',
                  todo.completed
                    ? 'bg-[#C9963A] border-[#C9963A] text-[#F5ECD7]'
                    : 'border-[#3D2E1E] hover:border-[#C9963A]',
                  toggling.has(todo.id) && 'opacity-50',
                )}
              >
                {todo.completed && (
                  <svg className="w-3 h-3" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>

              {/* Title */}
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium truncate', todo.completed ? 'line-through text-[#6B5A4A]' : 'text-[#F5ECD7]')}>
                  {todo.title}
                </p>
                {todo.owner_name && (
                  <p className="text-xs text-[#6B5A4A] mt-0.5">{todo.owner_name}</p>
                )}
              </div>

              {/* Due date */}
              {todo.due_date && (
                <span className={cn(
                  'shrink-0 text-xs',
                  todo.completed ? 'text-[#6B5A4A]' : overdue ? 'text-[#C0392B] font-medium' : 'text-[#B8A99A]',
                )}>
                  {fmtDate(todo.due_date)}
                </span>
              )}

              {/* Meeting source badge */}
              {todo.created_from_meeting_id && (
                <Link
                  href={`/eos/meetings/${todo.created_from_meeting_id}`}
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 text-[10px] bg-[#2A1F14] text-[#B8A99A] hover:text-[#F5ECD7] hover:bg-[#3D2E1E] px-1.5 py-0.5 rounded font-medium transition-colors"
                  title="Created in a Level 10 meeting"
                >
                  Meeting
                </Link>
              )}

              {/* Actions */}
              <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditingTodo(todo)}
                  className="text-[#6B5A4A] hover:text-[#F5ECD7] px-1 py-0.5 text-xs transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(todo.id)}
                  className="text-[#6B5A4A] hover:text-[#C0392B] px-1 py-0.5 text-xs transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-6 py-12 text-center text-[#6B5A4A] text-sm">
            {filter === 'active' && 'No active to-dos. Great work!'}
            {filter === 'completed' && 'No completed to-dos yet.'}
            {filter === 'all' && 'No to-dos yet. Click "+ Add To-Do" to get started.'}
          </div>
        )}
      </div>

      {showModal && (
        <TodoFormModal mode="create" onSave={handleCreate} onClose={() => setShowModal(false)} />
      )}
      {editingTodo && (
        <TodoFormModal mode="edit" todo={editingTodo} onSave={handleUpdate} onClose={() => setEditingTodo(null)} />
      )}
      <SmartAddButton pageContext="todos" />
    </>
  );
}
