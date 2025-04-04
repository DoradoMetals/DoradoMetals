import { ReactNode } from 'react';
import { useUser } from '@/lib/authClient';
import { useRouter } from 'next/navigation';

interface ProtectedPageProps {
  children: ReactNode;
  requiredRoles: string[];
}

export default function ProtectedPage({ children, requiredRoles }: ProtectedPageProps) {
  const { user, isPending } = useUser();
  const router = useRouter();

  const role = user?.role;
  const authorized = requiredRoles.includes(role ?? '');

  if (isPending) return <p>Loading...</p>;

  if (!authorized) {
    router.replace('/authentication');
    return null;
  }

  return <>{children}</>;
}