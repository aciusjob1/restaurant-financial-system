'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SalaryDetailRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/ops/salaries');
  }, [router]);
  return null;
}
