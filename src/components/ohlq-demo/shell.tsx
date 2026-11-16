'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  ArrowLeftRight, Briefcase, CalendarDays, ChevronDown, ChevronUp, ClipboardCheck, FileText, Gauge, Hourglass, List, Martini,
  Menu, Receipt, RotateCcw, Settings2, ShoppingCart, Truck, UserRound, Wine, X, Zap, type LucideIcon,
} from 'lucide-react';
import { DEMO_BASE, PARTNER } from '@/lib/ohlq-demo/shared';
import { resetDemoAction } from '@/app/demo/ohlq/actions';

interface NavItem { href: string; label: string; icon: LucideIcon; isNew?: boolean; badge?: number }

const SUPPLIER_NAV: NavItem[] = [
  { href: `${DEMO_BASE}/partner/partner-info`, label: 'Partner Info', icon: Briefcase },
  { href: `${DEMO_BASE}/brand-master`, label: 'Brand Master', icon: List },
  { href: `${DEMO_BASE}/partner/coverage-requests`, label: 'Coverage Requests', icon: Settings2 },
  { href: `${DEMO_BASE}/partner/distribution-center`, label: 'Distribution Center', icon: Truck },
  { href: `${DEMO_BASE}/partner/price-calculator`, label: 'Price Calculator', icon: Hourglass },
  { href: `${DEMO_BASE}/partner/products`, label: 'Products', icon: Martini },
  { href: `${DEMO_BASE}/partner/product-actions`, label: 'Product Actions', icon: Hourglass },
  { href: `${DEMO_BASE}/partner/product-transfers`, label: 'Product Transfers', icon: ArrowLeftRight },
  { href: `${DEMO_BASE}/partner/purchase-requisitions`, label: 'Purchase Requisitions', icon: ShoppingCart },
  { href: `${DEMO_BASE}/partner/push-management`, label: 'Push Management', icon: Zap },
];
const REPORTS: NavItem[] = [
  { href: `${DEMO_BASE}/partner/agency-list`, label: 'Agency List', icon: FileText },
  { href: `${DEMO_BASE}/partner/data-downloads`, label: 'Data Downloads', icon: FileText },
  { href: `${DEMO_BASE}/partner/dc-aged-inventory`, label: 'DC Aged Inventory', icon: FileText },
];
const NEW_SUPPLIER: NavItem[] = [
  { href: `${DEMO_BASE}/wholesale`, label: 'Direct Wholesale Sales', icon: Receipt, isNew: true },
  { href: `${DEMO_BASE}/tastings`, label: 'Tasting Applications', icon: Wine, isNew: true },
];

export function PortalShell({ children, opsCounts }: { children: ReactNode; opsCounts: { wholesale: number; tastings: number } }) {
  const pathname = usePathname();
  const isOps = pathname.startsWith(`${DEMO_BASE}/ops`);
  // The mobile menu belongs to the page it was opened on, so navigating closes it.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuOpen = menuFor === pathname;
  const setMenuOpen = (open: boolean) => setMenuFor(open ? pathname : null);
  const [reportsOpen, setReportsOpen] = useState(false);

  const OPS_NAV: NavItem[] = [
    { href: `${DEMO_BASE}/ops`, label: 'Ops Dashboard', icon: Gauge },
    { href: `${DEMO_BASE}/ops/wholesale`, label: 'Direct Wholesale Sales', icon: ClipboardCheck, badge: opsCounts.wholesale },
    { href: `${DEMO_BASE}/ops/tastings`, label: 'Tasting Applications', icon: Wine, badge: opsCounts.tastings },
    { href: `${DEMO_BASE}/ops/calendar`, label: 'Statewide Tasting Calendar', icon: CalendarDays },
  ];

  const isActive = (href: string) =>
    href === `${DEMO_BASE}/ops` ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const link = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Link key={item.href} href={item.href} className={isActive(item.href) ? 'active' : undefined} aria-current={isActive(item.href) ? 'page' : undefined}>
        <Icon aria-hidden />
        <span>{item.label}</span>
        {item.isNew && <span className="ohlq-new">New</span>}
        {!!item.badge && <span className="ohlq-new" style={{ background: '#fff', color: 'var(--ohlq-red)' }}>{item.badge}</span>}
      </Link>
    );
  };

  const sidebar = (
    <nav className="ohlq-sidebar ohlq-nav" aria-label={isOps ? 'Agency Operations' : 'Partner portal'}>
      <div className="ohlq-side-user">
        <UserRound aria-hidden style={{ width: 24, height: 24, flexShrink: 0 }} />
        <span>{isOps ? 'agency.operations (demo)' : PARTNER.user}</span>
      </div>
      {isOps ? (
        <>
          <div className="ohlq-side-partner"><span>Agency Operations</span></div>
          {OPS_NAV.map(link)}
          <ResetDemo />
        </>
      ) : (
        <>
          <div className="ohlq-side-partner"><span>{PARTNER.name}</span></div>
          {SUPPLIER_NAV.map(link)}
          <button type="button" className="ohlq-nav-item" aria-expanded={reportsOpen} onClick={() => setReportsOpen((o) => !o)}>
            <FileText aria-hidden /><span>Reports</span>{reportsOpen ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </button>
          {reportsOpen && <div className="ohlq-sub">{REPORTS.map(link)}</div>}
          <div className="ohlq-nav-heading">New in this concept</div>
          {NEW_SUPPLIER.map(link)}
        </>
      )}
    </nav>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100dvh - 26px)' }}>
      <header className="ohlq-header">
        <button type="button" className="md:hidden" onClick={() => setMenuOpen(true)} aria-label="Open menu"
          style={{ background: 'none', border: 0, padding: 8, marginLeft: -8, color: '#333' }}>
          <Menu style={{ width: 26, height: 26 }} />
        </button>
        <Link href={isOps ? `${DEMO_BASE}/ops` : `${DEMO_BASE}/wholesale`} aria-label="OHLQ Ohio Liquor (concept demo home)">
          <Image src="/demo/ohlq/ohlq-logo.png" alt="OHLQ Ohio Liquor" width={142} height={57} priority style={{ height: 52, width: 'auto' }} />
        </Link>
        <div className="ohlq-header-nav" aria-hidden>
          <span>Resources ▾</span><span>Contact</span><span>My Account</span><span>Log Off</span>
        </div>
      </header>

      <div className="ohlq-switch" style={{ padding: '8px 14px', background: '#fff', borderBottom: '1px solid #e6e6e6' }}>
        <span>Viewing as:</span>
        <span className="ohlq-switch-group" role="group" aria-label="Switch view">
          <Link href={`${DEMO_BASE}/wholesale`} className={!isOps ? 'on' : undefined} aria-pressed={!isOps}>High Bank Distillery (Supplier)</Link>
          <Link href={`${DEMO_BASE}/ops`} className={isOps ? 'on' : undefined} aria-pressed={isOps}>OHLQ Agency Operations</Link>
        </span>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div className="hidden md:block" style={{ background: 'var(--ohlq-charcoal)' }}>{sidebar}</div>
        {menuOpen && (
          <div className="md:hidden" style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex' }}>
            <div style={{ position: 'relative', overflowY: 'auto', background: 'var(--ohlq-charcoal)', maxWidth: '86vw' }}>
              <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu"
                style={{ position: 'absolute', right: 8, top: 10, background: 'none', border: 0, color: '#fff', zIndex: 1 }}>
                <X style={{ width: 24, height: 24 }} />
              </button>
              {sidebar}
            </div>
            <div style={{ flex: 1, background: 'rgba(0,0,0,.45)' }} onClick={() => setMenuOpen(false)} />
          </div>
        )}
        <main style={{ flex: 1, minWidth: 0, padding: '0 16px 32px' }}>
          <div style={{ maxWidth: 1180, margin: '0 auto' }}>{children}</div>
        </main>
      </div>

      <footer className="ohlq-footer">
        <div style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div>
            <h4>About this demo</h4>
            <p style={{ margin: 0 }}>A concept prepared by High Bank Distillery showing how the A-3a direct wholesale sale form and the
              LIQ-19-0004 tasting application could be filed, signed and reviewed inside the OHLQ partner portal. Not an official OHLQ system. All data is sample data.</p>
          </div>
          <div>
            <h4>Contact</h4>
            <p style={{ margin: 0 }}>Paul Heintzman · High Bank Distillery<br />{PARTNER.email}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ResetDemo() {
  const [state, setState] = useState<'idle' | 'confirm' | 'working' | 'done'>('idle');
  const [msg, setMsg] = useState('');
  return (
    <div style={{ padding: '18px 16px 0' }}>
      {state === 'confirm' ? (
        <div style={{ font: '14px var(--ohlq-serif)', color: '#eee' }}>
          Restore all demo data to the starting sample set?
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" className="ohlq-btn ohlq-btn-sm" onClick={async () => {
              setState('working');
              const r = await resetDemoAction();
              setMsg(r.ok ? r.summary : r.error);
              setState('done');
            }}>Reset</button>
            <button type="button" className="ohlq-btn ohlq-btn-sm ohlq-btn-dark" style={{ border: '1px solid #777' }} onClick={() => setState('idle')}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="ohlq-btn ohlq-btn-sm ohlq-btn-dark" style={{ border: '1px solid #6d6862', width: '100%' }}
          disabled={state === 'working'} onClick={() => setState('confirm')}>
          <RotateCcw aria-hidden /> {state === 'working' ? 'Resetting…' : 'Reset demo'}
        </button>
      )}
      {state === 'done' && <p style={{ font: '13px var(--ohlq-serif)', color: '#d7f5de', marginTop: 8 }}>{msg}</p>}
    </div>
  );
}
