import { redirect } from 'next/navigation';

export default function PurchasingRedirect() {
  redirect('/ops/inventory');
}