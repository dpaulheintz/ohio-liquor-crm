import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SCHEMA_PROMPT = `You are an AI assistant for High Bank Distillery's CRM system. You have read-only access to the following PostgreSQL database tables. When asked a question, generate a single PostgreSQL SELECT query that answers it.

Return ONLY the SQL query — no explanation, no markdown, no backticks. Just the raw SQL.

Always be specific with numbers. If the question is unclear, generate the most reasonable interpretation. Do not add a LIMIT unless the question calls for a top-N list; the executor caps results at 200. Never generate INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, or any non-SELECT statement.

DATABASE SCHEMA:

profiles (id uuid, email text, full_name text, role text [admin/rep], created_at timestamptz)

accounts (id uuid, display_name text, type text [agency/wholesale], status text [prospect/customer], city text, address text, agency_id text, district text, linked_agency_name text, linked_agency_id text, owner_rep_id uuid FK profiles, needs_review boolean, created_at timestamptz)

contacts (id uuid, account_id uuid FK accounts, name text, email text, phone text, title_role text, created_at timestamptz)

visit_logs (id uuid, account_id uuid FK accounts, rep_id uuid FK profiles, visit_type text [in_person/phone_call], notes text, visited_at timestamptz, created_at timestamptz)

visit_kpis (id uuid, visit_id uuid FK visit_logs, kpi_type text [Display/Menu/Feature/Event], kpi_quantity int, sold_status text [sold/unsold], display_type text [Wood/Box/Shelves], created_at timestamptz)

visit_photos (id uuid, visit_id uuid FK visit_logs, photo_url text, caption text, created_at timestamptz)

assignments (id uuid, account_id uuid FK accounts, assigned_to uuid FK profiles, assigned_by uuid FK profiles, notes text, status text [pending/completed], completed_at timestamptz, created_at timestamptz)

tastings (id uuid, agency_id uuid FK accounts, date date, start_time time, end_time time, city text, status text [needs_staff/staffed/completed/cancelled], staff_category text [DBC/HB Internal Staff/HB Sales Team], staff_person text, notes text, created_at timestamptz)

agency_displays (id uuid, account_id uuid FK accounts, agency_name text, rep_id uuid FK profiles, display_type text [Wood/Box/Shelves], first_confirmed date, monthly_status jsonb, notes text)

sales_monthly (id uuid, month date, agency_id text, agency_name text, district text, vendor text, brand_code text, product_name text, category text, brand_family text, sub_product text, size text, is_hb_agency boolean, hb_location text, retail_bottles int, retail_amount numeric, wholesale_bottles int, wholesale_amount numeric)

wholesale_detail (id uuid, month date, agency_id text, agency_name text, brand_code text, brand_family text, sub_product text, size text, is_hb_agency boolean, hb_location text, permit_number text, wholesaler_name text, dba text, bottles_sold int, amount numeric)

bailment_monthly (id uuid, month date, amount numeric)

sample_pulls (id uuid, pull_type text [spirits/swag], person_name text, category text, account_name text, notes text, created_at timestamptz)

sample_pull_items (id uuid, pull_id uuid FK sample_pulls, item_name text, item_category text, size text, quantity int)

account_groups (id uuid, group_name text, match_terms text[], match_columns text[], color text)`;

// Block any non-SELECT SQL
const DISALLOWED = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|execute|copy|call)\b/i;

function cleanSql(raw: string): string {
  return raw.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
}

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json() as { question: string };

    if (!question?.trim()) {
      return NextResponse.json({ error: 'No question provided.' }, { status: 400 });
    }

    // Step 1: Generate SQL
    const sqlRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SCHEMA_PROMPT },
        { role: 'user', content: `Generate a SQL query to answer: ${question}` },
      ],
      temperature: 0,
      max_tokens: 800,
    });

    const rawSql = sqlRes.choices[0]?.message?.content ?? '';
    const sql = cleanSql(rawSql);

    if (!sql) {
      return NextResponse.json({ answer: "I wasn't able to answer that. Try rephrasing." });
    }

    // Security: block any data-modifying SQL
    if (DISALLOWED.test(sql)) {
      return NextResponse.json({ answer: "I can only read data, not modify it." });
    }

    // Must start with SELECT
    if (!/^\s*select\b/i.test(sql)) {
      return NextResponse.json({ answer: "I can only answer questions about High Bank CRM data." });
    }

    // Step 2: Run query via exec_sql RPC (service-role only function)
    const supabase = createAdminClient();
    const { data: results, error } = await supabase.rpc('exec_sql', { query_text: sql });

    if (error) {
      console.error('[assistant] SQL error:', error.message, '\nSQL:', sql);
      return NextResponse.json({ answer: "I wasn't able to answer that. Try rephrasing." });
    }

    const rows = Array.isArray(results) ? results : [];
    if (rows.length === 0) {
      return NextResponse.json({ answer: "No data found. Try a different time period or criteria." });
    }

    // Step 3: Format answer in plain English
    const answerRes = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: "You are a helpful assistant for High Bank Distillery's CRM. Format the following query results into a clear, concise plain-English answer. Format currency as USD with $ and commas (e.g. $12,345). Use numbered lists for multiple items. Keep it to one paragraph or a short list — no preamble, no 'here are the results' framing.",
        },
        {
          role: 'user',
          content: `Question: ${question}\n\nQuery results (${rows.length} rows): ${JSON.stringify(rows)}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 600,
    });

    const answer = answerRes.choices[0]?.message?.content?.trim() ?? "I wasn't able to format an answer.";
    return NextResponse.json({ answer });

  } catch (err) {
    console.error('[assistant]', err);
    return NextResponse.json({ answer: "Something went wrong. Try rephrasing your question." });
  }
}
