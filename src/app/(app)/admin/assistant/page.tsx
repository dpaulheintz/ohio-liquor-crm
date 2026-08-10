'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles, Send, Loader2, User, Bot, MessageSquarePlus, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QueryTrace {
  sql: string;
  rowCount: number;
  error?: string;
}

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  meta?: { queries: QueryTrace[]; rounds: number; model: string; ms: number };
}

/** Exchanges (user+assistant pairs) of context sent to the model. */
const HISTORY_PAIRS = 6;

const SUGGESTION_GROUPS: { label: string; items: string[] }[] = [
  {
    label: 'Sales & CRM',
    items: [
      'Who are our top 10 wholesale accounts by revenue this year?',
      "Which agencies haven't been visited in 30 days?",
      "What's our YTD revenue vs last year by brand family?",
    ],
  },
  {
    label: 'Restaurant',
    items: [
      'What was our prime cost last month across all locations?',
      'Which location has the best average check?',
      "What's our best selling menu item this quarter?",
    ],
  },
  {
    label: 'Scenario Modeling',
    items: [
      'If we ran half off whiskey cocktails for 6 months, what would it cost us?',
      'What if we closed Westerville on Mondays?',
      'How much would a $1 price increase on cocktails have made us last quarter?',
    ],
  },
];

export default function AssistantPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [openTrace, setOpenTrace] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  function newConversation() {
    setMessages([]);
    setInput('');
    setOpenTrace(null);
    textareaRef.current?.focus();
  }

  async function submit(question: string) {
    const q = question.trim();
    if (!q || loading) return;

    // Snapshot history BEFORE adding the new question, so the model sees prior
    // exchanges as context rather than the question it is about to answer.
    const history = messages
      .slice(-HISTORY_PAIRS * 2)
      .map(({ role, content }) => ({ role, content }));

    setMessages(prev => [...prev, { id: nextId.current++, role: 'user', content: q }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      });
      const data = (await res.json()) as {
        answer?: string;
        error?: string;
        meta?: Message['meta'];
      };
      setMessages(prev => [
        ...prev,
        {
          id: nextId.current++,
          role: 'assistant',
          content: data.answer ?? data.error ?? 'Something went wrong.',
          meta: data.meta,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { id: nextId.current++, role: 'assistant', content: 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    submit(input);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold">AI Assistant</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Ask follow-up questions — I remember our conversation.
            </p>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={newConversation} className="shrink-0 gap-1.5">
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New Conversation
            </Button>
          )}
        </div>
      </div>

      {/* Thread */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="mt-4 space-y-5">
            <p className="text-sm font-medium text-muted-foreground">Try asking…</p>
            {SUGGESTION_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                  {group.label}
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.items.map(s => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="text-xs rounded-full border border-border bg-muted/50 px-3 py-1.5 text-foreground/70 hover:bg-muted hover:text-foreground transition-colors text-left"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {messages.map(msg => (
              <div key={msg.id} className="py-4 first:pt-0">
                <div className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                  {msg.role === 'assistant' && (
                    <div className="shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm whitespace-pre-wrap'
                        : 'bg-muted text-foreground rounded-bl-sm',
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <div
                        className="
                          [&_p]:mb-2 [&_p:last-child]:mb-0
                          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2
                          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2
                          [&_li]:mb-0.5
                          [&_strong]:font-semibold
                          [&_code]:rounded [&_code]:bg-background/70 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]
                          [&_table]:w-full [&_table]:my-2 [&_table]:text-xs [&_table]:border-collapse
                          [&_th]:border [&_th]:border-border [&_th]:bg-background/60 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold
                          [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1
                          [&_h1]:text-base [&_h1]:font-semibold [&_h1]:mb-2
                          [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-1.5
                          [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1
                        "
                      >
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>

                {/* Query trace — how the answer was derived */}
                {msg.role === 'assistant' && msg.meta && msg.meta.queries.length > 0 && (
                  <div className="ml-10 mt-1.5">
                    <button
                      onClick={() => setOpenTrace(openTrace === msg.id ? null : msg.id)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ChevronDown
                        className={cn('h-3 w-3 transition-transform', openTrace === msg.id && 'rotate-180')}
                      />
                      {msg.meta.queries.length} quer{msg.meta.queries.length === 1 ? 'y' : 'ies'} ·{' '}
                      {(msg.meta.ms / 1000).toFixed(1)}s · {msg.meta.model}
                    </button>
                    {openTrace === msg.id && (
                      <div className="mt-1.5 space-y-1.5">
                        {msg.meta.queries.map((q, i) => (
                          <div key={i} className="rounded-lg border bg-background/60 p-2">
                            <pre className="text-[10px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words font-mono">
                              {q.sql}
                            </pre>
                            <p
                              className={cn(
                                'text-[10px] mt-1',
                                q.error ? 'text-red-600' : 'text-muted-foreground/70',
                              )}
                            >
                              {q.error ? `Error: ${q.error}` : `${q.rowCount} row(s)`}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="py-4 flex gap-3 justify-start">
                <div className="shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analyzing…
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t bg-background px-6 py-4">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about sales, visits, restaurants — or a what-if scenario…"
            className="min-h-[44px] max-h-32 resize-none flex-1"
            rows={1}
            disabled={loading}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || loading} className="h-11 w-11 shrink-0">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Press Enter to send · Shift+Enter for a new line
        </p>
      </div>
    </div>
  );
}
