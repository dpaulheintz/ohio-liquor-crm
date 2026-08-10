/**
 * Agentic query loop for the AI Assistant.
 *
 * Instead of a fixed "generate SQL -> run -> format" pipeline, the model is given
 * a run_sql tool and allowed to plan, query, inspect results, query again, and
 * finally answer. That is what makes multi-step analysis and what-if scenario
 * modelling possible: the model can pull historical data, look at it, then pull
 * whatever else the calculation turns out to need.
 *
 * Rounds are capped (MAX_ROUNDS) so a confused model cannot loop forever.
 */

import OpenAI from 'openai';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { createAdminClient } from '@/lib/supabase/server';
import { buildSystemPrompt } from './schema';

const PRIMARY_MODEL = 'gpt-4o';
const FALLBACK_MODEL = 'gpt-4o-mini';
const MAX_ROUNDS = 4;          // planning/query rounds before we force an answer
const MAX_ROWS_TO_MODEL = 100; // rows fed back per query (token guard)
const HARD_ROW_LIMIT = 200;    // LIMIT injected when the model omits one

export interface QueryTrace {
  sql: string;
  rowCount: number;
  error?: string;
}

export interface AgentResult {
  answer: string;
  queries: QueryTrace[];
  rounds: number;
  model: string;
}

/** Prior turns, oldest first. */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

// ─── SQL safety ───────────────────────────────────────────────────────────────

const DISALLOWED = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|vacuum|reindex)\b/i;

export function cleanSql(raw: string): string {
  return raw
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .trim()
    .replace(/;+\s*$/, '');
}

/**
 * Validate a model-authored query and add a LIMIT when one is missing.
 * Returns an error string instead of throwing so it can be fed back to the model
 * as tool output — letting it self-correct rather than failing the whole request.
 */
export function guardSql(raw: string): { sql: string } | { error: string } {
  const sql = cleanSql(raw);
  if (!sql) return { error: 'Empty query.' };
  if (DISALLOWED.test(sql)) {
    return { error: 'Rejected: this assistant is read-only. Use SELECT only.' };
  }
  if (!/^\s*(select|with)\b/i.test(sql)) {
    return { error: 'Rejected: query must start with SELECT or WITH.' };
  }
  // Append a LIMIT unless one exists at the top level or it is a bare aggregate.
  const hasLimit = /\blimit\s+\d+\s*$/i.test(sql);
  return { sql: hasLimit ? sql : `${sql} LIMIT ${HARD_ROW_LIMIT}` };
}

// ─── SQL execution ────────────────────────────────────────────────────────────

/** Run one read-only query through the exec_sql RPC. Never throws. */
export async function runSql(sql: string): Promise<{ rows: unknown[] } | { error: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('exec_sql', { query_text: sql });

  if (error) return { error: error.message };

  // exec_sql returns json — may arrive as a string, an array, or a single object.
  let rows: unknown[];
  if (typeof data === 'string') {
    try { rows = JSON.parse(data); } catch { rows = []; }
  } else if (Array.isArray(data)) {
    rows = data;
  } else if (data && typeof data === 'object') {
    rows = [data];
  } else {
    rows = [];
  }
  return { rows };
}

// ─── Tool definition ──────────────────────────────────────────────────────────

const RUN_SQL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'run_sql',
    description:
      'Run a read-only PostgreSQL SELECT query against the High Bank business database ' +
      'and get the rows back as JSON. Call this as many times as you need (you may ' +
      'issue several queries at once). Always base every number you report on results ' +
      'from this tool.',
    parameters: {
      type: 'object',
      properties: {
        sql: {
          type: 'string',
          description: 'A single PostgreSQL SELECT (or WITH ... SELECT) statement. No semicolon.',
        },
        purpose: {
          type: 'string',
          description: 'Short note on what this query is for (e.g. "revenue by location, last 6 months").',
        },
      },
      required: ['sql'],
      additionalProperties: false,
    },
  },
};

// ─── Main loop ────────────────────────────────────────────────────────────────

export async function runAssistant(
  question: string,
  history: HistoryTurn[] = [],
): Promise<AgentResult> {
  const TAG = '[assistant]';
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const today = new Date().toISOString().slice(0, 10);

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(today) },
    // Last N turns give the model conversational context for follow-ups
    // ("break that down by location", "which improved most?").
    ...history.map((h) => ({ role: h.role, content: h.content }) as ChatCompletionMessageParam),
    { role: 'user', content: question },
  ];

  const queries: QueryTrace[] = [];
  let model = PRIMARY_MODEL;
  let usedFallback = false;
  let rounds = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    rounds = round + 1;
    const lastRound = round === MAX_ROUNDS - 1;

    let completion;
    try {
      completion = await openai.chat.completions.create({
        model,
        messages,
        // On the final round drop the tool so the model must produce prose.
        ...(lastRound ? {} : { tools: [RUN_SQL_TOOL], tool_choice: 'auto' as const }),
        temperature: 0.1,
        max_tokens: 1600,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${TAG} ${model} call failed: ${msg}`);
      if (!usedFallback) {
        // Retry this same round on the cheaper/more available model.
        console.warn(`${TAG} falling back to ${FALLBACK_MODEL}`);
        usedFallback = true;
        model = FALLBACK_MODEL;
        round--;
        continue;
      }
      return {
        answer: 'The AI service is unavailable right now. Please try again in a moment.',
        queries, rounds, model,
      };
    }

    const choice = completion.choices[0]?.message;
    if (!choice) break;

    const toolCalls = choice.tool_calls ?? [];

    // No tool calls -> the model is answering.
    if (toolCalls.length === 0) {
      const answer = choice.content?.trim() ?? '';
      if (answer) return { answer, queries, rounds, model };
      break;
    }

    messages.push(choice);

    // Execute every requested query and feed results back as tool messages.
    for (const call of toolCalls) {
      if (call.type !== 'function') continue;
      let sqlArg = '';
      let purpose = '';
      try {
        const parsed = JSON.parse(call.function.arguments || '{}') as { sql?: string; purpose?: string };
        sqlArg = parsed.sql ?? '';
        purpose = parsed.purpose ?? '';
      } catch {
        messages.push({
          role: 'tool', tool_call_id: call.id,
          content: 'Error: could not parse tool arguments as JSON.',
        });
        continue;
      }

      const guarded = guardSql(sqlArg);
      if ('error' in guarded) {
        console.warn(`${TAG} blocked SQL: ${sqlArg} — ${guarded.error}`);
        queries.push({ sql: sqlArg, rowCount: 0, error: guarded.error });
        messages.push({ role: 'tool', tool_call_id: call.id, content: `Error: ${guarded.error}` });
        continue;
      }

      console.log(`${TAG} [${purpose || 'query'}] ${guarded.sql}`);
      const result = await runSql(guarded.sql);

      if ('error' in result) {
        console.error(`${TAG} SQL error: ${result.error}`);
        queries.push({ sql: guarded.sql, rowCount: 0, error: result.error });
        messages.push({
          role: 'tool', tool_call_id: call.id,
          content: `Error running query: ${result.error}\nFix the SQL and try again.`,
        });
        continue;
      }

      const rows = result.rows;
      queries.push({ sql: guarded.sql, rowCount: rows.length });
      const trimmed = rows.slice(0, MAX_ROWS_TO_MODEL);
      const note = rows.length > MAX_ROWS_TO_MODEL
        ? `\n(Showing first ${MAX_ROWS_TO_MODEL} of ${rows.length} rows.)` : '';
      messages.push({
        role: 'tool', tool_call_id: call.id,
        content: rows.length === 0
          ? 'No rows returned.'
          : `${rows.length} row(s):\n${JSON.stringify(trimmed)}${note}`,
      });
    }
  }

  // Ran out of rounds while still calling tools — ask for a final answer.
  try {
    const final = await openai.chat.completions.create({
      model,
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'Stop querying and answer now using the data you already have. ' +
            'If something is still missing, say what is missing rather than guessing.',
        },
      ],
      temperature: 0.1,
      max_tokens: 1600,
    });
    const answer = final.choices[0]?.message?.content?.trim() ?? '';
    if (answer) return { answer, queries, rounds, model };
  } catch (err) {
    console.error(`${TAG} final synthesis failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    answer: "I couldn't complete that analysis. Try narrowing the question.",
    queries, rounds, model,
  };
}
