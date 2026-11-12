// Card fronts for "Scam or Legit?": each format looks like the real thing.
import type { ReactNode } from 'react';
import type { FraudCard } from '@/lib/fraud-training/cards';

// Underline anything that looks like a link, so people learn to read it.
const LINK_RE = /((?:https?:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|link|co|gov)(?:\/[^\s]*)?|REVIEW DOCUMENT|Click here)/gi;
function withLinks(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    out.push(<span key={i} className="ft-link">{m[0]}</span>);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
const initials = (s: string) => {
  const w = s.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter(Boolean);
  return w.length ? (w[0][0] + (w[1]?.[0] ?? '')).toUpperCase() : '#';
};

export function CardFront({ card }: { card: FraudCard }) {
  switch (card.format) {
    case 'text': return <TextThread card={card} />;
    case 'call': return <IncomingCall card={card} />;
    case 'email': return <EmailView card={card} />;
    case 'door': return <DoorScene card={card} />;
    default: return <FloorScene card={card} />;
  }
}

function TextThread({ card }: { card: FraudCard }) {
  const isNumber = /^[+\d(][\d\s()+-]+$/.test(card.sender);
  if (card.app === 'instagram') {
    return (
      <div className="ft-face ft-front">
        <div className="ft-insta-head"><span className="ft-avatar">{initials(card.sender)}</span>Instagram · {card.sender}</div>
        <div className="ft-sms-body">
          <span className="ft-stamp-time">Today 9:41 PM</span>
          <div className="ft-bubble">{withLinks(card.content)}</div>
        </div>
      </div>
    );
  }
  const group = card.app === 'group';
  const [who, msg] = group && card.content.includes(':') ? [card.content.slice(0, card.content.indexOf(':')), card.content.slice(card.content.indexOf(':') + 1).trim()] : [null, card.content];
  return (
    <div className="ft-face ft-front">
      <div className="ft-sms-head">
        <span className="ft-avatar">{isNumber ? <PersonIcon /> : initials(card.sender)}</span>
        <span className="ft-sms-name">{card.sender}</span>
      </div>
      <div className="ft-sms-body">
        <span className="ft-stamp-time">{card.app === 'imessage' || group ? 'iMessage' : 'Text Message'} · Today 2:14 PM</span>
        <div className="ft-bubble">{who && <span className="who">{who}</span>}{withLinks(msg)}</div>
      </div>
    </div>
  );
}

function IncomingCall({ card }: { card: FraudCard }) {
  return (
    <div className="ft-face ft-front" style={{ background: '#121a2b' }}>
      <div className="ft-call">
        <span className="lbl">Incoming call</span>
        <span className="name">{card.sender}</span>
        {card.from && <span className="num">{card.from}</span>}
        <div className="ft-transcript"><span className="q">They say</span>&ldquo;{card.content}&rdquo;</div>
        <div className="ft-callbtns" aria-hidden="true">
          <span style={{ background: '#ff3b30' }}><svg viewBox="0 0 24 24" fill="#fff"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08a.996.996 0 0 1 0-1.41C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28a11.27 11.27 0 0 0-2.67-1.85.996.996 0 0 1-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" /></svg></span>
          <span style={{ background: '#34c759' }}><svg viewBox="0 0 24 24" fill="#fff"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" /></svg></span>
        </div>
      </div>
    </div>
  );
}

function EmailView({ card }: { card: FraudCard }) {
  return (
    <div className="ft-face ft-front">
      <div className="ft-mail-top">‹ Inbox</div>
      <div className="ft-mail-meta">
        <span className="ft-mail-from">{card.sender}</span>
        {card.from && <span className="ft-mail-addr">&lt;{card.from}&gt;</span>}
        <span className="ft-mail-addr">To: me · 8:02 AM</span>
        {card.subject && <span className="ft-mail-subj">{card.subject}</span>}
      </div>
      <div className="ft-mail-body">{withLinks(card.content)}</div>
    </div>
  );
}

function DoorScene({ card }: { card: FraudCard }) {
  return (
    <div className="ft-face ft-front ft-scene">
      <div className="ft-scene-art"><Person look={card.look ?? 'casual'} /></div>
      <div className="ft-scene-who">At the host stand · {card.sender}</div>
      <div className="ft-speech">&ldquo;{card.content}&rdquo;</div>
    </div>
  );
}

function FloorScene({ card }: { card: FraudCard }) {
  return (
    <div className="ft-face ft-front ft-scene">
      <div className="ft-scene-art"><FloorArt scene={card.scene ?? 'receipt'} /></div>
      <div className="ft-scene-who">On the floor · {card.sender}</div>
      <div className="ft-scene-text">{card.content}</div>
    </div>
  );
}

function PersonIcon() {
  return <svg viewBox="0 0 24 24" width="30" height="30" fill="#fff" aria-hidden="true"><circle cx="12" cy="8" r="4.2" /><path d="M3.5 21c.8-4.4 4.2-7 8.5-7s7.7 2.6 8.5 7z" /></svg>;
}

// A person at the host stand. Simple shapes so it reads on a small, dim screen.
function Person({ look }: { look: NonNullable<FraudCard['look']> }) {
  const body = { suit: '#1f2a44', badge: '#4a4f57', uniform: '#2f5d8a', driver: '#c0392b', casual: '#6b8e5a', inspector: '#3d6b8a' }[look];
  return (
    <svg viewBox="0 0 320 190" aria-hidden="true">
      <rect x="0" y="150" width="320" height="40" fill="#2a1d14" />
      <path d="M95 190 L110 112 Q160 92 210 112 L225 190Z" fill={body} />
      {look === 'suit' && <><path d="M150 108 L160 150 L170 108 Z" fill="#f6efe4" /><path d="M157 112 L160 146 L163 112Z" fill="#8b1e1e" /></>}
      {look === 'badge' && <><rect x="172" y="122" width="22" height="16" rx="3" fill="#f3c15a" /><circle cx="183" cy="130" r="4" fill="#b8862f" /></>}
      {look === 'uniform' && <><rect x="118" y="124" width="22" height="12" rx="2" fill="#f3c15a" /><rect x="180" y="124" width="18" height="10" rx="2" fill="#d8e3ee" /></>}
      {look === 'driver' && <><rect x="196" y="122" width="44" height="40" rx="6" fill="#e39536" /><path d="M204 122 q14-14 28 0" stroke="#7a4a26" strokeWidth="5" fill="none" /></>}
      {look === 'inspector' && <><path d="M150 108 L160 138 L170 108" stroke="#f6efe4" strokeWidth="3" fill="none" /><rect x="152" y="138" width="16" height="22" rx="2" fill="#f6efe4" /><rect x="155" y="142" width="10" height="6" fill="#3d6b8a" /></>}
      {look === 'casual' && <rect x="196" y="120" width="30" height="40" rx="3" fill="#f6efe4" transform="rotate(8 211 140)" />}
      <circle cx="160" cy="70" r="30" fill="#e0ac85" />
      <path d="M130 64 q30-40 60 0 q-6-22-30-24 q-24 2-30 24Z" fill={look === 'driver' ? '#c0392b' : '#3a2414'} />
      {look === 'driver' && <rect x="128" y="56" width="66" height="8" rx="4" fill="#922b21" />}
      <circle cx="149" cy="72" r="3.2" fill="#1b120c" /><circle cx="171" cy="72" r="3.2" fill="#1b120c" />
      <path d="M150 86 q10 6 20 0" stroke="#1b120c" strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="40" y="128" width="70" height="62" rx="6" fill="#4a382b" /><rect x="40" y="124" width="70" height="10" rx="4" fill="#5c4532" />
    </svg>
  );
}

function FloorArt({ scene }: { scene: NonNullable<FraudCard['scene']> }) {
  const table = <rect x="0" y="120" width="320" height="70" fill="#5c3b22" />;
  switch (scene) {
    case 'qr':
      return (
        <svg viewBox="0 0 320 190" aria-hidden="true">{table}
          <rect x="112" y="40" width="96" height="96" rx="6" fill="#fff" />
          <g fill="#111">{[0, 1, 2, 3, 4, 5].flatMap((r) => [0, 1, 2, 3, 4, 5].filter((c) => (r * 7 + c * 3) % 4 !== 0).map((c) => <rect key={`${r}-${c}`} x={122 + c * 13} y={50 + r * 13} width="11" height="11" />))}</g>
          <rect x="120" y="34" width="96" height="96" rx="6" fill="none" stroke="#ff7a5c" strokeWidth="4" strokeDasharray="8 6" transform="rotate(4 168 82)" />
          <text x="230" y="60" fill="#ff7a5c" fontSize="16" fontWeight="700">sticker?</text>
        </svg>
      );
    case 'reader':
      return (
        <svg viewBox="0 0 320 190" aria-hidden="true">{table}
          <rect x="110" y="20" width="100" height="140" rx="14" fill="#2b2b2b" /><rect x="122" y="32" width="76" height="52" rx="6" fill="#7fb3d5" />
          <rect x="100" y="120" width="120" height="34" rx="6" fill="#8a8a8a" stroke="#ff7a5c" strokeWidth="4" />
          <text x="226" y="142" fill="#ff7a5c" fontSize="15" fontWeight="700">wiggles</text>
        </svg>
      );
    case 'cash': case 'counterfeit':
      return (
        <svg viewBox="0 0 320 190" aria-hidden="true">{table}
          <rect x="60" y="56" width="200" height="92" rx="8" fill="#9bbf8a" stroke="#4f7a3f" strokeWidth="3" />
          <circle cx="160" cy="102" r="28" fill="#c7ddb8" stroke="#4f7a3f" strokeWidth="3" />
          <text x="160" y="112" textAnchor="middle" fontSize="30" fontWeight="800" fill="#2f4f23">{scene === 'counterfeit' ? '20' : '100'}</text>
          {scene === 'counterfeit' && <text x="250" y="48" fill="#ff7a5c" fontSize="34" fontWeight="900">?</text>}
          {scene === 'cash' && <rect x="76" y="40" width="200" height="92" rx="8" fill="#b7d4a6" stroke="#4f7a3f" strokeWidth="3" opacity=".7" />}
        </svg>
      );
    case 'cards':
      return (
        <svg viewBox="0 0 320 190" aria-hidden="true">{table}
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={70 + i * 30} y={40 + (i % 2) * 10} width="90" height="58" rx="8" fill={['#2a78d6', '#e39536', '#1baf7a', '#7b5ea7', '#c0392b'][i]} stroke="#fff" strokeWidth="2" transform={`rotate(${-12 + i * 6} ${115 + i * 30} ${70})`} />)}
        </svg>
      );
    case 'phone':
      return (
        <svg viewBox="0 0 320 190" aria-hidden="true">{table}
          <rect x="128" y="18" width="64" height="120" rx="12" fill="#222" /><rect x="134" y="30" width="52" height="92" rx="4" fill="#4a7fb5" />
          <path d="M210 50 q14 20 0 40 M222 40 q24 30 0 60" stroke="#f3c15a" strokeWidth="4" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'tap':
      return (
        <svg viewBox="0 0 320 190" aria-hidden="true">{table}
          <rect x="120" y="30" width="80" height="120" rx="12" fill="#2b2b2b" /><rect x="130" y="42" width="60" height="44" rx="5" fill="#7fb3d5" />
          <rect x="60" y="60" width="70" height="44" rx="6" fill="#2a78d6" stroke="#fff" strokeWidth="2" transform="rotate(-14 95 82)" />
          <path d="M210 70 q10 14 0 28 M220 62 q18 22 0 44" stroke="#9ad27f" strokeWidth="4" fill="none" strokeLinecap="round" />
        </svg>
      );
    case 'pos':
      return (
        <svg viewBox="0 0 320 190" aria-hidden="true">{table}
          <rect x="90" y="18" width="140" height="96" rx="8" fill="#2b2b2b" /><rect x="100" y="28" width="120" height="70" rx="4" fill="#d9e6f2" />
          <rect x="150" y="114" width="20" height="14" fill="#555" />
          <rect x="232" y="72" width="44" height="18" rx="3" fill="#ff7a5c" /><rect x="222" y="76" width="12" height="10" fill="#bbb" />
        </svg>
      );
    default: // receipt
      return (
        <svg viewBox="0 0 320 190" aria-hidden="true">{table}
          <path d="M120 14 h80 v140 l-10 -8 -10 8 -10 -8 -10 8 -10 -8 -10 8 -10 -8 -10 8z" fill="#fffaf0" />
          {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x="132" y={30 + i * 16} width={i === 5 ? 34 : 56} height="6" rx="3" fill="#c9bba8" />)}
          <rect x="132" y="128" width="56" height="8" rx="3" fill="#1b120c" />
        </svg>
      );
  }
}
