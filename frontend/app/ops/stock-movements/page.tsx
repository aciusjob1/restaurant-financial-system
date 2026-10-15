import { redirect } from 'next/navigation';

export default function StockMovementsRedirect() {
  redirect('/ops/inventory');
}