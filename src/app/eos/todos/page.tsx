import type { Metadata } from 'next';
import { getTodos } from '@/lib/eos/todos';

export const metadata: Metadata = { title: 'To-Dos | High Bank EOS' };
import TodosClient from './todos-client';

export const dynamic = 'force-dynamic';

export default async function EosTodosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const archived = view === 'archived';
  const todos = await getTodos(archived);
  return (
    <div className="px-6 py-8 text-gray-900 min-h-full">
      <div className="max-w-3xl mx-auto">
        <TodosClient initialTodos={todos} archived={archived} />
      </div>
    </div>
  );
}
