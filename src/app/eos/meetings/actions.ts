'use server';

import { createClient } from '@/lib/supabase/server';
import { startMeeting, endMeeting, saveSectionNote, upsertPersonRating } from '@/lib/eos/meetings';
import { createTodo, updateTodo, type Todo } from '@/lib/eos/todos';
import { createOpportunity, type Opportunity } from '@/lib/eos/opportunities';
import { createHeadline, type Headline } from '@/lib/eos/headlines';
import { updateBarrel } from '@/lib/eos/barrels';

export async function startMeetingAction(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return startMeeting('level_10', user?.email ?? '');
}

export async function endMeetingAction(id: string, notes: string): Promise<void> {
  await endMeeting(id, notes);
}

export async function upsertPersonRatingAction(
  meetingId: string,
  personName: string,
  personEmail: string,
  rating: number,
): Promise<void> {
  await upsertPersonRating(meetingId, personName, personEmail, rating);
}

export async function saveSectionNoteAction(
  meetingId: string,
  section: string,
  content: string,
): Promise<void> {
  await saveSectionNote(meetingId, section, content);
}

export async function createMeetingTodoAction(
  title: string,
  ownerName: string,
  dueDate: string,
  meetingId: string,
): Promise<Todo> {
  return createTodo({
    title: title.trim(),
    owner_name: ownerName.trim() || undefined,
    due_date: dueDate || undefined,
    created_from_meeting_id: meetingId,
  });
}

export async function carryForwardTodoAction(id: string): Promise<void> {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await updateTodo(id, { due_date: due });
}

export async function flagForIDSAction(title: string): Promise<Opportunity> {
  return createOpportunity({
    title,
    term: 'short',
    status: 'open',
    priority: 'high',
  });
}

export async function createOpportunityInMeetingAction(data: {
  title: string;
  term: string;
  priority: string;
  owner_name: string;
  owner_email: string;
}): Promise<Opportunity> {
  return createOpportunity({
    title: data.title.trim(),
    term: data.term,
    status: 'open',
    priority: data.priority || undefined,
    owner_name: data.owner_name.trim() || undefined,
    owner_email: data.owner_email.trim() || undefined,
  });
}

export async function updateBarrelStatusInMeetingAction(
  id: string,
  status: string,
): Promise<void> {
  await updateBarrel(id, { status });
}

export async function addHeadlineInMeetingAction(
  title: string,
  headlineType: string,
  ownerName: string,
): Promise<Headline> {
  return createHeadline({
    title: title.trim(),
    headline_type: headlineType,
    owner_name: ownerName.trim() || undefined,
  });
}
