'use strict';

// CommonJS mirror of src/lib/brand-taxonomy.ts
// Keep in sync when adding new brand codes.

const BRAND_CODES = {
  // Vodka
  '6930B': { brand_family: 'Vodka', product_name: 'High Bank Vodka', size: '750ml' },
  '6930L': { brand_family: 'Vodka', product_name: 'High Bank Vodka', size: '1L' },
  '6930D': { brand_family: 'Vodka', product_name: 'High Bank Vodka', size: '1.75L' },
  '6930H': { brand_family: 'Vodka', product_name: 'High Bank Vodka', size: '200ml' },
  // (614) Vodka
  '4166B': { brand_family: '(614) Vodka', product_name: '(614) Vodka x High Bank', size: '750ml' },
  '4166L': { brand_family: '(614) Vodka', product_name: '(614) Vodka x High Bank', size: '1L' },
  // Gin
  '6929B': { brand_family: 'Gin', product_name: 'Statehouse Gin', size: '750ml' },
  '6929D': { brand_family: 'Gin', product_name: 'Statehouse Gin', size: '1.75L' },
  '6929H': { brand_family: 'Gin', product_name: 'Statehouse Gin', size: '200ml' },
  '6938B': { brand_family: 'Gin', product_name: 'Statehouse Gin Barrel Select', size: '750ml' },
  // Whiskey War
  '6928B': { brand_family: 'Whiskey War', product_name: 'Whiskey War', size: '750ml' },
  '6928L': { brand_family: 'Whiskey War', product_name: 'Whiskey War', size: '1L' },
  '6928D': { brand_family: 'Whiskey War', product_name: 'Whiskey War', size: '1.75L' },
  '6928H': { brand_family: 'Whiskey War', product_name: 'Whiskey War', size: '200ml' },
  '6931B': { brand_family: 'Whiskey War', product_name: 'Whiskey War Barrel Proof', size: '750ml' },
  '6931D': { brand_family: 'Whiskey War', product_name: 'Whiskey War Barrel Proof', size: '1.75L' },
  '6931H': { brand_family: 'Whiskey War', product_name: 'Whiskey War Barrel Proof', size: '200ml' },
  '6934B': { brand_family: 'Whiskey War', product_name: 'Whiskey War Barrel Select', size: '750ml' },
  '6935B': { brand_family: 'Whiskey War', product_name: 'Whiskey War Master Blend', size: '750ml' },
  '6933B': { brand_family: 'Whiskey War', product_name: 'Whiskey War Double Oaked', size: '750ml' },
  '6933D': { brand_family: 'Whiskey War', product_name: 'Whiskey War Double Oaked', size: '1.75L' },
  '6933H': { brand_family: 'Whiskey War', product_name: 'Whiskey War Double Oaked', size: '200ml' },
  '4280B': { brand_family: 'Whiskey War', product_name: 'Whiskey War Double Oaked Single Barrel', size: '750ml' },
  '4281B': { brand_family: 'Whiskey War', product_name: 'Whiskey War Double Double Oaked', size: '750ml' },
  '4286B': { brand_family: 'Whiskey War', product_name: 'Whiskey War Double Double Oaked Single Barrel', size: '750ml' },
  '6627B': { brand_family: 'Whiskey War', product_name: 'Whiskey War Cigar Cask', size: '750ml' },
  '6629B': { brand_family: 'Whiskey War', product_name: 'Whiskey War Cigar Cask Single Barrel', size: '750ml' },
  // Midnight
  '6619B': { brand_family: 'Midnight', product_name: 'Midnight Cask Barrel Proof', size: '750ml' },
  '6619H': { brand_family: 'Midnight', product_name: 'Midnight Cask Barrel Proof', size: '200ml' },
  '6583B': {
    brand_family: 'Midnight (Discontinued)',
    product_name: 'Midnight Cask (Discontinued)',
    size: '750ml',
    sub_product: 'Midnight Cask (Discontinued)',
  },
  // Bourbon
  '7000B': { brand_family: 'Bourbon', product_name: 'Barrel Proof Bourbon', size: '750ml' },
  '7010B': { brand_family: 'Bourbon', product_name: 'Small Batch Bourbon', size: '750ml' },
  // RTD
  '6624B': { brand_family: 'RTD', product_name: 'Midnight Manhattan', size: '750ml' },
  '6628B': { brand_family: 'RTD', product_name: 'Old Fashioned RTD', size: '750ml' },
};

const HB_AGENCIES = {
  '30174': { is_hb_agency: true, hb_location: 'Grandview' },
  '90394': { is_hb_agency: true, hb_location: 'Gahanna' },
  '90286': { is_hb_agency: true, hb_location: 'Westerville' },
};

const SIZE_MAP = { B: '750ml', L: '1L', D: '1.75L', H: '200ml' };

function resolveBrand(brandCode, rawProductName) {
  const known = BRAND_CODES[brandCode];
  if (known) {
    return {
      brand_code: brandCode,
      brand_family: known.brand_family,
      product_name: known.product_name,
      size: known.size,
      sub_product: known.sub_product || null,
    };
  }
  const lastChar = brandCode.slice(-1).toUpperCase();
  return {
    brand_code: brandCode,
    brand_family: 'Unknown',
    product_name: rawProductName || brandCode,
    size: SIZE_MAP[lastChar] || 'Unknown',
    sub_product: rawProductName || null,
  };
}

function resolveAgency(agencyId) {
  const hb = HB_AGENCIES[String(agencyId)];
  return hb || { is_hb_agency: false, hb_location: null };
}

function parseAmount(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseFloat(String(raw).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function parseBottles(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseInt(String(raw).replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
}

module.exports = { BRAND_CODES, HB_AGENCIES, SIZE_MAP, resolveBrand, resolveAgency, parseAmount, parseBottles };
