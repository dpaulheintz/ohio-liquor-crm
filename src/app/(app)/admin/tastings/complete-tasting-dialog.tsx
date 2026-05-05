'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { completeTasting } from '@/app/actions/tastings';
import { createClient } from '@/lib/supabase/client';
import type { Tasting } from '@/lib/types';
import { Upload, FileText, ExternalLink } from 'lucide-react';

interface CompleteTastingDialogProps {
  tasting: Tasting | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CompleteTastingDialog({
  tasting,
  open,
  onOpenChange,
  onSuccess,
}: CompleteTastingDialogProps) {
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!tasting) return null;

  async function handleComplete() {
    if (!tasting) return;
    setUploading(true);

    try {
      let reportUrl: string | undefined;

      if (file) {
        const supabase = createClient();
        const ext = file.name.split('.').pop() ?? 'pdf';
        const path = `tastings/${tasting.id}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('visit-reports')
          .upload(path, file, { upsert: true });

        if (uploadError) {
          toast.warning(
            'Could not upload PDF — tasting will be marked complete without it'
          );
        } else {
          const { data: urlData } = supabase.storage
            .from('visit-reports')
            .getPublicUrl(path);
          reportUrl = urlData?.publicUrl;
        }
      }

      await completeTasting(tasting.id, {
        notes: notes || undefined,
        reportUrl,
      });

      toast.success('Tasting marked as complete');
      onSuccess();
      onOpenChange(false);
      setNotes('');
      setFile(null);
    } catch {
      toast.error('Failed to complete tasting');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Tasting</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">{tasting.agency?.display_name}</p>
            <p className="text-muted-foreground">
              {new Date(tasting.date + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
          </div>

          {/* Existing report link */}
          {tasting.report_url && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <FileText className="h-4 w-4" />
              <a
                href={tasting.report_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline flex items-center gap-1"
              >
                View existing report <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          {/* PDF upload */}
          <div className="space-y-1">
            <Label>Upload Report PDF <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <label className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 p-6 cursor-pointer hover:border-primary/40 transition-colors">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {file ? file.name : 'Click to upload PDF or image'}
              </span>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {/* Completion notes */}
          <div className="space-y-1">
            <Label>Completion Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              placeholder="How did it go? Any follow-up needed?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleComplete} disabled={uploading} className="bg-emerald-600 hover:bg-emerald-700">
            {uploading ? 'Completing…' : 'Mark Complete'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
