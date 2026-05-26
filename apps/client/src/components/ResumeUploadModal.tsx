import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Upload, X, FileText } from 'lucide-react';

interface ResumeUploadModalProps {
  onClose: () => void;
  onSuccess?: (pdfUrl: string) => void;
}

export default function ResumeUploadModal({ onClose, onSuccess }: ResumeUploadModalProps) {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ─── Upload Mutation ────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('resume', file);
      
      // Use request method directly to support custom headers for file upload
      const response = await api.request<{ 
        success: boolean; 
        data: { pdfUrl: string; filename: string; message: string };
      }>('/resumes/upload', {
        method: 'POST',
        body: formData,
        headers: {}, // Don't set Content-Type, let browser set it with boundary
      });
      
      return response.data;
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['resumes'] });
      if (onSuccess) {
        onSuccess(response.data.pdfUrl);
      }
      onClose();
    },
    onError: (error: any) => {
      console.error('Upload failed:', error);
      const message = error.response?.data?.error?.message || 'Failed to upload resume. Please try again.';
      alert(message);
    },
  });

  function handleFileSelect(file: File) {
    // Validate file type
    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file only.');
      return;
    }
    
    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB.');
      return;
    }
    
    setSelectedFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }

  function handleSubmit() {
    if (!selectedFile) return;
    uploadMutation.mutate(selectedFile);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Upload Existing Resume</h2>
            <p className="text-sm text-muted-foreground mt-1">Attach a PDF resume you already have</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* File Upload Area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'
            }`}
            onClick={() => document.getElementById('file-input')?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
            />
            
            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-green-600" />
                <div className="text-left">
                  <p className="font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="text-red-500 hover:text-red-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-sm font-medium mb-1">Drag & drop your PDF here</p>
                <p className="text-xs text-muted-foreground">or click to browse</p>
                <p className="text-[10px] text-muted-foreground mt-2">PDF files only, max 10MB</p>
              </>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="text-blue-800">
              💡 <strong>Tip:</strong> Uploaded resumes can be attached to job applications or used as a reference when generating tailored versions.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedFile || uploadMutation.isPending}
              className="px-6 py-2.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90 disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {uploadMutation.isPending ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Resume
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}