import { useState, useEffect } from 'react';
import { CURRICULUM_DATA, type Roadmap } from '../../data/curriculumData';
import { KnowledgeGraph } from '../../components/KnowledgeGraph';
interface Question {
    question: string;
    options: string[];
    answer: string;
    explanation: string;
    topic_tag?: string;
    mode?: string;
    image_url?: string;
    type?: 'mcq' | 'true_false' | 'matching' | 'code_completion' | 'image_based';
    matching_pairs?: Record<string, string>;
}
const QUIZ_MODES = [
    { id: 'standard', label: 'Ultimate Assessment', icon: '⚡', desc: 'Mixed MCQ, T/F, Matching & Visuals' },
    { id: 'teach_ai', label: 'Teach the AI', icon: '🤖', desc: 'Explain concepts in your own words' },
    { id: 'targeted', label: 'Adaptive Recovery', icon: '🩺', desc: 'Focus strictly on your identified weak areas' }
];

export const QuizMaster = ({ onComplete }: any) => {
    const [viewMode, setViewMode] = useState<'custom' | 'curriculum'>('curriculum');
    const [quizMode, setQuizMode] = useState('standard');
    const [config, setConfig] = useState({ subject: 'Full Stack Development', topic: 'React Context API', difficulty: 'Medium' });

    // Curriculum state
    const [selectedRoadmap, setSelectedRoadmap] = useState<Roadmap | null>(null);
    const [selectedPhaseIdx, setSelectedPhaseIdx] = useState(0);
    const [selectedMilestoneIdx, setSelectedMilestoneIdx] = useState(0);

    const [quiz, setQuiz] = useState<Question[] | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [confidenceValues, setConfidenceValues] = useState<Record<number, number>>({});
    const [isFinished, setIsFinished] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<any>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const [explanationText, setExplanationText] = useState('');
    const [teachResult, setTeachResult] = useState<any>(null);

    // Matching state
    const [matchingState, setMatchingState] = useState<{ left: string | null, right: string | null }>({ left: null, right: null });
    const [tempMatches, setTempMatches] = useState<Record<string, string>>({});

    // Auto-detect domain & targeted intents
    useEffect(() => {
        const pendingMode = localStorage.getItem('pending_quiz_mode');
        if (pendingMode) {
            setQuizMode(pendingMode);
            localStorage.removeItem('pending_quiz_mode');
            
            // Add a small delay to simulate auto-clicking "Start Assessment" if you want
            // but setting the mode ensures they see the targeted screen properly.
        }

        const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
        if (!user.email) return;

        fetch(`http://127.0.0.1:8000/student/profile?user_email=${encodeURIComponent(user.email)}`)
            .then(r => r.json())
            .then(data => {
                if (data.profile?.domain) {
                    const matched = CURRICULUM_DATA.find(r => r.title === data.profile.domain);
                    if (matched) {
                        setSelectedRoadmap(matched);
                        setConfig(prev => ({ ...prev, subject: matched.title }));
                    }
                }
            })
            .catch(err => console.error("Error loading profile context:", err));
    }, []);

    const startQuiz = async () => {
        if (quizMode === 'teach_ai') {
            setQuiz([] as any); // Sentinel for teach mode
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            let subject = config.subject;
            let topic = config.topic;
            let subtopic = "";
            let domain = "";

            if (viewMode === 'curriculum' && selectedRoadmap) {
                const phase = selectedRoadmap.phases[selectedPhaseIdx];
                const milestone = phase?.milestones[selectedMilestoneIdx];
                domain = selectedRoadmap.title;
                subject = selectedRoadmap.title;
                topic = phase?.name || "";
                subtopic = milestone?.title || "";
            }

            let data;
            const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');

            if (quizMode === 'targeted') {
                // Fetch weak areas first if needed, or assume they are passed/calculated
                const weakRes = await fetch(`http://127.0.0.1:8000/student/weak-areas?user_email=${encodeURIComponent(user.email)}`);
                const weakData = await weakRes.json();
                
                const res = await fetch(`http://127.0.0.1:8000/student/targeted-quiz`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_email: user.email,
                        subject: subject,
                        domain: domain || subject,
                        weak_areas: weakData.weak_areas,
                        difficulty: config.difficulty
                    })
                });
                data = await res.json();
            } else {
                const queryParams = new URLSearchParams({
                    subject,
                    topic,
                    difficulty: config.difficulty,
                    mode: quizMode,
                    ...(domain && { domain }),
                    ...(subtopic && { subtopic })
                });

                const res = await fetch(`http://127.0.0.1:8000/generate-quiz?${queryParams.toString()}`);
                data = await res.json();
            }

            if (Array.isArray(data) && data.length > 0) {
                setQuiz(data);
                setCurrentIndex(0);
                setAnswers({});
                setConfidenceValues({});
                setTempMatches({});
                setIsFinished(false);
            } else {
                throw new Error("AI failed to generate unique questions for this mode. Try another.");
            }
        } catch (e: any) {
            setError(e.message || "Failed to generate quiz.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnswer = (option: string) => {
        setAnswers(prev => ({ ...prev, [currentIndex]: option }));
    };

    const handleTeachSubmit = async () => {
        setIsAnalyzing(true);
        try {
            const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
            const res = await fetch('http://127.0.0.1:8000/evaluate-explanation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: user.email,
                topic: viewMode === 'curriculum' ? selectedRoadmap?.phases[selectedPhaseIdx]?.milestones[selectedMilestoneIdx]?.title || 'Curriculum Topic' : config.topic,
                explanation: explanationText,
                subject: viewMode === 'curriculum' ? selectedRoadmap?.title || 'General' : config.subject
                })
            });
            const data = await res.json();
            setTeachResult(data);
            setIsFinished(true);
        } catch (e) {
            console.error(e);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const calculateScore = () => {
        if (!quiz || quiz.length === 0) return 0;
        let correct = 0;
        quiz.forEach((q, i) => {
            if (q.type === 'matching' && q.matching_pairs) {
                const userMatches = JSON.parse(answers[i] || '{}');
                const totalPairs = Object.keys(q.matching_pairs).length;
                let correctPairs = 0;
                Object.entries(q.matching_pairs).forEach(([k, v]) => {
                    if (userMatches[k] === v) correctPairs++;
                });
                if (correctPairs === totalPairs) correct++;
            } else if (answers[i] === q.answer) {
                correct++;
            }
        });
        return Math.round((correct / quiz.length) * 100);
    };

    const nextQuestion = async () => {
        if (quiz && quiz[currentIndex].type === 'matching') {
             // Validate if all matched
             const totalToMatch = Object.keys(quiz[currentIndex].matching_pairs || {}).length;
             if (Object.keys(tempMatches).length < totalToMatch) {
                 alert("Please finish all matches before submtitting!");
                 return;
             }
             setAnswers(prev => ({ ...prev, [currentIndex]: JSON.stringify(tempMatches) }));
        }

        if (quiz && currentIndex < quiz.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setMatchingState({ left: null, right: null });
            setTempMatches({});
        } else {
            setIsFinished(true);
            setIsAnalyzing(true);
            const score = calculateScore();
            const avgConfidence = Object.values(confidenceValues).length > 0 
                ? Object.values(confidenceValues).reduce((a, b) => a + b, 0) / Object.values(confidenceValues).length
                : 0;

            const results = quiz?.map((q, i) => {
                let is_correct = false;
                if (q.type === 'matching' && q.matching_pairs) {
                    const userMatches = JSON.parse(answers[i] || '{}');
                    const totalPairs = Object.keys(q.matching_pairs).length;
                    let correctPairs = 0;
                    Object.entries(q.matching_pairs).forEach(([k, v]) => {
                        if (userMatches[k] === v) correctPairs++;
                    });
                    is_correct = correctPairs === totalPairs;
                } else {
                    is_correct = answers[i] === q.answer;
                }

                return {
                    question: q.question,
                    topic_tag: q.topic_tag || 'Core Concept',
                    is_correct: is_correct,
                    explanation: q.explanation,
                    user_answer: answers[i],
                    correct_answer: q.answer
                };
            });

            const user = JSON.parse(localStorage.getItem('edunovas_user') || '{}');
            try {
                if (user.email) {
                    await fetch('http://127.0.0.1:8000/submit-quiz', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            user_email: user.email,
                            topic: viewMode === 'curriculum' ? `${selectedRoadmap?.title || 'Course'} - ${selectedRoadmap?.phases[selectedPhaseIdx]?.name || 'Topic'}` : config.topic,
                            score: score,
                            weak_areas: results?.filter(r => !r.is_correct).map(r => r.topic_tag) || [],
                            subject: viewMode === 'curriculum' ? selectedRoadmap?.title || 'General' : config.subject,
                            domain: selectedRoadmap?.title || "General",
                            quiz_mode: quizMode,
                            average_confidence: avgConfidence
                        })
                    });
                }

                const fbRes = await fetch('http://127.0.0.1:8000/quiz-feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        results: results,
                        subject: viewMode === 'curriculum' ? selectedRoadmap?.title || 'General' : config.subject,
                        topic: viewMode === 'curriculum' ? selectedRoadmap?.phases[selectedPhaseIdx]?.name || 'Topic' : config.topic
                    })
                });
                const fbData = await fbRes.json();
                if (fbRes.ok) {
                    setFeedback(fbData);
                } else {
                    setFeedback({ error: true, gaps: ["AI Analysis currently unavailable. Please review the detailed question breakdown below."], plan: ["Review the foundational concepts for each incorrect answer."] });
                }
            } catch (e) {
                console.error("Feedback error:", e);
                setFeedback({ error: true, gaps: ["Connection error with AI Mentor."], plan: ["Check your internet connection and try again."] });
            } finally {
                setIsAnalyzing(false);
            }
            if (onComplete) onComplete();
        }
    };

    if (quizMode === 'teach_ai' && !isFinished && quiz) {
        return (
            <div className="flex-col gap-xl fade-in" style={{ padding: '2rem' }}>
                <div className="glass-card flex-col gap-lg" style={{ padding: '3rem', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
                    <div style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: '3rem' }}>🤖</span>
                        <h2 style={{ fontSize: '2rem', fontWeight: 900 }}>Teach the AI Mode</h2>
                        <p style={{ color: 'var(--text-secondary)' }}>Explain the concept below. The AI will evaluate your depth of understanding.</p>
                        <div className="mt-md px-md py-sm glass-pill" style={{ display: 'inline-block', background: 'rgba(255,255,255,0.05)' }}>
                             TOPIC: <strong style={{ color: 'var(--primary-400)' }}>{viewMode === 'curriculum' ? selectedRoadmap?.phases[selectedPhaseIdx]?.milestones[selectedMilestoneIdx]?.title || 'Topic' : config.topic}</strong>
                        </div>
                    </div>

                    <textarea
                        className="input-field mt-xl"
                        style={{ minHeight: '300px', fontSize: '1.1rem', lineHeight: 1.6, padding: '2rem', border: '1px solid var(--glass-border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                        placeholder="Start explaining like you are teaching a friend..."
                        value={explanationText}
                        onChange={(e) => setExplanationText(e.target.value)}
                    />

                    <div className="flex justify-end gap-md">
                        <button className="btn btn-secondary" onClick={() => setQuiz(null)}>Cancel</button>
                        <button className="btn btn-primary" onClick={handleTeachSubmit} disabled={explanationText.length < 50 || isAnalyzing}>
                            {isAnalyzing ? 'AI IS THINKING...' : 'AI EVALUATE ME →'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isFinished) {
        if (quizMode === 'teach_ai' && teachResult) {
            return (
                <div className="flex-col items-center justify-center gap-xl fade-in" style={{ padding: '2rem' }}>
                    <div className="glass-card flex-col gap-lg" style={{ padding: '3rem', maxWidth: '800px', width: '100%' }}>
                         <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '4rem' }}>{teachResult.accuracy_score >= 8 ? '🌟' : '📚'}</div>
                            <h2 style={{ fontSize: '2.5rem', fontWeight: 900 }}>{teachResult.overall_rating}</h2>
                            <p style={{ color: 'var(--text-secondary)' }}>Teacher Evaluation Report</p>
                         </div>

                          <div className="grid-2 gap-md mt-xl">
                             {teachResult.visual_aid && (
                                <div className="glass-card" style={{ padding: '0.5rem', gridColumn: 'span 2' }}>
                                    <img src={teachResult.visual_aid} alt="Reference" style={{ width: '100%', height: '250px', objectFit: 'cover', borderRadius: '12px' }} />
                                    <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px' }}>AI REFERENCE VISUAL</p>
                                </div>
                             )}
                             <div className="glass-card flex-col items-center justify-center" style={{ padding: '2rem', background: 'rgba(52, 160, 90, 0.05)' }}>
                                 <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary-400)' }}>{teachResult.accuracy_score}/10</span>
                                 <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>ACCURACY</span>
                             </div>
                             <div className="glass-card flex-col items-center justify-center" style={{ padding: '2rem', background: 'rgba(52, 152, 219, 0.05)' }}>
                                 <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent-blue)' }}>{teachResult.clarity_score}/10</span>
                                 <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>CLARITY</span>
                             </div>
                         </div>

                         <div className="mt-lg">
                             <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary-400)', marginBottom: '0.5rem' }}>MENTOR FEEDBACK</h4>
                             <p style={{ fontSize: '0.95rem', lineHeight: 1.6 }}>{teachResult.mentor_feedback}</p>
                         </div>

                         <div className="mt-lg">
                             <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--accent-red)', marginBottom: '0.5rem' }}>CONCEPTS YOU MISSED</h4>
                             <div className="flex flex-wrap gap-xs">
                                 {teachResult.missing_concepts?.map((c: any, i: number) => (
                                     <span key={i} className="glass-pill" style={{ fontSize: '0.75rem', padding: '0.3rem 0.8rem', border: '1px solid rgba(231, 76, 60, 0.2)', color: 'var(--accent-red)' }}>
                                         {typeof c === 'string' ? c : (c.concept || c.title || JSON.stringify(c))}
                                     </span>
                                 ))}
                             </div>
                         </div>

                         <div className="flex gap-md mt-xl justify-center">
                            <button className="btn btn-primary" onClick={() => { setIsFinished(false); setQuiz(null); setExplanationText(''); }}>Continue Path</button>
                         </div>
                    </div>
                </div>
            );
        }

        const score = calculateScore();
        return (
            <div className="flex-col items-center justify-center gap-xl fade-in" style={{ padding: '2rem' }}>
                <div className="glass-card flex-col items-center gap-lg" style={{ padding: '3rem', maxWidth: '800px', width: '100%', textAlign: 'center' }}>
                    <div style={{ fontSize: '4rem' }}>{score >= 70 ? '🎉' : score >= 40 ? '⚖️' : '🧗'}</div>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: 900 }}>{score}% Accuracy</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>Ultimate Adaptive Assessment: <strong>{viewMode.toUpperCase()}</strong> completed.</p>

                    {/* AI Insights Section */}
                    {(isAnalyzing || feedback) && (
                        <div className="flex-col gap-xl w-full">
                            <div className="glass-card" style={{ padding: '2.5rem', background: 'rgba(52, 160, 90, 0.02)', border: '1px solid var(--primary-500)', boxShadow: '0 0 30px rgba(52, 160, 90, 0.1)' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--primary-400)', marginBottom: '1.5rem', textAlign: 'center', letterSpacing: '2px' }}>📊 CONCEPTUAL MASTERY & VISUAL ANALYTICS</h4>
                                {isAnalyzing ? (
                                    <div className="flex justify-center items-center py-xl">
                                        <div style={{ width: '30px', height: '30px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                    </div>
                                ) : feedback && (
                                    <div className="flex justify-center" style={{ margin: '1rem 0' }}>
                                        <KnowledgeGraph 
                                            data={feedback.knowledge_graph || [
                                                { id: '1', label: 'Theory', level: score/100, status: score >= 80 ? 'done' : 'learning' },
                                                { id: '2', label: 'Logic', level: 0.6, status: 'learning' },
                                                { id: '3', label: 'Systems', level: 0.5, status: 'learning' },
                                                { id: '4', label: 'Implementation', level: 0.4, status: 'struggling' }
                                            ]} 
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid-2 gap-md w-full" style={{ textAlign: 'left' }}>
                                <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '6px solid var(--accent-red)', background: 'rgba(231, 76, 60, 0.02)' }}>
                                    <h4 style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--accent-red)', marginBottom: '1rem', textTransform: 'uppercase' }}>📉 Weak Areas & Skill Gaps</h4>
                                    {isAnalyzing ? (
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>AI is scanning your errors...</p>
                                    ) : (
                                        <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                            {feedback?.gaps?.map((g: any, i: number) => (
                                                <li key={i} className="flex items-start gap-xs"> 
                                                    <span style={{ color: 'var(--accent-red)', marginTop: '2px' }}>⚠</span> 
                                                    <span>{typeof g === 'string' ? g : (g.explanation || g.question || JSON.stringify(g))}</span>
                                                </li>
                                            )) || <li>No major gaps identified</li>}
                                        </ul>
                                    )}
                                </div>
                                <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '6px solid var(--accent-green)', background: 'rgba(46, 204, 113, 0.02)' }}>
                                    <h4 style={{ fontSize: '0.8rem', fontWeight: 900, color: 'var(--accent-green)', marginBottom: '1rem', textTransform: 'uppercase' }}>🚀 Hyper-Learning Path</h4>
                                    {isAnalyzing ? (
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Generating personalized improvement plan...</p>
                                    ) : (
                                        <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                            {feedback?.plan?.map((p: any, i: number) => (
                                                <li key={i} className="flex items-start gap-xs"> 
                                                    <span style={{ color: 'var(--accent-green)', marginTop: '2px' }}>★</span> 
                                                    <span>{typeof p === 'string' ? p : (p.step || p.action || JSON.stringify(p))}</span>
                                                </li>
                                            )) || <li>Continue your learning path</li>}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Question Review Section (Always Visible) */}
                    <div className="flex-col gap-md w-full fade-in" style={{ textAlign: 'left', marginTop: '1.5rem' }}>
                        <h4 style={{ fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>📝 Question Review</h4>
                        {quiz?.map((q, i) => {
                            let itemCorrect = false;
                            if (q.type === 'matching' && q.matching_pairs) {
                                const userMatches = JSON.parse(answers[i] || '{}');
                                const totalPairs = Object.keys(q.matching_pairs).length;
                                let correctPairs = 0;
                                Object.entries(q.matching_pairs).forEach(([k, v]) => {
                                    if (userMatches[k] === v) correctPairs++;
                                });
                                itemCorrect = correctPairs === totalPairs;
                            } else {
                                itemCorrect = answers[i] === q.answer;
                            }

                            return (
                                <div key={i} className="glass-card" style={{ padding: '1.25rem', borderLeft: `4px solid ${itemCorrect ? 'var(--primary-500)' : 'var(--accent-red)'}`, background: 'rgba(255,255,255,0.02)' }}>
                                    <div className="flex justify-between items-start gap-md">
                                        <div className="flex-col gap-xs flex-1">
                                            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Q{i+1}: {q.question}</span>
                                            {!itemCorrect && (
                                                <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)' }}>
                                                    Your Answer: {q.type === 'matching' ? 'Incorrect Arrangement' : answers[i]}
                                                </span>
                                            )}
                                            <span style={{ fontSize: '0.75rem', color: 'var(--primary-500)' }}>
                                                Correct Answer: {q.type === 'matching' ? 'Correct Arrangement' : q.answer}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '1.2rem' }}>{itemCorrect ? '✅' : '❌'}</span>
                                    </div>
                                    <p style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px solid var(--glass-border)', paddingTop: '0.5rem' }}>
                                        <strong>Mentor Note:</strong> {q.explanation}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex gap-md mt-xl">
                        <button className="btn btn-primary" onClick={() => { setIsFinished(false); setFeedback(null); setCurrentIndex(0); setAnswers({}); }}>Retake Quiz</button>
                        <button className="btn btn-secondary" onClick={() => { setQuiz(null); setFeedback(null); setIsFinished(false); setCurrentIndex(0); setAnswers({}); }}>Back to Forge</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-col gap-xl">
            <header className="flex justify-between items-end">
                <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Quiz Master 2.0</h2>
                    <p style={{ color: 'var(--text-secondary)' }}>Multi-dimensional technical assessment engine</p>
                </div>
                <div className="flex glass-card" style={{ padding: '4px', borderRadius: '12px' }}>
                    <button
                        onClick={() => setViewMode('curriculum')}
                        className={`btn ${viewMode === 'curriculum' ? 'btn-primary' : ''}`}
                        style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', borderRadius: '8px', background: viewMode === 'curriculum' ? '' : 'transparent' }}
                    >Curriculum</button>
                    <button
                        onClick={() => setViewMode('custom')}
                        className={`btn ${viewMode === 'custom' ? 'btn-primary' : ''}`}
                        style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', borderRadius: '8px', background: viewMode === 'custom' ? '' : 'transparent' }}
                    >Custom Topic</button>
                </div>
            </header>

            {!quiz ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 450px) 1fr', gap: '2rem' }}>
                    <div className="glass-card flex-col gap-lg" style={{ padding: '2rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>⚙️ Configure Session</h3>

                        {viewMode === 'curriculum' ? (
                            <div className="flex-col gap-md">
                                <div className="flex-col gap-xs">
                                    <label className="label-tiny">ROADMAP</label>
                                    <select
                                        className="input-field"
                                        value={selectedRoadmap?.id || ""}
                                        onChange={(e) => {
                                            const r = CURRICULUM_DATA.find(rd => rd.id === e.target.value);
                                            if (r) { setSelectedRoadmap(r); setSelectedPhaseIdx(0); setSelectedMilestoneIdx(0); }
                                        }}
                                    >
                                        <option value="">Select Roadmap</option>
                                        {CURRICULUM_DATA.map(r => <option key={r.id} value={r.id}>{r.icon} {r.title}</option>)}
                                    </select>
                                </div>
                                {selectedRoadmap && (
                                    <>
                                        <div className="flex-col gap-xs">
                                            <label className="label-tiny">PHASE</label>
                                            <select
                                                className="input-field"
                                                value={selectedPhaseIdx}
                                                onChange={(e) => { setSelectedPhaseIdx(Number(e.target.value)); setSelectedMilestoneIdx(0); }}
                                            >
                                                {selectedRoadmap.phases.map((p, i) => <option key={i} value={i}>{i + 1}. {p.name}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex-col gap-xs">
                                            <label className="label-tiny">MILESTONE</label>
                                            <select
                                                className="input-field"
                                                value={selectedMilestoneIdx}
                                                onChange={(e) => setSelectedMilestoneIdx(Number(e.target.value))}
                                            >
                                                {selectedRoadmap.phases[selectedPhaseIdx].milestones.map((m, i) => <option key={i} value={i}>{m.title}</option>)}
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex-col gap-md">
                                <input className="input-field" value={config.subject} onChange={(e) => setConfig({ ...config, subject: e.target.value })} placeholder="Subject (e.g. Backend Architecture)" />
                                <input className="input-field" value={config.topic} onChange={(e) => setConfig({ ...config, topic: e.target.value })} placeholder="Target Topic" />
                            </div>
                        )}

                        <div className="flex-col gap-xs">
                             <label className="label-tiny">DIFFICULTY</label>
                             <div className="flex gap-sm">
                                {['Easy', 'Medium', 'Hard'].map(lvl => (
                                    <button
                                        key={lvl}
                                        onClick={() => setConfig({ ...config, difficulty: lvl })}
                                        className={`btn flex-1 ${config.difficulty === lvl ? 'btn-primary' : 'btn-secondary'}`}
                                        style={{ fontSize: '0.7rem' }}
                                    > {lvl} </button>
                                ))}
                             </div>
                        </div>

                        <button className="btn btn-primary w-full mt-md" onClick={startQuiz} disabled={isLoading}>
                             {isLoading ? 'GENERATING ASSESSMENT...' : 'INITIALIZE SESSION →'}
                        </button>

                        {error && <div className="glass-card mt-md" style={{ padding: '0.75rem', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: '0.75rem', textAlign: 'center' }}>⚠️ {error}</div>}
                    </div>

                    <div className="flex-col gap-md">
                         <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>⚡ Select Learning Mode</h3>
                         <div className="grid-2 gap-sm">
                             {QUIZ_MODES.map(m => (
                                 <div 
                                    key={m.id}
                                    onClick={() => setQuizMode(m.id)}
                                    className={`glass-card hover-lift p-md flex-col gap-xs cursor-pointer ${quizMode === m.id ? 'active-mode' : ''}`}
                                    style={{ border: quizMode === m.id ? '2px solid var(--primary-500)' : '1px solid var(--glass-border)' }}
                                 >
                                     <div className="flex justify-between items-center">
                                         <span style={{ fontSize: '1.2rem' }}>{m.icon}</span>
                                         {quizMode === m.id && <div style={{ width: '8px', height: '8px', background: 'var(--primary-400)', borderRadius: '50%' }}></div>}
                                     </div>
                                     <span style={{ fontSize: '0.85rem', fontWeight: 800 }}>{m.label}</span>
                                     <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{m.desc}</p>
                                 </div>
                             ))}
                         </div>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '2rem' }}>
                    <div className="flex-col gap-lg">
                        <div className="glass-card flex-col gap-xl" style={{ padding: '2.5rem' }}>
                            <div className="flex justify-between items-center">
                                <span className="label-tiny" style={{ color: 'var(--primary-400)' }}>
                                    {quizMode.toUpperCase()} ● QUESTION {currentIndex + 1} / {quiz.length}
                                </span>
                                <div style={{ height: '6px', width: '150px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${((currentIndex + 1) / quiz.length) * 100}%`, background: 'var(--primary-500)', transition: 'width 0.3s ease' }}></div>
                                </div>
                            </div>

                            <div className="flex-col gap-md">
                                <h3 style={{ fontSize: '1.4rem', lineHeight: 1.4, fontWeight: 700 }}>{quiz[currentIndex].question}</h3>
                                {quiz[currentIndex].image_url && (
                                    <div className="glass-card" style={{ padding: '0.5rem', marginBottom: '1rem' }}>
                                        <img src={quiz[currentIndex].image_url} alt="Problem Visualization" style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', borderRadius: '8px' }} />
                                    </div>
                                )}
                                {quiz[currentIndex].question.includes('```') && (
                                    <div className="code-block-preview" style={{ background: '#0d0d0d', padding: '1rem', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '0.85rem', fontFamily: 'monospace', color: '#e0e0e0' }}>
                                        {/* Simple formatting for preview */}
                                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{quiz[currentIndex].question.split('```')[1]}</pre>
                                    </div>
                                )}
                            </div>

                            <div className="flex-col gap-sm">
                                {quiz[currentIndex].type === 'matching' && quiz[currentIndex].matching_pairs ? (
                                    <div className="grid-2 gap-lg mt-md">
                                        <div className="flex-col gap-sm">
                                            <h4 className="label-tiny">Terms</h4>
                                            {Object.keys(quiz[currentIndex].matching_pairs).map((term, i) => (
                                                <button 
                                                    key={i} 
                                                    className={`option-btn ${matchingState.left === term ? 'selected' : ''} ${tempMatches[term] ? 'matched' : ''}`}
                                                    onClick={() => !tempMatches[term] && setMatchingState(prev => ({ ...prev, left: term }))}
                                                    disabled={!!tempMatches[term]}
                                                    style={{ justifyContent: 'space-between' }}
                                                >
                                                    {term}
                                                    {tempMatches[term] && <span>✅</span>}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="flex-col gap-sm">
                                            <h4 className="label-tiny">Descriptions</h4>
                                            {/* Shuffle values once if needed, but here we just list them */}
                                            {Object.values(quiz[currentIndex].matching_pairs).map((desc, i) => {
                                                const isMatched = Object.values(tempMatches).includes(desc);
                                                return (
                                                    <button 
                                                        key={i} 
                                                        className={`option-btn ${matchingState.right === desc ? 'selected' : ''} ${isMatched ? 'matched' : ''}`}
                                                        onClick={() => !isMatched && setMatchingState(prev => ({ ...prev, right: desc }))}
                                                        disabled={isMatched}
                                                    >
                                                        {desc}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {matchingState.left && matchingState.right && (
                                            <div style={{ gridColumn: 'span 2' }}>
                                                <button 
                                                    className="btn btn-primary w-full" 
                                                    style={{ background: 'var(--accent-blue)' }}
                                                    onClick={() => {
                                                        setTempMatches(prev => ({ ...prev, [matchingState.left!]: matchingState.right! }));
                                                        setMatchingState({ left: null, right: null });
                                                    }}
                                                >
                                                    Link: {matchingState.left} ↔ {matchingState.right.substring(0, 20)}...
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ) : (quiz[currentIndex].options || []).map((opt, i) => (
                                    <button
                                        key={i}
                                        className={`option-btn ${answers[currentIndex] === opt ? 'selected' : ''}`}
                                        onClick={() => handleAnswer(opt)}
                                    >
                                        <span className="option-index">{String.fromCharCode(65 + i)}</span>
                                        {opt}
                                    </button>
                                ))}
                            </div>

                            <div className="flex justify-between items-center pt-xl mt-xl border-t">
                                <div className="flex-col gap-xs" style={{ width: '250px' }}>
                                     <label className="label-tiny">HOW CONFIDENT ARE YOU? ⭐</label>
                                     <input 
                                        type="range" 
                                        min="0" max="100" 
                                        value={confidenceValues[currentIndex] || 50} 
                                        onChange={(e) => setConfidenceValues(prev => ({ ...prev, [currentIndex]: parseInt(e.target.value) }))}
                                        className="confidence-slider"
                                     />
                                     <div className="flex justify-between" style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                         <span>Guessing</span>
                                         <span>Certain</span>
                                     </div>
                                </div>
                                <button className="btn btn-primary" onClick={nextQuestion} disabled={quiz[currentIndex].type !== 'matching' && !answers[currentIndex]} style={{ minWidth: '180px' }}>
                                    {currentIndex === quiz.length - 1 ? 'FINISH ASSESSMENT' : 'NEXT QUESTION →'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex-col gap-md">
                        <div className="glass-card flex-col gap-sm" style={{ padding: '2rem' }}>
                            <div className="flex items-center gap-sm">
                                <span style={{ fontSize: '1.2rem' }}>🎚️</span>
                                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Adaptive Stats</h4>
                            </div>
                            <div className="stat-row">
                                <span>Mastery Progress</span>
                                <div className="stat-bar"><div style={{ width: '35%', background: 'var(--primary-400)' }}></div></div>
                            </div>
                            <div className="stat-row">
                                <span>Avg Confidence</span>
                                <span style={{ color: 'var(--accent-blue)', fontWeight: 800 }}>{Math.round(Object.values(confidenceValues).reduce((a,b)=>a+b,0) / (Object.values(confidenceValues).length || 1))}%</span>
                            </div>
                        </div>

                        <div className="glass-card" style={{ padding: '1.5rem', background: 'rgba(255,165,0,0.03)' }}>
                            <h4 className="label-tiny" style={{ color: 'orange' }}>SENSEI ANALYSIS</h4>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '0.5rem' }}>
                                "The current mode <strong>{quizMode}</strong> is specifically designed to bypass your muscle memory and test your <strong>first-principles thinking</strong>. Don't rush."
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .label-tiny { font-size: 0.65rem; font-weight: 800; letter-spacing: 1px; color: var(--text-muted); text-transform: uppercase; }
                .input-field { width: 100%; padding: 0.85rem; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 8px; color: var(--text-primary); outline: none; }
                .option-btn {
                    padding: 1.25rem 1.5rem; text-align: left; background: var(--bg-secondary); border: 1px solid var(--glass-border); 
                    border-radius: 12px; display: flex; alignItems: center; gap: 1rem; transition: all 0.2s; cursor: pointer; color: var(--text-primary);
                }
                .option-btn:hover { background: rgba(255,255,255,0.06); transform: translateY(-2px); }
                 .option-btn.selected { border-color: var(--primary-500); background: rgba(52, 160, 90, 0.08); }
                 .option-btn.matched { border-color: var(--accent-blue); opacity: 0.6; cursor: not-allowed; }
                 .option-index { font-weight: 900; color: var(--text-muted); min-width: 25px; }
                .active-mode { background: rgba(52, 160, 90, 0.05) !important; border-color: var(--primary-400) !important; }
                .confidence-slider { width: 100%; height: 4px; border-radius: 2px; -webkit-appearance: none; background: rgba(255,255,255,0.1); outline: none; }
                .confidence-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: var(--primary-500); border-radius: 50%; cursor: pointer; }
                .stat-row { display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; margin-top: 0.5rem; }
                .stat-bar { height: 4px; width: 80px; background: rgba(255,255,255,0.05); border-radius: 2px; overflow: hidden; }
                .stat-bar div { height: 100%; }
                .border-t { border-top: 1px solid var(--glass-border); }
                pre { margin: 0; white-space: pre-wrap; }
                .glass-pill { padding: 4px 12px; border-radius: 100px; background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); }
            `}</style>
        </div>
    );
};

