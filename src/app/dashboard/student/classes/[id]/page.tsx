'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../DashboardLayoutContext';
import { apiCall } from '@/lib/api';
import { ArrowLeft, ClipboardList, Award, Calendar, Send, CheckCircle2, X, BookOpen, Volume2, Home } from 'lucide-react';
import Toast, { type ToastMessage } from '@/components/Toast';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { SubmissionForm } from '@/components/SubmissionForm';
import { AssignmentDescription } from '@/components/AssignmentDescription';
import { SyllabusWeekAccordion, type SyllabusWeek } from '@/components/SyllabusWeekAccordion';

interface Classroom {
  id: string;
  name: string;
  description: string | null;
  code: string;
  teacher_name: string | null;
  syllabus_overview: string | null;
}

interface ClassAnnouncement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_name: string;
}

interface Assignment {
  id: string;
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
  rubric_scores: string | Record<string, number> | Array<{ criterion: string; score: number }>;
  max_score?: number;
  submission_id?: string;
  assignment_title?: string;
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

export default function StudentClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;
  const { user } = useAuth();
  const { setTitle, setBreadcrumbs, setIsFocusMode } = useDashboardLayout();

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [syllabusWeeks, setSyllabusWeeks] = useState<SyllabusWeek[]>([]);
  const [announcements, setAnnouncements] = useState<ClassAnnouncement[]>([]);
  const [selectedAssign, setSelectedAssign] = useState<Assignment | null>(null);
  
  // Student grades for the whole class (accessible)
  const [classGrades, setClassGrades] = useState<GradeRecord[]>([]);
  
  // Selected assignment submission details
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [gradeRecord, setGradeRecord] = useState<GradeRecord | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Submit Modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  // Rubric details side sheet
  const [isRubricOpen, setIsRubricOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'classroom' | 'assignments' | 'syllabus' | 'announcements'>('classroom');
  const [expandedWeek, setExpandedWeek] = useState<number | null>(1);

  // Set Topbar info
  useEffect(() => {
    if (classroom) {
      setTitle(classroom.name);
      setBreadcrumbs([
        { label: 'Student Portal', href: '/dashboard' },
        { label: classroom.name }
      ]);
    }
  }, [classroom, setTitle, setBreadcrumbs]);

  // Sidebar Focus Mode Side Effect (Hides sidebar on the entire classroom route)
  useEffect(() => {
    setIsFocusMode?.(true);
    return () => {
      setIsFocusMode?.(false);
    };
  }, [setIsFocusMode]);

  const loadClassData = useCallback(async () => {
    try {
      const classData = await apiCall(`/api/classes/${classId}`);
      setClassroom(classData);

      const assignData = await apiCall(`/api/classes/${classId}/assignments`);
      // Parse assignment rubrics
      const parsedAssigns = (assignData as Array<{ id: string; title: string; description: string | null; due_date: string | null; rubric: string | Array<{ criterion: string; max_points: number }> }>).map((a) => ({
        ...a,
        rubric: typeof a.rubric === 'string' ? JSON.parse(a.rubric) : a.rubric
      }));
      setAssignments(parsedAssigns as Assignment[]);

      // Students get a 403 on GET /api/assignments/:id/submissions, so
      // grades come from the student-accessible class-grades endpoint
      // instead, filtered down to this student's own rows.
      const rawGradesData = await apiCall(`/api/classes/${classId}/grades`).catch(() => []);
      const gradesData = (rawGradesData as GradeRecord[]).filter((g) => g.student_id === user?.id);
      
      // Parse grades rubric scores
      const parsedGrades = gradesData.map((g) => {
        const assign = (parsedAssigns as Assignment[]).find((a) => a.id === g.assignment_id);
        const max_score = assign 
          ? assign.rubric.reduce((sum, r) => sum + r.max_points, 0)
          : 100;
        return {
          ...g,
          max_score,
          rubric_scores: typeof g.rubric_scores === 'string' ? JSON.parse(g.rubric_scores) : g.rubric_scores
        };
      });
      setClassGrades(parsedGrades);

      const weeks = await apiCall(`/api/classes/${classId}/syllabus-weeks`).catch(() => []);
      setSyllabusWeeks(weeks);

      const announcementList = await apiCall(`/api/classes/${classId}/announcements`).catch(() => []);
      setAnnouncements(announcementList);

    } catch {
      setToast({ id: 'err', type: 'error', text: 'Failed to load class information' });
    } finally {
      setLoading(false);
    }
  }, [classId, user?.id]);

  useEffect(() => {
    if (classId) {
      loadClassData();
    }
  }, [classId, loadClassData]);

  // GET /api/assignments/:id/submissions is teacher/admin-only, so a student
  // resolves their own submission by first checking already-loaded grades,
  // then falling back to the submission id this browser recorded in
  // localStorage at upload time (see SubmissionForm.tsx).
  const handleSelectAssignment = async (assign: Assignment) => {
    setSelectedAssign(assign);
    setSubmission(null);
    setGradeRecord(null);

    // 1. Check if assignment is already graded in class grades
    const matchGrade = classGrades.find(g => g.assignment_id === assign.id);
    if (matchGrade) {
      setGradeRecord(matchGrade);
      
      // Fetch details of submission via GET /api/submissions/:id
      try {
        const sub = await apiCall(`/api/submissions/${matchGrade.submission_id}`);
        setSubmission(sub);
      } catch (err) {
        console.warn('Failed to load submission object', err);
      }
      return;
    }

    // 2. If not graded, check localStorage mapping for student's submission id
    let submissionId = null;
    if (typeof window !== 'undefined' && user?.id) {
      submissionId = localStorage.getItem(`submission_${user.id}_${assign.id}`);
    }

    if (submissionId) {
      try {
        const sub = await apiCall(`/api/submissions/${submissionId}`);
        setSubmission(sub);
      } catch (err) {
        console.warn('Stale submission record in local storage', err);
      }
    }
  };



  const totalScoreMax = useMemo(() => {
    if (!selectedAssign) return 0;
    return selectedAssign.rubric.reduce((sum, r) => sum + r.max_points, 0);
  }, [selectedAssign]);

  const percentageGrade = useMemo(() => {
    if (!gradeRecord || totalScoreMax === 0) return 0;
    return Math.round((Number(gradeRecord.total_score) / totalScoreMax) * 100);
  }, [gradeRecord, totalScoreMax]);

  const letterGrade = useMemo(() => {
    if (percentageGrade >= 90) return 'A';
    if (percentageGrade >= 80) return 'B';
    if (percentageGrade >= 70) return 'C';
    if (percentageGrade >= 60) return 'D';
    return 'F';
  }, [percentageGrade]);

  const getScoreVariant = (pct: number) => {
    if (pct >= 90) return 'success';
    if (pct >= 80) return 'info';
    if (pct >= 70) return 'warning';
    return 'danger';
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) return null;
  if (!classroom) return <div className="p-6 text-center text-text-secondary animate-fadeIn">Classroom not found</div>;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Back navigation */}
      <button 
        onClick={() => router.push('/dashboard')}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors font-semibold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Portal
      </button>

      {/* Tab Switcher */}
      <div className="flex gap-1 bg-neutral-100 dark:bg-dark-bg p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('classroom')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all focus:outline-none cursor-pointer ${
            activeTab === 'classroom'
              ? 'bg-surface dark:bg-dark-surface text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Home className="h-4 w-4" />
          Classroom
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all focus:outline-none cursor-pointer ${
            activeTab === 'assignments'
              ? 'bg-surface dark:bg-dark-surface text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <ClipboardList className="h-4 w-4" />
          Assignments
        </button>
        <button
          onClick={() => setActiveTab('syllabus')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all focus:outline-none cursor-pointer ${
            activeTab === 'syllabus'
              ? 'bg-surface dark:bg-dark-surface text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Syllabus & Modules
        </button>
        <button
          onClick={() => setActiveTab('announcements')}
          className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all focus:outline-none cursor-pointer ${
            activeTab === 'announcements'
              ? 'bg-surface dark:bg-dark-surface text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          <Volume2 className="h-4 w-4" />
          Announcements
        </button>
      </div>

      {activeTab === 'classroom' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Welcome Card */}
          <Card hover={false} className="p-6 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-4 relative overflow-hidden rounded-2xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none" />
            <div className="flex justify-between items-start gap-4 relative z-10">
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-primary uppercase tracking-wider font-mono bg-primary-soft dark:bg-primary-soft/10 px-2 py-0.5 rounded">
                  Course Home
                </span>
                <h3 className="text-xl font-black text-text-primary tracking-tight mt-2.5">{classroom.name}</h3>
                <p className="text-xs text-text-secondary leading-relaxed font-medium mt-1.5 max-w-xl">
                  {classroom.description || 'Welcome to this virtual lecture workstation. Access weekly lecture slides, check homework guidelines, and monitor your grade metrics.'}
                </p>
              </div>
              <Badge variant="success" className="shrink-0">Published</Badge>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Upcoming / To-Do List */}
            <Card hover={false} className="p-5 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-3.5">
              <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border/40 pb-2 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" /> To Do / Upcoming
              </h4>
              {assignments.filter(a => a.due_date && new Date(a.due_date).getTime() > Date.now()).length === 0 ? (
                <p className="text-xs text-text-tertiary font-medium">No upcoming tasks due.</p>
              ) : (
                <div className="space-y-3">
                  {assignments
                    .filter(a => a.due_date && new Date(a.due_date).getTime() > Date.now())
                    .slice(0, 3)
                    .map(a => (
                      <div 
                        key={a.id} 
                        onClick={() => {
                          setSelectedAssign(a);
                          setActiveTab('assignments');
                        }}
                        className="p-2.5 bg-background dark:bg-dark-bg border border-border rounded-xl flex items-center justify-between gap-3 text-xs cursor-pointer hover:border-primary/45 transition-all select-none"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-text-primary truncate">{a.title}</p>
                          <p className="text-[9px] text-text-tertiary font-medium mt-0.5">Due: {a.due_date ? new Date(a.due_date).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <span className="text-[9px] font-bold text-primary shrink-0 uppercase tracking-wider">Start</span>
                      </div>
                    ))
                  }
                </div>
              )}
            </Card>

            {/* Recent Feedback */}
            <Card hover={false} className="p-5 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-3.5">
              <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border/40 pb-2 flex items-center gap-1.5">
                <Award className="h-4 w-4 text-primary" /> Recent Feedback
              </h4>
              {classGrades.length === 0 ? (
                <p className="text-xs text-text-tertiary font-medium">No graded records posted yet.</p>
              ) : (
                <div className="space-y-3">
                  {classGrades.slice(0, 3).map(g => (
                    <div 
                      key={g.grade_id}
                      onClick={() => {
                        const assign = assignments.find(a => a.id === g.assignment_id);
                        if (assign) {
                          setSelectedAssign(assign);
                          setActiveTab('assignments');
                        }
                      }}
                      className="p-2.5 bg-background dark:bg-dark-bg border border-border rounded-xl flex items-center justify-between gap-3 text-xs cursor-pointer hover:border-primary/45 transition-all select-none"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-text-primary truncate">{g.assignment_title || 'Graded Work'}</p>
                        <p className="text-[9px] text-text-tertiary font-medium mt-0.5">Score: <span className="font-extrabold text-primary">{g.total_score} pts</span></p>
                      </div>
                      <span className="text-[9px] font-bold text-primary shrink-0 uppercase tracking-wider">View</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Course Outcomes Checklist */}
          <Card hover={false} className="p-5 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-3">
            <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border/40 pb-2">
              Course Checklist & Syllabus Guide
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed font-medium">
              To view the complete week-by-week textbook readings, lecture slides, video directories, and grading policy details, click the <strong className="text-primary font-bold hover:underline cursor-pointer" onClick={() => setActiveTab('syllabus')}>Syllabus & Modules</strong> tab at the top of the desk.
            </p>
          </Card>
        </div>
      )}

      {activeTab === 'assignments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left column (1 Col) - Assignments roster */}
        <div className="lg:col-span-1 space-y-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-text-primary">
            <ClipboardList className="h-5 w-5 text-primary" /> Assignments list
          </h3>

          {assignments.length === 0 ? (
            <Card hover={false} className="p-8 text-center border border-border bg-surface">
              <ClipboardList className="h-8 w-8 text-text-tertiary mx-auto mb-2" />
              <p className="text-xs text-text-secondary font-medium">No assignments published yet.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {assignments.map((assign) => {
                const isSelected = selectedAssign?.id === assign.id;
                const matchGrade = classGrades.find(g => g.assignment_id === assign.id);
                
                // Get submission status from localStorage fallback
                let localSubId = null;
                if (typeof window !== 'undefined') {
                  localSubId = localStorage.getItem(`submission_${user.id}_${assign.id}`);
                }

                return (
                  <button
                    key={assign.id}
                    onClick={() => handleSelectAssignment(assign)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all relative flex flex-col justify-between h-24 ${
                      isSelected 
                        ? 'border-primary bg-primary-soft/30 dark:bg-primary-soft/10 shadow-sm' 
                        : 'border-border bg-surface hover:bg-neutral-50 dark:hover:bg-dark-bg'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-text-primary text-xs truncate">{assign.title}</div>
                      <div className="text-[10px] text-text-tertiary mt-1.5 flex items-center gap-1 font-mono">
                        <Calendar className="h-3.5 w-3.5" /> Due: {assign.due_date ? new Date(assign.due_date).toLocaleDateString() : 'N/A'}
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      {matchGrade ? (
                        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-success-soft text-success border-success/20">
                          Score: {matchGrade.total_score} pts
                        </span>
                      ) : localSubId ? (
                        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-warning-soft text-warning border-warning/20">
                          Submitted
                        </span>
                      ) : (
                        <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border bg-neutral-100 text-text-secondary border-border">
                          Not Submitted
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column (2 Cols) - Assignment Workspace */}
        <div className="lg:col-span-2">
          {selectedAssign ? (
            <Card hover={false} className="p-6 sm:p-8 border border-border bg-surface shadow-sm space-y-6">
              
              {/* Assignment title & instructions */}
              <div className="space-y-3">
                <h2 className="text-xl font-extrabold text-text-primary tracking-tight">{selectedAssign.title}</h2>
                <div className="text-xs text-text-secondary leading-relaxed mt-2.5">
                  {renderAssignmentDescription(selectedAssign.description)}
                </div>
              </div>

              {/* Rubric Requirements */}
              <div className="border border-border rounded-xl p-4 bg-background/25 space-y-3">
                <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider flex items-center gap-1">
                  <Award className="h-3.5 w-3.5 text-primary" /> Rubric Requirements
                </h4>
                <div className="space-y-2">
                  {selectedAssign.rubric?.map((c, i) => (
                    <div key={i} className="flex justify-between items-center text-xs pb-1.5 border-b border-border/20 last:border-0 last:pb-0">
                      <span className="text-text-secondary font-medium">{c.criterion}</span>
                      <span className="font-bold text-primary font-mono">{c.max_points} pts</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Workspace Action States */}
              <div className="border-t border-border/60 pt-6 space-y-4">
                <h3 className="font-bold text-xs uppercase tracking-wider text-text-secondary">Submission Status</h3>

                {gradeRecord ? (
                  // STATE 1: Graded
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 bg-success-soft border border-success/20 text-success p-3 rounded-lg text-xs font-bold">
                      <CheckCircle2 className="h-4.5 w-4.5 shrink-0" />
                      <span>Graded on {new Date(gradeRecord.graded_at).toLocaleDateString()}</span>
                    </div>

                    <div className="bg-primary-soft/30 dark:bg-primary-soft/10 border border-primary-soft rounded-xl p-5 flex justify-between items-center gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Score Awarded</p>
                        <p className="text-3xl font-extrabold text-text-primary mt-1">{gradeRecord.total_score} points</p>
                        <p className="text-[10px] text-text-tertiary mt-0.5">out of {totalScoreMax} max points</p>
                      </div>

                      <div className="text-right">
                        <Badge variant={getScoreVariant(percentageGrade)} size="lg">
                          {letterGrade} ({percentageGrade}%)
                        </Badge>
                        <button
                          onClick={() => setIsRubricOpen(true)}
                          className="block text-[10px] font-extrabold text-primary hover:text-primary-hover hover:underline transition-colors mt-3 uppercase tracking-wider focus:outline-none"
                        >
                          Review Grade details
                        </button>
                      </div>
                    </div>

                    {gradeRecord.feedback && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Teacher Comments</p>
                        <p className="text-xs text-text-secondary italic bg-background/50 border border-border p-3.5 rounded-lg leading-relaxed">
                          &quot;{gradeRecord.feedback}&quot;
                        </p>
                      </div>
                    )}
                  </div>
                ) : submission ? (
                  // STATE 2: Submitted / Pending
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4 bg-warning-soft border border-warning/20 text-warning p-4 rounded-xl">
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <CheckCircle2 className="h-4.5 w-4.5 shrink-0 animate-pulse" />
                        <span>Work Submitted - Pending Teacher Assessment</span>
                      </div>
                      
                      <button
                        onClick={() => setShowSubmitModal(true)}
                        className="bg-warning hover:bg-warning-hover text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-warning/20 shrink-0"
                      >
                        Resubmit
                      </button>
                    </div>

                    <div className="space-y-3 bg-background/25 border border-border rounded-xl p-4">
                      <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Submitted Work Details</p>
                      {renderFileAttachment(submission.file_url)}
                      {submission.text_content && (
                        <div className="font-serif leading-relaxed text-xs text-text-secondary bg-background dark:bg-dark-bg p-3.5 border border-border rounded-lg whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {submission.text_content}
                        </div>
                      )}
                      <p className="text-[9px] text-text-tertiary pt-2 border-t border-border/20">
                        Received on {new Date(submission.submitted_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ) : (
                  // STATE 3: Not Submitted
                  <div className="space-y-4">
                    <p className="text-xs text-text-secondary leading-relaxed">
                      You haven&rsquo;t submitted work for this task yet. Press button below to paste in-line draft text or provide document urls.
                    </p>
                    <Button
                      onClick={() => setShowSubmitModal(true)}
                      variant="primary"
                      size="sm"
                      className="text-xs font-bold px-4 h-10 shadow-sm"
                    >
                      <Send className="h-4 w-4 mr-1.5" />
                      Start Submission
                    </Button>
                  </div>
                )}

              </div>
            </Card>
          ) : (
            <div className="space-y-6 animate-fadeIn">
              {/* Welcome Card */}
              <Card hover={false} className="p-6 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-4">
                <div className="flex justify-between items-start gap-4">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider font-mono bg-primary-soft dark:bg-primary-soft/10 px-2 py-0.5 rounded">
                      Active Classroom
                    </span>
                    <h3 className="text-base font-extrabold text-text-primary tracking-tight mt-2">{classroom.name}</h3>
                    <p className="text-xs text-text-secondary leading-relaxed font-medium mt-1.5">
                      Welcome to your learning workstation. Select an assignment from the list on the left to start your draft or view grading metrics. To read the complete week-by-week textbook readings and grading schedules, select the <strong className="text-primary font-bold hover:underline cursor-pointer" onClick={() => setActiveTab('syllabus')}>Syllabus & Modules</strong> tab.
                    </p>
                  </div>
                  <Badge variant="success" className="shrink-0">Published</Badge>
                </div>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Upcoming / To-Do List */}
                <Card hover={false} className="p-5 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-3.5">
                  <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border/40 pb-2 flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-primary" /> To Do / Upcoming
                  </h4>
                  {assignments.filter(a => a.due_date && new Date(a.due_date).getTime() > Date.now()).length === 0 ? (
                    <p className="text-xs text-text-tertiary font-medium">No upcoming tasks due.</p>
                  ) : (
                    <div className="space-y-3">
                      {assignments
                        .filter(a => a.due_date && new Date(a.due_date).getTime() > Date.now())
                        .slice(0, 3)
                        .map(a => (
                          <div 
                            key={a.id} 
                            onClick={() => setSelectedAssign(a)}
                            className="p-2.5 bg-background dark:bg-dark-bg border border-border rounded-xl flex items-center justify-between gap-3 text-xs cursor-pointer hover:border-primary/45 transition-all select-none"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-text-primary truncate">{a.title}</p>
                              <p className="text-[9px] text-text-tertiary font-medium mt-0.5">Due: {a.due_date ? new Date(a.due_date).toLocaleDateString() : 'N/A'}</p>
                            </div>
                            <span className="text-[9px] font-bold text-primary shrink-0 uppercase tracking-wider">Start</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </Card>

                {/* Recent Feedback */}
                <Card hover={false} className="p-5 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-3.5">
                  <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border/40 pb-2 flex items-center gap-1.5">
                    <Award className="h-4 w-4 text-primary" /> Recent Feedback
                  </h4>
                  {classGrades.length === 0 ? (
                    <p className="text-xs text-text-tertiary font-medium">No graded records posted yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {classGrades.slice(0, 3).map(g => (
                        <div 
                          key={g.grade_id}
                          onClick={() => {
                            const assign = assignments.find(a => a.id === g.assignment_id);
                            if (assign) setSelectedAssign(assign);
                          }}
                          className="p-2.5 bg-background dark:bg-dark-bg border border-border rounded-xl flex items-center justify-between gap-3 text-xs cursor-pointer hover:border-primary/45 transition-all select-none"
                        >
                          <div className="min-w-0">
                            <p className="font-bold text-text-primary truncate">{g.assignment_title || 'Graded Work'}</p>
                            <p className="text-[9px] text-text-tertiary font-medium mt-0.5">Score: <span className="font-extrabold text-primary">{g.total_score} pts</span></p>
                          </div>
                          <span className="text-[9px] font-bold text-primary shrink-0 uppercase tracking-wider">View</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* Course Outcomes Checklist */}
              <Card hover={false} className="p-5 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-3">
                <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border/40 pb-2">
                  Course Checklist & Syllabus Guide
                </h4>
                <p className="text-xs text-text-secondary leading-relaxed font-medium">
                  To view the complete week-by-week textbook readings, lecture slides, video directories, and grading policy details, click the <strong className="text-primary font-bold">Syllabus & Modules</strong> tab at the top of the desk.
                </p>
              </Card>
            </div>
          )}
        </div>

      </div>
      )}

      {activeTab === 'syllabus' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start animate-fadeIn">
          {/* Left Column (2 Cols) - Syllabus Overview & Weeks */}
          <div className="lg:col-span-2 space-y-6">
            {/* Course Overview Block */}
            <Card hover={false} className="p-6 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-3">
              <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Course Overview</h4>
              <p className="text-xs text-text-secondary leading-relaxed font-medium whitespace-pre-wrap">
                {classroom.syllabus_overview || 'Your instructor hasn’t posted a course overview yet.'}
              </p>
            </Card>

            {/* Weekly Syllabus & Modules */}
            <div className="space-y-4">
              <h3 className="text-base font-extrabold text-text-primary tracking-tight flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" /> Weekly Syllabus & Modules
              </h3>

              <SyllabusWeekAccordion
                weeks={syllabusWeeks}
                expandedWeek={expandedWeek}
                onToggle={(weekNum) => setExpandedWeek(expandedWeek === weekNum ? null : weekNum)}
                assignmentTitleById={Object.fromEntries(assignments.map(a => [a.id, a.title]))}
              />
            </div>
          </div>

          {/* Right Column (1 Col) - Course Status Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <Card hover={false} className="p-5 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-3">
              <h4 className="text-[10px] font-bold text-text-secondary uppercase tracking-wider border-b border-border/40 pb-2">
                Course Status
              </h4>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-text-secondary">LMS Status:</span>
                <Badge variant="success">Published</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-text-secondary">Instructor:</span>
                <span className="font-bold text-text-primary truncate">{classroom.teacher_name || 'Unassigned'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-text-secondary">Course Code:</span>
                <span className="font-bold text-text-primary font-mono">{classroom.code}</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'announcements' && (
        <div className="space-y-6 animate-fadeIn">
          <Card hover={false} className="p-6 border border-border bg-surface dark:bg-dark-surface shadow-sm">
            <h3 className="text-base font-extrabold text-text-primary tracking-tight mb-2">Class Announcements</h3>
            <p className="text-xs text-text-secondary leading-relaxed font-medium">
              Stay updated with the latest notifications, details, and schedules posted by your instructor.
            </p>
          </Card>

          {announcements.length === 0 ? (
            <Card hover={false} className="p-12 text-center border border-border bg-surface dark:bg-dark-surface shadow-sm">
              <Volume2 className="h-10 w-10 text-text-tertiary mx-auto mb-2" />
              <p className="text-xs text-text-secondary font-medium">No announcements have been posted for this course yet.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {announcements.map((ann) => (
                <Card key={ann.id} hover={false} className="p-6 border border-border bg-surface dark:bg-dark-surface shadow-sm space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h4 className="text-sm font-extrabold text-text-primary">{ann.title}</h4>
                      <p className="text-[10px] text-text-tertiary mt-0.5">
                        Posted by <span className="font-bold text-primary">{ann.author_name}</span> on {new Date(ann.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-wrap pt-3 border-t border-border/40 font-medium">
                    {ann.content}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SUBMIT WORK MODAL — Premium */}
      <Dialog.Root open={showSubmitModal} onOpenChange={setShowSubmitModal}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none overflow-hidden border border-border/60 dark:border-dark-border/60">

            <div className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/70 to-primary/10" />

            <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-primary/10 via-primary/3 to-transparent border-b border-border/60 dark:border-dark-border/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                    <Send className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none">Submit Assignment</Dialog.Title>
                    <Dialog.Description className="text-[11px] text-text-tertiary mt-1 font-medium">Upload your work or submit a written response.</Dialog.Description>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg focus:outline-none cursor-pointer mt-0.5">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <div className="px-6 py-5">
              {selectedAssign && (
                <SubmissionForm
                  assignmentId={selectedAssign.id}
                  classId={classId}
                  onSuccess={(sub) => {
                    setShowSubmitModal(false);
                    setSubmission(sub as Submission);
                    loadClassData();
                  }}
                />
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* GRADE DETAILS SIDE SHEET — Premium */}
      <Dialog.Root open={isRubricOpen} onOpenChange={setIsRubricOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-45 animate-fadeIn" />
          <Dialog.Content className="fixed top-0 right-0 h-screen w-full sm:w-[440px] bg-surface dark:bg-dark-surface border-l border-border dark:border-dark-border shadow-2xl z-50 animate-slideInRight flex flex-col focus:outline-none overflow-hidden">

            {/* Header */}
            <div className="h-[3px] w-full bg-gradient-to-r from-info via-info/70 to-info/10 shrink-0" />
            <div className="flex items-center justify-between px-6 py-5 border-b border-border/60 dark:border-dark-border/50 bg-gradient-to-r from-info/8 to-transparent shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-info flex items-center justify-center shadow-md shadow-info/30">
                  <Award className="h-4.5 w-4.5 text-white" />
                </div>
                <div>
                  <Dialog.Title className="text-sm font-extrabold text-text-primary">Grade Breakdown</Dialog.Title>
                  <Dialog.Description className="text-[10px] text-text-tertiary font-medium mt-0.5">Scored criteria and feedback</Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="p-2 text-text-tertiary hover:text-text-primary hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg transition-colors focus:outline-none">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {gradeRecord && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Teacher Comments</h4>
                    <p className="text-xs text-text-secondary italic bg-primary-soft/30 dark:bg-primary/10 border border-primary-soft p-3.5 rounded-xl leading-relaxed mt-1.5">
                      &quot;{gradeRecord.feedback || 'No comments provided.'}&quot;
                    </p>
                  </div>

                  <div className="border border-border/60 rounded-xl p-4 bg-background/30 dark:bg-dark-bg/30 space-y-3">
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider border-b border-border/40 pb-2">Scored Criteria</h4>
                    {Array.isArray(gradeRecord.rubric_scores) ? (
                      (gradeRecord.rubric_scores as Array<{ criterion: string; score: number }>).map((score, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs pb-1.5 border-b border-border/20 last:border-0 last:pb-0">
                          <span className="text-text-secondary font-medium">{score.criterion}</span>
                          <span className="font-bold text-primary">{score.score} pts</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-text-tertiary">No itemized points recorded.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky footer */}
            {gradeRecord && (
              <div className="shrink-0 border-t border-border/60 dark:border-dark-border/50 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Total Score</p>
                  <p className="text-2xl font-black text-primary mt-1">{gradeRecord.total_score} <span className="text-sm text-text-tertiary font-semibold">/ {totalScoreMax} pts</span></p>
                </div>
                <Badge variant={getScoreVariant(percentageGrade)} size="lg">
                  {letterGrade} · {percentageGrade}%
                </Badge>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
