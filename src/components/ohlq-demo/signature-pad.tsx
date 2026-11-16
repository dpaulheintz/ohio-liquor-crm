'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signaturePath, type Signature } from '@/lib/ohlq-demo/shared';

/** Draw-to-sign pad (finger, stylus or mouse). Emits vector strokes, or null when cleared. */
export function SignaturePad({ onChange, height = 160, label = 'Sign here' }: { onChange: (sig: Signature | null) => void; height?: number; label?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<[number, number][][]>([]);
  const drawing = useRef(false);
  const size = useRef({ w: 300, h: height });
  const [empty, setEmpty] = useState(true);

  const redraw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.current.w, size.current.h);
    ctx.strokeStyle = '#14266f';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes.current) {
      ctx.beginPath();
      s.forEach(([x, y], i) => {
        if (i === 0) ctx.moveTo(x, y);
        else {
          const [px, py] = s[i - 1];
          ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2);
        }
      });
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1] + 0.1);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current, c = canvasRef.current;
    if (!wrap || !c) return;
    const fit = () => {
      const w = wrap.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      const old = size.current;
      if (old.w && w !== old.w && strokes.current.length) {
        const k = w / old.w; // keep the drawing when the box resizes (rotation)
        strokes.current = strokes.current.map((s) => s.map(([x, y]) => [x * k, y * k] as [number, number]));
      }
      size.current = { w, h: height };
      c.width = Math.round(w * dpr);
      c.height = Math.round(height * dpr);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [height, redraw]);

  const emit = () => {
    const pts = strokes.current.filter((s) => s.length > 0);
    const total = pts.reduce((n, s) => n + s.length, 0);
    const ok = total >= 6;
    setEmpty(!ok);
    onChange(ok ? { w: Math.round(size.current.w), h: Math.round(size.current.h), strokes: pts.map((s) => s.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as [number, number])) } : null);
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(r.width, e.clientX - r.left)), Math.max(0, Math.min(r.height, e.clientY - r.top))];
  };

  return (
    <div>
      <div ref={wrapRef} className="ohlq-sigbox" style={{ height }} data-signature-pad>
        <span className="ohlq-sigx">✕</span>
        <span className="ohlq-sigline" />
        {empty && (
          <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aaa', font: '15px var(--ohlq-serif)', pointerEvents: 'none' }}>
            {label}
          </span>
        )}
        <canvas
          ref={canvasRef}
          aria-label="Signature pad: draw your signature"
          role="img"
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            strokes.current.push([pos(e)]);
            redraw();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const s = strokes.current[strokes.current.length - 1];
            const p = pos(e);
            const last = s[s.length - 1];
            if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1.2) return;
            s.push(p);
            redraw();
          }}
          onPointerUp={() => { drawing.current = false; emit(); }}
          onPointerCancel={() => { drawing.current = false; emit(); }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span className="ohlq-help" style={{ marginTop: 0 }}>Use your finger, stylus or mouse.</span>
        <button type="button" className="ohlq-linkbtn" onClick={() => { strokes.current = []; redraw(); emit(); }}>Clear</button>
      </div>
    </div>
  );
}

/** Read-only rendering of a stored signature. */
export function SignatureView({ sig, width = 240, color = '#14266f' }: { sig: Signature | null; width?: number; color?: string }) {
  if (!sig) return null;
  const { d, height } = signaturePath(sig, width);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Signature" style={{ maxWidth: '100%', height: 'auto', display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
