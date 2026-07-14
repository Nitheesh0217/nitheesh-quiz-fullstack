'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/AuthProvider';
import { useDashboardLayout } from '../DashboardLayoutContext';
import { apiCall } from '../../../lib/api';
import { ClipboardList, Calendar, CheckCircle2, AlertCircle, Award, ChevronRight } from 'lucide-react';
import { Card } from '../../../components/Card';
import { Badge } from '../../../components/Badge';

interface Assignment {
  id: string;
  title: string;
  description: string;
  due_date: string | null;
  class_id: string;
  class_name: string;
  rubric: string;
  status: 'pending' | 'submitted' | 'graded' | 'overdue';
  score?: number;
  maxScore?: number;
}

export default function AssignmentsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { setTitle, setBreadcrumbs } = useDashboardLayout();

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'submitted' | 'graded'>('all');

  // Initialize breadcrumbs and title
  useEffect(() => {
    setTitle('Assignments');
    setBreadcrumbs([
      { label: user?.role === 'teacher' ? 'Teacher Desk' : 'Student Portal', href: '/dashboard' },
      { label: 'Assignments' }
    ]);
  }, [setTitle, setBreadcrumbs, user?.role]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch user classes
      const classesData = await apiCall(`/api/classes?${user.role}_id=${user.id}`);
      
      const allAssignments: Assignment[] = [];

      // 2. Fetch assignments & grades in parallel for each class
      await Promise.all(
        (classesData as Array<{ id: string; name: string }>).map(async (cls) => {
          try {
            const [classAssignments, rawClassGrades] = await Promise.all([
              apiCall(`/api/classes/${cls.id}/assignments`),
              apiCall(`/api/classes/${cls.id}/grades`).catch(() => []),
            ]);

            const classGrades = (rawClassGrades as Array<{ student_id: string; total_score: number; assignment_id: string }>).filter((g) => g.student_id === user.id);

            for (const assign of classAssignments) {
              const rubric = typeof assign.rubric === 'string' ? JSON.parse(assign.rubric) : assign.rubric;
              const maxScore = Array.isArray(rubric) ? rubric.reduce((sum: number, r: { max_points: number }) => sum + r.max_points, 0) : 100;

              let status: Assignment['status'] = 'pending';
              let score: number | undefined;

              // Check if graded
              const grade = classGrades.find((g) => g.assignment_id === assign.id);
              if (grade) {
                status = 'graded';
                score = Number(grade.total_score);
              } else {
                // Check if submitted (via localStorage or API)
                let submissionId = null;
                if (typeof window !== 'undefined') {
                  const storageKey = `submission_${user.id}_${assign.id}`;
                  submissionId = localStorage.getItem(storageKey);
                }

                let submitted = false;
                if (submissionId) {
                  try {
                    const sub = await apiCall(`/api/submissions/${submissionId}`);
                    if (sub) submitted = true;
                  } catch {
                    /* v8 ignore next -- if a saved submission lookup fails, the assignment intentionally remains pending. */
                    // ignore submission fetch error
                    /* v8 ignore next -- closing an intentionally empty catch. */
                  }
                }

                if (submitted) {
                  status = 'submitted';
                } else if (assign.due_date && new Date(assign.due_date).getTime() < Date.now()) {
                  status = 'overdue';
                }
              }

              allAssignments.push({
                id: assign.id,
                title: assign.title,
                description: assign.description || 'No description provided.',
                due_date: assign.due_date,
                class_id: cls.id,
                class_name: cls.name,
                rubric: JSON.stringify(rubric),
                status,
                score,
                maxScore,
              });
            }
          } catch (e) {
            console.warn(`Error loading assignments for class ${cls.id}`, e);
          }
        })
      );

      // Sort assignments: overdue first, then pending, then submitted, then graded
      // Within each, sort by due_date ascending
      allAssignments.sort((a, b) => {
        const order = { overdue: 0, pending: 1, submitted: 2, graded: 3 };
        if (order[a.status] !== order[b.status]) {
          return order[a.status] - order[b.status];
        }
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      });

      setAssignments(allAssignments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
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

  if (isLoading || loading) {
    return (
      <div className="space-y-6">
        <div className="h-6 w-32 bg-border/60 dark:bg-dark-border/40 animate-pulse rounded" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-border/40 dark:bg-dark-border/20 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const filteredAssignments = assignments.filter((a) => {
    if (filter === 'all') return true;
    return a.status === filter;
  });

  const getStatusBadge = (status: Assignment['status'], score?: number, max?: number) => {
    switch (status) {
      case 'graded':
        return <Badge variant="success" size="sm"><Award className="h-3 w-3 mr-1 inline" /> Graded: {score}/{max}</Badge>;
      case 'submitted':
        return <Badge variant="info" size="sm"><CheckCircle2 className="h-3 w-3 mr-1 inline" /> Submitted</Badge>;
      case 'overdue':
        return <Badge variant="danger" size="sm"><AlertCircle className="h-3 w-3 mr-1 inline" /> Overdue</Badge>;
      default:
        return <Badge variant="warning" size="sm"><Calendar className="h-3 w-3 mr-1 inline" /> Pending</Badge>;
    }
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/25 p-4 text-sm text-danger animate-fadeIn">
          {error}
        </div>
      )}

      {/* Header card */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between border border-border dark:border-dark-border/40 bg-surface dark:bg-dark-surface p-6 rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary font-black tracking-tight">
              Assignments Desk
            </h2>
            <p className="text-xs text-text-secondary mt-0.5 font-medium leading-relaxed max-w-xl">
              {user.role === 'teacher'
                ? 'Track coursework publication schedules, rubric guides, and submission evaluations.'
                : 'Monitor your upcoming homework deliverables, submission logs, and instructor grades.'}
            </p>
          </div>
        </div>

        <div className="flex gap-4 self-start sm:self-center">
          <div className="px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl text-center min-w-[80px]">
            <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Total</p>
            <p className="text-lg font-black text-text-primary mt-0.5">{assignments.length}</p>
          </div>
          {user.role === 'student' && (
            <>
              <div className="px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl text-center min-w-[80px]">
                <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Pending</p>
                <p className="text-lg font-black text-warning mt-0.5">
                  {assignments.filter(a => a.status === 'pending' || a.status === 'overdue').length}
                </p>
              </div>
              <div className="px-4 py-2 border border-border/60 bg-background/50 dark:bg-dark-bg/20 rounded-xl text-center min-w-[80px]">
                <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Graded</p>
                <p className="text-lg font-black text-success mt-0.5">
                  {assignments.filter(a => a.status === 'graded').length}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Filter Tabs (Student only) */}
      {user.role === 'student' && assignments.length > 0 && (
        <div className="flex gap-2 border-b border-border dark:border-dark-border/40 pb-px">
          {(['all', 'pending', 'submitted', 'graded'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 capitalize focus:outline-none cursor-pointer ${
                filter === t
                  ? 'border-primary text-primary font-black'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {filteredAssignments.length === 0 ? (
        <Card hover={false} className="p-12 text-center max-w-lg mx-auto border border-border bg-surface">
          <ClipboardList className="h-10 w-10 text-text-tertiary mx-auto mb-4" />
          <h3 className="text-sm font-bold text-text-primary">No Assignments Found</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-xs mx-auto">
            {user.role === 'teacher'
              ? 'Navigate to a specific classroom to publish coursework.'
              : 'All caught up! You have no assignments listed in this section.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredAssignments.map((a) => {
            const criteriaCount = Array.isArray(JSON.parse(a.rubric)) ? JSON.parse(a.rubric).length : 0;
            return (
              <div
                key={a.id}
                onClick={() => {
                  if (user.role === 'teacher') {
                    router.push(`/dashboard/teacher/assignments/${a.id}`);
                  } else {
                    router.push(`/dashboard/student/classes/${a.class_id}/assignments/${a.id}`);
                  }
                }}
                className="border border-border dark:border-dark-border/60 hover:border-primary/40 rounded-2xl p-5 hover:shadow-sm hover:translate-x-1 transition-all bg-surface dark:bg-dark-surface cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group select-none"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold font-mono text-primary bg-primary-soft dark:bg-primary-soft/10 px-2 py-0.5 rounded">
                      {a.class_name}
                    </span>
                    {user.role === 'student' && getStatusBadge(a.status, a.score, a.maxScore)}
                    {user.role === 'teacher' && (
                      <Badge variant="default" size="sm">
                        {criteriaCount} evaluation criteria
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-text-primary text-base group-hover:text-primary transition-colors truncate">
                    {a.title}
                  </h3>
                  <p className="text-xs text-text-secondary leading-relaxed line-clamp-1 max-w-2xl">
                    {a.description}
                  </p>
                </div>

                <div className="flex items-center gap-6 self-start md:self-center shrink-0">
                  <div className="text-right">
                    <p className="text-[9px] font-black text-text-tertiary uppercase tracking-wider">Due Date</p>
                    <p className="text-xs font-bold text-text-primary mt-0.5">
                      {a.due_date ? new Date(a.due_date).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      }) : 'N/A'}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-full border border-border dark:border-dark-border/40 group-hover:border-primary/30 group-hover:bg-primary-soft/30 dark:group-hover:bg-primary-soft/10 flex items-center justify-center transition-all text-text-secondary group-hover:text-primary">
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
