'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createOrganization } from '@/app/actions/super-admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Building2, User, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewOrganizationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '',
    slug: '',
    adminEmail: '',
    adminTempPassword: '',
    adminFullName: '',
  });

  function set(key: keyof typeof form, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      // Auto-generate slug from name
      if (key === 'name') {
        next.slug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      }
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.slug || !form.adminEmail || !form.adminTempPassword) {
      toast.error('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const result = await createOrganization(form);
      toast.success(`${form.name} created with first admin account`);
      router.push(`/super-admin/organizations/${result.org.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <Link
        href="/super-admin/organizations"
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Organizations
      </Link>

      <div>
        <h2 className="text-xl font-semibold">New Organization</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Creates the org and provisions the first admin account. The admin can then
          invite reps through the normal approval flow.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Organization details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Organization Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Acme Distillery"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="slug">
                Slug <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">/</span>
                <Input
                  id="slug"
                  placeholder="acme-distillery"
                  value={form.slug}
                  onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                URL-safe identifier, lowercase letters, numbers, and hyphens only
              </p>
            </div>
          </CardContent>
        </Card>

        <Separator />

        {/* First admin user */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4" />
              First Admin User
            </CardTitle>
            <CardDescription className="text-xs">
              This user gets admin access immediately. Share the temporary password
              securely — they should change it on first login.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="adminFullName">Full Name</Label>
              <Input
                id="adminFullName"
                placeholder="Jane Smith"
                value={form.adminFullName}
                onChange={(e) => set('adminFullName', e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adminEmail">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adminEmail"
                type="email"
                placeholder="jane@acmedistillery.com"
                value={form.adminEmail}
                onChange={(e) => set('adminEmail', e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adminTempPassword">
                Temporary Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="adminTempPassword"
                type="text"
                placeholder="At least 8 characters"
                value={form.adminTempPassword}
                onChange={(e) => set('adminTempPassword', e.target.value)}
                minLength={8}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Creating…' : 'Create Organization'}
        </Button>
      </form>
    </div>
  );
}
