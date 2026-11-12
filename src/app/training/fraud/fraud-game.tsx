'use client';

// "Scam or Legit?" — the player. Phone-first; swipe left = SCAM, right = LEGIT (or tap the buttons).
// The server deals the deck (/api/fraud-training/start) and grades the run (/submit); the scoring shown
// here uses the same rules (src/lib/fraud-training/game.ts) so the numbers match.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Award, Check, ChevronRight, Flame, RotateCcw, ShieldCheck, Volume2, VolumeX, X } from 'lucide-react';
import { GOLDEN_RULES, ROUNDS, type Answer } from '@/lib/fraud-training/cards';
import {
  CARDS_PER_ROUND, LOCATIONS, PASS_PERCENT, badgeFor, cardById, gradeRun, locationLabel, quarterLabel, quarterOf,
  type AnswerInput, type SubmitResult,
} from '@/lib/fraud-training/game';
import { CardFront } from './card-views';

type Phase = 'intro' | 'round' | 'card' | 'end' | 'done';
interface Run { token: string; quarter: string; ids: string[]; startedAt: number }
interface Saved extends Run { answers: AnswerInput[] }

const RUN_KEY = 'hb-fraud-run-v1';
const PLAYER_KEY = 'hb-fraud-player-v1';
const SOUND_KEY = 'hb-fraud-sound-v1';
const SWIPE_AT = 90; // px

const ls = {
  get<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ─── sound: off by default, tiny WebAudio blips ───
const Snd = {
  ctx: null as AudioContext | null,
  play(kind: 'good' | 'bad' | 'flip' | 'win') {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = this.ctx ?? new Ctx();
      const c = this.ctx, t = c.currentTime;
      const notes = { good: [660, 990], bad: [220, 160], flip: [420], win: [523, 659, 784, 1047] }[kind];
      notes.forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = kind === 'bad' ? 'square' : 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.09); g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.16);
        o.connect(g).connect(c.destination); o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.18);
      });
    } catch { /* no audio */ }
  },
};

function confetti() {
  const box = document.createElement('div'); box.className = 'ft-confetti';
  const cols = ['#f3c15a', '#e39536', '#f6efe4', '#9ad27f', '#ff7a5c'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`; p.style.background = cols[i % cols.length];
    p.style.animationDuration = `${1.8 + Math.random() * 1.6}s`; p.style.animationDelay = `${Math.random() * 0.6}s`;
    p.style.setProperty('--dx', `${Math.random() * 140 - 70}px`); p.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`);
    box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 4200);
}

export function FraudGame() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [run, setRun] = useState<Run | null>(null);
  const [answers, setAnswers] = useState<AnswerInput[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(false);
  const [resumable, setResumable] = useState<Saved | null>(null);
  const [flash, setFlash] = useState<'' | 'good' | 'bad'>('');
  const [cardAnim, setCardAnim] = useState<'enter' | 'shake' | ''>('enter');
  const [result, setResult] = useState<SubmitResult['attempt'] | null>(null);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [loc, setLoc] = useState('');
  const shownAt = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; dx: number } | null>(null);
  const quarter = run?.quarter ?? quarterOf();

  useEffect(() => {
    // client-only state read once on load: saved run, sound choice, last name/location
    const saved = ls.get<Saved>(RUN_KEY);
    const p = ls.get<{ first: string; last: string; loc: string }>(PLAYER_KEY);
    const snd = ls.get<boolean>(SOUND_KEY) === true;
    if (saved && Date.now() - saved.startedAt < 5.5 * 3600 * 1000 && saved.ids?.length) setResumable(saved);
    else if (saved) ls.del(RUN_KEY);
    if (p) { setFirst(p.first ?? ''); setLast(p.last ?? ''); setLoc(p.loc ?? ''); }
    setSound(snd);
  }, []);

  const sfx = useCallback((k: Parameters<typeof Snd.play>[0]) => { if (sound) Snd.play(k); }, [sound]);
  const i = answers.length - (revealed ? 1 : 0); // index of the card on screen
  const card = run ? cardById(run.ids[Math.min(i, run.ids.length - 1)]) : undefined;
  const graded = useMemo(() => gradeRun(answers), [answers]);
  const last1 = graded.graded[graded.graded.length - 1];
  const streak = last1?.correct ? last1.streak : 0;
  const roundIdx = Math.floor(Math.min(i, 29) / CARDS_PER_ROUND);

  async function start() {
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/fraud-training/start', { method: 'POST', cache: 'no-store' });
      const d = await r.json();
      if (!d.ok) throw new Error(r.status === 429 ? 'Too many tries. Wait a few minutes.' : 'start');
      const next: Run = { token: d.token, quarter: d.quarter, ids: d.ids, startedAt: Date.now() };
      setRun(next); setAnswers([]); setRevealed(false); setResult(null); setResumable(null);
      ls.set(RUN_KEY, { ...next, answers: [] });
      setPhase('round');
    } catch (e) {
      setError(e instanceof Error && e.message !== 'start' ? e.message : "Can't reach the server. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  function resume() {
    if (!resumable) return;
    const { answers: a, ...r } = resumable;
    setRun(r); setAnswers(a); setRevealed(false); setResumable(null);
    setPhase(a.length >= r.ids.length ? 'end' : a.length % CARDS_PER_ROUND === 0 ? 'round' : 'card');
    shownAt.current = performance.now(); setCardAnim('enter');
  }

  function answer(a: Answer) {
    if (!run || !card || revealed || phase !== 'card') return;
    const ms = Math.round(performance.now() - shownAt.current);
    const next = [...answers, { id: card.id, answer: a, ms }];
    const ok = card.answer === a;
    setAnswers(next); setRevealed(true);
    ls.set(RUN_KEY, { ...run, answers: next });
    resetDrag();
    try { navigator.vibrate?.(ok ? 25 : [70, 50, 70]); } catch { /* not supported (iPhone) */ }
    setFlash(ok ? 'good' : 'bad'); setTimeout(() => setFlash(''), 650);
    setCardAnim(ok ? '' : 'shake');
    sfx(ok ? 'good' : 'bad');
  }

  function nextCard() {
    if (!run) return;
    const n = answers.length;
    setRevealed(false); setCardAnim('enter');
    if (n >= run.ids.length) { setPhase('end'); confetti(); sfx('win'); return; }
    if (n % CARDS_PER_ROUND === 0) { setPhase('round'); return; }
    shownAt.current = performance.now(); sfx('flip');
  }

  function beginRound() { setPhase('card'); setCardAnim('enter'); shownAt.current = performance.now(); }

  // ─── swipe ───
  function setDragStyle(dx: number) {
    const el = wrapRef.current; if (!el) return;
    el.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 16}deg)` : '';
    el.style.transition = dx ? 'none' : 'transform .25s ease';
    const s = el.querySelectorAll<HTMLElement>('.ft-stamp');
    s[0].style.opacity = String(Math.min(1, Math.max(0, -dx / SWIPE_AT)));
    s[1].style.opacity = String(Math.min(1, Math.max(0, dx / SWIPE_AT)));
  }
  function resetDrag() { drag.current = null; setDragStyle(0); }
  const onDown = (e: React.PointerEvent) => {
    if (revealed || phase !== 'card') return;
    drag.current = { id: e.pointerId, x: e.clientX, dx: 0 };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    d.dx = e.clientX - d.x; setDragStyle(d.dx);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.id !== e.pointerId) return;
    if (Math.abs(d.dx) >= SWIPE_AT) answer(d.dx < 0 ? 'scam' : 'legit'); else resetDrag();
  };

  async function submit() {
    if (!run) return;
    setBusy(true); setError('');
    try {
      const r = await fetch('/api/fraud-training/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ token: run.token, answers, firstName: first, lastName: last, location: loc }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'Could not save. Try again.');
      ls.set(PLAYER_KEY, { first, last, loc }); ls.del(RUN_KEY);
      setResult(d.attempt); setPhase('done');
      if (d.attempt.passed) { confetti(); sfx('win'); }
      document.querySelector('.ft-screen')?.scrollTo({ top: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.');
    } finally { setBusy(false); }
  }

  const soundBtn = (
    <button type="button" className="ft-iconbtn" aria-label={sound ? 'Sound off' : 'Sound on'} onClick={() => { const v = !sound; setSound(v); ls.set(SOUND_KEY, v); if (v) Snd.play('flip'); }}>
      {sound ? <Volume2 /> : <VolumeX />}
    </button>
  );

  // ─── screens ───
  if (phase === 'intro') {
    return (
      <section className="ft-screen ft-glow">
        <div className="ft-wrap" style={{ minHeight: '100%', justifyContent: 'center' }}>
          <div className="ft-hudrow"><span className="ft-kick">High Bank · Fraud training</span>{soundBtn}</div>
          <span className="ft-quarter">{quarterLabel(quarter)} Check-in</span>
          <h1 className="ft-title">Scam <span>or Legit?</span></h1>
          <p className="ft-lede">Scammers target restaurants every day. Can you spot them?</p>
          <ul className="ft-howto">
            <li><span className="n"><X /></span><span><b>Swipe left</b> (or tap) for <b>SCAM</b></span></li>
            <li><span className="n"><Check /></span><span><b>Swipe right</b> (or tap) for <b>LEGIT</b></span></li>
            <li><span className="n"><Flame /></span><span>30 cards, about 10 minutes. Streaks score more. Get <b>80%</b> to pass.</span></li>
          </ul>
          {error && <p className="ft-error" role="alert">{error}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
            {resumable && <button type="button" className="ft-big gold" onClick={resume}>Resume ({resumable.answers.length}/30)</button>}
            <button type="button" className={resumable ? 'ft-ghost' : 'ft-big'} disabled={busy} onClick={start}>{busy ? 'Dealing…' : resumable ? 'Start over' : 'Start'}</button>
          </div>
        </div>
      </section>
    );
  }

  if (phase === 'round' && run) {
    const r = ROUNDS[Math.floor(answers.length / CARDS_PER_ROUND)];
    return (
      <section className="ft-screen ft-glow ft-round" onClick={beginRound}>
        <span className="ft-kick">Round {r.n} of {ROUNDS.length}</span>
        <span className="big-n">{r.n}</span>
        <h2 className="ft-h2">{r.title}</h2>
        <p className="ft-lede ft-muted">{r.tagline}</p>
        <div className="ft-wrap" style={{ marginTop: 18 }}>
          <button type="button" className="ft-big" onClick={(e) => { e.stopPropagation(); beginRound(); }}>Let&apos;s go</button>
        </div>
      </section>
    );
  }

  if (phase === 'card' && run && card) {
    const g = last1;
    return (
      <section className="ft-screen" style={{ overflow: 'hidden' }}>
        <div className={`ft-flash ${flash}`} />
        <div className="ft-wrap" style={{ flex: 1, minHeight: 0 }}>
          <div className="ft-hud">
            <div className="ft-hudrow">
              <span className="ft-kick">Round {roundIdx + 1} · {ROUNDS[roundIdx].title}</span>
              {soundBtn}
            </div>
            <div className="ft-progress" aria-label={`Card ${Math.min(i + 1, 30)} of 30`}><i style={{ width: `${(answers.length / run.ids.length) * 100}%` }} /></div>
            <div className="ft-hudrow">
              <span className="ft-score">{graded.score.toLocaleString('en-US')}</span>
              <span className="ft-small">Card {Math.min(i + 1, 30)} of {run.ids.length}</span>
              <span className="ft-streak" style={{ visibility: streak >= 3 ? 'visible' : 'hidden' }}><Flame />{streak} in a row</span>
            </div>
          </div>
          <div className="ft-stage">
            <div
              ref={wrapRef} key={card.id}
              className={`ft-cardwrap ${cardAnim}`}
              style={{ touchAction: revealed ? 'pan-y' : 'none' }}
              onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={resetDrag}
              onAnimationEnd={() => setCardAnim('')}
            >
              <div className={`ft-flip ${revealed ? 'flipped' : ''}`}>
                <CardFront card={card} />
                <div className="ft-face ft-back" aria-live="polite">
                  {revealed && g && (
                    <>
                      <div className={`ft-verdict ${g.correct ? 'good' : 'bad'}`}>
                        <h3>{g.correct ? <><Check />Correct!</> : <><X />Not quite</>}</h3>
                        <p>This one is {card.answer === 'scam' ? 'a SCAM' : 'LEGIT'}.{g.correct && <span className="ft-points"> +{g.points}</span>}</p>
                      </div>
                      <div className="ft-lesson">
                        <div><h4>{card.answer === 'scam' ? 'Red flag' : 'Why it’s fine'}</h4><p>{card.redFlag ?? card.whyLegit}</p></div>
                        <div><h4>What to do</h4><p>{card.whatToDo}</p></div>
                        {card.rule && <span className="ft-rulechip">Golden Rule #{card.rule}: {GOLDEN_RULES[card.rule - 1].split('.')[0]}</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <span className="ft-stamp scam" aria-hidden="true">Scam</span>
              <span className="ft-stamp legit" aria-hidden="true">Legit</span>
            </div>
          </div>
          {revealed ? (
            <button type="button" className="ft-big" onClick={nextCard}>
              {answers.length >= run.ids.length ? 'See my score' : answers.length % CARDS_PER_ROUND === 0 ? 'Next round' : 'Next card'}
              <ChevronRight style={{ verticalAlign: '-4px', marginLeft: 6 }} />
            </button>
          ) : (
            <div className="ft-answer-row">
              <button type="button" className="ft-answer scam" onClick={() => answer('scam')}><X />Scam</button>
              <button type="button" className="ft-answer legit" onClick={() => answer('legit')}>Legit<Check /></button>
            </div>
          )}
        </div>
      </section>
    );
  }

  if ((phase === 'end' || phase === 'done') && run) {
    const pct = graded.percent, pass = pct >= PASS_PERCENT, badge = badgeFor(pct);
    const missed = graded.graded.filter((x) => !x.correct).map((x) => cardById(x.id)!).filter(Boolean);
    if (phase === 'done' && result) return <DoneScreen result={result} onAgain={start} busy={busy} />;
    return (
      <section className="ft-screen ft-glow">
        <div className="ft-wrap">
          <div className="ft-hudrow"><span className="ft-kick">{quarterLabel(run.quarter)} Check-in · Results</span>{soundBtn}</div>
          <div className="ft-result">
            <span className="ft-small">Your score</span>
            <span className="score">{graded.score.toLocaleString('en-US')}</span>
            <span className="ft-lede">{graded.correct} of {graded.total} right · <b>{Math.floor(pct)}%</b></span>
            <span className={`ft-badge ${pass ? '' : 'rookie'}`}>{pass ? <Award /> : <RotateCcw />}{badge}</span>
            {graded.bestStreak >= 3 && <span className="ft-small">Best streak: {graded.bestStreak} in a row</span>}
          </div>
          {!pass && (
            <div className="ft-warn">You need <b>80%</b> to complete this quarter. You can record this attempt below, then play again with a fresh set of cards.</div>
          )}

          {missed.length > 0 && (
            <div className="ft-section">
              <h3>Cards you missed</h3>
              {missed.map((c) => (
                <div className="ft-miss" key={c.id}>
                  <span className={`tag ${c.answer}`}>{c.answer === 'scam' ? 'Scam' : 'Legit'} · {c.sender}</span>
                  <span className="quote">&ldquo;{c.content.length > 120 ? c.content.slice(0, 117) + '…' : c.content}&rdquo;</span>
                  <p>{c.redFlag ?? c.whyLegit}</p>
                  <p><b>Do this:</b> {c.whatToDo}</p>
                </div>
              ))}
            </div>
          )}

          <div className="ft-section">
            <h3>The 6 Golden Rules</h3>
            <ol className="ft-rules">{GOLDEN_RULES.map((r) => <li key={r}>{r}</li>)}</ol>
          </div>

          <div className="ft-section">
            <h3>Record your completion</h3>
            <div className="ft-field"><label htmlFor="ft-first">First name</label>
              <input id="ft-first" className="ft-input" value={first} maxLength={40} autoComplete="given-name" onChange={(e) => setFirst(e.target.value)} /></div>
            <div className="ft-field"><label htmlFor="ft-last">Last name</label>
              <input id="ft-last" className="ft-input" value={last} maxLength={40} autoComplete="family-name" onChange={(e) => setLast(e.target.value)} /></div>
            <div className="ft-field"><label>Location</label>
              <div className="ft-locs" role="radiogroup" aria-label="Location">
                {LOCATIONS.map((l) => (
                  <button key={l.value} type="button" role="radio" aria-checked={loc === l.value} className={`ft-loc ${loc === l.value ? 'on' : ''}`} onClick={() => setLoc(l.value)}>{l.label}</button>
                ))}
              </div>
            </div>
            {error && <p className="ft-error" role="alert">{error}</p>}
            <button type="button" className="ft-big gold" disabled={busy || !first.trim() || !last.trim() || !loc} onClick={submit}>{busy ? 'Saving…' : 'Submit'}</button>
          </div>
          {!pass && <button type="button" className="ft-ghost" disabled={busy} onClick={start}>Play again (fresh cards)</button>}
        </div>
      </section>
    );
  }

  return <section className="ft-screen ft-glow" />;
}

function DoneScreen({ result, onAgain, busy }: { result: SubmitResult['attempt']; onAgain: () => void; busy: boolean }) {
  const when = new Date(result.completedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (!result.passed) {
    return (
      <section className="ft-screen ft-glow">
        <div className="ft-wrap" style={{ minHeight: '100%', justifyContent: 'center' }}>
          <span className="ft-kick">{quarterLabel(result.quarter)} Check-in</span>
          <h2 className="ft-h2">Attempt recorded</h2>
          <div className="ft-warn">
            Thanks, {result.firstName}. You scored <b>{Math.floor(result.percent)}%</b> ({result.correct}/{result.total}). You need <b>80%</b> to complete this quarter, so give it another go. You&apos;ll get a fresh set of cards.
          </div>
          <p className="ft-small">Attempt code {result.code} · {when}</p>
          <button type="button" className="ft-big" disabled={busy} onClick={onAgain}>{busy ? 'Dealing…' : 'Play again'}</button>
        </div>
      </section>
    );
  }
  return (
    <section className="ft-screen ft-glow">
      <div className="ft-wrap" style={{ minHeight: '100%', justifyContent: 'center' }}>
        <div className="ft-cert">
          <span className="kick">Certificate of completion</span>
          <span className="name">{result.firstName} {result.lastName}</span>
          <span style={{ fontWeight: 600 }}>completed <b>Scam or Legit?</b> fraud training</span>
          <dl>
            <dt>Location</dt><dd>{locationLabel(result.location)}</dd>
            <dt>Quarter</dt><dd>{quarterLabel(result.quarter)}</dd>
            <dt>Completed</dt><dd>{when}</dd>
            <dt>Score</dt><dd>{result.score.toLocaleString('en-US')} · {Math.floor(result.percent)}%</dd>
            <dt>Badge</dt><dd>{result.badge}</dd>
          </dl>
          <span className="kick" style={{ marginTop: 6 }}>Completion code</span>
          <span className="ft-code">{result.code}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 15 }}><ShieldCheck size={18} />Screenshot this for your records</span>
        </div>
        <p className="ft-small" style={{ textAlign: 'center' }}>Nice work. See you next quarter!</p>
      </div>
    </section>
  );
}
