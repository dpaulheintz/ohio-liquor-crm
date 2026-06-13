import { createClient } from '@/lib/supabase/server';

export type Meeting = {
  id: string;
  meeting_type: string;
  started_at: string | null;
  ended_at: string | null;
  rating: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type MeetingNote = {
  id: string;
  meeting_id: string;
  section: string;
  content: string | null;
  created_at: string;
};

export async function getMeetings(): Promise<Meeting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('eos_meetings')
    .select('*')
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Meeting[];
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('eos_meetings')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as Meeting;
}

export async function getMeetingNotes(meetingId: string): Promise<MeetingNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('eos_meeting_notes')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at');
  if (error) throw error;
  return (data ?? []) as MeetingNote[];
}

export async function startMeeting(type: string, createdBy: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('eos_meetings')
    .insert({
      meeting_type: type,
      started_at: new Date().toISOString(),
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function endMeeting(
  id: string,
  rating: number | null,
  notes: string | null,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('eos_meetings')
    .update({
      ended_at: new Date().toISOString(),
      rating,
      notes: notes?.trim() || null,
    })
    .eq('id', id);
  if (error) throw error;
}

export async function getActiveMeeting(): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('eos_meetings')
    .select('id')
    .not('started_at', 'is', null)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

export async function saveSectionNote(
  meetingId: string,
  section: string,
  content: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('eos_meeting_notes')
    .delete()
    .eq('meeting_id', meetingId)
    .eq('section', section);

  if (content.trim()) {
    const { error } = await supabase
      .from('eos_meeting_notes')
      .insert({ meeting_id: meetingId, section, content: content.trim() });
    if (error) throw error;
  }
}
