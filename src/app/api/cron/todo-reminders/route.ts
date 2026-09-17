import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { todoReminderEmail } from '@/lib/eos/email-templates';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const todayISO = new Date().toISOString().slice(0, 10);

  const { data: todos, error } = await supabase
    .from('eos_todos')
    .select('id, title, owner_name, owner_email, due_date, last_reminder_sent')
    .eq('completed', false)
    .not('owner_email', 'is', null);

  if (error) {
    console.error('Failed to fetch todos:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  const needReminder = (todos ?? []).filter(
    (t) => t.owner_email && t.last_reminder_sent !== todayISO,
  );

  let sent = 0;
  for (const todo of needReminder) {
    const dueDate = todo.due_date
      ? new Date(`${todo.due_date}T12:00:00`).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })
      : 'No due date set';

    let overdueText = '';
    if (todo.due_date && todo.due_date < todayISO) {
      const diff = Math.round(
        (new Date(`${todayISO}T00:00:00`).getTime() -
          new Date(`${todo.due_date}T00:00:00`).getTime()) /
          86400000,
      );
      overdueText = `⚠️ Overdue by ${diff} day${diff === 1 ? '' : 's'}`;
    }

    const firstName = (todo.owner_name ?? 'there').split(' ')[0];

    await sendEmail({
      to: todo.owner_email!,
      subject: '😅🔫 Friendly reminder — you still have a To-Do',
      html: todoReminderEmail({
        assigneeName: firstName,
        todoTitle: todo.title,
        dueDate,
        overdueText,
      }),
    });

    await supabase
      .from('eos_todos')
      .update({ last_reminder_sent: todayISO })
      .eq('id', todo.id);

    sent++;
  }

  console.log(`Todo reminders: ${sent} sent, ${(todos ?? []).length - needReminder.length} skipped (already sent today)`);
  return NextResponse.json({ sent, skipped: (todos ?? []).length - needReminder.length });
}
