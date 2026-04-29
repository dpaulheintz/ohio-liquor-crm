import { getAllOrganizations } from '@/app/actions/super-admin';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Plus, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { OrgToggleButton } from './org-toggle-button';

export default async function OrganizationsPage() {
  const orgs = await getAllOrganizations();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Organizations</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {orgs.length} organization{orgs.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <Link href="/super-admin/organizations/new">
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            New Organization
          </Button>
        </Link>
      </div>

      {orgs.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Building2 className="mx-auto mb-3 h-10 w-10" />
          <p>No organizations yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orgs.map((org) => (
            <Card key={org.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <Link
                  href={`/super-admin/organizations/${org.id}`}
                  className="flex-1 min-w-0 hover:underline"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{org.name}</p>
                    <Badge
                      variant={org.is_active ? 'default' : 'secondary'}
                      className="text-xs shrink-0"
                    >
                      {org.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">/{org.slug}</p>
                </Link>

                <div className="flex items-center gap-2 shrink-0">
                  <OrgToggleButton orgId={org.id} isActive={org.is_active} orgName={org.name} />
                  <Link href={`/super-admin/organizations/${org.id}`}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
