import type { Metadata } from 'next';
import { getTodos } from '@/lib/eos/todos';

export const metadata: Metadata = { title: 'To-Dos | High Bank EOS' };
import TodosClient from './todos-client';

export const dynamic = 'force-dynamic';

export default async function EosTodosPage() {
  const todos = await getTodos();
  return (
    <div className="px-6 py-8 text-[#F5ECD7] min-h-full">
      <div className="max-w-3xl mx-auto">
        <TodosClient initialTodos={todos} />
      </div>
    </div>
  );
}
