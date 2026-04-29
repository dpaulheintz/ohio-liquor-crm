'use client';

import { useState } from 'react';
import { getAllOrganizations } from '@/app/actions/super-admin';
import { seedAgenciesForOrg } from '@/app/actions/seed-agencies';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Layers, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect } from 'react';

type Org = { id: string; name: string; slug: string; is_active: boolean };
type SeedResult = { accountsCreated: number; accountsUpdated: number; contactsCreated: number; skipped: number };

export default function SeedAgenciesPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, SeedResult>>({});

  useEffect(() => {
    getAllOrganizations()
      .then((data) => setOrgs(data as Org[]))
      .catch(() => toast.error('Failed to load organizations'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSeed(orgId: string, orgName: string) {
    setSeeding(orgId);
    try {
      const result = await seedAgenciesForOrg(orgId);
      setResults((prev) => ({ ...prev, [orgId]: result }));
      toast.success(
        `${orgName}: ${result.accountsCreated} created, ${result.accountsUpdated} updated, ${result.contactsCreated} contacts`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Seed failed for ${orgName}`);
    } finally {
      setSeeding(null);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Seed Agencies</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Load the partner agency list from the CSV into a specific organization.
          Existing agencies are updated; new ones are created. Safe to run multiple times.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading organizations…</p>
      ) : orgs.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Layers className="mx-auto mb-3 h-10 w-10" />
          <p>No organizations yet. Create one first.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orgs.map((org) => {
            const result = results[org.id];
            const isRunning = seeding === org.id;
            return (
              <Card key={org.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{org.name}</p>
                      <Badge variant={org.is_active ? 'default' : 'secondary'} className="text-xs shrink-0">
                        {org.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {result && (
                      <div className="flex items-center gap-1.5 mt-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle className="h-3 w-3" />
                        <span>
                          {result.accountsCreated} created · {result.accountsUpdated} updated · {result.contactsCreated} contacts
                          {result.skipped > 0 && ` · ${result.skipped} skipped`}
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={result ? 'outline' : 'default'}
                    onClick={() => handleSeed(org.id, org.name)}
                    disabled={!!seeding}
                  >
                    {isRunning ? 'Seeding…' : result ? 'Re-seed' : 'Seed Now'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
        <CardContent className="p-4 flex gap-3">
          <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">What this does</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300">
              Reads <code className="font-mono text-xs">/data/seed-agencies.csv</code> and upserts
              ~481 Ohio agency accounts + their primary contacts into the selected org. Visits,
              assignments, and notes are never touched.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
