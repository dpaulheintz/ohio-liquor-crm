import { getAllUsers } from '@/app/actions/super-admin';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Users } from 'lucide-react';
import Link from 'next/link';

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_approved: boolean;
  is_super_admin: boolean;
  organization_id: string | null;
  created_at: string;
  organizations: { name: string; slug: string } | null;
};

export default async function AllUsersPage() {
  const raw = await getAllUsers();
  const users = raw as unknown as UserRow[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">All Users</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {users.length} user{users.length !== 1 ? 's' : ''} across all organizations
        </p>
      </div>

      {users.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Users className="mx-auto mb-3 h-10 w-10" />
          <p>No users yet</p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {users.map((user) => {
            const initials = (user.full_name || user.email)?.[0]?.toUpperCase() ?? '?';
            const org = user.organizations as { name: string; slug: string } | null;

            return (
              <div key={user.id} className="flex items-center gap-3 p-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {user.full_name || user.email}
                    </p>
                    {user.is_super_admin && (
                      <Badge className="text-xs bg-amber-500 text-black hover:bg-amber-500">
                        super admin
                      </Badge>
                    )}
                    {!user.is_approved && (
                      <Badge variant="destructive" className="text-xs">pending</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {user.full_name && <span className="truncate">{user.email}</span>}
                    {org && (
                      <>
                        <span>·</span>
                        <Link
                          href={`/super-admin/organizations/${user.organization_id}`}
                          className="hover:underline text-primary"
                        >
                          {org.name}
                        </Link>
                      </>
                    )}
                    {!org && <span className="italic">No org</span>}
                  </div>
                </div>

                <Badge
                  variant={user.role === 'admin' ? 'default' : user.role === 'rep' ? 'secondary' : 'outline'}
                  className="text-xs shrink-0"
                >
                  {user.role}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
