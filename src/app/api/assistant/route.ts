import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SCHEMA_PROMPT = `You are an AI assistant for High Bank Distillery's CRM system. You have read-only access to the following PostgreSQL database tables. When asked a question, generate a single PostgreSQL SELECT query that answers it.

Return ONLY the SQL query — no explanation, no markdown, no backticks. Just the raw SQL.

Always be specific with numbers. If the question is unclear, generate the most reasonable interpretation. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, or any non-SELECT statement. Do not add a trailing semicolon.

DATABASE SCHEMA:

profiles (id uuid, email text, full_name text, role text ['admin' | 'rep'], created_at timestamptz)

accounts (id uuid, display_name text,
  type text [VERIFIED EXACT VALUES — case-sensitive: 'agency' (483, retail liquor stores & grocery chains) | 'wholesale' (116, bars/distributors with wholesale permits) | 'Bar/Restaurant' (22, on-premise bars and restaurants)],
  status text [VERIFIED VALUES — case-inconsistent in DB: 'customer' (566) | 'prospect' (33) | 'Prospect' (22); always use LOWER(status) = 'prospect' or ILIKE for prospect filters],
  city text, address text, agency_id text, district text, linked_agency_name text, linked_agency_id text, owner_rep_id uuid FK profiles, needs_review boolean, created_at timestamptz)

contacts (id uuid, account_id uuid FK accounts, name text, email text, phone text, title_role text, created_at timestamptz)

visit_logs (id uuid, account_id uuid FK accounts, rep_id uuid FK profiles,
  visit_type text [VERIFIED VALUES: 'in_person' | 'phone_call'],
  notes text, visited_at timestamptz, created_at timestamptz)

visit_kpis (id uuid, visit_id uuid FK visit_logs,
  kpi_type text [VERIFIED VALUES: 'Display' | 'Menu' | 'Feature' | 'Event'],
  kpi_quantity int,
  sold_status text [VERIFIED VALUES: 'sold' | 'unsold'],
  display_type text [currently all NULL in DB — do not filter on this column],
  created_at timestamptz)

visit_photos (id uuid, visit_id uuid FK visit_logs, photo_url text, caption text, created_at timestamptz)

assignments (id uuid, account_id uuid FK accounts, assigned_to uuid FK profiles, assigned_by uuid FK profiles, notes text,
  status text [VERIFIED VALUES: 'pending' | 'completed'],
  completed_at timestamptz, created_at timestamptz)

tastings (id uuid, agency_id uuid FK accounts, date date, start_time time, end_time time, city text,
  status text [VERIFIED VALUES: 'completed' | 'staffed' | 'needs_staff' | 'cancelled'],
  staff_category text [VERIFIED VALUES: 'DBC' | 'HB Internal Staff' | 'HB Sales Team' | NULL (when unstaffed)],
  staff_person text, notes text, created_at timestamptz)

agency_displays (id uuid, account_id uuid FK accounts, agency_name text, rep_id uuid FK profiles, display_type text, first_confirmed date, monthly_status jsonb, notes text)

sales_monthly (id uuid,
  month text [YYYY-MM format e.g. '2026-01'; for full year use month >= '2026-01' AND month <= '2026-12'; for range use month >= '2026-01' AND month <= '2026-05'],
  agency_id text, agency_name text, district text, vendor text, brand_code text,
  product_name text [see PRODUCT NAMES section below — always search this column for specific products],
  category text,
  brand_family text [VERIFIED VALUES: '(614) Vodka' | 'Bourbon' | 'Gin' | 'Midnight' | 'Midnight (Discontinued)' | 'Misc' | 'RTD' | 'Vodka' | 'Whiskey War'],
  sub_product text [VERIFIED: only 3 non-null values in entire table — 'HIGH BANK MIDNIGHT CASK' | 'Masters Blend' | 'Midnight Cask (Discontinued)'; every Whiskey War variant has sub_product = NULL — NEVER search sub_product for Whiskey War, always use product_name],
  size text, is_hb_agency boolean, hb_location text, retail_bottles int, retail_amount numeric, wholesale_bottles int, wholesale_amount numeric)

wholesale_detail (id uuid, month text [YYYY-MM format], agency_id text, agency_name text, brand_code text, brand_family text, sub_product text, size text, is_hb_agency boolean, hb_location text, permit_number text, wholesaler_name text, dba text, bottles_sold int, amount numeric)

bailment_monthly (id uuid, month text [YYYY-MM format], amount numeric)

sample_pulls (id uuid,
  pull_type text [VERIFIED VALUES: 'spirits' | 'swag'],
  person_name text,
  category text [VERIFIED VALUES: 'Kitchen' | 'Gifts' | 'Sales' | 'Donations' | 'Internal Events' | 'External Events' | 'Existing Accounts' | 'Influencers' | 'New Accounts' | 'Personal Bar Stock'],
  account_name text, notes text, created_at timestamptz)

sample_pull_items (id uuid, pull_id uuid FK sample_pulls, item_name text,
  item_category text [VERIFIED VALUES: 'Spirits' | 'T-Shirts' | 'Drinkware'],
  size text, quantity int)

account_groups (id uuid, group_name text, match_terms text[], match_columns text[], color text)

---

CRITICAL QUERY PATTERNS:

1. Visits by rep name — ALWAYS JOIN visit_logs → profiles on rep_id. visit_logs has no name field.
   SELECT COUNT(DISTINCT vl.account_id)
   FROM visit_logs vl
   JOIN profiles p ON p.id = vl.rep_id
   JOIN accounts a ON a.id = vl.account_id
   WHERE p.full_name ILIKE '%Samantha%'
     AND a.type = 'agency'
     AND vl.visited_at >= '2026-06-01' AND vl.visited_at < '2026-07-01'

2. Date ranges — always use >= / < with full timestamps, not BETWEEN:
   June 2026: visited_at >= '2026-06-01' AND visited_at < '2026-07-01'
   "This year" visit_logs: visited_at >= '2026-01-01' AND visited_at < '2027-01-01'
   "This year" sales_monthly: month >= '2026-01' AND month <= '2026-12'
   "Last month" = June 2026: >= '2026-06-01' AND < '2026-07-01'

3. Sales totals — always combine retail and wholesale:
   Bottles: SUM(retail_bottles + wholesale_bottles)
   Revenue: SUM(retail_amount + wholesale_amount)

4. Prospect filtering — status is case-inconsistent; always use:
   LOWER(status) = 'prospect'   (not status = 'prospect')

---

TERMINOLOGY → EXACT DATABASE VALUES:

Account types (accounts.type):
  "agencies" / "liquor stores" / "grocery" → type = 'agency'
  "wholesale accounts" / "wholesalers" → type = 'wholesale'
  "bars" / "restaurants" / "on-premise" → type = 'Bar/Restaurant'
  "all on-premise" / "non-agency" → type IN ('wholesale', 'Bar/Restaurant')

Tasting status (tastings.status):
  "unstaffed" / "need staff" / "no staff" → status = 'needs_staff'
  "staffed" / "have staff" → status = 'staffed'
  "done" / "finished" / "completed" → status = 'completed'
  "cancelled" / "canceled" → status = 'cancelled'

Visit types (visit_logs.visit_type):
  "in-person" / "visited" / "face to face" → visit_type = 'in_person'
  "calls" / "phone calls" / "called" → visit_type = 'phone_call'

KPI types (visit_kpis.kpi_type):
  "displays" / "shelf displays" → kpi_type = 'Display'
  "menu" / "menu placement" / "on menu" → kpi_type = 'Menu'
  "feature" / "featured" → kpi_type = 'Feature'
  "event" / "tasting event" → kpi_type = 'Event'
  "KPIs" (generic, all) → no kpi_type filter needed

Sample categories (sample_pulls.category):
  "kitchen samples" → category = 'Kitchen'
  "gift samples" / "gifts" → category = 'Gifts'
  "event samples" / "events" → category IN ('Internal Events', 'External Events')
  "sales samples" / "account samples" → category IN ('Sales', 'Existing Accounts', 'New Accounts')

---

COMPLETE product_name VALUES in sales_monthly (21 total — use ILIKE for partial matching):
'(614) Vodka x High Bank', 'Barrel Proof Bourbon', 'HIGH BANK MIDNIGHT CASK',
'High Bank Vodka', 'Midnight Cask (Discontinued)', 'Midnight Cask Barrel Proof',
'Midnight Manhattan', 'Old Fashioned RTD', 'Small Batch Bourbon',
'Statehouse Gin', 'Statehouse Gin Barrel Select', 'Whiskey War',
'Whiskey War Barrel Proof', 'Whiskey War Barrel Select', 'Whiskey War Cigar Cask',
'Whiskey War Cigar Cask Single Barrel', 'Whiskey War Double Double Oaked',
'Whiskey War Double Double Oaked Single Barrel', 'Whiskey War Double Oaked',
'Whiskey War Double Oaked Single Barrel', 'Whiskey War Master Blend'

PRODUCT NAME ALIASES — casual phrasing → SQL filter:
  "double double" → product_name ILIKE '%Double Double%'
  "double oaked" (not double double) → product_name ILIKE '%Double Oaked%' AND product_name NOT ILIKE '%Double Double%'
  "barrel proof" → product_name ILIKE '%Barrel Proof%'
  "cigar cask" → product_name ILIKE '%Cigar Cask%'
  "statehouse gin" / "gin" → brand_family = 'Gin'
  "vodka" / "high bank vodka" → brand_family = 'Vodka'
  "614 vodka" / "(614)" → brand_family = '(614) Vodka'
  "whiskey war" (all variants) → brand_family = 'Whiskey War'
  "midnight cask" → product_name ILIKE '%Midnight Cask%'
  "masters blend" / "master blend" → product_name ILIKE '%Master Blend%'
  "small batch" / "small batch bourbon" → product_name ILIKE '%Small Batch%'
  "barrel select" → product_name ILIKE '%Barrel Select%'
  "RTD" / "ready to drink" / "canned cocktail" → brand_family = 'RTD'
  "bourbon" (all) → brand_family = 'Bourbon'
  "old fashioned" → product_name ILIKE '%Old Fashioned%'
  "manhattan" → product_name ILIKE '%Manhattan%'`;

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
