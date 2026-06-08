import { useState, useEffect, useRef, useCallback } from 'react';
import { useEduZyniq } from '../../hooks/useEduZyniq';
import { useResponsive } from '../../hooks/useResponsive';
import API_BASE_URL, { apiFetch } from '../../config';

const API = API_BASE_URL;

const LANG_CONFIG: Record<string, { label: string; ext: string; icon: string; template: string }> = {
    python:     { label: 'Python 3.11',  ext: 'app.py',    icon: '🐍', template: 'print("Hello EduZyniq!")' },
    javascript: { label: 'Node.js 20',   ext: 'index.js',  icon: '🟨', template: 'console.log("Hello EduZyniq!");' },
    java:       { label: 'Java 17',      ext: 'Main.java', icon: '☕', template: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello EduZyniq!");\n    }\n}' },
    cpp:        { label: 'C++ (GCC)',    ext: 'main.cpp',  icon: '⚙️', template: '#include <iostream>\n\nint main() {\n    std::cout << "Hello EduZyniq!" << std::endl;\n    return 0;\n}' },
    go:         { label: 'Go 1.21',      ext: 'main.go',   icon: '🩵', template: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello EduZyniq!")\n}' },
    rust:       { label: 'Rust 1.72',    ext: 'main.rs',   icon: '🦀', template: 'fn main() {\n    println!("Hello EduZyniq!");\n}' },
    php:        { label: 'PHP 8.2',      ext: 'index.php', icon: '🐘', template: '<?php\necho "Hello EduZyniq!";' },
    ruby:       { label: 'Ruby 3.2',     ext: 'app.rb',    icon: '💎', template: 'puts "Hello EduZyniq!"' },
};

type Tab = 'problem' | 'editor' | 'output' | 'analysis' | 'references' | 'tests' | 'enhance';

interface LineResult { line_num: number; code: string; status: 'ok' | 'warn' | 'error' | 'skip'; message: string; }
interface TestCase { input: string; expected: string; actual?: string; passed?: boolean; }
interface Reference { source: 'github' | 'stackoverflow'; title?: string; repo?: string; url: string; content: string; }

export const CodingMentor = ({ onComplete }: any) => {
    const { isMobile, isTablet } = useResponsive();
    const isCompact = isMobile || isTablet;
    // ── Core State ──────────────────────────────
    const [language, setLanguage] = useState('python');
    const [problemTitles, setProblemTitles] = useState<string[]>([]);
    const [problemDesc, setProblemDesc] = useState('');
    const [useDataset, setUseDataset] = useState(true);
    const [code, setCode] = useState(LANG_CONFIG['python'].template);
    const [activeTab, setActiveTab] = useState<Tab>('problem');

    // ── Results State ────────────────────────────
    const [execution, setExecution] = useState<any>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [lineResults, setLineResults] = useState<LineResult[]>([]);
    const [alignment, setAlignment] = useState<{ verdict: string; reason: string } | null>(null);
    const [testCases, setTestCases] = useState<TestCase[]>([]);
    const [references, setReferences] = useState<Reference[]>([]);
    const [enhancedCode, setEnhancedCode] = useState<any>(null);

    // ── Loading State ────────────────────────────
    const [isExecuting, setIsExecuting] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isCheckingLines, setIsCheckingLines] = useState(false);
    const [isGeneratingTests, setIsGeneratingTests] = useState(false);
    const [isFetchingRefs, setIsFetchingRefs] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [isComparing, setIsComparing] = useState(false);
    const [compareResults, setCompareResults] = useState<any[]>([]);
    const codeLocked = !problemDesc.trim();

    const { profile } = useEduZyniq();

    const alignmentTimer = useRef<any>(null);
    const codeRef = useRef(code);
    codeRef.current = code;

    // ── Load problem titles when language changes ──────────────
    useEffect(() => {
        const langCfg = LANG_CONFIG[language];
        setCode(langCfg.template);
        setProblemDesc('');
        setExecution(null);
        setAlignment(null);
        setLineResults([]);
        setTestCases([]);
        setReferences([]);
        setEnhancedCode(null);

        apiFetch(`${API}/codex/problems?language=${language}`)
            .then(r => r.json())
            .then(d => {
                setProblemTitles(d.titles || []);
                setUseDataset((d.titles || []).length > 0);
            })
            .catch(() => setProblemTitles([]));
    }, [language]);

    // ── Debounced per-line analysis on code change ─────────────
    const triggerLineAnalysis = useCallback(() => {
        if (!problemDesc.trim() || !codeRef.current.trim()) return;
        clearTimeout(alignmentTimer.current);
        alignmentTimer.current = setTimeout(async () => {
            setIsCheckingLines(true);
            try {
                const fd = new FormData();
                fd.append('code', codeRef.current);
                fd.append('language', language);
                const r = await apiFetch(`${API}/codex/analyze-lines`, { method: 'POST', body: fd });
                const d = await r.json();
                setLineResults(d.lines || []);

                // Also check alignment after a further 1s delay
                const fd2 = new FormData();
                fd2.append('problem_desc', problemDesc);
                fd2.append('code', codeRef.current.slice(0, 800));
                const r2 = await apiFetch(`${API}/codex/check-alignment`, { method: 'POST', body: fd2 });
                const d2 = await r2.json();
                setAlignment(d2);
            } catch {}
            setIsCheckingLines(false);
        }, 1200);
    }, [language, problemDesc]);

    useEffect(() => {
        if (problemDesc.trim() && code.trim()) triggerLineAnalysis();
    }, [code, problemDesc, triggerLineAnalysis]);


    // ── Actions ─────────────────────────────────────────────────
    const handleExecute = async () => {
        setIsExecuting(true);
        setActiveTab('output');
        const fd = new FormData();
        fd.append('code', code);
        fd.append('language', language);
        try {
            const r = await apiFetch(`${API}/execute-code`, { method: 'POST', body: fd });
            setExecution(await r.json());
        } catch (e) { console.error(e); }
        setIsExecuting(false);
    };

    const handleAnalyze = useCallback(async () => {
        if (!code.trim() || isAnalyzing) return;
        setIsAnalyzing(true);
        setActiveTab('analysis');
        const fd = new FormData();
        fd.append('code', code);
        fd.append('language', language);
        try {
            const r = await apiFetch(`${API}/analyze-code`, { method: 'POST', body: fd });
            const d = await r.json();
            setAnalysis(d);
            if (d.execution) setExecution(d.execution);
            if (onComplete) onComplete();
        } catch (e) { console.error(e); }
        setIsAnalyzing(false);
    }, [code, language, isAnalyzing, onComplete]);

    const handleGenerateTests = useCallback(async () => {
        if (!code.trim() || isGeneratingTests) return;
        setIsGeneratingTests(true);
        setActiveTab('tests');
        const fd = new FormData();
        fd.append('code', code);
        fd.append('problem_desc', problemDesc);
        fd.append('language', language);
        try {
            const r = await apiFetch(`${API}/codex/generate-tests`, { method: 'POST', body: fd });
            const d = await r.json();
            setTestCases(d.test_cases || []);
        } catch (e) { console.error(e); }
        setIsGeneratingTests(false);
    }, [code, problemDesc, language, isGeneratingTests]);

    const handleFetchRefs = useCallback(async () => {
        if (!code.trim() || isFetchingRefs) return;
        setIsFetchingRefs(true);
        setActiveTab('references');
        const fd = new FormData();
        fd.append('code', code.slice(0, 600));
        fd.append('language', language);
        try {
            const r = await apiFetch(`${API}/codex/references`, { method: 'POST', body: fd });
            const d = await r.json();
            setReferences([...(d.github || []), ...(d.stackoverflow || [])]);
        } catch (e) { console.error(e); }
        setIsFetchingRefs(false);
    }, [code, language, isFetchingRefs]);

    const handleEnhance = useCallback(async () => {
        if (!code.trim() || isEnhancing) return;
        setIsEnhancing(true);
        setActiveTab('enhance');
        setCompareResults([]);
        const fd = new FormData();
        fd.append('code', code);
        fd.append('problem_desc', problemDesc);
        fd.append('language', language);
        try {
            const r = await apiFetch(`${API}/codex/enhance`, { method: 'POST', body: fd });
            const d = await r.json();
            setEnhancedCode(d);
        } catch (e) { console.error(e); }
        setIsEnhancing(false);
    }, [code, problemDesc, language, isEnhancing]);

    const handleCompare = async () => {
        if (!enhancedCode?.enhanced_code) return;
        setIsComparing(true);
        const fd = new FormData();
        fd.append('original_code', code);
        fd.append('enhanced_code', enhancedCode.enhanced_code);
        fd.append('language', language);
        if ((profile as any)?.email) fd.append('user_email', (profile as any).email);
        
        try {
            const r = await apiFetch(`${API}/codex/compare`, { method: 'POST', body: fd });
            const d = await r.json();
            setCompareResults(d);
        } catch (e) { console.error(e); }
        setIsComparing(false);
    };

    // ── Auto-trigger logic on tab change ─────────────
    useEffect(() => {
        if (codeLocked || !code.trim() || !problemDesc.trim()) return;

        if (activeTab === 'analysis' && !analysis && !isAnalyzing) {
            handleAnalyze();
        } else if (activeTab === 'references' && references.length === 0 && !isFetchingRefs) {
            handleFetchRefs();
        } else if (activeTab === 'tests' && testCases.length === 0 && !isGeneratingTests) {
            handleGenerateTests();
        } else if (activeTab === 'enhance' && !enhancedCode && !isEnhancing) {
            handleEnhance();
        }
    }, [activeTab, codeLocked, code, problemDesc, analysis, isAnalyzing, references.length, isFetchingRefs, testCases.length, isGeneratingTests, enhancedCode, isEnhancing, handleAnalyze, handleFetchRefs, handleGenerateTests, handleEnhance]);

    // ── Derived values ───────────────────────────────────────────
    const langCfg = LANG_CONFIG[language];
    const okLines = lineResults.filter(l => l.status === 'ok').length;
    const warnLines = lineResults.filter(l => l.status === 'warn').length;
    const errLines = lineResults.filter(l => l.status === 'error').length;

    const TABS: { id: Tab; label: string }[] = [
        { id: 'problem',    label: '1. Problem' },
        { id: 'editor',     label: '2. Editor' },
        { id: 'output',     label: '▶ Sandbox' },
        { id: 'analysis',   label: '🧠 Analysis' },
        { id: 'references', label: '🔗 References' },
        { id: 'tests',      label: '🧪 Tests' },
        { id: 'enhance',    label: '✨ Enhance' },
    ];

    return (
        <div className="flex-col gap-xl fade-in" style={{ minHeight: '90vh' }}>
            {/* ── Header ── */}
            <header className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h2 style={{ fontSize: '1.8rem', fontWeight: 900 }}>CodeX Intelligence</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        {langCfg.icon} {langCfg.label} · Problem-Driven Editor · Docker Sandbox · AI Analysis
                    </p>
                </div>
                <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                    {/* Language Selector */}
                    <select
                        value={language}
                        onChange={e => setLanguage(e.target.value)}
                        style={{ padding: '0.45rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--primary-500)', borderRadius: '8px', color: 'inherit', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                        {Object.entries(LANG_CONFIG).map(([k, v]) => (
                            <option key={k} value={k}>{v.icon} {v.label}</option>
                        ))}
                    </select>
                    <button className="btn btn-secondary" onClick={handleExecute} disabled={isExecuting || codeLocked}>
                        {isExecuting ? '⚡ Running...' : '▶ Run'}
                    </button>
                    <button className="btn btn-primary" onClick={handleAnalyze} disabled={isAnalyzing || codeLocked}>
                        {isAnalyzing ? '🧠 Analyzing...' : 'Mentor Feedback'}
                    </button>
                </div>
            </header>

            {/* ── Tab Bar ── */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-tertiary)', padding: '4px', borderRadius: '10px', overflowX: 'auto' }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                        flex: '1 1 auto', padding: '0.55rem 0.75rem', borderRadius: '7px', fontSize: '0.75rem',
                        fontWeight: 800, border: 'none', whiteSpace: 'nowrap',
                        background: activeTab === t.id ? 'var(--bg-primary)' : 'transparent',
                        color: activeTab === t.id ? 'var(--primary-500)' : 'var(--text-muted)',
                        cursor: 'pointer', transition: 'all 0.2s'
                    }}>{t.label}</button>
                ))}
            </div>

            {/* ── Main content ── */}
            <div style={{ flex: 1 }}>

                {/* ── TAB: Problem Selection ── */}
                {activeTab === 'problem' && (
                    <div className="flex-col gap-md fade-in">
                        <div className="glass-card" style={{ padding: '2rem' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.5rem' }}>
                                Step 1 — Choose Your Problem Statement
                            </h3>

                            {problemTitles.length > 0 && (
                                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                        Source:
                                    </label>
                                    <button
                                        onClick={() => setUseDataset(true)}
                                        style={{
                                            padding: '0.4rem 1rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                                            background: useDataset ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                                            color: useDataset ? '#fff' : 'var(--text-secondary)'
                                        }}
                                    >📂 Dataset ({problemTitles.length})</button>
                                    <button
                                        onClick={() => setUseDataset(false)}
                                        style={{
                                            padding: '0.4rem 1rem', borderRadius: '20px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem',
                                            background: !useDataset ? 'var(--primary-500)' : 'var(--bg-tertiary)',
                                            color: !useDataset ? '#fff' : 'var(--text-secondary)'
                                        }}
                                    >✏️ Custom</button>
                                </div>
                            )}

                            {useDataset && problemTitles.length > 0 ? (
                                <>
                                    <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                                        {langCfg.icon} Search from {problemTitles.length} {LANG_CONFIG[language].label} problems
                                    </div>
                                    <input
                                        list={`problems-list-${language}`}
                                        value={problemDesc}
                                        onChange={e => {
                                            setProblemDesc(e.target.value);
                                            // Enable editor instantly if they picked a valid full title
                                            if (problemTitles.includes(e.target.value)) {
                                                setActiveTab('editor');
                                            }
                                        }}
                                        placeholder="🔍 Type to search datasets..."
                                        style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'inherit', fontSize: '0.9rem' }}
                                    />
                                    <datalist id={`problems-list-${language}`}>
                                        {problemTitles.map(t => <option key={t} value={t} />)}
                                    </datalist>
                                </>
                            ) : (

                                <>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                                        ✏️ Enter your own problem description
                                    </label>
                                    <input
                                        type="text"
                                        value={problemDesc}
                                        onChange={e => setProblemDesc(e.target.value)}
                                        placeholder="e.g., Calculate factorial of a number"
                                        style={{ width: '100%', padding: '0.75rem 1rem', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'inherit', fontSize: '0.9rem' }}
                                    />
                                </>
                            )}

                            {problemDesc && (
                                <div style={{ marginTop: '1.5rem', padding: '1rem 1.5rem', background: 'rgba(var(--primary-rgb), 0.08)', borderRadius: '8px', borderLeft: '4px solid var(--primary-500)' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--primary-400)', marginBottom: '0.25rem' }}>SELECTED PROBLEM</div>
                                    <div style={{ fontWeight: 700 }}>{problemDesc}</div>
                                </div>
                            )}

                            {problemDesc && (
                                <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => setActiveTab('editor')}>
                                    Start Coding →
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TAB: Editor ── */}
                {activeTab === 'editor' && (
                    <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1fr 320px', gap: '1.5rem' }} className="teacher-grid">
                        {/* Code editor */}
                        <div className="flex-col gap-md">
                            {codeLocked && (
                                <div style={{ padding: '0.75rem 1rem', background: 'rgba(255, 200, 0, 0.07)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: '8px', fontSize: '0.85rem', color: '#ffbd2e' }}>
                                    🔒 Select a problem first to unlock the editor
                                </div>
                            )}

                            <div className="glass-card" style={{ padding: 0, background: '#0d1117', border: '1px solid #30363d', flex: 1, minHeight: '580px', overflow: 'hidden' }}>
                                {/* Editor toolbar */}
                                <div style={{ background: '#161b22', padding: '0.65rem 1.25rem', borderBottom: '1px solid #30363d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="flex gap-sm items-center">
                                        <div className="flex gap-xs" style={{ gap: '5px' }}>
                                            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56', display: 'inline-block' }}></span>
                                            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e', display: 'inline-block' }}></span>
                                            <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f', display: 'inline-block' }}></span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#8b949e', marginLeft: '0.5rem', fontWeight: 700 }}>{langCfg.ext}</span>
                                        {problemDesc && <span style={{ fontSize: '0.65rem', color: 'var(--primary-400)', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: '10px', fontWeight: 800 }}>{problemDesc.slice(0, 30)}{problemDesc.length > 30 ? '…' : ''}</span>}
                                    </div>
                                    {execution && (
                                        <div style={{ fontSize: '0.7rem', display: 'flex', gap: '0.75rem' }}>
                                            <span style={{ color: execution.success ? '#27c93f' : '#ff5f56' }}>{execution.success ? '✓ PASSED' : '✗ FAILED'}</span>
                                            <span style={{ color: '#8b949e' }}>⚡ {execution.execution_time}s</span>
                                            <span style={{ color: '#8b949e' }}>◈ {execution.complexity}</span>
                                        </div>
                                    )}
                                </div>
                                <textarea
                                    value={code}
                                    onChange={e => setCode(e.target.value)}
                                    disabled={codeLocked}
                                    style={{
                                        width: '100%', minHeight: '520px', background: 'transparent', color: '#e6edf3',
                                        border: 'none', outline: 'none', padding: '1.25rem', fontSize: '0.9rem',
                                        fontFamily: '"JetBrains Mono", "Fira Mono", monospace', resize: 'none', lineHeight: '1.65',
                                        opacity: codeLocked ? 0.4 : 1
                                    }}
                                    spellCheck={false}
                                />
                            </div>

                            {/* Action row */}
                            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                <button className="btn btn-secondary" onClick={handleExecute} disabled={isExecuting || codeLocked} style={{ flex: 1 }}>
                                    {isExecuting ? '⚡ Running...' : '▶ Run in Docker'}
                                </button>
                                <button className="btn btn-primary" onClick={handleAnalyze} disabled={isAnalyzing || codeLocked} style={{ flex: 1 }}>
                                    {isAnalyzing ? '🧠 Analyzing...' : '🧠 Mentor Feedback'}
                                </button>
                                <button onClick={handleFetchRefs} disabled={isFetchingRefs || codeLocked}
                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                                    {isFetchingRefs ? '🔗 Fetching...' : '🔗 References'}
                                </button>
                                <button onClick={handleGenerateTests} disabled={isGeneratingTests || codeLocked}
                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                                    {isGeneratingTests ? '🧪 Generating...' : '🧪 Gen Tests'}
                                </button>
                                <button onClick={handleEnhance} disabled={isEnhancing || codeLocked}
                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 700, fontSize: '0.8rem' }}>
                                    {isEnhancing ? '✨ Enhancing...' : '✨ Enhance'}
                                </button>
                            </div>
                        </div>

                        {/* Right: Real-time line analysis panel */}
                        <div className="flex-col gap-md">
                            <div className="glass-card" style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Live Code Analysis</h4>
                                    {isCheckingLines && <span style={{ fontSize: '0.65rem', color: 'var(--primary-400)' }}>⟳ Checking...</span>}
                                </div>

                                {/* Alignment Banner */}
                                {alignment && (
                                    <div style={{
                                        marginBottom: '1rem', padding: '0.6rem 0.85rem', borderRadius: '7px', fontSize: '0.8rem',
                                        background: alignment.verdict === 'MATCH' ? 'rgba(39,201,63,0.08)' : 'rgba(255,95,86,0.08)',
                                        borderLeft: `3px solid ${alignment.verdict === 'MATCH' ? '#27c93f' : '#ff5f56'}`
                                    }}>
                                        <strong>{alignment.verdict === 'MATCH' ? '✅ Logic Aligned' : '⚠️ Mismatch'}</strong>
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '3px' }}>{alignment.reason}</p>
                                    </div>
                                )}

                                {/* Summary Counters */}
                                {lineResults.length > 0 && (
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
                                        {[['✅ OK', okLines, '#27c93f'], ['⚠️ Warn', warnLines, '#ffbd2e'], ['❌ Error', errLines, '#ff5f56']].map(([lbl, cnt, clr]) => (
                                            <div key={lbl as string} style={{ textAlign: 'center', background: 'var(--bg-tertiary)', borderRadius: '6px', padding: '0.45rem' }}>
                                                <div style={{ fontSize: '1rem', fontWeight: 900, color: clr as string }}>{cnt as number}</div>
                                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{lbl as string}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Issues */}
                                <div style={{ maxHeight: '300px', overflowY: 'auto' }} className="flex-col gap-xs">
                                    {lineResults.filter(l => l.status !== 'ok' && l.status !== 'skip').map(l => (
                                        <div key={l.line_num} style={{
                                            fontFamily: 'monospace', fontSize: '0.72rem', padding: '4px 8px', borderRadius: '4px',
                                            borderLeft: `3px solid ${l.status === 'error' ? '#ff5f56' : '#ffbd2e'}`,
                                            background: l.status === 'error' ? 'rgba(255,95,86,0.07)' : 'rgba(255,189,46,0.07)',
                                        }}>
                                            <span style={{ color: 'var(--text-muted)' }}>L{l.line_num}: </span>
                                            <code style={{ color: l.status === 'error' ? '#ff5f56' : '#ffbd2e' }}>{l.code.trim().slice(0, 50)}</code>
                                            {l.message && <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>→ {l.message}</div>}
                                        </div>
                                    ))}
                                    {lineResults.length > 0 && lineResults.filter(l => l.status !== 'ok' && l.status !== 'skip').length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '1rem', color: '#27c93f', fontSize: '0.8rem' }}>✅ All lines valid</div>
                                    )}
                                    {lineResults.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Start typing to see live analysis</div>
                                    )}
                                </div>
                            </div>

                            {/* Performance summary card */}
                            {execution && (
                                <div className="glass-card" style={{ padding: '1.25rem' }}>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Last Run</h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.5rem' }}>
                                        {[
                                            ['Status', execution.success ? '✅ Pass' : '❌ Fail'],
                                            ['Runtime', `${execution.execution_time}s`],
                                            ['Memory', `${execution.memory_used}MB`],
                                            ['Sandbox', execution.sandbox_type?.toUpperCase() || 'LOCAL'],
                                        ].map(([k, v]) => (
                                            <div key={k} style={{ background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: '6px' }}>
                                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800 }}>{k}</div>
                                                <div style={{ fontWeight: 900, fontSize: '0.85rem' }}>{v}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TAB: Execution Output ── */}
                {activeTab === 'output' && (
                    <div className="fade-in">
                        {execution ? (
                            <div className="glass-card" style={{ padding: '1.5rem', background: '#0d1117', border: '1px solid #30363d', minHeight: '400px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid #30363d', paddingBottom: '0.75rem' }}>
                                    <h4 style={{ color: '#8b949e', fontWeight: 800, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                                        Terminal — {execution.sandbox_type === 'docker' ? '🐳 Docker' : '🖥 Local'}
                                    </h4>
                                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
                                        <span style={{ color: '#27c93f' }}>⚡ {execution.execution_time}s</span>
                                        <span style={{ color: 'var(--primary-400)' }}>📁 {execution.memory_used}MB</span>
                                        <span style={{ color: '#ffbd2e' }}>◈ {execution.complexity}</span>
                                    </div>
                                </div>
                                {execution.output && (
                                    <pre style={{ color: '#e6edf3', fontSize: '0.9rem', whiteSpace: 'pre-wrap', fontFamily: '"JetBrains Mono", monospace', marginBottom: '1rem' }}>
                                        {execution.output}
                                    </pre>
                                )}
                                {execution.error && (
                                    <pre style={{ color: '#ff6b6b', fontSize: '0.85rem', whiteSpace: 'pre-wrap', fontFamily: '"JetBrains Mono", monospace', borderTop: '1px solid #30363d', paddingTop: '1rem' }}>
                                        {execution.error}
                                    </pre>
                                )}
                                {!execution.output && !execution.error && (
                                    <p style={{ color: '#8b949e' }}>Program finished with no output.</p>
                                )}
                            </div>
                        ) : (
                            <div className="glass-card flex-col items-center justify-center" style={{ minHeight: '400px', opacity: 0.5 }}>
                                <span style={{ fontSize: '3rem' }}>▶</span>
                                <p style={{ fontWeight: 600 }}>Click "Run in Docker" to execute your code</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: Analysis ── */}
                {activeTab === 'analysis' && (
                    <div className="flex-col gap-md fade-in">
                        {analysis ? (
                            <>
                                <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-red)', background: 'rgba(255,0,0,0.02)' }}>
                                    <h4 style={{ fontSize: '0.75rem', color: 'var(--accent-red)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.8rem' }}>Bug Detection</h4>
                                    <ul style={{ fontSize: '0.85rem', listStyle: 'none', padding: 0 }} className="flex-col gap-sm">
                                        {analysis.bugs?.map((b: string, i: number) => <li key={i} style={{ display: 'flex', gap: '8px' }}><span>•</span><span>{b}</span></li>)}
                                        {(!analysis.bugs || analysis.bugs.length === 0) && <li>✅ No logical errors detected</li>}
                                    </ul>
                                </div>
                                <div className="glass-card" style={{ padding: '1.5rem' }}>
                                    <h4 style={{ fontSize: '0.75rem', color: 'var(--primary-400)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.8rem' }}>Architectural Insight</h4>
                                    <p style={{ fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>{analysis.explanation}</p>
                                </div>
                                {analysis.optimized && (
                                    <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid var(--accent-green)', background: 'rgba(0,255,128,0.02)' }}>
                                        <h4 style={{ fontSize: '0.75rem', color: 'var(--accent-green)', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.8rem' }}>Optimized Pattern</h4>
                                        <pre style={{ background: 'rgba(128,128,128,0.15)', padding: '1rem', borderRadius: '6px', fontSize: '0.78rem', overflowX: 'auto', color: 'var(--text-primary)', fontFamily: '"JetBrains Mono", monospace' }}>
                                            <code>{analysis.optimized || analysis.fix}</code>
                                        </pre>
                                    </div>
                                )}
                                {analysis.metrics && (
                                    <div className="glass-card" style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '0.75rem' }}>
                                        {Object.entries(analysis.metrics).map(([k, v]) => (
                                            <div key={k} style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase' }}>{k}</div>
                                                <div style={{ fontWeight: 900, fontSize: '1rem', color: 'var(--primary-500)' }}>{v as string}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="glass-card flex-col items-center justify-center" style={{ minHeight: '400px', opacity: 0.5 }}>
                                <span style={{ fontSize: '3rem' }}>{isAnalyzing ? '🧠' : '🧠'}</span>
                                <p style={{ fontWeight: 600 }}>{isAnalyzing ? 'Decoding logic & searching for bugs...' : 'Click "Mentor Feedback" to get AI analysis'}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: References ── */}
                {activeTab === 'references' && (
                    <div className="flex-col gap-md fade-in">
                        {references.length > 0 ? references.map((ref, i) => (
                            <div key={i} className="glass-card" style={{ padding: '1.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', color: ref.source === 'github' ? 'var(--text-primary)' : '#f48024' }}>
                                        {ref.source === 'github' ? '🐙 GitHub' : '🔗 StackOverflow'}
                                    </span>
                                    <a href={ref.url} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: 'var(--primary-400)' }}>View →</a>
                                </div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>{ref.repo || ref.title}</div>
                                <pre style={{ background: 'rgba(128,128,128,0.15)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.72rem', overflowX: 'auto', color: 'var(--text-primary)', fontFamily: '"JetBrains Mono", monospace', maxHeight: '200px', overflow: 'auto' }}>
                                    {ref.content.slice(0, 800)}
                                </pre>
                            </div>
                        )) : (
                            <div className="glass-card flex-col items-center justify-center" style={{ minHeight: '400px', opacity: 0.5 }}>
                                <span style={{ fontSize: '3rem' }}>{isFetchingRefs ? '⏳' : '🔗'}</span>
                                <p style={{ fontWeight: 600 }}>{isFetchingRefs ? 'Searching GitHub & StackOverflow for similar code...' : 'Click "References" in the editor to fetch real-world examples from GitHub & StackOverflow'}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: Tests ── */}
                {activeTab === 'tests' && (
                    <div className="flex-col gap-md fade-in">
                        {testCases.length > 0 ? testCases.map((tc, i) => (
                            <div key={i} className="glass-card" style={{ padding: '1.25rem', borderLeft: `4px solid ${tc.passed === true ? '#27c93f' : tc.passed === false ? '#ff5f56' : 'var(--primary-500)'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 900 }}>Test {i + 1}</span>
                                    {tc.passed !== undefined && <span style={{ fontSize: '0.75rem', color: tc.passed ? '#27c93f' : '#ff5f56' }}>{tc.passed ? '✅ PASSED' : '❌ FAILED'}</span>}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800 }}>INPUT</div>
                                        <code style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{tc.input}</code>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800 }}>EXPECTED</div>
                                        <code style={{ fontSize: '0.8rem', color: '#27c93f' }}>{tc.expected}</code>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="glass-card flex-col items-center justify-center" style={{ minHeight: '400px', opacity: 0.5 }}>
                                <span style={{ fontSize: '3rem' }}>🧪</span>
                                <p style={{ fontWeight: 600 }}>{isGeneratingTests ? 'Generating edge-case test suite...' : 'Click "Gen Tests" in the editor to generate AI test cases'}</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TAB: Enhance ── */}
                {activeTab === 'enhance' && (
                    <div className="flex-col gap-md fade-in">
                        {enhancedCode && enhancedCode.enhanced_code ? (
                            <>
                                <div className="glass-card" style={{ padding: '1.5rem', borderLeft: '4px solid #a855f7', background: 'rgba(168,85,247,0.03)' }}>
                                    <h4 style={{ fontSize: '0.75rem', color: '#c084fc', fontWeight: 900, textTransform: 'uppercase', marginBottom: '0.8rem' }}>
                                        ✨ Code Refactored using Dataset, GitHub & StackOverflow
                                    </h4>
                                    <p style={{ fontSize: '0.88rem', lineHeight: 1.7, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                                        {enhancedCode.performance_note || "Your code has been optimized for performance and readability."}
                                    </p>
                                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>Complexity Target: <span style={{ color: '#ffbd2e' }}>{enhancedCode.complexity || "Optimal"}</span></p>
                                    
                                    {enhancedCode.key_changes?.length > 0 && (
                                        <div style={{ marginTop: '1rem' }}>
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: '0.5rem' }}>KEY CHANGES MADE:</div>
                                            <ul style={{ fontSize: '0.8rem', color: 'var(--text-primary)', paddingLeft: '1rem', margin: 0 }}>
                                                {enhancedCode.key_changes.map((txt: string, i: number) => (
                                                    <li key={i} style={{ marginBottom: '0.2rem' }}>{txt}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <div className="glass-card" style={{ padding: '0', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '0.5rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 800 }}>AI OPTIMIZED VERSION</span>
                                        <button 
                                            onClick={() => { setCode(enhancedCode.enhanced_code); setActiveTab('editor'); }} 
                                            style={{ padding: '0.4rem 1rem', borderRadius: '6px', background: 'var(--primary-500)', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                            Use This Code
                                        </button>
                                    </div>
                                    <pre style={{ background: '#0d1117', padding: '1.25rem', overflowX: 'auto', margin: 0, color: '#e6edf3', fontSize: '0.85rem', fontFamily: '"JetBrains Mono", monospace', maxHeight: '500px' }}>
                                        <code>{enhancedCode.enhanced_code}</code>
                                    </pre>
                                    <div style={{ background: 'var(--bg-tertiary)', padding: '1rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'center' }}>
                                        <button 
                                            onClick={handleCompare} 
                                            disabled={isComparing}
                                            style={{ padding: '0.5rem 1.5rem', borderRadius: '8px', background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                                        >
                                            {isComparing ? '⏳ Executing both to compare...' : '📊 Compare Performance vs Original Code'}
                                        </button>
                                    </div>
                                </div>
                                {compareResults.length > 0 && (
                                    <div className="glass-card fade-in" style={{ padding: '1.5rem', marginTop: '0.5rem' }}>
                                        <h4 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: '1.5rem', color: 'var(--primary-400)', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>⚡ Code Optimization Results</span>
                                            <span style={{ color: compareResults[1]?.saved_to_supabase ? 'var(--accent-green)' : 'var(--accent-orange)', fontSize: '0.7rem', padding: '2px 8px', background: compareResults[1]?.saved_to_supabase ? 'rgba(39,201,63,0.1)' : 'rgba(245,158,11,0.1)', borderRadius: '12px' }}>
                                                {compareResults[1]?.saved_to_supabase ? '✓ Saved to Supabase' : 'Not saved to Supabase'}
                                            </span>
                                        </h4>
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)', gap: '1.5rem' }}>
                                            {compareResults.map((res: any, i: number) => {
                                                const timeMax = Math.max(...compareResults.map(r => r.time || 0.001));
                                                const memMax = Math.max(...compareResults.map(r => r.memory || 1));
                                                return (
                                                    <div key={i} style={{ background: 'var(--bg-tertiary)', padding: '1.25rem', borderRadius: '10px', border: `1px solid ${i === 1 ? 'var(--primary-500)' : 'var(--border-subtle)'}` }}>
                                                        <div style={{ fontWeight: 800, color: i === 1 ? 'var(--primary-400)' : 'var(--text-primary)', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {res.name} Code
                                                                {i === 1 && (
                                                                    <span style={{ 
                                                                        fontSize: '0.55rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 900,
                                                                        background: res.time < compareResults[0].time ? 'rgba(39,201,63,0.1)' : res.time > compareResults[0].time ? 'rgba(255,95,86,0.1)' : 'rgba(139,148,158,0.1)',
                                                                        color: res.time < compareResults[0].time ? '#27c93f' : res.time > compareResults[0].time ? '#ff5f56' : '#8b949e'
                                                                    }}>
                                                                        {res.time < compareResults[0].time ? '⚡ FASTER' : res.time > compareResults[0].time ? '⚠️ SLOWER' : '− EQUAL'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span style={{ fontSize: '0.65rem', color: res.success ? '#27c93f' : '#ff5f56' }}>{res.success ? '✅ PASSED' : '❌ FAILED'}</span>
                                                        </div>
                                                        <div className="flex-col gap-sm">
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                                <span>Execution Time</span>
                                                                <span style={{ fontWeight: 800, color: i === 1 ? (res.time < compareResults[0].time ? '#27c93f' : res.time > compareResults[0].time ? '#ff5f56' : 'var(--text-primary)') : 'var(--text-primary)' }}>{res.time}s</span>
                                                            </div>
                                                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${Math.max(5, (res.time / timeMax) * 100)}%`, background: i === 1 ? 'var(--primary-500)' : '#8b949e' }} />
                                                            </div>
                                                            
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                                                <span>Memory Used</span>
                                                                <span style={{ fontWeight: 800, color: i === 1 ? (res.memory < compareResults[0].memory ? '#27c93f' : res.memory > compareResults[0].memory ? '#ff5f56' : 'var(--text-primary)') : 'var(--text-primary)' }}>{res.memory}MB</span>
                                                            </div>
                                                            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${Math.max(5, (res.memory / memMax) * 100)}%`, background: i === 1 ? 'var(--primary-500)' : '#8b949e' }} />
                                                            </div>

                                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                                                <span>Complexity</span>
                                                                <span style={{ fontWeight: 800, color: '#ffbd2e' }}>◈ {res.complexity}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="glass-card flex-col items-center justify-center" style={{ minHeight: '400px', opacity: 0.5 }}>
                                {isEnhancing ? (
                                    <>
                                        <span style={{ fontSize: '3rem', animation: 'spin 2s linear infinite' }}>⚙️</span>
                                        <p style={{ fontWeight: 600, marginTop: '1rem' }}>Deep searching GitHub, SO, and Datasets to optimize code...</p>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ fontSize: '3rem' }}>✨</span>
                                        <p style={{ fontWeight: 600 }}>Click "Enhance" to trigger AI-powered optimization using Internet references</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
