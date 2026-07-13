'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function TeacherGradeRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const assignmentId = params.id as string;

  useEffect(() => {
    if (assignmentId) {
      router.replace(`/dashboard/teacher/assignments/${assignmentId}`);
    }
  }, [assignmentId, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );
}
