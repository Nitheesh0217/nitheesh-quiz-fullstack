'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../../../DashboardLayoutContext';
import { apiCall } from '@/lib/api';
import { ArrowLeft, Award, FileText } from 'lucide-react';
import Toast, { type ToastMessage } from '@/components/Toast';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { SubmissionForm } from '@/components/SubmissionForm';
import { AssignmentDescription } from '@/components/AssignmentDescription';

interface Assignment {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  rubric: { criterion: string; max_points: number }[];
}

interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  file_url: string | null;
  text_content: string | null;
  status: 'submitted' | 'graded';
  submitted_at: string;
}

interface GradeRecord {
  grade_id: string;
  assignment_id: string;
  student_id: string;
  total_score: number;
  feedback: string | null;
  graded_at: string;
  rubric_scores: string | Record<string, number>;
}

function renderAssignmentDescription(description: string | null) {
  return <AssignmentDescription description={description} />;
}

function renderFileAttachment(fileUrl: string | null) {
  if (!fileUrl) return null;
  
  if (fileUrl.startsWith('data:')) {
    const nameMatch = fileUrl.match(/;name=([^;]+)/);
    const fileName = nameMatch ? decodeURIComponent(nameMatch[1]) : 'submitted_document';
    
    const mimeMatch = fileUrl.match(/^data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : '';
    const isImage = mimeType.startsWith('image/');

    const handleDownload = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div className="mt-2.5 p-3.5 bg-background dark:bg-dark-bg border border-border rounded-xl flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">📄</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-text-primary truncate">{fileName}</p>
              <p className="text-[9px] text-text-tertiary uppercase font-mono mt-0.5">
                {mimeType.split('/')[1] || 'document'} • PostgreSQL File DB
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDownload}
            className="text-[10px] font-bold text-primary hover:text-primary-hover hover:underline transition-colors shrink-0 uppercase tracking-wider focus:outline-none"
          >
            Download File
          </button>
        </div>

        {isImage && (
          <div className="border border-border/60 rounded-lg overflow-hidden bg-background max-w-sm mt-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl} alt={fileName} className="max-w-full h-auto max-h-48 object-contain mx-auto" />
          </div>
        )}
      </div>
    );
  }

  const fileName = fileUrl.split('/').pop() || 'Open Attachment';
  return (
    <div className="mt-2.5">
      <a 
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary-hover font-semibold hover:underline"
      >
        Open attachment: {fileName} <span className="text-[10px]">↗</span>
      </a>
    </div>
  );
}

export default function StudentAssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;
  const assignmentId = params.assignmentId as string;
  const { user } = useAuth();
  const { setTitle, setBreadcrumbs } = useDashboardLayout();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [gradeRecord, setGradeRecord] = useState<GradeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResubmitting, setIsResubmitting] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Set Topbar details
  useEffect(() => {
    if (assignment) {
      setTitle(assignment.title);
      setBreadcrumbs([
        { label: 'Student Portal', href: '/dashboard' },
        { label: 'Classroom', href: `/dashboard/student/classes/${classId}` },
        { label: assignment.title }
      ]);
    }
  }, [assignment, classId, setTitle, setBreadcrumbs]);

  const fetchData = useCallback(async () => {
    try {
      const assignmentData = await apiCall(`/api/assignments/${assignmentId}`);
      const parsed = typeof assignmentData.rubric === 'string' ? JSON.parse(assignmentData.rubric) : assignmentData.rubric;
      assignmentData.rubric = parsed;
      setAssignment(assignmentData);

      // Students get a 403 on GET /api/assignments/:id/submissions, so
      // grades come from the student-accessible class-grades endpoint
      // instead, filtered down to this student's own rows.
      const rawClassGrades = await apiCall(`/api/classes/${classId}/grades`).catch(() => []);
      const classGrades = (rawClassGrades as Array<GradeRecord & { submission_id: string }>)
        .filter((g) => g.student_id === user?.id);
      const matchGrade = classGrades.find((g) => g.assignment_id === assignmentId);

      if (matchGrade) {
        setGradeRecord({
          ...matchGrade,
          rubric_scores: typeof matchGrade.rubric_scores === 'string' ? JSON.parse(matchGrade.rubric_scores) : matchGrade.rubric_scores
        });

        const sub = await apiCall(`/api/submissions/${matchGrade.submission_id}`);
        setSubmission(sub);
      } else {
        // Not graded yet - fall back to the submission id this browser
        // recorded in localStorage at upload time (see SubmissionForm.tsx).
        let submissionId = null;
        if (typeof window !== 'undefined' && user?.id) {
          submissionId = localStorage.getItem(`submission_${user.id}_${assignmentId}`);
        }

        if (submissionId) {
          const sub = await apiCall(`/api/submissions/${submissionId}`);
          setSubmission(sub);
        }
      }
    } catch (err) {
      console.error(err);
      setToast({ id: 'err', type: 'error', text: 'Failed to load assignment details' });
    } finally {
      setLoading(false);
    }
  }, [assignmentId, classId, user?.id]);

  useEffect(() => {
    if (assignmentId) {
      fetchData();
    }
  }, [assignmentId, fetchData]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return null;
  if (!assignment) {
    return (
      <div className="p-6 text-center text-text-secondary animate-fadeIn">
        Assignment not found
        <Toast message={toast} onClose={() => setToast(null)} />
      </div>
    );
  }

  const isSubmitted = submission !== null;
  const hasGrade = gradeRecord !== null;
  const totalScoreMax = assignment.rubric.reduce((sum, r) => sum + r.max_points, 0);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Back link */}
      <button 
        onClick={() => router.push(`/dashboard/student/classes/${classId}`)}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors font-semibold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Classroom
      </button>

      {/* Assignment Header Card */}
      <Card hover={false} className="p-6 border border-border bg-surface shadow-sm">
        <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">{assignment.title}</h2>
        <div className="text-xs text-text-secondary leading-relaxed mt-2.5">
          {renderAssignmentDescription(assignment.description)}
        </div>
        {assignment.due_date && (
          <div className="mt-4 flex items-center gap-2">
            <span className="text-[10px] font-bold font-mono px-2 py-0.5 bg-background border border-border text-text-secondary rounded-full">
              Due Date: {new Date(assignment.due_date).toLocaleString()}
            </span>
          </div>
        )}
      </Card>

      {/* Detail grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Rubric Guide */}
        <div className="lg:col-span-1">
          <Card hover={false} className="p-5 border border-border bg-surface shadow-sm space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-text-secondary flex items-center gap-1 border-b border-border/40 pb-2">
              <Award className="h-4.5 w-4.5 text-primary" /> Rubric Requirements
            </h3>
            <div className="space-y-2">
              {assignment.rubric?.map((c, i) => (
                <div key={i} className="flex justify-between items-center text-xs pb-1.5 border-b border-border/20 last:border-0 last:pb-0">
                  <span className="text-text-secondary font-medium">{c.criterion}</span>
                  <span className="font-bold text-primary font-mono">{c.max_points} pts</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Workspace Form or Status */}
        <div className="lg:col-span-2">
          {hasGrade ? (
            <Card hover={false} className="p-6 border border-border bg-surface shadow-sm space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-success-soft text-success border border-success/15 flex items-center justify-center font-bold">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Graded</h3>
                    <p className="text-[10px] text-text-tertiary">
                      {isSubmitted 
                        ? `Submitted on ${new Date(submission!.submitted_at).toLocaleString()}` 
                        : 'No submission record (Graded manually)'}
                    </p>
                  </div>
                </div>
              </div>

              {isSubmitted && renderFileAttachment(submission!.file_url)}

              {isSubmitted && submission!.text_content && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Submitted Text Draft</p>
                  <div className="font-serif leading-relaxed text-xs text-text-secondary bg-background dark:bg-dark-bg p-4 border border-border rounded-xl whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {submission!.text_content}
                  </div>
                </div>
              )}

              <div className="p-5 bg-primary-soft/30 dark:bg-primary-soft/10 border border-primary-soft rounded-xl space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Assessed Score</h4>
                    <p className="text-2xl font-black text-primary mt-1">{gradeRecord!.total_score} points</p>
                  </div>
                  <Badge variant="success">
                    {Math.round((Number(gradeRecord!.total_score) / totalScoreMax) * 100)}%
                  </Badge>
                </div>

                {gradeRecord!.feedback && (
                  <div className="border-t border-border-strong/20 pt-3">
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Teacher Comments</h4>
                    <p className="text-xs text-text-secondary italic mt-1 leading-relaxed">
                      &quot;{gradeRecord!.feedback}&quot;
                    </p>
                  </div>
                )}
              </div>
            </Card>
          ) : isSubmitted && !isResubmitting ? (
            <Card hover={false} className="p-6 border border-border bg-surface shadow-sm space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-success-soft text-success border border-success/15 flex items-center justify-center font-bold">
                    ✓
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-text-primary">Submitted</h3>
                    <p className="text-[10px] text-text-tertiary font-mono">
                      {new Date(submission!.submitted_at).toLocaleString()}
                    </p>
                  </div>
                </div>

                {submission!.status !== 'graded' && (
                  <Button
                    onClick={() => setIsResubmitting(true)}
                    variant="secondary"
                    size="sm"
                    className="text-xs font-semibold"
                  >
                    Resubmit
                  </Button>
                )}
              </div>

               {renderFileAttachment(submission!.file_url)}

              {submission!.text_content && (
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Submitted Text Draft</p>
                  <div className="font-serif leading-relaxed text-xs text-text-secondary bg-background dark:bg-dark-bg p-4 border border-border rounded-xl whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {submission!.text_content}
                  </div>
                </div>
              )}

              <div className="p-4 bg-warning-soft border border-warning/15 rounded-lg text-xs text-warning font-bold flex items-center gap-1.5">
                <span>⏳</span> Waiting for instructor assessment...
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {isResubmitting && (
                <div className="flex justify-between items-center bg-primary-soft border border-primary-soft p-3 rounded-lg">
                  <span className="text-xs font-semibold text-text-secondary">Resubmitting will overwrite your previous draft.</span>
                  <button
                    onClick={() => setIsResubmitting(false)}
                    className="text-xs font-bold text-danger hover:underline focus:outline-none"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <Card hover={false} className="p-6 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-text-secondary flex items-center gap-1.5 border-b border-border/40 pb-2.5">
                  <FileText className="h-4.5 w-4.5 text-primary" /> Submit Assignment
                </h3>
                <SubmissionForm
                  assignmentId={assignmentId}
                  classId={classId}
                  onSuccess={(_sub) => {
                    setIsResubmitting(false);
                    fetchData();
                  }}
                />
              </Card>
            </div>
          )}
        </div>

      </div>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
