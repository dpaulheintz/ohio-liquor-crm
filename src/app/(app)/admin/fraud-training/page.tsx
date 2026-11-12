import { redirect } from 'next/navigation';
import { getFraudTrainingData, isFraudTrainingAdmin } from '@/app/actions/fraud-training';
import { CARDS } from '@/lib/fraud-training/cards';
import { FraudTrainingClient } from './fraud-training-client';

export const metadata = { title: 'Fraud Training | High Bank CRM' };
export const dynamic = 'force-dynamic';

export default async function FraudTrainingAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!(await isFraudTrainingAdmin())) redirect('/');
  const { q } = await searchParams;

  let data: Awaited<ReturnType<typeof getFraudTrainingData>> | null = null;
  let loadError: string | null = null;
  try {
    data = await getFraudTrainingData(q);
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load fraud training';
  }
  // only what the "most missed" list needs
  const cards = CARDS.map((c) => ({ id: c.id, round: c.round, sender: c.sender, content: c.content, answer: c.answer, lesson: c.redFlag ?? c.whyLegit ?? '', whatToDo: c.whatToDo }));

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="border-b px-4 sm:px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <h1 className="font-serif text-2xl font-bold tracking-wide">Fraud Training</h1>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">&ldquo;Scam or Legit?&rdquo; · quarterly check-in · pass = 80%</p>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
        {loadError || !data ? (
          <p className="text-sm text-destructive">{loadError ?? 'Failed to load fraud training'}</p>
        ) : (
          <FraudTrainingClient quarter={data.quarter} quarters={data.quarters} attempts={data.attempts} cards={cards} />
        )}
      </div>
    </div>
  );
}
