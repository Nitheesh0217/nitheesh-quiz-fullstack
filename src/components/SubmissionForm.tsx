'use client';

import { useState, useRef } from 'react';
import { apiCall } from '../lib/api';
import Toast, { type ToastMessage } from './Toast';
import { UploadCloud, FileText, X } from 'lucide-react';
import { useAuth } from './AuthProvider';

interface SubmissionFormProps {
  assignmentId: string;
  classId: string;
  onSuccess: (submission: { id: string; file_url: string | null; text_content: string | null; status: string; submitted_at: string }) => void;
}

export function SubmissionForm({
  assignmentId,
  onSuccess,
}: SubmissionFormProps) {
  const { user } = useAuth();
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [submissionType, setSubmissionType] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [textContent, setTextContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (selectedFile: File | undefined) => {
    if (selectedFile) {
      if (selectedFile.size > 4 * 1024 * 1024) {
        setToast({ id: 'err', type: 'error', text: 'File must be less than 4MB' });
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const selectedFile = e.dataTransfer.files?.[0];
    handleFileChange(selectedFile);
  };

  const handleZoneClick = (e: React.MouseEvent) => {
    e.preventDefault();
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setToast(null);

    try {
      const payload: { file_url?: string; text_content?: string } = {};
      
      if (submissionType === 'file' && file) {
        // Convert file to Base64 Data URL
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            const nameParam = `;name=${encodeURIComponent(file.name)}`;
            const base64Index = result.indexOf(';base64,');
            if (base64Index === -1) {
              reject(new Error('Invalid base64 encoding'));
              return;
            }
            const formatted = result.slice(0, base64Index) + nameParam + result.slice(base64Index);
            resolve(formatted);
          };
          reader.onerror = () => reject(new Error('File reading error'));
          reader.readAsDataURL(file);
        });
        
        payload.file_url = dataUrl;
      } else if (submissionType === 'text') {
        payload.text_content = textContent;
      }

      const data = await apiCall(`/api/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (typeof window !== 'undefined' && data?.id && user?.id) {
        localStorage.setItem(`submission_${user.id}_${assignmentId}`, data.id);
      }

      setToast({ id: 'success', type: 'success', text: 'Assignment submitted successfully!' });
      setTimeout(() => onSuccess(data), 1000);
    } catch (err) {
      setToast({ id: 'err', type: 'error', text: err instanceof Error ? err.message : 'Failed to submit assignment.' });
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 bg-transparent p-0 border-0 shadow-none">
      {/* Submission Type Toggle */}
      <div className="flex gap-6 mb-4 border-b border-border/60 pb-3.5">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="radio"
            value="file"
            checked={submissionType === 'file'}
            onChange={(e) => setSubmissionType(e.target.value as 'file' | 'text')}
            className="w-4 h-4 text-primary focus:ring-primary focus:ring-offset-0 focus:outline-none"
          />
          <span className="text-text-secondary text-xs font-bold">File Upload</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="radio"
            value="text"
            checked={submissionType === 'text'}
            onChange={(e) => setSubmissionType(e.target.value as 'file' | 'text')}
            className="w-4 h-4 text-primary focus:ring-primary focus:ring-offset-0 focus:outline-none"
          />
          <span className="text-text-secondary text-xs font-bold">Text Entry</span>
        </label>
      </div>

      {/* File Upload Zone */}
      {submissionType === 'file' && (
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
            Upload File (PDF, Images, ZIP)
          </label>
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => handleFileChange(e.target.files?.[0])}
            className="hidden"
            id="file-input"
            onClick={(e) => e.stopPropagation()}
          />
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleZoneClick}
            className={`border border-dashed rounded-xl p-8 text-center transition-all cursor-pointer select-none ${
              isDragOver 
                ? 'border-primary bg-primary-soft/30 dark:bg-primary-soft/10' 
                : 'border-border hover:border-primary/50 bg-background/30 dark:bg-dark-bg/20'
            }`}
          >
            <div className="block pointer-events-none">
              <UploadCloud className="h-9 w-9 text-text-tertiary mx-auto mb-2.5" />
              <p className="text-text-primary font-bold text-xs">
                {file ? file.name : 'Click to select or drag & drop file'}
              </p>
              <p className="text-[10px] text-text-tertiary mt-2 font-semibold">
                Max file size: 4MB (saved directly to coursework folder)
              </p>
            </div>
          </div>
          {file && (
            <div className="mt-3 flex items-center justify-between p-2.5 bg-background dark:bg-dark-bg rounded-lg border border-border text-xs font-semibold text-text-primary">
              <span className="flex items-center gap-1.5 truncate">
                <FileText className="h-4.5 w-4.5 text-primary shrink-0" />
                {file.name}
              </span>
              <button 
                type="button" 
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                className="text-text-tertiary hover:text-danger p-0.5 transition-colors cursor-pointer"
                title="Remove file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Text Entry Area */}
      {submissionType === 'text' && (
        <div className="space-y-2">
          <label className="block text-[10px] font-bold text-text-secondary uppercase tracking-wider">
            Your Assignment Answer
          </label>
          <textarea
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            placeholder="Type or paste your markdown response..."
            rows={8}
            className="w-full px-4 py-2.5 border border-border dark:border-dark-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 focus:outline-none bg-surface dark:bg-dark-surface text-text-primary text-xs resize-none"
          />
          <div className="flex justify-between items-center text-[10px] text-text-tertiary font-bold mt-1.5">
            <span>Markdown formatting supported</span>
            <span>{textContent.length} / 5000 chars</span>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting || (!file && submissionType === 'file') || (!textContent && submissionType === 'text')}
        className={`
          w-full py-2.5 px-4 rounded-lg font-bold text-xs text-white
          transition-all duration-200 shadow-sm
          ${isSubmitting
            ? 'bg-neutral-300 dark:bg-slate-700 cursor-not-allowed text-text-tertiary'
            : 'bg-primary hover:bg-primary-hover active:scale-[0.99] cursor-pointer focus:outline-none'
          }
        `}
      >
        {isSubmitting ? '⏳ Uploading to Database...' : 'Submit Work'}
      </button>

      <Toast message={toast} onClose={() => setToast(null)} />
    </form>
  );
}
