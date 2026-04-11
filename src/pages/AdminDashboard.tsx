import React, { useEffect, useState } from 'react';
import { SkillGap3D } from '../components/SkillGap3D';

interface Analytics {
    total_students: number;
    active_today: number;
    total_xp: number;
    total_interaction_hits: number;
    total_interviews: number;
    total_optimizations: number;
    total_quizzes: number;
    avg_readiness_score: number;
    avg_optimization_score: number;
    domain_distribution: Record<string, number>;
    top_skills: { name: string; count: number }[];
}

interface StudentPerf {
    user_id: string;
    email: string;
    full_name: string;
    joined: string;
    xp: number;
    level: number;
    topics_completed: number;
    total_topics_attempted: number;
    domains_studied: string[];
    last_topic: string | null;
    interview_sessions: number;
    latest_readiness: number | null;
    avg_readiness: number | null;
    last_interview_role: string | null;
    code_optimizations_done: number;
    avg_optimization_score: number | null;
    quizzes_completed: number;
    avg_quiz_score: number | null;
}

export const AdminDashboard: React.FC = () => {
    const [data, setData] = useState<Analytics | null>(null);
    const [students, setStudents] = useState<StudentPerf[]>([]);
    const [loading, setLoading] = useState(true);
    const [perfLoading, setPerfLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'market'>('overview');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
    const [marketTrends, setMarketTrends] = useState<{ top_roles: any[], top_domains: any[], total_searches: number } | null>(null);
    const [historicalOverview, setHistoricalOverview] = useState<{ top_historical_domains: any[], top_historical_roles: any[], overall_trend: any[] } | null>(null);
    const [riskOverview, setRiskOverview] = useState<{ top_risk_industries: any[], top_risk_roles: any[], total_fraud_cases: number } | null>(null);

    useEffect(() => {
        const fetchAll = async () => {
            try {
                const [analyticsRes, perfRes, marketRes, histRes, riskRes] = await Promise.all([
                    fetch('http://127.0.0.1:8000/admin/analytics'),
                    fetch('http://127.0.0.1:8000/admin/student-performance'),
                    fetch('http://127.0.0.1:8000/admin/market-insights'),
                    fetch('http://127.0.0.1:8000/admin/historical-market-overview'),
                    fetch('http://127.0.0.1:8000/admin/risk-overview')
                ]);
                if (analyticsRes.ok) setData(await analyticsRes.json());
                if (perfRes.ok) {
                    const perfData = await perfRes.json();
                    setStudents(perfData.students || []);
                }
                if (marketRes.ok) setMarketTrends(await marketRes.json());
                if (histRes.ok) setHistoricalOverview(await histRes.json());
                if (riskRes.ok) setRiskOverview(await riskRes.json());
            } catch (error) {
                console.error('Failed to fetch analytics', error);
            } finally {
                setLoading(false);
                setPerfLoading(false);
            }
        };
        fetchAll();
    }, []);

    if (loading) return (
        <div className="flex-col items-center justify-center fade-in" style={{ minHeight: '80vh', gap: '1rem' }}>
            <div style={{ width: '40px', height: '40px', border: '4px solid rgba(52,160,90,0.1)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <h2 style={{ fontSize: '1rem', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '2px' }}>LOADING ADMIN ANALYTICS…</h2>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    const maxHits = data ? Math.max(...Object.values(data.domain_distribution), 1) : 1;
    const filteredStudents = students.filter(s =>
        s.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const readinessColor = (score: number | null) => {
        if (!score) return 'var(--text-muted)';
        if (score >= 70) return 'var(--accent-green)';
        if (score >= 40) return 'var(--accent-orange)';
        return 'var(--accent-red)';
    };

    return (
        <div className="container fade-in" style={{ maxWidth: '1600px', paddingBottom: '5rem' }}>
            {/* Header */}
            <header className="flex justify-between items-center" style={{ marginBottom: '2.5rem', marginTop: '1rem', flexWrap: 'wrap', gap: '1.5rem' }}>
                <div>
                    <div className="flex items-center gap-md">
                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, var(--primary-500), var(--secondary-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.3rem' }}>
                            🏛️
                        </div>
                        <div>
                            <h1 style={{ fontSize: '1.75rem', fontWeight: 900 }}>Admin Console</h1>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>EduZyniq Learning Intelligence Platform</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-md">
                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-green)', fontWeight: 800, background: 'rgba(52,160,90,0.08)', padding: '0.4rem 0.9rem', borderRadius: '20px', border: '1px solid rgba(52,160,90,0.2)' }}>
                        ● SYSTEM OPERATIONAL
                    </span>
                </div>
            </header>

            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                {[
                    { label: 'TOTAL STUDENTS', value: data?.total_students ?? 0, icon: '👥', color: 'var(--accent-blue)' },
                    { label: 'TOTAL XP EARNED', value: data?.total_xp?.toLocaleString() ?? 0, icon: '⚡', color: 'var(--accent-orange)' },
                    { label: 'TOPICS COMPLETED', value: data?.total_interaction_hits ?? 0, icon: '✅', color: 'var(--accent-green)' },
                    { label: 'INTERVIEW SESSIONS', value: data?.total_interviews ?? 0, icon: '🎤', color: 'var(--primary-500)' },
                    { label: 'CODING SESSIONS', value: data?.total_optimizations ?? 0, icon: '💻', color: '#c084fc' },
                    { label: 'QUIZZES COMPLETED', value: data?.total_quizzes ?? 0, icon: '📝', color: 'var(--accent-orange)' },
                ].map(stat => (
                    <div key={stat.label} className="glass-card" style={{ padding: '1.25rem' }}>
                        <div className="flex items-center gap-sm" style={{ marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '1.3rem' }}>{stat.icon}</span>
                            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.8px' }}>{stat.label}</span>
                        </div>
                        <p style={{ fontSize: '2rem', fontWeight: 900, color: stat.color, lineHeight: 1 }}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-md" style={{ background: 'var(--glass-bg)', padding: '0.4rem', borderRadius: '12px', border: '1px solid var(--glass-border)', marginBottom: '1.5rem' }}>
                {(['overview', 'students', 'market'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={activeTab === tab ? 'btn btn-primary' : 'btn btn-secondary'}
                        style={{ padding: '0.6rem 1.5rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800 }}
                    >
                        {tab === 'overview' ? '📊 System Overview' : tab === 'students' ? '🎓 Student Performance' : '🌍 Market Insights'}
                    </button>
                ))}
            </div>

            {/* OVERVIEW TAB */}
            {activeTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }} className="admin-grid fade-in">
                    {/* Domain Activity */}
                    <div className="glass-card" style={{ padding: '1.75rem' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '1.5rem', color: 'var(--primary-600)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            📚 Domain Activity (Topics Completed)
                        </h3>
                        {Object.keys(data?.domain_distribution || {}).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                                <p style={{ fontSize: '2rem' }}>📭</p>
                                <p style={{ fontSize: '0.85rem' }}>No activity yet. Students need to use the AI Teacher module.</p>
                            </div>
                        ) : (
                            <div className="flex-col gap-md">
                                {Object.entries(data!.domain_distribution).sort((a, b) => b[1] - a[1]).map(([domain, count]) => (
                                    <div key={domain} className="flex-col gap-xs">
                                        <div className="flex justify-between" style={{ fontSize: '0.82rem' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{domain}</span>
                                            <span style={{ color: 'var(--accent-blue)', fontWeight: 800 }}>{count} topics</span>
                                        </div>
                                        <div style={{ height: '8px', background: 'rgba(52,160,90,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(count / maxHits) * 100}%`, background: 'linear-gradient(90deg, var(--primary-500), var(--accent-blue))', borderRadius: '4px', transition: 'width 0.8s ease' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Top Skills */}
                    <div className="glass-card" style={{ padding: '1.75rem' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '1.5rem', color: 'var(--primary-600)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            🛠️ Top Student Skills (from Profiles)
                        </h3>
                        {(!data?.top_skills || data.top_skills.length === 0) ? (
                            <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                                <p style={{ fontSize: '2rem' }}>📭</p>
                                <p style={{ fontSize: '0.85rem' }}>No profiles yet. Students need to complete onboarding.</p>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-sm">
                                {data!.top_skills.map((skill, i) => (
                                    <div key={skill.name} style={{
                                        padding: '0.5rem 1rem', borderRadius: '20px',
                                        background: i < 3 ? 'rgba(52,160,90,0.08)' : 'transparent',
                                        border: `1px solid ${i < 3 ? 'rgba(52,160,90,0.3)' : 'var(--glass-border)'}`,
                                        display: 'flex', alignItems: 'center', gap: '6px'
                                    }}>
                                        {i < 3 && <span style={{ color: 'var(--primary-500)', fontWeight: 900, fontSize: '0.75rem' }}>#{i + 1}</span>}
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{skill.name}</span>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.04)', padding: '1px 6px', borderRadius: '10px' }}>{skill.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Interview Readiness Summary */}
                    <div className="glass-card" style={{ padding: '1.75rem', border: '1px solid rgba(52,160,90,0.15)' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '1.5rem', color: 'var(--primary-600)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            🎤 Interview Readiness Overview
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                            <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(52,160,90,0.05)', borderRadius: '12px' }}>
                                <p style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--primary-500)', lineHeight: 1 }}>{data?.total_interviews || 0}</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>Total Sessions</p>
                            </div>
                            <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(56,183,248,0.05)', borderRadius: '12px' }}>
                                <p style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent-blue)', lineHeight: 1 }}>
                                    {data?.avg_readiness_score ? `${data.avg_readiness_score}%` : '—'}
                                </p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>Avg Readiness</p>
                            </div>
                        </div>
                        <div style={{ marginTop: '1.25rem', height: '8px', background: 'rgba(52,160,90,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${data?.avg_readiness_score ?? 0}%`, background: `linear-gradient(90deg, ${(data?.avg_readiness_score ?? 0) >= 70 ? 'var(--accent-green)' : (data?.avg_readiness_score ?? 0) >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)'}, var(--accent-blue))`, transition: 'width 1s ease' }} />
                        </div>
                    </div>

                    {/* Quick Summary */}
                    <div className="glass-card" style={{ padding: '1.75rem', border: '1px solid rgba(52,160,90,0.1)', background: 'rgba(52,160,90,0.015)' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--primary-600)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            🧠 Platform Insight
                        </h3>
                        <div className="flex-col gap-md">
                            {[
                                { icon: '📱', text: `${data?.total_students ?? 0} registered students on the platform` },
                                { icon: '✅', text: `${data?.total_interaction_hits ?? 0} subtopics completed via AI Teacher` },
                                { icon: '🎤', text: `${data?.total_interviews ?? 0} Interview Coach sessions completed` },
                                { icon: '✨', text: `${data?.total_optimizations ?? 0} AI Code Optimizations requested` },
                                { icon: '⚡', text: `${data?.total_xp?.toLocaleString() ?? 0} total XP earned by all students` },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center gap-md">
                                    <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{item.text}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Platform-Wide Skill Gap */}
                    <div className="glass-card" style={{ padding: '2rem', gridColumn: 'span 2', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '1rem', color: 'var(--primary-600)', textAlign: 'center' }}>
                            🌌 Platform-Wide Skill Matrix
                        </h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2rem', textAlign: 'center', maxWidth: '600px' }}>
                            Visualizing the aggregate performance of all students against the "Unicorn Candidate" benchmark.
                        </p>
                        <SkillGap3D 
                            labels={['Algorithmic', 'Conceptual', 'Interviewing', 'System Design', 'Real-world Fit']}
                            current={{
                                'Algorithmic': data?.avg_optimization_score ?? 35,
                                'Conceptual': (data?.total_interaction_hits ?? 0) > 100 ? 80 : 45,
                                'Interviewing': data?.avg_readiness_score ?? 30,
                                'System Design': 40,
                                'Real-world Fit': (data?.total_interviews ?? 0) > 10 ? 60 : 25
                            }}
                            dream={{
                                'Algorithmic': 90,
                                'Conceptual': 85,
                                'Interviewing': 95,
                                'System Design': 80,
                                'Real-world Fit': 90
                            }}
                        />
                    </div>
                </div>
            )}

            {/* MARKET INSIGHTS TAB */}
            {activeTab === 'market' && marketTrends && (
                <div className="flex-col gap-lg fade-in">
                    <div className="grid grid-cols-2 gap-lg admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div className="glass-card" style={{ padding: '2rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '2rem', color: 'var(--primary-500)' }}>
                                🔥 Trending Career Paths (Top Roles)
                            </h3>
                            <div className="flex-col gap-lg">
                                {marketTrends.top_roles.map((role, i) => (
                                    <div key={role.name} className="flex-col gap-xs">
                                        <div className="flex justify-between" style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                                            <span>{i + 1}. {role.name}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{role.count} searches</span>
                                        </div>
                                        <div style={{ height: '8px', background: 'var(--glass-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(role.count / (marketTrends.total_searches || 1)) * 100}%`, background: 'var(--primary-500)', transition: 'width 1s ease' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="glass-card" style={{ padding: '2rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '2rem', color: 'var(--accent-teal)' }}>
                                🎯 Emerging Skill Domains
                            </h3>
                            <div className="flex-col gap-lg">
                                {marketTrends.top_domains.map((domain, i) => (
                                    <div key={domain.name} className="flex-col gap-xs">
                                        <div className="flex justify-between" style={{ fontSize: '0.9rem', fontWeight: 800 }}>
                                            <span>{i + 1}. {domain.name}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>{domain.count} searches</span>
                                        </div>
                                        <div style={{ height: '8px', background: 'var(--glass-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(domain.count / (marketTrends.total_searches || 1)) * 100}%`, background: 'var(--accent-teal)', transition: 'width 1s ease' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="glass-card" style={{ padding: '1.5rem', textAlign: 'center', background: 'rgba(52,160,90,0.03)', border: '1px solid rgba(52,160,90,0.2)' }}>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                            📊 Total Market Intelligence searches across platform: <strong>{marketTrends.total_searches}</strong> unique student interactions recorded.
                        </p>
                    </div>

                    {historicalOverview && (
                        <div className="glass-card fade-in" style={{ padding: '2rem', marginTop: '1rem', borderTop: '4px solid var(--accent-teal)' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: 'sm' }}>
                                📜 Long-term Market Analysis (2021-2025 Archive)
                            </h3>
                            <div className="grid grid-cols-2 gap-lg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div className="flex-col gap-lg">
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Historical Volume by Year</h4>
                                    <div className="flex gap-md" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '150px', background: 'rgba(52,160,90,0.02)', padding: '1rem', borderRadius: '12px' }}>
                                        {historicalOverview.overall_trend.map(item => {
                                            const max = Math.max(...historicalOverview.overall_trend.map(t => t.count), 1);
                                            const h = (item.count / max) * 100;
                                            return (
                                                <div key={item.year} className="flex-col items-center gap-xs" style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                                                    <div 
                                                        style={{ 
                                                            width: '100%', 
                                                            height: `${h}%`, 
                                                            background: 'linear-gradient(180deg, var(--accent-teal) 0%, rgba(6,182,212,0.4) 100%)', 
                                                            borderRadius: '4px 4px 0 0', 
                                                            minHeight: item.count > 0 ? '4px' : '0',
                                                            transition: 'height 1s ease-out'
                                                        }} 
                                                    />
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 800 }}>{item.year}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="flex-col gap-lg">
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Historical Domain Dominance</h4>
                                    <div className="flex-col gap-sm">
                                        {historicalOverview.top_historical_domains.slice(0, 5).map(d => (
                                            <div key={d.name} className="flex justify-between items-center" style={{ padding: '0.5rem 1rem', background: 'var(--glass-bg)', borderRadius: '8px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{d.name}</span>
                                                <span className="badge" style={{ fontSize: '0.7rem' }}>{d.count} archives</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {riskOverview && (
                        <div className="glass-card fade-in" style={{ padding: '2rem', marginTop: '1rem', borderTop: '4px solid var(--accent-red)' }}>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: 'sm', color: 'var(--accent-red)' }}>
                                🛡️ Recruitment Risk Intelligence (Fraud Dataset)
                            </h3>
                            <div className="grid grid-cols-2 gap-lg" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                <div className="flex-col gap-lg">
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>High Risk Industries</h4>
                                    <div className="flex-col gap-sm">
                                        {riskOverview.top_risk_industries.map(ind => (
                                            <div key={ind.name} className="flex justify-between items-center" style={{ padding: '0.6rem 1rem', background: 'rgba(239,68,68,0.05)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.1)' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{ind.name}</span>
                                                <span className="badge" style={{ fontSize: '0.7rem', background: 'var(--accent-red)', color: 'white', border: 'none' }}>{ind.count} flags</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex-col gap-lg">
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Fraud-Prone Job Titles</h4>
                                    <div className="flex flex-wrap gap-xs">
                                        {riskOverview.top_risk_roles.map(role => (
                                            <span key={role.name} className="badge" style={{ fontSize: '0.7rem', borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>{role.name} ({role.count})</span>
                                        ))}
                                    </div>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 'auto' }}>
                                        Total of <strong>{riskOverview.total_fraud_cases}</strong> historical recruitment fraud cases analyzed for ecosystem safety.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* STUDENT PERFORMANCE TAB */}
            {activeTab === 'students' && (
                <div className="flex-col gap-lg fade-in">
                    {/* Search */}
                    <div className="flex items-center gap-md">
                        <input
                            type="text"
                            placeholder="Search students by name or email…"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="input-field"
                            style={{ flex: 1, padding: '0.75rem 1rem', fontSize: '0.9rem' }}
                        />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {filteredStudents.length} / {students.length} students
                        </span>
                    </div>

                    {perfLoading ? (
                        <div className="flex-col items-center" style={{ padding: '3rem', gap: '1rem' }}>
                            <div style={{ width: '36px', height: '36px', border: '4px solid rgba(52,160,90,0.1)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <p style={{ color: 'var(--text-muted)' }}>Loading student data…</p>
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <div className="glass-card flex-col items-center" style={{ padding: '4rem', textAlign: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '3rem' }}>📭</span>
                            <h3 style={{ fontSize: '1.2rem' }}>{searchQuery ? 'No students match your search' : 'No students registered yet'}</h3>
                            <p style={{ color: 'var(--text-muted)', maxWidth: '400px', fontSize: '0.9rem' }}>
                                {searchQuery ? 'Try a different name or email.' : 'Once students sign up and use the platform, their performance will appear here.'}
                            </p>
                        </div>
                    ) : (
                        <div className="flex-col gap-md">
                            {filteredStudents.map(student => {
                                const isExpanded = expandedStudent === student.user_id;
                                const completionRate = student.total_topics_attempted > 0
                                    ? Math.round((student.topics_completed / student.total_topics_attempted) * 100)
                                    : 0;
                                return (
                                    <div key={student.user_id} className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--glass-border)' }}>
                                        {/* Student Row */}
                                        <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '1rem', cursor: 'pointer' }} onClick={() => setExpandedStudent(isExpanded ? null : student.user_id)}>
                                            <div className="flex items-center gap-lg">
                                                {/* Avatar */}
                                                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-500), var(--secondary-500))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: '1rem', flexShrink: 0 }}>
                                                    {(student.full_name || student.email || '?')[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <p style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{student.full_name || student.email}</p>
                                                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{student.email}</p>
                                                    {student.domains_studied.length > 0 && (
                                                        <div className="flex flex-wrap gap-xs" style={{ marginTop: '4px' }}>
                                                            {student.domains_studied.slice(0, 3).map(d => (
                                                                <span key={d} className="badge" style={{ fontSize: '0.6rem', padding: '1px 6px' }}>{d.split(' ')[0]}</span>
                                                            ))}
                                                            {student.domains_studied.length > 3 && <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>+{student.domains_studied.length - 3} more</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Quick Stats */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, auto)', gap: '1.5rem', alignItems: 'center' }}>
                                                <div style={{ textAlign: 'center' }}>
                                                    <p style={{ fontWeight: 900, fontSize: '1.4rem', color: 'var(--accent-blue)', lineHeight: 1 }}>{student.topics_completed}</p>
                                                    <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.3px' }}>TOPICS</p>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <p style={{ fontWeight: 900, fontSize: '1.4rem', color: 'var(--accent-orange)', lineHeight: 1 }}>{student.quizzes_completed}</p>
                                                    <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.3px' }}>QUIZZES</p>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <p style={{ fontWeight: 900, fontSize: '1.4rem', color: 'var(--primary-500)', lineHeight: 1 }}>{student.interview_sessions}</p>
                                                    <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.3px' }}>INTERVIEWS</p>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <p style={{ fontWeight: 900, fontSize: '1.4rem', color: '#c084fc', lineHeight: 1 }}>{student.code_optimizations_done}</p>
                                                    <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.3px' }}>CODING</p>
                                                </div>
                                                <div style={{ textAlign: 'center' }}>
                                                    <p style={{ fontWeight: 900, fontSize: '1.4rem', color: 'var(--accent-green)', lineHeight: 1 }}>{student.xp}</p>
                                                    <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.3px' }}>XP</p>
                                                </div>
                                            </div>

                                            <span style={{ color: 'var(--text-muted)', fontSize: '1.2rem' }}>{isExpanded ? '▲' : '▼'}</span>
                                        </div>

                                        {/* Expanded Detail */}
                                        {isExpanded && (
                                            <div className="flex-col gap-lg fade-in" style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--glass-border)' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                                                    {/* Teacher Progress */}
                                                    <div style={{ padding: '1rem', background: 'rgba(52,160,90,0.04)', borderRadius: '12px', border: '1px solid rgba(52,160,90,0.12)' }}>
                                                        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary-600)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>🎓 AI Teacher Progress</p>
                                                        <div className="flex-col gap-xs">
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Topics Completed</span>
                                                                <strong style={{ color: 'var(--accent-blue)' }}>{student.topics_completed}</strong>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Topics Attempted</span>
                                                                <strong style={{ color: 'var(--text-primary)' }}>{student.total_topics_attempted}</strong>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Completion Rate</span>
                                                                <strong style={{ color: completionRate >= 70 ? 'var(--accent-green)' : 'var(--accent-orange)' }}>{completionRate}%</strong>
                                                            </div>
                                                            <div style={{ marginTop: '0.5rem', height: '6px', background: 'rgba(52,160,90,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${completionRate}%`, background: 'var(--primary-500)', borderRadius: '3px' }} />
                                                            </div>
                                                            {student.last_topic && (
                                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                                                    Last: <em>{student.last_topic}</em>
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Interview Performance */}
                                                    <div style={{ padding: '1rem', background: 'rgba(56,183,248,0.04)', borderRadius: '12px', border: '1px solid rgba(56,183,248,0.12)' }}>
                                                        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--accent-blue)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>🎤 Interview Coach</p>
                                                        <div className="flex-col gap-xs">
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Sessions</span>
                                                                <strong style={{ color: 'var(--text-primary)' }}>{student.interview_sessions}</strong>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Latest Score</span>
                                                                <strong style={{ color: readinessColor(student.latest_readiness) }}>
                                                                    {student.latest_readiness != null ? `${student.latest_readiness}%` : '—'}
                                                                </strong>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Avg Score</span>
                                                                <strong style={{ color: readinessColor(student.avg_readiness) }}>
                                                                    {student.avg_readiness != null ? `${student.avg_readiness}%` : '—'}
                                                                </strong>
                                                            </div>
                                                            {student.last_interview_role && (
                                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                                                                    Target: <em>{student.last_interview_role}</em>
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Code Mentorship */}
                                                    <div style={{ padding: '1rem', background: 'rgba(168,85,247,0.04)', borderRadius: '12px', border: '1px solid rgba(168,85,247,0.12)' }}>
                                                        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c084fc', marginBottom: '0.75rem', textTransform: 'uppercase' }}>💻 Coding Mentor</p>
                                                        <div className="flex-col gap-xs">
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>AI Optimizations</span>
                                                                <strong style={{ color: 'var(--text-primary)' }}>{student.code_optimizations_done}</strong>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Avg Improve Score</span>
                                                                <strong style={{ color: student.avg_optimization_score! >= 70 ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                                                                    {student.avg_optimization_score != null ? `${student.avg_optimization_score}%` : '—'}
                                                                </strong>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Domains Studied */}
                                                    {student.domains_studied.length > 0 && (
                                                        <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.04)', borderRadius: '12px', border: '1px solid rgba(245,158,11,0.12)' }}>
                                                            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--accent-orange)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>📚 Domains Studied</p>
                                                            <div className="flex flex-wrap gap-xs">
                                                                {student.domains_studied.map(d => (
                                                                    <span key={d} className="badge" style={{ fontSize: '0.72rem', borderColor: 'rgba(245,158,11,0.3)', color: 'var(--accent-orange)', background: 'rgba(245,158,11,0.04)' }}>{d}</span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Skill Gap 3D Visualization */}
                                                    <div className="flex-col gap-sm" style={{ 
                                                        padding: '1.50rem', 
                                                        background: 'var(--glass-bg)', 
                                                        borderRadius: '20px', 
                                                        border: '1px solid var(--glass-border)',
                                                        gridColumn: 'span 2'
                                                    }}>
                                                        <p style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--primary-600)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                                            🌌 3D Skill Gap Analysis (vs. Industry Benchmark)
                                                        </p>
                                                        <SkillGap3D 
                                                            labels={['Technical', 'Knowledge', 'Readiness', 'Optimization', 'Market Fit']}
                                                            current={{
                                                                'Technical': student.avg_optimization_score || 40,
                                                                'Knowledge': student.avg_quiz_score || 50,
                                                                'Readiness': student.avg_readiness || 30,
                                                                'Optimization': (student.code_optimizations_done / 3) * 10 || 20,
                                                                'Market Fit': student.domains_studied.length * 20 || 10
                                                            }}
                                                            dream={{
                                                                'Technical': 85,
                                                                'Knowledge': 90,
                                                                'Readiness': 80,
                                                                'Optimization': 75,
                                                                'Market Fit': 85
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @media (max-width: 900px) { .admin-grid { grid-template-columns: 1fr !important; } }
            `}</style>
        </div>
    );
};
