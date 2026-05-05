import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

// ─── Types ────────────────────────────────────────────────────
interface ISkill { _id?: string; name: string; category: string; yearsOfExperience: number; proficiency: string; isHighlighted: boolean; }
interface IBullet { id: string; text: string; tags: string[]; }
interface IExperience { _id?: string; company: string; role: string; startDate: string; endDate: string | null; location: string; isCurrentRole: boolean; description: string; bullets: IBullet[]; }
interface IProject { _id?: string; name: string; description: string; techStack: string[]; tags: string[]; link?: string; github?: string; startDate: string; endDate?: string; highlights: string[]; }
interface IEducation { _id?: string; institution: string; degree: string; field: string; startYear: number; endYear?: number; gpa?: string; }
interface ILinks { github?: string; linkedin?: string; portfolio?: string; website?: string; }

interface IProfile {
  _id: string;
  summary: string;
  skills: ISkill[];
  experience: IExperience[];
  projects: IProject[];
  education: IEducation[];
  links: ILinks;
}

const SKILL_CATEGORIES = ['frontend', 'backend', 'devops', 'ai', 'mobile', 'database', 'other'] as const;
const PROFICIENCY_LEVELS = ['beginner', 'intermediate', 'advanced', 'expert'] as const;
const BULLET_TAGS = ['frontend', 'backend', 'devops', 'ai', 'testing', 'leadership'] as const;

const CATEGORY_COLORS: Record<string, string> = {
  frontend: 'bg-blue-100 text-blue-700 border-blue-200',
  backend: 'bg-green-100 text-green-700 border-green-200',
  devops: 'bg-orange-100 text-orange-700 border-orange-200',
  ai: 'bg-purple-100 text-purple-700 border-purple-200',
  mobile: 'bg-pink-100 text-pink-700 border-pink-200',
  database: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  other: 'bg-gray-100 text-gray-700 border-gray-200',
};

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'skills' | 'experience' | 'projects' | 'education' | 'links'>('skills');

  // ─── Fetch Profile ─────────────────────────────────────────
  const { data: profileRes, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<{ profile: IProfile }>('/profile'),
  });
  const profile = profileRes?.data?.profile || ({} as Partial<IProfile>);

  // ─── Summary Update ────────────────────────────────────────
  const updateSummaryMutation = useMutation({
    mutationFn: (summary: string) => api.put<{ profile: IProfile }>('/profile', { summary }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); },
  });

  // ─── Skill Mutations ───────────────────────────────────────
  const addSkillMutation = useMutation({
    mutationFn: (skill: Omit<ISkill, '_id'>) => api.post('/profile/skills', skill),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); },
  });

  // ─── Experience Mutations ──────────────────────────────────
  const addExpMutation = useMutation({
    mutationFn: (exp: Omit<IExperience, '_id'>) => api.post('/profile/experience', exp),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); },
  });

  // ─── Project Mutation ───────────────────────────────────────
  const addProjectMutation = useMutation({
    mutationFn: (proj: Omit<IProject, '_id'>) => api.post('/profile/projects', proj),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profile'] }); },
  });

  if (isLoading) {
    return <div className="p-8"><div className="animate-pulse h-64 bg-gray-200 rounded-xl" /></div>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Master Profile</h1>
        <p className="text-sm text-muted-foreground">Your source of truth for all resume content</p>
      </div>

      {/* Professional Summary */}
      <section className="bg-white rounded-xl border p-6 shadow-sm">
        <h2 className="font-semibold mb-3">Professional Summary</h2>
        <textarea
          defaultValue={profile.summary || ''}
          placeholder="Write a brief professional summary (2-3 sentences). This will be auto-tailored per JD."
          rows={3}
          onBlur={(e) => {
            if (e.target.value !== (profile.summary || '')) {
              updateSummaryMutation.mutate(e.target.value);
            }
          }}
          className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none resize-none"
        />
      </section>

      {/* Tabs Navigation */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        {(['skills', 'experience', 'projects', 'education'] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer capitalize ${activeTab === tab ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border p-6 shadow-sm min-h-[400px]">
        {activeTab === 'skills' && (
          <SkillsSection skills={profile.skills || []} onAdd={(s) => addSkillMutation.mutate(s)} />
        )}
        {activeTab === 'experience' && (
          <ExperienceSection experiences={profile.experience || []} onAdd={(e) => addExpMutation.mutate(e)} />
        )}
        {activeTab === 'projects' && (
          <ProjectsSection projects={profile.projects || []} onAdd={(p) => addProjectMutation.mutate(p)} />
        )}
        {activeTab === 'education' && (
          <EducationSection education={profile.education || []} />
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// Sub-components for each tab section
// ══════════════════════════════════════════════════════════════

function SkillsSection({ skills, onAdd }: { skills: ISkill[]; onAdd: (skill: Omit<ISkill, '_id'>) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'frontend' as string, yearsOfExperience: 1, proficiency: 'intermediate' as string, isHighlighted: false });

  function handleAdd() {
    if (!form.name.trim()) return;
    onAdd(form as Omit<ISkill, '_id'>);
    setForm({ name: '', category: 'frontend', yearsOfExperience: 1, proficiency: 'intermediate', isHighlighted: false });
    setShowForm(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Skill Inventory ({skills.length})</h3>
        <button onClick={() => setShowForm(!showForm)} className="text-sm px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 cursor-pointer transition-colors">
          + Add Skill
        </button>
      </div>

      {showForm && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="e.g., React" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
            <select value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              {SKILL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input type="number" min={0} max={50} step={0.5} value={form.yearsOfExperience} onChange={(e) => setForm(f => ({ ...f, yearsOfExperience: parseFloat(e.target.value) }))} className="px-3 py-2 border rounded-lg text-sm" placeholder="Years" />
            <select value={form.proficiency} onChange={(e) => setForm(f => ({ ...f, proficiency: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm">
              {PROFICIENCY_LEVELS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5 text-muted-foreground hover:text-foreground cursor-pointer">Cancel</button>
            <button onClick={handleAdd} className="text-sm px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 cursor-pointer">Add Skill</button>
          </div>
        </div>
      )}

      {skills.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No skills added yet. Start building your inventory!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((skill) => (
            <div key={skill._id || skill.name} className="border rounded-lg p-3 flex items-start justify-between group hover:border-primary/30 transition-colors">
              <div>
                <span className="font-medium">{skill.name}</span>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.other}`}>{skill.category}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{skill.proficiency}</span>
                  <span className="text-xs text-muted-foreground">{skill.yearsOfExperience}y</span>
                </div>
              </div>
              {skill.isHighlighted && <span className="text-yellow-500 text-lg" title="Pinned">&#11088;</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExperienceSection({ experiences, onAdd }: { experiences: IExperience[]; onAdd: (exp: Omit<IExperience, '_id'>) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    company: '', role: '', startDate: '', endDate: '', location: '', isCurrentRole: true,
    description: '', bullets: [{ id: crypto.randomUUID(), text: '', tags: [] }],
  });

  function addBullet() {
    setForm(f => ({ ...f, bullets: [...f.bullets, { id: crypto.randomUUID(), text: '', tags: [] }] }));
  }

  function removeBullet(id: string) {
    setForm(f => ({ ...f, bullets: f.bullets.filter(b => b.id !== id) }));
  }

  function updateBullet(id: string, field: string, value: unknown) {
    setForm(f => ({
      ...f,
      bullets: f.bullets.map(b => b.id === id ? { ...b, [field]: value } : b),
    }));
  }

  function handleAdd() {
    if (!form.company.trim() || !form.role.trim()) return;
    const payload = {
      company: form.company, role: form.role, startDate: form.startDate,
      endDate: form.isCurrentRole ? null : form.endDate || undefined, location: form.location || '',
      isCurrentRole: form.isCurrentRole, description: form.description,
      bullets: form.bullets.filter(b => b.text.trim()),
    };
    onAdd(payload as Omit<IExperience, '_id'>);
    setShowForm(false);
    setForm({ company: '', role: '', startDate: '', endDate: '', location: '', isCurrentRole: true, description: '', bullets: [{ id: crypto.randomUUID(), text: '', tags: [] }] });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Experience Blocks ({experiences.length})</h3>
        <button onClick={() => setShowForm(!showForm)} className="text-sm px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 cursor-pointer transition-colors">
          + Add Experience
        </button>
      </div>

      {showForm && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Company" value={form.company} onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="Role / Title" value={form.role} onChange={(e) => setForm(f => ({ ...f, role: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
            <input type="month" value={form.startDate} onChange={(e) => setForm(f => ({ ...f, startDate: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
            {!form.isCurrentRole && <input type="month" value={form.endDate} onChange={(e) => setForm(f => ({ ...f, endDate: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />}
            <input placeholder="Location" value={form.location} onChange={(e) => setForm(f => ({ ...f, location: e.target.value }))} className="px-3 py-2 border rounded-lg text-sm" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isCurrentRole} onChange={(e) => setForm(f => ({ ...f, isCurrentRole: e.target.checked }))} /> Current Role</label>
          </div>

          {/* Bullets */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Achievement Bullets</label>
            {form.bullets.map((bullet) => (
              <div key={bullet.id} className="flex gap-2 items-start">
                <input placeholder="What did you achieve? Use metrics!" value={bullet.text} onChange={(e) => updateBullet(bullet.id, 'text', e.target.value)} className="flex-1 px-3 py-2 border rounded-lg text-sm" />
                <div className="flex gap-1 flex-wrap min-w-fit">
                  {BULLET_TAGS.map((tag) => (
                    <button key={tag} onClick={() => {
                      const currentTags = bullet.tags.includes(tag) ? bullet.tags.filter(t => t !== tag) : [...bullet.tags, tag];
                      updateBullet(bullet.id, 'tags', currentTags);
                    }} className={`text-xs px-2 py-1 rounded border cursor-pointer ${bullet.tags.includes(tag) ? 'bg-primary text-white border-primary' : 'bg-white'}`}>{tag}</button>
                  ))}
                </div>
                <button onClick={() => removeBullet(bullet.id)} className="text-red-400 hover:text-red-600 text-sm cursor-pointer">&times;</button>
              </div>
            ))}
            <button onClick={addBullet} className="text-sm text-primary cursor-pointer">+ Add Bullet</button>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5 text-muted-foreground cursor-pointer">Cancel</button>
            <button onClick={handleAdd} className="text-sm px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 cursor-pointer">Add Experience</button>
          </div>
        </div>
      )}

      {experiences.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No experience blocks yet. Add your work history!</p>
      ) : (
        <div className="space-y-3">
          {experiences.map((exp) => (
            <div key={exp._id || `${exp.company}-${exp.role}`} className="border rounded-lg p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-semibold">{exp.role}</h4>
                  <p className="text-sm text-muted-foreground">{exp.company} &middot; {exp.startDate}{` → `}{exp.endDate || 'Present'}</p>
                </div>
                {exp.isCurrentRole && <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-200">Current</span>}
              </div>
              {exp.description && <p className="text-sm text-muted-foreground mb-2">{exp.description}</p>}
              <ul className="space-y-1">
                {exp.bullets?.filter(b => b.text).map((b) => (
                  <li key={b.id} className="text-sm flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    <span>{b.text}</span>
                    {b.tags?.length > 0 && (
                      <div className="flex gap-1 ml-auto shrink-0">
                        {b.tags.map((t) => (
                          <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border ${CATEGORY_COLORS[t] || CATEGORY_COLORS.other}`}>{t}</span>
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

function ProjectsSection({ projects, onAdd }: { projects: IProject[]; onAdd: (proj: Omit<IProject, '_id'>) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '', techStack: '', tags: [] as string[],
    link: '', github: '', startDate: '', highlights: ['', ''],
  });

  function handleAdd() {
    if (!form.name.trim()) return;
    onAdd({
      name: form.name, description: form.description, techStack: form.techStack.split(',').map(t => t.trim()).filter(Boolean),
      tags: form.tags, link: form.link || undefined, github: form.github || undefined, startDate: form.startDate,
      highlights: form.highlights.filter(h => h.trim()),
    } as Omit<IProject, '_id'>);
    setShowForm(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Project Bank ({projects.length})</h3>
        <button onClick={() => setShowForm(!showForm)} className="text-sm px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 cursor-pointer transition-colors">+ Add Project</button>
      </div>

      {showForm && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <input placeholder="Project Name" value={form.name} onChange={(e) => setForm(f => ({...f, name: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <textarea placeholder="Brief description..." value={form.description} onChange={(e) => setForm(f => ({...f, description: e.target.value}))} rows={2} className="w-full px-3 py-2 border rounded-lg text-sm resize-none" />
          <input placeholder="Tech Stack (comma-separated)" value={form.techStack} onChange={(e) => setForm(f => ({...f, techStack: e.target.value}))} className="w-full px-3 py-2 border rounded-lg text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Link (optional)" value={form.link} onChange={(e) => setForm(f => ({...f, link: e.target.value}))} className="px-3 py-2 border rounded-lg text-sm" />
            <input placeholder="GitHub URL (optional)" value={form.github} onChange={(e) => setForm(f => ({...f, github: e.target.value}))} className="px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="text-sm px-3 py-1.5 text-muted-foreground cursor-pointer">Cancel</button>
            <button onClick={handleAdd} className="text-sm px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-primary/90 cursor-pointer">Add Project</button>
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No projects yet. Add your best work!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <div key={project._id || project.name} className="border rounded-lg p-4 hover:border-primary/30 transition-colors">
              <h4 className="font-semibold">{project.name}</h4>
              <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {(project.techStack || []).map((tech) => (
                  <span key={tech} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{tech}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EducationSection({ education }: { education: IEducation[] }) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold">Education ({education.length})</h3>
      {education.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No education entries yet.</p>
      ) : (
        <div className="space-y-3">
          {education.map((edu) => (
            <div key={edu._id || edu.institution} className="border rounded-lg p-4">
              <h4 className="font-semibold">{edu.degree} in {edu.field}</h4>
              <p className="text-sm text-muted-foreground">{edu.institution} ({edu.startYear}{edu.endYear ? ` – ${edu.endYear}` : ''}){edu.gpa ? ` · GPA: ${edu.gpa}` : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
