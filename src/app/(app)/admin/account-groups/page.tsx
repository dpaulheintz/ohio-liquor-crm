import { getAccountGroups, type AccountGroup } from '@/app/actions/account-groups';
import { AccountGroupsClient } from './account-groups-client';

export const metadata = { title: 'Account Groups' };

export default async function AccountGroupsPage() {
  let groups: AccountGroup[];
  try {
    groups = await getAccountGroups();
  } catch {
    groups = [];
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-1">
      <h1 className="text-xl font-semibold">Account Groups</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Group wholesale accounts by name pattern for chart segmentation.
        Terms are matched case-insensitively anywhere in the field value.
      </p>
      <AccountGroupsClient initialGroups={groups} />
    </div>
  );
}
