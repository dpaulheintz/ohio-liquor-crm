'use server';

import {
  createHeadline,
  updateHeadline,
  deleteHeadline,
  type Headline,
} from '@/lib/eos/headlines';

export type HeadlineFormData = {
  title: string;
  headline_type: string;
  owner_name: string;
};

export async function createHeadlineAction(data: HeadlineFormData): Promise<Headline> {
  return createHeadline({
    title: data.title.trim(),
    headline_type: data.headline_type || 'good_news',
    owner_name: data.owner_name.trim() || undefined,
  });
}

export async function updateHeadlineAction(id: string, data: HeadlineFormData): Promise<void> {
  await updateHeadline(id, {
    title: data.title.trim(),
    headline_type: data.headline_type,
    owner_name: data.owner_name.trim() || null,
  });
}

export async function deleteHeadlineAction(id: string): Promise<void> {
  await deleteHeadline(id);
}
