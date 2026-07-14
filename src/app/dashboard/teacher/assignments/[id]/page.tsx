'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../DashboardLayoutContext';
import { apiCall } from '@/lib/api';
import { ArrowLeft, Award, FileText, Calendar, Edit3, X, Star } from 'lucide-react';
import Toast, { type ToastMessage } from '@/components/Toast';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
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
  student_name: string;
  student_email: string;
  file_url: string | null;
  text_content: string | null;
  status: 'submitted' | 'graded';
  submitted_at: string;
  total_score?: number;
  feedback?: string | null;
  grade?: {
    id: string;
    total_score: number;
    feedback: string | null;
    rubric_scores: Record<string, number>;
  } | null;
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

export default function TeacherAssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = params.id as string;
  const { user } = useAuth();
  const { setTitle, setBreadcrumbs, setAction } = useDashboardLayout();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Edit Assignment Modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // Grading Side Sheet state
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [scores, setScores] = useState<{ criterion: string; score: number }[]>([]);
  const [feedback, setFeedback] = useState('');
  const [isGradingSubmitting, setIsGradingSubmitting] = useState(false);

  // Set Topbar info
  useEffect(() => {
    if (assignment) {
      setTitle(assignment.title);
      setBreadcrumbs([
        { label: 'Teacher Desk', href: '/dashboard' },
        { label: 'Classroom', href: `/dashboard/teacher/classes/${assignment.class_id}` },
        { label: assignment.title }
      ]);
    }
  }, [assignment, setTitle, setBreadcrumbs]);

  // Set topbar action button
  useEffect(() => {
    if (assignment) {
      setAction(
        <Button
          onClick={() => {
            setEditTitle(assignment.title);
            setEditDesc(assignment.description || '');
            setEditDueDate(assignment.due_date ? assignment.due_date.slice(0, 16) : '');
            setIsEditOpen(true);
          }}
          variant="secondary"
          size="sm"
          className="text-xs font-semibold px-4 h-9 shadow-sm"
        >
          <Edit3 className="h-4 w-4 mr-1.5" />
          Edit Assignment
        </Button>
      );
    }
    return () => setAction(null);
  }, [assignment, setAction]);

  const loadData = useCallback(async () => {
    try {
      const assignData = await apiCall(`/api/assignments/${assignmentId}`);
      const parsed = typeof assignData.rubric === 'string' ? JSON.parse(assignData.rubric) : assignData.rubric;
      assignData.rubric = parsed;
      setAssignment(assignData);

      const subData = await apiCall(`/api/assignments/${assignmentId}/submissions`);
      
      // For graded submissions, fetch their grades to display scores
      const enrichedSubs = await Promise.all(
        (subData as Submission[]).map(async (sub: Submission) => {
          if (sub.status === 'graded') {
            try {
              const grade = await apiCall(`/api/submissions/${sub.id}/grades`);
              return {
                ...sub,
                total_score: Number(grade.total_score),
                feedback: grade.feedback,
                grade: {
                  ...grade,
                  total_score: Number(grade.total_score),
                  rubric_scores: typeof grade.rubric_scores === 'string' ? JSON.parse(grade.rubric_scores) : grade.rubric_scores
                }
              };
            } catch {
              return sub;
            }
          }
          return sub;
        })
      );
      
      // Sort: ungraded first, then by submission time desc
      enrichedSubs.sort((a: Submission, b: Submission) => {
        if (a.status !== b.status) {
          return a.status === 'submitted' ? -1 : 1;
        }
        return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
      });

      setSubmissions(enrichedSubs);
    } catch {
      setToast({ id: 'err', type: 'error', text: 'Failed to load assignment details' });
    } finally {
      setLoading(false);
    }
  }, [assignmentId]);

  useEffect(() => {
    if (assignmentId) {
      loadData();
    }
  }, [assignmentId, loadData]);

  const handleEditAssignment = async () => {
    if (!editTitle.trim()) {
      setToast({ id: 'val', type: 'error', text: 'Title is required' });
      return;
    }

    setIsEditSubmitting(true);
    try {
      const updated = await apiCall(`/api/assignments/${assignmentId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editTitle,
          description: editDesc || null,
          due_date: editDueDate || null,
        }),
      });

      /* v8 ignore next -- the edit modal is only reachable after assignment is loaded */
      setAssignment(prev => prev ? { ...prev, ...updated, rubric: prev.rubric } : null);
      setToast({ id: 'success', type: 'success', text: 'Assignment updated successfully!' });
      setIsEditOpen(false);
      loadData();
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to update assignment' });
    } finally {
      setIsEditSubmitting(false);
    }
  };

  const handleOpenGrading = (sub: Submission) => {
    setSelectedSub(sub);
    /* v8 ignore next -- submission cards render only after assignment is loaded */
    const rubric = assignment?.rubric || [];
    
    if (sub.status === 'graded' && sub.grade?.rubric_scores) {
      const scoresArray = Array.isArray(sub.grade.rubric_scores) 
        ? sub.grade.rubric_scores 
        : Object.entries(sub.grade.rubric_scores).map(([criterion, score]) => ({ criterion, score }));
      setScores(rubric.map(r => {
        const match = (scoresArray as Array<{ criterion: string; score: number }>).find((s) => s.criterion === r.criterion);
        return {
          criterion: r.criterion,
          score: match ? match.score : r.max_points
        };
      }));
      setFeedback(sub.grade.feedback || '');
    } else {
      setScores(rubric.map(r => ({ criterion: r.criterion, score: r.max_points })));
      setFeedback('');
    }
  };

  const handlePostGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    /* v8 ignore next -- grading form is only mounted while both are set */
    if (!selectedSub || !assignment) return;

    setIsGradingSubmitting(true);
    try {
      const result = await apiCall(`/api/submissions/${selectedSub.id}/grades`, {
        method: 'POST',
        body: JSON.stringify({
          rubric_scores: scores,
          feedback,
        }),
      });

      setToast({ id: 'success', type: 'success', text: 'Grade posted successfully!' });
      
      // Optimistic UI updates
      setSubmissions(prev => prev.map(s => 
        s.id === selectedSub.id 
          ? { 
              ...s, 
              status: 'graded', 
              total_score: Number(result.total_score), 
              feedback: result.feedback,
              rubric_scores: scores
            } 
          : s
      ));
      
      setSelectedSub(null);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to submit grade' });
    } finally {
      setIsGradingSubmitting(false);
    }
  };

  const totalScoreMax = useMemo(() => {
    if (!assignment) return 0;
    return assignment.rubric.reduce((sum, r) => sum + r.max_points, 0);
  }, [assignment]);

  const liveTotalScore = useMemo(() => {
    return scores.reduce((sum, s) => sum + s.score, 0);
  }, [scores]);

  const livePercentage = totalScoreMax > 0 ? Math.round((liveTotalScore / totalScoreMax) * 100) : 0;

  const liveLetterGrade = useMemo(() => {
    if (livePercentage >= 90) return 'A';
    if (livePercentage >= 80) return 'B';
    if (livePercentage >= 70) return 'C';
    if (livePercentage >= 60) return 'D';
    return 'F';
  }, [livePercentage]);

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

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Back button */}
      <button 
        onClick={() => router.push(`/dashboard/teacher/classes/${assignment.class_id}`)}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors font-semibold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Classroom
      </button>

      {/* Assignment Header Card */}
      <Card hover={false} className="p-6 border border-border bg-surface shadow-sm">
        <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">{assignment.title}</h2>
        <div className="text-xs text-text-secondary leading-relaxed mt-2.5 max-w-2xl">
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

      {/* Details layout grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Rubric Matrix Card */}
        <div className="lg:col-span-1">
          <Card hover={false} className="p-5 border border-border bg-surface shadow-sm space-y-4">
            <h3 className="font-bold text-xs uppercase tracking-wider text-text-secondary flex items-center gap-1 border-b border-border/40 pb-2">
              <Award className="h-4.5 w-4.5 text-primary" /> Rubric Guide
            </h3>
            
            <div className="space-y-2">
              {assignment.rubric?.map((c, i) => (
                <div key={i} className="flex justify-between items-center text-xs pb-1.5 border-b border-border/20 last:border-0 last:pb-0">
                  <span className="text-text-secondary font-medium">{c.criterion}</span>
                  <span className="font-bold text-text-primary font-mono">{c.max_points} pts</span>
                </div>
              ))}
              <div className="flex justify-between items-center text-xs font-bold border-t border-border pt-3 mt-2 text-text-primary">
                <span>Total Max Points</span>
                <span className="font-mono">{totalScoreMax} pts</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Submissions Roster */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-bold text-sm text-text-primary flex items-center gap-1.5">
            <FileText className="h-4.5 w-4.5 text-primary" /> Submissions Roster ({submissions.length})
          </h3>

          {submissions.length === 0 ? (
            <Card hover={false} className="p-12 text-center border border-border bg-surface">
              <FileText className="h-8 w-8 text-text-tertiary mx-auto mb-3" />
              <p className="text-xs text-text-secondary font-medium">No student submissions received yet.</p>
            </Card>
          ) : (
            <Card hover={false} className="p-0 border border-border bg-surface overflow-hidden shadow-sm">
              <div className="divide-y divide-border">
                {submissions.map((sub) => (
                  <div 
                    key={sub.id} 
                    onClick={() => handleOpenGrading(sub)}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-neutral-50/50 dark:hover:bg-slate-800/10 transition-all cursor-pointer group"
                  >
                    <div className="min-w-0">
                      <h4 className="font-bold text-text-primary text-xs truncate group-hover:text-primary transition-colors">
                        {sub.student_name}
                      </h4>
                      <p className="text-[10px] text-text-tertiary font-mono truncate mt-0.5 max-w-[240px]">
                        {sub.student_email}
                      </p>
                      <p className="text-[9px] text-text-tertiary mt-2">
                        Submitted: {new Date(sub.submitted_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {sub.status === 'graded' ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-success-soft text-success border-success/20">
                            {sub.total_score} / {totalScoreMax} pts
                          </span>
                          <span className="text-xs text-text-tertiary font-bold font-mono">Graded</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-warning-soft text-warning border-warning/20">
                            Needs Grading
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenGrading(sub); }}
                            className="bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                          >
                            Grade
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

      </div>

      {/* EDIT ASSIGNMENT MODAL — Premium */}
      <Dialog.Root open={isEditOpen} onOpenChange={setIsEditOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none overflow-hidden border border-border/60 dark:border-dark-border/60">

            {/* Top accent stripe */}
            <div className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/70 to-primary/10" />

            {/* Header */}
            <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-primary/10 via-primary/3 to-transparent border-b border-border/60 dark:border-dark-border/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                    <Edit3 className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none">Edit Assignment</Dialog.Title>
                    <Dialog.Description className="text-[11px] text-text-tertiary mt-1 font-medium">Update the title, instructions, and deadline.</Dialog.Description>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg focus:outline-none cursor-pointer mt-0.5">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            {/* Form body */}
            <form onSubmit={(e) => { e.preventDefault(); handleEditAssignment(); }}>
              <div className="px-6 py-5 space-y-5">

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Assignment Title
                  </label>
                  <input
                    id="edit-title"
                    required
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="e.g. Essay 1"
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm font-semibold text-text-primary placeholder:text-text-tertiary placeholder:font-normal focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Instructions
                  </label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all resize-none h-28 leading-relaxed"
                    placeholder="Provide instructions here..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> Due Date & Time
                  </label>
                  <input
                    id="edit-due"
                    type="datetime-local"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end items-center gap-3 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 border-t border-border/60 dark:border-dark-border/50">
                <Dialog.Close asChild>
                  <button type="button" className="h-9 px-4 rounded-lg border border-border dark:border-dark-border bg-transparent hover:bg-background dark:hover:bg-dark-surface text-xs font-bold text-text-secondary transition-all cursor-pointer focus:outline-none">
                    Cancel
                  </button>
                </Dialog.Close>
                <Button type="submit" loading={isEditSubmitting} className="h-9 px-5 text-xs font-bold shadow-sm shadow-primary/20">
                  Save Changes
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* GRADING SIDE SHEET (Radix Dialog) */}
      <Dialog.Root open={selectedSub !== null} onOpenChange={(open) => !open && setSelectedSub(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-45" />
          <Dialog.Content className="fixed top-0 right-0 h-screen w-full sm:w-[460px] bg-surface dark:bg-dark-surface border-l border-border dark:border-dark-border p-6 shadow-xl z-50 animate-slideInRight flex flex-col justify-between focus:outline-none max-h-screen overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-6 pr-1 pb-4">
              <div className="flex justify-between items-center pb-4 border-b border-border">
                <div>
                  <Dialog.Title className="text-base font-bold text-text-primary">Grading Side Sheet</Dialog.Title>
                  <Dialog.Description className="text-xs text-text-secondary mt-0.5">Grade and review student submissions</Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <button className="p-1 text-text-tertiary hover:text-text-primary rounded-lg border border-border">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>

              {selectedSub && (
                <div className="space-y-6">
                  {/* Student Header */}
                  <div>
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Student</h4>
                    <p className="text-xs font-bold text-text-primary mt-1">{selectedSub.student_name}</p>
                    <p className="text-[9px] text-text-tertiary font-mono">{selectedSub.student_email}</p>
                  </div>

                  {/* Submission Work */}
                  <div className="space-y-3">
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" /> Submitted work
                    </h4>
                    
                    {renderFileAttachment(selectedSub.file_url)}

                    {selectedSub.text_content ? (
                      <div className="font-serif leading-relaxed text-xs text-text-secondary bg-background dark:bg-dark-bg p-4 border border-border rounded-xl whitespace-pre-wrap max-h-60 overflow-y-auto shadow-inner">
                        {selectedSub.text_content}
                      </div>
                    ) : (
                      !selectedSub.file_url && (
                        <p className="text-xs italic text-text-tertiary">No text content submitted.</p>
                      )
                    )}
                  </div>

                  {/* Rubric Inputs */}
                  <form id="grading-form" onSubmit={handlePostGrade} className="space-y-4 pt-4 border-t border-border/60">
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
                      <Award className="h-3.5 w-3.5 text-primary" /> Rubric Assessment
                    </h4>

                    <div className="space-y-3">
                      {scores.map((score, idx) => {
                        const criterionMatch = assignment.rubric.find(r => r.criterion === score.criterion);
                        /* v8 ignore next -- scores are derived from the assignment rubric */
                        const max = criterionMatch ? criterionMatch.max_points : 100;
                        return (
                          <div key={idx} className="flex justify-between items-center gap-4 pb-2 border-b border-border/20 last:border-0 last:pb-0">
                            <span className="text-xs font-semibold text-text-primary">{score.criterion}</span>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                required
                                min="0"
                                max={max}
                                value={score.score}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  const clamped = Math.max(0, Math.min(max, val));
                                  const next = [...scores];
                                  next[idx].score = clamped;
                                  setScores(next);
                                }}
                                className="w-16 rounded-lg border-2 border-border bg-background text-center text-xs font-bold text-text-primary py-1 px-1 focus:border-primary focus:outline-none"
                              />
                              <span className="text-[10px] text-text-tertiary">/ {max} pts</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Feedback textarea */}
                    <div className="space-y-1.5 pt-3">
                      <label className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Written Feedback</label>
                      <textarea
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                        className="block w-full rounded-lg border-2 border-border bg-background py-2 px-3 text-text-primary focus:border-primary focus:outline-none text-xs h-20"
                        placeholder="Add scoring comments or guidelines..."
                      />
                    </div>
                  </form>

                </div>
              )}
            </div>

            {/* Bottom grading score summary & action */}
            {selectedSub && (
              <div className="border-t border-border pt-4 flex items-center justify-between bg-surface dark:bg-dark-surface -mx-6 px-6 -mb-6 pb-6">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Total</span>
                    <Badge variant={livePercentage >= 70 ? (livePercentage >= 85 ? 'success' : 'info') : 'danger'} size="sm">
                      {liveLetterGrade} ({livePercentage}%)
                    </Badge>
                  </div>
                  <p className="text-xl font-black text-text-primary mt-1 flex items-center gap-1">
                    <Star className="h-4.5 w-4.5 text-primary fill-primary" />
                    {liveTotalScore} / {totalScoreMax} pts
                  </p>
                </div>

                <Button 
                  type="submit"
                  form="grading-form"
                  loading={isGradingSubmitting}
                  className="px-5 py-2 text-xs font-bold shadow-md"
                >
                  Submit Grade
                </Button>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
