'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../DashboardLayoutContext';
import { apiCall } from '@/lib/api';
import { Plus, Calendar, FileText, Users, Award, BookOpen, ChevronRight, Copy, Trash2, X, ClipboardList, Pencil, Volume2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import Toast, { type ToastMessage } from '@/components/Toast';
import * as Dialog from '@radix-ui/react-dialog';
import { SyllabusWeekForm, type SyllabusWeekValues } from '@/components/SyllabusWeekForm';
import { AnnouncementForm, type AnnouncementValues } from '@/components/AnnouncementForm';
import { SyllabusWeekAccordion, type SyllabusWeek } from '@/components/SyllabusWeekAccordion';

interface Classroom {
  id: string;
  name: string;
  description: string | null;
  code: string;
  syllabus_overview: string | null;
}

interface ClassAnnouncement {
  id: string;
  title: string;
  content: string;
  created_at: string;
  author_name: string;
}

interface Student {
  student_id: string;
  name: string;
  email: string;
}

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  rubric: Array<{ criterion: string; max_points: number }>;
  gradedCount?: number;
  totalSubmissions?: number;
}

interface Submission {
  id: string;
  assignment_id: string;
  assignment_title: string;
  student_name: string;
  submitted_at: string;
}

interface GradeRecord {
  grade_id: string;
  submission_id: string;
  assignment_id: string;
  student_id: string;
  total_score: number;
  feedback: string | null;
  student_name: string;
  student_email: string;
  assignment_title: string;
  rubric_scores?: Record<string, number>;
  max_score?: number;
}

const scoreVariantClassNames = {
  success: 'bg-success-soft text-success border-success/20',
  info: 'bg-info-soft text-info border-info/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
};

export default function TeacherClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const classId = params.id as string;
  const { user } = useAuth();
  const { setTitle, setBreadcrumbs, setAction } = useDashboardLayout();

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [classGrades, setClassGrades] = useState<GradeRecord[]>([]);
  const [classAverage, setClassAverage] = useState('N/A');
  const [syllabusWeeks, setSyllabusWeeks] = useState<SyllabusWeek[]>([]);
  const [announcements, setAnnouncements] = useState<ClassAnnouncement[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const [activeRightTab, setActiveRightTab] = useState<'roster' | 'grades' | 'syllabus' | 'announcements'>('roster');
  const [expandedWeek, setExpandedWeek] = useState<number | null>(1);
  const [isDescCollapsed, setIsDescCollapsed] = useState(true);

  // Class info inline editor (name/description)
  const [isEditingClassInfo, setIsEditingClassInfo] = useState(false);
  const [editClassName, setEditClassName] = useState('');
  const [editClassDescription, setEditClassDescription] = useState('');
  const [classInfoSaving, setClassInfoSaving] = useState(false);

  // Syllabus week form (create/edit)
  const [isWeekFormOpen, setIsWeekFormOpen] = useState(false);
  const [editingWeek, setEditingWeek] = useState<SyllabusWeek | null>(null);
  const [weekSubmitting, setWeekSubmitting] = useState(false);

  // Announcement form (create/edit)
  const [isAnnouncementFormOpen, setIsAnnouncementFormOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<ClassAnnouncement | null>(null);
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false);

  // Course overview inline editor
  const [isEditingOverview, setIsEditingOverview] = useState(false);
  const [overviewDraft, setOverviewDraft] = useState('');
  const [overviewSaving, setOverviewSaving] = useState(false);

  // Selected Grade detail for Radix side sheet
  const [selectedGrade, setSelectedGrade] = useState<GradeRecord | null>(null);

  // Modal State for new assignment
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Assignment Form State
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDesc, setAssignDesc] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [rubricRows, setRubricRows] = useState<Array<{ criterion: string; max_points: number }>>([
    { criterion: 'Completeness', max_points: 50 },
    { criterion: 'Accuracy', max_points: 50 },
  ]);

  // Set Topbar info
  useEffect(() => {
    if (classroom) {
      setTitle(classroom.name);
      setBreadcrumbs([
        { label: 'Teacher Desk', href: '/dashboard' },
        { label: classroom.name }
      ]);
    }
  }, [classroom, setTitle, setBreadcrumbs]);

  // Set Topbar contextual action — only once the classroom has actually
  // loaded; otherwise this button is left dangling on an error/not-found
  // state (e.g. another teacher's class) with nothing valid to act on.
  useEffect(() => {
    if (!classroom) {
      setAction(null);
      return;
    }
    setAction(
      <Button
        onClick={() => setIsModalOpen(true)}
        variant="primary"
        size="sm"
        className="text-xs font-semibold px-4 h-9 shadow-sm"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        Add Assignment
      </Button>
    );
    return () => setAction(null);
  }, [setAction, classroom]);

  const loadClassWorkspace = useCallback(async () => {
    try {
      const classInfo = await apiCall(`/api/classes/${classId}`);
      setClassroom(classInfo);

      const roster = await apiCall(`/api/classes/${classId}/students`);
      setStudents(roster);

      const assignList = await apiCall(`/api/classes/${classId}/assignments`);
      
      const gradesList = await apiCall(`/api/classes/${classId}/grades`).catch(() => []);

      // Fetch submissions for all assignments in parallel to calculate progress
      const enrichedAssignments = await Promise.all(
        (assignList as Assignment[]).map(async (assign: Assignment) => {
          try {
            const subs: Array<{ status: string }> = await apiCall(`/api/assignments/${assign.id}/submissions`).catch(() => []);
            const graded = subs.filter((s) => s.status === 'graded').length;
            return {
              ...assign,
              gradedCount: graded,
              totalSubmissions: subs.length
            };
          } catch {
            return { ...assign, gradedCount: 0, totalSubmissions: 0 };
          }
        })
      );
      setAssignments(enrichedAssignments);

      // Parse grade rubrics and add max scores
      const enrichedGrades = (gradesList as GradeRecord[]).map((grade: GradeRecord) => {
        const assign = (assignList as Assignment[]).find((a: Assignment) => a.id === grade.assignment_id);
        let max_score = 100;
        if (assign) {
          const rubric = typeof assign.rubric === 'string' ? JSON.parse(assign.rubric) : assign.rubric;
          /* v8 ignore next -- assignment rubrics are arrays after parsing */
          max_score = Array.isArray(rubric) ? rubric.reduce((sum, r) => sum + r.max_points, 0) : 100;
        }
        return {
          ...grade,
          max_score,
          rubric_scores: typeof grade.rubric_scores === 'string' ? JSON.parse(grade.rubric_scores) : grade.rubric_scores
        };
      });
      setClassGrades(enrichedGrades);

      // Compute class average percentage score
      if (enrichedGrades.length > 0) {
        let totalEarned = 0;
        let totalMax = 0;
        for (const g of enrichedGrades) {
          totalEarned += Number(g.total_score);
          totalMax += g.max_score as number;
        }
        if (totalMax > 0) {
          setClassAverage(`${Math.round((totalEarned / totalMax) * 100)}%`);
        }
      } else {
        setClassAverage('N/A');
      }

      // No endpoint returns "pending submissions for this class" directly,
      // so aggregate per-assignment submissions client-side instead.
      const submissionsPromises = (assignList as Assignment[]).map((assign: Assignment) =>
        apiCall(`/api/assignments/${assign.id}/submissions`)
          .then((subs: Array<{ id: string; status: string; student_name?: string; submitted_at: string }>) => {
            return subs
              .filter((s) => s.status === 'submitted')
              .map((s) => ({
                id: s.id,
                assignment_id: assign.id,
                assignment_title: assign.title,
                student_name: s.student_name || 'Student',
                submitted_at: s.submitted_at,
              }));
          })
          .catch(() => [])
      );
      const subLists = await Promise.all(submissionsPromises);
      setSubmissions(subLists.flat());

      const weeks = await apiCall(`/api/classes/${classId}/syllabus-weeks`).catch(() => []);
      setSyllabusWeeks(weeks);

      const announcementList = await apiCall(`/api/classes/${classId}/announcements`).catch(() => []);
      setAnnouncements(announcementList);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load classroom details');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    if (classId) {
      loadClassWorkspace();
    }
  }, [classId, loadClassWorkspace]);

  const handleCreateAssignment = async () => {
    if (!assignTitle.trim()) {
      setToast({ id: 'val', type: 'error', text: 'Assignment title is required' });
      return;
    }

    if (rubricRows.some(r => !r.criterion.trim() || r.max_points <= 0)) {
      setToast({ id: 'val', type: 'error', text: 'Rubric criteria names must be valid, and max points must be positive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiCall(`/api/classes/${classId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({
          title: assignTitle,
          description: assignDesc || null,
          due_date: assignDueDate || null,
          rubric: rubricRows,
        }),
      });

      setAssignments(prev => [...prev, { ...data, gradedCount: 0, totalSubmissions: 0 }]);
      setToast({ id: 'success', type: 'success', text: 'Assignment created successfully!' });
      setIsModalOpen(false);
      setAssignTitle('');
      setAssignDesc('');
      setAssignDueDate('');
      setRubricRows([
        { criterion: 'Completeness', max_points: 50 },
        { criterion: 'Accuracy', max_points: 50 },
      ]);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to create assignment' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addRubricRow = () => {
    setRubricRows(prev => [...prev, { criterion: '', max_points: 10 }]);
  };

  const updateRubricRow = (idx: number, field: 'criterion' | 'max_points', value: string | number) => {
    setRubricRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const removeRubricRow = (idx: number) => {
    /* v8 ignore next -- the last row's remove button is disabled in the UI */
    if (rubricRows.length === 1) return;
    setRubricRows(prev => prev.filter((_, i) => i !== idx));
  };

  const copyCode = () => {
    if (classroom) {
      navigator.clipboard.writeText(classroom.code);
      setToast({
        id: Math.random().toString(),
        type: 'success',
        text: 'Enrollment code copied to clipboard'
      });
    }
  };

  const handleSaveWeek = async (values: SyllabusWeekValues) => {
    setWeekSubmitting(true);
    try {
      if (editingWeek) {
        const updated = await apiCall(`/api/syllabus-weeks/${editingWeek.id}`, {
          method: 'PUT',
          body: JSON.stringify(values),
        });
        setSyllabusWeeks(prev => prev.map(w => w.id === updated.id ? updated : w));
        setToast({ id: 'success', type: 'success', text: 'Week updated successfully!' });
      } else {
        const created = await apiCall(`/api/classes/${classId}/syllabus-weeks`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
        setSyllabusWeeks(prev => [...prev, created].sort((a, b) => a.week_number - b.week_number));
        setToast({ id: 'success', type: 'success', text: 'Week added successfully!' });
      }
      setIsWeekFormOpen(false);
      setEditingWeek(null);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to save week' });
    } finally {
      setWeekSubmitting(false);
    }
  };

  const handleDeleteWeek = async (week: SyllabusWeek) => {
    if (!confirm(`Delete "W${week.week_number}: ${week.title}"?`)) return;
    try {
      await apiCall(`/api/syllabus-weeks/${week.id}`, { method: 'DELETE' });
      setSyllabusWeeks(prev => prev.filter(w => w.id !== week.id));
      setToast({ id: 'success', type: 'success', text: 'Week deleted.' });
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to delete week' });
    }
  };

  const handleSaveAnnouncement = async (values: AnnouncementValues) => {
    setAnnouncementSubmitting(true);
    try {
      if (editingAnnouncement) {
        const updated = await apiCall(`/api/announcements/${editingAnnouncement.id}`, {
          method: 'PUT',
          body: JSON.stringify(values),
        });
        setAnnouncements(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
        setToast({ id: 'success', type: 'success', text: 'Announcement updated!' });
      } else {
        const created = await apiCall(`/api/classes/${classId}/announcements`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
        setAnnouncements(prev => [{ ...created, author_name: user?.name || 'You' }, ...prev]);
        setToast({ id: 'success', type: 'success', text: 'Announcement posted!' });
      }
      setIsAnnouncementFormOpen(false);
      setEditingAnnouncement(null);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to save announcement' });
    } finally {
      setAnnouncementSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = async (announcement: ClassAnnouncement) => {
    if (!confirm(`Delete announcement "${announcement.title}"?`)) return;
    try {
      await apiCall(`/api/announcements/${announcement.id}`, { method: 'DELETE' });
      setAnnouncements(prev => prev.filter(a => a.id !== announcement.id));
      setToast({ id: 'success', type: 'success', text: 'Announcement deleted.' });
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to delete announcement' });
    }
  };

  const handleSaveOverview = async () => {
    setOverviewSaving(true);
    try {
      const updated = await apiCall(`/api/classes/${classId}/syllabus-overview`, {
        method: 'PUT',
        body: JSON.stringify({ syllabus_overview: overviewDraft.trim() || null }),
      });
      /* v8 ignore next -- overview controls are only rendered after classroom is loaded */
      setClassroom(prev => prev ? { ...prev, syllabus_overview: updated.syllabus_overview } : prev);
      setIsEditingOverview(false);
      setToast({ id: 'success', type: 'success', text: 'Course overview saved!' });
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to save overview' });
    } finally {
      setOverviewSaving(false);
    }
  };

  const handleSaveClassInfo = async () => {
    if (!editClassName.trim()) {
      setToast({ id: 'err', type: 'error', text: 'Class name is required' });
      return;
    }
    setClassInfoSaving(true);
    try {
      const updated = await apiCall(`/api/classes/${classId}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editClassName.trim(),
          description: editClassDescription.trim() || null,
        }),
      });
      /* v8 ignore next -- class-info controls are only rendered after classroom is loaded */
      setClassroom(prev => prev ? { ...prev, name: updated.name, description: updated.description } : prev);
      setIsEditingClassInfo(false);
      setToast({ id: 'success', type: 'success', text: 'Class details updated!' });
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to update class' });
    } finally {
      setClassInfoSaving(false);
    }
  };

  const handleRemoveStudent = async (studentId: string, name: string) => {
    if (!confirm(`Remove ${name} from this class?`)) return;
    try {
      await apiCall(`/api/classes/${classId}/students/${studentId}`, {
        method: 'DELETE',
      });
      setStudents(prev => prev.filter(s => s.student_id !== studentId));
      setToast({
        id: Math.random().toString(),
        type: 'success',
        text: `${name} has been removed from the class.`
      });
    } catch (err) {
      console.error(err);
      setToast({
        id: Math.random().toString(),
        type: 'error',
        text: `Error: Could not remove ${name} from class.`
      });
    }
  };

  const isDueSoon = (dueDate: string | null) => {
    if (!dueDate) return false;
    const diff = new Date(dueDate).getTime() - Date.now();
    return diff > 0 && diff < 72 * 60 * 60 * 1000;
  };

  const getScoreVariant = (score: number, max: number) => {
    const pct = (score / max) * 100;
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
    <div className="space-y-8 animate-fadeIn">
      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/25 p-4 text-sm text-danger animate-fadeIn">
          {error}
        </div>
      )}

      {/* Classroom Header Card */}
      <Card hover={false} className="p-6 border border-border bg-surface shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="space-y-2 max-w-xl flex-1">
            {isEditingClassInfo ? (
              <div className="space-y-3">
                <input
                  value={editClassName}
                  onChange={(e) => setEditClassName(e.target.value)}
                  className="w-full text-xl font-extrabold text-text-primary tracking-tight bg-background dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-1.5 focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none"
                  placeholder="Class name"
                />
                <textarea
                  value={editClassDescription}
                  onChange={(e) => setEditClassDescription(e.target.value)}
                  className="w-full text-xs text-text-secondary bg-background dark:bg-dark-bg border border-border dark:border-dark-border rounded-lg px-3 py-2 h-20 resize-none focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none"
                  placeholder="Class description"
                />
                <div className="flex gap-2">
                  <Button onClick={handleSaveClassInfo} loading={classInfoSaving} className="h-8 px-3 text-[11px] font-bold">
                    Save
                  </Button>
                  <button
                    type="button"
                    onClick={() => setIsEditingClassInfo(false)}
                    className="h-8 px-3 rounded-lg border border-border dark:border-dark-border text-[11px] font-bold text-text-secondary hover:bg-background dark:hover:bg-dark-bg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">{classroom.name}</h1>
                  <button
                    type="button"
                    onClick={() => {
                      setEditClassName(classroom.name);
                      setEditClassDescription(classroom.description || '');
                      setIsEditingClassInfo(true);
                    }}
                    className="p-1.5 rounded-lg text-text-tertiary hover:text-primary hover:bg-primary-soft transition-colors shrink-0"
                    title="Edit class details"
                    aria-label="Edit class details"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>

                {/* Description Clamper */}
                <div className="text-xs text-text-secondary leading-relaxed">
                  <p className={isDescCollapsed ? 'line-clamp-2' : ''}>
                    {classroom.description || 'No classroom description provided.'}
                  </p>
                  {classroom.description && classroom.description.length > 120 && (
                    <button
                      onClick={() => setIsDescCollapsed(!isDescCollapsed)}
                      className="text-primary hover:underline font-bold mt-1 inline-block focus:outline-none"
                    >
                      {isDescCollapsed ? 'Read more' : 'Read less'}
                    </button>
                  )}
                </div>
              </>
            )}

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <span 
                onClick={copyCode}
                className="text-[10px] font-bold font-mono bg-background hover:bg-primary-soft hover:text-primary border border-border px-2 py-1 rounded flex items-center gap-1 transition-colors cursor-pointer"
                title="Click to copy enrollment code"
              >
                Code: {classroom.code}
                <Copy className="h-3 w-3 text-text-tertiary" />
              </span>
              <span className="text-[11px] text-text-secondary font-medium flex items-center gap-1">
                <Users className="h-4 w-4 text-text-tertiary" /> {students.length} students enrolled
              </span>
              <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                classAverage === 'N/A' ? 'bg-neutral-100 text-text-secondary border-border' :
                parseInt(classAverage) >= 90 ? 'bg-success-soft text-success border-success/20' :
                parseInt(classAverage) >= 80 ? 'bg-info-soft text-info border-info/20' :
                parseInt(classAverage) >= 70 ? 'bg-warning-soft text-warning border-warning/20' :
                'bg-danger-soft text-danger border-danger/20'
              }`}>
                Average: {classAverage}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* Left Columns (2 Cols) - Assignments & Pending */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Assignments list */}
          <div className="space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2 text-text-primary">
              <BookOpen className="h-5 w-5 text-primary" /> Class Assignments
            </h2>

            {assignments.length === 0 ? (
              <Card hover={false} className="p-8 text-center border border-border bg-surface max-w-md mx-auto">
                <ClipboardList className="h-8 w-8 text-text-tertiary mx-auto mb-3" />
                <h3 className="text-xs font-bold text-text-primary">No Assignments</h3>
                <p className="text-[11px] text-text-secondary mt-0.5">Publish an assignment rubric to register student work.</p>
                <Button
                  onClick={() => setIsModalOpen(true)}
                  variant="primary"
                  size="sm"
                  className="mt-4 text-xs"
                >
                  Add Assignment
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {assignments.map(assign => {
                  const urgent = isDueSoon(assign.due_date);
                  const progress = students.length > 0 
                    ? Math.round(((assign.gradedCount || 0) / students.length) * 100)
                    : 0;

                  return (
                    <Card 
                      key={assign.id}
                      onClick={() => router.push(`/dashboard/teacher/assignments/${assign.id}`)}
                      className="p-5 border border-border bg-surface flex items-center justify-between hover:shadow-sm hover:border-primary/20 transition-all cursor-pointer group"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <h3 className="font-bold text-text-primary text-sm group-hover:text-primary transition-colors truncate">
                          {assign.title}
                        </h3>
                        <p className="text-[11px] text-text-secondary mt-1 truncate">
                          {assign.description || 'No description provided.'}
                        </p>
                        
                        <div className="flex flex-wrap items-center gap-4 mt-3">
                          {assign.due_date && (
                            <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                              urgent 
                                ? 'bg-danger-soft text-danger border-danger/20 animate-pulse' 
                                : 'bg-background text-text-secondary border-border'
                            }`}>
                              Due: {new Date(assign.due_date).toLocaleDateString()}
                            </span>
                          )}
                          
                          {/* Mini Progress Bar */}
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-text-secondary font-bold whitespace-nowrap">
                              {assign.gradedCount || 0} / {students.length} graded
                            </span>
                            <div className="w-16 h-1.5 bg-border/60 dark:bg-dark-border/40 rounded-full overflow-hidden shrink-0">
                              <div 
                                className="h-full bg-primary rounded-full transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`Are you sure you want to delete assignment "${assign.title}"? This will delete all submissions and grades.`)) {
                              try {
                                await apiCall(`/api/assignments/${assign.id}`, { method: 'DELETE' });
                                setAssignments(prev => prev.filter(a => a.id !== assign.id));
                                setToast({ id: Math.random().toString(), type: 'success', text: `Assignment "${assign.title}" deleted successfully.` });
                              } catch {
                                setToast({ id: Math.random().toString(), type: 'error', text: `Failed to delete assignment "${assign.title}".` });
                              }
                            }
                          }}
                          className="p-1.5 rounded text-text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                          title="Delete Assignment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <ChevronRight className="h-5 w-5 text-text-tertiary group-hover:translate-x-1 transition-transform shrink-0" />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pending Submissions */}
          <div className="space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2 text-text-primary">
              <FileText className="h-5 w-5 text-primary" /> Pending Submissions
            </h2>

            {submissions.length === 0 ? (
              <Card hover={false} className="p-8 text-center border border-border bg-surface max-w-md mx-auto">
                <div className="w-8 h-8 rounded-full bg-success-soft text-success border border-success/15 flex items-center justify-center mx-auto mb-3 font-bold">
                  ✓
                </div>
                <h4 className="text-xs font-bold text-text-primary">All caught up</h4>
                <p className="text-[11px] text-text-secondary mt-0.5">All student submissions for this class have been graded.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {submissions.map((sub) => (
                  <div 
                    key={sub.id}
                    className="border border-border rounded-xl p-4 hover:border-primary/20 transition-all bg-surface flex items-start justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="warning" size="sm">Needs grading</Badge>
                        <span className="text-[9px] text-text-tertiary font-mono">
                          {new Date(sub.submitted_at).toLocaleDateString()}
                        </span>
                      </div>
                      <h4 className="font-bold text-text-primary text-xs mt-2">
                        {sub.student_name}
                      </h4>
                      <p className="text-[10px] text-text-secondary mt-0.5">
                        Assignment: <strong>{sub.assignment_title}</strong>
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

        </div>

        {/* Right Column (1 Col) - Class Ledger */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-base font-bold flex items-center gap-2 text-text-primary">
            <Users className="h-5 w-5 text-primary" /> Class Ledger
          </h2>
          <Card hover={false} className="p-0 border border-border bg-surface overflow-hidden shadow-sm">
            {/* Ledger Tabs */}
            <div className="flex border-b border-border bg-background/30 px-2 overflow-x-auto shrink-0">
              <button
                onClick={() => setActiveRightTab('roster')}
                className={`py-3 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all -mb-[1px] shrink-0 ${
                  activeRightTab === 'roster' 
                    ? 'border-primary text-primary font-extrabold' 
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                Roster ({students.length})
              </button>
              <button
                onClick={() => setActiveRightTab('grades')}
                className={`py-3 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all -mb-[1px] shrink-0 ${
                  activeRightTab === 'grades' 
                    ? 'border-primary text-primary font-extrabold' 
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                Gradebook ({classGrades.length})
              </button>
              <button
                onClick={() => setActiveRightTab('syllabus')}
                className={`py-3 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all -mb-[1px] shrink-0 ${
                  activeRightTab === 'syllabus' 
                    ? 'border-primary text-primary font-extrabold' 
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                Syllabus
              </button>
              <button
                onClick={() => setActiveRightTab('announcements')}
                className={`py-3 px-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all -mb-[1px] shrink-0 ${
                  activeRightTab === 'announcements' 
                    ? 'border-primary text-primary font-extrabold' 
                    : 'border-transparent text-text-tertiary hover:text-text-secondary'
                }`}
              >
                Announcements
              </button>
            </div>

            <div className="p-4 max-h-[500px] overflow-y-auto">
              {activeRightTab === 'roster' && (
                students.length === 0 ? (
                  <p className="text-xs text-text-secondary text-center py-4">No enrolled students.</p>
                ) : (
                  <div className="divide-y divide-border/40 space-y-2.5">
                    {students.map(student => (
                      <div key={student.student_id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-4 group">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-text-primary truncate">{student.name}</p>
                          <p className="text-[10px] text-text-tertiary font-mono truncate mt-0.5">{student.email}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveStudent(student.student_id, student.name)}
                          className="p-1.5 text-text-tertiary hover:text-danger hover:bg-danger-soft rounded-lg transition-all focus:outline-none shrink-0"
                          title="Remove student from class"
                          aria-label={`Remove ${student.name} from class`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              )}

              {activeRightTab === 'grades' && (
                classGrades.length === 0 ? (
                  <p className="text-xs text-text-secondary text-center py-4">No graded records.</p>
                ) : (
                  <div className="divide-y divide-border/45 space-y-3">
                    {classGrades.map((grade) => {
                      const scoreVariant = getScoreVariant(grade.total_score, grade.max_score as number);
                      return (
                        <div 
                          key={grade.grade_id} 
                          onClick={() => setSelectedGrade(grade)}
                          className="py-2.5 first:pt-0 last:pb-0 space-y-1.5 cursor-pointer hover:bg-neutral-50/50 dark:hover:bg-slate-800/10 rounded-lg p-2 -mx-2 transition-colors"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-text-primary truncate">{grade.student_name}</p>
                              <p className="text-[10px] text-text-tertiary truncate mt-0.5">{grade.assignment_title}</p>
                            </div>
                            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                              scoreVariant === 'success' ? 'bg-success-soft text-success border-success/20' :
                              scoreVariant === 'info' ? 'bg-info-soft text-info border-info/20' :
                              scoreVariant === 'warning' ? 'bg-warning-soft text-warning border-warning/20' :
                              'bg-danger-soft text-danger border-danger/20'
                            }`}>
                              {grade.total_score} pts
                            </span>
                          </div>
                          {grade.feedback && (
                            <p className="text-[10px] text-text-secondary italic truncate pl-1.5 border-l border-border-strong max-w-[200px]">
                              &quot;{grade.feedback}&quot;
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {activeRightTab === 'syllabus' && (
                <div className="space-y-3.5">
                  {/* Course overview block */}
                  <div className="p-3 bg-neutral-50 dark:bg-dark-bg/25 border border-border/80 rounded-xl space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[9px] font-extrabold text-text-tertiary uppercase tracking-wider">Course Overview</p>
                      {!isEditingOverview && (
                        <button
                          type="button"
                          onClick={() => {
                            setOverviewDraft(classroom.syllabus_overview || '');
                            setIsEditingOverview(true);
                          }}
                          className="p-1 rounded-lg text-text-tertiary hover:text-primary hover:bg-primary-soft transition-colors"
                          title="Edit overview"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {isEditingOverview ? (
                      <div className="space-y-2">
                        <textarea
                          value={overviewDraft}
                          onChange={(e) => setOverviewDraft(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-xs text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all resize-none h-24 leading-relaxed"
                          placeholder="Textbook, grading policy, late policy, academic honesty notes..."
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setIsEditingOverview(false)}
                            className="h-7 px-3 rounded-lg border border-border dark:border-dark-border text-[10px] font-bold text-text-secondary hover:bg-background dark:hover:bg-dark-bg transition-colors"
                          >
                            Cancel
                          </button>
                          <Button onClick={handleSaveOverview} loading={overviewSaving} className="h-7 px-3 text-[10px] font-bold">
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-medium text-text-primary leading-relaxed whitespace-pre-wrap">
                        {classroom.syllabus_overview || 'No course overview added yet.'}
                      </p>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setEditingWeek(null); setIsWeekFormOpen(true); }}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-white text-[10px] font-bold hover:bg-primary/90 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Week
                    </button>
                  </div>

                  <SyllabusWeekAccordion
                    weeks={syllabusWeeks}
                    expandedWeek={expandedWeek}
                    onToggle={
                      /* v8 ignore next -- expand/collapse behavior is covered by SyllabusWeekAccordion tests */
                      (weekNum) => setExpandedWeek(expandedWeek === weekNum ? null : weekNum)
                    }
                    assignmentTitleById={Object.fromEntries(assignments.map(a => [a.id, a.title]))}
                    teacherMode
                    onEdit={(week) => { setEditingWeek(week); setIsWeekFormOpen(true); }}
                    onDelete={handleDeleteWeek}
                  />
                </div>
              )}

              {activeRightTab === 'announcements' && (
                <div className="space-y-3.5">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setEditingAnnouncement(null); setIsAnnouncementFormOpen(true); }}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-white text-[10px] font-bold hover:bg-primary/90 transition-colors"
                    >
                      <Volume2 className="h-3.5 w-3.5" /> Post Announcement
                    </button>
                  </div>

                  {announcements.length === 0 ? (
                    <p className="text-xs text-text-secondary text-center py-4">No announcements posted.</p>
                  ) : (
                    <div className="space-y-3.5">
                      {announcements.map((ann) => (
                        <div key={ann.id} className="p-3.5 bg-background dark:bg-dark-bg border border-border rounded-xl space-y-2.5 text-xs">
                          <div className="flex justify-between items-start gap-2">
                            <span className="font-bold text-text-primary">{ann.title}</span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[9px] text-text-tertiary font-mono font-medium">{new Date(ann.created_at).toLocaleDateString()}</span>
                              <button
                                type="button"
                                onClick={() => { setEditingAnnouncement(ann); setIsAnnouncementFormOpen(true); }}
                                className="p-1 rounded-lg text-text-tertiary hover:text-primary hover:bg-primary-soft transition-colors"
                                title="Edit announcement"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteAnnouncement(ann)}
                                className="p-1 rounded-lg text-text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                                title="Delete announcement"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          <p className="text-text-secondary text-[11px] leading-relaxed whitespace-pre-wrap font-medium">{ann.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

      </div>

      {/* CREATE ASSIGNMENT MODAL — Premium */}
      <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-40 animate-fadeIn" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-surface dark:bg-dark-surface rounded-2xl shadow-2xl z-50 animate-modalScaleIn focus:outline-none max-h-[92vh] overflow-hidden flex flex-col border border-border/60 dark:border-dark-border/60">

            {/* Top accent stripe */}
            <div className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/70 to-primary/10 shrink-0" />

            {/* Gradient header */}
            <div className="relative px-6 pt-5 pb-5 bg-gradient-to-br from-primary/10 via-primary/3 to-transparent border-b border-border/60 dark:border-dark-border/50 shrink-0">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-lg shadow-primary/30">
                    <Plus className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <Dialog.Title className="text-base font-extrabold text-text-primary tracking-tight leading-none">Create Assignment</Dialog.Title>
                    <Dialog.Description className="text-[11px] text-text-tertiary mt-1 font-medium">Define rubric criteria and publish to your class.</Dialog.Description>
                  </div>
                </div>
                <Dialog.Close asChild>
                  <button className="text-text-tertiary hover:text-text-primary transition-colors p-1.5 hover:bg-neutral-100 dark:hover:bg-dark-bg rounded-lg focus:outline-none cursor-pointer mt-0.5">
                    <X className="h-4 w-4" />
                  </button>
                </Dialog.Close>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateAssignment(); }} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Assignment Title
                  </label>
                  <input
                    id="assign-title"
                    required
                    value={assignTitle}
                    onChange={(e) => setAssignTitle(e.target.value)}
                    placeholder="e.g. Shakespeare Essay"
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm font-semibold text-text-primary placeholder:text-text-tertiary placeholder:font-normal focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <BookOpen className="h-3 w-3" /> Instructions
                  </label>
                  <textarea
                    value={assignDesc}
                    onChange={(e) => setAssignDesc(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all resize-none h-24 leading-relaxed"
                    placeholder="Provide instructions here..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" /> Due Date
                  </label>
                  <input
                    id="assign-due"
                    type="datetime-local"
                    value={assignDueDate}
                    onChange={(e) => setAssignDueDate(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-border dark:border-dark-border bg-background dark:bg-dark-bg text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all"
                  />
                </div>

                {/* Rubric Matrix Editor */}
                <div className="space-y-3 pt-3 border-t border-border/60 dark:border-dark-border/40">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5 text-primary" /> Rubric Guide
                    </label>
                    <button
                      type="button"
                      onClick={addRubricRow}
                      className="text-xs font-bold text-primary hover:text-primary-hover focus:underline focus:outline-none cursor-pointer"
                    >
                      + Add Criterion
                    </button>
                  </div>

                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {rubricRows.map((row, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input
                          type="text"
                          required
                          placeholder="Criterion Name"
                          value={row.criterion}
                          onChange={(e) => updateRubricRow(idx, 'criterion', e.target.value)}
                          className="flex-1 px-3 py-2 border border-border dark:border-dark-border rounded-lg text-xs bg-background dark:bg-dark-bg text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none placeholder:text-text-tertiary"
                        />
                        <input
                          type="number"
                          required
                          min="1"
                          placeholder="Pts"
                          value={row.max_points}
                          onChange={(e) => updateRubricRow(idx, 'max_points', parseInt(e.target.value) || 0)}
                          className="w-20 px-3 py-2 border border-border dark:border-dark-border rounded-lg text-xs bg-background dark:bg-dark-bg text-text-primary text-center font-bold focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => removeRubricRow(idx)}
                          className="text-xs text-text-tertiary hover:text-danger p-2 hover:bg-danger-soft rounded-lg shrink-0 transition-colors cursor-pointer"
                          disabled={rubricRows.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end items-center gap-3 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 border-t border-border/60 dark:border-dark-border/50 shrink-0">
                <Dialog.Close asChild>
                  <button type="button" className="h-9 px-4 rounded-lg border border-border dark:border-dark-border bg-transparent hover:bg-background dark:hover:bg-dark-surface text-xs font-bold text-text-secondary transition-all cursor-pointer focus:outline-none">
                    Cancel
                  </button>
                </Dialog.Close>
                <Button type="submit" loading={isSubmitting} className="h-9 px-5 text-xs font-bold shadow-sm shadow-primary/20">
                  Create Assignment
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* GRADE DETAIL SIDE SHEET — Premium */}
      <Dialog.Root open={selectedGrade !== null} onOpenChange={(open) => !open && setSelectedGrade(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-md z-45 animate-fadeIn" />
          <Dialog.Content className="fixed top-0 right-0 h-screen w-full sm:w-[440px] bg-surface dark:bg-dark-surface border-l border-border dark:border-dark-border shadow-2xl z-50 animate-slideInRight flex flex-col focus:outline-none overflow-hidden">

            {/* Header */}
            <div className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/70 to-primary/10 shrink-0" />
            <div className="flex items-center justify-between px-6 py-5 border-b border-border/60 dark:border-dark-border/50 bg-gradient-to-r from-primary/8 to-transparent shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-md shadow-primary/30">
                  <Award className="h-4 w-4 text-white" />
                </div>
                <div>
                  <Dialog.Title className="text-sm font-extrabold text-text-primary">Grade Detail Sheet</Dialog.Title>
                  <Dialog.Description className="text-[10px] text-text-tertiary font-medium mt-0.5">Assessed rubric scoring breakdown</Dialog.Description>
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
              {selectedGrade && (
                <div className="space-y-5">
                  <div>
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Student</h4>
                    <p className="text-sm font-bold text-text-primary mt-1">{selectedGrade.student_name}</p>
                    <p className="text-[10px] text-text-tertiary font-mono mt-0.5">{selectedGrade.student_email}</p>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Assignment</h4>
                    <p className="text-sm font-bold text-text-primary mt-1">{selectedGrade.assignment_title}</p>
                  </div>

                  <div className="border border-border/60 rounded-xl p-4 bg-background/30 dark:bg-dark-bg/30 space-y-3">
                    <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider border-b border-border/40 pb-2">Rubric Items Assessed</h4>
                    {Array.isArray(selectedGrade.rubric_scores) ? (
                      (selectedGrade.rubric_scores as Array<{ criterion: string; score: number }>).map((score, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs pb-1.5 border-b border-border/20 last:border-0 last:pb-0">
                          <span className="text-text-secondary font-medium">{score.criterion}</span>
                          <span className="font-bold text-primary">{score.score} pts</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-text-tertiary">No itemized rubric points scored.</p>
                    )}
                  </div>

                  {selectedGrade.feedback && (
                    <div className="space-y-1.5">
                      <h4 className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Feedback Comments</h4>
                      <p className="text-xs text-text-secondary italic bg-primary-soft/30 dark:bg-primary/10 border border-primary-soft p-3.5 rounded-xl leading-relaxed">
                        &quot;{selectedGrade.feedback}&quot;
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sticky footer */}
            {selectedGrade && (
              <div className="shrink-0 border-t border-border/60 dark:border-dark-border/50 px-6 py-4 bg-neutral-50/60 dark:bg-dark-bg/40 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider">Aggregated Total</p>
                  <p className="text-2xl font-black text-primary mt-1">{selectedGrade.total_score} <span className="text-sm text-text-tertiary font-semibold">pts</span></p>
                </div>
                <div className={`text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-full border ${
                  scoreVariantClassNames[getScoreVariant(selectedGrade.total_score, selectedGrade.max_score as number)]
                }`}>
                  {Math.round((Number(selectedGrade.total_score) / (selectedGrade.max_score as number)) * 100)}%
                </div>
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <SyllabusWeekForm
        open={isWeekFormOpen}
        onOpenChange={(open) => { setIsWeekFormOpen(open); if (!open) setEditingWeek(null); }}
        title={editingWeek ? 'Edit Week' : 'Add Syllabus Week'}
        initialValues={editingWeek ? {
          week_number: editingWeek.week_number,
          title: editingWeek.title,
          topics: editingWeek.topics || '',
          readings: editingWeek.readings || '',
          video_links: editingWeek.video_links,
          linked_assignment_id: editingWeek.linked_assignment_id,
        } : { week_number: syllabusWeeks.length + 1 }}
        assignmentOptions={assignments.map(a => ({ id: a.id, title: a.title }))}
        submitting={weekSubmitting}
        onSubmit={handleSaveWeek}
      />

      <AnnouncementForm
        open={isAnnouncementFormOpen}
        onOpenChange={(open) => { setIsAnnouncementFormOpen(open); if (!open) setEditingAnnouncement(null); }}
        title={editingAnnouncement ? 'Edit Announcement' : 'Post Announcement'}
        initialValues={editingAnnouncement ? { title: editingAnnouncement.title, content: editingAnnouncement.content } : undefined}
        submitting={announcementSubmitting}
        onSubmit={handleSaveAnnouncement}
      />

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
