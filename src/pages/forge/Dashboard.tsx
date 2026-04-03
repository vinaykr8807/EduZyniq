import { useState } from 'react';
import { CURRICULUM_DATA } from '../../data/curriculumData';

const moduleList1 = [
    { id: 'INTERVIEWER',   name: 'Interview Coach',  desc: 'Ace every interview',    icon: '🎤' },
    { id: 'TEACHER',       name: 'AI Teacher',        desc: 'Learn anything',         icon: '🎓' },
    { id: 'QUIZ',          name: 'Quiz Master',       desc: 'Test your knowledge',    icon: '📝' },
];
const moduleList2 = [
    { id: 'CODING_MENTOR', name: 'Coding Mentor',    desc: 'Master the code',        icon: '💻' },
    { id: 'ROADMAP',       name: 'Career Pathfinder', desc: 'Navigate your career',  icon: '🗺️' },
];

export const ForgeDashboard = ({ profile, progress, stats, onSelectModule }: any) => {
    const [expandedRoadmap, setExpandedRoadmap] = useState<string | null>('cloud');

    const statAccent = ['var(--accent-blue)', 'var(--secondary-500)', 'var(--accent-green)'];

    return (
        <div className="flex-col gap-2xl fade-in" style={{ padding: '0 0 4rem', color: 'var(--text-primary)', transition: 'color 0.4s ease' }}>

            {/* 1. Header */}
            <div className="flex-col gap-xs">
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-muted)', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>Career Forge</h2>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 900, margin: '0.25rem 0 0', color: 'var(--text-primary)' }}>
                    Forge <span style={{ color: 'var(--primary-400)' }}>Launchpad</span>
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                    {profile?.domain || 'Full-stack Developer'}
                </p>
                <div className="flex gap-sm">
                    <span style={{
                        background: 'var(--bg-tertiary)', color: 'var(--primary-400)',
                        padding: '0.4rem 1rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 800,
                        border: '1px solid var(--glass-border)'
                    }}>
                        Level {progress?.level || 1}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        💎 {progress?.points || 0} XP
                    </span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2.5rem' }}>
                <div className="flex-col gap-2xl">

                    {/* 2. Stats Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
                        {[
                            { label: 'Quiz Accuracy',       val: stats?.quiz_accuracy  || 0, icon: '🎯', color: statAccent[0] },
                            { label: 'Interview Readiness', val: stats?.interview_score || 0, icon: '👔', color: statAccent[1] },
                            { label: 'Code Optimization',   val: stats?.code_optimization || 0, icon: '⚡', color: statAccent[2] }
                        ].map(s => (
                            <div key={s.label} style={{
                                padding: '1.75rem 2rem',
                                background: 'var(--glass-bg)',
                                backdropFilter: 'blur(16px)',
                                border: '1px solid var(--glass-border)',
                                boxShadow: 'var(--shadow-md)',
                                borderRadius: '20px',
                                transition: 'background 0.4s ease'
                            }}>
                                <div className="flex items-center gap-sm" style={{ marginBottom: '1rem' }}>
                                    <div style={{
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        background: 'var(--bg-tertiary)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
                                        border: '1px solid var(--glass-border)'
                                    }}>{s.icon}</div>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>{s.label}</span>
                                </div>
                                <h3 style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 1.25rem' }}>{s.val}%</h3>
                                <div style={{ height: '5px', background: 'var(--bg-tertiary)', borderRadius: '100px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${s.val}%`, background: s.color, borderRadius: '100px', transition: 'width 0.8s ease' }}></div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 3. Modules Launchpad */}
                    <div className="flex-col gap-lg">
                        <h3 style={{ fontSize: '1rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Modules</h3>
                        {[moduleList1, moduleList2].map((row, ri) => (
                            <div key={ri} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.1rem' }}>
                                {row.map(m => (
                                    <div
                                        key={m.id}
                                        onClick={() => onSelectModule(m.id)}
                                        style={{
                                            padding: '1.4rem 1.6rem',
                                            background: 'var(--glass-bg)',
                                            backdropFilter: 'blur(16px)',
                                            border: '1px solid var(--glass-border)',
                                            borderRadius: '20px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            boxShadow: 'var(--shadow-sm)',
                                            transition: 'all 0.25s ease',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLElement).style.transform = 'translateY(-4px)';
                                            (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary-400)';
                                            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-lg)';
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLElement).style.transform = '';
                                            (e.currentTarget as HTMLElement).style.borderColor = '';
                                            (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)';
                                        }}
                                    >
                                        <div style={{
                                            width: '46px', height: '46px', borderRadius: '12px',
                                            background: 'var(--bg-tertiary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem',
                                            marginRight: '1rem', flexShrink: 0,
                                            border: '1px solid var(--glass-border)'
                                        }}>{m.icon}</div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{m.name}</h4>
                                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>{m.desc}</p>
                                        </div>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '1rem', marginLeft: '0.5rem' }}>›</span>
                                    </div>
                                ))}
                                {/* Fill grid gap on last row */}
                                {row.length < 3 && Array(3 - row.length).fill(null).map((_, i) => (
                                    <div key={`empty-${i}`} style={{ opacity: 0, pointerEvents: 'none' }} />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 4. Sidebar */}
                <aside className="flex-col gap-lg">
                    {/* Status Badge */}
                    <div style={{
                        background: 'var(--glass-bg)', backdropFilter: 'blur(12px)',
                        border: '1px solid var(--glass-border)', color: 'var(--text-primary)',
                        padding: '0.6rem 1.4rem', borderRadius: '100px', fontSize: '0.72rem',
                        fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px',
                        boxShadow: 'var(--shadow-sm)', width: 'fit-content',
                        transition: 'background 0.4s ease'
                    }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                            <circle cx="12" cy="12" r="10" stroke="#22c55e" fill="transparent" strokeWidth="2" />
                        </svg>
                        SYSTEM STATUS: OPERATIONAL
                    </div>

                    {/* Roadmap Explorer */}
                    <div style={{
                        padding: '1.75rem',
                        background: 'var(--glass-bg)', backdropFilter: 'blur(16px)',
                        border: '1px solid var(--glass-border)', borderRadius: '20px',
                        boxShadow: 'var(--shadow-md)',
                        transition: 'background 0.4s ease'
                    }}>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>Roadmaps</h4>
                        <div className="flex-col gap-sm">
                            {CURRICULUM_DATA.map((roadmap) => (
                                <div key={roadmap.id} className="flex-col">
                                    <button
                                        onClick={() => setExpandedRoadmap(expandedRoadmap === roadmap.id ? null : roadmap.id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px',
                                            padding: '0.5rem 0', border: 'none', background: 'none',
                                            cursor: 'pointer', width: '100%', textAlign: 'left'
                                        }}
                                    >
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', transition: 'transform 0.2s', transform: expandedRoadmap === roadmap.id ? 'rotate(90deg)' : 'none', display: 'inline-block' }}>›</span>
                                        <span style={{
                                            fontSize: '0.83rem',
                                            fontWeight: expandedRoadmap === roadmap.id ? 700 : 600,
                                            color: expandedRoadmap === roadmap.id ? 'var(--primary-400)' : 'var(--text-secondary)'
                                        }}>
                                            {roadmap.title}
                                        </span>
                                    </button>

                                    {expandedRoadmap === roadmap.id && (
                                        <div className="flex-col gap-md fade-in" style={{
                                            padding: '0.5rem 0 0.75rem 1.5rem',
                                            borderLeft: '1px solid var(--glass-border)',
                                            marginLeft: '4px'
                                        }}>
                                            {roadmap.phases.map((phase: any) => (
                                                <div key={phase.name} className="flex-col gap-xs">
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 700 }}>{phase.name}</span>
                                                    {phase.milestones.map((m: any) => (
                                                        <span key={m.title} style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{m.title}</span>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Rewards Card */}
                    <div style={{
                        padding: '1.5rem 1.75rem',
                        background: 'var(--glass-bg)', backdropFilter: 'blur(16px)',
                        border: '1px solid var(--glass-border)', borderRadius: '20px',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'background 0.4s ease'
                    }}>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem' }}>Rewards</h4>
                        <div className="flex-col gap-md">
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>No badges yet</p>
                            <span style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--primary-400)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                ⚡ 0 day streak
                            </span>
                        </div>
                    </div>

                    {/* Next Objective Card */}
                    <div style={{
                        padding: '1.75rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--primary-600)',
                        borderLeft: '3px solid var(--primary-400)',
                        borderRadius: '20px',
                        boxShadow: 'var(--shadow-sm)',
                        transition: 'background 0.4s ease'
                    }}>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--primary-400)', marginBottom: '1rem' }}>Next Objective</h4>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '1.5rem' }}>
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
