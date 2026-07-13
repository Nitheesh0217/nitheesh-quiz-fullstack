'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { useDashboardLayout } from '../DashboardLayoutContext';
import { apiCall } from '../../../lib/api';
import { Plus, Users, ClipboardList, Copy, ChevronRight, X, BookOpen, GraduationCap, Trash2 } from 'lucide-react';
import { Button } from '../../../components/Button';
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
  teacher_name?: string;
  gradeSoFar?: string;
  nextAssignment?: { title: string; due_date: string } | null;
}

export default function ClassesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { setTitle, setBreadcrumbs, setAction } = useDashboardLayout();

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [availableClasses, setAvailableClasses] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Teacher modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateSubmitting, setIsCreateSubmitting] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassDesc, setNewClassDesc] = useState('');
  const [newClassCode, setNewClassCode] = useState('');

  // Student modal state
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [isEnrollSubmitting, setIsEnrollSubmitting] = useState(false);
  const [selectedClassForEnroll, setSelectedClassForEnroll] = useState<Classroom | null>(null);
  const [enrollCode, setEnrollCode] = useState('');

  // Initialize breadcrumbs and title
  useEffect(() => {
    setTitle('Classes');
    setBreadcrumbs([
      { label: user?.role === 'teacher' ? 'Teacher Desk' : 'Student Portal', href: '/dashboard' },
      { label: 'Classes' }
    ]);
  }, [setTitle, setBreadcrumbs, user?.role]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      if (user.role === 'teacher') {
        const classesData = await apiCall(`/api/classes?teacher_id=${user.id}`);
        const enrichedClasses = await Promise.all(
          classesData.map(async (cls: Classroom) => {
            try {
              const [students, assignments, grades] = await Promise.all([
                apiCall(`/api/classes/${cls.id}/students`).catch(() => []),
                apiCall(`/api/classes/${cls.id}/assignments`).catch(() => []),
                apiCall(`/api/classes/${cls.id}/grades`).catch(() => []),
              ]);

              let classAverage = 'N/A';
              if (grades.length > 0 && assignments.length > 0) {
                let totalEarned = 0;
                let totalMax = 0;

                for (const grade of grades) {
                  const assign = (assignments as Array<{ id: string; rubric?: string | Array<{ max_points: number }> }>).find((a) => a.id === grade.assignment_id);
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
      } else if (user.role === 'student') {
        const classesData = await apiCall(`/api/classes?student_id=${user.id}`);
        const enrichedClasses = await Promise.all(
          classesData.map(async (cls: Classroom) => {
            try {
              const details = await apiCall(`/api/classes/${cls.id}`);
              const teacher_name = details.teacher_name || 'Instructor';

              const rawClassGrades = await apiCall(`/api/classes/${cls.id}/grades`).catch(() => []);
              const classGrades = (rawClassGrades as Array<{ student_id: string; total_score: number; assignment_id: string }>).filter((g) => g.student_id === user.id);
              const classAssignments = await apiCall(`/api/classes/${cls.id}/assignments`).catch(() => []);

              let gradeSoFar = 'N/A';
              if (classGrades.length > 0) {
                let totalEarned = 0;
                let totalMax = 0;

                for (const grade of classGrades) {
                  const assign = (classAssignments as Array<{ id: string; rubric?: string | Array<{ max_points: number }> }>).find((a) => a.id === grade.assignment_id);
                  if (assign) {
                    const rubric = typeof assign.rubric === 'string' ? JSON.parse(assign.rubric) : assign.rubric;
                    const maxPoints = Array.isArray(rubric) ? rubric.reduce((sum, r) => sum + r.max_points, 0) : 100;
                    totalEarned += Number(grade.total_score);
                    totalMax += maxPoints;
                  }
                }

                if (totalMax > 0) {
                  gradeSoFar = `${Math.round((totalEarned / totalMax) * 100)}%`;
                }
              }

              return {
                ...cls,
                teacher_name,
                gradeSoFar,
              };
            } catch {
              return { ...cls, teacher_name: 'Instructor', gradeSoFar: 'N/A' };
            }
          })
        );
        setClasses(enrichedClasses);

        const availableData = await apiCall('/api/classes/available').catch(() => []);
        setAvailableClasses(availableData);
      } else {
        // Admin or other role
        const allClasses = await apiCall('/api/v0/stats/classes').catch(() => []);
        setClasses(allClasses);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load classes');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      loadData();
    }
  }, [user, isLoading, router, loadData]);

  // Set action button in topbar
  useEffect(() => {
    if (!user || loading) return;

    if (user.role === 'teacher') {
      setAction(
        <Button
          onClick={() => setIsCreateOpen(true)}
          variant="primary"
          size="sm"
          className="text-xs font-semibold px-4 h-9 shadow-sm"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Create Class
        </Button>
      );
    } else if (user.role === 'student' && availableClasses.length > 0) {
      setAction(
        <Button
          onClick={() => {
            setSelectedClassForEnroll(availableClasses[0]);
            setEnrollCode('');
            setIsEnrollOpen(true);
          }}
          variant="primary"
          size="sm"
          className="text-xs font-semibold px-4 h-9 shadow-sm"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Enroll in Class
        </Button>
      );
    }
    return () => setAction(null);
  }, [user, loading, availableClasses, setAction]);

  const handleCreateClass = async () => {
    if (!newClassName.trim()) {
      setToast({ id: 'val', type: 'error', text: 'Class name is required' });
      return;
    }

    setIsCreateSubmitting(true);
    try {
      const data = await apiCall('/api/classes', {
        method: 'POST',
        body: JSON.stringify({
          school_id: user?.school_id,
          name: newClassName,
          description: newClassDesc || null,
          code: newClassCode || undefined,
        }),
      });

      setClasses(prev => [...prev, { ...data, studentCount: 0, assignmentCount: 0, classAverage: 'N/A' }]);
      setToast({ id: 'success', type: 'success', text: 'Class created successfully!' });
      setIsCreateOpen(false);
      setNewClassName('');
      setNewClassDesc('');
      setNewClassCode('');
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to create class' });
    } finally {
      setIsCreateSubmitting(false);
    }
  };

  const handleEnroll = async () => {
    if (!enrollCode.trim()) {
      setToast({ id: 'val', type: 'error', text: 'Enrollment code is required' });
      return;
    }
    setIsEnrollSubmitting(true);
    try {
      await apiCall(`/api/classes/${selectedClassForEnroll?.id}/enroll`, {
        method: 'POST',
        body: JSON.stringify({
          enrollment_code: enrollCode,
        }),
      });
      setToast({ id: 'success', type: 'success', text: 'Enrolled successfully!' });
      setIsEnrollOpen(false);
      loadData();
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Enrollment failed' });
    } finally {
      setIsEnrollSubmitting(false);
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

  if (isLoading || loading) {
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

  if (!user) return null;

  return (
    <div className="space-y-8 animate-fadeIn">
      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/25 p-4 text-sm text-danger animate-fadeIn">
          {error}
        </div>
      )}

      {/* Header telemetry cards */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border border-border dark:border-dark-border/40 bg-surface dark:bg-dark-surface p-6 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary font-black tracking-tight">
              {user.role === 'teacher' ? 'Your Classrooms' : 'Enrolled Classes'}
            </h2>
            <p className="text-xs text-text-secondary mt-0.5 font-medium leading-relaxed max-w-xl">
              {user.role === 'teacher' 
                ? 'Manage curriculum delivery, enrollment authentication codes, and classroom statistics.'
                : 'Access active course syllabi, assignments due, and grades records.'}
            </p>
          </div>
        </div>
        <div className="px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl text-center min-w-[100px]">
          <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Total Classes</p>
          <p className="text-xl font-black text-text-primary mt-0.5">{classes.length}</p>
        </div>
      </div>

      {classes.length === 0 ? (
        <Card hover={false} className="p-12 text-center max-w-lg mx-auto border border-border">
          <BookOpen className="h-10 w-10 text-text-tertiary mx-auto mb-4" />
          <h3 className="text-sm font-bold text-text-primary">
            {user.role === 'teacher' ? 'No Classrooms Taught Yet' : 'No Enrolled Classes'}
          </h3>
          <p className="text-xs text-text-secondary mt-1 max-w-xs mx-auto">
            {user.role === 'teacher'
              ? 'Get started by creating your first virtual classroom space to add assignments and register students.'
              : 'You are not enrolled in any classes yet. Click Enroll below or check available classes.'}
          </p>
          {user.role === 'teacher' ? (
            <Button
              onClick={() => setIsCreateOpen(true)}
              variant="primary"
              size="sm"
              className="mt-5 font-semibold"
            >
              Create Class
            </Button>
          ) : (
            availableClasses.length > 0 && (
              <Button
                onClick={() => {
                  setSelectedClassForEnroll(availableClasses[0]);
                  setEnrollCode('');
                  setIsEnrollOpen(true);
                }}
                variant="primary"
                size="sm"
                className="mt-5 font-semibold"
              >
                Enroll in Class
              </Button>
            )
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => {
            const avgVariant = getAverageGradeVariant(cls.classAverage || cls.gradeSoFar || 'N/A');
            return (
              <Card
                key={cls.id}
                onClick={() => {
                  router.push(`/dashboard/${user.role}/classes/${cls.id}`);
                }}
                className="p-5 border border-border bg-surface flex flex-col justify-between hover:shadow-md hover:translate-y-[-2px] transition-all cursor-pointer group"
              >
                <div>
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-bold text-text-primary text-base group-hover:text-primary transition-colors truncate">
                      {cls.name}
                    </h3>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                        avgVariant === 'success' ? 'bg-success-soft text-success border-success/20' :
                        avgVariant === 'info' ? 'bg-info-soft text-info border-info/20' :
                        avgVariant === 'warning' ? 'bg-warning-soft text-warning border-warning/20' :
                        avgVariant === 'danger' ? 'bg-danger-soft text-danger border-danger/20' :
                        'bg-neutral-100 text-text-secondary border-border'
                      }`}>
                        Avg: {cls.classAverage || cls.gradeSoFar || 'N/A'}
                      </span>
                      {user.role === 'teacher' && (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`Are you sure you want to delete the class "${cls.name}"? This will delete all assignments, submissions, and grades.`)) {
                              try {
                                await apiCall(`/api/classes/${cls.id}`, { method: 'DELETE' });
                                setClasses(prev => prev.filter(c => c.id !== cls.id));
                                setToast({ id: Math.random().toString(), type: 'success', text: `Class "${cls.name}" deleted successfully.` });
                              } catch {
                                setToast({ id: Math.random().toString(), type: 'error', text: `Failed to delete class "${cls.name}".` });
                              }
                            }
                          }}
                          className="p-1 rounded text-text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                          title="Delete Classroom"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-text-secondary mt-1.5 line-clamp-2 h-8">
                    {cls.description || 'No classroom description provided.'}
                  </p>

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {user.role === 'teacher' ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] text-text-secondary font-medium flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 text-text-tertiary" /> Instructor: {cls.teacher_name}
                        </span>
                        <span className="text-[10px] font-bold font-mono bg-background border border-border px-2 py-0.5 rounded">
                          Code: {cls.code}
                        </span>
                      </>
                    )}
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

      {/* CREATE CLASS MODAL — Teacher */}
      <Dialog.Root open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none overflow-hidden border border-border/60 dark:border-dark-border/60">
            <div className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/70 to-primary/10" />
            <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-primary/10 via-primary/3 to-transparent border-b border-border/60 dark:border-dark-border/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                    <Plus className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none font-black">Create New Class</Dialog.Title>
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

            <form onSubmit={(e) => { e.preventDefault(); handleCreateClass(); }}>
              <div className="px-6 py-5 space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    Class Name
                  </label>
                  <input
                    required
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="e.g. Biology 101"
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm font-semibold text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                      Description
                    </label>
                  </div>
                  <textarea
                    value={newClassDesc}
                    onChange={(e) => setNewClassDesc(e.target.value.slice(0, 200))}
                    maxLength={200}
                    className="w-full px-4 py-3 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all resize-none h-24 leading-relaxed"
                    placeholder="e.g. Core introductory concepts..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    Custom Enrollment Code <span className="normal-case font-normal text-text-tertiary">(optional)</span>
                  </label>
                  <input
                    value={newClassCode}
                    onChange={(e) => setNewClassCode(e.target.value)}
                    placeholder="e.g. BIO-101"
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm font-mono text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end items-center gap-3 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 border-t border-border/60 dark:border-dark-border/50">
                <Dialog.Close asChild>
                  <button type="button" className="h-9 px-4 rounded-lg border border-border dark:border-dark-border bg-transparent hover:bg-background dark:hover:bg-dark-surface text-xs font-bold text-text-secondary transition-all cursor-pointer focus:outline-none">
                    Cancel
                  </button>
                </Dialog.Close>
                <Button type="submit" loading={isCreateSubmitting} className="h-9 px-5 text-xs font-bold shadow-sm shadow-primary/20">
                  Create Class
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ENROLL CLASS MODAL — Student */}
      <Dialog.Root open={isEnrollOpen} onOpenChange={setIsEnrollOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none overflow-hidden border border-border/60 dark:border-dark-border/60">
            <div className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/70 to-primary/10" />
            <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-primary/10 via-primary/3 to-transparent border-b border-border/60 dark:border-dark-border/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                    <GraduationCap className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none font-black font-black">Enroll in Class</Dialog.Title>
                    <Dialog.Description className="text-[11px] text-text-tertiary mt-1 font-medium">Join an active course using the enrollment code.</Dialog.Description>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg focus:outline-none cursor-pointer mt-0.5">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleEnroll(); }}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                    Select Class
                  </label>
                  <select
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm font-semibold text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all cursor-pointer"
                    onChange={(e) => {
                      const selected = availableClasses.find(c => c.id === e.target.value);
                      if (selected) setSelectedClassForEnroll(selected);
                    }}
                    value={selectedClassForEnroll?.id || ''}
                  >
                    {availableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Instructor: {c.teacher_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                    Enrollment Code
                  </label>
                  <input
                    required
                    value={enrollCode}
                    onChange={(e) => setEnrollCode(e.target.value)}
                    placeholder="Enter code provided by instructor"
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm font-mono text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end items-center gap-3 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 border-t border-border/60 dark:border-dark-border/50">
                <Dialog.Close asChild>
                  <button type="button" className="h-9 px-4 rounded-lg border border-border dark:border-dark-border bg-transparent hover:bg-background dark:hover:bg-dark-surface text-xs font-bold text-text-secondary transition-all cursor-pointer focus:outline-none">
                    Cancel
                  </button>
                </Dialog.Close>
                <Button type="submit" loading={isEnrollSubmitting} className="h-9 px-5 text-xs font-bold shadow-sm shadow-primary/20">
                  Enroll in Class
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
