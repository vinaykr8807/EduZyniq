import { RoadmapSelector } from '../../components/RoadmapSelector';

export const ForgeDashboard = ({ profile, progress, stats, onSelectModule }: any) => {
    return (
        <div className="flex-col gap-xl">
            {/* Header / Snapshot */}
            <header className="flex justify-between items-end">
                <div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '0.2rem' }} className="gradient-text">Forge Launchpad</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                        Integrated AI Operating System for <strong>{profile?.domain || 'Career Development'}</strong>
                    </p>
                </div>
                <div className="glass-card flex items-center gap-md" style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-xl)' }}>
                    <div className="flex-col items-end">
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)' }}>LEVEL</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--accent-blue)' }}>{progress?.level || 1}</span>
                    </div>
                    <div style={{ width: '2px', height: '24px', background: 'var(--glass-border)' }}></div>
                    <div className="flex-col items-end">
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)' }}>TOTAL XP</span>
                        <span style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--accent-green)' }}>{progress?.points || 0}</span>
                    </div>
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }}>
                <div className="flex-col gap-xl">
                    {/* Metrics Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                        <div className="glass-card flex-col gap-md" style={{ padding: '1.25rem', border: '1px solid var(--accent-blue)' }}>
                            <div className="flex justify-between items-center">
                                <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-blue)' }}>QUIZ ACCURACY</span>
                                <span style={{ fontSize: '1.2rem' }}>🎯</span>
                            </div>
                            <h3 style={{ fontSize: '1.8rem', fontWeight: 900 }}>{stats?.quiz_accuracy || 0}%</h3>
                            <div style={{ height: '5px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${stats?.quiz_accuracy || 0}%`, background: 'var(--accent-blue)', borderRadius: '3px' }}></div>
                            </div>
                        </div>
                        <div className="glass-card flex-col gap-md" style={{ padding: '1.25rem', border: '1px solid var(--accent-green)' }}>
                            <div className="flex justify-between items-center">
                                <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-green)' }}>INTERVIEW READINESS</span>
                                <span style={{ fontSize: '1.2rem' }}>👔</span>
                            </div>
                            <h3 style={{ fontSize: '1.8rem', fontWeight: 900 }}>{stats?.interview_score || 0}%</h3>
                            <div style={{ height: '5px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${stats?.interview_score || 0}%`, background: 'var(--accent-green)', borderRadius: '3px' }}></div>
                            </div>
                        </div>
                        <div className="glass-card flex-col gap-md" style={{ padding: '1.25rem', border: '1px solid var(--accent-red)' }}>
                            <div className="flex justify-between items-center">
                                <span style={{ fontSize: '0.65rem', fontWeight: 900, color: 'var(--accent-red)' }}>CODE OPTIMIZATION</span>
                                <span style={{ fontSize: '1.2rem' }}>⚡</span>
                            </div>
                            <h3 style={{ fontSize: '1.8rem', fontWeight: 900 }}>{stats?.code_optimization || 100}%</h3>
                            <div style={{ height: '5px', background: 'var(--bg-tertiary)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${stats?.code_optimization || 100}%`, background: 'var(--accent-red)', borderRadius: '3px' }}></div>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-between items-center" style={{ margin: '1rem 0 1.5rem' }}>
                        <h3 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--text-muted)' }}>Active Intelligence Modules</h3>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                        {[
                            {
                                id: 'INTERVIEWER', icon: '🎤', name: 'Interview Coach',
                                tagline: 'Upload resume → Groq AI detects your skill gaps vs today\'s market demand. Get a readiness score + personalized roadmap.',
                                color: 'var(--accent-blue)', tag: 'Resume · Market AI'
                            },
                            {
                                id: 'TEACHER', icon: '🎓', name: 'AI Teacher',
                                tagline: 'Guided subtopic-by-subtopic learning across all domains. Ask doubts, get Groq AI explanations, download professional PDF notes.',
                                color: 'var(--primary-500)', tag: 'Guided Learning · PDF Notes'
                            },
                            {
                                id: 'QUIZ', icon: '📝', name: 'Quiz Master',
                                tagline: 'Adaptive AI-generated quizzes across your domain. Instant feedback, scoring, and weak topic detection.',
                                color: 'var(--accent-pink)', tag: 'Assessments · Analytics'
                            },
                            {
                                id: 'CODING_MENTOR', icon: '💻', name: 'Coding Mentor',
                                tagline: 'Paste code for deep review, bug detection, optimization suggestions, and complexity analysis by AI.',
                                color: 'var(--accent-green)', tag: 'Code Review · Debug'
                            },
                            {
                                id: 'ROADMAP', icon: '🗺️', name: 'Career Pathfinder',
                                tagline: 'Upload resume + target city → AI fetches live job demand, skill gaps, live job links, and a step-by-step career strategy.',
                                color: 'var(--accent-teal)', tag: 'Market · Jobs · Strategy'
                            },
                        ].map(mod => (
                            <div
                                key={mod.id}
                                className="glass-card hover-lift"
                                style={{ padding: '1.5rem', cursor: 'pointer', border: `1px solid ${mod.color}25`, transition: 'all 0.3s ease' }}
                                onClick={() => onSelectModule(mod.id)}
                            >
                                <div className="flex items-center gap-md" style={{ marginBottom: '0.75rem' }}>
                                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `${mod.color}15`, border: `1px solid ${mod.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                                        {mod.icon}
                                    </div>
                                    <div>
                                        <h4 style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{mod.name}</h4>
                                        <span style={{ fontSize: '0.62rem', color: mod.color, fontWeight: 700, letterSpacing: '0.3px' }}>{mod.tag}</span>
                                    </div>
                                </div>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '1rem' }}>
                                    {mod.tagline}
                                </p>
                                <div className="flex justify-between items-center">
                                    <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800 }}>CLICK TO LAUNCH</span>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: mod.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '0.85rem' }}>→</div>
                                </div>
                            </div>
                        ))}
                    </div>

                </div>

                {/* Sidebar */}
                <aside className="flex-col gap-lg">
                    <RoadmapSelector />
                    <div className="glass-card" style={{ padding: '1.5rem' }}>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1.5rem', color: 'var(--primary-400)' }}>Rewards & Milestones</h4>
                        <div className="flex-col gap-md">
                            <div className="flex-col gap-xs">
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800 }}>EARNED BADGES</span>
                                <div className="flex flex-wrap gap-xs">
                                    {(progress?.badges || ['Learner']).map((b: string) => (
                                        <span key={b} className="badge" style={{ fontSize: '0.55rem', background: 'rgba(52, 160, 90, 0.10)', borderColor: 'var(--primary-500)' }}>★ {b}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex-col gap-xs">
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800 }}>STUDY STREAK</span>
                                <div className="flex items-end gap-sm">
                                    <span style={{ fontSize: '2rem', fontWeight: 900 }}>🔥 4</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Days</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--accent-blue)', background: 'rgba(0, 150, 255, 0.02)' }}>
                        <h4 style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '1rem', color: 'var(--accent-blue)' }}>Next Objective</h4>
                        <p style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem' }}>Resume Domain Polish</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            Your {profile?.domain} profile is 85% complete. Analyze your resume in the Interview Coach to unlock the "Specialist" badge.
                        </p>
                        <button
                            className="btn btn-primary w-full"
                            style={{ marginTop: '1rem', padding: '0.5rem', fontSize: '0.75rem' }}
                            onClick={() => onSelectModule('INTERVIEWER')}
                        >
                            Start Analysis
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};
