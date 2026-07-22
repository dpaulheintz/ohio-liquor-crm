import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { todoAssignedEmail } from '@/lib/eos/email-templates';

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

function sevenDaysAgoISO(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * @param archived  false (default) = active: not completed, or completed within
 *                  the last 7 days (a completed todo with no completed_at is
 *                  treated as active so it can never disappear from both views).
 *                  true = archived: completed 7+ days ago.
 */
export async function getTodos(archived = false): Promise<Todo[]> {
  const supabase = await createClient();
  const cutoff = sevenDaysAgoISO();
  let query = supabase.from('eos_todos').select('*');
  if (archived) {
    query = query.eq('completed', true).not('completed_at', 'is', null).lte('completed_at', cutoff);
  } else {
    query = query.or(`completed.eq.false,completed_at.is.null,completed_at.gt.${cutoff}`);
  }
  const { data, error } = await query
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

  const todo = result as Todo;

  // The ONLY email trigger in the app: notify the owner when a to-do is
  // created with an owner + due date. sendEmail never throws, so a mail
  // failure can never break to-do creation.
  if (todo.owner_email && todo.owner_name && todo.due_date) {
    // Parse at noon so a DATE-only value doesn't roll back a day via UTC.
    const formattedDue = new Date(`${todo.due_date}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    await sendEmail({
      to: todo.owner_email,
      subject: `New To-Do Assigned: ${todo.title}`,
      html: todoAssignedEmail({
        assigneeName: todo.owner_name.split(' ')[0],
        todoTitle: todo.title,
        dueDate: formattedDue,
        assignedBy: 'High Bank EOS',
      }),
    });
  }

  return todo;
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
