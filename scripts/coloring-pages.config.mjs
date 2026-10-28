// Paint-by-number setup for each coloring page, used by scripts/build-coloring-pages.mjs.
// Rules are tested at each region's label point, in order; the first match picks the color.
//   rect [u0,v0,u1,v1] / ell [cu,cv,ru,rv] / poly [[u,v],...] use 0..1 page coordinates
//   rMin/rMax = inscribed radius (half-res px), aMin/aMax = share of page area, elMin/elMax = elongation
//   (area / inscribed circle; ~1 round, big = long and thin). c = palette key, or a list to vary by region.
// Palette order = the numbers kids see (1, 2, 3...).
export const PAGES = [
  {
    id: 'oak-barrel', name: 'Oak Barrel', file: 'whimsical-oak-barrel.png', lineScale: 0.5,
    palette: {
      sky: { hex: '#8fcdf0', name: 'Sky blue' }, cloud: { hex: '#fdfaf2', name: 'Cloud white' },
      hill: { hex: '#b9de7c', name: 'Hill green' }, bush: { hex: '#5fae4e', name: 'Bush green' },
      barn: { hex: '#c9503f', name: 'Barn red' }, wood: { hex: '#8e5e35', name: 'Dark wood' },
      barrel: { hex: '#bb7c43', name: 'Barrel brown' }, head: { hex: '#e2ad68', name: 'Honey' },
      iron: { hex: '#8f969e', name: 'Hoop gray' }, leaf: { hex: '#7cbc45', name: 'Leaf green' },
      acorn: { hex: '#c98a3a', name: 'Acorn' }, floor: { hex: '#e7c995', name: 'Floor tan' }
    },
    rules: [
      { ell: [0.5, 0.245, 0.045, 0.022], c: 'head' },
      { rect: [0.1, 0.71, 0.21, 0.83], c: 'wood' },
      { poly: [[0.54, 0.77], [0.66, 0.745], [0.9, 0.8], [0.88, 0.87], [0.63, 0.93], [0.54, 0.86]], rMin: 4, c: 'wood' },
      { ell: [0.795, 0.555, 0.15, 0.255], rMin: 7, c: 'head' },
      { poly: [[0.04, 0.6], [0.1, 0.42], [0.3, 0.29], [0.6, 0.26], [0.78, 0.3], [0.93, 0.45], [0.96, 0.62], [0.9, 0.8], [0.72, 0.86], [0.45, 0.83], [0.15, 0.78], [0.05, 0.7]], rMax: 6.5, c: 'iron' },
      { poly: [[0.04, 0.6], [0.1, 0.42], [0.3, 0.29], [0.6, 0.26], [0.78, 0.3], [0.93, 0.45], [0.96, 0.62], [0.9, 0.8], [0.72, 0.86], [0.45, 0.83], [0.15, 0.78], [0.05, 0.7]], c: 'barrel' },
      { ell: [0.205, 0.87, 0.085, 0.06], c: 'acorn' }, { ell: [0.855, 0.89, 0.09, 0.05], c: 'acorn' },
      { ell: [0.15, 0.85, 0.17, 0.12], c: 'leaf' }, { ell: [0.34, 0.85, 0.08, 0.06], c: 'leaf' }, { ell: [0.85, 0.88, 0.19, 0.1], c: 'leaf' },
      { rect: [0.47, 0, 1, 0.2], aMin: 0.01, c: 'sky' },
      { rect: [0.28, 0, 0.6, 0.13], c: 'wood' },
      { rect: [0.39, 0, 0.48, 0.47], c: 'wood' },
      { rect: [0.86, 0.12, 1, 0.31], c: 'bush' },
      { rect: [0.5, 0.15, 1, 0.24], c: 'hill' },
      { rect: [0.33, 0.15, 1, 0.47], c: 'bush' },
      { rect: [0.28, 0, 0.6, 0.45], c: 'wood' },
      { rect: [0, 0, 0.42, 0.62], c: 'barn' },
      { rect: [0.88, 0.3, 1, 0.62], c: 'wood' },
    ],
    fallback: 'floor'
  },
  {
    id: 'meadow-dog', close: 3, minArea: 35, minR: 1.6, name: 'Whiskey in the Meadow', file: 'wellers-storybook-meadow.png', lineScale: 0.5,
    palette: {
      sky: { hex: '#9fd4f2', name: 'Sky blue' }, leaf: { hex: '#6cae45', name: 'Leaf green' },
      bush: { hex: '#3f8f4a', name: 'Bush green' }, hill: { hex: '#b7dd7e', name: 'Hill green' },
      grass: { hex: '#86c35a', name: 'Grass green' }, fur: { hex: '#e8b25a', name: 'Golden fur' },
      nose: { hex: '#4b3428', name: 'Nose brown' }, tongue: { hex: '#f08aa0', name: 'Tongue pink' },
      petal: { hex: '#fff7dc', name: 'Petal white' }, center: { hex: '#f6c632', name: 'Sunny yellow' }
    },
    rules: [
      { ell: [0.44, 0.272, 0.045, 0.03], c: 'tongue' },
      { ell: [0.452, 0.198, 0.035, 0.02], c: 'nose' },
      { poly: [[0.37, 0.06], [0.6, 0.06], [0.66, 0.16], [0.66, 0.3], [0.62, 0.42], [0.72, 0.53], [0.8, 0.62], [0.86, 0.72], [0.98, 0.78], [0.98, 0.94], [0.68, 0.96], [0.18, 0.94], [0.21, 0.8], [0.25, 0.6], [0.27, 0.45], [0.24, 0.3], [0.26, 0.17]], c: 'fur' },
      { ell: [0.105, 0.535, 0.03, 0.022], c: 'center' }, { ell: [0.165, 0.612, 0.03, 0.022], c: 'center' },
      { ell: [0.937, 0.568, 0.032, 0.025], c: 'center' }, { ell: [0.885, 0.64, 0.016, 0.012], c: 'center' },
      { ell: [0.11, 0.535, 0.09, 0.05], c: 'petal' }, { ell: [0.17, 0.615, 0.09, 0.05], c: 'petal' },
      { ell: [0.94, 0.575, 0.1, 0.05], c: 'petal' }, { ell: [0.885, 0.64, 0.045, 0.032], c: 'petal' },
      { ell: [0.11, 0.11, 0.18, 0.14], c: 'leaf' }, { ell: [0.88, 0.12, 0.2, 0.15], c: 'leaf' },
      { ell: [0.12, 0.92, 0.16, 0.12], c: 'leaf' }, { ell: [0.92, 0.95, 0.12, 0.08], c: 'leaf' },
      { rect: [0, 0, 1, 0.4], aMin: 0.008, c: 'sky' },
      { rect: [0, 0.25, 1, 0.47], aMax: 0.008, c: 'bush' },
      { rect: [0, 0.34, 1, 0.56], aMin: 0.002, c: 'hill' }
    ],
    fallback: 'grass'
  },
  {
    id: 'copper-stills', name: 'Copper Stills', file: 'storybook-copper-distillery-columns.png', lineScale: 0.5,
    palette: {
      copper: { hex: '#de8a4f', name: 'Copper' }, brass: { hex: '#b8742f', name: 'Pipe brown' },
      glass: { hex: '#a9dcef', name: 'Window blue' }, gauge: { hex: '#fbf5e6', name: 'Gauge white' },
      steel: { hex: '#8c939b', name: 'Steel gray' }, wall: { hex: '#f1e2c4', name: 'Wall cream' },
      beam: { hex: '#9a7552', name: 'Beam brown' }, floor: { hex: '#b9b2a6', name: 'Floor gray' }
    },
    rules: [
      { rect: [0, 0.92, 1, 1], c: 'floor' },
      { rect: [0.34, 0.2, 0.8, 0.86], rMin: 3, rMax: 13, aMax: 0.0015, elMax: 3, c: 'glass' },
      { rect: [0.02, 0.6, 0.32, 0.86], rMin: 6, c: 'copper' }, { rect: [0.09, 0.4, 0.21, 0.62], rMin: 5, c: 'copper' },
      { rect: [0.34, 0.36, 0.455, 0.86], rMin: 6, c: 'copper' }, { rect: [0.49, 0.15, 0.61, 0.89], rMin: 6, c: 'copper' },
      { rect: [0.67, 0.15, 0.79, 0.89], rMin: 6, c: 'copper' }, { rect: [0.82, 0.45, 0.9, 0.74], rMin: 6, c: 'copper' },
      { rect: [0.89, 0.55, 0.97, 0.84], rMin: 6, c: 'copper' },
      { elMax: 2.2, rMin: 3, rMax: 10, rect: [0.08, 0.3, 0.97, 0.85], c: 'gauge' },
      { rect: [0, 0.84, 1, 0.92], c: 'steel' },
      { aMin: 0.004, rMin: 9, c: 'wall' },
      { rect: [0, 0, 1, 0.3], elMin: 5, c: 'beam' },
      { elMin: 4, c: 'brass' }
    ],
    fallback: 'steel'
  },
  {
    id: 'old-fashioned', name: 'Fancy Drink', file: 'playful-old-fashioned-cocktail.png', lineScale: 0.5,
    palette: {
      sky: { hex: '#a5d6f0', name: 'Window blue' }, wood: { hex: '#9a6438', name: 'Wood brown' },
      amber: { hex: '#e39536', name: 'Amber' }, ice: { hex: '#d7eff8', name: 'Ice blue' },
      cherry: { hex: '#d23c3c', name: 'Cherry red' }, orange: { hex: '#f28a24', name: 'Orange' },
      pulp: { hex: '#ffc04d', name: 'Juicy yellow' }, leaf: { hex: '#5fae4e', name: 'Leaf green' },
      petal: { hex: '#fff6dc', name: 'Petal white' }, berry: { hex: '#6d7fd8', name: 'Berry blue' },
      cinnamon: { hex: '#a0522d', name: 'Cinnamon' }, marble: { hex: '#e0dbd3', name: 'Marble gray' }
    },
    rules: [
      { ell: [0.405, 0.305, 0.06, 0.04], rMin: 6, c: 'cherry' },
      { poly: [[0.42, 0.33], [0.75, 0.34], [0.78, 0.52], [0.74, 0.58], [0.6, 0.6], [0.4, 0.55], [0.39, 0.42]], rMin: 6, c: 'ice' },
      { rect: [0.31, 0.27, 0.9, 0.36], c: 'ice' },
      { rect: [0.3, 0.36, 0.9, 0.86], c: 'amber' },
      { rect: [0.25, 0.8, 0.58, 0.96], rMax: 18, elMax: 1.7, rMin: 4, c: 'berry' },
      { rect: [0.3, 0.84, 0.9, 0.95], aMax: 0.01, c: 'ice' },
      { poly: [[0.58, 0.2], [0.7, 0.18], [0.85, 0.22], [0.92, 0.3], [0.97, 0.45], [0.96, 0.55], [0.9, 0.56], [0.88, 0.42], [0.82, 0.32], [0.62, 0.27]], c: 'orange' },
      { ell: [0.155, 0.47, 0.11, 0.085], rMin: 3, aMax: 0.004, c: 'pulp' },
      { ell: [0.15, 0.47, 0.17, 0.13], c: 'orange' },
      { ell: [0.1, 0.605, 0.04, 0.025], c: 'pulp' }, { ell: [0.11, 0.84, 0.04, 0.025], c: 'pulp' },
      { ell: [0.32, 0.665, 0.03, 0.02], c: 'berry' }, { ell: [0.03, 0.7, 0.035, 0.03], c: 'berry' },
      { rect: [0.22, 0.64, 0.58, 0.96], rMax: 18, elMax: 1.7, rMin: 4, c: 'berry' },
      { ell: [0.12, 0.615, 0.09, 0.055], c: 'petal' }, { ell: [0.11, 0.845, 0.09, 0.055], c: 'petal' },
      { poly: [[0, 0.71], [0.12, 0.66], [0.45, 0.76], [0.44, 0.82], [0.1, 0.84], [0, 0.82]], c: 'cinnamon' },
      { rect: [0, 0.58, 0.33, 0.95], c: 'leaf' },
      { rect: [0, 0, 1, 0.4], aMin: 0.006, c: 'sky' },
      { rect: [0, 0, 1, 0.42], c: 'wood' },
      { rect: [0, 0.9, 1, 1], elMin: 4, c: 'wood' }
    ],
    fallback: 'marble'
  },
  {
    id: 'river-map', name: 'River Map', file: 'storybook-scioto-olentangy-river-map.png', lineScale: 0.5,
    palette: {
      water: { hex: '#6fbbe8', name: 'River blue' }, tree: { hex: '#4fa152', name: 'Tree green' },
      grass: { hex: '#b4dd7f', name: 'Grass green' }, road: { hex: '#ddd7cc', name: 'Road gray' },
      stone: { hex: '#b9bec7', name: 'Stone gray' }, brick: { hex: '#cf7552', name: 'Brick red' },
      roof: { hex: '#f0cf7a', name: 'Roof yellow' }, gold: { hex: '#f3c15a', name: 'Compass gold' }
    },
    rules: [
      { ell: [0.915, 0.085, 0.07, 0.055], c: 'gold' },
      { aMin: 0.012, poly: [[0.07, 0.12], [0.3, 0.1], [0.4, 0.28], [0.48, 0.38], [0.5, 0.0], [0.66, 0.0], [0.6, 0.3], [0.57, 0.42], [0.62, 0.48], [0.73, 0.6], [0.82, 0.68], [1, 0.68], [1, 0.87], [0.6, 0.86], [0.44, 0.76], [0.3, 0.62], [0.18, 0.46], [0.11, 0.3]], c: 'water' },
      { elMax: 3.2, aMax: 0.0012, c: 'tree' },
      { rect: [0.64, 0.1, 1, 0.56], elMax: 6, c: ['stone', 'brick', 'roof'] },
      { rect: [0.84, 0.6, 1, 0.68], elMax: 6, c: ['stone', 'brick', 'roof'] },
      { rect: [0.03, 0.55, 0.34, 0.72], elMax: 6, aMax: 0.012, c: ['stone', 'brick', 'roof'] },
      { rect: [0.02, 0.72, 0.21, 0.93], elMax: 6, aMax: 0.012, c: ['stone', 'brick', 'roof'] },
      { rect: [0.25, 0.83, 0.42, 0.97], elMax: 6, aMax: 0.012, c: ['stone', 'brick', 'roof'] },
      { rect: [0.34, 0.06, 0.48, 0.12], elMax: 6, c: ['stone', 'brick', 'roof'] },
      { elMin: 6, rMax: 8, c: 'road' }
    ],
    fallback: 'grass'
  }
];
