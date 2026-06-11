'use server';

import {
  createOpportunity,
  updateOpportunity,
  deleteOpportunity,
  type Opportunity,
} from '@/lib/eos/opportunities';

export type OpportunityFormData = {
  title: string;
  description: string;
  priority: string;
  owner_name: string;
  owner_email: string;
  term: string;
  status: string;
};

export async function createOpportunityAction(data: OpportunityFormData): Promise<Opportunity> {
  return createOpportunity({
    title: data.title.trim(),
    description: data.description.trim() || undefined,
    priority: data.priority || undefined,
    owner_name: data.owner_name.trim() || undefined,
    owner_email: data.owner_email.trim() || undefined,
    term: data.term || 'short',
    status: data.status || 'open',
  });
}

export async function updateOpportunityAction(
  id: string,
  data: OpportunityFormData,
): Promise<void> {
  await updateOpportunity(id, {
    title: data.title.trim(),
    description: data.description.trim() || null,
    priority: data.priority || null,
    owner_name: data.owner_name.trim() || null,
    owner_email: data.owner_email.trim() || null,
    term: data.term,
    status: data.status,
  });
}

export async function updateOpportunityStatusAction(
  id: string,
  status: string,
): Promise<void> {
  await updateOpportunity(id, { status });
}

export async function deleteOpportunityAction(id: string): Promise<void> {
  await deleteOpportunity(id);
}
