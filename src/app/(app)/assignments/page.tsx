'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getMyAssignments, completeAssignment } from '@/app/actions/assignments';
import { Assignment } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Clock, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { formatVisitDate } from '@/lib/date-utils';

export default function MyAssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyAssignments();
      setAssignments(data as unknown as Assignment[]);
    } catch (err) {
      console.error('Failed to load assignments:', err);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  async function handleComplete(id: string) {
    try {
      await completeAssignment(id);
      toast.success('Marked as complete');
      fetchAssignments();
    } catch (err) {
      toast.error('Failed to update assignment');
      console.error(err);
    }
  }

  const pending = assignments.filter((a) => a.status === 'pending');
  const completed = assignments.filter((a) => a.status === 'completed');

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold">My Assignments</h1>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6" /> My Assignments
        </h1>
        {pending.length > 0 ? (
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending.length} pending · logging a visit auto-completes an assignment
          </p>
        ) : (
          <p className="text-sm text-muted-foreground mt-0.5">
            Nothing pending — you&apos;re all caught up!
          </p>
        )}
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No assignments yet. Check back later.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Pending */}
          {pending.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Pending ({pending.length})
              </h2>
              <div className="space-y-2">
                {pending.map((a) => (
                  <RepAssignmentCard key={a.id} assignment={a} onComplete={handleComplete} />
                ))}
              </div>
            </section>
          )}

          {/* Completed */}
          {completed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Completed ({completed.length})
              </h2>
              <div className="space-y-2 opacity-60">
                {completed.map((a) => (
                  <RepAssignmentCard key={a.id} assignment={a} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function RepAssignmentCard({
  assignment: a,
  onComplete,
}: {
  assignment: Assignment;
  onComplete?: (id: string) => void;
}) {
  const isDone = a.status === 'completed';
  const account = a.account as { id: string; display_name: string; city?: string | null } | undefined;
  const assigner = a.assigner as { full_name: string | null; email: string } | undefined;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {account ? (
                <Link
                  href={`/accounts/${account.id}`}
                  className="font-semibold text-sm hover:underline text-primary"
                >
                  {account.display_name}
                </Link>
              ) : (
                <span className="font-semibold text-sm">Unknown account</span>
              )}
              {account?.city && (
                <span className="text-xs text-muted-foreground">{account.city}</span>
              )}
              {isDone && (
                <Badge variant="secondary" className="text-[10px]">Completed</Badge>
              )}
            </div>

            {assigner && (
              <p className="text-xs text-muted-foreground mt-0.5">
                From {assigner.full_name || assigner.email}
              </p>
            )}

            {a.notes && (
              <p className="text-xs text-muted-foreground mt-1 italic border-l-2 pl-2">
                {a.notes}
              </p>
            )}

            <p className="text-[10px] text-muted-foreground mt-1">
              {isDone && a.completed_at
                ? `Completed ${formatVisitDate(a.completed_at)}`
                : `Assigned ${formatVisitDate(a.created_at)}`}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {account && (
              <Button size="sm" variant="outline" className="h-7 text-xs" asChild>
                <Link href={`/visits/new?account=${account.id}`}>
                  Log Visit
                </Link>
              </Button>
            )}
            {!isDone && onComplete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={() => onComplete(a.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Done
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
