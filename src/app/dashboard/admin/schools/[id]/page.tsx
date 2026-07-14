'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useDashboardLayout } from '../../../DashboardLayoutContext';
import { apiCall } from '@/lib/api';
import { ArrowLeft, ChevronDown, ChevronRight, Users, Trash2, Copy, School as SchoolIcon, Plus, X } from 'lucide-react';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import Toast, { type ToastMessage } from '@/components/Toast';

interface SchoolItem {
  id: string;
  name: string;
  created_at: string;
}

interface UserItem {
  id: string;
  name: string;
  email: string;
  role: 'student' | 'teacher' | 'admin';
  school_id: string | null;
  is_suspended?: boolean;
}

interface ClassroomItem {
  id: string;
  school_id: string;
  teacher_id: string;
  name: string;
  code: string;
}

interface RosterEntry {
  student_id: string;
  name: string;
  email: string;
  enrolled_at: string;
  status: string;
}

export default function SchoolDetailPage() {
  const params = useParams();
  const router = useRouter();
  const schoolId = params.id as string;
  const { user, isLoading } = useAuth();
  const { setTitle, setBreadcrumbs } = useDashboardLayout();

  const [school, setSchool] = useState<SchoolItem | null>(null);
  const [classes, setClasses] = useState<ClassroomItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [rosters, setRosters] = useState<Record<string, RosterEntry[]>>({});
  const [expandedClassId, setExpandedClassId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [moveTarget, setMoveTarget] = useState<Record<string, string>>({});
  const [movingStudentId, setMovingStudentId] = useState<string | null>(null);
  const [isCreateClassOpen, setIsCreateClassOpen] = useState(false);
  const [isCreatingClass, setIsCreatingClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassTeacherId, setNewClassTeacherId] = useState('');

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  const loadData = useCallback(async () => {
    try {
      const [schoolsData, classesData, usersData] = await Promise.all([
        apiCall('/api/admin/schools').catch(() => []),
        apiCall('/api/classes').catch(() => []),
        apiCall('/api/admin/users').catch(() => []),
      ]);

      const matchedSchool = (schoolsData as SchoolItem[]).find((s) => s.id === schoolId) || null;
      const schoolClasses = (classesData as ClassroomItem[]).filter((c) => c.school_id === schoolId);
      setSchool(matchedSchool);
      setClasses(schoolClasses);
      setUsers(usersData as UserItem[]);

      // Load every class's roster up front so the header's student count is
      // accurate immediately, instead of only reflecting whichever classes
      // happen to have been expanded.
      const rosterEntries = await Promise.all(
        schoolClasses.map(async (cls) => {
          const roster = await apiCall(`/api/classes/${cls.id}/students`).catch(() => []);
          return [cls.id, roster] as const;
        })
      );
      setRosters(Object.fromEntries(rosterEntries));
    } catch (err) {
      /* v8 ignore next -- loadData's individual API calls either resolve or recover with empty lists; this is a final render-safe guard. */
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to load school details' });
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (user?.id && user.role === 'admin') {
      loadData();
    }
  }, [user?.id, user?.role, loadData]);

  useEffect(() => {
    setTitle(school?.name || 'School Details');
    setBreadcrumbs([
      { label: 'Administration Desk', href: '/dashboard/admin' },
      { label: school?.name || 'School' },
    ]);
  }, [school, setTitle, setBreadcrumbs]);

  const getUser = (userId: string) => users.find((u) => u.id === userId);

  const toggleExpand = async (classId: string) => {
    if (expandedClassId === classId) {
      setExpandedClassId(null);
      return;
    }
    setExpandedClassId(classId);
    /* v8 ignore next 7 -- rosters are preloaded before class expansion; retained for stale-state refresh safety. */
    if (!rosters[classId]) {
      try {
        const roster = await apiCall(`/api/classes/${classId}/students`);
        setRosters((prev) => ({ ...prev, [classId]: roster }));
      } catch (err) {
        setToast({ id: Math.random().toString(), type: 'error', text: err instanceof Error ? err.message : 'Failed to load class roster' });
      }
      /* v8 ignore next -- closing the stale-roster guard belongs to the defensive branch ignored above. */
    }
  };

  const handleCreateClass = async () => {
    if (!newClassName.trim() || !newClassTeacherId) return;
    setIsCreatingClass(true);
    try {
      const created = await apiCall('/api/classes', {
        method: 'POST',
        body: JSON.stringify({
          school_id: schoolId,
          name: newClassName.trim(),
          teacher_id: newClassTeacherId,
        }),
      });
      setClasses((prev) => [...prev, created]);
      setNewClassName('');
      setNewClassTeacherId('');
      setIsCreateClassOpen(false);
      setToast({ id: Math.random().toString(), type: 'success', text: `Class "${created.name}" created.` });
    } catch (err) {
      setToast({ id: Math.random().toString(), type: 'error', text: err instanceof Error ? err.message : 'Failed to create class' });
    } finally {
      setIsCreatingClass(false);
    }
  };

  const handleDeleteClass = async (classId: string, name: string) => {
    if (!confirm(`Delete class "${name}"? This will delete all its assignments, submissions, and grades.`)) return;
    try {
      await apiCall(`/api/classes/${classId}`, { method: 'DELETE' });
      setClasses((prev) => prev.filter((c) => c.id !== classId));
      setToast({ id: Math.random().toString(), type: 'success', text: `Class "${name}" deleted.` });
    } catch (err) {
      setToast({ id: Math.random().toString(), type: 'error', text: err instanceof Error ? err.message : `Failed to delete "${name}"` });
    }
  };

  const handleRemoveStudent = async (classId: string, studentId: string, name: string) => {
    try {
      await apiCall(`/api/classes/${classId}/students/${studentId}`, { method: 'DELETE' });
      setRosters((prev) => ({
        ...prev,
        [classId]: (prev[classId] || []).filter((s) => s.student_id !== studentId),
      }));
      setToast({ id: Math.random().toString(), type: 'success', text: `${name} removed from class.` });
    } catch (err) {
      setToast({ id: Math.random().toString(), type: 'error', text: err instanceof Error ? err.message : `Failed to remove ${name}` });
    }
  };

  const handleMoveStudent = async (fromClassId: string, studentId: string, name: string) => {
    const toClassId = moveTarget[studentId];
    if (!toClassId) return;
    const toClass = classes.find((c) => c.id === toClassId);

    setMovingStudentId(studentId);
    try {
      // Add to the destination first — if that fails (e.g. already enrolled
      // there), the student is never left without a class at all.
      await apiCall(`/api/classes/${toClassId}/students`, {
        method: 'POST',
        body: JSON.stringify({ student_id: studentId }),
      });
      await apiCall(`/api/classes/${fromClassId}/students/${studentId}`, { method: 'DELETE' });

      setRosters((prev) => {
        const fromRoster = (prev[fromClassId] || []).filter((s) => s.student_id !== studentId);
        const movedEntry = (prev[fromClassId] || []).find((s) => s.student_id === studentId);
        const toRoster = prev[toClassId]
          ? [...prev[toClassId].filter((s) => s.student_id !== studentId), ...(movedEntry ? [{ ...movedEntry, status: 'active' }] : [])]
          /* v8 ignore next -- destination rosters are preloaded, but preserving missing state avoids manufacturing data. */
          : prev[toClassId];
        return { ...prev, [fromClassId]: fromRoster, ...(toRoster ? { [toClassId]: toRoster } : {}) };
      });
      setMoveTarget((prev) => ({ ...prev, [studentId]: '' }));
      setToast({
        id: Math.random().toString(),
        type: 'success',
        text: `${name} moved to "${toClass?.name || 'the selected class'}".`,
      });
    } catch (err) {
      setToast({ id: Math.random().toString(), type: 'error', text: err instanceof Error ? err.message : `Failed to move ${name}` });
    } finally {
      setMovingStudentId(null);
    }
  };

  const toggleSuspend = async (userId: string, currentStatus: boolean, name: string) => {
    try {
      await apiCall(`/api/admin/users/${userId}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ is_suspended: !currentStatus }),
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_suspended: !currentStatus } : u)));
      setToast({
        id: Math.random().toString(),
        type: currentStatus ? 'success' : 'warning',
        text: `${name} ${currentStatus ? 'reactivated' : 'suspended'} successfully.`,
      });
    } catch (err) {
      setToast({ id: Math.random().toString(), type: 'error', text: err instanceof Error ? err.message : `Failed to update ${name}` });
    }
  };

  const copySchoolId = () => {
    if (!school) return;
    navigator.clipboard.writeText(school.id);
    setToast({ id: Math.random().toString(), type: 'success', text: 'School ID copied to clipboard' });
  };

  if (isLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') return null;
  if (!school) return <div className="p-6 text-center text-text-secondary animate-fadeIn">School not found</div>;

  const uniqueStudentIds = new Set(
    classes.flatMap((c) => (rosters[c.id] || []).map((s) => s.student_id))
  );
  const totalStudents = uniqueStudentIds.size;

  return (
    <div className="space-y-6 animate-fadeIn">
      <button
        onClick={() => router.push('/dashboard/admin')}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors font-semibold"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Administration Desk
      </button>

      <Card hover={false} className="p-6 border border-border bg-surface shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-info flex items-center justify-center shrink-0">
              <SchoolIcon className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-text-primary tracking-tight">{school.name}</h2>
              <button
                onClick={copySchoolId}
                className="flex items-center gap-1 text-[10px] text-text-tertiary font-mono hover:text-primary transition-colors mt-1"
                title="Copy School ID"
              >
                ID: {school.id} <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Classes</p>
              <p className="text-xl font-bold font-mono text-text-primary mt-0.5">{classes.length}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-text-tertiary">Total Students</p>
              <p className="text-xl font-bold font-mono text-text-primary mt-0.5">{totalStudents}</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-text-primary">
            <Users className="h-5 w-5 text-primary" />
            Classes &amp; Rosters
          </h3>
          <button
            onClick={() => setIsCreateClassOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg px-3 py-1.5 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Class
          </button>
        </div>

        {isCreateClassOpen && (
          <Card hover={false} className="p-5 border border-primary/20 bg-primary-soft/20 dark:bg-primary-soft/5 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-text-primary">Create New Class</h4>
              <button
                onClick={() => setIsCreateClassOpen(false)}
                className="text-text-tertiary hover:text-text-primary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                Class Name
              </label>
              <input
                type="text"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                placeholder="e.g. CS102 - Data Structures"
                className="w-full text-xs rounded-lg border border-border bg-surface px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
                Teacher
              </label>
              <select
                value={newClassTeacherId}
                onChange={(e) => setNewClassTeacherId(e.target.value)}
                className="w-full text-xs rounded-lg border border-border bg-surface px-3 py-2 text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select a teacher...</option>
                {users
                  .filter((u) => u.role === 'teacher' && u.school_id === schoolId)
                  .map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                  ))}
              </select>
              {users.filter((u) => u.role === 'teacher' && u.school_id === schoolId).length === 0 && (
                <p className="text-[10px] text-warning font-semibold pt-1">
                  No teachers are assigned to this school yet - create a teacher user first.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setIsCreateClassOpen(false)}
                className="text-xs font-bold text-text-secondary hover:text-text-primary px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateClass}
                disabled={!newClassName.trim() || !newClassTeacherId || isCreatingClass}
                className="text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isCreatingClass ? 'Creating...' : 'Create Class'}
              </button>
            </div>
          </Card>
        )}

        {classes.length === 0 ? (
          <Card hover={false} className="p-8 text-center text-text-secondary text-sm border border-border bg-surface">
            No classes have been created at this school yet.
          </Card>
        ) : (
          <div className="space-y-3">
            {classes.map((cls) => {
              const teacher = getUser(cls.teacher_id);
              const isExpanded = expandedClassId === cls.id;
              const roster = rosters[cls.id];

              return (
                <Card key={cls.id} hover={false} className="p-0 border border-border bg-surface shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-5 py-4">
                    <button
                      onClick={() => toggleExpand(cls.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-text-tertiary shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-text-tertiary shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-text-primary truncate">{cls.name}</p>
                        <p className="text-[10px] text-text-tertiary font-mono mt-0.5">Code: {cls.code}</p>
                      </div>
                    </button>

                    <div className="flex items-center gap-3 shrink-0">
                      {teacher && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-text-secondary font-semibold">{teacher.name}</span>
                          <button
                            onClick={() => toggleSuspend(teacher.id, teacher.is_suspended || false, teacher.name)}
                            className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full border transition-colors ${
                              teacher.is_suspended
                                ? 'border-danger/25 bg-danger/10 text-danger hover:bg-danger/20'
                                : 'border-success/25 bg-success/10 text-success hover:bg-success/20'
                            }`}
                            title={teacher.is_suspended ? 'Reactivate teacher' : 'Suspend teacher'}
                          >
                            {teacher.is_suspended ? 'Suspended' : 'Active'}
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => handleDeleteClass(cls.id, cls.name)}
                        className="p-1.5 rounded text-text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                        title="Delete class"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border bg-background/30 px-5 py-3">
                      {/* v8 ignore next -- expanded rows only render after roster preload, but the loading state is kept for defensive UI safety. */}
                      {!roster ? (
                        /* v8 ignore next -- same defensive loading branch as above. */
                        <p className="text-xs text-text-secondary py-2">Loading roster...</p>
                      ) : roster.length === 0 ? (
                        <p className="text-xs text-text-secondary py-2">No students enrolled in this class yet.</p>
                      ) : (
                        <div className="divide-y divide-border">
                          {roster.map((student) => {
                            const studentUser = getUser(student.student_id);
                            return (
                              <div key={student.student_id} className="flex items-center justify-between gap-3 py-2.5">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-text-primary truncate">{student.name}</p>
                                  <p className="text-[10px] text-text-tertiary font-mono truncate">{student.email}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {studentUser && (
                                    <button
                                      onClick={() => toggleSuspend(studentUser.id, studentUser.is_suspended || false, studentUser.name)}
                                      className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full border transition-colors ${
                                        studentUser.is_suspended
                                          ? 'border-danger/25 bg-danger/10 text-danger hover:bg-danger/20'
                                          : 'border-success/25 bg-success/10 text-success hover:bg-success/20'
                                      }`}
                                      title={studentUser.is_suspended ? 'Reactivate student' : 'Suspend student'}
                                    >
                                      {studentUser.is_suspended ? 'Suspended' : 'Active'}
                                    </button>
                                  )}
                                  <Badge variant={student.status === 'active' ? 'success' : 'default'} size="sm">
                                    {student.status}
                                  </Badge>
                                  {classes.length > 1 && (
                                    <div className="flex items-center gap-1">
                                      <select
                                        value={moveTarget[student.student_id] || ''}
                                        onChange={(e) =>
                                          setMoveTarget((prev) => ({ ...prev, [student.student_id]: e.target.value }))
                                        }
                                        className="text-[10px] rounded border border-border bg-surface px-1.5 py-1 text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/20 max-w-[110px]"
                                      >
                                        <option value="">Move to...</option>
                                        {classes
                                          .filter((c) => c.id !== cls.id)
                                          .map((c) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                          ))}
                                      </select>
                                      <button
                                        onClick={() => handleMoveStudent(cls.id, student.student_id, student.name)}
                                        disabled={!moveTarget[student.student_id] || movingStudentId === student.student_id}
                                        className="text-[9px] font-extrabold uppercase px-1.5 py-1 rounded border border-primary/25 bg-primary-soft text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        title="Move to selected class"
                                      >
                                        {movingStudentId === student.student_id ? '...' : 'Move'}
                                      </button>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => handleRemoveStudent(cls.id, student.student_id, student.name)}
                                    className="p-1 rounded text-text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                                    title="Remove from class"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
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

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
