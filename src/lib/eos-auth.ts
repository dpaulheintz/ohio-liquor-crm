const EOS_ADMINS = [
  'pheintzman@highbankco.com',
  'ahines@highbankco.com',
];

export function isEosAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  return EOS_ADMINS.includes(email.toLowerCase());
}
