'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiCall } from '@/lib/api';
import { useDashboardLayout } from '../../../DashboardLayoutContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAuth } from '@/components/AuthProvider';
import { ArrowLeft, Calendar } from 'lucide-react';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';

interface GradeDetail {
  id: string;
  assignment_id: string;
  assignment_title: string;
  class_name: string;
  total_score: number | string;
  feedback: string | null;
  graded_at: string;
  teacher_name?: string;
  rubric_scores: Array<{ criterion: string; score: number; max_points?: number }>;
}

export default function GradeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const gradeId = params.id as string;
  const { user } = useAuth();
  const { setTitle, setBreadcrumbs } = useDashboardLayout();

  const [grade, setGrade] = useState<GradeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [maxScore, setMaxScore] = useState(100);

  useEffect(() => {
    setTitle('Grade Detail');
    setBreadcrumbs([
      { label: 'Student Portal', href: '/dashboard' },
      { label: 'My Grades', href: '/dashboard/student/grades' },
      { label: grade?.assignment_title || 'Grade' },
    ]);
  }, [setTitle, setBreadcrumbs, grade?.assignment_title]);

  const fetchGrade = useCallback(async () => {
    if (!user?.id) return;
    try {
      // There is no single-grade-by-id endpoint on the backend — fetch the
      // student's full grade list and find the one matching this page's id.
      const allGrades: Array<Record<string, unknown>> = await apiCall(`/api/grades?student_id=${user.id}`);
      const found = allGrades.find((g) => g.grade_id === gradeId);

      if (!found) {
        setGrade(null);
        return;
      }

      const parsedScores = typeof found.rubric_scores === 'string' ? JSON.parse(found.rubric_scores as string) : found.rubric_scores;
      const data = { ...found, id: found.grade_id, rubric_scores: parsedScores } as unknown as GradeDetail;

      // Fetch assignment rubric to get max_points per criterion
      const assign = await apiCall(`/api/assignments/${data.assignment_id}`);
      const assignRubric = typeof assign.rubric === 'string' ? JSON.parse(assign.rubric) : assign.rubric;

      // Join max_points details onto scores array
      if (Array.isArray(parsedScores) && Array.isArray(assignRubric)) {
        data.rubric_scores = parsedScores.map((scoreItem) => {
          const matchingCriterion = assignRubric.find((c) => c.criterion === scoreItem.criterion);
          return {
            ...scoreItem,
            max_points: matchingCriterion ? matchingCriterion.max_points : 50,
          };
        });
      }

      const totalMax = Array.isArray(assignRubric) ? assignRubric.reduce((sum, r) => sum + r.max_points, 0) : 100;
      setMaxScore(totalMax);
      setGrade(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [gradeId, user?.id]);

  useEffect(() => {
    if (gradeId && user?.id) {
      fetchGrade();
    }
  }, [gradeId, user?.id, fetchGrade]);

  if (loading) return <LoadingSpinner />;
  if (!user) return null;
  if (!grade) return <div className="p-6 text-center text-text-tertiary animate-fadeIn">Grade not found</div>;

  const percentage = maxScore > 0 ? Math.round((Number(grade.total_score) / maxScore) * 100) : 0;
  const gradeBadgeVariant =
    percentage >= 90 ? 'success' :
    percentage >= 80 ? 'info' :
    percentage >= 70 ? 'warning' : 'danger';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 w-full animate-fadeIn space-y-6">
      {/* Back Button */}
      <button
        onClick={() => router.back()}
        className="text-primary hover:underline text-sm font-semibold flex items-center gap-1.5"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Grades
      </button>

      {/* Grade Header */}
      <Card hover={false} className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold text-text-primary">
              {grade.assignment_title}
            </h1>
            <p className="text-text-secondary mt-2 text-sm">{grade.class_name}</p>
            <div className="text-xs text-text-tertiary mt-2 flex items-center gap-1.5 font-mono">
              <Calendar className="h-4 w-4" />
              <span>
                Graded by {grade.teacher_name || 'Instructor'} on {new Date(grade.graded_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Score Display */}
          <div className="text-center sm:text-right shrink-0 bg-primary-soft border border-border p-4 rounded-xl w-full sm:w-auto min-w-[120px]">
            <p className="text-5xl font-extrabold text-primary">
              {grade.total_score}
            </p>
            <p className="text-[10px] text-text-tertiary mt-1">out of {maxScore}</p>
            <div className="mt-2.5">
              <Badge variant={gradeBadgeVariant}>
                {percentage}%
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Rubric Breakdown */}
      <Card hover={false} className="p-6">
        <h2 className="text-xl font-bold text-text-primary mb-4">
          Rubric Breakdown
        </h2>

        <div className="space-y-5">
          {grade.rubric_scores?.map((item, idx) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4 last:border-0 last:pb-0">
              <div>
                <p className="font-semibold text-text-primary text-sm">{item.criterion}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-text-primary">
                  {item.score} / {item.max_points || 50}
                </p>
                <div className="w-32 h-2 bg-border rounded-full mt-1 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{
                      width: `${(item.score / (item.max_points || 50)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Teacher Feedback */}
      {grade.feedback && (
        <div className="bg-primary-soft rounded-xl border border-border p-6 shadow-sm">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            Teacher Feedback
          </h2>
          <p className="text-text-secondary whitespace-pre-wrap text-sm leading-relaxed italic">
            &quot;{grade.feedback}&quot;
          </p>
        </div>
      )}
    </div>
  );
}
