import { NextRequest, NextResponse } from 'next/server';
import { runAssistant, type HistoryTurn } from '@/lib/assistant/agent';

// The OpenAI client is constructed lazily inside runAssistant (never at module
// scope) so that `next build`'s page-data collection doesn't fail when
// OPENAI_API_KEY is absent from the local environment.
export const maxDuration = 120; // agentic loop can take several model round-trips

/** Keep the last N exchanges (2 messages each) of conversation context. */
const MAX_HISTORY_TURNS = 12; // 6 question/answer pairs

export async function POST(req: NextRequest) {
  const TAG = '[assistant]';

  try {
    const body = (await req.json()) as { question?: string; history?: HistoryTurn[] };
    const question = body.question?.trim();

    if (!question) {
      return NextResponse.json({ error: 'No question provided.' }, { status: 400 });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error(`${TAG} OPENAI_API_KEY is not set`);
      return NextResponse.json({ answer: 'AI assistant is not configured (missing API key).' });
    }

    // Trust only well-formed prior turns, and cap how far back we look.
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter(
        (h): h is HistoryTurn =>
          !!h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string',
      )
      .slice(-MAX_HISTORY_TURNS);

    console.log(`${TAG} q="${question}" (history: ${history.length} msgs)`);

    const started = Date.now();
    const result = await runAssistant(question, history);
    const ms = Date.now() - started;

    console.log(
      `${TAG} done in ${ms}ms — model=${result.model} rounds=${result.rounds} ` +
        `queries=${result.queries.length}`,
    );

    return NextResponse.json({
      answer: result.answer,
      // Surfaced for transparency/debugging in the UI.
      meta: {
        queries: result.queries,
        rounds: result.rounds,
        model: result.model,
        ms,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} unhandled error: ${msg}`);
    return NextResponse.json({ answer: 'Something went wrong. Try rephrasing your question.' });
  }
}
