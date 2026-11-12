// Barrel Arcade initials blocklist: 3-letter combos kids can't put on a leaderboard (profanity, slurs,
// sexual, hate, violence and drug terms). Add to this list freely: it is checked on the server for every
// submit and sent to the page for instant feedback. Admins can also block initials from the CRM (Arcade
// Leaderboards); those live in arcade_blocked_initials and are merged with this list.
//
// Initials can only be A-Z (enforced separately), so number look-alikes like A55 can't get through.

export const BLOCKED_INITIALS: readonly string[] = [
  // profanity
  'ASS', 'AZZ', 'ASZ', 'ARS', 'BCH', 'BTC', 'CNT', 'CUN', 'DIK', 'DIC', 'DIX', 'DKS', 'DMN', 'FCK', 'FCU',
  'FKU', 'FKN', 'FUC', 'FUK', 'FUQ', 'FUX', 'FAK', 'FML', 'GTF', 'MFK', 'MFR', 'PIS', 'POS', 'SHT', 'SOB',
  'STF', 'SUC', 'SUK', 'SUX', 'TWT', 'WTF',
  // sexual
  'ANL', 'BJS', 'COC', 'COK', 'CUM', 'FAP', 'HOE', 'JIZ', 'JZZ', 'KOK', 'KUM', 'NUD', 'PNS', 'PRN', 'PUS',
  'RAP', 'RPE', 'SEX', 'SLT', 'STD', 'SXX', 'SXY', 'TIT', 'TTS', 'VAG', 'WHR', 'XXX',
  // hate and slurs
  'CNK', 'FAG', 'FGT', 'HTL', 'JAP', 'KKK', 'KYK', 'NAZ', 'NGA', 'NGG', 'NGR', 'NIG', 'NZI', 'RTD', 'SPC',
  'SPK', 'WOP', 'WPW',
  // violence and self-harm
  'DIE', 'KIL', 'KYS',
  // drugs
  'LSD', 'MTH', 'PCP', 'THC',
];

const BUILT_IN = new Set(BLOCKED_INITIALS);

export function isBlockedInitials(initials: string, extra?: Iterable<string>): boolean {
  if (BUILT_IN.has(initials)) return true;
  if (extra) for (const e of extra) if (e === initials) return true;
  return false;
}
