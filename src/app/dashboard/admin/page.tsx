'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../../../components/AuthProvider';
import { useDashboardLayout } from '../DashboardLayoutContext';
import { apiCall } from '../../../lib/api';
import { School as SchoolIcon, Users, BookOpen, FileText, Award, Plus, Search, MoreVertical, ShieldAlert, Copy, Trash2 } from 'lucide-react';
import { Button } from '../../../components/Button';
import { Card } from '../../../components/Card';
import { Modal } from '../../../components/Modal';
import { Input } from '../../../components/Input';
import { Badge } from '../../../components/Badge';
import Toast, { type ToastMessage } from '../../../components/Toast';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

import { useRouter } from 'next/navigation';

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
  name: string;
}

interface AssignmentItem {
  id: string;
  title: string;
}

interface SubmissionItem {
  id: string;
  status: string;
}

interface TeacherGroupItem {
  id: string;
  school_id: string;
  name: string;
}

interface TeacherGroupMember {
  id: string;
  name: string;
  email: string;
}

interface TeacherGroupDetail extends TeacherGroupItem {
  members: TeacherGroupMember[];
}

export default function AdminDashboard() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { setTitle, setBreadcrumbs, setAction } = useDashboardLayout();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'admin')) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);
  
  const [stats, setStats] = useState<{
    totalTeachers: number;
    totalStudents: number;
    totalClasses: number;
    averageGrade: string | null;
    pendingSubmissions: number;
    totalSchools: number;
  }>({
    totalTeachers: 0,
    totalStudents: 0,
    totalClasses: 0,
    averageGrade: null,
    pendingSubmissions: 0,
    totalSchools: 0,
  });

  const [schools, setSchools] = useState<SchoolItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'admin' | 'teacher' | 'student'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');

  // Create User Modal State
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [isCreateUserSubmitting, setIsCreateUserSubmitting] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'student' | 'teacher' | 'admin'>('student');
  const [newUserSchoolId, setNewUserSchoolId] = useState('');

  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [isEditUserSubmitting, setIsEditUserSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserRole, setEditUserRole] = useState<'student' | 'teacher' | 'admin'>('student');
  const [editUserSchoolId, setEditUserSchoolId] = useState('');

  // Teacher Groups State
  const [teacherGroups, setTeacherGroups] = useState<TeacherGroupItem[]>([]);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isGroupSubmitting, setIsGroupSubmitting] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupSchoolId, setNewGroupSchoolId] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<TeacherGroupDetail | null>(null);
  const [isGroupDetailOpen, setIsGroupDetailOpen] = useState(false);
  const [addMemberTeacherId, setAddMemberTeacherId] = useState('');

  // Initialize Topbar Layout details
  useEffect(() => {
    setTitle('Portal Administration');
    setBreadcrumbs([{ label: 'Administration Desk' }]);
  }, [setTitle, setBreadcrumbs]);

  // Set action button in topbar
  useEffect(() => {
    setAction(
      <Button
        onClick={() => setIsModalOpen(true)}
        variant="primary"
        size="sm"
        className="text-xs font-semibold px-4 h-9 shadow-sm"
      >
        <Plus className="h-4 w-4 mr-1.5" />
        Register School
      </Button>
    );
    return () => setAction(null);
  }, [setAction]);

  const loadAdminWorkspace = async () => {
    try {
      // 1. Fetch schools catalog
      const schoolsData = await apiCall('/api/admin/schools').catch(() => []);
      setSchools(schoolsData);

      // 2. Fetch all registered users
      const usersData = await apiCall('/api/admin/users').catch(() => []);
      // Map database users, setting suspend state mock
      const mappedUsers = (usersData as UserItem[]).map((u: UserItem) => ({
        ...u,
        is_suspended: u.is_suspended ?? false
      }));
      setUsers(mappedUsers);

      // 3. Fetch classes list
      const classesData = await apiCall('/api/classes').catch(() => []);

      // 3b. Fetch teacher groups
      const groupsData = await apiCall('/api/admin/teacher-groups').catch(() => []);
      setTeacherGroups(groupsData);

      // 4. Fetch dynamic system-wide grade average
      const avgData = await apiCall('/api/admin/stats/average-grades').catch(() => ({ average: null }));

      // 5. Fetch submissions counts by aggregating all classes -> assignments -> submissions
      const submissionsPromises = (classesData as ClassroomItem[]).map((cls: ClassroomItem) =>
        apiCall(`/api/classes/${cls.id}/assignments`)
          .then(async (assigns: AssignmentItem[]) => {
            const subsPromises = assigns.map((assign: AssignmentItem) =>
              apiCall(`/api/assignments/${assign.id}/submissions`)
                .then((subs: SubmissionItem[]) => subs.filter((s: SubmissionItem) => s.status === 'submitted').length)
                .catch(() => 0)
            );
            const counts = await Promise.all(subsPromises);
            return counts.reduce((sum, c) => sum + c, 0);
          })
          .catch(() => 0)
      );
      const classCounts = await Promise.all(submissionsPromises);
      const totalPending = classCounts.reduce((sum, c) => sum + c, 0);

      const teachers = mappedUsers.filter((u: UserItem) => u.role === 'teacher').length;
      const students = mappedUsers.filter((u: UserItem) => u.role === 'student').length;

      setStats({
        totalTeachers: teachers,
        totalStudents: students,
        totalClasses: classesData.length,
        averageGrade: avgData.average,
        pendingSubmissions: totalPending,
        totalSchools: schoolsData.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load administrative metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id && user.role === 'admin') {
      loadAdminWorkspace();
    }
  }, [user?.id, user?.role]);

  const handleCreateSchool = async () => {
    if (!newSchoolName.trim()) {
      setToast({ id: 'val', type: 'error', text: 'School name is required' });
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await apiCall('/api/admin/schools', {
        method: 'POST',
        body: JSON.stringify({ name: newSchoolName }),
      });

      setSchools(prev => [...prev, data]);
      setToast({ id: 'success', type: 'success', text: `Successfully registered ${newSchoolName}!` });
      setIsModalOpen(false);
      setNewSchoolName('');
      loadAdminWorkspace();
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to register school' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      setToast({ id: 'val', type: 'error', text: 'Name, email, and password are required' });
      return;
    }
    if (newUserPassword.length < 8) {
      setToast({ id: 'val', type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }

    setIsCreateUserSubmitting(true);
    try {
      const data = await apiCall('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: newUserName,
          email: newUserEmail,
          password: newUserPassword,
          role: newUserRole,
          school_id: newUserSchoolId || null,
        }),
      });

      setUsers(prev => [...prev, { ...data, is_suspended: false }]);
      setToast({ id: 'success', type: 'success', text: `${newUserName} was created successfully.` });
      setIsCreateUserOpen(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRole('student');
      setNewUserSchoolId('');
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to create user' });
    } finally {
      setIsCreateUserSubmitting(false);
    }
  };

  const handleOpenEditUser = (item: UserItem) => {
    setEditingUser(item);
    setEditUserName(item.name);
    setEditUserEmail(item.email);
    setEditUserRole(item.role);
    setEditUserSchoolId(item.school_id || '');
    setIsEditUserOpen(true);
  };

  const handleEditUser = async () => {
    if (!editingUser) return;
    if (!editUserName.trim() || !editUserEmail.trim()) {
      setToast({ id: 'val', type: 'error', text: 'Name and email are required' });
      return;
    }

    setIsEditUserSubmitting(true);
    try {
      const data = await apiCall(`/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editUserName,
          email: editUserEmail,
          role: editUserRole,
          school_id: editUserSchoolId || null,
        }),
      });

      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...data } : u));
      setToast({ id: 'success', type: 'success', text: `${editUserName} was updated successfully.` });
      setIsEditUserOpen(false);
      setEditingUser(null);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to update user' });
    } finally {
      setIsEditUserSubmitting(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || !newGroupSchoolId) {
      setToast({ id: 'val', type: 'error', text: 'Group name and school are required' });
      return;
    }

    setIsGroupSubmitting(true);
    try {
      const data = await apiCall('/api/admin/teacher-groups', {
        method: 'POST',
        body: JSON.stringify({ name: newGroupName, school_id: newGroupSchoolId }),
      });

      setTeacherGroups(prev => [...prev, data]);
      setToast({ id: 'success', type: 'success', text: `Teacher group "${newGroupName}" created.` });
      setIsGroupModalOpen(false);
      setNewGroupName('');
      setNewGroupSchoolId('');
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to create teacher group' });
    } finally {
      setIsGroupSubmitting(false);
    }
  };

  const handleDeleteGroup = async (groupId: string, name: string) => {
    if (!confirm(`Delete teacher group "${name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await apiCall(`/api/admin/teacher-groups/${groupId}`, { method: 'DELETE' });
      setTeacherGroups(prev => prev.filter(g => g.id !== groupId));
      setToast({ id: Math.random().toString(), type: 'success', text: `Teacher group "${name}" deleted.` });
    } catch (err) {
      setToast({
        id: Math.random().toString(),
        type: 'error',
        text: err instanceof Error ? err.message : `Failed to delete "${name}"`,
      });
    }
  };

  const handleOpenGroupDetail = async (groupId: string) => {
    try {
      const data = await apiCall(`/api/admin/teacher-groups/${groupId}`);
      setSelectedGroup(data);
      setIsGroupDetailOpen(true);
    } catch (err) {
      setToast({
        id: Math.random().toString(),
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to load group details',
      });
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !addMemberTeacherId) return;
    try {
      await apiCall(`/api/admin/teacher-groups/${selectedGroup.id}/members`, {
        method: 'POST',
        body: JSON.stringify({ teacher_id: addMemberTeacherId }),
      });
      const refreshed = await apiCall(`/api/admin/teacher-groups/${selectedGroup.id}`);
      setSelectedGroup(refreshed);
      setAddMemberTeacherId('');
      setToast({ id: Math.random().toString(), type: 'success', text: 'Teacher added to group.' });
    } catch (err) {
      setToast({
        id: Math.random().toString(),
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to add teacher to group',
      });
    }
  };

  const handleRemoveMember = async (teacherId: string) => {
    if (!selectedGroup) return;
    try {
      await apiCall(`/api/admin/teacher-groups/${selectedGroup.id}/members/${teacherId}`, { method: 'DELETE' });
      setSelectedGroup(prev => prev ? { ...prev, members: prev.members.filter(m => m.id !== teacherId) } : prev);
      setToast({ id: Math.random().toString(), type: 'success', text: 'Teacher removed from group.' });
    } catch (err) {
      setToast({
        id: Math.random().toString(),
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to remove teacher from group',
      });
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete ${name}? This cannot be undone.`)) {
      return;
    }
    try {
      await apiCall(`/api/admin/users/${userId}`, { method: 'DELETE' });
      setUsers(prev => prev.filter(u => u.id !== userId));
      setToast({ id: Math.random().toString(), type: 'success', text: `${name} was deleted successfully.` });
    } catch (err) {
      setToast({
        id: Math.random().toString(),
        type: 'error',
        text: err instanceof Error ? err.message : `Failed to delete ${name}`,
      });
    }
  };

  const toggleUserSuspension = async (userId: string, currentStatus: boolean) => {
    try {
      await apiCall(`/api/admin/users/${userId}/suspend`, {
        method: 'PATCH',
        body: JSON.stringify({ is_suspended: !currentStatus }),
      });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_suspended: !currentStatus } : u));
      setToast({
        id: Math.random().toString(),
        type: currentStatus ? 'success' : 'warning',
        text: currentStatus ? 'User suspension lifted successfully.' : 'User account suspended successfully.'
      });
    } catch (err) {
      setToast({
        id: Math.random().toString(),
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update user suspension status'
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setToast({
      id: Math.random().toString(),
      type: 'success',
      text: 'School ID copied to clipboard'
    });
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesSearch = 
        u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        u.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesTab = activeTab === 'all' ? true : u.role === activeTab;
      
      return matchesSearch && matchesTab;
    });
  }, [users, searchQuery, activeTab]);

  // Skip a leading title (Dr., Prof., Mr., Mrs., Ms.) so "Dr. Sarah Chen"
  // greets as "Sarah", not the truncated "Dr.".
  const TITLE_PREFIXES = new Set(['dr.', 'dr', 'prof.', 'prof', 'mr.', 'mr', 'mrs.', 'mrs', 'ms.', 'ms']);
  const nameParts = user?.name.trim().split(/\s+/) || [];
  const firstName = nameParts.find((part) => !TITLE_PREFIXES.has(part.toLowerCase())) || nameParts[0] || 'Admin';
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  // Calculate Average Grade percentage for radial gauge
  const avgGradeValue = stats.averageGrade ? parseFloat(stats.averageGrade) : 0;
  const strokeDashoffset = 125 - (125 * avgGradeValue) / 100;

  // Avatar deterministic background initials
  const getAvatarInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Greetings Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/60 pb-6">
        <div>
          <h2 className="text-xl font-extrabold text-text-primary tracking-tight">
            Good morning, {firstName}
          </h2>
          <p className="text-xs text-text-tertiary font-semibold mt-1">
            {formattedDate}
          </p>
        </div>
        <div className="text-xs text-text-tertiary font-bold uppercase tracking-wider mt-2 sm:mt-0 bg-primary-soft/50 dark:bg-primary-soft/10 px-3 py-1.5 rounded-lg border border-primary-soft">
          Academic Director Workspace
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-4 text-sm text-danger flex items-center gap-2">
          <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Premium Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Total Teachers Stat */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-primary flex items-center justify-center shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Total Teachers</p>
            <p className="text-2xl font-bold font-mono tracking-tight text-text-primary mt-1">{stats.totalTeachers}</p>
          </div>
        </div>

        {/* Total Students Stat */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-success flex items-center justify-center shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Total Students</p>
            <p className="text-2xl font-bold font-mono tracking-tight text-text-primary mt-1">{stats.totalStudents}</p>
          </div>
        </div>

        {/* Total Classes Stat */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-warning flex items-center justify-center shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Total Classes</p>
            <p className="text-2xl font-bold font-mono tracking-tight text-text-primary mt-1">{stats.totalClasses}</p>
          </div>
        </div>

        {/* School Average Card with thin Radial Ring */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Award className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Average Grade</p>
              <p className="text-2xl font-bold font-mono tracking-tight text-text-primary mt-1">
                {stats.averageGrade ?? 'N/A'}
              </p>
            </div>
          </div>
          {stats.averageGrade && (
            <div className="relative w-12 h-12 shrink-0">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 48 48">
                <circle
                  className="text-border dark:text-dark-border"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="transparent"
                  r="20"
                  cx="24"
                  cy="24"
                />
                <circle
                  className="text-purple-600 dark:text-purple-400"
                  strokeWidth="3.5"
                  strokeDasharray="125"
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="20"
                  cx="24"
                  cy="24"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-text-secondary">
                Avg
              </div>
            </div>
          )}
        </div>

        {/* Pending Submissions Stat */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 text-danger flex items-center justify-center shrink-0">
            <FileText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Pending Grading</p>
            <p className="text-2xl font-bold font-mono tracking-tight text-text-primary mt-1">{stats.pendingSubmissions}</p>
          </div>
        </div>

        {/* Total Schools Stat */}
        <div className="bg-surface border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-info flex items-center justify-center shrink-0">
            <SchoolIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-text-tertiary">Total Schools</p>
            <p className="text-2xl font-bold font-mono tracking-tight text-text-primary mt-1">{stats.totalSchools}</p>
          </div>
        </div>
      </div>

      {/* Main Administrative Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* System Users Table Panel (2 Cols) */}
        <div id="users-section" className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-base font-bold flex items-center gap-2 text-text-primary">
              <Users className="h-5 w-5 text-primary" />
              Manage System Users
            </h3>
            
            {/* Search + Filter Tabs */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" />
                <input
                  type="text"
                  placeholder="Search user..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-surface text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 w-44"
                />
              </div>
              <Button
                onClick={() => setIsCreateUserOpen(true)}
                variant="secondary"
                size="sm"
                className="text-xs font-semibold px-3 h-8 shrink-0"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                New User
              </Button>
            </div>
          </div>

          <Card hover={false} className="p-0 border border-border bg-surface overflow-hidden shadow-sm">
            {/* Tabs Headers */}
            <div className="flex border-b border-border bg-background/30 px-4">
              {(['all', 'admin', 'teacher', 'student'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 text-xs font-bold uppercase tracking-wider border-b-2 transition-all -mb-[1px] ${
                    activeTab === tab 
                      ? 'border-primary text-primary font-extrabold'
                      : 'border-transparent text-text-tertiary hover:text-text-secondary'
                  }`}
                >
                  {tab}s
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-12 text-text-secondary text-sm">Loading users register...</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-text-secondary text-sm">No matching users found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold text-text-tertiary bg-background/20 uppercase tracking-wider">
                      <th className="px-5 py-3.5">User</th>
                      <th className="px-5 py-3.5">Role</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="w-10 px-5 py-3.5"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface">
                    {filteredUsers.map((item) => {
                      const initialLetters = getAvatarInitials(item.name);
                      return (
                        <tr 
                          key={item.id} 
                          className="hover:bg-neutral-50/50 dark:hover:bg-slate-800/10 transition-colors h-[48px]"
                        >
                          <td className="px-5 py-3 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary-soft text-primary font-bold text-xs flex items-center justify-center shrink-0">
                              {initialLetters}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-text-primary text-xs leading-none">{item.name}</p>
                              <p className="text-[10px] text-text-tertiary font-mono mt-1 truncate max-w-[200px]">
                                {item.email}
                              </p>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <Badge 
                              variant={
                                item.role === 'admin' ? 'danger' :
                                item.role === 'teacher' ? 'info' : 'success'
                              }
                              size="sm"
                            >
                              {item.role}
                            </Badge>
                          </td>
                          <td className="px-5 py-3">
                            {item.is_suspended ? (
                              <span className="inline-flex items-center text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border border-danger/25 bg-danger/10 text-danger leading-none">
                                Suspended
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border border-success/25 bg-success/10 text-success leading-none">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <DropdownMenu.Root>
                              <DropdownMenu.Trigger asChild>
                                <button className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-neutral-50 dark:hover:bg-dark-bg focus:outline-none">
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </DropdownMenu.Trigger>
                              <DropdownMenu.Portal>
                                <DropdownMenu.Content 
                                  className="z-50 min-w-[140px] bg-surface dark:bg-dark-surface border border-border dark:border-dark-border rounded-lg p-1 shadow-md animate-scaleIn"
                                  align="end"
                                  sideOffset={4}
                                >
                                  <DropdownMenu.Item
                                    onClick={() => handleOpenEditUser(item)}
                                    className="flex items-center px-2 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer focus:outline-none text-text-primary hover:bg-neutral-50 dark:hover:bg-dark-bg focus:bg-neutral-50 dark:focus:bg-dark-bg"
                                  >
                                    Edit User
                                  </DropdownMenu.Item>
                                  <DropdownMenu.Item
                                    onClick={() => toggleUserSuspension(item.id, item.is_suspended || false)}
                                    className={`flex items-center px-2 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer focus:outline-none ${
                                      item.is_suspended
                                        ? 'text-success hover:bg-success-soft focus:bg-success-soft'
                                        : 'text-danger hover:bg-danger-soft focus:bg-danger-soft'
                                    }`}
                                  >
                                    {item.is_suspended ? 'Reactivate User' : 'Suspend User'}
                                  </DropdownMenu.Item>
                                  <DropdownMenu.Item
                                    onClick={() => handleDeleteUser(item.id, item.name)}
                                    className="flex items-center px-2 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer focus:outline-none text-danger hover:bg-danger-soft focus:bg-danger-soft"
                                  >
                                    Delete User
                                  </DropdownMenu.Item>
                                </DropdownMenu.Content>
                              </DropdownMenu.Portal>
                            </DropdownMenu.Root>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        {/* Registered Schools Catalog (1 Col) */}
        <div id="schools-section" className="lg:col-span-1 space-y-4">
          <h3 className="text-base font-bold flex items-center gap-2 text-text-primary">
            <SchoolIcon className="h-5 w-5 text-primary" />
            Registered Schools
          </h3>
          
          <Card hover={false} className="p-5 border border-border bg-surface shadow-sm">
            {loading ? (
              <div className="text-center py-6 text-text-secondary text-xs">Loading catalog...</div>
            ) : schools.length === 0 ? (
              <p className="text-xs text-text-secondary text-center py-4">No schools registered yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {schools.map(s => (
                  <button
                    key={s.id}
                    onClick={() => router.push(`/dashboard/admin/schools/${s.id}`)}
                    className="w-full text-left py-3.5 first:pt-0 last:pb-0 group hover:bg-neutral-50/50 dark:hover:bg-slate-800/10 -mx-5 px-5 transition-colors cursor-pointer"
                  >
                    <p className="text-xs font-bold text-text-primary group-hover:text-primary transition-colors">{s.name}</p>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-[9px] text-text-tertiary font-mono select-all truncate flex-1">
                        ID: {s.id}
                      </p>
                      <span
                        onClick={(e) => { e.stopPropagation(); copyToClipboard(s.id); }}
                        className="text-text-tertiary hover:text-primary transition-colors p-0.5 hover:bg-primary-soft rounded"
                        title="Copy School ID"
                      >
                        <Copy className="h-3 w-3" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Teacher Groups Panel */}
      <div id="teacher-groups-section" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold flex items-center gap-2 text-text-primary">
            <Users className="h-5 w-5 text-primary" />
            Teacher Groups
          </h3>
          <Button
            onClick={() => setIsGroupModalOpen(true)}
            variant="secondary"
            size="sm"
            className="text-xs font-semibold px-3 h-8"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            New Group
          </Button>
        </div>

        <Card hover={false} className="p-0 border border-border bg-surface overflow-hidden shadow-sm">
          {loading ? (
            <div className="text-center py-12 text-text-secondary text-sm">Loading teacher groups...</div>
          ) : teacherGroups.length === 0 ? (
            <div className="text-center py-12 text-text-secondary text-sm">No teacher groups yet. Create one to organize teachers by department.</div>
          ) : (
            <div className="divide-y divide-border">
              {teacherGroups.map((group) => (
                <div key={group.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-neutral-50/50 dark:hover:bg-slate-800/10 transition-colors">
                  <button
                    onClick={() => handleOpenGroupDetail(group.id)}
                    className="text-left flex-1 min-w-0"
                  >
                    <p className="font-semibold text-text-primary text-xs">{group.name}</p>
                    <p className="text-[10px] text-text-tertiary font-mono mt-0.5">
                      {schools.find(s => s.id === group.school_id)?.name || 'Unknown school'}
                    </p>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      onClick={() => handleOpenGroupDetail(group.id)}
                      variant="secondary"
                      size="sm"
                      className="text-[10px] font-bold px-2.5 h-7"
                    >
                      Manage
                    </Button>
                    <button
                      onClick={() => handleDeleteGroup(group.id, group.name)}
                      className="p-1.5 rounded text-text-tertiary hover:text-danger hover:bg-danger-soft transition-colors"
                      title="Delete group"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* REGISTER SCHOOL MODAL */}
      <Modal
        isOpen={isModalOpen}
        title="Register New School"
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateSchool}
        isSubmitting={isSubmitting}
      >
        <div className="space-y-4 pt-2">
          <Input 
            id="school-name"
            label="School Name"
            required
            value={newSchoolName}
            onChange={(e) => setNewSchoolName(e.target.value)}
            placeholder="e.g. Greenwood Academy"
            className="h-11"
          />
        </div>
      </Modal>

      {/* CREATE USER MODAL */}
      <Modal
        isOpen={isCreateUserOpen}
        title="Create New User"
        onClose={() => setIsCreateUserOpen(false)}
        onSubmit={handleCreateUser}
        isSubmitting={isCreateUserSubmitting}
      >
        <div className="space-y-4 pt-2">
          <Input
            id="new-user-name"
            label="Full Name"
            required
            value={newUserName}
            onChange={(e) => setNewUserName(e.target.value)}
            placeholder="e.g. Jane Doe"
            className="h-11"
          />
          <Input
            id="new-user-email"
            label="Email"
            type="email"
            required
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="jane.doe@school.edu"
            className="h-11"
          />
          <Input
            id="new-user-password"
            label="Password"
            type="password"
            required
            value={newUserPassword}
            onChange={(e) => setNewUserPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            className="h-11"
          />
          <div className="space-y-1">
            <label className="block text-xs font-bold text-text-primary mb-1.5 uppercase tracking-wider">Role</label>
            <select
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as 'student' | 'teacher' | 'admin')}
              className="block w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-bold text-text-primary mb-1.5 uppercase tracking-wider">School</label>
            <select
              value={newUserSchoolId}
              onChange={(e) => setNewUserSchoolId(e.target.value)}
              className="block w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            >
              <option value="">No school</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* EDIT USER MODAL */}
      <Modal
        isOpen={isEditUserOpen}
        title="Edit User"
        onClose={() => setIsEditUserOpen(false)}
        onSubmit={handleEditUser}
        isSubmitting={isEditUserSubmitting}
        submitLabel="Save Changes"
        submittingLabel="Saving..."
      >
        <div className="space-y-4 pt-2">
          <Input
            id="edit-user-name"
            label="Full Name"
            required
            value={editUserName}
            onChange={(e) => setEditUserName(e.target.value)}
            className="h-11"
          />
          <Input
            id="edit-user-email"
            label="Email"
            type="email"
            required
            value={editUserEmail}
            onChange={(e) => setEditUserEmail(e.target.value)}
            className="h-11"
          />
          <div className="space-y-1">
            <label className="block text-xs font-bold text-text-primary mb-1.5 uppercase tracking-wider">Role</label>
            <select
              value={editUserRole}
              onChange={(e) => setEditUserRole(e.target.value as 'student' | 'teacher' | 'admin')}
              className="block w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-bold text-text-primary mb-1.5 uppercase tracking-wider">School</label>
            <select
              value={editUserSchoolId}
              onChange={(e) => setEditUserSchoolId(e.target.value)}
              className="block w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            >
              <option value="">No school</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* CREATE TEACHER GROUP MODAL */}
      <Modal
        isOpen={isGroupModalOpen}
        title="Create Teacher Group"
        onClose={() => setIsGroupModalOpen(false)}
        onSubmit={handleCreateGroup}
        isSubmitting={isGroupSubmitting}
      >
        <div className="space-y-4 pt-2">
          <Input
            id="new-group-name"
            label="Group Name"
            required
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="e.g. Math Department"
            className="h-11"
          />
          <div className="space-y-1">
            <label className="block text-xs font-bold text-text-primary mb-1.5 uppercase tracking-wider">School</label>
            <select
              value={newGroupSchoolId}
              onChange={(e) => setNewGroupSchoolId(e.target.value)}
              className="block w-full h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
            >
              <option value="">Select a school</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* TEACHER GROUP DETAIL / MEMBER MANAGEMENT MODAL */}
      <Modal
        isOpen={isGroupDetailOpen}
        title={selectedGroup?.name || 'Group Details'}
        description="Manage which teachers belong to this group."
        onClose={() => { setIsGroupDetailOpen(false); setSelectedGroup(null); setAddMemberTeacherId(''); }}
        footer={
          <button
            type="button"
            onClick={() => { setIsGroupDetailOpen(false); setSelectedGroup(null); setAddMemberTeacherId(''); }}
            className="flex-1 px-4 py-2.5 text-xs font-bold border border-border dark:border-dark-border rounded-lg bg-transparent hover:bg-background text-text-secondary transition-all active:scale-[0.98] focus:outline-none cursor-pointer"
          >
            Close
          </button>
        }
      >
        {selectedGroup && (
          <div className="space-y-5 pt-2">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-text-primary mb-1.5 uppercase tracking-wider">Add Teacher</label>
              <div className="flex gap-2">
                <select
                  value={addMemberTeacherId}
                  onChange={(e) => setAddMemberTeacherId(e.target.value)}
                  className="flex-1 h-10 rounded-lg border border-border bg-surface px-3 text-sm text-text-primary focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none"
                >
                  <option value="">Select a teacher</option>
                  {users
                    .filter(u => u.role === 'teacher' && !selectedGroup.members.some(m => m.id === u.id))
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
                <Button
                  onClick={handleAddMember}
                  variant="secondary"
                  size="sm"
                  className="text-xs font-semibold px-3 h-10 shrink-0"
                >
                  Add
                </Button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-text-primary mb-1.5 uppercase tracking-wider">
                Members ({selectedGroup.members.length})
              </label>
              {selectedGroup.members.length === 0 ? (
                <p className="text-xs text-text-secondary py-3">No teachers in this group yet.</p>
              ) : (
                <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                  {selectedGroup.members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-text-primary truncate">{member.name}</p>
                        <p className="text-[10px] text-text-tertiary font-mono truncate">{member.email}</p>
                      </div>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        className="p-1 rounded text-text-tertiary hover:text-danger hover:bg-danger-soft transition-colors shrink-0"
                        title="Remove from group"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
