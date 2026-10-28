#!/usr/bin/env node
// Converts the line-art coloring pages in public/play/coloring-pages/ into paint-by-number data
// and embeds it in public/play/index.html (between the PBN-DATA markers), so the arcade stays one file.
// Dev-time only (uses sharp from the CRM's node_modules). Run: node scripts/build-coloring-pages.mjs [--preview DIR]
//
// Pipeline per page: half-res grayscale -> wall mask (dark lines) -> flood-fill white regions ->
// grow regions under the lines -> merge tiny specks / slivers into the neighbor they share the most border with ->
// inscribed-circle label point per region -> color from the page's hand-written zone rules -> encode.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGES } from './coloring-pages.config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'public/play/coloring-pages');
const HTML = path.join(ROOT, 'public/play/index.html');
const SCALE = 0.5;          // work at half resolution (543 x 724)
const WALL = 165;           // gray below this is a line
const argPrev = process.argv.indexOf('--preview');
const PREVIEW = argPrev > 0 ? process.argv[argPrev + 1] : null;

async function convert(page) {
  const file = path.join(SRC, page.file);
  const meta = await sharp(file).metadata();
  const W = Math.round(meta.width * SCALE), H = Math.round(meta.height * SCALE), N = W * H;
  const gray = await sharp(file).greyscale().resize(W, H, { kernel: 'lanczos3' }).raw().toBuffer();

  // 1. walls + flood fill (4-connected)
  const wall = new Uint8Array(N);
  for (let i = 0; i < N; i++) wall[i] = gray[i] < WALL ? 1 : 0;
  // optional: thicken lines to close small gaps in sketchy outlines (fur, foliage)
  for (let k = 0; k < (page.close || 0); k++) {
    const src = wall.slice();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (src[i]) continue;
      if ((x > 0 && src[i - 1]) || (x < W - 1 && src[i + 1]) || (y > 0 && src[i - W]) || (y < H - 1 && src[i + W])) wall[i] = 1;
    }
  }
  const lab = new Int32Array(N).fill(-1);
  const area = [];
  const stack = new Int32Array(N);
  let nLab = 0;
  for (let s = 0; s < N; s++) {
    if (wall[s] || lab[s] >= 0) continue;
    let sp = 0, cnt = 0; stack[sp++] = s; lab[s] = nLab;
    while (sp) {
      const p = stack[--sp]; cnt++;
      const x = p % W, y = (p - x) / W;
      if (x > 0 && !wall[p - 1] && lab[p - 1] < 0) { lab[p - 1] = nLab; stack[sp++] = p - 1; }
      if (x < W - 1 && !wall[p + 1] && lab[p + 1] < 0) { lab[p + 1] = nLab; stack[sp++] = p + 1; }
      if (y > 0 && !wall[p - W] && lab[p - W] < 0) { lab[p - W] = nLab; stack[sp++] = p - W; }
      if (y < H - 1 && !wall[p + W] && lab[p + W] < 0) { lab[p + W] = nLab; stack[sp++] = p + W; }
    }
    area.push(cnt); nLab++;
  }

  // 2. chamfer distance to the nearest line (for label points / inscribed radius)
  const INF = 1e9, dist = new Float32Array(N);
  for (let i = 0; i < N; i++) dist[i] = wall[i] ? 0 : INF;
  const a = 1, b = Math.SQRT2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; let d = dist[i]; if (!d) continue;
    if (x > 0) d = Math.min(d, dist[i - 1] + a);
    if (y > 0) { d = Math.min(d, dist[i - W] + a); if (x > 0) d = Math.min(d, dist[i - W - 1] + b); if (x < W - 1) d = Math.min(d, dist[i - W + 1] + b); }
    dist[i] = d;
  }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
    const i = y * W + x; let d = dist[i]; if (!d) continue;
    if (x < W - 1) d = Math.min(d, dist[i + 1] + a);
    if (y < H - 1) { d = Math.min(d, dist[i + W] + a); if (x < W - 1) d = Math.min(d, dist[i + W + 1] + b); if (x > 0) d = Math.min(d, dist[i + W - 1] + b); }
    dist[i] = d;
  }
  // regions touching the image edge: treat the edge as a wall for the radius too
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; dist[i] = Math.min(dist[i], x + 1, y + 1, W - x, H - y); }

  // 3. grow labels under the lines (multi-source BFS)
  let q = new Int32Array(N), qh = 0, qt = 0;
  for (let i = 0; i < N; i++) if (lab[i] >= 0) q[qt++] = i;
  while (qh < qt) {
    const p = q[qh++], x = p % W, y = (p - x) / W, l = lab[p];
    const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
    for (const n of nb) if (n >= 0 && lab[n] < 0) { lab[n] = l; q[qt++] = n; }
  }
  for (let i = 0; i < N; i++) if (lab[i] < 0) lab[i] = 0; // pure-line image (never happens on real pages)

  // per-label best interior point
  const best = new Float32Array(nLab), bestAt = new Int32Array(nLab).fill(-1);
  for (let i = 0; i < N; i++) if (!wall[i]) { const l = lab[i]; if (dist[i] > best[l]) { best[l] = dist[i]; bestAt[l] = i; } }

  // 4. adjacency (shared border length) between labels
  const adj = Array.from({ length: nLab }, () => new Map());
  const addB = (u, v) => { if (u === v) return; adj[u].set(v, (adj[u].get(v) || 0) + 1); adj[v].set(u, (adj[v].get(u) || 0) + 1); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (x < W - 1) addB(lab[i], lab[i + 1]); if (y < H - 1) addB(lab[i], lab[i + W]); }

  // 5. merge tiny / sliver regions (union into the neighbor with the longest shared border)
  const parent = Int32Array.from({ length: nLab }, (_, i) => i);
  const find = u => { while (parent[u] !== u) { parent[u] = parent[parent[u]]; u = parent[u]; } return u; };
  const ar = area.slice(), rr = Array.from(best), at = Array.from(bestAt);
  const alive = new Set(Array.from({ length: nLab }, (_, i) => i));
  const merge = (u, v) => { // u into v
    parent[u] = v; ar[v] += ar[u]; if (rr[u] > rr[v]) { rr[v] = rr[u]; at[v] = at[u]; }
    for (const [w, c] of adj[u]) { if (w === v) continue; adj[v].set(w, (adj[v].get(w) || 0) + c); const m = adj[w]; m.set(v, (m.get(v) || 0) + c); m.delete(u); }
    adj[v].delete(u); adj[u] = null; alive.delete(u);
  };
  const minA = page.minArea ?? 90, minR = page.minR ?? 2.2, cap = page.cap ?? 400;
  let thr = minA;
  for (;;) {
    let changed = true;
    while (changed) {
      changed = false;
      const order = [...alive].sort((p, q2) => ar[p] - ar[q2]);
      for (const u of order) {
        if (!alive.has(u)) continue;
        if (ar[u] >= thr && rr[u] >= minR) continue;
        let bv = -1, bc = -1;
        for (const [v, c] of adj[u]) if (c > bc) { bc = c; bv = v; }
        if (bv < 0) continue;
        merge(u, bv); changed = true;
      }
    }
    if (alive.size <= cap) break;
    thr = Math.round(thr * 1.25);
  }

  // 6. final labels + region table
  const ids = [...alive].sort((p, q2) => p - q2), remap = new Map(ids.map((r, i) => [r, i]));
  const L = new Uint16Array(N);
  for (let i = 0; i < N; i++) L[i] = remap.get(find(lab[i]));
  const regions = ids.map(r => {
    const p = at[r], x = p % W, y = (p - x) / W;
    return { lx: x, ly: y, r: rr[r], area: ar[r] };
  });
  // bounding boxes
  const bb = regions.map(() => [W, H, 0, 0]);
  for (let i = 0; i < N; i++) { const x = i % W, y = (i - x) / W, B = bb[L[i]]; if (x < B[0]) B[0] = x; if (y < B[1]) B[1] = y; if (x > B[2]) B[2] = x; if (y > B[3]) B[3] = y; }
  regions.forEach((g, i) => { g.bb = bb[i]; g.el = g.area / (Math.PI * g.r * g.r); });

  // 7. colors from the page's zone rules (first match wins; tested at the label point)
  const inPoly = (u, v, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) c = !c; } return c; };
  const match = (rule, g) => {
    const u = g.lx / W, v = g.ly / H, fa = g.area / N;
    if (rule.rect && !(u >= rule.rect[0] && v >= rule.rect[1] && u <= rule.rect[2] && v <= rule.rect[3])) return false;
    if (rule.ell && ((u - rule.ell[0]) / rule.ell[2]) ** 2 + ((v - rule.ell[1]) / rule.ell[3]) ** 2 > 1) return false;
    if (rule.poly && !inPoly(u, v, rule.poly)) return false;
    if (rule.rMax !== undefined && g.r > rule.rMax) return false;
    if (rule.rMin !== undefined && g.r < rule.rMin) return false;
    if (rule.aMin !== undefined && fa < rule.aMin) return false;
    if (rule.aMax !== undefined && fa > rule.aMax) return false;
    if (rule.elMin !== undefined && g.el < rule.elMin) return false;
    if (rule.elMax !== undefined && g.el > rule.elMax) return false;
    return true;
  };
  const used = [];
  for (const g of regions) {
    const rule = page.rules.find(rl => match(rl, g));
    const key = !rule ? page.fallback : Array.isArray(rule.c) ? rule.c[(g.lx * 7 + g.ly * 13) % rule.c.length] : rule.c;
    if (!page.palette[key]) throw new Error(page.id + ': unknown color ' + key);
    if (!used.includes(key)) used.push(key);
    g.key = key;
  }
  // number colors in a stable, sensible order (palette declaration order)
  const keys = Object.keys(page.palette).filter(k => used.includes(k));
  if (keys.length < 6 || keys.length > 12) console.warn(`  ! ${page.id}: ${keys.length} colors used (want 6-12)`);
  regions.forEach(g => { g.ci = keys.indexOf(g.key); });

  // 8. encode label map (R + G*256) and the line layer (grayscale, 16 levels)
  const rgb = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) { rgb[i * 3] = L[i] & 255; rgb[i * 3 + 1] = L[i] >> 8; rgb[i * 3 + 2] = 0; }
  const labelsPng = await sharp(rgb, { raw: { width: W, height: H, channels: 3 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const LW = Math.round(meta.width * page.lineScale), LH = Math.round(meta.height * page.lineScale);
  const lineRaw = await sharp(file).greyscale().resize(LW, LH, { kernel: 'lanczos3' }).raw().toBuffer();
  for (let i = 0; i < lineRaw.length; i++) { let v = lineRaw[i]; v = v > 225 ? 255 : Math.round(v / 17) * 17; lineRaw[i] = v; }
  const linesPng = await sharp(lineRaw, { raw: { width: LW, height: LH, channels: 1 } }).png({ compressionLevel: 9, palette: true, colors: 16 }).toBuffer();

  if (PREVIEW) {
    fs.mkdirSync(PREVIEW, { recursive: true });
    const col = Buffer.alloc(N * 3);
    const hex = keys.map(k => page.palette[k].hex).map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
    for (let i = 0; i < N; i++) { const c = hex[regions[L[i]].ci]; col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
    const lineHalf = await sharp(file).greyscale().resize(W, H).raw().toBuffer();
    for (let i = 0; i < N; i++) { const k = lineHalf[i] / 255; col[i * 3] *= k; col[i * 3 + 1] *= k; col[i * 3 + 2] *= k; }
    // label numbers for regions with room
    const svg = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">'];
    regions.forEach(g => { if (g.r >= 4) svg.push(`<text x="${g.lx}" y="${g.ly + 3}" font-size="${Math.min(14, g.r * 1.1).toFixed(1)}" text-anchor="middle" font-family="Arial" fill="#000" fill-opacity=".55">${g.ci + 1}</text>`); });
    svg.push('</svg>');
    await sharp(col, { raw: { width: W, height: H, channels: 3 } }).composite([{ input: Buffer.from(svg.join('')) }]).png().toFile(path.join(PREVIEW, page.id + '-colored.png'));
  }

  const flat = [];
  for (const g of regions) flat.push(g.ci, g.lx, g.ly, Math.round(g.r * 10) / 10);
  return {
    out: {
      id: page.id, name: page.name, w: W, h: H,
      colors: keys.map(k => page.palette[k].hex), cnames: keys.map(k => page.palette[k].name),
      regions: flat, labels: labelsPng.toString('base64'), lines: linesPng.toString('base64'), lw: LW, lh: LH
    },
    stats: { id: page.id, regions: regions.length, colors: keys.length, labelsKB: labelsPng.length / 1024, linesKB: linesPng.length / 1024, perColor: keys.map(k => k + ':' + regions.filter(g => g.key === k).length).join(' ') }
  };
}

const results = [];
for (const page of PAGES) { const r = await convert(page); results.push(r); }
// difficulty by region count
const sorted = results.slice().sort((p, q2) => p.stats.regions - q2.stats.regions);
sorted.forEach((r, i) => { r.out.level = i < 2 ? 'Easy' : i < 4 ? 'Medium' : 'Hard'; });
for (const r of sorted) console.log(`${r.out.level.padEnd(6)} ${r.stats.id.padEnd(34)} regions ${String(r.stats.regions).padStart(4)}  colors ${r.stats.colors}  labels ${r.stats.labelsKB.toFixed(0)}KB  lines ${r.stats.linesKB.toFixed(0)}KB\n         ${r.stats.perColor}`);

const data = 'const PBN_PAGES = ' + JSON.stringify(sorted.map(r => r.out)) + ';';
let html = fs.readFileSync(HTML, 'utf8');
const A = '/*PBN-DATA-START*/', B = '/*PBN-DATA-END*/';
const ia = html.indexOf(A), ib = html.indexOf(B);
if (ia < 0 || ib < 0) { console.log('(markers not found in index.html, data not embedded)'); }
else { html = html.slice(0, ia + A.length) + '\n' + data + '\n' + html.slice(ib); fs.writeFileSync(HTML, html); console.log('embedded ' + (data.length / 1024).toFixed(0) + 'KB into index.html (now ' + (html.length / 1024).toFixed(0) + 'KB)'); }
