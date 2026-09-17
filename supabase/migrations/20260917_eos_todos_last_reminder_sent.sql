ALTER TABLE eos_todos
  ADD COLUMN IF NOT EXISTS last_reminder_sent DATE;
