'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { useDashboardLayout } from '../DashboardLayoutContext';
import { apiCall } from '../../../lib/api';
import { FileText, Plus, Users, ClipboardList, Copy, ChevronRight, X, BookOpen } from 'lucide-react';
import { Button } from '../../../components/Button';
import { Badge } from '../../../components/Badge';
import { Card } from '../../../components/Card';
import Toast, { type ToastMessage } from '../../../components/Toast';
import * as Dialog from '@radix-ui/react-dialog';

interface Classroom {
  id: string;
  name: string;
  description: string | null;
  code: string;
  studentCount?: number;
  assignmentCount?: number;
  classAverage?: string;
}

interface PendingSubmission {
  id: string;
  assignment_id: string;
  assignment_title: string;
  class_name: string;
  student_name: string;
  submitted_at: string;
}

interface AssignmentItem {
  id: string;
  title: string;
  rubric?: string | Array<{ max_points: number }>;
}

interface GradeItem {
  assignment_id: string;
  total_score: number | string;
}

export default function TeacherDashboard() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { setTitle, setBreadcrumbs, setAction } = useDashboardLayout();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'teacher')) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [className, setClassName] = useState('');
  const [classDesc, setClassDesc] = useState('');
  const [classCode, setClassCode] = useState('');

  // Initialize Topbar layout details
  useEffect(() => {
    setTitle('Teacher Console');
    setBreadcrumbs([{ label: 'Teacher Desk' }]);
  }, [setTitle, setBreadcrumbs]);

  // Set action button in topbar
  useEffect(() => {
    setAction(
      <Button
        onClick={() => setIsModalOpen(true)}
        variant="primary"
        size="sm"
        className="text-xs font-semibold px-4 h-9 shadow-sm"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        Create Class
      </Button>
    );
    return () => setAction(null);
  }, [setAction]);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch teacher classes
      const classesData = await apiCall(`/api/classes?teacher_id=${user?.id}`);

      // 2. Fetch details (students, assignments, grades) for each class in parallel
      const enrichedClasses = await Promise.all(
        classesData.map(async (cls: Classroom) => {
          try {
            const [students, assignments, grades] = await Promise.all([
              apiCall(`/api/classes/${cls.id}/students`).catch(() => []),
              apiCall(`/api/classes/${cls.id}/assignments`).catch(() => []),
              apiCall(`/api/classes/${cls.id}/grades`).catch(() => []),
            ]);

            // Calculate class average percentage score
            let classAverage = 'N/A';
            if (grades.length > 0 && assignments.length > 0) {
              let totalEarned = 0;
              let totalMax = 0;

              for (const grade of grades as GradeItem[]) {
                const assign = (assignments as AssignmentItem[]).find((a: AssignmentItem) => a.id === grade.assignment_id);
                if (assign) {
                  const rubric = typeof assign.rubric === 'string' ? JSON.parse(assign.rubric) : assign.rubric;
                  const maxPoints = Array.isArray(rubric) ? rubric.reduce((sum, r) => sum + r.max_points, 0) : 100;
                  totalEarned += Number(grade.total_score);
                  totalMax += maxPoints;
                }
              }

              if (totalMax > 0) {
                classAverage = `${Math.round((totalEarned / totalMax) * 100)}%`;
              }
            }

            return {
              ...cls,
              studentCount: students.length,
              assignmentCount: assignments.length,
              classAverage,
            };
          } catch {
            return { ...cls, studentCount: 0, assignmentCount: 0, classAverage: 'N/A' };
          }
        })
      );
      setClasses(enrichedClasses);

      // There's no single "pending submissions across all my classes" endpoint,
      // so aggregate it client-side: classes -> assignments -> submissions.
      const submissionsPromises = classesData.map((cls: Classroom) =>
        apiCall(`/api/classes/${cls.id}/assignments`)
          .then(async (assigns: AssignmentItem[]) => {
            const subsPromises = assigns.map((assign: AssignmentItem) =>
              apiCall(`/api/assignments/${assign.id}/submissions`)
                .then((subs: Array<{ id: string; status: string; student_name?: string; submitted_at: string }>) => {
                  return subs
                    .filter((s) => s.status === 'submitted')
                    .map((s) => ({
                      id: s.id,
                      assignment_id: assign.id,
                      assignment_title: assign.title,
                      class_name: cls.name,
                      student_name: s.student_name || 'Student',
                      submitted_at: s.submitted_at,
                    }));
                })
                .catch(() => [])
            );
            const subsLists = await Promise.all(subsPromises);
            return subsLists.flat();
          })
          .catch(() => [])
      );

      const allClassSubs = await Promise.all(submissionsPromises);
      const flatPendingSubs = allClassSubs.flat();

      // Sort by submitted_at desc
      flatPendingSubs.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
      setSubmissions(flatPendingSubs);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teacher workspace');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && user.role === 'teacher') {
      loadData();
    }
  }, [user?.id, user?.role, loadData]);

  const handleCreateClass = async () => {
    if (!className.trim()) {
      setToast({ id: 'val', type: 'error', text: 'Class name is required' });
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiCall('/api/classes', {
        method: 'POST',
        body: JSON.stringify({
          school_id: user?.school_id,
          name: className,
          description: classDesc || null,
          code: classCode || undefined,
        }),
      });

      setClasses(prev => [...prev, { ...data, studentCount: 0, assignmentCount: 0, classAverage: 'N/A' }]);
      setToast({ id: 'success', type: 'success', text: 'Class created successfully!' });
      setIsModalOpen(false);
      setClassName('');
      setClassDesc('');
      setClassCode('');
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to create class' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCode = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setToast({
      id: Math.random().toString(),
      type: 'success',
      text: 'Enrollment code copied to clipboard'
    });
  };

  const getAverageGradeVariant = (avg: string) => {
    if (avg === 'N/A') return 'neutral';
    const val = parseInt(avg);
    if (val >= 90) return 'success';
    if (val >= 80) return 'info';
    if (val >= 75) return 'warning';
    return 'danger';
  };

  if (loading || isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 bg-border/60 dark:bg-dark-border/40 animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-44 bg-border/40 dark:bg-dark-border/20 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'teacher') return null;

  const totalStudents = classes.reduce((sum, c) => sum + (c.studentCount || 0), 0);

  return (
    <div className="space-y-8 animate-fadeIn">
      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/25 p-4 text-sm text-danger animate-fadeIn">
          {error}
        </div>
      )}

      {/* Welcome Banner Card */}
      <Card hover={false} className="p-6 border border-border bg-gradient-to-br from-primary-soft/40 via-surface to-surface dark:from-indigo-950/15 dark:via-dark-surface dark:to-dark-surface shadow-sm relative overflow-hidden rounded-2xl">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded bg-primary-soft text-primary">
              Instructor Workspace
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight mt-2.5">
              Welcome back, Prof. {user.name.split(' ').pop()}!
            </h1>
            <p className="text-xs text-text-secondary mt-1 font-medium leading-relaxed max-w-xl">
              Coordinate your virtual lecture spaces, draft dynamic homework rubrics, and track overall student outcomes from your unified teaching center.
            </p>
          </div>

          {/* Core Telemetry metrics */}
          <div className="flex items-center gap-4 sm:gap-6 self-start md:self-center">
            <div className="text-center px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl min-w-[76px]">
              <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Classrooms</p>
              <p className="text-lg font-black text-text-primary mt-0.5">{classes.length}</p>
            </div>
            <div className="text-center px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl min-w-[76px]">
              <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Total Roster</p>
              <p className="text-lg font-black text-text-primary mt-0.5">{totalStudents}</p>
            </div>
            <div className="text-center px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl min-w-[76px]">
              <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Pending Grades</p>
              <p className="text-lg font-black text-primary mt-0.5">{submissions.length}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Classes grid */}
      {classes.length === 0 ? (
        <Card hover={false} className="p-12 text-center max-w-lg mx-auto border border-border">
          <BookOpen className="h-10 w-10 text-text-tertiary mx-auto mb-4" />
          <h3 className="text-sm font-bold text-text-primary">No Classrooms Yet</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-xs mx-auto">
            Get started by creating your first virtual classroom space to add assignments and register students.
          </p>
          <Button
            onClick={() => setIsModalOpen(true)}
            variant="primary"
            size="sm"
            className="mt-5 font-semibold"
          >
            Create Class
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => {
            const avgVariant = getAverageGradeVariant(cls.classAverage || 'N/A');
            return (
              <Card
                key={cls.id}
                onClick={() => router.push(`/dashboard/teacher/classes/${cls.id}`)}
                className="p-5 border border-border bg-surface flex flex-col justify-between hover:shadow-md hover:translate-y-[-2px] transition-all cursor-pointer group"
              >
                <div>
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-bold text-text-primary text-base group-hover:text-primary transition-colors truncate">
                      {cls.name}
                    </h3>
                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                      avgVariant === 'success' ? 'bg-success-soft text-success border-success/20' :
                      avgVariant === 'info' ? 'bg-info-soft text-info border-info/20' :
                      avgVariant === 'warning' ? 'bg-warning-soft text-warning border-warning/20' :
                      avgVariant === 'danger' ? 'bg-danger-soft text-danger border-danger/20' :
                      'bg-neutral-100 text-text-secondary border-border'
                    }`}>
                      Avg: {cls.classAverage}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary mt-1.5 line-clamp-2 h-8">
                    {cls.description || 'No classroom description provided.'}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <span 
                      onClick={(e) => copyCode(cls.code, e)}
                      className="text-[10px] font-bold font-mono bg-background hover:bg-primary-soft hover:text-primary border border-border px-2 py-1 rounded flex items-center gap-1 transition-colors select-all"
                      title="Click to copy enrollment code"
                    >
                      {cls.code}
                      <Copy className="h-3 w-3 text-text-tertiary" />
                    </span>
                    <span className="text-[11px] text-text-secondary font-medium flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-text-tertiary" /> {cls.studentCount || 0} students
                    </span>
                    <span className="text-[11px] text-text-secondary font-medium flex items-center gap-1">
                      <ClipboardList className="h-3.5 w-3.5 text-text-tertiary" /> {cls.assignmentCount || 0} assigns
                    </span>
                  </div>
                </div>

                <div className="mt-5 border-t border-border/60 pt-3 flex items-center justify-between text-xs font-bold text-primary">
                  <span>Open Classroom</span>
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Submissions Section */}
      <div className="space-y-4 pt-4">
        <h3 className="text-lg font-bold flex items-center gap-2 text-text-primary">
          <FileText className="h-5 w-5 text-primary" />
          Pending Submissions
        </h3>

        {submissions.length === 0 ? (
          <Card hover={false} className="p-8 text-center max-w-md mx-auto border border-border bg-surface">
            <div className="w-9 h-9 rounded-full bg-success-soft text-success flex items-center justify-center mx-auto mb-3 border border-success/15 font-bold">
              ✓
            </div>
            <h4 className="text-xs font-bold text-text-primary">All caught up</h4>
            <p className="text-[11px] text-text-secondary mt-0.5">There are no ungraded student submissions pending review.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {submissions.map((sub) => (
              <div 
                key={sub.id} 
                className="border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-sm transition-all bg-surface flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning" size="sm">Submitted</Badge>
                    <span className="text-[10px] text-text-tertiary font-mono">
                      {new Date(sub.submitted_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="font-bold text-text-primary text-xs truncate mt-2">
                    {sub.class_name} - {sub.assignment_title}
                  </h4>
                  <p className="text-[10px] text-text-secondary mt-1">
                    Submitted by: <strong className="text-text-primary">{sub.student_name}</strong>
                  </p>
                </div>

                <Button
                  onClick={() => router.push(`/dashboard/teacher/assignments/${sub.assignment_id}/grade`)}
                  variant="primary"
                  size="sm"
                  className="text-xs font-semibold h-8 shrink-0 px-3.5"
                >
                  Grade
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CREATE CLASS MODAL — Premium */}
      <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none overflow-hidden border border-border/60 dark:border-dark-border/60">

            {/* Top accent stripe */}
            <div className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/70 to-primary/10" />

            {/* Gradient header */}
            <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-primary/10 via-primary/3 to-transparent border-b border-border/60 dark:border-dark-border/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                    <Plus className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none">Create New Class</Dialog.Title>
                    <Dialog.Description className="text-[11px] text-text-tertiary mt-1 font-medium">Launch a new virtual classroom for your students.</Dialog.Description>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg focus:outline-none cursor-pointer mt-0.5">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={(e) => { e.preventDefault(); handleCreateClass(); }}>
              <div className="px-6 py-5 space-y-5">

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Class Name
                  </label>
                  <input
                    id="class-name"
                    required
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="e.g. Biology 101"
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm font-semibold text-text-primary placeholder:text-text-tertiary placeholder:font-normal focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label htmlFor="desc" className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                      <ClipboardList className="h-3 w-3" /> Description
                    </label>
                    <span className="text-[10px] text-text-tertiary font-mono">{classDesc.length}/200</span>
                  </div>
                  <textarea
                    id="desc"
                    value={classDesc}
                    onChange={(e) => setClassDesc(e.target.value.slice(0, 200))}
                    maxLength={200}
                    className="w-full px-4 py-3 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all resize-none h-24 leading-relaxed"
                    placeholder="e.g. Core introductory concepts..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <Copy className="h-3 w-3" /> Custom Enrollment Code <span className="normal-case font-normal text-text-tertiary">(optional)</span>
                  </label>
                  <input
                    id="class-code"
                    value={classCode}
                    onChange={(e) => setClassCode(e.target.value)}
                    placeholder="e.g. BIO-101"
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm font-mono text-text-primary placeholder:text-text-tertiary placeholder:font-normal focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end items-center gap-3 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 border-t border-border/60 dark:border-dark-border/50">
                <Dialog.Close asChild>
                  <button type="button" className="h-9 px-4 rounded-lg border border-border dark:border-dark-border bg-transparent hover:bg-background dark:hover:bg-dark-surface text-xs font-bold text-text-secondary transition-all cursor-pointer focus:outline-none">
                    Cancel
                  </button>
                </Dialog.Close>
                <Button type="submit" loading={isSubmitting} className="h-9 px-5 text-xs font-bold shadow-sm shadow-primary/20">
                  Create Class
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
