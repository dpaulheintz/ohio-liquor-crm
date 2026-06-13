'use client';

import { EOS_TEAM_MEMBERS } from '@/lib/eos/team';

export default function OwnerSelect({
  ownerName,
  ownerEmail = '',
  onChange,
  className = '',
}: {
  ownerName: string;
  ownerEmail?: string;
  onChange: (name: string, email: string) => void;
  className?: string;
}) {
  const value = ownerEmail || EOS_TEAM_MEMBERS.find(m => m.name === ownerName)?.email || '';

  return (
    <select
      value={value}
      onChange={e => {
        const m = EOS_TEAM_MEMBERS.find(m => m.email === e.target.value);
        onChange(m?.name ?? '', m?.email ?? '');
      }}
      className={className}
    >
      <option value="">— Unassigned —</option>
      {EOS_TEAM_MEMBERS.map(m => (
        <option key={m.email} value={m.email}>{m.name}</option>
      ))}
    </select>
  );
}
