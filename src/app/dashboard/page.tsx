'use client';

import { useAuth } from '../../components/AuthProvider';
import AdminDashboard from './admin/page';
import TeacherDashboard from './teacher/page';
import StudentDashboard from './student/page';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardRouter() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) return <LoadingSpinner />;
  if (!user) return null;
  
  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'teacher') return <TeacherDashboard />;
  if (user.role === 'student') return <StudentDashboard />;
  
  return <div>Unknown role</div>;
}
