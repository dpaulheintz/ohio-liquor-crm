import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { Globe, Building2, Users, Layers } from 'lucide-react';

export const dynamic = 'force-dynamic';

const saNav = [
  { href: '/super-admin/organizations', label: 'Organizations', icon: Building2 },
  { href: '/super-admin/agencies', label: 'Manage Agencies', icon: Layers },
  { href: '/super-admin/seed-agencies', label: 'Seed Agencies', icon: Layers },
  { href: '/super-admin/users', label: 'All Users', icon: Users },
];

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: flag } = await supabase.rpc('is_super_admin');

  if (flag !== true) {
    redirect('/');
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header + sub-nav */}
      <div className="flex items-center gap-2 border-b pb-4 flex-wrap gap-y-2">
        <Globe className="h-5 w-5 text-amber-500 shrink-0" />
        <span className="font-bold text-lg">Super Admin</span>
        <nav className="ml-4 flex items-center flex-wrap gap-1">
          {saNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </div>

      {children}
    </div>
  );
}
