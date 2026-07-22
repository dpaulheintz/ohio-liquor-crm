'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Todo } from '@/lib/eos/todos';
import { createTodoAction, updateTodoAction, toggleTodoAction, deleteTodoAction, type TodoFormData } from './actions';
import OwnerSelect from '@/components/eos/OwnerSelect';
import SmartAddButton from '@/components/eos/SmartAddButton';
import { ArchiveBanner, ArchiveButton } from '@/components/eos/ArchiveControls';
import { cn } from '@/lib/utils';

type Props = { initialTodos: Todo[]; archived?: boolean };

function fmtCompletedDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
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

  const inputCls = 'w-full rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 transition-colors placeholder:text-gray-400';

  return (
    <div className="fixed inset-0 bg-gray-50/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{mode === 'create' ? 'Add To-Do' : 'Edit To-Do'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 text-2xl w-7 h-7 flex items-center justify-center transition-colors">×</button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 border border-gray-200 rounded-lg px-3 py-2">{error}</p>}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Task *</label>
            <input autoFocus type="text" value={form.title} onChange={e => set('title', e.target.value)} className={inputCls} placeholder="e.g. Follow up with distributor" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Owner</label>
              <OwnerSelect
                ownerName={form.owner_name}
                ownerEmail={form.owner_email}
                onChange={(name, email) => { set('owner_name', name); set('owner_email', email); }}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1.5 block">Due Date</label>
              <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm hover:bg-gray-100 transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {saving ? 'Saving…' : mode === 'create' ? 'Add To-Do' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function TodosClient({ initialTodos, archived = false }: Props) {
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
      console.error('Failed to delete.');
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
          <h1 className="font-serif text-3xl font-bold text-gray-900" style={{ letterSpacing: '-0.02em' }}>To-Dos</h1>
          <p className="text-gray-500 mt-1 text-sm">7-day action items — carry forward anything unfinished</p>
        </div>
        {!archived && (
          <div className="flex items-center gap-2">
            <ArchiveButton basePath="/eos/todos" />
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
            >
              + Add To-Do
            </button>
          </div>
        )}
      </div>

      {archived && <ArchiveBanner label="to-dos" basePath="/eos/todos" />}

      {/* Filter tabs (active view only) */}
      {!archived && (
        <div className="flex gap-1 mb-5 border-b border-gray-200">
          {(['active', 'completed', 'all'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-[2px]',
                filter === f
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-900',
              )}
            >
              {f} <span className="text-xs opacity-60 ml-1">{counts[f]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Todo list */}
      <div className="space-y-1">
        {(archived ? todos : sorted).map(todo => {
          const overdue = isOverdue(todo.due_date, todo.due_date !== null && todo.completed);
          return (
            <div
              key={todo.id}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors group/item',
                todo.completed
                  ? 'border-gray-200/60 bg-white/60'
                  : 'border-gray-200 bg-white hover:bg-gray-100/40',
              )}
            >
              {/* Checkbox (read-only in archive view) */}
              <button
                onClick={() => !archived && handleToggle(todo)}
                disabled={archived || toggling.has(todo.id)}
                className={cn(
                  'shrink-0 w-5 h-5 rounded border flex items-center justify-center transition-colors',
                  todo.completed
                    ? 'bg-green-600 border-green-600 text-gray-900'
                    : 'border-gray-200 hover:border-green-600',
                  toggling.has(todo.id) && 'opacity-50',
                  archived && 'cursor-default',
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
                <p className={cn('text-sm font-medium truncate', todo.completed ? 'line-through text-gray-400' : 'text-gray-900')}>
                  {todo.title}
                </p>
                {todo.owner_name && (
                  <p className="text-xs text-gray-400 mt-0.5">{todo.owner_name}</p>
                )}
              </div>

              {/* Due date (active) / completed date (archive) */}
              {archived ? (
                todo.completed_at && (
                  <span className="shrink-0 text-xs text-gray-400">
                    Completed {fmtCompletedDate(todo.completed_at)}
                  </span>
                )
              ) : (
                todo.due_date && (
                  <span className={cn(
                    'shrink-0 text-xs',
                    todo.completed ? 'text-gray-400' : overdue ? 'text-red-600 font-medium' : 'text-gray-500',
                  )}>
                    {fmtDate(todo.due_date)}
                  </span>
                )
              )}

              {/* Meeting source badge */}
              {todo.created_from_meeting_id && (
                <Link
                  href={`/eos/meetings/${todo.created_from_meeting_id}`}
                  onClick={e => e.stopPropagation()}
                  className="shrink-0 text-[10px] bg-gray-100 text-gray-500 hover:text-gray-900 hover:bg-gray-100 px-1.5 py-0.5 rounded font-medium transition-colors"
                  title="Created in a Level 10 meeting"
                >
                  Meeting
                </Link>
              )}

              {/* Actions (hidden in archive view — read-only) */}
              {!archived && (
                <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditingTodo(todo)}
                    className="text-gray-400 hover:text-gray-900 px-1 py-0.5 text-xs transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(todo.id)}
                    className="text-gray-400 hover:text-red-600 px-1 py-0.5 text-xs transition-colors"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {(archived ? todos.length === 0 : sorted.length === 0) && (
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center text-gray-400 text-sm">
            {archived && 'No archived to-dos.'}
            {!archived && filter === 'active' && 'No active to-dos. Great work!'}
            {!archived && filter === 'completed' && 'No completed to-dos yet.'}
            {!archived && filter === 'all' && 'No to-dos yet. Click "+ Add To-Do" to get started.'}
          </div>
        )}
      </div>

      {!archived && showModal && (
        <TodoFormModal mode="create" onSave={handleCreate} onClose={() => setShowModal(false)} />
      )}
      {!archived && editingTodo && (
        <TodoFormModal mode="edit" todo={editingTodo} onSave={handleUpdate} onClose={() => setEditingTodo(null)} />
      )}
      {!archived && <SmartAddButton pageContext="todos" />}
    </>
  );
}
