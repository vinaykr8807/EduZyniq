import { useEffect, useState, useRef } from 'react';
import API_BASE_URL from '../../config';

interface ResumeProject {
    name: string;
    tech: string;
    description: string;
}

interface AnalysisResult {
    extracted_skills: string[];
    strong_domains: string[];
    missing_skills: string[];
    readiness_score: number;
    resume_projects?: ResumeProject[];
    roadmap: {
        beginner: string[];
        intermediate: string[];
        advanced: string[];
        projects: string[];
    };
    ats_score?: {
        total_score: number;
        breakdown?: {
            parseability: number;
            keyword_match: number;
            impact_metrics: number;
            formatting: number;
            section_completeness: number;
        };
        critical_keywords_found?: string[];
        missing_critical_keywords?: string[];
        improvement_suggestions?: string[];
        suggestions?: string[];
    };
}

interface MarketSkills {
    required_skills: string[];
    nice_to_have_skills: string[];
    top_tools: string[];
    avg_salary_india: string;
    demand_level: string;
    growth_trend: string;
    trend_analytics?: { skill: string; demand_score: number }[];
}

interface BeginnerGuide {
    guide_title: string;
    summary: string;
    phases: { phase: string; focus: string }[];
    soft_skills: string[];
    trends: string[];
}

interface HistoricalTrends {
    trend_line: { year: string; count: number }[];
    top_historical_companies: { name: string; count: number }[];
    total_historical_records: number;
}

const ROLES = ['Frontend Engineer', 'Fullstack Developer', 'Data Scientist', 'DevOps Engineer', 'ML Engineer', 'Backend Engineer', 'Cloud Architect', 'Cyber Security Analyst'];
const DOMAINS = ['Full Stack Development', 'Generative AI & Machine Learning', 'Cyber Security', 'DevOps & Cloud Engineering', 'Cloud Solutions Architecture', 'Core CS & Algorithms', 'Data Engineering & MLOps'];

const saveInterviewSession = async (payload: object) => {
    try {
        const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
        if (!user?.email) return;
        await fetch(`${API_BASE_URL}/save-interview-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_email: user.email, ...payload })
        });
    } catch { /* silent fail */ }
};

const playInterviewSound = (type: 'next' | 'finish') => {
    try {
        const url = type === 'next'
            ? 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_3aa2204c3c.mp3?filename=pop-up-something-160353.mp3' // gentle pop
            : 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3?filename=success-1-6297.mp3'; // success chime
        const audio = new Audio(url);
        audio.volume = 0.5;
        audio.play().catch(() => { });
    } catch (e) { console.error(e) }
};

export const InterviewCoach = ({ onComplete }: any) => {
    const [file, setFile] = useState<File | null>(null);
    const [role, setRole] = useState('Frontend Engineer');
    const [domain, setDomain] = useState('Full Stack Development');
    const [level, setLevel] = useState('Junior');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [hasStoredResume, setHasStoredResume] = useState(false);
    const [result, setResult] = useState<AnalysisResult | null>(null);
    const [marketSkills, setMarketSkills] = useState<MarketSkills | null>(null);
    const [marketLoading, setMarketLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'gap' | 'roadmap' | 'trends' | 'mentor' | 'mock' | 'ats'>('gap');
    const [beginnerGuide, setBeginnerGuide] = useState<BeginnerGuide | null>(null);
    const [historicalTrends, setHistoricalTrends] = useState<HistoricalTrends | null>(null);
    const [guideLoading, setGuideLoading] = useState(false);

    // Mock Interview State
    const [mockPlan, setMockPlan] = useState<any[]>([]);
    const [mockQuestions, setMockQuestions] = useState<string[]>([]);
    const [mockIndex, setMockIndex] = useState(0);
    const [mockDifficulty, setMockDifficulty] = useState('Easy');
    const [currentQuestion, setCurrentQuestion] = useState<any>(null);
    const [mockEvals, setMockEvals] = useState<any[]>([]);
    const [userMockAnswer, setUserMockAnswer] = useState('');
    const [isMockLoading, setIsMockLoading] = useState(false);
    const [mockComplete, setMockComplete] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<any>(null);

    // Coding challenge state
    const [codingLanguage, setCodingLanguage] = useState('python');
    const [userApproach, setUserApproach] = useState('');
    const [userCode, setUserCode] = useState('');
    const [codingPhase, setCodingPhase] = useState<'approach' | 'code' | 'results'>('approach');
    const [runningTests, setRunningTests] = useState(false);
    const [testResults, setTestResults] = useState<any>(null);
    const [codingEval, setCodingEval] = useState<any>(null);
    const [confirmSkip, setConfirmSkip] = useState(false);

    // Initialize Speech Recognition
    useEffect(() => {
        const SpeechRecognitionInfo = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognitionInfo) {
            const recognition = new SpeechRecognitionInfo();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            // Re-vamped speech handler for live updates without erasing old text
            recognition.onresult = (event: any) => {
                let finalSegment = '';
                let interimSegment = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalSegment += event.results[i][0].transcript + ' ';
                    } else {
                        interimSegment += event.results[i][0].transcript;
                    }
                }

                // Append final segments permanently
                if (finalSegment) {
                    setUserMockAnswer(prev => prev + finalSegment);
                }
                // (We could show interimSegment in a separate state, but for simplicity we'll just wait for final chunks)
            };

            recognition.onerror = (e: any) => {
                console.error("Speech recognition error", e);
                setIsListening(false);
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = recognition;
        }
    }, []);

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            if (recognitionRef.current) {
                recognitionRef.current.start();
                setIsListening(true);
            } else {
                alert("Speech recognition isn't supported in your browser.");
            }
        }
    };

    // Start Mock Interview Session
    const startMockInterview = async () => {
        setIsMockLoading(true);
        setActiveTab('mock');
        setMockIndex(0); setMockQuestions([]); setMockEvals([]); setMockComplete(false);
        setCurrentQuestion(null); setUserMockAnswer(''); setUserApproach(''); setUserCode('');
        setCodingPhase('approach'); setTestResults(null); setCodingEval(null); setConfirmSkip(false);
        try {
            const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
            const res = await fetch(`${API_BASE_URL}/coach/mock-interview/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role, domain,
                    extracted_skills: result?.extracted_skills || [],
                    user_email: user.email,
                    resume_context: result ? JSON.stringify(result) : ""
                })
            });
            const data = await res.json();
            setMockPlan(data.plan);
            setMockDifficulty(data.difficulty || 'Easy');
            fetchNextQuestion(data.plan[0], []);
        } catch (e) {
            console.error('Failed to start mock', e);
        }
        setIsMockLoading(false);
    };

    const fetchNextQuestion = async (planItem: any, asked: string[]) => {
        setIsMockLoading(true);
        setUserMockAnswer(''); setUserApproach(''); setUserCode('');
        setCodingPhase('approach'); setTestResults(null); setCodingEval(null);
        try {
            const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
            const res = await fetch(`${API_BASE_URL}/coach/mock-interview/question`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role, domain,
                    plan_item: planItem,
                    asked_questions: asked,
                    difficulty: planItem.difficulty || mockDifficulty,
                    user_email: user.email,
                    resume_context: result ? JSON.stringify(result) : ""
                })
            });
            const data = await res.json();
            setCurrentQuestion(data);
            setMockQuestions([...asked, data.question]);
            playInterviewSound('next');
            setTimeout(() => speakText(data.question), 600);
        } catch (e) { console.error(e); }
        setIsMockLoading(false);
    };

    const runTests = async () => {
        if (!currentQuestion?.test_cases) return;
        setRunningTests(true);
        try {
            const res = await fetch(`${API_BASE_URL}/coach/mock-interview/run-tests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: userCode, language: codingLanguage, test_cases: currentQuestion.test_cases })
            });
            setTestResults(await res.json());
        } catch (e) { console.error(e); }
        setRunningTests(false);
    };

    const submitCodingAnswer = async () => {
        setIsMockLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/coach/mock-interview/evaluate-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role, domain,
                    question: currentQuestion.question,
                    approach_text: userApproach,
                    code: userCode,
                    language: codingLanguage,
                    test_cases: currentQuestion.test_cases || []
                })
            });
            const ev = await res.json();
            setCodingEval(ev);
            setCodingPhase('results');
            const newEvals = [...mockEvals, { ...ev, question: currentQuestion.question, type: 'coding' }];
            setMockEvals(newEvals);
            const nextIdx = mockIndex + 1;
            if (nextIdx >= (mockPlan?.length || 0)) {
                setMockComplete(true);
                playInterviewSound('finish');
                saveSession(newEvals);
            }
        } catch (e) { console.error(e); }
        setIsMockLoading(false);
    };

    const submitMockAnswer = async () => {
        setIsMockLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/coach/mock-interview/evaluate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, domain, question: currentQuestion.question, answer: userMockAnswer })
            });
            const ev = await res.json();
            const newEvals = [...mockEvals, { ...ev, question: currentQuestion.question, type: 'standard' }];
            setMockEvals(newEvals);
            const nextIdx = mockIndex + 1;
            if (nextIdx < (mockPlan?.length || 0)) {
                setMockIndex(nextIdx);
                const nextDiff = ev.overall_score >= 8 ? 'Hard' : ev.overall_score >= 5 ? 'Medium' : 'Easy';
                setMockDifficulty(nextDiff);
                fetchNextQuestion(mockPlan[nextIdx], mockQuestions);
            } else {
                setMockComplete(true);
                playInterviewSound('finish');
                saveSession(newEvals);
            }
        } catch (e) { console.error(e); }
        setIsMockLoading(false);
    };

    const advanceFromCodingRound = () => {
        const nextIdx = mockIndex + 1;
        if (nextIdx < (mockPlan?.length || 0)) {
            setMockIndex(nextIdx);
            fetchNextQuestion(mockPlan[nextIdx], mockQuestions);
        } else {
            setMockComplete(true);
            playInterviewSound('finish');
        }
    };

    const skipQuestion = () => {
        // For coding questions, show confirmation banner first instead of auto-advancing
        if (currentQuestion?.category === 'coding') {
            setConfirmSkip(true);
            return;
        }
        doSkip();
    };

    const doSkip = () => {
        const nextIdx = mockIndex + 1;
        const skippedEval = {
            question: currentQuestion.question,
            overall_score: 0,
            strengths: "N/A",
            weaknesses: "Question was skipped. Direct evaluation of this specific topic was not possible during this round.",
            mentor_feedback: "You chose to skip this round. While skipping is an option, we encourage attempting every question—even briefly—to help the AI coach pinpoint your hidden strengths and growth areas.",
            improved_answer: "N/A",
            weak_areas: ["Round Skipped"],
            type: currentQuestion.category === 'coding' ? 'coding' : 'standard'
        };
        const newEvals = [...mockEvals, skippedEval];
        setMockEvals(newEvals);
        setConfirmSkip(false);

        if (nextIdx < (mockPlan?.length || 0)) {
            setMockIndex(nextIdx);
            fetchNextQuestion(mockPlan[nextIdx], mockQuestions);
        } else {
            setMockComplete(true);
            playInterviewSound('finish');
            saveSession(newEvals);
        }
    };

    const saveSession = async (evals: any[]) => {
        try {
            const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
            if (!user.email) return;
            await fetch(`${API_BASE_URL}/coach/mock-interview/save-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_email: user.email, role, domain, language: codingLanguage, evaluations: evals })
            });
        } catch { /* silent */ }
    };

    const speakText = (text: string) => {
        if ('speechSynthesis' in window) {
            const msg = new SpeechSynthesisUtterance(text);
            msg.lang = 'en-US';
            window.speechSynthesis.speak(msg);
        }
    };


    useEffect(() => {
        const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
        if (!user.email) return;

        // Fetch both resume status and student profile (which contains domain)
        fetch(`${API_BASE_URL}/student/profile?user_email=${encodeURIComponent(user.email)}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.has_stored_resume) setHasStoredResume(true);
                if (data.profile?.domain) {
                    console.log("Auto-selecting domain from profile:", data.profile.domain);
                    setDomain(data.profile.domain);
                }
            })
            .catch((err) => console.error("Error fetching profile context:", err));
    }, []);

    const fetchMarketSkills = async () => {
        setMarketLoading(true);
        setActiveTab('trends');
        try {
            const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
            const response = await fetch(`${API_BASE_URL}/teacher/market-skills`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, domain, user_email: user.email })
            });
            const data = await response.json();
            setMarketSkills(data);
        } catch {
            setMarketSkills(null);
        } finally {
            setMarketLoading(false);
        }
    };

    const fetchBeginnerGuide = async () => {
        setGuideLoading(true);
        setActiveTab('mentor');
        try {
            const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
            const response = await fetch(`${API_BASE_URL}/coach/beginner-guide`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, domain, user_email: user.email })
            });
            const data = await response.json();
            setBeginnerGuide(data);
        } catch {
            setBeginnerGuide(null);
        } finally {
            setGuideLoading(false);
        }
    };

    const fetchHistoricalTrends = async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/coach/historical-trends`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, domain })
            });
            const data = await res.json();
            setHistoricalTrends(data);
        } catch {
            setHistoricalTrends(null);
        }
    };

    const handleUpload = async () => {
        if (!file && !hasStoredResume) return;
        setIsAnalyzing(true);
        setResult(null);
        setMarketSkills(null);

        const formData = new FormData();
        if (file) formData.append('file', file);
        formData.append('role', role);
        formData.append('level', level);
        const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
        if (user.email) formData.append('user_email', user.email);

        try {
            const [resumeRes] = await Promise.all([
                fetch(`${API_BASE_URL}/analyze-resume`, { method: 'POST', body: formData }),
                fetchMarketSkills()
            ]);
            fetchHistoricalTrends(); // Background load
            const data = await resumeRes.json();
            setResult(data);
            // Save session to Supabase after state update (300ms allows setMarketSkills to propagate)
            setTimeout(() => {
                const stateSnapshot = marketSkills;
                saveInterviewSession({
                    role,
                    domain,
                    level,
                    readiness_score: data.readiness_score || 0,
                    extracted_skills: data.extracted_skills || [],
                    matched_skills: (data.extracted_skills || []).filter((s: string) =>
                        (stateSnapshot?.required_skills || []).some((r: string) =>
                            r.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(r.toLowerCase())
                        )
                    ),
                    missing_skills: data.missing_skills || [],
                    market_skills: stateSnapshot?.required_skills || [],
                    strong_domains: data.strong_domains || [],
                    ats_score: data.ats_score || null
                });
            }, 300);
            if (onComplete) onComplete();
        } catch (e) {
            console.error(e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    // Historical and Market Intelligence ready

    return (
        <div className="flex-col gap-xl fade-in">
            <header>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 900 }}>🎤 Interview Coach</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: '0.3rem' }}>Resume analysis · Market skill gap detection · Personalized roadmap</p>
            </header>

            {/* Config Panel */}
            <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }} className="coach-grid">
                <div className="glass-card flex-col gap-lg" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary-600)', textTransform: 'uppercase', letterSpacing: '1px' }}>Setup</h3>

                    <div className="flex-col gap-xs">
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Target Role</span>
                        <select value={role} onChange={e => setRole(e.target.value)} className="input-field" style={{ padding: '0.65rem' }}>
                            {ROLES.map(r => <option key={r}>{r}</option>)}
                        </select>
                    </div>

                    <div className="flex-col gap-xs">
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Learning Domain</span>
                        <select value={domain} onChange={e => setDomain(e.target.value)} className="input-field" style={{ padding: '0.65rem' }}>
                            {DOMAINS.map(d => <option key={d}>{d}</option>)}
                        </select>
                    </div>

                    <div className="flex-col gap-xs">
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Experience Level</span>
                        <select value={level} onChange={e => setLevel(e.target.value)} className="input-field" style={{ padding: '0.65rem' }}>
                            {['Fresher', 'Junior', 'Mid-Level', 'Senior'].map(l => <option key={l}>{l}</option>)}
                        </select>
                    </div>

                    <div className="flex-col gap-xs">
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>Coding Language</span>
                        <select value={codingLanguage} onChange={e => setCodingLanguage(e.target.value)} className="input-field" style={{ padding: '0.65rem' }}>
                            {['python', 'javascript', 'java', 'cpp', 'go'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                        </select>
                    </div>


                    {/* Resume Upload */}
                    <div
                        style={{ border: '2px dashed rgba(100,130,255,0.3)', padding: '1.25rem', textAlign: 'center', borderRadius: 'var(--radius-md)', background: 'rgba(100,130,255,0.03)', cursor: 'pointer' }}
                        onDrop={e => { e.preventDefault(); setFile(e.dataTransfer.files[0]); }}
                        onDragOver={e => e.preventDefault()}
                    >
                        <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{file ? '📄' : '📎'}</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                            {file ? file.name : hasStoredResume ? '✅ Stored resume ready' : 'Upload Resume PDF/DOCX'}
                        </p>
                        <input type="file" hidden id="coach-resume" accept=".pdf,.doc,.docx" onChange={e => setFile(e.target.files?.[0] || null)} />
                        <label htmlFor="coach-resume" className="btn btn-secondary" style={{ cursor: 'pointer', fontSize: '0.78rem', padding: '0.5rem 1rem', display: 'inline-block' }}>
                            Browse
                        </label>
                    </div>

                    <button
                        className="btn btn-primary w-full"
                        disabled={(!file && !hasStoredResume) || isAnalyzing}
                        onClick={handleUpload}
                        style={{ height: '48px', fontSize: '0.9rem', fontWeight: 700 }}
                    >
                        {isAnalyzing ? (
                            <span className="flex items-center justify-center gap-md">
                                <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                                Analyzing…
                            </span>
                        ) : '🔍 Analyze Resume'}
                    </button>

                    {/* Pro Mentor Feature */}
                    <button
                        className="btn btn-primary w-full"
                        onClick={() => fetchBeginnerGuide()}
                        disabled={guideLoading}
                        style={{ background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', border: 'none', color: 'white', fontWeight: 800 }}
                    >
                        {guideLoading ? '⏳ Crafting Beginner Roadmap…' : '👨‍🏫 Pro Mentor: Zero-to-Hero Guide'}
                    </button>

                    <button
                        className="btn btn-secondary w-full"
                        onClick={() => fetchMarketSkills()}
                        disabled={marketLoading}
                        style={{ fontSize: '0.8rem' }}
                    >
                        {marketLoading ? '⏳ Loading market trends…' : '📉 Visual Market Analytics'}
                    </button>

                    <button
                        className="btn btn-primary w-full"
                        onClick={startMockInterview}
                        disabled={isMockLoading}
                        style={{ background: 'linear-gradient(135deg, var(--primary-500), #059669)', border: 'none', color: 'white', fontWeight: 800, marginTop: '0.5rem' }}
                    >
                        {isMockLoading ? '⏳ Starting Simulator…' : '🎙️ Start AI Mock Interview'}
                    </button>
                </div>

                {/* Results Panel */}
                <div className="flex-col gap-lg">
                    {!result && !marketSkills && !isAnalyzing && !marketLoading && !isMockLoading && (mockPlan?.length || 0) === 0 && !mockComplete && (
                        <div className="glass-card flex-col items-center justify-center fade-in" style={{ minHeight: '420px', textAlign: 'center', gap: '1rem' }}>
                            <span style={{ fontSize: '4rem' }}>🎯</span>
                            <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)' }}>Your skill analysis will appear here</h3>
                            <p style={{ color: 'var(--text-muted)', maxWidth: '400px', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                Upload your resume and click Analyze to see your skill gap versus today's market demand, powered by Groq AI.
                            </p>
                        </div>
                    )}

                    {(isAnalyzing || marketLoading) && (
                        <div className="glass-card flex-col items-center justify-center" style={{ minHeight: '200px', gap: '1rem' }}>
                            <div style={{ width: '48px', height: '48px', border: '4px solid rgba(100,130,255,0.15)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                            <p style={{ color: 'var(--text-secondary)' }}>Fetching market intelligence + parsing resume…</p>
                        </div>
                    )}

                    {/* Main Content Area */}
                    <div className="flex-col gap-lg">
                        {/* Tab Navigation (Always show if we have data) */}
                        {(result || marketSkills || beginnerGuide || (mockPlan?.length || 0) > 0 || isMockLoading || mockComplete) && (
                            <div className="flex gap-sm flex-wrap">
                                {(['gap', 'roadmap', 'trends', 'mentor', 'mock', 'ats'] as const).map(tab => {
                                    const isAvailable = (tab === 'gap' || tab === 'roadmap' || tab === 'ats') ? !!result :
                                        (tab === 'trends') ? !!marketSkills :
                                            (tab === 'mentor') ? !!beginnerGuide :
                                                (tab === 'mock') ? ((mockPlan?.length || 0) > 0 || isMockLoading) : false;
                                    if (!isAvailable) return null;

                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            className={activeTab === tab ? 'btn btn-primary' : 'btn btn-secondary'}
                                            style={{ fontSize: '0.82rem', padding: '0.5rem 1.2rem' }}
                                        >
                                            {tab === 'gap' ? '🎯 Skill Gap' :
                                                tab === 'roadmap' ? '📋 Roadmap' :
                                                    tab === 'trends' ? '📊 Market Trends' :
                                                        tab === 'mock' ? '🎙️ Mock Interview' :
                                                            tab === 'ats' ? '🧬 ATS Audit' : '👨‍🏫 Pro Mentor'}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Gap Analysis & Resume Insights */}
                        {activeTab === 'gap' && result && (
                            <div className="flex-col gap-lg fade-in">
                                <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid rgba(56,183,248,0.2)', background: 'rgba(56,183,248,0.03)' }}>
                                    <div className="flex justify-between items-center flex-wrap gap-md">
                                        <div>
                                            <p style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: '4px' }}>INTERVIEW READINESS SCORE</p>
                                            <h3 style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--accent-blue)' }}>{result.readiness_score}%</h3>
                                        </div>
                                        <div style={{ flex: 1, maxWidth: '400px' }}>
                                            <div style={{ height: '10px', background: 'rgba(100,130,255,0.10)', borderRadius: '5px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${result.readiness_score}%`, background: result.readiness_score >= 70 ? 'var(--primary-500)' : result.readiness_score >= 40 ? 'var(--accent-orange)' : 'var(--accent-red)', borderRadius: '5px', transition: 'width 1s ease' }} />
                                            </div>
                                            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>{result.readiness_score >= 70 ? '🟢 Ready for interviews!' : '🟡 Solid base — bridge gaps.'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="glass-card" style={{ padding: '1.5rem' }}>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '1rem' }}>📋 Skills Found in Your Resume</h4>
                                    <div className="flex flex-wrap gap-xs">
                                        {result.extracted_skills.map(s => {
                                            const matched = marketSkills?.required_skills.some(r => r.toLowerCase().includes(s.toLowerCase()));
                                            return <span key={s} className="badge" style={{ fontSize: '0.78rem', borderColor: matched ? 'rgba(100,130,255,0.5)' : 'var(--glass-border)', color: matched ? 'var(--primary-500)' : 'var(--text-primary)' }}>{s}</span>;
                                        })}
                                    </div>
                                </div>

                                {marketSkills && (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid rgba(100,130,255,0.2)' }}>
                                            <h5 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary-500)', marginBottom: '0.75rem' }}>✅ Matching Market Skills</h5>
                                            <div className="flex flex-wrap gap-xs">
                                                {marketSkills.required_skills.filter(s => result.extracted_skills.some(r => r.toLowerCase().includes(s.toLowerCase()))).map(s => <span key={s} className="badge" style={{ fontSize: '0.72rem', color: 'var(--primary-500)', borderColor: 'rgba(100,130,255,0.3)' }}>{s}</span>)}
                                            </div>
                                        </div>
                                        <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid rgba(239,68,68,0.2)' }}>
                                            <h5 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-red)', marginBottom: '0.75rem' }}>❌ Missing Critical Skills</h5>
                                            <div className="flex flex-wrap gap-xs">
                                                {marketSkills.required_skills.filter(s => !result.extracted_skills.some(r => r.toLowerCase().includes(s.toLowerCase()))).slice(0, 10).map(s => <span key={s} className="badge" style={{ fontSize: '0.72rem', color: 'var(--accent-red)', borderColor: 'rgba(239,68,68,0.3)' }}>{s}</span>)}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Strong Domains */}
                                {result.strong_domains.length > 0 && (
                                    <div className="glass-card" style={{ padding: '1.25rem' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.75rem' }}>🌟 Your Strongest Areas</h4>
                                        <div className="flex flex-wrap gap-xs">
                                            {result.strong_domains.map(s => <span key={s} className="badge" style={{ fontSize: '0.78rem', borderColor: 'rgba(100,130,255,0.4)', color: 'var(--primary-500)', background: 'rgba(100,130,255,0.06)' }}>{s}</span>)}
                                        </div>
                                    </div>
                                )}

                                {/* Missing skills from resume analysis */}
                                {result.missing_skills.length > 0 && (
                                    <div className="glass-card" style={{ padding: '1.25rem', border: '1px solid rgba(239,68,68,0.15)', background: 'rgba(239,68,68,0.02)' }}>
                                        <h4 style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.75rem' }}>⚠️ Skills to Develop (Resume Analysis)</h4>
                                        <div className="flex-col gap-sm">
                                            {result.missing_skills.map(s => (
                                                <div key={s} className="flex items-center gap-sm" style={{ padding: '0.6rem 1rem', background: 'rgba(100,130,255,0.04)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.15)' }}>
                                                    <span style={{ color: 'var(--accent-red)' }}>!</span>
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ATS Audit Section */}
                        {activeTab === 'ats' && (
                            <div className="flex-col gap-lg fade-in">
                                {result?.ats_score ? (
                                    <>
                                        <div className="glass-card" style={{ padding: '2rem', border: '1px solid var(--primary-500)', background: 'linear-gradient(135deg, rgba(139,92,246,0.05) 0%, transparent 100%)' }}>
                                            <div className="flex justify-between items-center flex-wrap gap-xl">
                                                <div style={{ textAlign: 'center' }}>
                                                    <p style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--primary-400)', letterSpacing: '2px', marginBottom: '8px' }}>ATS OPTIMIZATION SCORE</p>
                                                    <h3 style={{ fontSize: '4rem', fontWeight: 900, color: result.ats_score.total_score >= 80 ? 'var(--accent-green)' : result.ats_score.total_score >= 50 ? 'var(--accent-orange)' : 'var(--accent-red)' }}>
                                                        {result.ats_score.total_score}%
                                                    </h3>
                                                </div>
                                                <div style={{ flex: 1, minWidth: '300px' }} className="flex-col gap-md">
                                                    {result.ats_score.breakdown && Object.entries(result.ats_score.breakdown).map(([key, val]) => (
                                                        <div key={key} className="flex-col gap-xs">
                                                            <div className="flex justify-between" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                                                                <span style={{ textTransform: 'capitalize' }}>{key.replace('_', ' ')}</span>
                                                                <span>{val as number}%</span>
                                                            </div>
                                                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${val}%`, background: 'var(--primary-500)', borderRadius: '3px' }} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid-2 gap-lg">
                                            <div className="glass-card" style={{ padding: '1.5rem' }}>
                                                <h4 style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--accent-blue)', marginBottom: '1.25rem', textTransform: 'uppercase' }}>✅ Critical Keywords Found</h4>
                                                <div className="flex flex-wrap gap-xs">
                                                    {(result.ats_score.critical_keywords_found || []).map(k => <span key={k} className="badge" style={{ fontSize: '0.72rem', borderColor: 'rgba(56,183,248,0.2)' }}>{k}</span>)}
                                                </div>
                                            </div>
                                            <div className="glass-card" style={{ padding: '1.5rem' }}>
                                                <h4 style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--accent-red)', marginBottom: '1.25rem', textTransform: 'uppercase' }}>❌ Missing Domain Keywords</h4>
                                                <div className="flex flex-wrap gap-xs">
                                                    {(result.ats_score.missing_critical_keywords || []).map(k => <span key={k} className="badge" style={{ fontSize: '0.72rem', borderColor: 'rgba(239,68,68,0.2)', color: 'var(--accent-red)' }}>{k}</span>)}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '6px solid var(--accent-orange)' }}>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: 900, color: 'white', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 'sm' }}>🛠️ Strategic Improvement Suggestions</h4>
                                            <div className="flex-col gap-sm">
                                                {(result.ats_score.improvement_suggestions || result.ats_score.suggestions || []).map((s, i) => (
                                                    <div key={i} className="flex items-start gap-sm" style={{ padding: '0.8rem', background: 'rgba(245,158,11,0.03)', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.1)' }}>
                                                        <span style={{ color: 'var(--accent-orange)', fontWeight: 900 }}>{i + 1}.</span>
                                                        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{s}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="glass-card flex-col items-center justify-center p-xl gap-md" style={{ minHeight: '300px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                        <span style={{ fontSize: '3rem' }}>⚠️</span>
                                        <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>ATS Audit Unavailable</h3>
                                        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '400px' }}>
                                            We couldn't generate the ATS compatibility report. This usually happens if the AI service failed or the resume couldn't be parsed properly. Please upload a clearer PDF or DOCX file.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Roadmap */}
                        {activeTab === 'roadmap' && result && (
                            <div className="glass-card fade-in" style={{ padding: '1.5rem' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '1.25rem' }}>📋 Personalized Learning Roadmap</h4>
                                {[
                                    { label: 'PHASE 1: FOUNDATION', color: 'var(--primary-500)', items: result.roadmap.beginner },
                                    { label: 'PHASE 2: INTERMEDIATE', color: 'var(--accent-blue)', items: result.roadmap.intermediate },
                                    { label: 'PHASE 3: ADVANCED', color: 'var(--accent-orange)', items: result.roadmap.advanced },
                                    { label: 'PHASE 4: PROJECTS', color: 'var(--primary-500)', items: result.roadmap.projects }
                                ].map(phase => (
                                    <div key={phase.label} style={{ marginBottom: '1.25rem', paddingLeft: '1rem', borderLeft: `3px solid ${phase.color}` }}>
                                        <p style={{ fontSize: '0.7rem', color: phase.color, fontWeight: 900, letterSpacing: '1px', marginBottom: '0.5rem' }}>{phase.label}</p>
                                        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                                            {phase.items.map((item, i) => {
                                                const parts = item.split(': [');
                                                if (parts.length > 1) {
                                                    const subs = parts[1].replace(']', '').split(', ');
                                                    return (
                                                        <li key={i} style={{ marginBottom: '0.6rem' }}>
                                                            <strong style={{ color: 'var(--text-primary)', fontSize: '0.85rem' }}>{parts[0]}</strong>
                                                            <div className="flex flex-wrap gap-xs" style={{ marginTop: '4px' }}>
                                                                {subs.map(s => <span key={s} style={{ fontSize: '0.65rem', padding: '0.1rem 0.5rem', background: 'rgba(100,130,255,0.08)', borderRadius: '4px', color: 'var(--text-secondary)' }}>{s}</span>)}
                                                            </div>
                                                        </li>
                                                    );
                                                }
                                                return <li key={i} style={{ fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: '4px' }}>— {item}</li>;
                                            })}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Trends */}
                        {activeTab === 'trends' && marketSkills && (
                            <div className="flex-col gap-lg fade-in">
                                <div className="glass-card" style={{ padding: '1.5rem' }}>
                                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '1.5rem', color: 'var(--primary-500)' }}>📈 Live Market Skill Demand</h4>
                                    <div className="flex-col gap-md">
                                        {(marketSkills.trend_analytics || [
                                            { skill: 'Core Tech Stack', demand_score: 95 },
                                            { skill: 'Cloud & DevOps', demand_score: 82 },
                                            { skill: 'AI Integration', demand_score: 75 },
                                            { skill: 'Soft Skills', demand_score: 65 }
                                        ]).map((trend, i) => (
                                            <div key={i} className="flex-col gap-xs">
                                                <div className="flex justify-between" style={{ fontSize: '0.8rem' }}>
                                                    <span style={{ fontWeight: 700 }}>{trend.skill}</span>
                                                    <span style={{ color: 'var(--text-muted)' }}>{trend.demand_score}% Demand</span>
                                                </div>
                                                <div style={{ height: '10px', background: 'var(--glass-border)', borderRadius: '5px', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${trend.demand_score}%`, background: i === 0 ? 'var(--primary-500)' : 'var(--accent-blue)', transition: 'width 1s ease' }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1.5rem', fontStyle: 'italic' }}>
                                        *Data periodically scraped from live tech job portals and industry reports for 2026 outlook.
                                    </p>
                                </div>
                                <div className="glass-card" style={{ padding: '1.5rem' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-orange)', marginBottom: '0.5rem' }}>💼 Market Pulse</h4>
                                    <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{marketSkills.growth_trend}</p>
                                    <div className="flex-col gap-sm" style={{ marginTop: '1rem' }}>
                                        <p style={{ fontSize: '0.75rem', fontWeight: 800 }}>Average Salary: <span style={{ color: 'var(--primary-500)' }}>{marketSkills.avg_salary_india}</span></p>
                                        <div className="flex flex-wrap gap-xs">
                                            {marketSkills.top_tools.map(t => <span key={t} className="badge" style={{ fontSize: '0.7rem' }}>{t}</span>)}
                                        </div>
                                    </div>
                                </div>

                                {historicalTrends && historicalTrends.total_historical_records > 0 && (
                                    <div className="glass-card fade-in" style={{ padding: '1.5rem', background: 'rgba(100,130,255,0.02)', border: '1px solid rgba(100,130,255,0.1)' }}>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--accent-teal)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 'sm' }}>
                                            📜 Historical Market Context (2021-2025)
                                        </h4>
                                        <div className="flex-col gap-lg">
                                            <div className="flex gap-lg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: '100px', padding: '0 1rem' }}>
                                                {historicalTrends.trend_line.map((item, i) => {
                                                    const maxCount = Math.max(...historicalTrends.trend_line.map(t => t.count), 1);
                                                    const barHeight = (item.count / maxCount) * 100;
                                                    return (
                                                        <div key={item.year} className="flex-col items-center gap-xs" style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                                                            <div
                                                                style={{
                                                                    width: '100%',
                                                                    borderRadius: '4px 4px 0 0',
                                                                    height: `${barHeight}%`,
                                                                    background: i === 4 ? 'var(--accent-teal)' : 'rgba(20,184,166,0.3)',
                                                                    transition: 'height 1s ease-out',
                                                                    minHeight: item.count > 0 ? '4px' : '0'
                                                                }}
                                                                title={`${item.count} Jobs Recorded`}
                                                            />
                                                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)' }}>{item.year.slice(2)}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="flex-col gap-sm" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                                                <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Top Historical Recruiters:</p>
                                                <div className="flex flex-wrap gap-xs">
                                                    {historicalTrends.top_historical_companies.map(c => (
                                                        <span key={c.name} className="badge" style={{ fontSize: '0.68rem', background: 'transparent', borderColor: 'rgba(100,130,255,0.3)' }}>{c.name} ({c.count})</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                                Analyzed {historicalTrends.total_historical_records} past job postings from project data artifacts.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Mentor */}
                        {activeTab === 'mentor' && beginnerGuide && (
                            <div className="flex-col gap-lg fade-in">
                                <div className="glass-card" style={{ padding: '2rem', border: '1px solid #8b5cf633', background: 'linear-gradient(135deg, rgba(139,92,246,0.05) 0%, transparent 100%)' }}>
                                    <h3 style={{ fontSize: '1.4rem', fontWeight: 900, marginBottom: '1rem', color: '#8b5cf6' }}>🚀 {beginnerGuide.guide_title}</h3>
                                    <div style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-primary)', marginBottom: '2rem' }} dangerouslySetInnerHTML={{ __html: beginnerGuide.summary.replace(/\n/g, '<br/>') }} />
                                    <div className="flex-col gap-lg">
                                        {beginnerGuide.phases.map((p, i) => (
                                            <div key={i} className="flex gap-md">
                                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#8b5cf6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '0.75rem', flexShrink: 0 }}>{i + 1}</div>
                                                <div>
                                                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '0.2rem' }}>{p.phase}</h4>
                                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p.focus}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                                    <div className="glass-card" style={{ padding: '1.25rem' }}>
                                        <h4 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-teal)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Essential Soft Skills</h4>
                                        <div className="flex flex-wrap gap-xs">
                                            {beginnerGuide.soft_skills.map(s => <span key={s} className="badge" style={{ fontSize: '0.72rem', borderColor: 'rgba(20,184,166,0.2)', color: 'var(--accent-teal)' }}>{s}</span>)}
                                        </div>
                                    </div>
                                    <div className="glass-card" style={{ padding: '1.25rem' }}>
                                        <h4 style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--accent-orange)', marginBottom: '0.75rem', textTransform: 'uppercase' }}>2026 Trends</h4>
                                        <div className="flex flex-wrap gap-xs">
                                            {beginnerGuide.trends.map(t => <span key={t} className="badge" style={{ fontSize: '0.72rem', borderColor: 'rgba(245,158,11,0.2)', color: 'var(--accent-orange)' }}>{t}</span>)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Mock Interview */}
                        {activeTab === 'mock' && (
                            <div className="flex-col gap-lg fade-in">

                                {/* Progress bar */}
                                {!mockComplete && mockPlan.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        {mockPlan.map((p, i) => {
                                            const done = i < mockIndex;
                                            const active = i === mockIndex;
                                            const color = p.type === 'coding' ? '#f59e0b' : done ? 'var(--primary-500)' : active ? 'var(--accent-blue)' : 'rgba(255,255,255,0.08)';
                                            return (
                                                <div key={i} style={{ flex: 1, height: '6px', borderRadius: '3px', background: color, transition: 'background 0.5s' }} title={`${p.type} – ${p.difficulty}`} />
                                            );
                                        })}
                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{mockIndex + 1} / {mockPlan.length}</span>
                                    </div>
                                )}

                                {!mockComplete ? (
                                    <div className="glass-card" style={{ padding: '2rem' }}>
                                        <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '1px solid var(--glass-border)' }}>
                                            <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                                                {currentQuestion?.category === 'coding' ? '💻 Coding Challenge' : '🤖 Live Interview Simulator'}
                                            </h3>
                                            <div className="flex gap-sm">
                                                {currentQuestion?.difficulty && (
                                                    <span className="badge" style={{
                                                        background: currentQuestion.difficulty === 'Easy' ? '#059669' : currentQuestion.difficulty === 'Medium' ? '#d97706' : '#dc2626',
                                                        color: 'white', fontSize: '0.72rem'
                                                    }}>{currentQuestion.difficulty}</span>
                                                )}
                                                <span className="badge" style={{ background: 'var(--primary-500)', color: 'white' }}>Q{mockIndex + 1}/{mockPlan?.length || 0}</span>
                                            </div>
                                        </div>

                                        {currentQuestion ? (
                                            currentQuestion.category === 'coding' ? (
                                                /* ── CODING CHALLENGE ─────────────────────────────── */
                                                <div className="flex-col gap-lg">
                                                    {/* Problem statement */}
                                                    <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.25)', padding: '1.5rem', borderRadius: '12px' }}>
                                                        <p style={{ fontSize: '0.72rem', fontWeight: 900, color: '#f59e0b', letterSpacing: '1px', marginBottom: '0.5rem' }}>
                                                            {currentQuestion.topic?.toUpperCase() || 'DSA'} – {currentQuestion.difficulty?.toUpperCase()}
                                                        </p>
                                                        <p style={{ fontSize: '1rem', color: 'var(--text-primary)', lineHeight: 1.7 }}>{currentQuestion.question}</p>
                                                    </div>

                                                    {/* Examples */}
                                                    {currentQuestion.examples?.length > 0 && (
                                                        <div className="flex-col gap-sm">
                                                            <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)' }}>EXAMPLES:</p>
                                                            {currentQuestion.examples.map((ex: any, i: number) => (
                                                                <div key={i} style={{ background: 'rgba(15, 23, 42, 0.95)', padding: '1rem 1.25rem', borderRadius: '12px', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.85rem', color: '#f1f5f9', border: '1px solid rgba(100,130,255,0.15)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                                                    <span style={{ color: '#60a5fa', fontWeight: 700 }}>Input:</span> {ex.input} &nbsp;
                                                                    <span style={{ color: '#10b981', fontWeight: 700 }}>Output:</span> {ex.output}
                                                                    {ex.explanation && <span style={{ color: '#94a3b8', marginLeft: '0.5rem' }}> — {ex.explanation}</span>}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Phase tabs */}
                                                    <div className="flex gap-sm">
                                                        {(['approach', 'code', 'results'] as const).map(ph => (
                                                            <button key={ph} onClick={() => setCodingPhase(ph)}
                                                                className={codingPhase === ph ? 'btn btn-primary' : 'btn btn-secondary'}
                                                                style={{ fontSize: '0.78rem', padding: '0.4rem 1rem' }}
                                                                disabled={ph === 'results' && !codingEval}>
                                                                {ph === 'approach' ? '1️⃣ Explain Approach' : ph === 'code' ? '2️⃣ Write & Run Code' : '3️⃣ Results'}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {/* Skip Confirmation Banner (Visible in any phase) */}
                                                    {confirmSkip && (
                                                        <div style={{ marginTop: '0.5rem', padding: '1rem 1.25rem', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '0.88rem', color: 'var(--accent-red)', fontWeight: 700, flex: 1 }}>
                                                                ⚠️ Are you sure you want to skip this coding challenge? It will be marked as skipped in your feedback.
                                                            </span>
                                                            <div className="flex gap-sm">
                                                                <button className="btn btn-secondary" onClick={() => setConfirmSkip(false)} style={{ fontSize: '0.78rem', padding: '0.4rem 1rem' }}>
                                                                    ✏️ Keep Trying
                                                                </button>
                                                                <button className="btn" onClick={doSkip} style={{ fontSize: '0.78rem', padding: '0.4rem 1rem', background: 'rgba(239,68,68,0.2)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.4)' }}>
                                                                    ⏩ Yes, Skip
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* PHASE 1: Approach */}
                                                    {codingPhase === 'approach' && (
                                                        <div className="flex-col gap-md">
                                                            <label style={{ fontSize: '0.85rem', fontWeight: 800 }}>Explain your approach before coding:</label>
                                                            {currentQuestion.hints?.length > 0 && (
                                                                <div style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', padding: '0.85rem', borderRadius: '8px' }}>
                                                                    <p style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: 800 }}>💡 HINTS (optional):</p>
                                                                    {currentQuestion.hints.map((h: string, i: number) => <p key={i} style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>• {h}</p>)}
                                                                </div>
                                                            )}
                                                            <textarea value={userApproach} onChange={e => setUserApproach(e.target.value)}
                                                                className="input-field" style={{ minHeight: '130px', padding: '1rem', fontFamily: 'inherit' }}
                                                                placeholder="Describe your algorithm. e.g. I'll use a hash map to track seen elements for O(n) time complexity..." />
                                                            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}
                                                                onClick={() => setCodingPhase('code')} disabled={userApproach.trim().length < 10}>
                                                                Next: Write Code →
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* PHASE 2: Code Editor */}
                                                    {codingPhase === 'code' && (
                                                        <div className="flex-col gap-md">
                                                            <div className="flex justify-between items-center">
                                                                <label style={{ fontSize: '0.85rem', fontWeight: 800 }}>Write your solution:</label>
                                                                <select value={codingLanguage} onChange={e => { setCodingLanguage(e.target.value); setUserCode(''); }}
                                                                    className="input-field" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', width: 'auto' }}>
                                                                    {['python', 'javascript', 'java', 'cpp', 'go'].map(l => <option key={l} value={l}>{l.toUpperCase()}</option>)}
                                                                </select>
                                                            </div>
                                                            {/* Function signature hint */}
                                                            {currentQuestion.function_signature?.[codingLanguage] && !userCode && (
                                                                <div style={{ background: 'rgba(15, 23, 42, 0.95)', padding: '1.25rem', borderRadius: '12px', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.85rem', color: '#f1f5f9', border: '1px solid rgba(100,130,255,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                                                                    <p style={{ fontSize: '0.68rem', color: 'var(--primary-400)', marginBottom: '0.4rem', fontWeight: 800 }}>STARTER TEMPLATE:</p>
                                                                    <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#cbd5e1' }}>{currentQuestion.function_signature[codingLanguage]}</pre>
                                                                    <button onClick={() => setUserCode(currentQuestion.function_signature[codingLanguage])}
                                                                        style={{ marginTop: '0.6rem', fontSize: '0.75rem', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, padding: 0 }}>
                                                                        Use template ↗
                                                                    </button>
                                                                </div>
                                                            )}
                                                            <textarea value={userCode} onChange={e => setUserCode(e.target.value)}
                                                                className="input-field"
                                                                style={{
                                                                    minHeight: '300px', padding: '1.25rem', fontFamily: '"JetBrains Mono", monospace',
                                                                    fontSize: '0.95rem', background: 'rgba(15, 23, 42, 0.98)', color: '#f8fafc',
                                                                    lineHeight: 1.7, border: '1px solid rgba(100,130,255,0.3)', borderRadius: '12px',
                                                                    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)'
                                                                }}
                                                                placeholder={`Write your ${codingLanguage} solution here...`} />

                                                            {/* Test Results Preview */}
                                                            {testResults && (
                                                                <div style={{ background: testResults.all_passed ? 'rgba(5,150,105,0.08)' : 'rgba(239,68,68,0.06)', border: `1px solid ${testResults.all_passed ? '#059669' : '#dc2626'}`, padding: '1rem', borderRadius: '10px' }}>
                                                                    <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
                                                                        <strong style={{ color: testResults.all_passed ? '#34d399' : '#f87171' }}>
                                                                            {testResults.all_passed ? '✅ All Tests Passed!' : `❌ ${testResults.passed}/${testResults.total} Tests Passed`}
                                                                        </strong>
                                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{testResults.score_pct}% score</span>
                                                                    </div>
                                                                    {testResults.test_results?.map((tc: any, i: number) => (
                                                                        <div key={i} style={{ marginBottom: '0.5rem', padding: '0.6rem', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                                                            <span style={{ color: tc.passed ? '#34d399' : '#f87171' }}>{tc.passed ? '✓' : '✗'}</span>
                                                                            {' '}Input: <span style={{ color: '#60a5fa' }}>{tc.input}</span>
                                                                            {' '}→ Expected: <span style={{ color: '#34d399' }}>{tc.expected}</span>
                                                                            {!tc.passed && <span style={{ color: '#f87171' }}> Got: {tc.actual || tc.error}</span>}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            <div className="flex gap-md">
                                                                <button className="btn btn-secondary" onClick={runTests} disabled={runningTests || userCode.trim().length < 5}
                                                                    style={{ padding: '0.75rem 1.5rem' }}>
                                                                    {runningTests ? '⏳ Running...' : '▶ Run & Test'}
                                                                </button>
                                                                <button className="btn btn-primary" onClick={submitCodingAnswer}
                                                                    disabled={isMockLoading || userCode.trim().length < 10}
                                                                    style={{ padding: '0.75rem 1.5rem', background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                                                                    {isMockLoading ? '⏳ Evaluating...' : '✅ Submit for AI Feedback'}
                                                                </button>
                                                                <button className="btn btn-secondary" onClick={skipQuestion} disabled={isMockLoading} style={{ opacity: 0.7, fontSize: '0.8rem' }}>
                                                                    ⏩ Skip Round
                                                                </button>
                                                            </div>
                                                            <div style={{ marginTop: '2rem' }}></div>
                                                        </div>
                                                    )}


                                                    {/* PHASE 3: Results */}
                                                    {codingPhase === 'results' && codingEval && (
                                                        <div className="flex-col gap-lg">
                                                            {/* Score Cards */}
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '0.75rem' }}>
                                                                {[
                                                                    { label: 'Overall', val: codingEval.overall_score, color: '#6366f1' },
                                                                    { label: 'Correctness', val: codingEval.correctness_score, color: '#059669' },
                                                                    { label: 'Approach', val: codingEval.approach_score, color: '#d97706' },
                                                                    { label: 'Code Quality', val: codingEval.code_quality_score, color: '#0891b2' },
                                                                ].map(({ label, val, color }) => (
                                                                    <div key={label} style={{ background: 'rgba(15, 23, 42, 0.95)', padding: '1.25rem 1rem', borderRadius: '12px', textAlign: 'center', border: `1px solid ${color}`, boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
                                                                        <p style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 800, marginBottom: '6px', letterSpacing: '0.5px' }}>{label.toUpperCase()}</p>
                                                                        <p style={{ fontSize: '2.2rem', fontWeight: 900, color, lineHeight: 1 }}>{val}<span style={{ fontSize: '1rem', color: '#64748b' }}>/10</span></p>
                                                                    </div>
                                                                ))}
                                                            </div>

                                                            {/* Complexity */}
                                                            <div className="flex gap-md flex-wrap">
                                                                <span className="badge" style={{ background: 'rgba(100,130,255,0.1)', color: 'var(--primary-400)' }}>⏱ Time: {codingEval.time_complexity}</span>
                                                                <span className="badge" style={{ background: 'rgba(100,130,255,0.1)', color: 'var(--primary-400)' }}>🗄 Space: {codingEval.space_complexity}</span>
                                                                {codingEval.test_execution?.passed !== undefined && (
                                                                    <span className="badge" style={{ background: codingEval.test_execution.all_passed ? 'rgba(5,150,105,0.15)' : 'rgba(239,68,68,0.15)', color: codingEval.test_execution.all_passed ? '#34d399' : '#f87171' }}>
                                                                        Tests: {codingEval.test_execution.passed}/{codingEval.test_execution.total}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Strengths/Weaknesses */}
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                                <div style={{ background: 'rgba(5,150,105,0.05)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(5,150,105,0.15)' }}>
                                                                    <strong style={{ color: '#34d399', fontSize: '0.8rem' }}>✅ Strengths</strong>
                                                                    <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{codingEval.strengths}</p>
                                                                </div>
                                                                <div style={{ background: 'rgba(239,68,68,0.05)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.15)' }}>
                                                                    <strong style={{ color: '#f87171', fontSize: '0.8rem' }}>⚠️ Weaknesses</strong>
                                                                    <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{codingEval.weaknesses}</p>
                                                                </div>
                                                            </div>

                                                            {/* Optimal Solution */}
                                                            <div style={{ background: 'rgba(56,183,248,0.05)', padding: '1.25rem', borderRadius: '10px', border: '1px solid rgba(56,183,248,0.15)' }}>
                                                                <strong style={{ color: 'var(--accent-blue)', fontSize: '0.8rem' }}>🏆 Optimal Approach</strong>
                                                                <p style={{ fontSize: '0.88rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{codingEval.optimal_solution}</p>
                                                                {codingEval.improved_code && (
                                                                    <pre style={{ marginTop: '0.75rem', background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', fontFamily: 'monospace', fontSize: '0.8rem', overflowX: 'auto', whiteSpace: 'pre-wrap', color: '#a5b4fc' }}>
                                                                        {codingEval.improved_code}
                                                                    </pre>
                                                                )}
                                                            </div>

                                                            {/* Advice */}
                                                            <div style={{ background: 'rgba(245,158,11,0.05)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(245,158,11,0.15)' }}>
                                                                <strong style={{ color: '#f59e0b', fontSize: '0.8rem' }}>💡 Coach Advice</strong>
                                                                <p style={{ fontSize: '0.88rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{codingEval.advice}</p>
                                                            </div>

                                                            {mockIndex + 1 < (mockPlan?.length || 0) && (
                                                                <button className="btn btn-primary" onClick={advanceFromCodingRound} style={{ alignSelf: 'flex-start', padding: '0.8rem 2rem', marginTop: '1rem' }}>
                                                                    Next Question →
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                /* ── STANDARD Q&A ─────────────────────────────── */
                                                <div className="flex-col gap-lg">
                                                    <div style={{ background: 'rgba(56,183,248,0.05)', border: '1px solid rgba(56,183,248,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                                                        <p style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>
                                                            {currentQuestion.category?.replace('_', ' ')} — {currentQuestion.difficulty || mockDifficulty}
                                                        </p>
                                                        <p style={{ fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>{currentQuestion.question}</p>
                                                    </div>

                                                    {currentQuestion.expected_key_points?.length > 0 && (
                                                        <div style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.15)', padding: '0.85rem 1rem', borderRadius: '8px' }}>
                                                            <p style={{ fontSize: '0.68rem', color: '#1e40af', fontWeight: 900 }}>WHAT INTERVIEWERS LOOK FOR:</p>
                                                            <div className="flex flex-wrap gap-xs" style={{ marginTop: '0.5rem' }}>
                                                                {currentQuestion.expected_key_points.map((kp: string) => <span key={kp} className="badge" style={{ fontSize: '0.7rem', borderColor: 'rgba(139,92,246,0.3)', color: '#1e40af' }}>{kp}</span>)}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="flex-col gap-sm">
                                                        <div className="flex justify-between items-center">
                                                            <label style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-secondary)' }}>Your Answer:</label>
                                                            <button onClick={toggleListening}
                                                                className={`btn ${isListening ? 'btn-danger' : 'btn-secondary'}`}
                                                                style={{
                                                                    padding: '0.4rem 1rem', fontSize: '0.8rem',
                                                                    background: isListening ? '#EF4444' : 'var(--glass-border)',
                                                                    color: isListening ? 'white' : 'var(--text-primary)', border: 'none',
                                                                    animation: isListening ? 'pulse 2s infinite' : 'none'
                                                                }}>
                                                                {isListening ? '⏹️ Stop Recording' : '🎤 Speak Answer'}
                                                            </button>
                                                        </div>
                                                        <textarea value={userMockAnswer} onChange={e => setUserMockAnswer(e.target.value)}
                                                            className="input-field"
                                                            style={{
                                                                minHeight: '200px', padding: '1.25rem', fontSize: '1.05rem',
                                                                background: isListening ? 'rgba(239,68,68,0.08)' : 'rgba(15, 23, 42, 0.95)',
                                                                color: isListening ? '#f87171' : '#f1f5f9',
                                                                border: isListening ? '2px solid #ef4444' : '1px solid rgba(100,130,255,0.2)',
                                                                lineHeight: 1.7, borderRadius: '12px', boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.2)'
                                                            }}
                                                            placeholder="Type your answer here or click 'Speak Answer'... (Tip: Use the STAR method)" />
                                                    </div>

                                                    <div className="flex gap-md" style={{ marginTop: '1.5rem', gap: '1rem' }}>
                                                        <button className="btn btn-primary" onClick={submitMockAnswer}
                                                            disabled={isMockLoading || userMockAnswer.trim().length === 0}
                                                            style={{ padding: '0.8rem 2rem' }}>
                                                            {isMockLoading ? '⏳ Evaluating...' : 'Submit Answer →'}
                                                        </button>
                                                        <button className="btn btn-secondary" onClick={skipQuestion} disabled={isMockLoading} style={{ opacity: 0.6, padding: '0.8rem 2rem' }}>
                                                            ⏩ Skip Question
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        ) : (
                                            <div className="flex-col items-center justify-center py-xl">
                                                <div style={{ width: '40px', height: '40px', border: '3px solid rgba(100,130,255,0.2)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                                <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>AI generating personalised question…</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex-col gap-lg fade-in" style={{ padding: '1rem' }}>
                                        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(5,150,105,0.05) 0%, transparent 100%)', border: '1px solid rgba(5,150,105,0.2)' }}>
                                            <span style={{ fontSize: '4rem' }}>⭐</span>
                                            <h2 style={{ fontSize: '2rem', fontWeight: 900, marginTop: '1rem' }}>Interview Complete!</h2>
                                            <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>You've completed all {mockPlan.length} rounds of the AI Simulator.</p>

                                            <div className="flex justify-center gap-xl">
                                                <div>
                                                    <p style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '1px' }}>OVERALL PERFORMANCE</p>
                                                    <h3 style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--primary-500)' }}>
                                                        {mockEvals.length > 0 ? Math.round(mockEvals.reduce((acc, curr) => acc + (curr.overall_score || 0), 0) / mockEvals.length) * 10 : 0}%
                                                    </h3>
                                                </div>
                                            </div>

                                            <button className="btn btn-primary mt-xl" onClick={() => { setMockComplete(false); setMockEvals([]); setMockIndex(0); startMockInterview(); }}>
                                                Restart Simulator
                                            </button>
                                        </div>

                                        <div className="flex-col gap-md">
                                            <h4 style={{ fontSize: '1rem', fontWeight: 800 }}>Performance Breakdown</h4>
                                            {mockEvals.map((ev, i) => {
                                                const isSkipped = ev.overall_score === 0 && ev.weaknesses?.toLowerCase().includes('skipped');
                                                const borderColor = isSkipped ? 'rgba(148,163,184,0.5)' : ev.overall_score >= 7 ? 'var(--accent-green)' : ev.overall_score >= 4 ? 'var(--accent-orange)' : 'var(--accent-red)';
                                                return (
                                                    <div key={i} className="glass-card fade-in" style={{ padding: '2rem', borderLeft: `8px solid ${borderColor}`, marginBottom: '1.5rem' }}>
                                                        <div className="flex justify-between items-start" style={{ marginBottom: '0.75rem' }}>
                                                            <div className="flex-col gap-xs">
                                                                <div className="flex items-center gap-sm">
                                                                    <span style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-muted)' }}>ROUND {i + 1}: {ev.type?.toUpperCase()}</span>
                                                                    {isSkipped && <span style={{ fontSize: '0.65rem', background: 'rgba(148,163,184,0.15)', color: '#94a3b8', padding: '2px 8px', borderRadius: '999px', border: '1px solid rgba(148,163,184,0.3)', fontWeight: 700 }}>⏩ SKIPPED</span>}
                                                                </div>
                                                                <h5 style={{ fontSize: '1rem', fontWeight: 700 }}>{ev.question.slice(0, 100)}...</h5>
                                                            </div>
                                                            {!isSkipped && <span style={{ fontSize: '1.5rem', fontWeight: 900, color: ev.overall_score >= 7 ? 'var(--accent-green)' : ev.overall_score >= 4 ? 'var(--accent-orange)' : 'var(--accent-red)' }}>{ev.overall_score}/10</span>}
                                                        </div>
                                                        {isSkipped ? (
                                                            <p style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>This question was skipped. For best results, attempt every question — even a partial answer helps the AI evaluate your thinking process.</p>
                                                        ) : (
                                                            <div className="flex-col gap-sm" style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                                                {ev.mentor_feedback && <p>{ev.mentor_feedback}</p>}
                                                                {ev.advice && <p><strong>Coach Advice:</strong> {ev.advice}</p>}
                                                                {ev.optimal_solution && <p><strong>Optimal Approach:</strong> {ev.optimal_solution}</p>}
                                                                {ev.strengths && ev.strengths !== 'N/A' && <p style={{ color: 'var(--accent-green)' }}><strong>✅ Strength:</strong> {ev.strengths}</p>}
                                                                {ev.weaknesses && ev.weaknesses !== 'N/A' && <p style={{ color: 'var(--text-secondary)' }}><strong>⚠️ To Improve:</strong> {ev.weaknesses}</p>}
                                                                {ev.improved_answer && ev.improved_answer !== 'N/A' && <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', borderLeft: '3px solid var(--primary-500)', marginTop: '0.5rem' }}>
                                                                    <strong style={{ fontSize: '0.75rem', color: 'var(--primary-400)' }}>EXPERT SAMPLE ANSWER:</strong>
                                                                    <p style={{ marginTop: '0.3rem' }}>{ev.improved_answer}</p>
                                                                </div>}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
            `}</style>
        </div>
    );
};
