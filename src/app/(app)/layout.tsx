import { Sidebar } from '@/components/sidebar';
import { BottomNav } from '@/components/bottom-nav';
import { TopBar } from '@/components/top-bar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
