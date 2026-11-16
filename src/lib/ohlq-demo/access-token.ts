// Demo access code → cookie value. Shared by the proxy (src/lib/supabase/proxy.ts) and server code.
// The cookie holds a SHA-256 of the code (never the code itself), so changing OHLQ_DEMO_CODE in
// Vercel signs everyone out of the demo.

export async function accessTokenFor(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(`ohlq-demo-access:v1:${code.trim()}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when OHLQ_DEMO_CODE is set and the cookie matches it. Fails closed when the code isn't configured. */
export async function hasDemoAccess(cookieValue: string | undefined): Promise<boolean> {
  const code = process.env.OHLQ_DEMO_CODE;
  if (!code || !cookieValue) return false;
  const expected = await accessTokenFor(code);
  if (expected.length !== cookieValue.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ cookieValue.charCodeAt(i);
  return diff === 0;
}
