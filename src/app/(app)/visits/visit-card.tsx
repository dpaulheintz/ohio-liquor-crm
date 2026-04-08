'use client';

import { VisitLog, Profile, Account, VisitPhoto } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { formatEST } from '@/lib/date-utils';
import Link from 'next/link';

interface VisitCardProps {
  visit: VisitLog;
  showAccount?: boolean;
  onClick?: () => void;
}

export function VisitCard({ visit, showAccount = true, onClick }: VisitCardProps) {
  const rep = visit.rep;
  const account = visit.account;
  const photos = visit.visit_photos ?? [];

  const initials = rep?.full_name
    ? rep.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : '?';

  return (
    <Card
      className={onClick ? 'cursor-pointer transition-colors hover:bg-muted/50' : ''}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-2">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <span className="text-sm font-medium">
                  {rep?.full_name || rep?.email || 'Unknown'}
                </span>
                {showAccount && account && (
                  <>
                    <span className="text-sm text-muted-foreground"> visited </span>
                    <Link
                      href={`/accounts/${account.id}`}
                      className="text-sm font-medium text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {account.display_name}
                    </Link>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {visit.kpi && (
                  <Badge variant="outline" className="text-xs">
                    {visit.kpi}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground" title={formatEST(visit.visited_at, { dateStyle: 'medium', timeStyle: 'short' }) + ' EST'}>
                  {formatDistanceToNow(new Date(visit.visited_at), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </div>

            {/* Notes */}
            {visit.notes && (
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {visit.notes}
              </p>
            )}

            {/* Photos */}
            {photos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((photo) => (
                    <div key={photo.id} className="shrink-0">
                      <img
                        src={photo.photo_url}
                        alt={photo.caption || 'Visit photo'}
                        className="h-24 w-24 rounded-md object-cover"
                      />
                      {photo.caption && (
                        <p className="mt-1 text-xs text-muted-foreground max-w-24 truncate">
                          {photo.caption}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
