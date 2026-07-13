'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../DashboardLayoutContext';
import { apiCall } from '@/lib/api';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Award, ChevronDown, BookOpen, Clock, AlertCircle, ArrowRight } from 'lucide-react';

interface CourseGradeDetails {
  id: string;
  name: string;
  code: string;
  teacher_name: string;
  gradeSoFar: string; // e.g. "94%" or "N/A"
  letter: string;
  points: number;
  status: 'In Progress' | 'Completed';
  assignments: {
    id: string;
    grade_id: string | null;
    title: string;
    due_date: string | null;
    maxScore: number;
    score: number | null;
    status: 'graded' | 'submitted' | 'missing' | 'unsubmitted';
    feedback: string | null;
  }[];
}

function getGpaMetrics(pct: number) {
  if (pct >= 90) return { letter: 'A', points: 4.0, variant: 'success' as const };
  if (pct >= 80) return { letter: 'B', points: 3.0, variant: 'info' as const };
  if (pct >= 70) return { letter: 'C', points: 2.0, variant: 'warning' as const };
  if (pct >= 60) return { letter: 'D', points: 1.0, variant: 'danger' as const };
  return { letter: 'F', points: 0.0, variant: 'danger' as const };
}

export default function StudentGradesPage() {
  const { user } = useAuth();
  const { setTitle, setBreadcrumbs } = useDashboardLayout();

  const [courseGrades, setCourseGrades] = useState<CourseGradeDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);

  // Topbar and Breadcrumbs Setup
  useEffect(() => {
    setTitle('Academic Grades');
    setBreadcrumbs([
      { label: 'Student Portal', href: '/dashboard' },
      { label: 'My Grades' }
    ]);
  }, [setTitle, setBreadcrumbs]);

  // Load Data
  useEffect(() => {
    async function fetchAllGrades() {
      if (!user?.id) return;
      try {
        setLoading(true);
        // 1. Fetch Enrolled Classes
        const classesData = await apiCall(`/api/classes?student_id=${user.id}`);
        
        // 2. Fetch grades, assignments, and submissions per class
        const enrichedCourses: CourseGradeDetails[] = await Promise.all(
          (classesData as Array<{ id: string; name: string; code: string }>).map(async (cls) => {
            try {
              const [classAssignments, rawClassGrades] = await Promise.all([
                apiCall(`/api/classes/${cls.id}/assignments`).catch(() => []),
                apiCall(`/api/classes/${cls.id}/grades`).catch(() => [])
              ]);
              const classGrades = (rawClassGrades as Array<{ student_id: string; total_score: number; feedback: string | null; assignment_id: string; grade_id: string }>).filter((g) => g.student_id === user?.id);

              // Fetch details to get teacher name
              const details = await apiCall(`/api/classes/${cls.id}`).catch(() => ({ teacher_name: 'Instructor' }));
              const teacher_name = details.teacher_name || 'Instructor';

              let totalEarned = 0;
              let totalMax = 0;
              const parsedAssignmentsList: CourseGradeDetails['assignments'] = [];

              for (const assign of classAssignments) {
                const rubric = typeof assign.rubric === 'string' ? JSON.parse(assign.rubric) : assign.rubric;
                const maxPoints = Array.isArray(rubric) ? rubric.reduce((sum: number, r: { max_points: number }) => sum + r.max_points, 0) : 100;

                // Find if there's a grade
                const grade = classGrades.find((g) => g.assignment_id === assign.id);
                let score: number | null = null;
                let status: CourseGradeDetails['assignments'][0]['status'] = 'unsubmitted';
                let feedback: string | null = null;
                const gradeId: string | null = grade?.grade_id ?? null;

                if (grade) {
                  score = Number(grade.total_score);
                  status = 'graded';
                  feedback = grade.feedback || null;
                  totalEarned += score;
                  totalMax += maxPoints;
                } else {
                  // Check if submitted but not graded using local storage
                  let submissionId = null;
                  if (typeof window !== 'undefined') {
                    submissionId = localStorage.getItem(`submission_${user.id}_${assign.id}`);
                  }
                  if (submissionId) {
                    status = 'submitted';
                  } else if (assign.due_date && new Date(assign.due_date).getTime() < Date.now()) {
                    status = 'missing';
                  }
                }

                parsedAssignmentsList.push({
                  id: assign.id,
                  grade_id: gradeId,
                  title: assign.title,
                  due_date: assign.due_date,
                  maxScore: maxPoints,
                  score,
                  status,
                  feedback
                });
              }

              // Calculate Grade So Far
              let gradeSoFar = 'N/A';
              let letter = 'N/A';
              let points = 0.0;
              
              if (totalMax > 0 && classGrades.length > 0) {
                const pct = Math.round((totalEarned / totalMax) * 100);
                gradeSoFar = `${pct}%`;
                const gpa = getGpaMetrics(pct);
                letter = gpa.letter;
                points = gpa.points;
              }

              // Determine course status: Completed if all assignments are graded
              const totalGraded = parsedAssignmentsList.filter(a => a.status === 'graded').length;
              const isCompleted = classAssignments.length > 0 && totalGraded === classAssignments.length;

              return {
                id: cls.id,
                name: cls.name,
                code: cls.code || 'CS',
                teacher_name,
                gradeSoFar,
                letter,
                points,
                status: isCompleted ? 'Completed' : 'In Progress',
                assignments: parsedAssignmentsList
              };
            } catch (e) {
              console.error(e);
              return {
                id: cls.id,
                name: cls.name,
                code: cls.code || 'CS',
                teacher_name: 'Instructor',
                gradeSoFar: 'N/A',
                letter: 'N/A',
                points: 0.0,
                status: 'In Progress' as const,
                assignments: []
              };
            }
          })
        );

        setCourseGrades(enrichedCourses);
      } catch (err) {
        console.error(err);
        setError('Failed to fetch grading details');
      } finally {
        setLoading(false);
      }
    }

    fetchAllGrades();
  }, [user?.id]);

  // Telemetry Memo Calculators
  const cgpaMetrics = useMemo(() => {
    const graded = courseGrades.filter(c => c.gradeSoFar !== 'N/A');

    // Passing classes are graded courses with a score above the F/D cutoff
    const passingClasses = graded.filter(c => {
      const pct = parseInt(c.gradeSoFar);
      return pct >= 60;
    });

    let cgpa = '0.00';
    if (graded.length > 0) {
      const sumPoints = graded.reduce((sum, c) => sum + c.points, 0);
      cgpa = (sumPoints / graded.length).toFixed(2);
    }

    return {
      cgpa,
      enrolledCount: courseGrades.length,
      gradedCount: graded.length,
      passingCount: passingClasses.length
    };
  }, [courseGrades]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 bg-border/40 dark:bg-dark-border/20 animate-pulse rounded-2xl" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-border/40 dark:bg-dark-border/20 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/25 p-4 text-xs text-danger animate-fadeIn">
          {error}
        </div>
      )}

      {/* Prominent Hero GPA Banner */}
      <Card hover={false} className="p-6 border border-border bg-gradient-to-br from-primary-soft/40 via-surface to-surface dark:from-indigo-950/15 dark:via-dark-surface dark:to-dark-surface shadow-sm relative overflow-hidden rounded-2xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono font-black uppercase tracking-wider px-2 py-0.5 rounded bg-primary-soft text-primary">
              Academic Standing
            </span>
            <p className="text-xs text-text-secondary font-medium max-w-sm leading-relaxed">
              Overall cumulative performance aggregated across all completed and evaluated modules in your classroom roster.
            </p>
          </div>

          {/* Hero Score Badge */}
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <Award className="w-8 h-8" />
              </div>
              <div>
                <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Cumulative GPA</p>
                <p className="text-2xl font-black text-text-primary mt-0.5">
                  {cgpaMetrics.cgpa} <span className="text-xs text-text-secondary font-medium">/ 4.00</span>
                </p>
                <p className="text-[10px] text-text-tertiary mt-0.5">Calculated from {cgpaMetrics.gradedCount} graded courses</p>
              </div>
            </div>

            <div className="h-10 w-[1px] bg-border/60 hidden sm:block" />

            <div className="flex gap-4 sm:gap-6">
              <div className="text-center">
                <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Courses Enrolled</p>
                <p className="text-base font-black text-text-primary mt-0.5">{cgpaMetrics.enrolledCount}</p>
              </div>
              <div className="text-center">
                <p className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Courses Passed</p>
                <p className="text-base font-black text-text-primary mt-0.5">{cgpaMetrics.passingCount}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Enrolled Courses Table */}
      <div className="space-y-4">
        <h3 className="text-base font-extrabold text-text-primary tracking-tight flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" /> Enrolled Class Breakdowns
        </h3>

        {courseGrades.length === 0 ? (
          <Card hover={false} className="p-12 text-center max-w-md mx-auto border border-border">
            <AlertCircle className="h-10 w-10 text-text-tertiary mx-auto mb-3" />
            <p className="text-xs text-text-secondary font-medium">You are not enrolled in any classes yet.</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {courseGrades.map((course) => {
              const isExpanded = expandedCourse === course.id;
              const hasGrades = course.gradeSoFar !== 'N/A';
              const pct = hasGrades ? parseInt(course.gradeSoFar) : 0;
              const gpaMetrics = getGpaMetrics(pct);

              return (
                <Card 
                  key={course.id} 
                  hover={false}
                  className={`border border-border bg-surface dark:bg-dark-surface shadow-sm overflow-hidden transition-all duration-200 ${
                    isExpanded ? 'ring-1 ring-primary/10' : ''
                  }`}
                >
                  {/* Row Trigger */}
                  <div 
                    onClick={() => setExpandedCourse(isExpanded ? null : course.id)}
                    className="w-full flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4 text-xs font-semibold select-none cursor-pointer hover:bg-neutral-50/50 dark:hover:bg-dark-bg/10 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-soft text-primary text-[10px] font-black font-mono shrink-0">
                        {course.code}
                      </span>
                      <div className="min-w-0">
                        <p className="font-extrabold text-text-primary truncate">{course.name}</p>
                        <p className="text-[10px] text-text-tertiary font-medium mt-0.5">Instructor: {course.teacher_name}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 sm:gap-8 self-end sm:self-center shrink-0">
                      <div className="text-right">
                        <p className="text-[9px] text-text-tertiary uppercase tracking-wider font-bold">Assignments</p>
                        <p className="text-xs font-bold text-text-primary mt-0.5">{course.assignments.length}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-text-tertiary uppercase tracking-wider font-bold">Status</p>
                        <p className="text-xs font-bold text-text-primary mt-0.5">{course.status}</p>
                      </div>

                      <div className="text-right min-w-[70px]">
                        <p className="text-[9px] text-text-tertiary uppercase tracking-wider font-bold mb-0.5">Grade</p>
                        {hasGrades ? (
                          <Badge variant={gpaMetrics.variant}>
                            {course.letter} ({course.gradeSoFar})
                          </Badge>
                        ) : (
                          <Badge variant="default">In Progress</Badge>
                        )}
                      </div>

                      <ChevronDown 
                        className={`h-4.5 w-4.5 text-text-tertiary transition-transform duration-200 ${
                          isExpanded ? 'rotate-180 text-primary' : ''
                        }`} 
                      />
                    </div>
                  </div>

                  {/* Expanded Assignments Detail list */}
                  {isExpanded && (
                    <div className="bg-neutral-50/30 dark:bg-dark-bg/5 border-t border-border dark:border-dark-border p-4 space-y-3 animate-slideDown">
                      <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider pb-1 border-b border-border/40 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" /> Assignment Scores & Deliverables
                      </h4>
                      
                      {course.assignments.length === 0 ? (
                        <p className="text-xs text-text-tertiary font-medium py-2">No assignments posted for this course yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {course.assignments.map((assign) => (
                            <div 
                              key={assign.id}
                              className="p-3 bg-surface dark:bg-dark-surface border border-border/60 rounded-xl flex flex-col gap-2.5 hover:border-primary/20 transition-all group"
                            >
                              <div className="flex justify-between items-start gap-4 text-xs">
                                <div>
                                  <p className="font-extrabold text-text-primary leading-relaxed">{assign.title}</p>
                                  <p className="text-[9px] text-text-tertiary font-medium mt-0.5">
                                    Due: {assign.due_date ? new Date(assign.due_date).toLocaleDateString() : 'N/A'}
                                  </p>
                                </div>

                                <div className="text-right shrink-0">
                                  {assign.status === 'graded' ? (
                                    <div className="space-y-0.5">
                                      <p className="font-bold text-text-primary">
                                        {assign.score} <span className="text-text-tertiary font-medium">/ {assign.maxScore} pts</span>
                                      </p>
                                      <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded bg-success-soft text-success">
                                        {getGpaMetrics((assign.score! / assign.maxScore) * 100).letter}
                                      </span>
                                    </div>
                                  ) : assign.status === 'submitted' ? (
                                    <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-warning-soft text-warning">
                                      Submitted (Pending Grade)
                                    </span>
                                  ) : assign.status === 'missing' ? (
                                    <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-danger-soft text-danger">
                                      Missing / Overdue
                                    </span>
                                  ) : (
                                    <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-neutral-100 text-text-tertiary">
                                      Not Submitted
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Instructor comments banner on graded */}
                              {assign.status === 'graded' && assign.feedback && (
                                <div className="p-2.5 bg-background dark:bg-dark-bg border border-border/50 rounded-lg text-[11px] text-text-secondary leading-relaxed font-medium">
                                  <span className="font-bold text-primary mr-1">💬 Teacher Comments:</span>
                                  &quot;{assign.feedback}&quot;
                                </div>
                              )}

                              {assign.status === 'graded' && assign.grade_id && (
                                <Link
                                  href={`/dashboard/student/grades/${assign.grade_id}`}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:underline self-start"
                                >
                                  View full grade details <ArrowRight className="h-3 w-3" />
                                </Link>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
