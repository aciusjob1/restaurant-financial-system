import { redirect } from 'next/navigation';

export default function ExpenseCategoriesRedirect() {
  redirect('/ops/settings/expense-categories');
}
