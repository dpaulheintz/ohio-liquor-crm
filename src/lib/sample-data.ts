// ─── Spirit products ──────────────────────────────────────────────────────────

export const SPIRIT_PRODUCTS = [
  'Whiskey War',
  'Whiskey War Barrel Proof',
  'Statehouse Gin',
  'High Bank Vodka',
  '614 Vodka',
  'Old Fashioned',
  'Midnight Manhattan',
] as const;

export const SPIRIT_CATEGORIES = [
  'Events',
  'Prospecting Accounts',
  'Spirit Sends',
  'Charity',
  'Other',
] as const;

// ─── Swag data ────────────────────────────────────────────────────────────────

export const SWAG_CATEGORIES = [
  'Employee Personal',
  'Wholesale Account Samples',
  'Prospect Samples',
  'Marketing Giveaways',
  'Other',
] as const;

export type SwagSizeType = 'apparel' | 'jersey' | 'one-size';

export interface SwagCategoryDef {
  name: string;
  sizeType: SwagSizeType;
  items: string[];
}

export const SWAG_ITEM_CATEGORIES: SwagCategoryDef[] = [
  {
    name: 'Crewnecks',
    sizeType: 'apparel',
    items: [
      'Crewneck - DSP Logo - Green - White Logo',
      'Crewneck - MWNW - Light Blue/Grey - White Logo',
      'Crewneck - MWNW - Green - White Logo',
      'Crewneck - Script Logo - Dark Grey - White Logo',
      'Crewneck - Circle High Bank Co Logo - Black - White Logo',
      'Crewneck - MWNW - Military Green - Green Logo',
      'Crewneck - HBD Script Logo - Deep Blue Steel',
    ],
  },
  {
    name: 'T-Shirts',
    sizeType: 'apparel',
    items: [
      'T-Shirt - Cardinal MWNW - Cardinal - White Logo',
      'T-Shirt - Black MWNW - Black - White Logo',
      'T-Shirt - Grey MWNW - Grey - White Logo',
      'T-Shirt - Pride - Black - Multi Colored Logo',
      'T-Shirt - 614 Vodka - Baby Blue - White Logo',
      'T-Shirt - Bourbon - Red - White Logo',
      'T-Shirt - Crew - Black - Yellow Logo',
      'T-Shirt - All Is Fair In Love And Whiskey - Blue - White Logo',
    ],
  },
  {
    name: 'Hoodies / Zip Ups',
    sizeType: 'apparel',
    items: [
      'Hoodie - DSP Logo - Light Grey - White Logo',
      'Zip Up - Round Logo Front / Story On Back - Light Green - White Logo',
      'Hoodie - MWNW - Heathered Navy - Grey Logo',
      'Hoodie - HBD Inside State Logo - Heathered Steel - Red Logo',
      'Zip Up - Cross Pistol Inside State Logo - Heathered Steel',
    ],
  },
  {
    name: 'Long Sleeves',
    sizeType: 'apparel',
    items: [
      'Long Sleeve - Circle Logo - Maroon - White Logo',
      'Long Sleeve - Circle Logo - Charcoal - White Logo',
      'Long Sleeve - DSP Logo - Black - White Logo',
    ],
  },
  {
    name: 'Golf Polos',
    sizeType: 'apparel',
    items: [
      'Golf Polo - Nike - Teal - White Logo',
      'Golf Polo - Nike - Grey - White Logo',
      'Golf Polo - Nike - Black - White Logo',
      'Golf Polo - Adidas - Red - White Logo',
      'Golf Polo - Adidas - Orange - White Logo',
      'Golf Polo - Adidas - Green - White Logo',
    ],
  },
  {
    name: 'Hats & Beanies',
    sizeType: 'one-size',
    items: [
      'Snapback Hat - Black - Grey MWNW Logo',
      'Snapback Hat - Black - Red Bourbon Logo',
      'Beanie - Tan',
      'Beanie - Mustard',
      'Beanie - Grey',
    ],
  },
  {
    name: 'Jerseys',
    sizeType: 'jersey',
    items: [
      'Hockey Jersey - 2025 - Blue',
      'Hockey Jersey - 2024 - Black/Green',
      'Hockey Jersey - 2023 - Black/White',
    ],
  },
  {
    name: 'Drinkware',
    sizeType: 'one-size',
    items: [
      'Coffee Mug - Black - White Logo',
      'Rocks Glass - Any Logo - Clear - Black Logo',
      'Rocks Glass Etched Fancy Bottom - Clear - White Logo',
      'Mini Glencairn - Clear - White Logo',
      'Collins Glass - Clear - Black Logo',
    ],
  },
  {
    name: 'Misc',
    sizeType: 'one-size',
    items: [
      'Bar Mat - Large',
      'Bar Mat - Small',
    ],
  },
];

export function getSizesForType(sizeType: SwagSizeType): string[] {
  switch (sizeType) {
    case 'apparel': return ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    case 'jersey':  return ['S', 'M', 'L', 'XL', 'XXL'];
    case 'one-size': return ['One Size'];
  }
}
