import React, { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import { SkillGap3D } from '../components/SkillGap3D';
import API_BASE_URL, { apiFetch } from '../config';

interface Analytics {
    total_students: number;
    active_today: number;
    total_xp: number;
    total_interaction_hits: number;
    total_interviews: number;
    total_live_interviews: number;
    total_optimizations: number;
    total_quizzes: number;
    avg_readiness_score: number;
    avg_live_readiness_score: number;
    avg_live_confidence_score: number;
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
    mock_room_sessions: number;
    latest_mock_readiness: number | null;
    avg_mock_readiness: number | null;
    interview_readiness_trend: number[];
    interview_history: { kind: string; score: number | null; date: string | null; role: string | null }[];
    latest_mock_report: {
        role?: string;
        domain?: string;
        level?: string;
        generated_at?: string;
        readiness_score?: number;
        coaching_tips?: string[];
        weak_areas?: string[];
        presence_alerts?: string[];
        strengths?: string[];
        improvements?: string[];
    };
    latest_mock_metrics: {
        confidence?: number | null;
        eye_contact?: number | null;
        posture?: number | null;
        speech_clarity?: number | null;
    };
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
                    apiFetch(`${API_BASE_URL}/admin/analytics`),
                    apiFetch(`${API_BASE_URL}/admin/student-performance`),
                    apiFetch(`${API_BASE_URL}/admin/market-insights`),
                    apiFetch(`${API_BASE_URL}/admin/historical-market-overview`),
                    apiFetch(`${API_BASE_URL}/admin/risk-overview`)
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

    const formatShortDate = (date: string | null) => {
        if (!date) return 'Unknown';
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return 'Unknown';
        return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const formatInterviewDate = (date: string | null) => {
        if (!date) return 'Unknown date';
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return 'Unknown date';
        return parsed.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    };

    const metricBar = (label: string, value: number | null | undefined) => {
        const score = value == null ? null : Math.round(value);
        const width = score == null ? 0 : Math.max(4, Math.min(score, 100));

        return (
            <div key={label}>
                <div className="flex justify-between" style={{ marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{label}</span>
                    <strong style={{ color: score == null ? 'var(--text-muted)' : readinessColor(score), fontSize: '0.9rem' }}>
                        {score != null ? `${score}%` : '-'}
                    </strong>
                </div>
                <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(148,163,184,0.16)', overflow: 'hidden' }}>
                    <div style={{ width: `${width}%`, height: '100%', borderRadius: '999px', background: score == null ? 'rgba(148,163,184,0.35)' : readinessColor(score) }} />
                </div>
            </div>
        );
    };

    const hasInterviewScore = (score: number | null | undefined): score is number =>
        typeof score === 'number' && score > 0;

    const interviewScoreLabel = (score: number | null | undefined) =>
        hasInterviewScore(score) ? `${Math.round(score)}%` : 'No score';

    const interviewScoreColor = (score: number | null | undefined) =>
        hasInterviewScore(score) ? readinessColor(score ?? null) : 'var(--text-muted)';

    const reportList = (items: string[] | undefined, emptyText: string, limit = 3) => {
        const list = (items || []).filter(Boolean).slice(0, limit);

        if (!list.length) {
            return <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{emptyText}</span>;
        }

        return list.map(item => (
            <span key={item} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.45, padding: '0.45rem 0', borderTop: '1px solid rgba(148,163,184,0.08)' }}>
                {item}
            </span>
        ));
    };

    const exportStudentInterviewPdf = (student: StudentPerf) => {
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        let y = 48;
        const pageHeight = pdf.internal.pageSize.getHeight();
        const addLine = (text: string, size = 11, color: [number, number, number] = [51, 65, 85]) => {
            if (y > pageHeight - 48) {
                pdf.addPage();
                y = 48;
            }
            pdf.setFontSize(size);
            pdf.setTextColor(color[0], color[1], color[2]);
            const lines = pdf.splitTextToSize(text, 500);
            pdf.text(lines, 48, y);
            y += lines.length * (size + 3);
        };

        pdf.setFontSize(20);
        pdf.setTextColor(15, 23, 42);
        pdf.text('Student Interview Progress Report', 48, y);
        y += 28;

        addLine(`Student: ${student.full_name || student.email}`, 12, [15, 23, 42]);
        addLine(`Email: ${student.email}`, 11);
        addLine(`Latest readiness: ${student.latest_readiness != null ? `${student.latest_readiness}%` : 'N/A'} | Avg readiness: ${student.avg_readiness != null ? `${student.avg_readiness}%` : 'N/A'}`, 11);
        addLine(`Live room sessions: ${student.mock_room_sessions} | Interview sessions total: ${student.interview_sessions}`, 11);
        addLine(`Latest metrics: confidence ${student.latest_mock_metrics.confidence != null ? `${Math.round(student.latest_mock_metrics.confidence)}%` : 'N/A'}, eye contact ${student.latest_mock_metrics.eye_contact != null ? `${Math.round(student.latest_mock_metrics.eye_contact)}%` : 'N/A'}, posture ${student.latest_mock_metrics.posture != null ? `${Math.round(student.latest_mock_metrics.posture)}%` : 'N/A'}, speech clarity ${student.latest_mock_metrics.speech_clarity != null ? `${Math.round(student.latest_mock_metrics.speech_clarity)}%` : 'N/A'}`, 11);

        y += 10;
        addLine('Recent interview history', 13, [30, 64, 175]);
        if (student.interview_history.length) {
            student.interview_history.slice(-12).forEach(item => {
                const date = item.date ? new Date(item.date).toLocaleString() : 'Unknown date';
                addLine(`• ${date} | ${item.kind} | ${item.role || 'Interview'} | ${item.score != null ? `${Math.round(item.score)}%` : 'N/A'}`, 10);
            });
        } else {
            addLine('• No interview history available yet.', 10);
        }

        y += 10;
        addLine('Coaching tips', 13, [30, 64, 175]);
        ((student.latest_mock_report.coaching_tips || []).slice(0, 6)).forEach(tip => addLine(`• ${tip}`, 10));
        if (!(student.latest_mock_report.coaching_tips || []).length) addLine('• No coaching tips available yet.', 10);

        y += 10;
        addLine('Weak areas', 13, [220, 38, 38]);
        ((student.latest_mock_report.weak_areas || []).slice(0, 8)).forEach(area => addLine(`• ${area}`, 10));
        if (!(student.latest_mock_report.weak_areas || []).length) addLine('• No weak areas recorded.', 10);

        y += 10;
        addLine('Presence alerts', 13, [217, 119, 6]);
        ((student.latest_mock_report.presence_alerts || []).slice(0, 8)).forEach(alert => addLine(`• ${alert}`, 10));
        if (!(student.latest_mock_report.presence_alerts || []).length) addLine('• No presence issues recorded.', 10);

        pdf.save(`${(student.full_name || student.email || 'student').replace(/\s+/g, '_')}_Interview_Report.pdf`);
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
                    { label: 'LIVE ROOMS', value: data?.total_live_interviews ?? 0, icon: '📹', color: '#38bdf8' },
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
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                            <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(56,189,248,0.05)' }}>
                                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 800 }}>LIVE ROOM READINESS</p>
                                <p style={{ fontSize: '1.45rem', fontWeight: 900, color: '#38bdf8', marginTop: '0.25rem' }}>
                                    {data?.avg_live_readiness_score ? `${data.avg_live_readiness_score}%` : '—'}
                                </p>
                            </div>
                            <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(168,85,247,0.05)' }}>
                                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 800 }}>AVG CONFIDENCE</p>
                                <p style={{ fontSize: '1.45rem', fontWeight: 900, color: '#c084fc', marginTop: '0.25rem' }}>
                                    {data?.avg_live_confidence_score ? `${data.avg_live_confidence_score}%` : '—'}
                                </p>
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
                                'Algorithmic': data?.avg_optimization_score ?? 0,
                                'Conceptual': 0,
                                'Interviewing': data?.avg_readiness_score ?? 0,
                                'System Design': 0,
                                'Real-world Fit': 0
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
                                                    <p style={{ fontWeight: 900, fontSize: '1.4rem', color: '#c084fc', lineHeight: 1 }}>{student.avg_optimization_score != null ? `${student.avg_optimization_score}%` : '-'}</p>
                                                    <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.3px' }}>CODE SCORE</p>
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
                                                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end' }}>
                                                        <button
                                                            className="btn btn-primary"
                                                            onClick={() => exportStudentInterviewPdf(student)}
                                                            style={{ fontSize: '0.78rem', padding: '0.55rem 1rem' }}
                                                        >
                                                            Export Interview PDF
                                                        </button>
                                                    </div>
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
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Live Rooms</span>
                                                                <strong style={{ color: '#38bdf8' }}>{student.mock_room_sessions}</strong>
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
                                                            {student.latest_mock_readiness != null && (
                                                                <p style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '6px' }}>
                                                                    Latest room readiness: <strong>{student.latest_mock_readiness}%</strong>
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Code Mentorship */}
                                                    <div style={{ padding: '1rem', background: 'rgba(168,85,247,0.04)', borderRadius: '12px', border: '1px solid rgba(168,85,247,0.12)' }}>
                                                        <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#c084fc', marginBottom: '0.75rem', textTransform: 'uppercase' }}>💻 Coding Mentor</p>
                                                        <div className="flex-col gap-xs">
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Saved Runs</span>
                                                                <strong style={{ color: 'var(--text-primary)' }}>{student.code_optimizations_done}</strong>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Dashboard Score</span>
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
                                                    {student.mock_room_sessions > 0 && (
                                                        <div style={{ padding: '1rem', background: 'rgba(56,189,248,0.04)', borderRadius: '12px', border: '1px solid rgba(56,189,248,0.12)' }}>
                                                            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Live Interview Readiness</p>
                                                            <div className="flex-col gap-md">
                                                                {metricBar('Confidence', student.latest_mock_metrics.confidence)}
                                                                {metricBar('Eye Contact', student.latest_mock_metrics.eye_contact)}
                                                                {metricBar('Posture', student.latest_mock_metrics.posture)}
                                                                {metricBar('Speech Clarity', student.latest_mock_metrics.speech_clarity)}
                                                                {student.interview_readiness_trend.length > 0 && (
                                                                    <div style={{ marginTop: '0.5rem' }}>
                                                                        <div className="flex justify-between" style={{ marginBottom: '0.45rem' }}>
                                                                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Recent readiness trend</p>
                                                                            <span style={{ fontSize: '0.72rem', color: readinessColor(student.latest_mock_readiness) }}>
                                                                                {student.latest_mock_readiness != null ? `${Math.round(student.latest_mock_readiness)}% latest` : ''}
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '64px', padding: '0.25rem 0.1rem 0' }}>
                                                                            {student.interview_readiness_trend.map((score, index) => {
                                                                                const hasScore = hasInterviewScore(score);
                                                                                return (
                                                                                <div key={`${score}-${index}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                                                                                    <div title={interviewScoreLabel(score)} style={{ width: '100%', maxWidth: '34px', height: hasScore ? `${Math.max(score, 8)}%` : '7px', minHeight: '7px', borderRadius: '6px 6px 2px 2px', background: hasScore ? readinessColor(score) : 'rgba(148,163,184,0.28)' }} />
                                                                                    <span style={{ fontSize: '0.65rem', color: hasScore ? readinessColor(score) : 'var(--text-muted)' }}>{hasScore ? `${Math.round(score)}%` : '-'}</span>
                                                                                </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {student.interview_history.length > 0 && (
                                                        <div style={{ padding: '1rem', background: 'rgba(14,165,233,0.04)', borderRadius: '12px', border: '1px solid rgba(14,165,233,0.12)', gridColumn: 'span 2' }}>
                                                            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0ea5e9', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Full Interview History</p>
                                                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '92px', marginBottom: '1rem', padding: '0 0.1rem' }}>
                                                                {student.interview_history.slice(0, 8).reverse().map((entry, index) => {
                                                                    const score = entry.score || 0;
                                                                    const hasScore = hasInterviewScore(entry.score);
                                                                    return (
                                                                        <div key={`${entry.date}-${index}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                                                            <div title={`${entry.kind === 'live_room' ? 'Live Room' : 'Classic'} - ${interviewScoreLabel(entry.score)}`} style={{ width: '100%', maxWidth: '34px', height: hasScore ? `${Math.max(score, 8)}%` : '8px', minHeight: '8px', borderRadius: '6px 6px 2px 2px', background: hasScore ? (entry.kind === 'live_room' ? '#38bdf8' : '#10b981') : 'rgba(148,163,184,0.28)' }} />
                                                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatShortDate(entry.date)}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                            <div className="flex-col gap-xs" style={{ maxHeight: '190px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                                                                {student.interview_history.slice(0, 6).map((entry, index) => (
                                                                    <div key={`${entry.kind}-${entry.date}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(95px, 0.8fr) minmax(72px, 0.6fr) minmax(120px, 1fr) auto', gap: '0.75rem', alignItems: 'center', padding: '0.55rem 0', borderTop: index === 0 ? '1px solid rgba(148,163,184,0.14)' : '1px solid rgba(148,163,184,0.08)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                                                        <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{formatInterviewDate(entry.date)}</span>
                                                                        <span>{entry.kind === 'live_room' ? 'Live Room' : 'Classic'}</span>
                                                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.role || 'Interview'}</span>
                                                                        <strong style={{ color: interviewScoreColor(entry.score), fontSize: '0.82rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{interviewScoreLabel(entry.score)}</strong>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {((student.latest_mock_report?.coaching_tips?.length || 0) > 0 || (student.latest_mock_report?.weak_areas?.length || 0) > 0 || (student.latest_mock_report?.presence_alerts?.length || 0) > 0) && (
                                                        <div style={{ padding: '1rem', background: 'rgba(99,102,241,0.04)', borderRadius: '12px', border: '1px solid rgba(99,102,241,0.12)', gridColumn: 'span 3' }}>
                                                            <p style={{ fontSize: '0.72rem', fontWeight: 800, color: '#818cf8', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Latest Interview Report Snapshot</p>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))', gap: '1rem', maxHeight: '210px', overflowY: 'auto', paddingRight: '0.25rem' }} className="admin-report-grid">
                                                                <div>
                                                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Top Coaching Tips</p>
                                                                    <div className="flex-col gap-xs">
                                                                        {reportList(student.latest_mock_report.coaching_tips, 'No tips yet')}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Weak Areas</p>
                                                                    <div className="flex-col gap-xs">
                                                                        {reportList(student.latest_mock_report.weak_areas, 'No weak areas recorded')}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>Presence Events</p>
                                                                    <div className="flex-col gap-xs">
                                                                        {reportList(student.latest_mock_report.presence_alerts, 'No issues recorded', 4)}
                                                                    </div>
                                                                </div>
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
                                                                'Technical': student.avg_optimization_score ?? 0,
                                                                'Knowledge': student.avg_quiz_score ?? 0,
                                                                'Readiness': student.avg_readiness ?? 0,
                                                                'Optimization': student.avg_optimization_score ?? 0,
                                                                'Market Fit': 0
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
