import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../services/api";
import { sanitizeUrl } from "../lib/sanitizeUrl";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  Upload,
  Loader2,
  Trash2,
  Pencil,
  Star,
  Award,
  Link as LinkIcon,
  GraduationCap,
  Briefcase,
  FolderGit2,
  CheckCircle,
  AlertTriangle,
  Github,
  Linkedin,
  Globe,
  Plus,
  X,
} from "lucide-react";
import ProfileUploadModal from "../components/ProfileUploadModal";

// ─── Types ────────────────────────────────────────────────────
interface ISkill {
  _id?: string;
  name: string;
  category: string;
  yearsOfExperience: number;
  proficiency: string;
  isHighlighted: boolean;
}
interface IBullet {
  id: string;
  text: string;
  tags: string[];
}
interface IExperience {
  _id?: string;
  company: string;
  role: string;
  startDate: string;
  endDate: string | null;
  location: string;
  isCurrentRole: boolean;
  description: string;
  bullets: IBullet[];
}
interface IProject {
  _id?: string;
  name: string;
  description: string;
  techStack: string[];
  tags: string[];
  link?: string;
  github?: string;
  startDate: string;
  endDate?: string;
  highlights: string[];
}
interface IEducation {
  _id?: string;
  institution: string;
  degree: string;
  field: string;
  startYear: number;
  endYear?: number;
  gpa?: string;
}
interface ICertification {
  _id?: string;
  name: string;
  issuer: string;
  date: string;
  credentialUrl?: string;
}
interface ILinks {
  github?: string;
  linkedin?: string;
  portfolio?: string;
  website?: string;
}

interface IProfile {
  _id: string;
  summary: string;
  skills: ISkill[];
  experience: IExperience[];
  projects: IProject[];
  education: IEducation[];
  certifications: ICertification[];
  links: ILinks;
}

const SKILL_CATEGORIES = [
  "frontend",
  "backend",
  "devops",
  "ai",
  "mobile",
  "database",
  "other",
] as const;
const PROFICIENCY_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
] as const;
const BULLET_TAGS = [
  "frontend",
  "backend",
  "devops",
  "ai",
  "testing",
  "leadership",
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  frontend: "bg-blue-50 text-blue-700 border-blue-200",
  backend: "bg-green-50 text-green-700 border-green-200",
  devops: "bg-orange-50 text-orange-700 border-orange-200",
  ai: "bg-purple-50 text-purple-700 border-purple-200",
  mobile: "bg-pink-50 text-pink-700 border-pink-200",
  database: "bg-yellow-50 text-yellow-700 border-yellow-200",
  other: "bg-gray-50 text-gray-700 border-gray-200",
};

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    | "skills"
    | "experience"
    | "projects"
    | "education"
    | "certifications"
    | "links"
  >("skills");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [summarySaveStatus, setSummarySaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");

  // ─── Destructive action confirmation ───────────────────────
  const [pendingDelete, setPendingDelete] = useState<{
    title: string;
    description: string;
    action: () => void;
  } | null>(null);

  function requestDelete(
    title: string,
    description: string,
    action: () => void,
  ) {
    setPendingDelete({ title, description, action });
  }

  // ─── Fetch Profile ─────────────────────────────────────────
  const { data: profileRes, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => api.get<{ profile: IProfile }>("/profile"),
  });
  const profile = profileRes?.data?.profile || ({} as Partial<IProfile>);

  // ─── Profile Mutations ───────────────────────────────────────
  const updateProfileMutation = useMutation({
    mutationFn: (updates: Partial<IProfile>) =>
      api.put<{ profile: IProfile }>("/profile", updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const updateSummaryMutation = useMutation({
    mutationFn: (summary: string) =>
      api.put<{ profile: IProfile }>("/profile", { summary }),
    onMutate: () => {
      setSummarySaveStatus("saving");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      setSummarySaveStatus("saved");
      setTimeout(() => setSummarySaveStatus("idle"), 3000);
    },
    onError: () => {
      setSummarySaveStatus("error");
    },
  });

  // ─── Skill Mutations ───────────────────────────────────────
  const addSkillMutation = useMutation({
    mutationFn: (skill: Omit<ISkill, "_id">) =>
      api.post("/profile/skills", skill),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const updateSkillMutation = useMutation({
    mutationFn: ({ id, ...skill }: { id: string } & Partial<ISkill>) =>
      api.put(`/profile/skills/${id}`, skill),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const deleteSkillMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/profile/skills/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  // ─── Experience Mutations ──────────────────────────────────
  const addExpMutation = useMutation({
    mutationFn: (exp: Omit<IExperience, "_id">) =>
      api.post("/profile/experience", exp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const updateExpMutation = useMutation({
    mutationFn: ({ id, ...exp }: { id: string } & Partial<IExperience>) =>
      api.put(`/profile/experience/${id}`, exp),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const deleteExpMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/profile/experience/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  // ─── Project Mutations ───────────────────────────────────────
  const addProjectMutation = useMutation({
    mutationFn: (proj: Omit<IProject, "_id">) =>
      api.post("/profile/projects", proj),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ id, ...proj }: { id: string } & Partial<IProject>) =>
      api.put(`/profile/projects/${id}`, proj),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/profile/projects/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  // ─── Education Mutations ────────────────────────────────────
  const addEduMutation = useMutation({
    mutationFn: (edu: Omit<IEducation, "_id">) =>
      api.post("/profile/education", edu),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const updateEduMutation = useMutation({
    mutationFn: ({ id, ...edu }: { id: string } & Partial<IEducation>) =>
      api.put(`/profile/education/${id}`, edu),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const deleteEduMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/profile/education/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  // ─── Certification Mutations ────────────────────────────────
  const addCertMutation = useMutation({
    mutationFn: (cert: Omit<ICertification, "_id">) =>
      api.post("/profile/certifications", cert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const updateCertMutation = useMutation({
    mutationFn: ({ id, ...cert }: { id: string } & Partial<ICertification>) =>
      api.put(`/profile/certifications/${id}`, cert),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  const deleteCertMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/profile/certifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });

  // ─── Completeness Widget Calculations ───────────────────────
  const hasSummary = !!profile.summary && profile.summary.trim().length >= 30;
  const hasSkills = (profile.skills?.length || 0) >= 5;
  const hasExperience = (profile.experience?.length || 0) >= 1;
  const hasProjects = (profile.projects?.length || 0) >= 1;
  const hasEducation = (profile.education?.length || 0) >= 1;
  const hasCertifications = (profile.certifications?.length || 0) >= 1;
  const hasLinks = !!(profile.links?.linkedin || profile.links?.github);

  const checks = [
    { label: "Summary", done: hasSummary, weight: 15 },
    { label: "Skills (5+)", done: hasSkills, weight: 20 },
    { label: "Experience", done: hasExperience, weight: 25 },
    { label: "Projects", done: hasProjects, weight: 15 },
    { label: "Education", done: hasEducation, weight: 15 },
    { label: "Links", done: hasLinks, weight: 10 },
  ];

  const completionPct = checks.reduce(
    (sum, c) => sum + (c.done ? c.weight : 0),
    0,
  );

  if (isLoading) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="animate-pulse h-12 bg-gray-200 rounded-xl mb-4" />
        <div className="animate-pulse h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Master Profile</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your source of truth for resume tailoring
          </p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-indigo-600 text-white text-sm font-semibold rounded-lg hover:opacity-95 shadow-sm transition-all cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          Import Resume via AI
        </button>
      </div>

      {/* Profile Completeness Widget */}
      <div className="bg-gradient-to-r from-primary/5 to-indigo-600/5 border border-primary/20 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="font-semibold text-gray-900">
              Profile Completeness
            </h3>
            <p className="text-xs text-muted-foreground">
              Ensure your profile details are set up before tailoring resumes
            </p>
          </div>
          <span
            className={`text-xl font-bold ${completionPct >= 80 ? "text-green-600" : completionPct >= 50 ? "text-orange-600" : "text-red-500"}`}
          >
            {completionPct}%
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              completionPct >= 80
                ? "bg-green-500"
                : completionPct >= 50
                  ? "bg-orange-500"
                  : "bg-red-500"
            }`}
            style={{ width: `${completionPct}%` }}
          />
        </div>

        {/* Checks Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
          {checks.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border ${
                item.done
                  ? "bg-green-50/50 text-green-700 border-green-200/50"
                  : "bg-gray-50 text-gray-400 border-gray-100"
              }`}
            >
              <CheckCircle
                className={`w-3.5 h-3.5 ${item.done ? "text-green-500 fill-green-50" : "text-gray-300"}`}
              />
              <span className="font-medium truncate">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Professional Summary */}
      <section className="bg-white rounded-xl border p-6 shadow-sm space-y-3 relative">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Professional Summary</h2>
          {/* Summary Save Feedbacks */}
          <div className="text-xs font-medium flex items-center gap-1">
            {summarySaveStatus === "saving" && (
              <span className="text-muted-foreground flex items-center gap-1">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />{" "}
                Saving...
              </span>
            )}
            {summarySaveStatus === "saved" && (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 fill-green-50" /> Saved
              </span>
            )}
            {summarySaveStatus === "error" && (
              <span className="text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Save failed
              </span>
            )}
          </div>
        </div>
        <textarea
          defaultValue={profile.summary || ""}
          placeholder="Write a brief professional summary (2-3 sentences). This will be auto-tailored per JD."
          rows={3}
          onBlur={(e) => {
            if (e.target.value !== (profile.summary || "")) {
              updateSummaryMutation.mutate(e.target.value);
            }
          }}
          className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/10 focus:border-primary outline-none resize-none transition-colors"
        />
      </section>

      {/* Tabs Navigation */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
        {[
          { key: "skills", label: "Skills", icon: Award },
          { key: "experience", label: "Experience", icon: Briefcase },
          { key: "projects", label: "Projects", icon: FolderGit2 },
          { key: "education", label: "Education", icon: GraduationCap },
          { key: "certifications", label: "Certifications", icon: Award },
          { key: "links", label: "Links", icon: LinkIcon },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === tab.key
                  ? "bg-white shadow-sm text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground hover:bg-gray-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border p-6 shadow-sm min-h-[400px]">
        {activeTab === "skills" && (
          <SkillsSection
            skills={profile.skills || []}
            onAdd={(s) => addSkillMutation.mutate(s)}
            onUpdate={(id, s) => updateSkillMutation.mutate({ id, ...s })}
            onDelete={(id) =>
              requestDelete(
                "Delete skill",
                "This skill will be permanently removed from your master profile.",
                () => deleteSkillMutation.mutate(id),
              )
            }
          />
        )}
        {activeTab === "experience" && (
          <ExperienceSection
            experiences={profile.experience || []}
            onAdd={(e) => addExpMutation.mutate(e)}
            onUpdate={(id, e) => updateExpMutation.mutate({ id, ...e })}
            onDelete={(id) =>
              requestDelete(
                "Delete experience",
                "This experience block will be permanently removed from your master profile.",
                () => deleteExpMutation.mutate(id),
              )
            }
          />
        )}
        {activeTab === "projects" && (
          <ProjectsSection
            projects={profile.projects || []}
            onAdd={(p) => addProjectMutation.mutate(p)}
            onUpdate={(id, p) => updateProjectMutation.mutate({ id, ...p })}
            onDelete={(id) =>
              requestDelete(
                "Delete project",
                "This project will be permanently removed from your master profile.",
                () => deleteProjectMutation.mutate(id),
              )
            }
          />
        )}
        {activeTab === "education" && (
          <EducationSection
            education={profile.education || []}
            onAdd={(edu) => addEduMutation.mutate(edu)}
            onUpdate={(id, edu) => updateEduMutation.mutate({ id, ...edu })}
            onDelete={(id) =>
              requestDelete(
                "Delete education",
                "This education entry will be permanently removed from your master profile.",
                () => deleteEduMutation.mutate(id),
              )
            }
          />
        )}
        {activeTab === "certifications" && (
          <CertificationsSection
            certifications={profile.certifications || []}
            onAdd={(c) => addCertMutation.mutate(c)}
            onUpdate={(id, c) => updateCertMutation.mutate({ id, ...c })}
            onDelete={(id) =>
              requestDelete(
                "Delete certification",
                "This certification will be permanently removed from your master profile.",
                () => deleteCertMutation.mutate(id),
              )
            }
          />
        )}
        {activeTab === "links" && (
          <LinksSection
            links={profile.links || {}}
            onUpdate={(links) => updateProfileMutation.mutate({ links })}
            isSaving={updateProfileMutation.isPending}
          />
        )}
      </div>

      {/* Import Modal */}
      {showUploadModal && (
        <ProfileUploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["profile"] });
          }}
        />
      )}

      {/* Destructive action confirmation */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete?.title || ""}
        description={pendingDelete?.description || ""}
        onConfirm={() => {
          pendingDelete?.action();
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Skills Section
// ══════════════════════════════════════════════════════════════
interface SkillsSectionProps {
  skills: ISkill[];
  onAdd: (s: Omit<ISkill, "_id">) => void;
  onUpdate: (id: string, s: Partial<ISkill>) => void;
  onDelete: (id: string) => void;
}

function SkillsSection({
  skills,
  onAdd,
  onUpdate,
  onDelete,
}: SkillsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    category: "frontend",
    yearsOfExperience: 1,
    proficiency: "intermediate",
    isHighlighted: false,
  });

  function handleEditStart(skill: ISkill) {
    setEditingId(skill._id || null);
    setForm({
      name: skill.name,
      category: skill.category,
      yearsOfExperience: skill.yearsOfExperience,
      proficiency: skill.proficiency,
      isHighlighted: skill.isHighlighted || false,
    });
    setShowForm(true);
  }

  function handleSave() {
    if (!form.name.trim()) return;
    if (editingId) {
      onUpdate(editingId, form);
    } else {
      onAdd(form);
    }
    setForm({
      name: "",
      category: "frontend",
      yearsOfExperience: 1,
      proficiency: "intermediate",
      isHighlighted: false,
    });
    setEditingId(null);
    setShowForm(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Skill Inventory ({skills.length})
        </h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
          }}
          className="text-xs px-3 py-1.5 bg-primary/10 text-primary font-semibold rounded-lg hover:bg-primary/20 cursor-pointer transition-colors"
        >
          {showForm ? "Close Form" : "+ Add Skill"}
        </button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50 space-y-3 shadow-inner">
          <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            {editingId ? "Edit Skill" : "Add New Skill"}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Skill Name
              </label>
              <input
                placeholder="e.g., React"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              >
                {SKILL_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Years of Experience
              </label>
              <input
                type="number"
                min={0}
                max={50}
                step={0.5}
                value={form.yearsOfExperience}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    yearsOfExperience: parseFloat(e.target.value),
                  }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Proficiency Level
              </label>
              <select
                value={form.proficiency}
                onChange={(e) =>
                  setForm((f) => ({ ...f, proficiency: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              >
                {PROFICIENCY_LEVELS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="highlight"
              checked={form.isHighlighted}
              onChange={(e) =>
                setForm((f) => ({ ...f, isHighlighted: e.target.checked }))
              }
              className="w-4 h-4 rounded text-primary"
            />
            <label
              htmlFor="highlight"
              className="text-xs font-medium text-gray-700 cursor-pointer"
            >
              Pin to Highlighted Skills (Core Skills)
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t border-gray-200/50">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="text-xs px-4 py-1.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary/95 cursor-pointer shadow-sm shadow-primary/10"
            >
              {editingId ? "Save Changes" : "Add Skill"}
            </button>
          </div>
        </div>
      )}

      {skills.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-xl border-gray-300">
          <Award className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-500">
            No skills added yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your technical skillset or upload a resume to import them
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((skill) => (
            <div
              key={skill._id || skill.name}
              className="border rounded-xl p-4 flex items-start justify-between group hover:border-primary/20 hover:shadow-sm transition-all duration-200 bg-white"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-800 text-sm">
                    {skill.name}
                  </span>
                  <button
                    onClick={() =>
                      onUpdate(skill._id!, {
                        isHighlighted: !skill.isHighlighted,
                      })
                    }
                    className="text-gray-300 hover:text-yellow-400 p-0.5 rounded transition-colors"
                    title={
                      skill.isHighlighted ? "Unpin skill" : "Pin core skill"
                    }
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${skill.isHighlighted ? "fill-yellow-400 text-yellow-400" : "text-gray-300 hover:text-yellow-400"}`}
                    />
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.other}`}
                  >
                    {skill.category}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
                    {skill.proficiency}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 bg-gray-50 text-gray-500 border rounded-full font-medium">
                    {skill.yearsOfExperience}y
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditStart(skill)}
                  className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-primary transition-colors cursor-pointer"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(skill._id!)}
                  className="p-1 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Experience Section
// ══════════════════════════════════════════════════════════════
interface ExperienceSectionProps {
  experiences: IExperience[];
  onAdd: (e: Omit<IExperience, "_id">) => void;
  onUpdate: (id: string, e: Partial<IExperience>) => void;
  onDelete: (id: string) => void;
}

function ExperienceSection({
  experiences,
  onAdd,
  onUpdate,
  onDelete,
}: ExperienceSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<IExperience, "_id">>({
    company: "",
    role: "",
    startDate: "",
    endDate: "",
    location: "",
    isCurrentRole: true,
    description: "",
    bullets: [{ id: crypto.randomUUID(), text: "", tags: [] }],
  });

  function handleEditStart(exp: IExperience) {
    setEditingId(exp._id || null);
    setForm({
      company: exp.company,
      role: exp.role,
      startDate: exp.startDate,
      endDate: exp.endDate || "",
      location: exp.location,
      isCurrentRole: exp.isCurrentRole,
      description: exp.description || "",
      bullets:
        exp.bullets?.length > 0
          ? exp.bullets.map((b) => ({ ...b }))
          : [{ id: crypto.randomUUID(), text: "", tags: [] }],
    });
    setShowForm(true);
  }

  function addBullet() {
    setForm((f) => ({
      ...f,
      bullets: [...f.bullets, { id: crypto.randomUUID(), text: "", tags: [] }],
    }));
  }

  function removeBullet(id: string) {
    setForm((f) => ({ ...f, bullets: f.bullets.filter((b) => b.id !== id) }));
  }

  function updateBullet(id: string, field: string, value: any) {
    setForm((f) => ({
      ...f,
      bullets: f.bullets.map((b) =>
        b.id === id ? { ...b, [field]: value } : b,
      ),
    }));
  }

  function handleSave() {
    if (!form.company.trim() || !form.role.trim()) return;
    const payload = {
      company: form.company,
      role: form.role,
      startDate: form.startDate,
      endDate: form.isCurrentRole ? null : form.endDate || null,
      location: form.location || "",
      isCurrentRole: form.isCurrentRole,
      description: form.description,
      bullets: form.bullets.filter((b) => b.text.trim()),
    };
    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onAdd(payload);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({
      company: "",
      role: "",
      startDate: "",
      endDate: "",
      location: "",
      isCurrentRole: true,
      description: "",
      bullets: [{ id: crypto.randomUUID(), text: "", tags: [] }],
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Experience Blocks ({experiences.length})
        </h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
          }}
          className="text-xs px-3 py-1.5 bg-primary/10 text-primary font-semibold rounded-lg hover:bg-primary/20 cursor-pointer transition-colors"
        >
          {showForm ? "Close Form" : "+ Add Experience"}
        </button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 space-y-4 shadow-inner">
          <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            {editingId ? "Edit Experience Block" : "Add Experience Block"}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Company Name *
              </label>
              <input
                placeholder="e.g., Google"
                value={form.company}
                onChange={(e) =>
                  setForm((f) => ({ ...f, company: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Role / Title *
              </label>
              <input
                placeholder="e.g., Senior Full Stack Engineer"
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Start Date *
              </label>
              <input
                type="month"
                value={form.startDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startDate: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            {!form.isCurrentRole && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">
                  End Date
                </label>
                <input
                  type="month"
                  value={form.endDate || ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, endDate: e.target.value }))
                  }
                  className="px-3 py-2 border rounded-lg text-sm bg-white"
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Location
              </label>
              <input
                placeholder="e.g., New York, NY (or Remote)"
                value={form.location}
                onChange={(e) =>
                  setForm((f) => ({ ...f, location: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="currentRole"
                checked={form.isCurrentRole}
                onChange={(e) =>
                  setForm((f) => ({ ...f, isCurrentRole: e.target.checked }))
                }
                className="w-4 h-4 rounded text-primary"
              />
              <label
                htmlFor="currentRole"
                className="text-xs font-medium text-gray-700 cursor-pointer"
              >
                I currently work here
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              Overview Description (Optional)
            </label>
            <textarea
              placeholder="Summarize your team, responsibilities, or impact..."
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              className="px-3 py-2 border rounded-lg text-sm bg-white outline-none resize-none"
            />
          </div>

          {/* Bullets */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-gray-600">
              Achievement Bullets (Quantified metrics recommended)
            </label>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {form.bullets.map((bullet, idx) => (
                <div
                  key={bullet.id}
                  className="flex gap-2 items-start border-b border-gray-100 pb-2"
                >
                  <span className="text-xs text-gray-400 font-mono mt-2.5">
                    #{idx + 1}
                  </span>
                  <input
                    placeholder="Led design and implementation of X... reducing latency by 20%"
                    value={bullet.text}
                    onChange={(e) =>
                      updateBullet(bullet.id, "text", e.target.value)
                    }
                    className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
                  />
                  <div className="flex gap-1 flex-wrap min-w-fit mt-1">
                    {BULLET_TAGS.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const currentTags = bullet.tags.includes(tag)
                            ? bullet.tags.filter((t) => t !== tag)
                            : [...bullet.tags, tag];
                          updateBullet(bullet.id, "tags", currentTags);
                        }}
                        className={`text-[10px] px-2 py-1 rounded border font-medium cursor-pointer transition-colors ${
                          bullet.tags.includes(tag)
                            ? "bg-primary text-white border-primary"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                  {form.bullets.length > 1 && (
                    <button
                      onClick={() => removeBullet(bullet.id)}
                      className="text-red-400 hover:text-red-600 text-lg cursor-pointer p-1"
                    >
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={addBullet}
              className="text-xs font-bold text-primary cursor-pointer hover:underline"
            >
              + Add Bullet Point
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200/50">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="text-xs px-3 py-1.5 text-muted-foreground hover:text-foreground cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="text-xs px-4 py-1.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary/95 cursor-pointer shadow-sm shadow-primary/10"
            >
              {editingId ? "Save Changes" : "Add Experience Block"}
            </button>
          </div>
        </div>
      )}

      {experiences.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-xl border-gray-300">
          <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-500">
            No experience blocks yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Detail your past software engineering roles to tailor bullets from
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {experiences.map((exp) => (
            <div
              key={exp._id || `${exp.company}-${exp.role}`}
              className="border rounded-xl p-5 hover:border-primary/20 hover:shadow-sm transition-all duration-200 bg-white group relative"
            >
              <div className="flex items-start justify-between mb-2 pr-16">
                <div>
                  <h4 className="font-semibold text-gray-900 text-sm">
                    {exp.role}
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {exp.company} &middot; {exp.startDate} –{" "}
                    {exp.endDate || "Present"} &middot; {exp.location}
                  </p>
                </div>
                {exp.isCurrentRole && (
                  <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200 font-semibold shrink-0">
                    Current
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditStart(exp)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-primary transition-colors cursor-pointer"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(exp._id!)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {exp.description && (
                <p className="text-xs text-gray-500 mt-2 mb-3 bg-gray-50/50 p-2.5 rounded-lg border border-gray-100">
                  {exp.description}
                </p>
              )}

              <ul className="space-y-2 mt-2">
                {exp.bullets
                  ?.filter((b) => b.text)
                  .map((b) => (
                    <li
                      key={b.id}
                      className="text-xs text-gray-700 flex items-start gap-2 leading-relaxed"
                    >
                      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span>{b.text}</span>
                      {b.tags?.length > 0 && (
                        <div className="flex gap-1 ml-auto shrink-0 flex-wrap">
                          {b.tags.map((t) => (
                            <span
                              key={t}
                              className={`text-[9px] px-1.5 py-0.2 rounded border font-semibold uppercase tracking-wider ${CATEGORY_COLORS[t] || CATEGORY_COLORS.other}`}
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Projects Section
// ══════════════════════════════════════════════════════════════
interface ProjectsSectionProps {
  projects: IProject[];
  onAdd: (p: Omit<IProject, "_id">) => void;
  onUpdate: (id: string, p: Partial<IProject>) => void;
  onDelete: (id: string) => void;
}

function ProjectsSection({
  projects,
  onAdd,
  onUpdate,
  onDelete,
}: ProjectsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    techStack: [] as string[],
    tags: [] as string[],
    link: "",
    github: "",
    startDate: "",
    highlights: ["", ""],
  });

  function handleEditStart(p: IProject) {
    setEditingId(p._id || null);
    setForm({
      name: p.name,
      description: p.description,
      techStack: p.techStack || [],
      tags: p.tags || [],
      link: p.link || "",
      github: p.github || "",
      startDate: p.startDate || "",
      highlights: p.highlights?.length > 0 ? [...p.highlights] : ["", ""],
    });
    setShowForm(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.description.trim()) return;
    const payload = {
      name: form.name,
      description: form.description,
      techStack: form.techStack,
      tags: form.tags as any,
      link: form.link || undefined,
      github: form.github || undefined,
      startDate: form.startDate,
      highlights: form.highlights.filter((h) => h.trim()),
    };
    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onAdd(payload);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({
      name: "",
      description: "",
      techStack: [],
      tags: [],
      link: "",
      github: "",
      startDate: "",
      highlights: ["", ""],
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Project Bank ({projects.length})
        </h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
          }}
          className="text-xs px-3 py-1.5 bg-primary/10 text-primary font-semibold rounded-lg hover:bg-primary/20 cursor-pointer transition-colors"
        >
          {showForm ? "Close Form" : "+ Add Project"}
        </button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 space-y-4 shadow-inner">
          <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            {editingId ? "Edit Project Details" : "Add Project"}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Project Name *
              </label>
              <input
                placeholder="e.g., E-Commerce GraphQL API"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Start Date *
              </label>
              <input
                type="month"
                value={form.startDate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, startDate: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Project Website Link
              </label>
              <input
                placeholder="https://myproduct.com"
                value={form.link}
                onChange={(e) =>
                  setForm((f) => ({ ...f, link: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                GitHub Repository URL
              </label>
              <input
                placeholder="https://github.com/myorg/repo"
                value={form.github}
                onChange={(e) =>
                  setForm((f) => ({ ...f, github: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">
              Brief Description *
            </label>
            <textarea
              placeholder="Summarize what this project does..."
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              rows={2}
              className="px-3 py-2 border rounded-lg text-sm bg-white outline-none resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-600 font-medium">
              Tech Stack *
            </label>
            <div className="flex flex-wrap gap-2 p-2 border border-gray-200 bg-white rounded-lg focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
              {form.techStack.map((tech) => (
                <span
                  key={tech}
                  className="inline-flex items-center gap-1.5 text-xs bg-indigo-50/70 text-indigo-700 px-2.5 py-1 rounded-full border border-indigo-200/50 font-semibold select-none transition-all hover:bg-indigo-100 hover:text-indigo-800"
                >
                  {tech}
                  <button
                    type="button"
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        techStack: f.techStack.filter((t) => t !== tech),
                      }));
                    }}
                    className="text-indigo-400 hover:text-indigo-650 transition-colors focus:outline-none cursor-pointer p-0.5 rounded-full hover:bg-indigo-200/50"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder={
                  form.techStack.length === 0
                    ? "e.g., React (Type and press Enter or Comma)"
                    : "Add tech..."
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    const inputVal = e.currentTarget.value
                      .trim()
                      .replace(/,$/, "");
                    if (inputVal && !form.techStack.includes(inputVal)) {
                      setForm((f) => ({
                        ...f,
                        techStack: [...f.techStack, inputVal],
                      }));
                    }
                    e.currentTarget.value = "";
                  }
                }}
                onBlur={(e) => {
                  const inputVal = e.currentTarget.value.trim();
                  if (inputVal && !form.techStack.includes(inputVal)) {
                    setForm((f) => ({
                      ...f,
                      techStack: [...f.techStack, inputVal],
                    }));
                    e.currentTarget.value = "";
                  }
                }}
                className="flex-1 min-w-[120px] text-xs bg-transparent outline-none border-none py-0.5 placeholder-slate-400 text-slate-800"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600">
              Core Tags (select categories matching the project focus)
            </label>
            <div className="flex gap-2 flex-wrap">
              {["frontend", "backend", "devops", "ai", "mobile"].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const current = form.tags.includes(tag)
                      ? form.tags.filter((t) => t !== tag)
                      : [...form.tags, tag];
                    setForm((f) => ({ ...f, tags: current }));
                  }}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium cursor-pointer transition-colors ${
                    form.tags.includes(tag)
                      ? "bg-primary text-white border-primary"
                      : "bg-white text-gray-500 border-gray-200"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Highlights */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600">
              Key Highlights / Achievements
            </label>
            {form.highlights.map((h, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  placeholder={`Highlight #${idx + 1}`}
                  value={h}
                  onChange={(e) => {
                    const copy = [...form.highlights];
                    copy[idx] = e.target.value;
                    setForm((f) => ({ ...f, highlights: copy }));
                  }}
                  className="flex-1 px-3 py-2 border rounded-lg text-sm bg-white"
                />
                {form.highlights.length > 1 && (
                  <button
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        highlights: f.highlights.filter((_, i) => i !== idx),
                      }))
                    }
                    className="text-red-400 hover:text-red-600 text-sm cursor-pointer p-1"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() =>
                setForm((f) => ({ ...f, highlights: [...f.highlights, ""] }))
              }
              className="text-xs font-bold text-primary cursor-pointer hover:underline"
            >
              + Add Highlight
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200/50">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="text-xs px-3 py-1.5 text-muted-foreground cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="text-xs px-4 py-1.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary/95 cursor-pointer shadow-sm shadow-primary/10"
            >
              {editingId ? "Save Changes" : "Add Project"}
            </button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-xl border-gray-300">
          <FolderGit2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-500">
            No projects added yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your best portfolios or open-source repositories
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <div
              key={project._id || project.name}
              className="border rounded-xl p-5 hover:border-primary/20 hover:shadow-sm transition-all duration-200 bg-white group relative"
            >
              <div className="pr-16 space-y-1">
                <h4 className="font-semibold text-gray-900 text-sm">
                  {project.name}
                </h4>
                <p className="text-[10px] text-gray-400 font-medium">
                  Started: {project.startDate}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditStart(project)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-primary transition-colors cursor-pointer"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(project._id!)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-gray-600 mt-2 leading-relaxed">
                {project.description}
              </p>

              <div className="flex flex-wrap gap-1 mt-3">
                {(project.techStack || []).map((tech) => (
                  <span
                    key={tech}
                    className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium"
                  >
                    {tech}
                  </span>
                ))}
              </div>

              {project.highlights?.length > 0 && (
                <ul className="space-y-1 mt-3.5 border-t pt-3 border-gray-100">
                  {project.highlights.map((h, i) => (
                    <li
                      key={i}
                      className="text-[11px] text-gray-500 flex items-start gap-1.5"
                    >
                      <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-400 shrink-0" />
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Links */}
              <div className="flex gap-3 mt-4 text-[11px] font-semibold">
                {project.link && (
                  <a
                    href={sanitizeUrl(project.link)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    🌐 Live Demo
                  </a>
                )}
                {project.github && (
                  <a
                    href={sanitizeUrl(project.github)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-600 hover:underline flex items-center gap-1"
                  >
                    🐙 GitHub
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Education Section
// ══════════════════════════════════════════════════════════════
interface EducationSectionProps {
  education: IEducation[];
  onAdd: (edu: Omit<IEducation, "_id">) => void;
  onUpdate: (id: string, edu: Partial<IEducation>) => void;
  onDelete: (id: string) => void;
}

function EducationSection({
  education,
  onAdd,
  onUpdate,
  onDelete,
}: EducationSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    institution: "",
    degree: "",
    field: "",
    startYear: 2020,
    endYear: 2024,
    gpa: "",
  });

  function handleEditStart(edu: IEducation) {
    setEditingId(edu._id || null);
    setForm({
      institution: edu.institution,
      degree: edu.degree,
      field: edu.field,
      startYear: edu.startYear,
      endYear: edu.endYear || 2024,
      gpa: edu.gpa || "",
    });
    setShowForm(true);
  }

  function handleSave() {
    if (!form.institution.trim() || !form.degree.trim()) return;
    const payload = {
      ...form,
      gpa: form.gpa || undefined,
    };
    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onAdd(payload);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({
      institution: "",
      degree: "",
      field: "",
      startYear: 2020,
      endYear: 2024,
      gpa: "",
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Education Details ({education.length})
        </h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
          }}
          className="text-xs px-3 py-1.5 bg-primary/10 text-primary font-semibold rounded-lg hover:bg-primary/20 cursor-pointer transition-colors"
        >
          {showForm ? "Close Form" : "+ Add Education"}
        </button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 space-y-4 shadow-inner">
          <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            {editingId ? "Edit Education Entry" : "Add Education Entry"}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Institution / School Name *
              </label>
              <input
                placeholder="e.g., Stanford University"
                value={form.institution}
                onChange={(e) =>
                  setForm((f) => ({ ...f, institution: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Degree *
              </label>
              <input
                placeholder="e.g., B.S. or M.S."
                value={form.degree}
                onChange={(e) =>
                  setForm((f) => ({ ...f, degree: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Field of Study *
              </label>
              <input
                placeholder="e.g., Computer Science"
                value={form.field}
                onChange={(e) =>
                  setForm((f) => ({ ...f, field: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                GPA (Optional)
              </label>
              <input
                placeholder="e.g., 3.8/4.0"
                value={form.gpa}
                onChange={(e) =>
                  setForm((f) => ({ ...f, gpa: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Start Year *
              </label>
              <input
                type="number"
                min={1980}
                max={2035}
                value={form.startYear}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    startYear: parseInt(e.target.value) || 2020,
                  }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                End Year (or Expected)
              </label>
              <input
                type="number"
                min={1980}
                max={2035}
                value={form.endYear}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    endYear: parseInt(e.target.value) || 2024,
                  }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200/50">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="text-xs px-3 py-1.5 text-muted-foreground cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="text-xs px-4 py-1.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary/95 cursor-pointer shadow-sm shadow-primary/10"
            >
              {editingId ? "Save Changes" : "Add Education"}
            </button>
          </div>
        </div>
      )}

      {education.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-xl border-gray-300">
          <GraduationCap className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-500">
            No education entries yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Add your academic background
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {education.map((edu) => (
            <div
              key={edu._id || edu.institution}
              className="border rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200 bg-white group relative flex items-center justify-between"
            >
              <div className="space-y-1 pr-16">
                <h4 className="font-semibold text-gray-900 text-sm">
                  {edu.degree} in {edu.field}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {edu.institution} &middot; {edu.startYear} –{" "}
                  {edu.endYear || "Expected"}
                </p>
                {edu.gpa && (
                  <p className="text-[10px] text-gray-500 font-medium bg-gray-50 px-2 py-0.5 border rounded-full w-fit">
                    GPA: {edu.gpa}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditStart(edu)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-primary transition-colors cursor-pointer"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(edu._id!)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Certifications Section
// ══════════════════════════════════════════════════════════════
interface CertificationsSectionProps {
  certifications: ICertification[];
  onAdd: (c: Omit<ICertification, "_id">) => void;
  onUpdate: (id: string, c: Partial<ICertification>) => void;
  onDelete: (id: string) => void;
}

function CertificationsSection({
  certifications,
  onAdd,
  onUpdate,
  onDelete,
}: CertificationsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    issuer: "",
    date: "",
    credentialUrl: "",
  });

  function handleEditStart(c: ICertification) {
    setEditingId(c._id || null);
    setForm({
      name: c.name,
      issuer: c.issuer,
      date: c.date || "",
      credentialUrl: c.credentialUrl || "",
    });
    setShowForm(true);
  }

  function handleSave() {
    if (!form.name.trim() || !form.issuer.trim()) return;
    const payload = {
      name: form.name,
      issuer: form.issuer,
      date: form.date,
      credentialUrl: form.credentialUrl || undefined,
    };
    if (editingId) {
      onUpdate(editingId, payload);
    } else {
      onAdd(payload);
    }
    setShowForm(false);
    setEditingId(null);
    setForm({ name: "", issuer: "", date: "", credentialUrl: "" });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          Certifications ({certifications.length})
        </h3>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
          }}
          className="text-xs px-3 py-1.5 bg-primary/10 text-primary font-semibold rounded-lg hover:bg-primary/20 cursor-pointer transition-colors"
        >
          {showForm ? "Close Form" : "+ Add Certification"}
        </button>
      </div>

      {showForm && (
        <div className="border border-gray-200 rounded-xl p-5 bg-gray-50/50 space-y-4 shadow-inner">
          <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wide">
            {editingId ? "Edit Certification" : "Add Certification"}
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Certification Name *
              </label>
              <input
                placeholder="e.g., AWS Solutions Architect"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Issuer / Organization *
              </label>
              <input
                placeholder="e.g., Amazon Web Services"
                value={form.issuer}
                onChange={(e) =>
                  setForm((f) => ({ ...f, issuer: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Date Achieved *
              </label>
              <input
                placeholder="e.g., 2023-08"
                value={form.date}
                onChange={(e) =>
                  setForm((f) => ({ ...f, date: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">
                Verification URL
              </label>
              <input
                placeholder="https://credly.com/..."
                value={form.credentialUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, credentialUrl: e.target.value }))
                }
                className="px-3 py-2 border rounded-lg text-sm bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200/50">
            <button
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
              className="text-xs px-3 py-1.5 text-muted-foreground cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="text-xs px-4 py-1.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary/95 cursor-pointer shadow-sm shadow-primary/10"
            >
              {editingId ? "Save Changes" : "Add Certification"}
            </button>
          </div>
        </div>
      )}

      {certifications.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-xl border-gray-300">
          <Award className="w-12 h-12 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-gray-500">
            No certifications yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Showcase your verified professional credentials
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {certifications.map((c) => (
            <div
              key={c._id || c.name}
              className="border rounded-xl p-4 hover:border-primary/20 hover:shadow-sm transition-all duration-200 bg-white group relative flex justify-between items-center"
            >
              <div className="space-y-1.5 pr-16">
                <h4 className="font-semibold text-gray-900 text-sm">
                  {c.name}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {c.issuer} &middot; {c.date}
                </p>
                {c.credentialUrl && (
                  <a
                    href={sanitizeUrl(c.credentialUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-primary font-bold hover:underline"
                  >
                    Verify Credential →
                  </a>
                )}
              </div>

              {/* Action Buttons */}
              <div className="absolute right-4 top-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEditStart(c)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-primary transition-colors cursor-pointer"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(c._id!)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Links Section
// ══════════════════════════════════════════════════════════════
interface LinksSectionProps {
  links: ILinks;
  onUpdate: (links: ILinks) => void;
  isSaving: boolean;
}

function LinksSection({ links, onUpdate, isSaving }: LinksSectionProps) {
  const [form, setForm] = useState({
    github: links.github || "",
    linkedin: links.linkedin || "",
    portfolio: links.portfolio || "",
    website: links.website || "",
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    onUpdate({
      github: form.github || undefined,
      linkedin: form.linkedin || undefined,
      portfolio: form.portfolio || undefined,
      website: form.website || undefined,
    });
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 max-w-xl">
      <h3 className="font-semibold text-gray-900 mb-3">
        Online Presence Profiles
      </h3>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
          <Linkedin className="w-4 h-4 text-blue-600" />
          LinkedIn URL
        </label>
        <input
          placeholder="https://linkedin.com/in/username"
          value={form.linkedin}
          onChange={(e) => setForm((f) => ({ ...f, linkedin: e.target.value }))}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
          <Github className="w-4 h-4 text-gray-800" />
          GitHub Profile URL
        </label>
        <input
          placeholder="https://github.com/username"
          value={form.github}
          onChange={(e) => setForm((f) => ({ ...f, github: e.target.value }))}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
          <Globe className="w-4 h-4 text-green-600" />
          Personal Portfolio Link
        </label>
        <input
          placeholder="https://myportfolio.dev"
          value={form.portfolio}
          onChange={(e) =>
            setForm((f) => ({ ...f, portfolio: e.target.value }))
          }
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
          <Globe className="w-4 h-4 text-gray-500" />
          Other Personal Website
        </label>
        <input
          placeholder="https://myblog.com"
          value={form.website}
          onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
          className="px-3 py-2 border rounded-lg text-sm bg-white"
        />
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={isSaving}
          className="px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/95 disabled:opacity-50 cursor-pointer shadow-sm shadow-primary/10 flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving Links...
            </>
          ) : (
            "Save Profiles & Links"
          )}
        </button>
      </div>
    </form>
  );
}
