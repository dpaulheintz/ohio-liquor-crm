import { createClient } from '@/lib/supabase/server';

export type Todo = {
  id: string;
  title: string;
  owner_name: string | null;
  owner_email: string | null;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_from_meeting_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export async function getTodos(): Promise<Todo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('eos_todos')
    .select('*')
    .order('completed')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as Todo[];
}

export async function getTodosByMeetingId(meetingId: string): Promise<Todo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('eos_todos')
    .select('*')
    .eq('created_from_meeting_id', meetingId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as Todo[];
}

export async function createTodo(data: {
  title: string;
  owner_name?: string;
  owner_email?: string;
  due_date?: string;
  created_from_meeting_id?: string;
}): Promise<Todo> {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('eos_todos')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result as Todo;
}

export async function updateTodo(
  id: string,
  data: Partial<{
    title: string;
    owner_name: string | null;
    owner_email: string | null;
    due_date: string | null;
  }>,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('eos_todos')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function toggleTodo(id: string, completed: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('eos_todos')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTodo(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('eos_todos').delete().eq('id', id);
  if (error) throw error;
}
