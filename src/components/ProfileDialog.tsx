import React, { useState } from 'react';
import type { StudentProfile } from '../types';
import API_BASE_URL, { apiFetch } from '../config';

interface ProfileDialogProps {
    onSave: (profile: StudentProfile) => void;
    onClose: () => void;
    title?: string;
    initialProfile?: StudentProfile | null;
}

export const ProfileDialog: React.FC<ProfileDialogProps> = ({ onSave, onClose, title = "Personalize Your AI", initialProfile = null }) => {
    const [profile, setProfile] = useState<StudentProfile>({
        degree: initialProfile?.degree || '',
        branch: initialProfile?.branch || '',
        year: initialProfile?.year || '',
        domain: initialProfile?.domain || '',
        skills: initialProfile?.skills || []
    });
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const degrees = ["B.Tech", "BCA", "B.Sc", "M.Tech", "M.Sc", "MCA"];
    const domains = [
        "Full Stack Development",
        "Generative AI & Machine Learning",
        "Cyber Security",
        "DevOps & Cloud Engineering",
        "Cloud Solutions Architecture",
        "UI/UX Design",
        "Core CS & Algorithms",
        "Data Engineering & MLOps",
        "Quantum Computing"
    ];

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setError(null);
        const formData = new FormData();
        formData.append('file', file);
        const user = JSON.parse(localStorage.getItem('eduzyniq_user') || '{}');
        if (user.email) formData.append('user_email', user.email);

        try {
            const response = await apiFetch(`${API_BASE_URL}/upload-resume`, {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (data.success) {
                setProfile(prev => ({
                    ...prev,
                    domain: data.analysis.domain || prev.domain,
                    skills: data.analysis.skills || prev.skills
                }));
            } else {
                setError(data.error || 'Failed to analyze resume. Supported formats: PDF, DOCX, IMG.');
            }
        } catch (err) {
            console.error('OCR Upload failed', err);
            setError('Connection error. Is the backend running?');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(34, 120, 70, 0.15)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000,
            padding: '20px'
        }}>
            <div className="glass-card fade-in" style={{
                maxWidth: '650px',
                width: '100%',
                padding: 'var(--spacing-xl)',
                border: '1px solid var(--primary-500)',
                position: 'relative',
                boxShadow: '0 0 40px rgba(34, 140, 80, 0.20)'
            }}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '24px',
                        right: '24px',
                        background: 'rgba(255,255,255,0.05)',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >✕</button>

                <h2 className="gradient-text mb-sm" style={{ fontSize: '1.8rem', fontWeight: 800 }}>{title}</h2>
                <p className="mb-md" style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: '90%' }}>
                    Complete your academic profile to unlock specialized mentorship and personalized career roadmaps.
                </p>

                <div className="flex-col gap-md">
                    <div className="grid-2 gap-sm">
                        <div className="flex-col gap-xs">
                            <label style={{ fontSize: '0.75rem', color: 'var(--primary-400)', fontWeight: 800, letterSpacing: '0.05em' }}>DEGREE</label>
                            <select
                                className="input-field"
                                value={profile.degree}
                                onChange={e => setProfile({ ...profile, degree: e.target.value })}
                            >
                                <option value="">Select Degree</option>
                                {degrees.map(d => <option key={d} value={d} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>{d}</option>)}
                            </select>
                        </div>

                        <div className="flex-col gap-xs">
                            <label style={{ fontSize: '0.75rem', color: 'var(--primary-400)', fontWeight: 800, letterSpacing: '0.05em' }}>ACADEMIC YEAR</label>
                            <select
                                className="input-field"
                                value={profile.year}
                                onChange={e => setProfile({ ...profile, year: e.target.value })}
                            >
                                <option value="">Select Year</option>
                                <option value="1st Year" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>1st Year</option>
                                <option value="2nd Year" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>2nd Year</option>
                                <option value="3rd Year" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>3rd Year</option>
                                <option value="4th Year" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>4th Year</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex-col gap-xs">
                        <label style={{ fontSize: '0.75rem', color: 'var(--primary-400)', fontWeight: 800, letterSpacing: '0.05em' }}>PRIMARY DOMAIN INTEREST</label>
                        <select
                            className="input-field"
                            value={profile.domain}
                            onChange={e => setProfile({ ...profile, domain: e.target.value })}
                        >
                            <option value="">Select Domain</option>
                            {domains.map(dom => <option key={dom} value={dom} style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>{dom}</option>)}
                        </select>
                    </div>

                    <div className="flex-col gap-xs">
                        <label style={{ fontSize: '0.75rem', color: 'var(--primary-400)', fontWeight: 800, letterSpacing: '0.05em' }}>BRANCH / UNIVERSITY</label>
                        <input
                            placeholder="e.g. Computer Science, VIT University"
                            className="input-field"
                            value={profile.branch}
                            onChange={e => setProfile({ ...profile, branch: e.target.value })}
                        />
                    </div>

                    <div style={{
                        padding: 'var(--spacing-sm)',
                        background: 'rgba(52, 160, 90, 0.04)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px dashed rgba(52, 160, 90, 0.35)',
                        marginTop: '0.5rem'
                    }}>
                        <div className="flex justify-between items-center gap-md">
                            <div style={{ flex: 1 }}>
                                <h4 style={{ fontSize: '0.95rem', marginBottom: '2px', color: 'var(--text-primary)' }}>AI Resume Sync (Optional)</h4>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Upload your PDF, Word, or Image resume for auto-profiling.</p>
                            </div>
                            <label className="btn btn-secondary" style={{ cursor: 'pointer', padding: '0.5rem 1rem', fontSize: '0.8rem', border: '1px solid var(--primary-500)' }}>
                                {isUploading ? '⚡ Analyzing...' : '📄 Upload'}
                                <input type="file" hidden accept=".pdf,.doc,.docx,image/*" onChange={handleFileUpload} />
                            </label>
                        </div>
                        {error && (
                            <div className="mt-sm fade-in" style={{
                                padding: '8px 12px',
                                background: 'rgba(255, 50, 50, 0.05)',
                                borderLeft: '3px solid var(--accent-red)',
                                borderRadius: '4px'
                            }}>
                                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-red)' }}>⚠️ {error}</p>
                            </div>
                        )}
                        {profile.domain && !error && (
                            <div className="mt-sm fade-in" style={{
                                padding: '8px 12px',
                                background: 'rgba(0, 255, 128, 0.05)',
                                borderLeft: '3px solid var(--accent-green)',
                                borderRadius: '4px'
                            }}>
                                <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent-green)' }}>🎯 Recommended Path: {profile.domain}</p>
                            </div>
                        )}
                    </div>

                    <button
                        className="btn btn-primary mt-sm"
                        style={{ width: '100%', justifyContent: 'center', height: '50px', fontSize: '1rem', fontWeight: 700 }}
                        onClick={() => onSave(profile)}
                        disabled={!profile.degree || !profile.domain || !profile.year}
                    >
                        Save & Access Student Portal 🚀
                    </button>
                </div>
            </div>
        </div>
    );
};
