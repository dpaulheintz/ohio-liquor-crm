'use server';

import {
  createTodo,
  updateTodo,
  toggleTodo,
  deleteTodo,
  type Todo,
} from '@/lib/eos/todos';

export type TodoFormData = {
  title: string;
  owner_name: string;
  owner_email: string;
  due_date: string;
};

export async function createTodoAction(data: TodoFormData): Promise<Todo> {
  return createTodo({
    title: data.title.trim(),
    owner_name: data.owner_name.trim() || undefined,
    owner_email: data.owner_email.trim() || undefined,
    due_date: data.due_date || undefined,
  });
}

export async function updateTodoAction(id: string, data: TodoFormData): Promise<void> {
  await updateTodo(id, {
    title: data.title.trim(),
    owner_name: data.owner_name.trim() || null,
    owner_email: data.owner_email.trim() || null,
    due_date: data.due_date || null,
  });
}

export async function toggleTodoAction(id: string, completed: boolean): Promise<void> {
  await toggleTodo(id, completed);
}

export async function deleteTodoAction(id: string): Promise<void> {
  await deleteTodo(id);
}
