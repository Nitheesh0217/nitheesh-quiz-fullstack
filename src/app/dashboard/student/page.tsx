'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { useDashboardLayout } from '../DashboardLayoutContext';
import { apiCall } from '../../../lib/api';
import { ClipboardList, Award, Star, BookMarked, User, Plus, ChevronRight, Calendar, X } from 'lucide-react';
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
  teacher_name?: string;
  gradeSoFar?: string;
  nextAssignment?: { title: string; due_date: string } | null;
}

interface DueAssignment {
  id: string;
  title: string;
  class_id: string;
  class_name: string;
  due_date: string;
}

interface RecentGrade {
  id: string;
  assignment_title: string;
  class_name: string;
  total_score: number;
  max_score: number;
  feedback: string | null;
  rubric_scores: Record<string, number>;
}

export default function StudentDashboard() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { setTitle, setBreadcrumbs, setAction } = useDashboardLayout();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'student')) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  const [classes, setClasses] = useState<Classroom[]>([]);
  const [availableClasses, setAvailableClasses] = useState<Classroom[]>([]);
  const [assignments, setAssignments] = useState<DueAssignment[]>([]);
  const [grades, setGrades] = useState<RecentGrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Modal states
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [isEnrollSubmitting, setIsEnrollSubmitting] = useState(false);
  const [selectedClassForEnroll, setSelectedClassForEnroll] = useState<Classroom | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<RecentGrade | null>(null);

  // Initialize Topbar Layout details
  useEffect(() => {
    setTitle('Student Desk');
    setBreadcrumbs([{ label: 'Student Portal' }]);
  }, [setTitle, setBreadcrumbs]);

  // Set Topbar contextual action
  useEffect(() => {
    if (availableClasses.length > 0) {
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
  }, [availableClasses, setAction]);

  const loadData = useCallback(async () => {
    try {
      // 1. Fetch student enrolled classes
      const classesData = await apiCall(`/api/classes?student_id=${user?.id}`);

      // 2. Fetch details (grades, assignments, class info) for each class in parallel
      const enrichedClasses = await Promise.all(
        classesData.map(async (cls: Classroom) => {
          try {
            // Fetch class details to get teacher name
            const details = await apiCall(`/api/classes/${cls.id}`);
            const teacher_name = details.teacher_name || 'Instructor';

            // Students get a 403 on GET /api/assignments/:id/submissions, so
            // grades come from the student-accessible class-grades endpoint
            // instead, filtered down to this student's own rows.
            const rawClassGrades = await apiCall(`/api/classes/${cls.id}/grades`).catch(() => []);
            const classGrades = (rawClassGrades as Array<{ student_id: string; total_score: number; assignment_id: string }>).filter((g) => g.student_id === user?.id);

            // Fetch assignments list
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

            // Find next due assignment
            let nextAssignment = null;
            const upcoming = (classAssignments as Array<{ title: string; due_date: string | null }>)
              .filter((a) => a.due_date && new Date(a.due_date).getTime() > Date.now())
              .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime());

            if (upcoming.length > 0) {
              nextAssignment = {
                title: upcoming[0].title,
                due_date: upcoming[0].due_date!,
              };
            }

            return {
              ...cls,
              teacher_name,
              gradeSoFar,
              nextAssignment,
            };
          } catch {
            return { ...cls, teacher_name: 'Instructor', gradeSoFar: 'N/A', nextAssignment: null };
          }
        })
      );
      setClasses(enrichedClasses);

      // 3. Fetch available classes in school
      const availableData = await apiCall('/api/classes/available').catch(() => []);
      setAvailableClasses(availableData);

      // 4. Aggregate assignments due and recent grades
      const allDue: DueAssignment[] = [];
      const allGrades: RecentGrade[] = [];

      for (const cls of classesData) {
        try {
          const [classAssignments, rawClassGrades] = await Promise.all([
            apiCall(`/api/classes/${cls.id}/assignments`),
            apiCall(`/api/classes/${cls.id}/grades`),
          ]);
          const classGrades = (rawClassGrades as Array<{ student_id: string; total_score: number; assignment_id: string; grade_id?: string; id?: string; assignment_title: string; feedback?: string | null; rubric_scores?: string | Array<{ criterion: string; score: number }> }>)
            .filter((g) => g.student_id === user?.id);

          for (const assign of classAssignments as Array<{ id: string; title: string; due_date: string | null; description?: string }>) {
            // Check submission state using localStorage or api submission
            let submissionId = null;
            if (typeof window !== 'undefined') {
              const storageKey = `submission_${user?.id}_${assign.id}`;
              submissionId = localStorage.getItem(storageKey);
            }

            let submitted = false;
            if (submissionId) {
              try {
                const sub = await apiCall(`/api/submissions/${submissionId}`);
                if (sub) submitted = true;
              } catch {
                // ignore submission fetch error
              }
            }

            if (!submitted) {
              if (assign.due_date && new Date(assign.due_date).getTime() > Date.now()) {
                allDue.push({
                  id: assign.id,
                  title: assign.title,
                  class_id: cls.id,
                  class_name: cls.name,
                  due_date: assign.due_date!,
                });
              }
            }
          }

          for (const g of classGrades) {
            const assign = (classAssignments as Array<{ id: string; rubric?: string | Array<{ max_points: number }> }>).find((a) => a.id === g.assignment_id);
            let max_score = 100;
            if (assign) {
              const rubric = typeof assign.rubric === 'string' ? JSON.parse(assign.rubric) : assign.rubric;
              max_score = Array.isArray(rubric) ? rubric.reduce((sum, r) => sum + r.max_points, 0) : 100;
            }

            allGrades.push({
              id: g.grade_id || g.id || '',
              assignment_title: g.assignment_title,
              class_name: cls.name,
              total_score: Number(g.total_score),
              max_score,
              feedback: g.feedback || null,
              rubric_scores: typeof g.rubric_scores === 'string' ? JSON.parse(g.rubric_scores) : g.rubric_scores,
            });
          }
        } catch (e) {
          console.warn(`Error loading class details for class: ${cls.id}`, e);
        }
      }

      // Sort assignments due by date ascending
      allDue.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
      setAssignments(allDue);

      // Sort recent grades by date desc
      setGrades(allGrades.slice(0, 5));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student portal');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id && user.role === 'student') {
      loadData();
    }
  }, [user?.id, user?.role, loadData]);

  const overallGpa = useMemo(() => {
    const gradedClasses = classes.filter(c => c.gradeSoFar !== 'N/A');
    if (gradedClasses.length === 0) return 'N/A';
    const sum = gradedClasses.reduce((acc, c) => acc + parseInt(c.gradeSoFar || '0'), 0);
    return `${Math.round(sum / gradedClasses.length)}%`;
  }, [classes]);

  const handleEnrollClass = async () => {
    if (!selectedClassForEnroll) return;
    if (!enrollCode.trim()) {
      setToast({ id: 'val', type: 'error', text: 'Enrollment code is required' });
      return;
    }

    setIsEnrollSubmitting(true);
    try {
      await apiCall(`/api/classes/${selectedClassForEnroll.id}/enroll`, {
        method: 'POST',
        body: JSON.stringify({ enrollment_code: enrollCode }),
      });

      setToast({ id: 'success', type: 'success', text: `Enrolled successfully in ${selectedClassForEnroll.name}!` });
      setIsEnrollOpen(false);
      setSelectedClassForEnroll(null);
      setEnrollCode('');
      loadData();
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Invalid enrollment code' });
    } finally {
      setIsEnrollSubmitting(false);
    }
  };

  const handleOpenEnrollModal = (cls: Classroom) => {
    setSelectedClassForEnroll(cls);
    setEnrollCode('');
    setIsEnrollOpen(true);
  };

  const getGradeVariant = (avg: string) => {
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
            <div key={i} className="h-40 bg-border/40 dark:bg-dark-border/20 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'student') return null;

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
              Student Workspace
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight mt-2.5">
              Welcome back, {user.name}!
            </h1>
            <p className="text-xs text-text-secondary mt-1 font-medium leading-relaxed max-w-xl">
              Access your digital lecture rooms, check dynamic homework checklists, and monitor real-time grades from your personal academic command center.
            </p>
          </div>

          {/* Core Telemetry metrics */}
          <div className="flex items-center gap-4 sm:gap-6 self-start md:self-center">
            <div className="text-center px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl min-w-[76px]">
              <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Courses</p>
              <p className="text-lg font-black text-text-primary mt-0.5">{classes.length}</p>
            </div>
            <div className="text-center px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl min-w-[76px]">
              <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Tasks Due</p>
              <p className="text-lg font-black text-text-primary mt-0.5">{assignments.length}</p>
            </div>
            <div className="text-center px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl min-w-[76px]">
              <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Cum. Grade</p>
              <p className="text-lg font-black text-primary mt-0.5">{overallGpa}</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Enrolled Classes */}
      {classes.length === 0 ? (
        <Card hover={false} className="p-12 text-center max-w-lg mx-auto border border-border">
          <BookMarked className="h-10 w-10 text-text-tertiary mx-auto mb-4" />
          <h3 className="text-sm font-bold text-text-primary">No Classes Joined</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-xs mx-auto">
            You are not enrolled in any classes yet. Browse catalog items below to enroll.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {classes.map((cls) => {
            const gradeVariant = getGradeVariant(cls.gradeSoFar || 'N/A');
            return (
              <Card
                key={cls.id}
                onClick={() => router.push(`/dashboard/student/classes/${cls.id}`)}
                className="p-5 border border-border bg-surface flex flex-col justify-between hover:shadow-md hover:translate-y-[-2px] transition-all cursor-pointer group"
              >
                <div>
                  <div className="flex justify-between items-start gap-4">
                    <h3 className="font-bold text-text-primary text-base group-hover:text-primary transition-colors truncate">
                      {cls.name}
                    </h3>
                    <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                      gradeVariant === 'success' ? 'bg-success-soft text-success border-success/20' :
                      gradeVariant === 'info' ? 'bg-info-soft text-info border-info/20' :
                      gradeVariant === 'warning' ? 'bg-warning-soft text-warning border-warning/20' :
                      gradeVariant === 'danger' ? 'bg-danger-soft text-danger border-danger/20' :
                      'bg-neutral-100 text-text-secondary border-border'
                    }`}>
                      Grade: {cls.gradeSoFar}
                    </span>
                  </div>

                  <p className="text-[11px] text-text-secondary font-medium flex items-center gap-1 mt-1.5">
                    <User className="h-3.5 w-3.5 text-text-tertiary" /> Instructor: <strong>{cls.teacher_name}</strong>
                  </p>

                  <div className="mt-4 pt-3 border-t border-border/40">
                    {cls.nextAssignment ? (
                      <div>
                        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Next Due Task</p>
                        <p className="text-xs font-semibold text-text-primary mt-1 truncate">{cls.nextAssignment.title}</p>
                        <p className="text-[10px] text-danger font-medium mt-0.5 flex items-center gap-1 font-mono">
                          <Calendar className="h-3 w-3" /> Due {new Date(cls.nextAssignment.due_date).toLocaleDateString()}
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-text-tertiary font-bold uppercase tracking-wider">No upcoming assignments due</p>
                    )}
                  </div>
                </div>

                <div className="mt-5 border-t border-border/60 pt-3 flex items-center justify-between text-xs font-bold text-primary">
                  <span>Enter Lecture Room</span>
                  <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Available Classes to Join */}
      {availableClasses.length > 0 && (
        <div className="space-y-4 pt-4">
          <h3 className="text-lg font-bold flex items-center gap-2 text-text-primary">
            <BookMarked className="h-5 w-5 text-primary" />
            Class Catalog
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {availableClasses.map((cls) => (
              <Card key={cls.id} hover={false} className="p-5 flex flex-col justify-between border border-border bg-surface shadow-sm">
                <div>
                  <h4 className="font-bold text-text-primary text-sm truncate">{cls.name}</h4>
                  <p className="text-xs text-text-secondary mt-1.5 line-clamp-2 h-8">
                    {cls.description || 'No description provided.'}
                  </p>
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-text-secondary font-medium">
                    <User className="h-4 w-4 text-text-tertiary" />
                    <span>Instructor: <strong>{cls.teacher_name}</strong></span>
                  </div>
                </div>
                <div className="mt-5">
                  <Button 
                    onClick={() => handleOpenEnrollModal(cls)} 
                    variant="secondary" 
                    size="sm"
                    className="w-full text-xs font-semibold"
                  >
                    Enroll in Class
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Two-Column Grid: Assignments & Grades */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pt-4">
        
        {/* Assignments Due */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2 text-text-primary">
            <ClipboardList className="h-5 w-5 text-primary" /> Upcoming Assignments Due
          </h3>

          {assignments.length === 0 ? (
            <Card hover={false} className="p-8 text-center border border-border bg-surface max-w-sm mx-auto">
              <div className="w-8 h-8 rounded-full bg-success-soft text-success border border-success/15 flex items-center justify-center mx-auto mb-3 font-bold">
                ✓
              </div>
              <h4 className="text-xs font-bold text-text-primary">All caught up</h4>
              <p className="text-[10px] text-text-secondary mt-0.5">No upcoming tasks or essays are due.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {assignments.map((assign) => (
                <div 
                  key={assign.id}
                  onClick={() => router.push(`/dashboard/student/classes/${assign.class_id}`)}
                  className="border border-border rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all bg-surface flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-text-primary text-xs truncate">{assign.title}</h4>
                    <p className="text-[10px] text-text-secondary mt-1 truncate">{assign.class_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] text-danger font-extrabold uppercase font-mono">
                      Due: {new Date(assign.due_date).toLocaleDateString()}
                    </p>
                    <span className="text-[10px] text-primary font-bold hover:underline mt-1 inline-block">Submit Task</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Grades */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold flex items-center gap-2 text-text-primary">
            <Award className="h-5 w-5 text-primary" /> Recent Grades
          </h3>

          {grades.length === 0 ? (
            <Card hover={false} className="p-8 text-center border border-border bg-surface max-w-sm mx-auto">
              <Award className="h-8 w-8 text-text-tertiary mx-auto mb-3" />
              <h4 className="text-xs font-bold text-text-primary">No Grades Yet</h4>
              <p className="text-[10px] text-text-secondary mt-0.5">Scoring feedback will appear here as soon as they are assessed.</p>
            </Card>
          ) : (
            <div className="space-y-3">
              {grades.map((grade) => (
                <div 
                  key={grade.id} 
                  onClick={() => setSelectedGrade(grade)}
                  className="border border-border rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all bg-surface flex items-center justify-between gap-4 cursor-pointer"
                >
                  <div className="min-w-0">
                    <h4 className="font-bold text-text-primary text-xs truncate">
                      {grade.class_name} - {grade.assignment_title}
                    </h4>
                    {grade.feedback && (
                      <p className="text-[10px] text-text-secondary mt-1 italic truncate pl-1 border-l border-border-strong max-w-[200px]">
                        &quot;{grade.feedback}&quot;
                      </p>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs font-extrabold text-primary font-mono whitespace-nowrap">
                      {grade.total_score} / {grade.max_score} pts
                    </span>
                    <ChevronRight className="h-4 w-4 text-text-tertiary" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ENROLL CLASS MODAL — Premium */}
      <Dialog.Root open={isEnrollOpen} onOpenChange={setIsEnrollOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-45 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none overflow-hidden border border-border/60 dark:border-dark-border/60">

            <div className="h-[3px] w-full bg-gradient-to-r from-success via-success/70 to-success/10" />

            <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-success/10 via-success/3 to-transparent border-b border-border/60 dark:border-dark-border/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-success flex items-center justify-center shrink-0 shadow-lg shadow-success/30">
                    <BookMarked className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none">Join a Classroom</Dialog.Title>
                    <Dialog.Description className="text-[11px] text-text-tertiary mt-1 font-medium">Enter the enrollment code provided by your teacher.</Dialog.Description>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg focus:outline-none cursor-pointer mt-0.5">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleEnrollClass(); }}>
              <div className="px-6 py-5 space-y-5">

                {availableClasses.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                      <ClipboardList className="h-3 w-3" /> Select Classroom
                    </label>
                    <select
                      value={selectedClassForEnroll?.id || ''}
                      onChange={(e) => {
                        const match = availableClasses.find(c => c.id === e.target.value);
                        if (match) setSelectedClassForEnroll(match);
                      }}
                      className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all cursor-pointer"
                    >
                      {availableClasses.map(c => (
                        <option key={c.id} value={c.id}>{c.name} (Teacher: {c.teacher_name})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <Star className="h-3 w-3" /> Enrollment Code
                  </label>
                  <input
                    id="enroll-code"
                    required
                    value={enrollCode}
                    onChange={(e) => setEnrollCode(e.target.value)}
                    placeholder="e.g. BIO-101"
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm font-mono uppercase tracking-widest text-text-primary placeholder:text-text-tertiary placeholder:normal-case placeholder:tracking-normal placeholder:font-normal focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end items-center gap-3 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 border-t border-border/60 dark:border-dark-border/50">
                <Dialog.Close asChild>
                  <button type="button" className="h-9 px-4 rounded-lg border border-border dark:border-dark-border bg-transparent hover:bg-background dark:hover:bg-dark-surface text-xs font-bold text-text-secondary transition-all cursor-pointer focus:outline-none">
                    Cancel
                  </button>
                </Dialog.Close>
                <Button type="submit" loading={isEnrollSubmitting} className="h-9 px-5 text-xs font-bold shadow-sm shadow-success/20" style={{backgroundColor: 'var(--success)', color: 'white'}}>
                  Enroll Now
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* GRADE DETAIL MODAL — Premium */}
      <Dialog.Root open={selectedGrade !== null} onOpenChange={(open) => !open && setSelectedGrade(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-45 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none overflow-hidden border border-border/60 dark:border-dark-border/60">

            <div className="h-[3px] w-full bg-gradient-to-r from-info via-info/70 to-info/10" />

            <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-info/10 via-info/3 to-transparent border-b border-border/60 dark:border-dark-border/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-info flex items-center justify-center shrink-0 shadow-lg shadow-info/30">
                    <Award className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none">Grade Breakdown</Dialog.Title>
                    <Dialog.Description className="text-[11px] text-text-tertiary mt-1 font-medium">Rubric feedback from your instructor.</Dialog.Description>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg focus:outline-none cursor-pointer mt-0.5">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            {selectedGrade && (
              <div className="px-6 py-5 space-y-4 text-xs">
                <div>
                  <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Assignment</h4>
                  <p className="font-extrabold text-text-primary text-sm mt-1">{selectedGrade.class_name} — {selectedGrade.assignment_title}</p>
                </div>

                <div className="border border-border/60 p-4 rounded-xl bg-background/30 dark:bg-dark-bg/30 space-y-2">
                  <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-2">Rubric Items Assessed</h4>
                  {Array.isArray(selectedGrade.rubric_scores) ? (
                    (selectedGrade.rubric_scores as Array<{ criterion: string; score: number }>).map((score, idx) => (
                      <div key={idx} className="flex justify-between items-center pb-2 border-b border-border/20 last:border-0 last:pb-0 font-medium">
                        <span className="text-text-secondary">{score.criterion}</span>
                        <span className="font-extrabold text-primary font-mono">{score.score} pts</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-text-tertiary">No itemized rubric points.</div>
                  )}
                </div>

                {selectedGrade.feedback && (
                  <div>
                    <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Teacher Feedback</h4>
                    <p className="italic text-text-secondary mt-1.5 bg-primary-soft/30 dark:bg-primary/10 p-3.5 rounded-xl border border-primary-soft leading-relaxed font-medium">
                      &quot;{selectedGrade.feedback}&quot;
                    </p>
                  </div>
                )}

                <div className="pt-4 border-t border-border/60 flex items-center justify-between">
                  <span className="font-extrabold text-text-primary">Final Grade</span>
                  <span className="font-black text-primary text-base">{selectedGrade.total_score} / {selectedGrade.max_score} pts</span>
                </div>
              </div>
            )}

            <div className="flex justify-end px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 border-t border-border/60 dark:border-dark-border/50">
              <Dialog.Close asChild>
                <button className="h-9 px-4 rounded-lg border border-border dark:border-dark-border bg-transparent hover:bg-background dark:hover:bg-dark-surface text-xs font-bold text-text-secondary transition-all cursor-pointer focus:outline-none">
                  Close
                </button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
