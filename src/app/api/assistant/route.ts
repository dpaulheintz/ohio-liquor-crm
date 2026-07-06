import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SCHEMA_PROMPT = `You are an AI assistant for High Bank Distillery's CRM system. You have read-only access to the following PostgreSQL database tables. When asked a question, generate a single PostgreSQL SELECT query that answers it.

Return ONLY the SQL query — no explanation, no markdown, no backticks. Just the raw SQL.

Always be specific with numbers. If the question is unclear, generate the most reasonable interpretation. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, or any non-SELECT statement. Do not add a trailing semicolon.

DATABASE SCHEMA:

profiles (id uuid, email text, full_name text, role text [admin/rep], created_at timestamptz)

accounts (id uuid, display_name text, type text [EXACT VALUES: 'agency' | 'wholesale' | 'Bar/Restaurant' — always use exact case; 'agency' means retail liquor stores/grocers, 'wholesale' means bars/distributors, 'Bar/Restaurant' means on-premise accounts], status text [prospect/customer/Prospect — case inconsistent, use ILIKE for status filters], city text, address text, agency_id text, district text, linked_agency_name text, linked_agency_id text, owner_rep_id uuid FK profiles, needs_review boolean, created_at timestamptz)

contacts (id uuid, account_id uuid FK accounts, name text, email text, phone text, title_role text, created_at timestamptz)

visit_logs (id uuid, account_id uuid FK accounts, rep_id uuid FK profiles, visit_type text [in_person/phone_call], notes text, visited_at timestamptz, created_at timestamptz)

visit_kpis (id uuid, visit_id uuid FK visit_logs, kpi_type text [Display/Menu/Feature/Event], kpi_quantity int, sold_status text [sold/unsold], display_type text [Wood/Box/Shelves], created_at timestamptz)

visit_photos (id uuid, visit_id uuid FK visit_logs, photo_url text, caption text, created_at timestamptz)

assignments (id uuid, account_id uuid FK accounts, assigned_to uuid FK profiles, assigned_by uuid FK profiles, notes text, status text [pending/completed], completed_at timestamptz, created_at timestamptz)

tastings (id uuid, agency_id uuid FK accounts, date date, start_time time, end_time time, city text, status text [needs_staff/staffed/completed/cancelled], staff_category text [DBC/HB Internal Staff/HB Sales Team], staff_person text, notes text, created_at timestamptz)

agency_displays (id uuid, account_id uuid FK accounts, agency_name text, rep_id uuid FK profiles, display_type text [Wood/Box/Shelves], first_confirmed date, monthly_status jsonb, notes text)

sales_monthly (id uuid, month text [YYYY-MM format e.g. '2026-01' — filter with month LIKE '2026-%' for a full year, or month >= '2026-01' AND month <= '2026-05' for a range], agency_id text, agency_name text, district text, vendor text, brand_code text, product_name text [see PRODUCT NAME ALIASES below — always search this column], category text, brand_family text [EXACT VALUES: '(614) Vodka' | 'Bourbon' | 'Gin' | 'Midnight' | 'Midnight (Discontinued)' | 'Misc' | 'RTD' | 'Vodka' | 'Whiskey War'], sub_product text [ONLY 3 ROWS have a value: 'HIGH BANK MIDNIGHT CASK', 'Masters Blend', 'Midnight Cask (Discontinued)' — everything else is NULL; NEVER filter by sub_product for Whiskey War variants, use product_name instead], size text, is_hb_agency boolean, hb_location text, retail_bottles int, retail_amount numeric, wholesale_bottles int, wholesale_amount numeric)

wholesale_detail (id uuid, month text [YYYY-MM format], agency_id text, agency_name text, brand_code text, brand_family text, sub_product text, size text, is_hb_agency boolean, hb_location text, permit_number text, wholesaler_name text, dba text, bottles_sold int, amount numeric)

bailment_monthly (id uuid, month text [YYYY-MM format], amount numeric)

sample_pulls (id uuid, pull_type text [spirits/swag], person_name text, category text, account_name text, notes text, created_at timestamptz)

sample_pull_items (id uuid, pull_id uuid FK sample_pulls, item_name text, item_category text, size text, quantity int)

account_groups (id uuid, group_name text, match_terms text[], match_columns text[], color text)

---

CRITICAL QUERY PATTERNS:

1. Finding visits by rep name — ALWAYS JOIN visit_logs with profiles on rep_id:
   SELECT COUNT(DISTINCT vl.account_id)
   FROM visit_logs vl
   JOIN profiles p ON p.id = vl.rep_id
   JOIN accounts a ON a.id = vl.account_id
   WHERE p.full_name ILIKE '%Samantha%'
     AND a.type = 'agency'
     AND vl.visited_at >= '2026-06-01' AND vl.visited_at < '2026-07-01'

   Never filter visits by rep name without this JOIN — visit_logs has no name column, only rep_id.

2. Account type terminology:
   - "agencies" → a.type = 'agency' (retail liquor stores, grocery chains)
   - "wholesale accounts" → a.type = 'wholesale'
   - "bars", "restaurants", "on-premise" → a.type = 'Bar/Restaurant'
   - "all on-premise" → a.type IN ('wholesale', 'Bar/Restaurant')
   Always quote the type value exactly as shown — case sensitive.

3. Date ranges for months: use >= first day AND < first day of next month (e.g. June 2025: >= '2025-06-01' AND < '2025-07-01').

4. "This year" means month >= '2026-01' AND month <= '2026-12' for sales_monthly, or visited_at >= '2026-01-01' for visit_logs.

---

COMPLETE product_name VALUES in sales_monthly (exact spelling):
'(614) Vodka x High Bank', 'Barrel Proof Bourbon', 'HIGH BANK MIDNIGHT CASK',
'High Bank Vodka', 'Midnight Cask (Discontinued)', 'Midnight Cask Barrel Proof',
'Midnight Manhattan', 'Old Fashioned RTD', 'Small Batch Bourbon',
'Statehouse Gin', 'Statehouse Gin Barrel Select', 'Whiskey War',
'Whiskey War Barrel Proof', 'Whiskey War Barrel Select', 'Whiskey War Cigar Cask',
'Whiskey War Cigar Cask Single Barrel', 'Whiskey War Double Double Oaked',
'Whiskey War Double Double Oaked Single Barrel', 'Whiskey War Double Oaked',
'Whiskey War Double Oaked Single Barrel', 'Whiskey War Master Blend'

PRODUCT NAME ALIASES — map casual phrasing to product_name ILIKE patterns:
- "double double" → product_name ILIKE '%Double Double%'
- "double oaked" (but NOT double double) → product_name ILIKE '%Double Oaked%' AND product_name NOT ILIKE '%Double Double%'
- "barrel proof" → product_name ILIKE '%Barrel Proof%'
- "cigar cask" → product_name ILIKE '%Cigar Cask%'
- "statehouse gin" / "gin" → product_name ILIKE '%Statehouse Gin%' OR brand_family = 'Gin'
- "vodka" → brand_family = 'Vodka'
- "whiskey war" (generic) → brand_family = 'Whiskey War'
- "midnight cask" → product_name ILIKE '%Midnight Cask%'
- "masters blend" / "master blend" → product_name ILIKE '%Master Blend%'
- "small batch" → product_name ILIKE '%Small Batch%'
- "barrel select" → product_name ILIKE '%Barrel Select%'`;

// Block any non-SELECT SQL (keyword at word boundary)
const DISALLOWED = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy)\b/i;

function cleanSql(raw: string): string {
  return raw
    .replace(/```[a-z]*\n?/gi, '') // strip markdown fences
    .replace(/```/g, '')
    .trim()
    .replace(/;+\s*$/, '');        // strip trailing semicolons
}

export async function POST(req: NextRequest) {
  const TAG = '[assistant]';

  try {
    const { question } = await req.json() as { question: string };
    console.log(`${TAG} question: ${question}`);

    if (!question?.trim()) {
      return NextResponse.json({ error: 'No question provided.' }, { status: 400 });
    }

    // ── Step 1: Generate SQL ────────────────────────────────────────────────
    if (!process.env.OPENAI_API_KEY) {
      console.error(`${TAG} OPENAI_API_KEY is not set`);
      return NextResponse.json({ answer: "AI assistant is not configured (missing API key)." });
    }

    let rawSql = '';
    try {
      const sqlRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SCHEMA_PROMPT },
          { role: 'user', content: `Generate a SQL query to answer: ${question}` },
        ],
        temperature: 0,
        max_tokens: 800,
      });
      rawSql = sqlRes.choices[0]?.message?.content ?? '';
      console.log(`${TAG} raw SQL from OpenAI: ${rawSql}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${TAG} OpenAI SQL generation failed: ${msg}`);
      return NextResponse.json({ answer: "I wasn't able to answer that. Try rephrasing." });
    }

    const sql = cleanSql(rawSql);
    console.log(`${TAG} cleaned SQL: ${sql}`);

    if (!sql) {
      console.error(`${TAG} empty SQL after cleaning`);
      return NextResponse.json({ answer: "I wasn't able to answer that. Try rephrasing." });
    }

    // Security: block data-modifying keywords
    if (DISALLOWED.test(sql)) {
      console.warn(`${TAG} blocked SQL (contains disallowed keyword): ${sql}`);
      return NextResponse.json({ answer: "I can only read data, not modify it." });
    }

    // Must start with SELECT or WITH (CTEs)
    if (!/^\s*(select|with)\b/i.test(sql)) {
      console.warn(`${TAG} blocked SQL (doesn't start with SELECT/WITH): ${sql}`);
      return NextResponse.json({ answer: "I can only answer questions about High Bank CRM data." });
    }

    // ── Step 2: Run query via exec_sql RPC ──────────────────────────────────
    const supabase = createAdminClient();
    console.log(`${TAG} running exec_sql RPC...`);

    const { data: results, error } = await supabase.rpc('exec_sql', { query_text: sql });

    if (error) {
      console.error(`${TAG} Supabase RPC error: ${error.message} (code: ${error.code})\nSQL was: ${sql}`);
      return NextResponse.json({ answer: "I wasn't able to answer that. Try rephrasing." });
    }

    console.log(`${TAG} exec_sql result type: ${typeof results}, isArray: ${Array.isArray(results)}, raw: ${JSON.stringify(results)?.slice(0, 2000)}`);

    // exec_sql returns json — may come back as string or already-parsed array
    let rows: unknown[];
    if (typeof results === 'string') {
      try {
        rows = JSON.parse(results);
      } catch {
        console.error(`${TAG} failed to parse exec_sql string result: ${results}`);
        rows = [];
      }
    } else if (Array.isArray(results)) {
      rows = results;
    } else if (results && typeof results === 'object') {
      // Supabase may wrap single-row json results
      rows = [results];
    } else {
      rows = [];
    }

    console.log(`${TAG} rows count: ${rows.length}, raw rows (pre-format): ${JSON.stringify(rows.slice(0, 20))?.slice(0, 3000)}`);

    if (rows.length === 0) {
      return NextResponse.json({ answer: "No data found. Try a different time period or criteria." });
    }

    // Truncate to 100 rows before sending to GPT to stay within token limits
    const trimmedRows = rows.slice(0, 100);

    // ── Step 3: Format answer ───────────────────────────────────────────────
    let answer = '';
    try {
      const answerRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: "You are a helpful assistant for High Bank Distillery's CRM. Format the following query results into a clear, concise plain-English answer. Format currency as USD with $ and commas (e.g. $12,345). Use numbered lists for multiple items. Keep it to one paragraph or a short list — no preamble, no 'here are the results' framing.",
          },
          {
            role: 'user',
            content: `Question: ${question}\n\nQuery results (${trimmedRows.length} rows): ${JSON.stringify(trimmedRows)}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 600,
      });
      answer = answerRes.choices[0]?.message?.content?.trim() ?? '';
      console.log(`${TAG} formatted answer: ${answer}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${TAG} OpenAI answer formatting failed: ${msg}`);
      return NextResponse.json({ answer: "I wasn't able to format an answer." });
    }

    return NextResponse.json({ answer: answer || "I wasn't able to format an answer." });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} unhandled error: ${msg}`);
    return NextResponse.json({ answer: "Something went wrong. Try rephrasing your question." });
  }
}
