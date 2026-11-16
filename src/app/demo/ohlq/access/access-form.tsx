'use client';

import { useActionState } from 'react';
import { enterAccessCode } from '../actions';

export function AccessForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(enterAccessCode, { error: '' });
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <label className="ohlq-label" htmlFor="code">Access code</label>
      <input id="code" name="code" className="ohlq-input" type="password" autoComplete="off" autoFocus required />
      {state.error && <p className="ohlq-error" role="alert">{state.error}</p>}
      <button className="ohlq-btn" type="submit" disabled={pending} style={{ width: '100%', marginTop: 14 }}>
        {pending ? 'Checking…' : 'Continue'}
      </button>
    </form>
  );
}
