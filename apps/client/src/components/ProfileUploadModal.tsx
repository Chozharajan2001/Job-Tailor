import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Upload, X, FileText, AlertTriangle, Cpu, CheckCircle } from 'lucide-react';

interface ProfileUploadModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

const LOADING_PHASES = [
  'Reading PDF document structure...',
  'Extracting raw resume text...',
  'Sending data to AI parser (gpt-4o-mini)...',
  'AI is identifying core technical and soft skills...',
  'AI is structuring your work history and achievement metrics...',
  'AI is formatting your academic records and projects bank...',
  'Synthesizing and building your new Master Profile...',
];

export default function ProfileUploadModal({ onClose, onSuccess }: ProfileUploadModalProps) {
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [loadingPhaseIndex, setLoadingPhaseIndex] = useState(0);

  // Cycle through loading messages to keep user engaged during LLM parsing
  useEffect(() => {
    let interval: any;
    if (showWarning && loadingPhaseIndex > 0) {
      interval = setInterval(() => {
        setLoadingPhaseIndex((prev) => (prev < LOADING_PHASES.length - 1 ? prev + 1 : prev));
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [showWarning, loadingPhaseIndex]);

  // ─── Upload & Populate Mutation ──────────────────────────────
  const uploadAndParseMutation = useMutation({
    mutationFn: async (file: File) => {
      setLoadingPhaseIndex(1); // Start phase message cycling
      const formData = new FormData();
      formData.append('resume', file);
      
      const response = await api.request<{ 
        success: boolean; 
        data: { profile: any };
      }>('/profile/upload', {
        method: 'POST',
        body: formData,
        headers: {}, // Browser will set Content-Type with multipart boundaries
      });
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    },
    onError: (error: any) => {
      console.error('Profile parsing failed:', error);
      const message = error.message || 'Failed to parse resume and build profile. Please try again.';
      alert(message);
      // Reset loading states
      setLoadingPhaseIndex(0);
      setShowWarning(false);
    },
  });

  function handleFileSelect(file: File) {
    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file only.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB.');
      return;
    }
    setSelectedFile(file);
    setShowWarning(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }

  function handleUploadClick() {
    if (!selectedFile) return;
    setShowWarning(true);
  }

  function handleConfirmUpload() {
    if (!selectedFile) return;
    uploadAndParseMutation.mutate(selectedFile);
  }

  const isPending = uploadAndParseMutation.isPending;

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
      onClick={(e) => !isPending && e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transition-all transform scale-100">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between bg-gray-50/50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Auto-Populate Profile</h2>
            <p className="text-sm text-gray-500 mt-1">Upload a resume to auto-build your Master Profile using AI</p>
          </div>
          {!isPending && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer p-1 rounded-lg hover:bg-gray-100 transition-colors">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="p-6 space-y-4">
          {isPending ? (
            // Processing / AI Parsing Loading State
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Cpu className="w-6 h-6 text-primary animate-pulse" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold text-lg text-gray-900">AI Resume Parser Active</h3>
                <p className="text-sm text-muted-foreground font-medium animate-pulse min-h-[2.5rem] px-4">
                  {LOADING_PHASES[loadingPhaseIndex]}
                </p>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-1.5 max-w-[200px] overflow-hidden">
                <div 
                  className="bg-primary h-full transition-all duration-1000" 
                  style={{ width: `${((loadingPhaseIndex + 1) / LOADING_PHASES.length) * 100}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-400">This may take up to a minute. Please don't close this window.</p>
            </div>
          ) : showWarning ? (
            // Overwrite Warning Screen
            <div className="space-y-4 py-2">
              <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-800">Overwrite Warning</h3>
                  <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                    Importing this resume will **completely replace** all current entries in your Master Profile (Skills, Experiences, Projects, Education). 
                  </p>
                  <p className="text-sm text-amber-800 font-medium mt-2">
                    This action cannot be undone.
                  </p>
                </div>
              </div>

              {/* Confirm Buttons */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setShowWarning(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm text-gray-700 cursor-pointer font-medium"
                >
                  Go Back
                </button>
                <button
                  onClick={handleConfirmUpload}
                  className="px-5 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-700 text-sm cursor-pointer shadow-sm shadow-amber-600/10"
                >
                  Yes, Overwrite Profile
                </button>
              </div>
            </div>
          ) : (
            // File Upload Form Screen
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                  dragOver ? 'border-primary bg-primary/5 scale-[0.99]' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50/50'
                }`}
                onClick={() => document.getElementById('profile-file-input')?.click()}
              >
                <input
                  id="profile-file-input"
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
                    <FileText className="w-10 h-10 text-green-600" />
                    <div className="text-left max-w-[200px]">
                      <p className="font-semibold text-sm text-gray-800 truncate">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                      className="text-gray-400 hover:text-red-500 cursor-pointer p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      title="Clear file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className="w-12 h-12 mx-auto mb-3 text-gray-400 stroke-[1.5]" />
                    <p className="text-sm font-semibold text-gray-700">Drag & drop your PDF resume here</p>
                    <p className="text-xs text-gray-400 mt-1">or click to browse local files</p>
                    <div className="mt-3 inline-flex items-center gap-1.5 text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded">
                      <span>PDF only</span>
                      <span className="text-gray-300">•</span>
                      <span>Max 10MB</span>
                    </div>
                  </>
                )}
              </div>

              {/* Instructions Info Box */}
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-4 text-sm flex gap-3 text-blue-900">
                <Cpu className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-blue-800">How it works:</p>
                  <p className="text-xs text-blue-700 leading-relaxed">
                    AI will automatically analyze your resume's sections, parse skills, construct timeline-based work history, and populate your profile inputs. You can edit, tweak, or refine the result at any time!
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer font-medium hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadClick}
                  disabled={!selectedFile}
                  className="px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/95 disabled:opacity-50 cursor-pointer flex items-center gap-2 shadow-sm shadow-primary/10 transition-colors"
                >
                  <Cpu className="w-4 h-4" />
                  Parse & Build Profile
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
