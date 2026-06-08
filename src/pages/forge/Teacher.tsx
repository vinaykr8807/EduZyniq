import { useState, useEffect, useRef, type WheelEvent as ReactWheelEvent } from 'react';
import API_BASE_URL, { apiFetch } from '../../config';
import { CURRICULUM_DATA, type Roadmap } from '../../data/curriculumData';
import { playNotificationSound } from '../../utils/audio';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

const getYouTubeVideoId = (url: string) => {
    const patterns = [
        /youtube\.com\/embed\/([^?&/]+)/,
        /youtube\.com\/watch\?v=([^?&/]+)/,
        /youtu\.be\/([^?&/]+)/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match?.[1]) return match[1];
    }

    return null;
};

const getYouTubeWatchUrl = (url: string) => {
    const videoId = getYouTubeVideoId(url);
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : url;
};

const normalizeLatexText = (text: string) => {
    if (!text) return text;

    return text
        .replace(/\u0008/g, '\\b')
        .replace(/\u000c/g, '\\f')
        .replace(/(^|[^\\])begin\{/g, '$1\\begin{')
        .replace(/(^|[^\\])end\{/g, '$1\\end{')
        .replace(/(^|[^\\])frac\{/g, '$1\\frac{')
        .replace(/(^|[^\\])text\{/g, '$1\\text{')
        .replace(/(^|[^\\])cdot\b/g, '$1\\cdot')
        .replace(/(^|[^\\])times\b/g, '$1\\times')
        .replace(/(^|[^\\])rightarrow\b/g, '$1\\rightarrow')
        .replace(/(^|[^\\])left\b/g, '$1\\left')
        .replace(/(^|[^\\])right\b/g, '$1\\right');
};

const isTrustedReferenceImageUrl = (url: string) => /(?:wikimedia|wikipedia)\.org/i.test(url);

const getResponseErrorMessage = async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        try {
            const data = await response.json();
            if (typeof data?.detail === 'string' && data.detail.trim()) {
                return data.detail;
            }
        } catch {
            // Fall back to plain text below.
        }
    }

    const text = await response.text();
    return text || response.statusText || 'Request failed';
};

const looksLikeD2Line = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return false;

    return (
        /^direction\s*:/i.test(trimmed) ||
        /^vars\s*:/i.test(trimmed) ||
        /^[A-Za-z0-9_"(). -]+\s*(->|<-|<->)\s*[A-Za-z0-9_"(). -]+(?:\s*:\s*".*")?$/.test(trimmed) ||
        /^[A-Za-z0-9_-]+\s*:\s*\{$/.test(trimmed) ||
        /^[{}]$/.test(trimmed) ||
        /^layout-engine\s*:/i.test(trimmed) ||
        /^d2-config\s*:/i.test(trimmed)
    );
};

const cleanD2NodeLabel = (value: string) => value.trim().replace(/^["']|["']$/g, '').trim() || 'Node';

const parseD2FlowGraph = (code: string): FlowGraphPayload => {
    const nodes: FlowGraphNode[] = [];
    const edges: FlowGraphEdge[] = [];
    const nodeIds = new Map<string, string>();
    let direction = 'right';

    const getNodeId = (label: string) => {
        if (!nodeIds.has(label)) {
            const id = `n${nodeIds.size + 1}`;
            nodeIds.set(label, id);
            nodes.push({ id, label });
        }
        return nodeIds.get(label)!;
    };

    for (const rawLine of code.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        if (line === '{' || line === '}') continue;
        if (/^direction\s*:/i.test(line)) {
            direction = line.split(':').slice(1).join(':').trim().toLowerCase() || 'right';
            continue;
        }
        if (/^(vars|d2-config|layout-engine)\s*:/i.test(line)) continue;
        if (!line.includes('->') && !line.includes('<-')) continue;

        const match = line.match(/^(.*?)\s*(<->|->|<-)\s*(.*?)(?:\s*:\s*"([^"]*)")?\s*$/);
        if (!match) continue;

        let sourceLabel = cleanD2NodeLabel(match[1]);
        let targetLabel = cleanD2NodeLabel(match[3]);
        let kind = match[2];
        const label = (match[4] || '').trim();

        if (kind === '<-') {
            [sourceLabel, targetLabel] = [targetLabel, sourceLabel];
            kind = '->';
        }

        const source = getNodeId(sourceLabel);
        const target = getNodeId(targetLabel);

        edges.push({
            id: `e${edges.length + 1}`,
            source,
            target,
            label,
            kind,
            order: edges.length,
        });
    }

    return {
        title: 'AI Teacher Flow Graph',
        direction,
        provider: 'local',
        nodes,
        edges,
    };
};

const YouTubeEmbed = ({ url }: { url: string }) => {
    const videoId = getYouTubeVideoId(url);
    const watchUrl = getYouTubeWatchUrl(url);
    const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {thumbnailUrl && (
                <a
                    href={watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                        position: 'relative',
                        display: 'block',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        lineHeight: 0
                    }}
                >
                    <img
                        src={thumbnailUrl}
                        alt="YouTube video thumbnail"
                        style={{ width: '100%', height: '250px', objectFit: 'cover', display: 'block' }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(180deg, rgba(6, 10, 18, 0.05) 0%, rgba(6, 10, 18, 0.78) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '1rem'
                        }}
                    >
                        <div
                            style={{
                                width: '68px',
                                height: '48px',
                                borderRadius: '14px',
                                background: 'rgba(255, 0, 0, 0.92)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 14px 30px rgba(0, 0, 0, 0.28)'
                            }}
                        >
                            <div
                                style={{
                                    width: 0,
                                    height: 0,
                                    borderTop: '10px solid transparent',
                                    borderBottom: '10px solid transparent',
                                    borderLeft: '16px solid white',
                                    marginLeft: '4px'
                                }}
                            />
                        </div>
                    </div>
                </a>
            )}

            <div
                style={{
                    borderRadius: '8px',
                    border: '1px solid rgba(100,130,255,0.16)',
                    background: 'rgba(100,130,255,0.06)',
                    padding: '0.85rem'
                }}
            >
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                    This YouTube video may not play inside the app if embedding is disabled by the owner.
                </p>
                <a
                    href={watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginTop: '0.65rem',
                        padding: '0.55rem 0.9rem',
                        borderRadius: '999px',
                        background: '#ff0033',
                        color: '#fff',
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        textDecoration: 'none',
                        letterSpacing: '0.02em'
                    }}
                >
                    Watch on YouTube
                </a>
            </div>
        </div>
    );
};

const getUser = () => JSON.parse(localStorage.getItem('eduzyniq_user') || '{}');

const saveProgress = async (payload: object) => {
    try {
        const user = getUser();
        if (!user?.email) return;
        await apiFetch(`${API_BASE_URL}/save-teacher-progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_email: user.email, ...payload })
        });
    } catch { /* silent fail — progress saved locally via status state */ }
};

interface FlowGraphNode {
    id: string;
    label: string;
}

interface FlowGraphEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    kind?: string;
    order?: number;
}

interface FlowGraphPayload {
    graph_id?: string;
    title?: string;
    direction?: string;
    provider?: string;
    nodes: FlowGraphNode[];
    edges: FlowGraphEdge[];
}

const wrapFlowNodeLabel = (label: string, maxCharsPerLine: number = 15) => {
    const words = label
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((word) => {
            if (word.length <= maxCharsPerLine) return [word];

            const chunks: string[] = [];
            for (let index = 0; index < word.length; index += maxCharsPerLine) {
                chunks.push(word.slice(index, index + maxCharsPerLine));
            }
            return chunks;
        });
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxCharsPerLine || !current) {
            current = next;
        } else {
            lines.push(current);
            current = word;
        }
    }

    if (current) lines.push(current);
    return lines.slice(0, 3);
};

const getFlowEdgeLabelMetrics = (label: string) => {
    const normalized = label.trim();
    const display = normalized.length > 22 ? `${normalized.slice(0, 21)}…` : normalized;
    const width = Math.max(112, Math.min(196, display.length * 7.1 + 28));

    return { display, width };
};

const getFlowNodeRole = (nodeId: string, graph: FlowGraphPayload) => {
    let incomingCount = 0;
    let outgoingCount = 0;

    graph.edges.forEach((edge) => {
        if (edge.target === nodeId) incomingCount += 1;
        if (edge.source === nodeId) outgoingCount += 1;
    });

    if (incomingCount === 0 && outgoingCount > 0) return 'Start';
    if (outgoingCount === 0 && incomingCount > 0) return 'Outcome';
    if (outgoingCount > 1) return 'Decision';
    if (incomingCount > 1) return 'Merge';
    return 'Step';
};

const getFlowGraphLayout = (graph: FlowGraphPayload) => {
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, string[]>();
    const levels = new Map<string, number>();

    graph.nodes.forEach((node) => {
        incoming.set(node.id, 0);
        outgoing.set(node.id, []);
    });

    graph.edges.forEach((edge) => {
        incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1);
        outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge.target]);
    });

    const queue = graph.nodes
        .filter((node) => (incoming.get(node.id) || 0) === 0)
        .map((node) => node.id);

    queue.forEach((id) => levels.set(id, 0));

    while (queue.length > 0) {
        const current = queue.shift()!;
        const currentLevel = levels.get(current) || 0;
        for (const target of outgoing.get(current) || []) {
            incoming.set(target, Math.max(0, (incoming.get(target) || 0) - 1));
            levels.set(target, Math.max(levels.get(target) || 0, currentLevel + 1));
            if ((incoming.get(target) || 0) === 0) {
                queue.push(target);
            }
        }
    }

    graph.nodes.forEach((node, index) => {
        if (!levels.has(node.id)) {
            levels.set(node.id, index);
        }
    });

    const columns = new Map<number, FlowGraphNode[]>();
    graph.nodes.forEach((node) => {
        const level = levels.get(node.id) || 0;
        columns.set(level, [...(columns.get(level) || []), node]);
    });

    const orderedLevels = [...columns.keys()].sort((a, b) => a - b);
    const nodeWidth = 240;
    const nodeHeight = 102;
    const columnGap = 148;
    const rowGap = 56;
    const paddingX = 60;
    const paddingY = 54;
    const positions = new Map<string, { x: number; y: number }>();

    orderedLevels.forEach((level) => {
        const columnNodes = columns.get(level) || [];
        const startY = paddingY;

        columnNodes.forEach((node, index) => {
            positions.set(node.id, {
                x: paddingX + level * (nodeWidth + columnGap),
                y: startY + index * (nodeHeight + rowGap),
            });
        });
    });

    const maxLevel = orderedLevels.length > 0 ? Math.max(...orderedLevels) : 0;
    const maxColumnNodes = Math.max(...[...columns.values()].map((items) => items.length), 1);

    return {
        positions,
        nodeWidth,
        nodeHeight,
        width: paddingX * 2 + (maxLevel + 1) * nodeWidth + maxLevel * columnGap,
        height: Math.max(320, paddingY * 2 + maxColumnNodes * nodeHeight + Math.max(0, maxColumnNodes - 1) * rowGap),
    };
};

const FlowGraphCanvas = ({ graph }: { graph: FlowGraphPayload }) => {
    const layout = getFlowGraphLayout(graph);
    const arrowId = `flow-arrow-${graph.graph_id || 'graph'}`;
    const fillId = `flow-node-fill-${graph.graph_id || 'graph'}`;
    const eyebrowLabel = graph.provider === 'neo4j' ? 'Neo4j Flow Graph' : 'Structured Flow Graph';
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        scrollRef.current?.scrollTo({ left: 0, behavior: 'auto' });
    }, [graph.graph_id, graph.title, graph.nodes.length, graph.edges.length]);

    const handleHorizontalScroll = (event: ReactWheelEvent<HTMLDivElement>) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
            return;
        }

        event.preventDefault();
        event.currentTarget.scrollLeft += event.deltaY;
    };

    return (
        <div className="flow-graph-shell">
            <div className="flow-graph-header">
                <div>
                    <p className="flow-graph-eyebrow">{eyebrowLabel}</p>
                    <h5 className="flow-graph-title">{graph.title || 'AI Teacher Flow Graph'}</h5>
                </div>
                <span className="flow-graph-badge">{graph.provider || 'neo4j'}</span>
            </div>
            <p className="flow-graph-hint">Scroll left and right to explore the full graph.</p>
            <div ref={scrollRef} className="flow-graph-scroll" onWheel={handleHorizontalScroll}>
                <svg
                    viewBox={`0 0 ${layout.width} ${layout.height}`}
                    width={layout.width}
                    height={layout.height}
                    className="flow-graph-svg"
                    preserveAspectRatio="xMinYMin meet"
                    role="img"
                    aria-label={graph.title || 'AI Teacher Flow Graph'}
                >
                    <defs>
                        <linearGradient id={fillId} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#eff6ff" />
                            <stop offset="100%" stopColor="#dbeafe" />
                        </linearGradient>
                        <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
                        </marker>
                    </defs>

                    {graph.edges.map((edge) => {
                        const source = layout.positions.get(edge.source);
                        const target = layout.positions.get(edge.target);
                        if (!source || !target) return null;

                        const startX = source.x + layout.nodeWidth;
                        const startY = source.y + layout.nodeHeight / 2;
                        const endX = target.x;
                        const endY = target.y + layout.nodeHeight / 2;
                        const curve = Math.max(56, (endX - startX) / 2);
                        const path = `M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`;
                        const labelX = (startX + endX) / 2;
                        const labelY = (startY + endY) / 2 - 14;
                        const { display, width } = getFlowEdgeLabelMetrics(edge.label || '');

                        return (
                            <g key={edge.id}>
                                <path d={path} className="flow-edge" markerEnd={`url(#${arrowId})`} />
                                {edge.label && (
                                    <g transform={`translate(${labelX}, ${labelY})`}>
                                        <rect x={-width / 2} y={-14} width={width} height={28} rx={14} className="flow-edge-label-bg" />
                                        <text textAnchor="middle" dominantBaseline="central" className="flow-edge-label">
                                            {display}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}

                    {graph.nodes.map((node) => {
                        const position = layout.positions.get(node.id);
                        if (!position) return null;
                        const labelLines = wrapFlowNodeLabel(node.label);
                        const nodeRole = getFlowNodeRole(node.id, graph);
                        const firstLineY = labelLines.length > 1 ? 56 : 62;

                        return (
                            <g key={node.id} transform={`translate(${position.x}, ${position.y})`}>
                                <rect width={layout.nodeWidth} height={layout.nodeHeight} rx={24} className="flow-node-card" fill={`url(#${fillId})`} />
                                <circle cx="30" cy="34" r="10" className="flow-node-dot" />
                                <text x="52" y="29" className="flow-node-caption">{nodeRole}</text>
                                <text x="28" y={firstLineY} className="flow-node-label">
                                    {labelLines.map((line, index) => (
                                        <tspan key={`${node.id}-${index}`} x="28" dy={index === 0 ? 0 : 18}>
                                            {line}
                                        </tspan>
                                    ))}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
        </div>
    );
};

const DiagramBlock = ({ engine, code }: { engine: string, code: string }) => {
    const [svg, setSvg] = useState('');
    const [graph, setGraph] = useState<FlowGraphPayload | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!code) return;

        const controller = new AbortController();
        let isActive = true;

        const renderDiagram = async () => {
            setLoading(true);
            setError(null);
            setSvg('');
            setGraph(null);
            try {
                if (engine === 'd2') {
                    const graphResponse = await apiFetch(`${API_BASE_URL}/teacher/render-flow-graph`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, title: 'AI Teacher Flow Graph' }),
                        signal: controller.signal,
                    });

                    if (!graphResponse.ok) {
                        const graphErrorText = await getResponseErrorMessage(graphResponse);
                        throw new Error(graphErrorText || graphResponse.statusText);
                    }

                    const graphData = await graphResponse.json();
                    if (isActive) {
                        setGraph(graphData);
                    }
                    return;
                }

                const response = await apiFetch(`${API_BASE_URL}/teacher/render-diagram`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ engine, code }),
                    signal: controller.signal,
                });

                if (!response.ok) {
                    const errorText = await getResponseErrorMessage(response);
                    throw new Error(errorText || response.statusText);
                }

                const svgText = await response.text();
                if (isActive) {
                    setSvg(svgText);
                }
            } catch (e: any) {
                if (e?.name === 'AbortError') {
                    return;
                }
                console.error("Diagram render error", e);
                if (isActive) {
                    if (engine === 'd2') {
                        const fallbackGraph = parseD2FlowGraph(code);
                        if (fallbackGraph.nodes.length > 0) {
                            setGraph({
                                ...fallbackGraph,
                                title: 'AI Teacher Flow Graph',
                                provider: 'local-fallback',
                            });
                        } else {
                            setError(e?.message || 'Failed to render diagram');
                        }
                    } else {
                        setError(e?.message || 'Failed to render diagram');
                    }
                }
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        };

        renderDiagram();

        return () => {
            isActive = false;
            controller.abort();
        };
    }, [code, engine]);

    if (error) {
        return (
            <div className="diagram-error-card">
                <p className="error-title">⚠️ Architecture Compilation Error</p>
                <code className="error-details">{error}</code>
                <div className="error-raw-code">
                    <p style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>RAW SOURCE (FIXED):</p>
                    <pre style={{ margin: 0, padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', overflow: 'auto' }}>{code}</pre>
                </div>
            </div>
        );
    }

    return (
        <div className="diagram-canvas">
            {loading && (
                <div className="diagram-loading-overlay">
                    <div className="spinner" />
                    <span>Architecting {engine.toUpperCase()}...</span>
                </div>
            )}
            {graph ? (
                <FlowGraphCanvas graph={graph} />
            ) : svg ? (
                <div 
                    dangerouslySetInnerHTML={{ __html: svg }} 
                    className="diagram-svg-container"
                />
            ) : !loading && (
                <span className="waiting-text">Waiting for blueprints...</span>
            )}
        </div>
    );
};

interface TopicStatus {
    [key: string]: 'pending' | 'learning' | 'done';
}

interface Explanation {
    explanation: string;
    topic: string;
    subtopic: string;
    image_url?: string;
    video_url?: string;
}

export const Teacher = () => {
    // Step 1: pick domain
    const [selectedRoadmap, setSelectedRoadmap] = useState<Roadmap | null>(null);
    const [profileDomain, setProfileDomain] = useState<string | null>(null);
    // Step 2: pick phase
    const [phaseIdx, setPhaseIdx] = useState(0);
    // Step 3: active milestone
    const [milestoneIdx, setMilestoneIdx] = useState(0);

    const [status, setStatus] = useState<TopicStatus>({});
    const [explanation, setExplanation] = useState<Explanation | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showDoubt, setShowDoubt] = useState(false);
    const [doubtText, setDoubtText] = useState('');
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
    const [isDownloading, setIsDownloading] = useState(false);
    const [doubtLoading, setDoubtLoading] = useState(false);
    const [savedNotes, setSavedNotes] = useState<{ name: string; display_name: string; signed_url: string; created_at: string }[]>([]);
    const [notesLoading, setNotesLoading] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const [attachedFile, setAttachedFile] = useState<File | null>(null);
    const [isListening, setIsListening] = useState(false);

    const loadSavedNotes = async () => {
        const user = getUser();
        if (!user?.email) return;
        setNotesLoading(true);
        try {
            const res = await apiFetch(`${API_BASE_URL}/student/notes?user_email=${encodeURIComponent(user.email)}`);
            const data = await res.json();
            setSavedNotes(data.notes || []);
        } catch { setSavedNotes([]); }
        finally { setNotesLoading(false); }
    };

    useEffect(() => {
        loadSavedNotes();
    }, []);

    useEffect(() => {
        const user = getUser();
        if (!user.email) return;

        const initFromProfile = async () => {
            try {
                const res = await apiFetch(`${API_BASE_URL}/student/profile?user_email=${encodeURIComponent(user.email)}`);
                const data = await res.json();
                
                if (data.profile?.domain) {
                    setProfileDomain(data.profile.domain);
                }
            } catch (err) {
                console.error("Error loading profile:", err);
            }
        };

        initFromProfile();
    }, []);

    const phase = selectedRoadmap?.phases[phaseIdx];
    const milestone = phase?.milestones[milestoneIdx];
    const totalMilestones = selectedRoadmap?.phases.reduce((acc, p) => acc + p.milestones.length, 0) || 0;
    const doneCount = Object.values(status).filter(s => s === 'done').length;
    const overallProgress = totalMilestones > 0 ? Math.round((doneCount / totalMilestones) * 100) : 0;
    const showReferenceImage = explanation?.image_url ? isTrustedReferenceImageUrl(explanation.image_url) : false;
    const hasLessonMedia = showReferenceImage || Boolean(explanation?.video_url);

    const milestoneKey = milestone ? `${phaseIdx}-${milestoneIdx}` : '';

    const [isSavingCache, setIsSavingCache] = useState(false);

    const loadExplanation = async (roadmap: Roadmap, pIdx: number, mIdx: number, forceRegenerate: boolean = false) => {
        const ph = roadmap.phases[pIdx];
        const ms = ph?.milestones[mIdx];
        if (!ms) return;
        const key = `${pIdx}-${mIdx}`;
        setExplanation(null);
        setChatHistory([]);
        setShowDoubt(false);
        setDoubtText('');
        setIsLoading(true);
        setStatus(prev => ({ ...prev, [key]: 'learning' }));
        // Save "learning" status to Supabase
        saveProgress({
            domain: roadmap.title,
            roadmap_id: roadmap.id,
            phase_name: ph.name,
            phase_index: pIdx,
            milestone_title: ms.title,
            milestone_index: mIdx,
            status: 'learning'
        });
        try {
            const user = getUser(); // Get user here
            const res = await apiFetch(`${API_BASE_URL}/teacher/explain`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: ph.name,
                    subtopic: ms.title,
                    domain: roadmap.title,
                    has_doubt: false,
                    user_email: user?.email, // Add user_email to the request body
                    force_regenerate: forceRegenerate
                })
            });
            const data = await res.json();
            setExplanation(data);
        } catch {
            setExplanation({ explanation: 'Failed to load explanation. Please check if backend is running.', topic: ph.name, subtopic: ms.title });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAskDoubt = async () => {
        if ((!doubtText.trim() && !attachedFile) || !milestone || !phase || !selectedRoadmap) return;
        
        const user = getUser();
        const currentText = doubtText;
        const currentFile = attachedFile;
        
        let imageUrl = '';
        if (currentFile?.type.startsWith('image/')) {
            imageUrl = URL.createObjectURL(currentFile);
        }

        const updatedHistory = [
            ...chatHistory, 
            { role: 'user' as const, content: currentText, imageUrl: imageUrl }
        ];
        setChatHistory(updatedHistory);
        setDoubtText('');
        setAttachedFile(null);
        setDoubtLoading(true);
        
        try {
            let res;
            if (currentFile) {
                const formData = new FormData();
                formData.append('user_email', user?.email || '');
                formData.append('topic', phase.name);
                formData.append('subtopic', milestone.title);
                formData.append('domain', selectedRoadmap.title);
                formData.append('message', currentText);
                formData.append('file', currentFile);

                res = await apiFetch(`${API_BASE_URL}/teacher/ask-multimodal`, {
                    method: 'POST',
                    body: formData
                });
            } else {
                res = await apiFetch(`${API_BASE_URL}/teacher/explain`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        topic: phase.name,
                        subtopic: milestone.title,
                        domain: selectedRoadmap.title,
                        has_doubt: true,
                        doubt_text: currentText,
                        history: chatHistory,
                        user_email: user?.email
                    })
                });
            }
            const data = await res.json();
            setChatHistory(prev => [...prev, { role: 'assistant' as const, content: data.explanation }]);
        } catch {
            setChatHistory(prev => [...prev, { role: 'assistant' as const, content: 'Could not get answer. Please try again.' }]);
        } finally {
            setDoubtLoading(false);
        }
    };

    const handleVoiceInput = () => {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Speech recognition not supported in this browser.");
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setDoubtText(prev => prev + " " + transcript);
            playNotificationSound('click');
        };
        recognition.start();
    };

    const handleMarkDone = () => {
        setStatus(prev => ({ ...prev, [milestoneKey]: 'done' }));
        // Save "done" status to Supabase
        if (phase && milestone && selectedRoadmap) {
            saveProgress({
                domain: selectedRoadmap.title,
                roadmap_id: selectedRoadmap.id,
                phase_name: phase.name,
                phase_index: phaseIdx,
                milestone_title: milestone.title,
                milestone_index: milestoneIdx,
                status: 'done'
            });
        }
        // Auto-advance
        if (phase && milestoneIdx < phase.milestones.length - 1) {
            const nextMIdx = milestoneIdx + 1;
            setMilestoneIdx(nextMIdx);
            setChatHistory([]); // Clear chat on topic change
            if (selectedRoadmap) loadExplanation(selectedRoadmap, phaseIdx, nextMIdx);
        } else if (selectedRoadmap && phaseIdx < selectedRoadmap.phases.length - 1) {
            const nextPIdx = phaseIdx + 1;
            setPhaseIdx(nextPIdx);
            setMilestoneIdx(0);
            setChatHistory([]); // Clear chat on topic change
            loadExplanation(selectedRoadmap, nextPIdx, 0);
        }
    };

    const handleSaveToCache = async () => {
        if (!explanation || !selectedRoadmap || !phase || !milestone) return;
        setIsSavingCache(true);
        try {
            await apiFetch(`${API_BASE_URL}/teacher/save-cache`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: phase.name,
                    subtopic: milestone.title,
                    domain: selectedRoadmap.title,
                    explanation_data: explanation
                })
            });
            alert('Successfully cached! Future requests for this topic will cost 0 API quota.');
        } catch(e) {
            console.error('Failed to save to redis cache:', e);
        } finally {
            setIsSavingCache(false);
        }
    };

    const handleDownloadNotes = async () => {
        if (!milestone || !phase || !selectedRoadmap) return;
        setIsDownloading(true);
        try {
            const user = getUser();
            const res = await apiFetch(`${API_BASE_URL}/teacher/generate-notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic: phase.name,
                    subtopic: milestone.title,
                    domain: selectedRoadmap.title,
                    user_email: user?.email || null
                })
            });
            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${milestone.title.replace(/\s+/g, '_')}_Notes.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                // Refresh saved notes list — backend just uploaded it
                if (user?.email) setTimeout(() => loadSavedNotes(), 1500);
            }
        } catch (e) {
            console.error('Notes download failed', e);
        } finally {
            setIsDownloading(false);
        }
    };

    // Render inline markdown: **bold**, `code`, mixed text
    const renderInline = (text: string) => {
        if (!text) return null;
        const parts: React.ReactNode[] = [];
        
        const regex = /(\*\*[^*]+\*\*|`[^`]+`|\$(?:[^\$]|\\\$)+\$|\\\(.*?\\\))/g;
        
        let last = 0, m;
        let key = 0;
        while ((m = regex.exec(text)) !== null) {
            if (m.index > last) {
                const plainText = text.slice(last, m.index);
                parts.push(<span key={key++}>{normalizeLatexText(plainText)}</span>);
            }
            
            const token = m[0];
            if (token.startsWith('**')) {
                parts.push(<strong key={key++} style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{token.slice(2, -2)}</strong>);
            } else if (token.startsWith('`')) {
                parts.push(<code key={key++} style={{ background: 'rgba(100,130,255,0.12)', color: 'var(--primary-700)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.85em', fontFamily: 'monospace' }}>{token.slice(1, -1)}</code>);
            } else if (token.startsWith('$')) {
                const math = token.slice(1, -1).trim();
                if (math) {
                    try {
                        parts.push(<InlineMath key={key++} math={math} />);
                    } catch {
                        parts.push(<span key={key++} style={{ color: 'var(--accent-red)' }}>${math}$</span>);
                    }
                }
            } else if (token.startsWith('\\(')) {
                const math = token.slice(2, -2).trim();
                if (math) {
                    try {
                        parts.push(<InlineMath key={key++} math={math} />);
                    } catch {
                        parts.push(<span key={key++} style={{ color: 'var(--accent-red)' }}>({math})</span>);
                    }
                }
            }
            last = m.index + token.length;
        }
        
        if (last < text.length) {
            parts.push(<span key={key++}>{normalizeLatexText(text.slice(last))}</span>);
        }
        
        return parts.length > 0 ? parts : [normalizeLatexText(text)];
    };

    const formatExplanation = (text: string) => {
        const lines = text.split('\n');
        const elements: React.ReactNode[] = [];
        let i = 0;
        let lastHeadingContext = '';

        while (i < lines.length) {
            const line = lines[i];

            // --- Diagram blocks (D2, Graphviz, Mermaid) ---
            const diagMatch = line.trim().match(/^```(d2|graphviz|dot|mermaid|plantuml)/i);
            if (diagMatch) {
                const lang = diagMatch[1].toLowerCase();
                const engine = (lang === 'dot') ? 'graphviz' : lang;
                const codeLines: string[] = [];
                i++;
                while (i < lines.length && !lines[i].trim().startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                const diagramCode = codeLines.join('\n');
                elements.push(
                    <div key={i} style={{ margin: '1.5rem 0', background: 'rgba(100,130,255,0.02)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(100,130,255,0.1)' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary-600)', marginBottom: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '1rem' }}>📊</span> {engine.toUpperCase()} Architecture
                        </div>
                        <DiagramBlock engine={engine} code={diagramCode} />
                    </div>
                );
                i++; continue;
            }

            // --- Raw D2 fallback for stale cached explanations without ```d2 fences ---
            if (
                /flowchart|diagram|architecture/i.test(lastHeadingContext) &&
                looksLikeD2Line(line)
            ) {
                const diagramLines: string[] = [];
                while (i < lines.length) {
                    const currentLine = lines[i];
                    if (!currentLine.trim()) break;
                    if (!looksLikeD2Line(currentLine)) break;
                    diagramLines.push(currentLine);
                    i++;
                }

                if (diagramLines.length > 0) {
                    elements.push(
                        <div key={`raw-d2-${i}`} style={{ margin: '1.5rem 0', background: 'rgba(100,130,255,0.02)', padding: '1.25rem', borderRadius: '12px', border: '1px solid rgba(100,130,255,0.1)' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--primary-600)', marginBottom: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '1rem' }}>📊</span> D2 Architecture
                            </div>
                            <DiagramBlock engine="d2" code={diagramLines.join('\n')} />
                        </div>
                    );
                    continue;
                }
            }

            // --- Block Math: $$ ... $$ or \begin{env} ... \end{env} or \[ ... \] ---
            if (line.trim().startsWith('$$') || line.trim().startsWith('\\begin{') || line.trim().startsWith('\\[')) {
                let mathContent = "";
                
                if (line.trim().startsWith('$$')) {
                    const trimmedLine = line.trim();
                    // Case 1: All on one line $$ ... $$
                    if (trimmedLine.length > 4 && trimmedLine.endsWith('$$')) {
                        mathContent = trimmedLine.slice(2, -2);
                    } else {
                        // Case 2: Multi-line $$ ...
                        mathContent = trimmedLine.slice(2);
                        const mathLines: string[] = [mathContent];
                        i++;
                        while (i < lines.length) {
                             const l = lines[i].trim();
                             if (l.endsWith('$$')) {
                                 mathLines.push(l.slice(0, -2));
                                 break;
                             }
                             mathLines.push(lines[i]);
                             i++;
                        }
                        // If we never found an ending $$, we should probably treat it as a false positive
                        // for BlockMath and just render normally, but AI usually just forgets the end.
                        mathContent = mathLines.join('\n');
                    }
                } else if (line.trim().startsWith('\\[')) {
                    // Handle \[ ... \] format
                    const trimmedLine = line.trim();
                    if (trimmedLine.endsWith('\\]')) {
                        mathContent = trimmedLine.slice(2, -2);
                    } else {
                        mathContent = trimmedLine.slice(2);
                        const mathLines: string[] = [mathContent];
                        i++;
                        while (i < lines.length) {
                             const l = lines[i].trim();
                             if (l.includes('\\]')) {
                                 mathLines.push(l.split('\\]')[0]);
                                 break;
                             }
                             mathLines.push(lines[i]);
                             i++;
                        }
                        mathContent = mathLines.join('\n');
                    }
                } else {
                    // Start of a \begin{...} environment
                    const mathLines: string[] = [line.trim()];
                    i++;
                    while (i < lines.length && !lines[i].includes('\\end{')) {
                        mathLines.push(lines[i]);
                        i++;
                    }
                    if (i < lines.length) mathLines.push(lines[i]);
                    mathContent = mathLines.join('\n');
                }
                
                if (mathContent.trim()) {
                    try {
                        elements.push(
                            <div key={`math-${i}`} className="math-block" style={{ margin: '1.5rem 0', textAlign: 'center', background: 'rgba(100,130,255,0.03)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(100,130,255,0.08)' }}>
                                <BlockMath math={mathContent} />
                            </div>
                        );
                    } catch {
                        elements.push(<p key={`math-error-${i}`} style={{ color: 'var(--accent-red)', fontSize: '0.8rem' }}>Math Error: {mathContent.slice(0, 50)}...</p>);
                    }
                }
                i++; continue;
            }

            // --- Code block (general) ---
            if (line.trim().startsWith('```')) {
                const codeLines: string[] = [];
                i++;
                while (i < lines.length && !lines[i].trim().startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                elements.push(
                    <pre key={i} style={{ margin: '1rem 0', background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '8px', overflowX: 'auto', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <code style={{ fontSize: '0.85rem', color: '#e2e8f0', fontFamily: 'monospace' }}>
                            {codeLines.join('\n')}
                        </code>
                    </pre>
                );
                i++; continue;
            }

            // --- Headings ---
            if (line.startsWith('### ')) {
                lastHeadingContext = line.slice(4);
                elements.push(<h5 key={i} style={{ color: 'var(--primary-600)', fontSize: '0.95rem', fontWeight: 800, margin: '1rem 0 0.4rem' }}>{renderInline(line.slice(4))}</h5>);
                i++; continue;
            }
            if (line.startsWith('## ')) {
                lastHeadingContext = line.slice(3);
                elements.push(<h4 key={i} style={{ color: 'var(--primary-600)', fontSize: '1rem', fontWeight: 800, margin: '1.25rem 0 0.5rem', borderBottom: '1px solid rgba(100,130,255,0.15)', paddingBottom: '4px' }}>{renderInline(line.slice(3))}</h4>);
                i++; continue;
            }
            if (line.startsWith('# ')) {
                lastHeadingContext = line.slice(2);
                elements.push(<h3 key={i} style={{ color: 'var(--primary-700)', fontSize: '1.1rem', fontWeight: 900, margin: '1rem 0 0.5rem' }}>{renderInline(line.slice(2))}</h3>);
                i++; continue;
            }

            // --- Markdown table: collect all table rows ---
            if (line.trim().startsWith('|') && line.includes('|')) {
                const tableLines: string[] = [];
                while (i < lines.length && lines[i].trim().startsWith('|')) {
                    tableLines.push(lines[i]);
                    i++;
                }
                const isSeparator = (l: string) => /^\|[-|: ]+\|$/.test(l.trim());
                const rows = tableLines.filter(l => !isSeparator(l));
                const parseCells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

                if (rows.length > 0) {
                    const headerCells = parseCells(rows[0]);
                    const bodyRows = rows.slice(1);
                    elements.push(
                        <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '0.75rem 0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(100,130,255,0.12)' }}>
                                        {headerCells.map((c, ci) => (
                                            <th key={ci} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--primary-700)', borderBottom: '2px solid rgba(100,130,255,0.3)', whiteSpace: 'nowrap' }}>
                                                {renderInline(c)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {bodyRows.map((row, ri) => (
                                        <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(100,130,255,0.04)' }}>
                                            {parseCells(row).map((c, ci) => (
                                                <td key={ci} style={{ padding: '7px 12px', borderBottom: '1px solid rgba(100,130,255,0.08)', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                                    {renderInline(c)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }
                continue;
            }

            // --- Bullets: * or - or • ---
            if (/^[*\-•]\s/.test(line)) {
                const content = line.replace(/^[*\-•]\s+/, '');
                elements.push(<p key={i} style={{ margin: '3px 0 3px 16px', fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.65, display: 'flex', gap: '8px' }}>
                    <span style={{ color: 'var(--primary-500)', flexShrink: 0, fontWeight: 700 }}>•</span>
                    <span>{renderInline(content)}</span>
                </p>);
                i++; continue;
            }

            // --- Numbered list: 1. 2. etc ---
            if (/^\d+\.\s/.test(line)) {
                const [num, ...rest] = line.split(/\.\s(.*)/);
                elements.push(<p key={i} style={{ margin: '3px 0 3px 16px', fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.65, display: 'flex', gap: '8px' }}>
                    <span style={{ color: 'var(--primary-500)', flexShrink: 0, fontWeight: 700, minWidth: '1.4em' }}>{num}.</span>
                    <span>{renderInline(rest[0] || '')}</span>
                </p>);
                i++; continue;
            }

            // --- Empty line ---
            if (line.trim() === '') {
                elements.push(<div key={i} style={{ height: '6px' }} />);
                i++; continue;
            }

            // --- Standalone bold line ---
            if (/^\*\*[^*]+\*\*\s*:?$/.test(line.trim())) {
                elements.push(<strong key={i} style={{ display: 'block', color: 'var(--primary-600)', margin: '8px 0 2px', fontSize: '0.93rem' }}>{line.replace(/\*\*/g, '').replace(/:$/, '')}</strong>);
                i++; continue;
            }

            // --- Normal paragraph ---
            elements.push(<p key={i} style={{ margin: '4px 0', fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.65 }}>{renderInline(line)}</p>);
            i++;
        }
        return elements;
    };


    // ── Domain Picker ───────────────────────────────────────
    if (!selectedRoadmap) {
        return (
            <div className="flex-col gap-xl fade-in">
                <header>
                    <h2 style={{ fontSize: '2rem', fontWeight: 900 }}>🎓 AI Teacher</h2>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', marginBottom: '1rem' }}>
                        Select your learning domain to begin your guided journey
                    </p>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', background: 'var(--bg-tertiary)', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', color: 'var(--primary-400)' }}>
                            📈 Track learner progress and recommend targeted lessons and quizzes
                        </span>
                        <span style={{ fontSize: '0.8rem', background: 'var(--bg-tertiary)', padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', color: 'var(--primary-400)' }}>
                            🧠 Provide context-aware explanations at multiple levels (beginner to advanced)
                        </span>
                    </div>
                </header>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1.25rem' }}>
                    {CURRICULUM_DATA.map(roadmap => (
                        <button
                            key={roadmap.id}
                            onClick={() => {
                                 setSelectedRoadmap(roadmap);
                                 setPhaseIdx(0);
                                 setMilestoneIdx(0);
                                 playNotificationSound('transition');
                                 loadExplanation(roadmap, 0, 0);
                            }}
                            className="glass-card"
                            style={{
                                padding: '1.5rem',
                                cursor: 'pointer',
                                border: `1px solid ${roadmap.color}30`,
                                textAlign: 'left',
                                transition: 'all 0.3s ease',
                                background: `linear-gradient(135deg, ${roadmap.color}06 0%, transparent 100%)`
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '2.5rem' }}>{roadmap.icon}</div>
                                {profileDomain === roadmap.title && (
                                    <span style={{ fontSize: '0.65rem', background: 'var(--primary-500)', color: 'white', padding: '2px 8px', borderRadius: '12px', fontWeight: 800 }}>MY DOMAIN</span>
                                )}
                             </div>
                             <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>{roadmap.title}</h3>
                             <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.5 }}>{roadmap.description.slice(0, 90)}…</p>
                            <div className="flex gap-sm">
                                <span className="badge" style={{ fontSize: '0.65rem', borderColor: roadmap.color, color: roadmap.color }}>{roadmap.difficulty}</span>
                                <span className="badge" style={{ fontSize: '0.65rem' }}>{roadmap.duration}</span>
                                <span className="badge" style={{ fontSize: '0.65rem' }}>{roadmap.phases.length} Phases</span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // ── Main Teacher View ───────────────────────────────────
    return (
        <div className="flex-col gap-xl fade-in">
            {/* Header */}
            <header className="flex justify-between items-start" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <div className="flex items-center gap-md">
                        <button onClick={() => setSelectedRoadmap(null)} className="btn btn-secondary" style={{ padding: '0.4rem 0.9rem', fontSize: '0.75rem' }}>← Domains</button>
                        <span style={{ fontSize: '1.5rem' }}>{selectedRoadmap.icon}</span>
                        <h2 style={{ fontSize: '1.6rem', fontWeight: 900 }}>{selectedRoadmap.title}</h2>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.4rem', fontSize: '0.9rem' }}>AI-Guided Learning · Phase {phaseIdx + 1} of {selectedRoadmap.phases.length}</p>
                </div>
                {/* Overall Progress */}
                <div className="glass-card" style={{ padding: '0.75rem 1.5rem', minWidth: '200px' }}>
                    <div className="flex justify-between items-center mb-xs">
                        <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)' }}>OVERALL PROGRESS</span>
                        <span style={{ fontWeight: 900, color: 'var(--primary-500)', fontSize: '1rem' }}>{overallProgress}%</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(100,130,255,0.12)', borderRadius: '3px' }}>
                        <div style={{ height: '100%', width: `${overallProgress}%`, background: 'var(--primary-500)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                    </div>
                    <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '4px' }}>{doneCount} / {totalMilestones} topics completed</p>
                </div>
            </header>

            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '260px minmax(0, 940px)', 
                gap: '1.5rem', 
                alignItems: 'start', 
                justifyContent: 'center',
                margin: '0 auto'
            }} className="teacher-grid">
                {/* Left: Phase + Milestone Nav */}
                <div className="flex-col gap-md" style={{ position: 'sticky', top: '110px' }}>
                    {selectedRoadmap.phases.map((ph, pIdx) => (
                        <div key={pIdx} className="glass-card" style={{ padding: '1rem', border: phaseIdx === pIdx ? `1px solid ${selectedRoadmap.color}` : '1px solid var(--glass-border)' }}>
                            <h4 style={{ fontSize: '0.78rem', fontWeight: 800, color: phaseIdx === pIdx ? selectedRoadmap.color : 'var(--text-muted)', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Phase {pIdx + 1}: {ph.name}
                            </h4>
                            <div className="flex-col gap-xs">
                                {ph.milestones.map((ms, mIdx) => {
                                    const k = `${pIdx}-${mIdx}`;
                                    const s = status[k];
                                    const isActive = phaseIdx === pIdx && milestoneIdx === mIdx;
                                    return (
                                        <button
                                            key={mIdx}
                                            onClick={() => {
                                                setPhaseIdx(pIdx);
                                                setMilestoneIdx(mIdx);
                                                loadExplanation(selectedRoadmap, pIdx, mIdx);
                                            }}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '8px',
                                                padding: '0.5rem 0.75rem', borderRadius: '8px', border: 'none',
                                                cursor: 'pointer', textAlign: 'left', width: '100%',
                                                background: isActive ? `${selectedRoadmap.color}15` : 'transparent',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>
                                                {s === 'done' ? '✅' : s === 'learning' ? '📖' : '⬜'}
                                            </span>
                                            <span style={{ fontSize: '0.78rem', color: isActive ? 'var(--primary-600)' : 'var(--text-secondary)', fontWeight: isActive ? 700 : 400, lineHeight: 1.3 }}>
                                                {ms.title}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Right: Content Panel */}
                <div className="flex-col gap-lg">
                    {/* Topic header */}
                    {milestone && (
                        <div className="glass-card" style={{ padding: '1.5rem', borderTop: `3px solid ${selectedRoadmap.color}` }}>
                            <div className="flex justify-between items-start" style={{ flexWrap: 'wrap', gap: '1rem' }}>
                                <div>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 800, letterSpacing: '1px', marginBottom: '4px' }}>
                                        {phase?.name}
                                    </p>
                                    <h3 style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)' }}>{milestone.title}</h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginTop: '0.4rem' }}>{milestone.description}</p>
                                    <div className="flex flex-wrap gap-xs" style={{ marginTop: '0.75rem' }}>
                                        {milestone.skills.map(s => (
                                            <span key={s} className="badge" style={{ fontSize: '0.68rem', background: `${selectedRoadmap.color}10`, borderColor: `${selectedRoadmap.color}40`, color: selectedRoadmap.color }}>{s}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex-col gap-sm">
                                    <button
                                        className="btn btn-primary"
                                        style={{ fontSize: '0.8rem', padding: '0.6rem 1.2rem', whiteSpace: 'nowrap' }}
                                        onClick={handleMarkDone}
                                        disabled={status[milestoneKey] === 'done'}
                                    >
                                        {status[milestoneKey] === 'done' ? '✅ Completed' : '✓ Mark Done & Next'}
                                    </button>
                                    <div className="flex gap-sm">
                                        <button
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', whiteSpace: 'nowrap', flex: 1 }}
                                            onClick={handleDownloadNotes}
                                            disabled={isDownloading}
                                        >
                                            {isDownloading ? '⏳...' : '📄 PDF'}
                                        </button>
                                        <button
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', whiteSpace: 'nowrap', borderColor: 'var(--accent-teal)', color: 'var(--accent-teal)' }}
                                            onClick={() => { if(selectedRoadmap) loadExplanation(selectedRoadmap, phaseIdx, milestoneIdx, true) }}
                                            disabled={isLoading}
                                        >
                                            {isLoading ? '⏳...' : '🔁 Regen'}
                                        </button>
                                        <button
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.75rem', padding: '0.5rem 1rem', whiteSpace: 'nowrap', borderColor: 'var(--accent-orange)', color: 'var(--accent-orange)' }}
                                            onClick={handleSaveToCache}
                                            disabled={isSavingCache}
                                        >
                                            {isSavingCache ? '⏳...' : '💾 Cache'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* AI Explanation */}
                    <div className="glass-card" style={{ padding: '1.75rem', minHeight: '300px' }}>
                        <div className="flex justify-between items-center" style={{ marginBottom: '1.25rem' }}>
                            <h4 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--primary-500)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                🤖 AI Teacher Explanation
                            </h4>
                            {explanation && (
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.72rem', padding: '0.35rem 0.8rem' }}
                                    onClick={() => selectedRoadmap && loadExplanation(selectedRoadmap, phaseIdx, milestoneIdx, true)}
                                >
                                    ↻ Regenerate
                                </button>
                            )}
                        </div>

                        {hasLessonMedia && (
                             <div className="flex gap-md mb-lg justify-center" style={{ flexWrap: 'wrap' }}>
                                 {showReferenceImage && explanation?.image_url && (
                                     <div className="glass-card" style={{ padding: '0.4rem', width: '400px', flexShrink: 0 }}>
                                         <img
                                            src={explanation.image_url}
                                            alt="Visual Context"
                                            style={{ width: '100%', maxHeight: '250px', objectFit: 'cover', borderRadius: '8px' }}
                                         />
                                         <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px', fontWeight: 700 }}>TECHNICAL REFERENCE IMAGE</p>
                                     </div>
                                 )}
                                 {explanation?.video_url && (
                                     <div className="glass-card" style={{ padding: '0.4rem', width: '400px', flexShrink: 0 }}>
                                         {explanation.video_url.includes('youtube.com') || explanation.video_url.includes('youtu.be') ? (
                                             <YouTubeEmbed url={explanation.video_url} />
                                         ) : (
                                             <video 
                                                src={explanation.video_url} 
                                                controls 
                                                style={{ width: '100%', maxHeight: '250px', borderRadius: '8px', background: '#000' }} 
                                             />
                                         )}
                                         <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '4px', fontWeight: 700 }}>CONCEPTUAL VIDEO GUIDE (UNDER 3 MINS)</p>
                                     </div>
                                 )}
                             </div>
                        )}

                        {isLoading ? (
                            <div className="flex-col items-center justify-center" style={{ padding: '3rem', gap: '1rem' }}>
                                <div style={{ width: '40px', height: '40px', border: '3px solid rgba(100,130,255,0.2)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Teacher AI is preparing your lesson…</p>
                            </div>
                        ) : explanation ? (
                            <div style={{ lineHeight: 1.7 }}>
                                {formatExplanation(explanation.explanation)}
                            </div>
                        ) : (
                            <div className="flex-col items-center" style={{ padding: '3rem', opacity: 0.5 }}>
                                <p>Select a topic from the left to start learning</p>
                            </div>
                        )}
                    </div>

                    {/* Doubt Section */}
                    {explanation && (
                        <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid rgba(100,130,255,0.2)' }}>
                            <div className="flex justify-between items-center" style={{ marginBottom: '1rem' }}>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--primary-600)' }}>
                                    🙋 Have a Doubt?
                                </h4>
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.72rem', padding: '0.4rem 0.9rem' }}
                                    onClick={() => setShowDoubt(!showDoubt)}
                                >
                                    {showDoubt ? 'Hide' : 'Ask AI Teacher'}
                                </button>
                            </div>

                            {showDoubt && (
                                <div className="flex-col gap-md fade-in">
                                    <div style={{ 
                                        maxHeight: '400px', 
                                        overflowY: 'auto', 
                                        padding: '0.5rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '1rem'
                                    }}>
                                        {chatHistory.length === 0 ? (
                                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', padding: '1rem' }}>Ask anything about this topic!</p>
                                        ) : (
                                            chatHistory.map((msg, i) => (
                                                <div key={i} style={{
                                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                                    maxWidth: '85%',
                                                    padding: '0.75rem 1rem',
                                                    borderRadius: msg.role === 'user' ? '14px 14px 0 14px' : '14px 14px 14px 0',
                                                    background: msg.role === 'user' ? 'var(--primary-500)' : 'rgba(100,130,255,0.06)',
                                                    color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                                                    border: msg.role === 'user' ? 'none' : '1px solid rgba(100,130,255,0.15)',
                                                    fontSize: '0.85rem',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                                }}>
                                                    {(msg as any).imageUrl && (
                                                        <img 
                                                            src={(msg as any).imageUrl} 
                                                            alt="Attachment" 
                                                            style={{ 
                                                                maxWidth: '100%', 
                                                                maxHeight: '240px', 
                                                                borderRadius: '8px', 
                                                                marginBottom: '0.6rem',
                                                                display: 'block',
                                                                border: '1px solid rgba(255,255,255,0.2)'
                                                            }} 
                                                        />
                                                    )}
                                                    {msg.role === 'assistant' ? formatExplanation(msg.content) : msg.content}
                                                </div>
                                            ))
                                        )}
                                        {doubtLoading && (
                                            <div style={{ alignSelf: 'flex-start', padding: '0.75rem 1rem', background: 'rgba(100,130,255,0.06)', borderRadius: '14px 14px 14px 0' }}>
                                                <div style={{ width: '12px', height: '12px', border: '2px solid var(--primary-500)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                                            </div>
                                        )}
                                    </div>

                                     {attachedFile && (
                                         <div style={{ 
                                             display: 'flex', 
                                             alignItems: 'center', 
                                             justifyContent: 'space-between',
                                             padding: '0.65rem 1rem', 
                                             background: 'rgba(100,130,255,0.06)', 
                                             border: '1px solid rgba(100,130,255,0.2)',
                                             borderRadius: '12px',
                                             marginBottom: '0.75rem',
                                             fontSize: '0.8rem',
                                             color: 'var(--primary-600)',
                                             fontWeight: 700,
                                             backdropFilter: 'blur(8px)'
                                         }}>
                                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                 <span style={{ fontSize: '1.2rem' }}>🖼️</span>
                                                 <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                     <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                         {attachedFile.name}
                                                     </span>
                                                     <span style={{ fontSize: '0.65rem', opacity: 0.6, fontWeight: 500 }}>
                                                         {(attachedFile.size / 1024).toFixed(1)} KB · Attached
                                                     </span>
                                                 </div>
                                             </div>
                                             <button 
                                                 onClick={() => setAttachedFile(null)}
                                                 style={{ 
                                                     background: 'rgba(255,70,70,0.1)', 
                                                     border: 'none', 
                                                     color: 'var(--accent-red)', 
                                                     cursor: 'pointer',
                                                     width: '24px',
                                                     height: '24px',
                                                     borderRadius: '50%',
                                                     display: 'flex',
                                                     alignItems: 'center',
                                                     justifyContent: 'center'
                                                 }}
                                                 title="Remove"
                                             >
                                                 ✕
                                             </button>
                                         </div>
                                     )}
                                     <div className="flex gap-sm" style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                                         <button 
                                            className={`btn ${isListening ? 'btn-primary pulse' : 'btn-secondary'}`}
                                            style={{ padding: '0.6rem', position: 'relative' }}
                                            onClick={handleVoiceInput}
                                            title="Voice Input"
                                         >
                                             {isListening ? '🛑' : '🎤'}
                                         </button>
                                         <input
                                             type="file"
                                             id="doubt-file-upload"
                                             hidden
                                             onChange={(e) => setAttachedFile(e.target.files?.[0] || null)}
                                             accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp"
                                         />
                                         <button 
                                            className="btn btn-secondary"
                                            style={{ padding: '0.6rem' }}
                                            onClick={() => document.getElementById('doubt-file-upload')?.click()}
                                            title="Attach PDF, document, or image"
                                         >
                                             📎
                                         </button>
                                         <input
                                             value={doubtText}
                                             onChange={e => setDoubtText(e.target.value)}
                                             onKeyPress={e => e.key === 'Enter' && handleAskDoubt()}
                                             placeholder="Ask a question…"
                                             className="input-field"
                                             style={{ flex: 1, fontSize: '0.85rem' }}
                                         />
                                         <button
                                             className="btn btn-primary"
                                             style={{ padding: '0.6rem' }}
                                             onClick={handleAskDoubt}
                                             disabled={(!doubtText.trim() && !attachedFile) || doubtLoading}
                                         >
                                             🚀
                                         </button>
                                     </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Notes Library ── */}
                    {selectedRoadmap && (
                        <div className="glass-card" style={{ padding: '1.5rem', border: '1px solid rgba(100,130,255,0.15)' }}>
                            <div className="flex justify-between items-center">
                                <div className="flex items-center gap-md">
                                    <span style={{ fontSize: '1.2rem' }}>📁</span>
                                    <div>
                                        <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>My Notes Library</h4>
                                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>All PDFs saved to your Supabase account</p>
                                    </div>
                                </div>
                                <button
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.78rem', padding: '0.45rem 1rem' }}
                                    onClick={() => {
                                        const next = !showNotes;
                                        setShowNotes(next);
                                        if (next && savedNotes.length === 0) loadSavedNotes();
                                    }}
                                >
                                    {showNotes ? '▲ Hide' : '▼ View Saved Notes'}
                                </button>
                            </div>

                            {showNotes && (
                                <div className="fade-in" style={{ marginTop: '1.25rem', borderTop: '1px solid var(--glass-border)', paddingTop: '1.25rem' }}>
                                    {notesLoading ? (
                                        <div className="flex items-center gap-md" style={{ padding: '1rem' }}>
                                            <div style={{ width: '20px', height: '20px', border: '3px solid rgba(100,130,255,0.15)', borderTopColor: 'var(--primary-500)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading your saved notes…</p>
                                        </div>
                                    ) : savedNotes.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', opacity: 0.6 }}>
                                            <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📭</p>
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>No saved notes yet. Generate notes for a topic and they'll appear here.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                                            {savedNotes.map((note, i) => (
                                                <div key={i} style={{
                                                    padding: '1rem 1.25rem',
                                                    background: 'rgba(100,130,255,0.04)',
                                                    border: '1px solid rgba(100,130,255,0.15)',
                                                    borderRadius: '10px',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    gap: '0.75rem'
                                                }}>
                                                    <div style={{ overflow: 'hidden' }}>
                                                        <p style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            📄 {note.display_name || note.name}
                                                        </p>
                                                        {note.created_at && (
                                                            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                                                {new Date(note.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                            </p>
                                                        )}
                                                    </div>
                                                    {note.signed_url ? (
                                                        <a
                                                            href={note.signed_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            download
                                                            style={{
                                                                flexShrink: 0,
                                                                padding: '0.4rem 0.8rem',
                                                                background: 'var(--primary-500)',
                                                                color: 'white',
                                                                borderRadius: '8px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: 700,
                                                                textDecoration: 'none',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            ⬇ PDF
                                                        </a>
                                                    ) : (
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Link expired</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <button
                                        className="btn btn-secondary"
                                        style={{ marginTop: '1rem', fontSize: '0.75rem', padding: '0.4rem 0.9rem' }}
                                        onClick={loadSavedNotes}
                                        disabled={notesLoading}
                                    >
                                        {notesLoading ? '⏳ Refreshing…' : '🔄 Refresh List'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>


            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @media (max-width: 1024px) {
                    .teacher-grid { grid-template-columns: 1fr !important; }
                }
                .glass-card button:hover { opacity: 0.85; }

                /* Premium "Blueprint" Diagram Styles */
                .diagram-canvas {
                    background: #f8fbff; /* Very light tech blue */
                    padding: 2rem;
                    border-radius: 12px;
                    border: 1px solid #d1e3f8;
                    display: flex;
                    justify-content: center;
                    width: 100%;
                    min-height: 250px;
                    align-items: center;
                    position: relative;
                    overflow: hidden;
                    box-shadow: inset 0 2px 10px rgba(0,0,0,0.02);
                }

                .diagram-svg-container {
                    width: 100%;
                    display: flex;
                    justify-content: center;
                    overflow-x: auto;
                }

                /* Force SVG elements to look like the reference image */
                .diagram-svg-container svg {
                    max-width: 100% !important;
                    height: auto !important;
                }

                /* This targets D2/Kroki generated SVG paths/rects for that clean blue look */
                .diagram-svg-container svg rect, 
                .diagram-svg-container svg path[fill^="rgb(255, 255, 255)"],
                .diagram-svg-container svg polygon {
                    stroke: #2563eb !important; /* Blue borders */
                    stroke-width: 1.5px !important;
                    fill: #eff6ff !important; /* Light blue fill */
                }

                .diagram-svg-container svg text {
                    fill: #1e3a8a !important; /* Deep blue text */
                    font-weight: 600 !important;
                    font-family: 'Inter', sans-serif !important;
                }

                .diagram-svg-container svg path {
                    stroke: #2563eb !important; /* Blue arrows */
                }

                .flow-graph-shell {
                    width: 100%;
                    border-radius: 22px;
                    padding: 1rem;
                    background:
                        radial-gradient(circle at top left, rgba(37,99,235,0.12), transparent 42%),
                        linear-gradient(180deg, rgba(255,255,255,0.96), rgba(239,246,255,0.98));
                    border: 1px solid rgba(37,99,235,0.16);
                    box-shadow: 0 24px 50px rgba(37,99,235,0.08);
                }

                .flow-graph-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 1rem;
                    margin-bottom: 0.9rem;
                }

                .flow-graph-eyebrow {
                    margin: 0 0 0.15rem;
                    font-size: 0.7rem;
                    font-weight: 800;
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                    color: #2563eb;
                }

                .flow-graph-title {
                    margin: 0;
                    font-size: 1rem;
                    font-weight: 800;
                    color: #0f172a;
                }

                .flow-graph-badge {
                    padding: 0.42rem 0.8rem;
                    border-radius: 999px;
                    background: rgba(37,99,235,0.12);
                    color: #1d4ed8;
                    font-size: 0.72rem;
                    font-weight: 800;
                    letter-spacing: 0.04em;
                    text-transform: uppercase;
                }

                .flow-graph-hint {
                    margin: 0 0 0.75rem;
                    font-size: 0.78rem;
                    color: #475569;
                }

                .flow-graph-scroll {
                    width: 100%;
                    overflow-x: auto;
                    overflow-y: hidden;
                    padding-bottom: 0.4rem;
                    cursor: grab;
                    scrollbar-width: thin;
                    scrollbar-color: rgba(147, 197, 253, 0.95) rgba(15, 23, 42, 0.92);
                    touch-action: pan-x;
                }

                .flow-graph-scroll:active {
                    cursor: grabbing;
                }

                .flow-graph-scroll::-webkit-scrollbar {
                    height: 10px;
                }

                .flow-graph-scroll::-webkit-scrollbar-track {
                    background: rgba(15, 23, 42, 0.92);
                    border-radius: 999px;
                }

                .flow-graph-scroll::-webkit-scrollbar-thumb {
                    border-radius: 999px;
                    background: linear-gradient(90deg, #d946ef, #7c3aed);
                }

                .flow-graph-svg {
                    display: block;
                }

                .flow-node-card {
                    stroke: rgba(37,99,235,0.28);
                    stroke-width: 1.5px;
                }

                .flow-node-dot {
                    fill: #2563eb;
                }

                .flow-node-caption {
                    font-size: 12px;
                    font-weight: 700;
                    fill: #64748b;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }

                .flow-node-label {
                    font-size: 16px;
                    font-weight: 800;
                    fill: #0f172a;
                }

                .flow-edge {
                    fill: none;
                    stroke: #2563eb;
                    stroke-width: 3;
                    stroke-linecap: round;
                    opacity: 0.95;
                }

                .flow-edge-label-bg {
                    fill: rgba(255,255,255,0.96);
                    stroke: rgba(37,99,235,0.18);
                }

                .flow-edge-label {
                    font-size: 11px;
                    font-weight: 800;
                    fill: #1d4ed8;
                }

                .diagram-error-card {
                    color: #fb7185;
                    background: rgba(159,18,57,0.05);
                    padding: 1.25rem;
                    border-radius: 12px;
                    border: 1px solid rgba(225,29,72,0.2);
                    font-size: 0.8rem;
                }

                .error-title {
                    font-weight: 800;
                    margin-bottom: 0.75rem;
                    color: #e11d48;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .error-details {
                    display: block;
                    padding: 0.75rem;
                    background: rgba(0,0,0,0.2);
                    border-radius: 8px;
                    margin-bottom: 1rem;
                    font-family: inherit;
                    line-height: 1.4;
                }

                .error-raw-code pre {
                    font-family: 'Fira Code', 'Courier New', monospace;
                    font-size: 0.7rem;
                    line-height: 1.5;
                    color: #94a3b8;
                }

                .waiting-text {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                    font-style: italic;
                }
            `}</style>
        </div>
    );
};
