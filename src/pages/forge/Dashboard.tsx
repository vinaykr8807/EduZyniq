import { useState } from 'react';
import { CURRICULUM_DATA } from '../../data/curriculumData';

export const ForgeDashboard = ({ profile, progress, stats, onSelectModule }: any) => {
    const [expandedRoadmap, setExpandedRoadmap] = useState<string | null>('cloud');

    return (
        <div className="flex-col gap-2xl fade-in" style={{ padding: '0 0 4rem', color: '#1e293b' }}>
            {/* 1. Header Area */}
            <div className="flex justify-between items-start">
                <div className="flex-col gap-xs">
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Career Forge</h2>
                    <h1 style={{ fontSize: '2.2rem', fontWeight: 900, margin: '0.5rem 0 0' }}>
                        Forge <span style={{ color: '#3b82f6' }}>Launchpad</span>
                    </h1>
                    <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                        {profile?.domain || 'Full-stack Developer'}
                    </p>
                    <div className="flex gap-sm">
                        <span style={{ 
                            background: '#eff6ff', color: '#3b82f6', padding: '0.4rem 1rem', 
                            borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800 
                        }}>
                            Level {progress?.level || 1}
                        </span>
                        <span style={{ 
                            color: '#64748b', fontSize: '0.8rem', fontWeight: 700, 
                            display: 'flex', alignItems: 'center', gap: '6px' 
                        }}>
                            💎 {progress?.points || 0} XP
                        </span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '3rem' }}>
                <div className="flex-col gap-2xl">
                    {/* 📊 2. Statistics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                        {[
                            { label: 'Quiz Accuracy', val: stats?.quiz_accuracy || 0, icon: '🎯', color: '#3b82f6' },
                            { label: 'Interview Readiness', val: stats?.interview_score || 0, icon: '👔', color: '#8b5cf6' },
                            { label: 'Code Optimization', val: stats?.code_optimization || 0, icon: '⚡', color: '#10b981' }
                        ].map(s => (
                            <div key={s.label} className="glass-card" style={{ 
                                padding: '1.75rem 2rem', background: 'white', border: '1px solid #f1f5f9',
                                boxShadow: '0 10px 30px rgba(0,0,0,0.02)', borderRadius: '24px'
                            }}>
                                <div className="flex items-center gap-sm mb-lg">
                                    <div style={{ 
                                        width: '32px', height: '32px', borderRadius: '8px', background: `${s.color}10`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem'
                                    }}>{s.icon}</div>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b' }}>{s.label}</span>
                                </div>
                                <h3 style={{ fontSize: '2.5rem', fontWeight: 900, color: '#0f172a', margin: '0 0 1.25rem' }}>{s.val}%</h3>
                                <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '100px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${s.val}%`, background: s.color, borderRadius: '100px' }}></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 🧩 3. Modules Launchpad */}
                    <div className="flex-col gap-lg">
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#0f172a' }}>Modules</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
                            {[
                                { id: 'INTERVIEWER', name: 'Interview Coach', desc: 'Ace every interview', icon: '🎤' },
                                { id: 'TEACHER', name: 'AI Teacher', desc: 'Learn anything', icon: '🎓' },
                                { id: 'QUIZ', name: 'Quiz Master', desc: 'Test your knowledge', icon: '📝' }
                            ].map(m => (
                                <div 
                                    key={m.id}
                                    onClick={() => onSelectModule(m.id)}
                                    className="glass-card hover-lift"
                                    style={{ 
                                        padding: '1.5rem', background: 'white', border: '1px solid #f1f5f9',
                                        borderRadius: '24px', cursor: 'pointer', display: 'flex', 
                                        alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.01)'
                                    }}
                                >
                                    <div style={{ 
                                        width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
                                        marginRight: '1rem'
                                    }}>{m.icon}</div>
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{m.name}</h4>
                                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>{m.desc}</p>
                                    </div>
                                    <span style={{ color: '#cbd5e1', fontSize: '1rem' }}>›</span>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
                            {[
                                { id: 'CODING_MENTOR', name: 'Coding Mentor', desc: 'Master the code', icon: '💻' },
                                { id: 'ROADMAP', name: 'Career Pathfinder', desc: 'Navigate your career', icon: '🗺️' }
                            ].map(m => (
                                <div 
                                    key={m.id}
                                    onClick={() => onSelectModule(m.id)}
                                    className="glass-card hover-lift"
                                    style={{ 
                                        padding: '1.5rem', background: 'white', border: '1px solid #f1f5f9',
                                        borderRadius: '24px', cursor: 'pointer', display: 'flex', 
                                        alignItems: 'center', boxShadow: '0 10px 25px rgba(0,0,0,0.01)'
                                    }}
                                >
                                    <div style={{ 
                                        width: '48px', height: '48px', borderRadius: '12px', background: '#eff6ff',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
                                        marginRight: '1rem'
                                    }}>{m.icon}</div>
                                    <div style={{ flex: 1 }}>
                                        <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{m.name}</h4>
                                        <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>{m.desc}</p>
                                    </div>
                                    <span style={{ color: '#cbd5e1', fontSize: '1rem' }}>›</span>
                                </div>
                            ))}
                            <div style={{ opacity: 0, pointerEvents: 'none' }}></div>
                        </div>
                    </div>
                </div>

                {/* 🛡️ 4. Sidebar: Activity & Tracking */}
                <aside className="flex-col gap-lg">
                    {/* Floating Operation Status Badge */}
                    <div style={{ 
                        background: 'white', border: '1px solid #f1f5f9', color: '#0f172a',
                        padding: '0.6rem 1.4rem', borderRadius: '100px', fontSize: '0.72rem', 
                        fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)', width: 'fit-content', margin: '0 0 -0.5rem 0.5rem'
                    }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                            <circle cx="12" cy="12" r="10" stroke="#22c55e" fill="transparent" strokeWidth="2" />
                        </svg>
                        SYSTEM STATUS: OPERATIONAL
                    </div>

                    {/* Collapsible Roadmaps Section */}
                    <div className="glass-card" style={{ padding: '2rem', background: 'white', border: '1px solid #f1f5f9', borderRadius: '24px' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.5rem' }}>Roadmaps</h4>
                        <div className="flex-col gap-sm">
                            {CURRICULUM_DATA.map((roadmap) => (
                                <div key={roadmap.id} className="flex-col">
                                    <button 
                                        onClick={() => setExpandedRoadmap(expandedRoadmap === roadmap.id ? null : roadmap.id)}
                                        style={{ 
                                            display: 'flex', alignItems: 'center', gap: '8px', 
                                            padding: '0.6rem 0', border: 'none', background: 'none',
                                            cursor: 'pointer', width: '100%', textAlign: 'left'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', transition: 'transform 0.2s', transform: expandedRoadmap === roadmap.id ? 'rotate(90deg)' : 'none' }}>›</span>
                                        <span style={{ fontSize: '0.85rem', fontWeight: expandedRoadmap === roadmap.id ? 700 : 600, color: expandedRoadmap === roadmap.id ? '#3b82f6' : '#64748b' }}>
                                            {roadmap.title}
                                        </span>
                                    </button>
                                    
                                    {expandedRoadmap === roadmap.id && (
                                        <div className="flex-col gap-md fade-in" style={{ padding: '0.5rem 0 0.75rem 1.75rem', borderLeft: '1px solid #f1f5f9', marginLeft: '4px' }}>
                                            {roadmap.phases.map((phase: any) => (
                                                <div key={phase.name} className="flex-col gap-xs">
                                                    <span style={{ fontSize: '0.8rem', color: '#1e293b', fontWeight: 700 }}>{phase.name}</span>
                                                    <div className="flex-col gap-xs">
                                                        {phase.milestones.map((m: any) => (
                                                            <span key={m.title} style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{m.title}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rewards Card */}
                    <div className="glass-card" style={{ padding: '1.75rem 2rem', background: 'white', border: '1px solid #f1f5f9', borderRadius: '24px' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a', marginBottom: '1.25rem' }}>Rewards</h4>
                        <div className="flex-col gap-md">
                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>No badges yet</p>
                            <span style={{ fontSize: '1rem', fontWeight: 900, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                ⚡ 0 day streak
                            </span>
                        </div>
                    </div>

                    {/* Next Objective Card */}
                    <div className="glass-card" style={{ padding: '2rem', background: '#eff6ff', border: '1px solid #dbeafe', borderRadius: '24px' }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 900, color: '#3b82f6', marginBottom: '1rem' }}>Next Objective</h4>
                        <p style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                            Complete your first quiz to unlock adaptive learning paths.
                        </p>
                        <button 
                            onClick={() => onSelectModule('QUIZ')}
                            className="btn btn-primary" 
                            style={{ width: '100%', padding: '0.75rem', borderRadius: '12px', fontSize: '0.85rem' }}
                        >
                            Start Analysis
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};
