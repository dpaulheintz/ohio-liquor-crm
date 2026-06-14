export const EOS_ADMINS = [
  'pheintzman@highbankco.com',
  'ahines@highbankco.com',
];

export const EOS_USERS = [
  'jfisher@highbankco.com',
  'jireland@highbankco.com',
  'msmith@highbankco.com',
  'ccarter@highbankco.com',
];

export const ALL_EOS_EMAILS = [...EOS_ADMINS, ...EOS_USERS];

export function isEosAdmin(email: string | undefined | null): boolean {
  if (!email) return false;
  return EOS_ADMINS.includes(email.toLowerCase());
}

export function isEosUser(email: string | undefined | null): boolean {
  if (!email) return false;
  return ALL_EOS_EMAILS.includes(email.toLowerCase());
}

export function isEosOnly(email: string | undefined | null): boolean {
  if (!email) return false;
  return EOS_USERS.includes(email.toLowerCase());
}
