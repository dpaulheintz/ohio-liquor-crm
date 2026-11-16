import { redirect } from 'next/navigation';
import { DEMO_BASE } from '@/lib/ohlq-demo/shared';

export default function DemoHome() {
  redirect(`${DEMO_BASE}/wholesale`);
}
