import { useEffect, useState } from 'react';

interface JobMarketItem {
    title: string;
    source: string;
    link: string;
    snippet: string;
    skills: string[];
    suitability_score?: number;
    origin?: string;
}

interface ResumeProject {
    name: string;
    tech: string;
    description: string;
}

interface CareerReport {
    role: string;
    level: string;
    city: string;
    readiness_score: number;
    resume_skills: string[];
    resume_projects?: ResumeProject[];
    market_required_skills: string[];
    matched_skills: string[];
    missing_skills: string[];
    job_market: JobMarketItem[];
    proceed_guide: {
        immediate: string[];
        short_term: string[];
        mid_term: string[];
        long_term: string[];
    };
    roadmap: {
        foundation: string[];
        job_readiness: string[];
        interview_prep: string[];
        projects: string[];
    };
    capability_analysis?: {
        resume_match: number;
        quiz_performance: number;
        interview_readiness: number;
        overall_capability: number;
    };
    live_job_demand?: {
        signal_count: number;
        demand_level: string;
        key_hiring_companies: string[];
        recent_trend: string;
    };
    historical_market?: {
        trend_line: { year: string; count: number }[];
        top_historical_companies: { name: string; count: number }[];
        total_historical_records: number;
    };
    risk_assessment?: {
        score: number;
        level: string;
        reasons: string[];
    };
}

export const CareerPathfinder = () => {
    const [file, setFile] = useState<File | null>(null);
    const [role, setRole] = useState('Fullstack Developer');
    const [level, setLevel] = useState('Junior');
    const [city, setCity] = useState('Bengaluru');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [report, setReport] = useState<CareerReport | null>(null);
    const [hasStoredResume, setHasStoredResume] = useState(false);
    const [isSubscribing, setIsSubscribing] = useState(false);
    const [subscribeMsg, setSubscribeMsg] = useState('');

    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
        if (!user.email) return;
        fetch(`http://127.0.0.1:8000/resume-status?user_email=${encodeURIComponent(user.email)}`)
            .then((r) => r.json())
            .then((d) => setHasStoredResume(Boolean(d?.has_stored_resume)))
            .catch(() => setHasStoredResume(false));
    }, []);

    const analyzeCareerPath = async () => {
        if (!file && !hasStoredResume) return;
        setIsLoading(true);
        setError('');
        setReport(null);

        const formData = new FormData();
        if (file) formData.append('file', file);
        formData.append('role', role);
        formData.append('level', level);
        formData.append('city', city);
        const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
        if (user.email) formData.append('user_email', user.email);

        try {
            const res = await fetch('http://127.0.0.1:8000/career-pathfinder', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setError(data.error || 'Career analysis failed.');
            } else {
                setReport(data);
            }
        } catch {
            setError('Unable to connect to backend.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubscribe = async () => {
        const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
        if (!user.email) {
            setSubscribeMsg('Please log in to subscribe.');
            return;
        }
        setIsSubscribing(true);
        setSubscribeMsg('');
        try {
            const res = await fetch('http://127.0.0.1:8000/job-agent/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: user.email,
                    role,
                    city,
                    min_score: 85
                })
            });
            const data = await res.json();
            if (data.success) {
                setSubscribeMsg('✅ Subscribed! AI Agent will email you daily matches.');
            } else {
                setSubscribeMsg('❌ Subscription failed. Try again.');
            }
        } catch {
            setSubscribeMsg('❌ Network error. Try again.');
        } finally {
            setIsSubscribing(false);
        }
    };

    return (
        <div className="flex-col gap-xl">
            <header>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Career Pathfinder</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Resume-driven roadmap, market demand, and city-specific role guidance</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 320px) minmax(0, 1fr)', gap: '2.5rem' }} className="career-grid">
                <div className="glass-card flex-col gap-lg" style={{ padding: '1.5rem', height: 'fit-content' }}>
                    <h3 style={{ fontSize: '1rem', color: 'var(--primary-400)' }}>Career Inputs</h3>

                    <div className="flex-col gap-xs">
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Target Role</span>
                        <select value={role} onChange={(e) => setRole(e.target.value)} className="btn btn-secondary" style={{ padding: '0.6rem', textAlign: 'left' }}>
                            <option>Fullstack Developer</option>
                            <option>Frontend Engineer</option>
                            <option>Data Scientist</option>
                            <option>DevOps Engineer</option>
                        </select>
                    </div>

                    <div className="flex-col gap-xs">
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Experience Level</span>
                        <select value={level} onChange={(e) => setLevel(e.target.value)} className="btn btn-secondary" style={{ padding: '0.6rem', textAlign: 'left' }}>
                            <option>Junior</option>
                            <option>Mid-Level</option>
                            <option>Senior</option>
                        </select>
                    </div>

                    <div className="flex-col gap-xs">
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 700 }}>Target City</span>
                        <input
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="btn btn-secondary"
                            style={{ padding: '0.65rem', textAlign: 'left' }}
                            placeholder="e.g., Bengaluru, Hyderabad, Mumbai"
                        />
                    </div>

                    <div
                        style={{ border: '2px dashed var(--glass-border)', padding: '1.25rem', textAlign: 'center', borderRadius: 'var(--radius-md)' }}
                        onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
                        onDragOver={(e) => e.preventDefault()}
                    >
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {file ? `Resume: ${file.name}` : 'Upload Resume PDF/DOCX'}
                        </p>
                        <input type="file" hidden id="career-resume-upload" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                        <label htmlFor="career-resume-upload" className="btn btn-primary" style={{ marginTop: '1rem', cursor: 'pointer', display: 'inline-block' }}>
                            Browse Resume
                        </label>
                    </div>

                    <button className="btn btn-primary w-full" disabled={(!file && !hasStoredResume) || isLoading} onClick={analyzeCareerPath}>
                        {isLoading ? 'ANALYZING MARKET...' : file ? 'BUILD CAREER STRATEGY' : 'USE STORED RESUME STRATEGY'}
                    </button>
                    {hasStoredResume && !file && (
                        <p style={{ fontSize: '0.72rem', color: 'var(--accent-green)', textAlign: 'center' }}>
                            Stored resume found. You can run Career Pathfinder directly.
                        </p>
                    )}

                    {error && (
                        <div style={{ color: 'var(--accent-red)', fontSize: '0.8rem' }}>{error}</div>
                    )}

                    <div style={{ marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                        <h4 style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--primary-400)' }}>AI Job Agent</h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                            Let AI scan 15+ boards daily and notify you when 85%+ matching jobs appear.
                        </p>
                        <button 
                            className="btn btn-secondary w-full" 
                            onClick={handleSubscribe} 
                            disabled={isSubscribing}
                        >
                            {isSubscribing ? 'SUBSCRIBING...' : '🔔 SUBSCRIBE TO JOB ALERTS'}
                        </button>
                        {subscribeMsg && (
                            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: subscribeMsg.includes('✅') ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                {subscribeMsg}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex-col gap-lg">

                    {!report && !isLoading && (
                        <div className="glass-card flex-col items-center justify-center" style={{ minHeight: '420px', textAlign: 'center' }}>
                            <h3 style={{ fontSize: '1.2rem' }}>Your career strategy will appear here</h3>
                            <p style={{ color: 'var(--text-muted)', maxWidth: '540px' }}>
                                Upload your resume and target city to get role demand, skill gaps, job links, and a step-by-step guide to proceed.
                            </p>
                        </div>
                    )}

                    {report && (
                        <>
                            <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--accent-blue)', background: 'linear-gradient(135deg, rgba(0,100,255,0.08) 0%, rgba(0,0,0,0) 100%)' }}>
                                <div className="flex justify-between items-start" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1.1rem', fontWeight: 900 }}>{report.role} in {report.city}</h3>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{report.level} career suitability profile</p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <span style={{ fontSize: '2.4rem', fontWeight: 900, color: 'var(--accent-blue)', textShadow: '0 0 20px rgba(0,100,255,0.3)' }}>{report.readiness_score}%</span>
                                        <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', opacity: 0.7, fontWeight: 800 }}>Global Suitability</p>
                                    </div>
                                </div>
                            </div>

                            {report.capability_analysis && (
                                <div className="glass-card grid grid-cols-3 gap-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '1.5rem', gap: '1rem' }}>
                                    {[
                                        { label: 'Resume Match', val: report.capability_analysis.resume_match, color: 'var(--accent-blue)', icon: '📄' },
                                        { label: 'Quiz Capability', val: report.capability_analysis.quiz_performance, color: 'var(--accent-teal)', icon: '📝' },
                                        { label: 'Interview Skill', val: report.capability_analysis.interview_readiness, color: 'var(--accent-orange)', icon: '🎤' }
                                    ].map(stat => (
                                        <div key={stat.label} className="flex-col items-center" style={{ textAlign: 'center', background: 'var(--glass-border)', padding: '1rem', borderRadius: '12px' }}>
                                            <span style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>{stat.icon}</span>
                                            <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.2rem' }}>{stat.label}</span>
                                            <span style={{ fontSize: '1.2rem', fontWeight: 900, color: stat.color }}>{stat.val}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="glass-card" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Skill Gap Summary</h3>
                                <div className="flex-col gap-sm">
                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                        Top skills demanded in {report.city} listings for {report.role}:
                                    </p>
                                    <div className="flex flex-wrap gap-xs">
                                        {report.market_required_skills.map((s) => (
                                            <span key={s} className="badge" style={{ fontSize: '0.72rem' }}>{s}</span>
                                        ))}
                                    </div>
                                    <p style={{ fontSize: '0.82rem', color: 'var(--accent-red)', marginTop: '0.5rem' }}>
                                        Missing in your resume:
                                    </p>
                                    <div className="flex flex-wrap gap-xs">
                                        {report.missing_skills.length > 0 ? report.missing_skills.map((s) => (
                                            <span key={s} className="badge" style={{ fontSize: '0.72rem', borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>{s}</span>
                                        )) : <span style={{ fontSize: '0.8rem', color: 'var(--accent-green)' }}>No major critical gaps detected.</span>}
                                    </div>
                                </div>
                            </div>

                            {report.resume_projects && report.resume_projects.length > 0 && (
                                <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid rgba(100,130,255,0.15)' }}>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>🗂️ Your Resume Projects</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.85rem' }}>
                                        {report.resume_projects.map((proj, i) => (
                                            <div key={i} style={{ padding: '1rem 1.25rem', background: 'rgba(100,130,255,0.04)', border: '1px solid rgba(100,130,255,0.15)', borderRadius: '10px', borderTop: '3px solid var(--primary-500)' }}>
                                                <p style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)', marginBottom: '0.4rem' }}>{proj.name}</p>
                                                {proj.tech && <p style={{ fontSize: '0.72rem', color: 'var(--primary-400)', fontWeight: 700, marginBottom: '0.4rem' }}>🛠 {proj.tech}</p>}
                                                {proj.description && <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{proj.description}</p>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="glass-card" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Guide To Proceed</h3>
                                {[
                                    { title: 'Immediate (This Week)', items: report.proceed_guide.immediate, color: 'var(--primary-400)' },
                                    { title: 'Short Term (2-4 Weeks)', items: report.proceed_guide.short_term, color: 'var(--accent-blue)' },
                                    { title: 'Mid Term (1-2 Months)', items: report.proceed_guide.mid_term, color: 'var(--accent-orange)' },
                                    { title: 'Long Term (Quarterly)', items: report.proceed_guide.long_term, color: 'var(--accent-green)' },
                                ].map((section) => (
                                    <div key={section.title} style={{ marginBottom: '1rem' }}>
                                        <p style={{ fontSize: '0.76rem', color: section.color, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{section.title}</p>
                                        <ul style={{ margin: '0.4rem 0 0.2rem 1rem', padding: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
                                            {section.items.map((item) => <li key={item}>{item}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            <div className="glass-card" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Roadmap Aligned To Job Demand</h3>
                                {[
                                    { label: 'Foundation', items: report.roadmap.foundation },
                                    { label: 'Job Readiness', items: report.roadmap.job_readiness },
                                    { label: 'Interview Prep', items: report.roadmap.interview_prep },
                                    { label: 'Projects', items: report.roadmap.projects }
                                ].map((phase) => (
                                    <div key={phase.label} style={{ marginBottom: '1rem' }}>
                                        <p style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{phase.label}</p>
                                        <ul style={{ margin: '0.4rem 0 0.2rem 1rem', padding: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
                                            {phase.items.map((item) => <li key={item}>{item}</li>)}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            {report.risk_assessment && (
                                <div className="glass-card" style={{ padding: '1.5rem', border: `1px solid ${report.risk_assessment.level === 'High' ? 'var(--accent-red)' : 'var(--accent-orange)'}`, background: 'rgba(239,68,68,0.02)' }}>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 'sm', color: report.risk_assessment.level === 'High' ? 'var(--accent-red)' : 'var(--accent-orange)' }}>
                                        🛡️ Recruitment Risk Assessment
                                    </h3>
                                    <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
                                        <p style={{ fontSize: '0.9rem' }}>Risk Level: <strong>{report.risk_assessment.level}</strong></p>
                                        <div style={{ width: '100px', height: '8px', background: 'var(--glass-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${report.risk_assessment.score}%`, height: '100%', background: report.risk_assessment.level === 'High' ? 'var(--accent-red)' : 'var(--accent-orange)' }} />
                                        </div>
                                    </div>
                                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                        {report.risk_assessment.reasons.map((r, i) => (
                                            <li key={i} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                                                <span>•</span> {r}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {report.live_job_demand && (
                                <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid var(--primary-500)', background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(0,0,0,0) 100%)' }}>
                                    <h3 style={{ fontSize: '1rem', color: 'var(--primary-400)', marginBottom: '1rem' }}>📡 Real-time Market Signals</h3>
                                    <div className="grid grid-cols-2 gap-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.2rem' }}>
                                        <div className="flex-col" style={{ padding: '1rem', background: 'var(--glass-border)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Current Demand</span>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent-teal)' }}>{report.live_job_demand.demand_level}</span>
                                        </div>
                                        <div className="flex-col" style={{ padding: '1rem', background: 'var(--glass-border)', borderRadius: '12px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Volume Found</span>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--accent-blue)' }}>{report.live_job_demand.signal_count}+</span>
                                        </div>
                                    </div>
                                    <div className="flex-col gap-sm">
                                        <p style={{ fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                                            <strong>Key Insight:</strong> {report.live_job_demand.recent_trend}
                                        </p>
                                        {report.live_job_demand.key_hiring_companies.length > 0 && (
                                            <div style={{ marginTop: '0.5rem' }}>
                                                <p style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>ACTIVE HIRING AT:</p>
                                                <div className="flex flex-wrap gap-xs">
                                                    {report.live_job_demand.key_hiring_companies.map((c: string) => (
                                                        <span key={c} className="badge" style={{ background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)' }}>{c}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {report.historical_market && report.historical_market.total_historical_records > 0 && (
                                <div className="glass-card" style={{ padding: '1.5rem' }}>
                                    <h3 style={{ fontSize: '1rem', marginBottom: '1.5rem' }}>📜 Long-Term Market Stability (2021-2025)</h3>
                                    <div className="flex gap-md" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '100px', background: 'rgba(52,160,90,0.02)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                                        {report.historical_market.trend_line.map((item, i) => {
                                            const trendVals = report.historical_market?.trend_line.map(t => t.count) || [1];
                                            const max = Math.max(...trendVals, 1);
                                            const h = (item.count / max) * 100;
                                            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                                            return (
                                                <div key={item.year} className="flex-col items-center gap-xs" style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                                                    <div className="bar-glow"
                                                        style={{ 
                                                            width: '80%', 
                                                            height: `${Math.max(h, 4)}%`, 
                                                            background: colors[i % colors.length], 
                                                            borderRadius: '6px 6px 0 0', 
                                                            opacity: 0.8,
                                                            transition: 'height 1.2s ease-out'
                                                        }} 
                                                    />
                                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)' }}>{item.year.slice(2)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                        Historically, this role has seen the most volume from: <strong>{report.historical_market.top_historical_companies.map(c => c.name).join(', ')}</strong>.
                                    </p>
                                </div>
                            )}

                            <div className="glass-card" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Live Job Demand Signals ({report.job_market.length})</h3>
                                <div className="flex-col gap-sm">
                                    {report.job_market.length > 0 ? report.job_market.map((job) => (
                                        <a
                                            key={`${job.link}-${job.title}`}
                                            href={job.link}
                                            target="_blank"
                                            rel="noreferrer"
                                            style={{ display: 'block', border: '1px solid var(--glass-border)', borderRadius: '10px', padding: '0.9rem', textDecoration: 'none', position: 'relative', overflow: 'hidden', background: 'rgba(255,255,255,0.02)' }}
                                            className="job-link-hover"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div style={{ flex: 1 }}>
                                                    <p style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{job.title}</p>
                                                    <div className="flex gap-xs items-center" style={{ marginTop: '0.2rem' }}>
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{job.source}</span>
                                                        {job.origin && <span className="badge" style={{ fontSize: '0.6rem', padding: '2px 6px', background: 'var(--glass-border)', color: 'var(--primary-300)' }}>{job.origin}</span>}
                                                    </div>
                                                </div>
                                                {job.suitability_score !== undefined && (
                                                    <div style={{ textAlign: 'right', minWidth: '60px' }}>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 900, color: job.suitability_score > 70 ? 'var(--accent-teal)' : 'var(--accent-blue)' }}>{job.suitability_score}%</span>
                                                        <p style={{ fontSize: '0.55rem', textTransform: 'uppercase', opacity: 0.6, fontWeight: 700 }}>Match</p>
                                                    </div>
                                                )}
                                            </div>
                                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.5rem', wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{job.snippet}</p>
                                            <div className="flex flex-wrap gap-xs" style={{ marginTop: '0.55rem' }}>
                                                {job.skills.slice(0, 8).map((s) => (
                                                    <span key={s} className="badge" style={{ fontSize: '0.66rem', padding: '0.2rem 0.5rem', background: 'rgba(255,255,255,0.03)' }}>{s}</span>
                                                ))}
                                            </div>
                                        </a>
                                    )) : (
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            No live listings found for the exact query right now. Try a nearby metro city or broader role title.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <style>{`
                @media (max-width: 980px) {
                    .career-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
                .bar-glow {
                    box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
                }
                .job-link-hover:hover {
                    border-color: var(--primary-500) !important;
                    background: rgba(100,130,255,0.05) !important;
                    transform: translateY(-2px);
                    transition: all 0.2s ease;
                }
            `}</style>
        </div>
    );
};
