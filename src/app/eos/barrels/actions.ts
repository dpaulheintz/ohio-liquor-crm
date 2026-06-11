'use server';

import {
  createBarrel,
  updateBarrel,
  deleteBarrel,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  type Barrel,
  type Milestone,
} from '@/lib/eos/barrels';

export type BarrelFormData = {
  title: string;
  description: string;
  owner_name: string;
  owner_email: string;
  status: string;
  due_date: string;
  quarter: string;
  barrel_type: string;
};

export async function createBarrelAction(data: BarrelFormData): Promise<Barrel> {
  return createBarrel({
    title: data.title.trim(),
    description: data.description.trim() || undefined,
    owner_name: data.owner_name.trim() || undefined,
    owner_email: data.owner_email.trim() || undefined,
    status: data.status || 'not_started',
    due_date: data.due_date || undefined,
    quarter: data.quarter.trim() || undefined,
    barrel_type: data.barrel_type || 'company',
  });
}

export async function updateBarrelAction(id: string, data: BarrelFormData): Promise<void> {
  await updateBarrel(id, {
    title: data.title.trim(),
    description: data.description.trim() || null,
    owner_name: data.owner_name.trim() || null,
    owner_email: data.owner_email.trim() || null,
    status: data.status,
    due_date: data.due_date || null,
    quarter: data.quarter.trim() || null,
    barrel_type: data.barrel_type,
  });
}

export async function deleteBarrelAction(id: string): Promise<void> {
  await deleteBarrel(id);
}

export async function addMilestoneAction(
  barrelId: string,
  title: string,
): Promise<Milestone> {
  return createMilestone(barrelId, title.trim());
}

export async function toggleMilestoneAction(
  id: string,
  completed: boolean,
): Promise<void> {
  await updateMilestone(id, { completed });
}

export async function deleteMilestoneAction(id: string): Promise<void> {
  await deleteMilestone(id);
}

export async function updateMilestoneAction(
  id: string,
  title: string,
): Promise<void> {
  await updateMilestone(id, { title: title.trim() });
}
