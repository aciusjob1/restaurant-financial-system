import { redirect } from 'next/navigation';

export default function DailyClosingRedirect() {
  redirect('/ops/cash');
}
