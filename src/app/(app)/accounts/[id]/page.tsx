import { getAccount } from '@/app/actions/accounts';
import { AccountDetailClient } from './account-detail-client';

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await getAccount(id);

  return <AccountDetailClient account={account} />;
}
