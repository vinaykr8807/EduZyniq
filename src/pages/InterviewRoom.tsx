import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import API_BASE_URL, { apiFetch } from '../config';
import { useResponsive } from '../hooks/useResponsive';
import { getRoleForDomain } from '../utils/profileDefaults';

type InterviewCategory = 'fundamental' | 'technical' | 'project' | 'scenario' | 'behavioral' | 'coding';

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
    ats_score?: { total_score: number };
}

interface InterviewPlanItem {
    type: InterviewCategory;
    skill: string;
    difficulty: string;
    note?: string;
}

interface QuestionPayload {
    question: string;
    category: InterviewCategory | 'coding';
    difficulty?: string;
    topic?: string;
    question_family?: string;
    interviewer_focus?: string[];
    expected_key_points?: string[];
    problem_title?: string;
    problem_statement?: string;
    constraints?: string[];
    examples?: Array<{ input: string; output: string; explanation?: string }>;
    test_cases?: Array<{ input: string; expected_output: string }>;
    hints?: string[];
    starter_template_note?: string;
    function_signature?: Record<string, string>;
}

interface SessionMetricMap {
    eye_contact: number;
    confidence: number;
    speech_clarity: number;
    body_language: number;
    posture: number;
    expression: number;
    communication: number;
    readiness: number;
}

interface AnswerSnapshot {
    question: string;
    answer?: string;
    approach_text?: string;
    code?: string;
    type: 'standard' | 'coding';
    category?: InterviewCategory | 'coding';
    difficulty?: string;
    topic?: string;
    question_family?: string;
    overall_score?: number;
    technical_accuracy?: number;
    communication?: number;
    strengths?: string;
    weaknesses?: string;
    senior_feedback?: string;
    answer_coverage?: {
        covered?: string[];
        partially_covered?: string[];
        missed?: string[];
    };
    delivery_feedback?: {
        speaking_summary?: string;
        pace?: string;
        clarity?: string;
        confidence?: string;
    };
    interviewer_expected_to_hear?: string[];
    improved_answer?: string;
    advice?: string;
    weak_areas?: string[];
    mistakes_made?: string[];
    skill_gaps?: string[];
    improvement_areas?: string[];
    interviewer_expectation_missed?: string[];
    optimal_solution?: string;
    improved_code?: string;
    room_metrics?: SessionMetricMap;
    speech_feedback?: {
        filler_count: number;
        pace_score: number;
        communication_score: number;
        clarity_score: number;
        summary: string;
        tips: string[];
        source?: string;
        pyclarity_used?: boolean;
    };
}

interface RoomSummary {
    session_kind: 'live_room';
    readiness_score: number;
    metrics: SessionMetricMap;
    presence_alerts: string[];
    is_completed?: boolean;
    completed_questions?: number;
    expected_questions?: number;
}

interface InterviewReport {
    role: string;
    domain: string;
    level: string;
    generated_at: string;
    readiness_score: number;
    metrics: SessionMetricMap;
    strengths: string[];
    improvements: string[];
    coaching_tips: string[];
    weak_areas: string[];
    mistakes_made: string[];
    skill_gaps: string[];
    improvement_focus: string[];
    interviewer_expectations: string[];
    answer_count: number;
    coding_rounds: number;
    presence_alerts: string[];
    readiness_trend: number[];
}

interface InterviewRoomState {
    role?: string;
    domain?: string;
    level?: string;
    codingLanguage?: string;
    result?: AnalysisResult | null;
}

interface MediaPipeModels {
    faceLandmarker: any;
    poseLandmarker: any;
}

const INTERVIEW_ROOM_STORAGE_KEY = 'eduzyniq_interview_room_config';
const INTERVIEW_ROOM_SESSION_STORAGE_KEY = 'eduzyniq_interview_room_session';

interface PersistedInterviewRoomSession {
    codingLanguage?: string;
    mockPlan?: InterviewPlanItem[];
    mockIndex?: number;
    mockQuestions?: string[];
    currentQuestion?: QuestionPayload | null;
    userAnswer?: string;
    userApproach?: string;
    userCode?: string;
    codingPhase?: 'approach' | 'code' | 'results';
    testResults?: any;
    codingEval?: any;
    evaluations?: AnswerSnapshot[];
    roomStarted?: boolean;
    roomComplete?: boolean;
    timerSeconds?: number;
    viewTab?: 'metrics' | 'coaching';
    alerts?: string[];
    speechInterimText?: string;
    speechError?: string;
    presenceStatus?: string;
    reportBundle?: { report: InterviewReport; summary: RoomSummary } | null;
    liveMetrics?: SessionMetricMap;
    metricsHistory?: SessionMetricMap[];
    presenceAlerts?: string[];
    answerStartedAt?: number;
}

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const uniqueItems = (values: Array<string | undefined>, limit: number) => Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())))).slice(0, limit);
const uniqueFlattened = (values: Array<string[] | undefined>, limit: number) => Array.from(new Set(values.flatMap(value => value || []).map(item => item.trim()).filter(Boolean))).slice(0, limit);
const titleCase = (value: string) => value.replace(/(^|\s)\w/g, match => match.toUpperCase());
const toStringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
const toExampleArray = (value: unknown): Array<{ input: string; output: string; explanation?: string }> => (
    Array.isArray(value)
        ? value.filter((item): item is { input: string; output: string; explanation?: string } => (
            Boolean(item)
            && typeof item === 'object'
            && typeof (item as any).input === 'string'
            && typeof (item as any).output === 'string'
        ))
        : []
);
const normalizeQuestionPayload = (raw: any): QuestionPayload => ({
    question: typeof raw?.question === 'string' ? raw.question : 'Interview question unavailable.',
    category: raw?.category === 'coding' ? 'coding' : (raw?.category || 'technical'),
    difficulty: typeof raw?.difficulty === 'string' ? raw.difficulty : undefined,
    topic: typeof raw?.topic === 'string' ? raw.topic : undefined,
    question_family: typeof raw?.question_family === 'string' ? raw.question_family : undefined,
    interviewer_focus: toStringArray(raw?.interviewer_focus),
    expected_key_points: toStringArray(raw?.expected_key_points),
    problem_title: typeof raw?.problem_title === 'string' ? raw.problem_title : undefined,
    problem_statement: typeof raw?.problem_statement === 'string' ? raw.problem_statement : undefined,
    constraints: toStringArray(raw?.constraints),
    examples: toExampleArray(raw?.examples),
    test_cases: Array.isArray(raw?.test_cases) ? raw.test_cases : [],
    hints: toStringArray(raw?.hints),
    starter_template_note: typeof raw?.starter_template_note === 'string' ? raw.starter_template_note : undefined,
    function_signature: raw?.function_signature && typeof raw.function_signature === 'object' ? raw.function_signature : undefined,
});

const buildReport = (
    role: string,
    domain: string,
    level: string,
    evaluations: AnswerSnapshot[],
    metricsHistory: SessionMetricMap[],
    presenceAlerts: string[],
) => {
    const finalMetrics: SessionMetricMap = {
        eye_contact: Math.round(average(metricsHistory.map(item => item.eye_contact))),
        confidence: Math.round(average(metricsHistory.map(item => item.confidence))),
        speech_clarity: Math.round(average(metricsHistory.map(item => item.speech_clarity))),
        body_language: Math.round(average(metricsHistory.map(item => item.body_language))),
        posture: Math.round(average(metricsHistory.map(item => item.posture))),
        expression: Math.round(average(metricsHistory.map(item => item.expression))),
        communication: Math.round(average(metricsHistory.map(item => item.communication))),
        readiness: Math.round(average(metricsHistory.map(item => item.readiness))),
    };

    const strengths = Array.from(new Set(
        evaluations
            .map(item => item.strengths)
            .filter((value): value is string => Boolean(value))
    )).slice(0, 4);

    const improvements = Array.from(new Set(
        evaluations
            .map(item => item.weaknesses)
            .filter((value): value is string => Boolean(value))
    )).slice(0, 4);

    const weakAreas = Array.from(new Set(
        evaluations.flatMap(item => item.weak_areas || [])
    )).slice(0, 8);

    const mistakesMade = uniqueFlattened(evaluations.map(item => item.mistakes_made), 8);
    const skillGaps = uniqueFlattened(evaluations.map(item => item.skill_gaps), 8);
    const improvementFocus = uniqueFlattened(evaluations.map(item => item.improvement_areas), 8);
    const interviewerExpectations = uniqueFlattened(evaluations.map(item => item.interviewer_expectation_missed), 8);

    const coachingTips = Array.from(new Set([
        ...evaluations.map(item => item.advice).filter((value): value is string => Boolean(value)),
        ...(finalMetrics.eye_contact < 60 ? ['Lift the webcam to eye level and answer while focusing near the lens.'] : []),
        ...(finalMetrics.posture < 60 ? ['Sit tall with shoulders relaxed and both feet planted to project confidence.'] : []),
        ...(finalMetrics.expression < 55 ? ['Use a calm neutral-to-positive expression so your answers feel more engaged.'] : []),
        ...(finalMetrics.communication < 60 ? ['Use STAR or Problem-Action-Result to keep each answer easy to follow.'] : []),
    ])).slice(0, 6);

    const readinessTrend = metricsHistory.map(item => item.readiness);

    const report: InterviewReport = {
        role,
        domain,
        level,
        generated_at: new Date().toISOString(),
        readiness_score: finalMetrics.readiness,
        metrics: finalMetrics,
        strengths,
        improvements,
        coaching_tips: coachingTips,
        weak_areas: weakAreas,
        mistakes_made: mistakesMade,
        skill_gaps: skillGaps,
        improvement_focus: improvementFocus,
        interviewer_expectations: interviewerExpectations,
        answer_count: evaluations.length,
        coding_rounds: evaluations.filter(item => item.type === 'coding').length,
        presence_alerts: Array.from(new Set(presenceAlerts)),
        readiness_trend: readinessTrend,
    };

        const summary: RoomSummary = {
            session_kind: 'live_room',
            readiness_score: report.readiness_score,
            metrics: finalMetrics,
            presence_alerts: report.presence_alerts,
            is_completed: true,
            completed_questions: evaluations.length,
            expected_questions: evaluations.length,
        };

    return { report, summary };
};

const getMetricColor = (value: number) => value >= 70 ? '#10b981' : value >= 50 ? '#f59e0b' : '#ef4444';
const panelTextPrimary = '#e5eef8';
const panelTextSecondary = '#a9b8c9';
const panelTextMuted = '#8a9aae';

const InterviewRoom = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { isMobile, isTablet } = useResponsive();
    const isCompact = isMobile || isTablet;
    const persistedConfig = useMemo(() => {
        try {
            const saved = localStorage.getItem(INTERVIEW_ROOM_STORAGE_KEY);
            return saved ? JSON.parse(saved) as InterviewRoomState : null;
        } catch {
            return null;
        }
    }, []);
    const persistedSession = useMemo(() => {
        try {
            const saved = localStorage.getItem(INTERVIEW_ROOM_SESSION_STORAGE_KEY);
            if (!saved) return null;
            const parsed = JSON.parse(saved) as PersistedInterviewRoomSession;
            return {
                ...parsed,
                currentQuestion: parsed.currentQuestion ? normalizeQuestionPayload(parsed.currentQuestion) : null,
                mockPlan: Array.isArray(parsed.mockPlan) ? parsed.mockPlan : [],
                mockQuestions: Array.isArray(parsed.mockQuestions) ? parsed.mockQuestions : [],
                evaluations: Array.isArray(parsed.evaluations) ? parsed.evaluations : [],
                alerts: Array.isArray(parsed.alerts) ? parsed.alerts : [],
                metricsHistory: Array.isArray(parsed.metricsHistory) ? parsed.metricsHistory : [],
                presenceAlerts: Array.isArray(parsed.presenceAlerts) ? parsed.presenceAlerts : [],
            } as PersistedInterviewRoomSession;
        } catch {
            return null;
        }
    }, []);
    const config = ((location.state as InterviewRoomState | null) || persistedConfig || {}) as InterviewRoomState;

    const localProfile = (() => {
        try {
            return JSON.parse(localStorage.getItem('eduzyniq_profile') || '{}');
        } catch {
            return {};
        }
    })();
    const domain = config.domain || localProfile?.domain || '';
    const role = config.role || getRoleForDomain(domain) || '';
    const level = config.level || 'Junior';
    const resumeResult = config.result || null;

    const [codingLanguage, setCodingLanguage] = useState(persistedSession?.codingLanguage || config.codingLanguage || 'python');
    const [mockPlan, setMockPlan] = useState<InterviewPlanItem[]>(persistedSession?.mockPlan || []);
    const [mockIndex, setMockIndex] = useState(persistedSession?.mockIndex || 0);
    const [mockQuestions, setMockQuestions] = useState<string[]>(persistedSession?.mockQuestions || []);
    const [currentQuestion, setCurrentQuestion] = useState<QuestionPayload | null>(persistedSession?.currentQuestion || null);
    const [userAnswer, setUserAnswer] = useState(persistedSession?.userAnswer || '');
    const [userApproach, setUserApproach] = useState(persistedSession?.userApproach || '');
    const [userCode, setUserCode] = useState(persistedSession?.userCode || '');
    const [codingPhase, setCodingPhase] = useState<'approach' | 'code' | 'results'>(persistedSession?.codingPhase || 'approach');
    const [testResults, setTestResults] = useState<any>(persistedSession?.testResults || null);
    const [codingEval, setCodingEval] = useState<any>(persistedSession?.codingEval || null);
    const [evaluations, setEvaluations] = useState<AnswerSnapshot[]>(persistedSession?.evaluations || []);
    const [isLoading, setIsLoading] = useState(false);
    const [roomReady, setRoomReady] = useState(false);
    const [modelsReady, setModelsReady] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [roomStarted, setRoomStarted] = useState(Boolean(persistedSession?.roomStarted));
    const [roomComplete, setRoomComplete] = useState(Boolean(persistedSession?.roomComplete));
    const [timerSeconds, setTimerSeconds] = useState(persistedSession?.timerSeconds || 0);
    const [viewTab, setViewTab] = useState<'metrics' | 'coaching'>(persistedSession?.viewTab || 'metrics');
    const [alerts, setAlerts] = useState<string[]>(persistedSession?.alerts || []);
    const [speechInterimText, setSpeechInterimText] = useState(persistedSession?.speechInterimText || '');
    const [speechError, setSpeechError] = useState(persistedSession?.speechError || '');
    const [speechSupported, setSpeechSupported] = useState(false);
    const [presenceStatus, setPresenceStatus] = useState(persistedSession?.presenceStatus || 'Preparing camera…');
    const [reportBundle, setReportBundle] = useState<{ report: InterviewReport; summary: RoomSummary } | null>(persistedSession?.reportBundle || null);
    const [liveMetrics, setLiveMetrics] = useState<SessionMetricMap>(persistedSession?.liveMetrics || {
        eye_contact: 0,
        confidence: 0,
        speech_clarity: 0,
        body_language: 0,
        posture: 0,
        expression: 0,
        communication: 0,
        readiness: 0,
    });

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const reportRef = useRef<HTMLDivElement | null>(null);
    const recognitionRef = useRef<any>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const modelsRef = useRef<MediaPipeModels | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const frequencyRef = useRef<any>(null);
    const metricsHistoryRef = useRef<SessionMetricMap[]>(persistedSession?.metricsHistory || []);
    const presenceAlertsRef = useRef<string[]>(persistedSession?.presenceAlerts || []);
    const answerStartedAtRef = useRef<number>(persistedSession?.answerStartedAt || Date.now());
    const speechCommittedRef = useRef(persistedSession?.userAnswer || '');
    const speechDraftRef = useRef('');
    const speechDetectedRef = useRef(false);
    const speechPeakVolumeRef = useRef(0);

    const stopMediaResources = useCallback(() => {
        recognitionRef.current?.stop?.();
        window.speechSynthesis?.cancel?.();
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.srcObject = null;
        }
        analyserRef.current = null;
        frequencyRef.current = null;
        audioContextRef.current?.close?.().catch(() => undefined);
        audioContextRef.current = null;
        setIsListening(false);
    }, []);

    const progressLabel = useMemo(() => `${Math.min(mockIndex + 1, mockPlan.length)} / ${mockPlan.length || 0}`, [mockIndex, mockPlan.length]);
    const codingStarterTemplate = currentQuestion?.function_signature?.[codingLanguage] || '';
    const interviewerFocus = uniqueItems([
        ...toStringArray(currentQuestion?.interviewer_focus),
        ...toStringArray(currentQuestion?.expected_key_points),
    ], 6);
    const codingExamples = toExampleArray(currentQuestion?.examples);
    const codingConstraints = toStringArray(currentQuestion?.constraints);

    useEffect(() => {
        if (!config.role || !config.domain) return;
        localStorage.setItem(INTERVIEW_ROOM_STORAGE_KEY, JSON.stringify({
            role: config.role,
            domain: config.domain,
            level: config.level,
            codingLanguage: config.codingLanguage,
            result: config.result,
        }));
    }, [config.role, config.domain, config.level, config.codingLanguage, config.result]);

    useEffect(() => {
        if (!config.role || !config.domain) return;
        const sessionState: PersistedInterviewRoomSession = {
            codingLanguage,
            mockPlan,
            mockIndex,
            mockQuestions,
            currentQuestion,
            userAnswer,
            userApproach,
            userCode,
            codingPhase,
            testResults,
            codingEval,
            evaluations,
            roomStarted,
            roomComplete,
            timerSeconds,
            viewTab,
            alerts,
            speechInterimText,
            speechError,
            presenceStatus,
            reportBundle,
            liveMetrics,
            metricsHistory: metricsHistoryRef.current,
            presenceAlerts: presenceAlertsRef.current,
            answerStartedAt: answerStartedAtRef.current,
        };
        localStorage.setItem(INTERVIEW_ROOM_SESSION_STORAGE_KEY, JSON.stringify(sessionState));
    }, [
        config.role,
        config.domain,
        codingLanguage,
        mockPlan,
        mockIndex,
        mockQuestions,
        currentQuestion,
        userAnswer,
        userApproach,
        userCode,
        codingPhase,
        testResults,
        codingEval,
        evaluations,
        roomStarted,
        roomComplete,
        timerSeconds,
        viewTab,
        alerts,
        speechInterimText,
        speechError,
        presenceStatus,
        reportBundle,
        liveMetrics,
    ]);

    const blendMetrics = (incoming: Partial<SessionMetricMap>) => {
        setLiveMetrics(previous => {
            const speechClarity = currentQuestion?.category === 'coding'
                ? previous.speech_clarity
                : Math.round(incoming.speech_clarity ?? previous.speech_clarity);

            const merged = {
                eye_contact: Math.round(incoming.eye_contact != null ? ((previous.eye_contact * 0.45) + (incoming.eye_contact * 0.55)) : previous.eye_contact),
                confidence: Math.round(incoming.confidence != null ? ((previous.confidence * 0.4) + (incoming.confidence * 0.6)) : previous.confidence),
                speech_clarity: speechClarity,
                body_language: Math.round(incoming.body_language != null ? ((previous.body_language * 0.45) + (incoming.body_language * 0.55)) : previous.body_language),
                posture: Math.round(incoming.posture != null ? ((previous.posture * 0.45) + (incoming.posture * 0.55)) : previous.posture),
                expression: Math.round(incoming.expression != null ? ((previous.expression * 0.45) + (incoming.expression * 0.55)) : previous.expression),
                communication: Math.round(incoming.communication != null ? ((previous.communication * 0.35) + (incoming.communication * 0.65)) : previous.communication),
                readiness: 0,
            };
            merged.readiness = Math.round(clamp(
                merged.confidence * 0.35
                + merged.eye_contact * 0.15
                + merged.body_language * 0.15
                + merged.posture * 0.15
                + merged.communication * 0.20
            ));
            return merged;
        });
    };

    useEffect(() => {
        const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionAPI) {
            setSpeechSupported(false);
            return;
        }

        setSpeechSupported(true);

        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.onresult = (event: any) => {
            let finalizedChunk = '';
            let interimTranscript = '';
            for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
                const segment = event.results[index][0]?.transcript || '';
                if (event.results[index].isFinal) {
                    finalizedChunk += `${segment} `;
                } else {
                    interimTranscript += `${segment} `;
                }
            }
            const cleanedFinal = finalizedChunk.trim();
            const cleanedInterim = interimTranscript.trim();
            if (cleanedFinal || cleanedInterim) {
                speechDetectedRef.current = true;
                if (analyserRef.current && frequencyRef.current) {
                    (analyserRef.current as any).getByteFrequencyData(frequencyRef.current);
                    let total = 0;
                    for (const value of frequencyRef.current) total += value;
                    const measuredVolume = clamp(
                        (total / Math.max(frequencyRef.current.length, 1)) * 0.75,
                        0,
                        100,
                    );
                    speechPeakVolumeRef.current = Math.max(speechPeakVolumeRef.current, measuredVolume);
                }
            }
            if (cleanedFinal) {
                speechCommittedRef.current = `${speechCommittedRef.current} ${cleanedFinal}`.trim();
            }
            speechDraftRef.current = cleanedInterim;
            setSpeechInterimText(cleanedInterim);
            setUserAnswer([speechCommittedRef.current, cleanedInterim].filter(Boolean).join(' ').trim());
        };
        recognition.onstart = () => {
            setSpeechError('');
            setIsListening(true);
        };
        recognition.onerror = (event: any) => {
            setIsListening(false);
            setSpeechInterimText('');
            const code = event?.error;
            if (code === 'not-allowed' || code === 'service-not-allowed') {
                setSpeechError('Microphone permission is blocked. Allow mic access in the browser and try again.');
            } else if (code === 'no-speech') {
                setSpeechError('No speech was detected. Speak a little closer to the microphone and try again.');
            } else if (code === 'audio-capture') {
                setSpeechError('No working microphone was found for speech recognition.');
            } else {
                setSpeechError('Speech recognition stopped unexpectedly. Please try again.');
            }
        };
        recognition.onend = () => {
            setIsListening(false);
            setSpeechInterimText('');
            speechDraftRef.current = '';
            setUserAnswer(speechCommittedRef.current);
        };
        recognitionRef.current = recognition;
    }, []);

    useEffect(() => {
        if (!roomStarted || roomComplete) return undefined;
        const timer = window.setInterval(() => setTimerSeconds(value => value + 1), 1000);
        return () => window.clearInterval(timer);
    }, [roomStarted, roomComplete]);

    useEffect(() => {
        if (roomComplete) {
            stopMediaResources();
            setRoomReady(false);
            setPresenceStatus('Interview complete. Camera and microphone are off.');
            return undefined;
        }

        let mounted = true;

        const prepareRoom = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                if (!mounted) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                mediaStreamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    await videoRef.current.play().catch(() => undefined);
                }
                const AudioContextRef = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioContextRef) {
                    const audioContext = new AudioContextRef();
                    const analyser = audioContext.createAnalyser();
                    analyser.fftSize = 256;
                    const source = audioContext.createMediaStreamSource(stream);
                    source.connect(analyser);
                    audioContextRef.current = audioContext;
                    analyserRef.current = analyser;
                    frequencyRef.current = new Uint8Array(analyser.frequencyBinCount);
                }
                if (mounted) {
                    setRoomReady(true);
                    setPresenceStatus('Camera ready. We will watch for exactly one person during the interview.');
                }
            } catch {
                if (mounted) {
                    setPresenceStatus('Camera or microphone permission is required for the live room.');
                }
            }

            try {
                const vision = await import('@mediapipe/tasks-vision');
                const resolver = await vision.FilesetResolver.forVisionTasks(
                    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
                );

                const faceLandmarker = await vision.FaceLandmarker.createFromOptions(resolver, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                    },
                    runningMode: 'VIDEO',
                    numFaces: 2,
                    outputFaceBlendshapes: true,
                });

                const poseLandmarker = await vision.PoseLandmarker.createFromOptions(resolver, {
                    baseOptions: {
                        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
                    },
                    runningMode: 'VIDEO',
                    numPoses: 1,
                });

                modelsRef.current = { faceLandmarker, poseLandmarker };
                if (mounted) setModelsReady(true);
            } catch {
                if (mounted) setPresenceStatus('Camera is ready, but MediaPipe analysis could not load. Basic monitoring will still work.');
            }
        };

        prepareRoom();

        return () => {
            mounted = false;
            stopMediaResources();
        };
    }, [roomComplete, stopMediaResources]);

    useEffect(() => {
        if (!roomReady || !videoRef.current || !roomStarted || roomComplete) return undefined;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const sample = () => {
            const video = videoRef.current;
            if (!video || !ctx) return;

            canvas.width = 32;
            canvas.height = 24;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            let luminance = 0;
            for (let i = 0; i < pixels.length; i += 4) {
                luminance += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
            }
            luminance /= (pixels.length / 4);

            const nextAlerts = new Set<string>();
            let nextPresence = 'Analysis unavailable';
            let eyeContact = 0;
            let bodyLanguage = 0;
            let posture = 0;
            let expression = 0;
            let faceMeasured = false;
            let poseMeasured = false;

            if (luminance < 12) {
                nextPresence = 'Black screen detected';
                nextAlerts.add('Black screen detected');
            }

            if (modelsRef.current && video.readyState >= 2) {
                try {
                    const now = performance.now();
                    const faceResults = modelsRef.current.faceLandmarker.detectForVideo(video, now);
                    const faces = faceResults.faceLandmarks || [];

                    if (!faces.length) {
                        nextPresence = 'No person detected';
                        nextAlerts.add('No person detected');
                    } else if (faces.length > 1) {
                        nextPresence = 'Multiple people detected';
                        nextAlerts.add('Multiple people detected');
                    } else {
                        faceMeasured = true;
                        nextPresence = 'One person detected';
                        const face = faces[0];
                        const leftEye = face[33];
                        const rightEye = face[263];
                        const nose = face[1];
                        const mouthLeft = face[61];
                        const mouthRight = face[291];
                        const lipTop = face[13];
                        const lipBottom = face[14];
                        const faceCenterX = (leftEye.x + rightEye.x) / 2;
                        const noseOffset = Math.abs(nose.x - faceCenterX);
                        const eyeLevelDelta = Math.abs(leftEye.y - rightEye.y);
                        eyeContact = clamp(100 - noseOffset * 220 - eyeLevelDelta * 160 - Math.abs(faceCenterX - 0.5) * 120);

                        const smileWidth = Math.abs(mouthRight.x - mouthLeft.x);
                        const mouthOpen = Math.abs(lipBottom.y - lipTop.y);
                        const geometrySmile = clamp((smileWidth - 0.16) * 380, 0, 28);
                        const geometryEnergy = clamp((mouthOpen - 0.018) * 820, 0, 14);
                        expression = clamp(geometrySmile + geometryEnergy);

                        const blendShapes = faceResults.faceBlendshapes?.[0]?.categories || [];
                        if (blendShapes.length) {
                            const scoreMap = Object.fromEntries(blendShapes.map((item: any) => [item.categoryName, item.score]));
                            const smileScore = ((scoreMap.mouthSmileLeft || 0) + (scoreMap.mouthSmileRight || 0)) / 2;
                            const browLift = (
                                (scoreMap.browInnerUp || 0)
                                + (scoreMap.browOuterUpLeft || 0)
                                + (scoreMap.browOuterUpRight || 0)
                            ) / 3;
                            const eyeWide = ((scoreMap.eyeWideLeft || 0) + (scoreMap.eyeWideRight || 0)) / 2;
                            const jawOpen = scoreMap.jawOpen || 0;
                            const eyeSquint = ((scoreMap.eyeSquintLeft || 0) + (scoreMap.eyeSquintRight || 0)) / 2;
                            const mouthPress = ((scoreMap.mouthPressLeft || 0) + (scoreMap.mouthPressRight || 0)) / 2;
                            const expressiveBlend = clamp(
                                smileScore * 45
                                + browLift * 18
                                + eyeWide * 10
                                + jawOpen * 8
                                - eyeSquint * 8
                                - mouthPress * 10
                            );
                            expression = clamp(
                                expression * 0.35 + expressiveBlend * 0.65
                            );
                        }
                    }

                    const poseResults = modelsRef.current.poseLandmarker.detectForVideo(video, now);
                    const pose = poseResults.landmarks?.[0];
                    if (pose && faceMeasured && luminance >= 12) {
                        poseMeasured = true;
                        const leftShoulder = pose[11];
                        const rightShoulder = pose[12];
                        const leftHip = pose[23];
                        const rightHip = pose[24];
                        const nose = pose[0];
                        const shoulderSlope = Math.abs(leftShoulder.y - rightShoulder.y);
                        const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
                        const torsoCenterX = ((leftShoulder.x + rightShoulder.x) / 2 + (leftHip.x + rightHip.x) / 2) / 2;
                        posture = clamp(100 - shoulderSlope * 260 - Math.abs(nose.x - torsoCenterX) * 150);
                        bodyLanguage = clamp(shoulderWidth * 160 - shoulderSlope * 120);
                    }
                } catch {
                    nextPresence = 'Frame analysis unavailable';
                    nextAlerts.add('MediaPipe frame analysis unavailable');
                }
            } else {
                nextAlerts.add('MediaPipe models unavailable');
            }

            if (luminance < 12 || nextPresence !== 'One person detected') {
                faceMeasured = false;
                poseMeasured = false;
                eyeContact = 0;
                bodyLanguage = 0;
                posture = 0;
                expression = 0;
            }

            const speechBase = currentQuestion?.category === 'coding' ? liveMetrics.speech_clarity : liveMetrics.speech_clarity;
            const communicationBase = currentQuestion?.category === 'coding' ? 0 : liveMetrics.communication;
            const visualEvidenceAvailable = faceMeasured || poseMeasured;
            const confidence = visualEvidenceAvailable
                ? clamp((eyeContact * 0.35) + (bodyLanguage * 0.25) + (posture * 0.25) + (expression * 0.15))
                : 0;
            const readiness = clamp((confidence * 0.35) + (eyeContact * 0.15) + (bodyLanguage * 0.15) + (posture * 0.15) + (communicationBase * 0.2));

            const nextMetrics: SessionMetricMap = {
                eye_contact: Math.round(eyeContact),
                confidence: Math.round(confidence),
                speech_clarity: Math.round(speechBase),
                body_language: Math.round(bodyLanguage),
                posture: Math.round(posture),
                expression: Math.round(expression),
                communication: Math.round(communicationBase),
                readiness: Math.round(readiness),
            };

            presenceAlertsRef.current = Array.from(new Set([...presenceAlertsRef.current, ...nextAlerts]));
            setAlerts(presenceAlertsRef.current.slice(-4));
            setPresenceStatus(nextPresence);
            setLiveMetrics(nextMetrics);
            metricsHistoryRef.current.push(nextMetrics);
            if (metricsHistoryRef.current.length > 240) {
                metricsHistoryRef.current = metricsHistoryRef.current.slice(-240);
            }
        };

        const interval = window.setInterval(sample, 1300);
        return () => window.clearInterval(interval);
    }, [roomReady, roomStarted, roomComplete, liveMetrics.speech_clarity, currentQuestion?.category]);

    useEffect(() => {
        if (!roomReady || !videoRef.current || !roomStarted || roomComplete) return undefined;

        const canvas = document.createElement('canvas');
        const syncBackend = async () => {
            const video = videoRef.current;
            if (!video || video.readyState < 2) return;
            canvas.width = 320;
            canvas.height = 240;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
                const response = await apiFetch(`${API_BASE_URL}/coach/mock-interview/analyze-frame`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image_data: canvas.toDataURL('image/jpeg', 0.72) }),
                });
                const data = await response.json();
                if (Array.isArray(data.alerts) && data.alerts.length) {
                    presenceAlertsRef.current = Array.from(new Set([...presenceAlertsRef.current, ...data.alerts]));
                    setAlerts(presenceAlertsRef.current.slice(-4));
                }
                if (data.presence_status) {
                    setPresenceStatus(data.presence_status);
                }
                if (data.metrics) {
                    blendMetrics({
                        eye_contact: data.metrics.eye_contact,
                        confidence: data.metrics.confidence,
                        body_language: data.metrics.body_language,
                        posture: data.metrics.posture,
                        expression: data.metrics.expression,
                    });
                }
            } catch (error) {
                console.error(error);
            }
        };

        const interval = window.setInterval(syncBackend, 2800);
        return () => window.clearInterval(interval);
    }, [roomReady, roomStarted, roomComplete, currentQuestion?.category]);

    const startInterview = async () => {
        localStorage.removeItem(INTERVIEW_ROOM_SESSION_STORAGE_KEY);
        setIsLoading(true);
        setRoomStarted(true);
        setMockIndex(0);
        setMockQuestions([]);
        setEvaluations([]);
        metricsHistoryRef.current = [];
        presenceAlertsRef.current = [];
        setAlerts([]);
        setReportBundle(null);
        setRoomComplete(false);
        setTimerSeconds(0);
        answerStartedAtRef.current = Date.now();
        try {
            const user = JSON.parse(localStorage.getItem('eduzyniq_user') || '{}');
            const response = await apiFetch(`${API_BASE_URL}/coach/mock-interview/plan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role,
                    domain,
                    extracted_skills: resumeResult?.extracted_skills || [],
                    user_email: user.email,
                    resume_context: resumeResult ? JSON.stringify(resumeResult) : '',
                }),
            });
            const data = await response.json();
            setMockPlan(data.plan || []);
            if (data.plan?.length) {
                await fetchQuestion(data.plan[0], []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchQuestion = async (planItem: InterviewPlanItem, askedQuestions: string[]) => {
        setIsLoading(true);
        recognitionRef.current?.stop?.();
        setIsListening(false);
        setUserAnswer('');
        setUserApproach('');
        setUserCode('');
        setSpeechInterimText('');
        setSpeechError('');
        speechCommittedRef.current = '';
        speechDraftRef.current = '';
        speechDetectedRef.current = false;
        speechPeakVolumeRef.current = 0;
        setLiveMetrics(previous => ({ ...previous, speech_clarity: 0 }));
        setCodingPhase('approach');
        setTestResults(null);
        setCodingEval(null);
        try {
            const user = JSON.parse(localStorage.getItem('eduzyniq_user') || '{}');
            const response = await apiFetch(`${API_BASE_URL}/coach/mock-interview/question`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role,
                    domain,
                    plan_item: planItem,
                    asked_questions: askedQuestions,
                    difficulty: planItem.difficulty,
                    user_email: user.email,
                    resume_context: resumeResult ? JSON.stringify(resumeResult) : '',
                }),
            });
            const data = normalizeQuestionPayload(await response.json());
            answerStartedAtRef.current = Date.now();
            setCurrentQuestion(data);
            setMockQuestions([...askedQuestions, data.question]);
            if ('speechSynthesis' in window && data.question && data.category !== 'coding') {
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(data.question);
                utterance.lang = 'en-US';
                window.speechSynthesis.speak(utterance);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (currentQuestion?.category !== 'coding') return;
        if (!codingStarterTemplate.trim()) return;
        setUserCode(previous => previous.trim() ? previous : codingStarterTemplate);
    }, [currentQuestion, codingStarterTemplate]);

    const toggleListening = () => {
        if (currentQuestion?.category === 'coding') return;
        if (!speechSupported || !recognitionRef.current) {
            setSpeechError('This browser does not support live speech-to-text here. Try Chrome or Edge.');
            return;
        }
        if (isListening) {
            recognitionRef.current?.stop?.();
            setIsListening(false);
            return;
        }
        try {
            speechCommittedRef.current = userAnswer.trim();
            speechDraftRef.current = '';
            recognitionRef.current?.start?.();
            setSpeechError('');
        } catch {
            recognitionRef.current?.stop?.();
            window.setTimeout(() => {
                try {
                    speechCommittedRef.current = userAnswer.trim();
                    speechDraftRef.current = '';
                    recognitionRef.current?.start?.();
                    setSpeechError('');
                } catch {
                    setIsListening(false);
                    setSpeechError('Could not start speech recognition. Please try again.');
                }
            }, 150);
        }
    };

    const skipQuestion = async () => {
        recognitionRef.current?.stop?.();
        setIsListening(false);
        setSpeechInterimText('');
        setSpeechError('');
        speechCommittedRef.current = '';
        speechDraftRef.current = '';
        speechDetectedRef.current = false;
        speechPeakVolumeRef.current = 0;

        const nextIndex = mockIndex + 1;
        if (nextIndex >= mockPlan.length) {
            await completeRoom(evaluations);
            return;
        }

        setMockIndex(nextIndex);
        await fetchQuestion(mockPlan[nextIndex], mockQuestions);
    };

    const getVolumeScore = () => {
        if (!analyserRef.current || !frequencyRef.current) return 0;
        (analyserRef.current as any).getByteFrequencyData(frequencyRef.current);
        let total = 0;
        for (const value of frequencyRef.current) total += value;
        const level = total / Math.max(frequencyRef.current.length, 1);
        return clamp(level * 0.75, 0, 100);
    };

    const completeRoom = async (nextEvaluations: AnswerSnapshot[]) => {
        const { report, summary } = buildReport(role, domain, level, nextEvaluations, metricsHistoryRef.current, presenceAlertsRef.current);
        stopMediaResources();
        setReportBundle({ report, summary });
        setRoomComplete(true);
        setRoomStarted(false);
        try {
            const user = JSON.parse(localStorage.getItem('eduzyniq_user') || '{}');
            await apiFetch(`${API_BASE_URL}/coach/mock-interview/save-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_email: user.email,
                    role,
                    domain,
                    language: codingLanguage,
                    evaluations: nextEvaluations,
                    room_summary: summary,
                    report,
                    expected_question_count: mockPlan.length,
                }),
            });
        } catch (error) {
            console.error(error);
        }
    };

    const submitStandardAnswer = async () => {
        if (!currentQuestion) return;
        recognitionRef.current?.stop?.();
        setIsListening(false);
        setIsLoading(true);
        try {
            const volumeScore = Math.max(getVolumeScore(), speechPeakVolumeRef.current);
            const durationSeconds = Math.max(1, (Date.now() - answerStartedAtRef.current) / 1000);
            const speechWasDetected = speechDetectedRef.current;
            const speechResponse = await apiFetch(`${API_BASE_URL}/coach/mock-interview/analyze-speech`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transcript: userAnswer,
                    volume_score: volumeScore,
                    duration_seconds: durationSeconds,
                    speech_detected: speechWasDetected,
                }),
            });
            const backendSpeech = await speechResponse.json();
            const speechFeedback = {
                filler_count: backendSpeech.filler_count ?? 0,
                pace_score: Math.round(backendSpeech.pace_score ?? 0),
                communication_score: Math.round(backendSpeech.communication_score ?? 0),
                clarity_score: Math.round(backendSpeech.clarity_score ?? 0),
                summary: backendSpeech.summary || 'Speech was not measured.',
                tips: backendSpeech.tips || [],
                source: backendSpeech.source || 'not_measured',
                speech_detected: backendSpeech.speech_detected === true,
                pyclarity_used: backendSpeech.pyclarity_used || false,
            };
            const evaluationResponse = await apiFetch(`${API_BASE_URL}/coach/mock-interview/evaluate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        role,
                        domain,
                        question: currentQuestion.question,
                        answer: userAnswer,
                        expected_key_points: currentQuestion.expected_key_points || [],
                        interviewer_focus: currentQuestion.interviewer_focus || [],
                        live_metrics: liveMetrics,
                        speech_feedback: speechFeedback,
                    }),
                });
            const evaluation = await evaluationResponse.json();
            if (speechFeedback.speech_detected) {
                blendMetrics({
                    speech_clarity: speechFeedback.clarity_score,
                    communication: speechFeedback.communication_score,
                });
            } else {
                blendMetrics({ speech_clarity: 0 });
            }
            const snapshot: AnswerSnapshot = {
                ...evaluation,
                question: currentQuestion.question,
                answer: userAnswer,
                type: 'standard',
                category: currentQuestion.category,
                difficulty: currentQuestion.difficulty,
                topic: currentQuestion.topic,
                question_family: currentQuestion.question_family,
                room_metrics: {
                    ...liveMetrics,
                    speech_clarity: speechFeedback.clarity_score,
                    communication: speechFeedback.speech_detected ? speechFeedback.communication_score : liveMetrics.communication,
                    readiness: speechFeedback.speech_detected
                        ? Math.round((liveMetrics.readiness + speechFeedback.communication_score) / 2)
                        : liveMetrics.readiness,
                },
                speech_feedback: speechFeedback,
            };
            const nextEvaluations = [...evaluations, snapshot];
            setEvaluations(nextEvaluations);
            const nextIndex = mockIndex + 1;
            if (nextIndex >= mockPlan.length) {
                await completeRoom(nextEvaluations);
            } else {
                setMockIndex(nextIndex);
                await fetchQuestion(mockPlan[nextIndex], mockQuestions);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const runTests = async () => {
        if (!currentQuestion?.test_cases?.length) return;
        setIsLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/coach/mock-interview/run-tests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: userCode,
                    language: codingLanguage,
                    test_cases: currentQuestion.test_cases,
                }),
            });
            setTestResults(await response.json());
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const submitCodingAnswer = async () => {
        if (!currentQuestion) return;
        recognitionRef.current?.stop?.();
        setIsListening(false);
        setIsLoading(true);
        try {
            const response = await apiFetch(`${API_BASE_URL}/coach/mock-interview/evaluate-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role,
                    domain,
                    question: currentQuestion.question,
                    approach_text: userApproach,
                    code: userCode,
                    language: codingLanguage,
                    test_cases: currentQuestion.test_cases || [],
                }),
            });
            const evaluation = await response.json();
            setCodingEval(evaluation);
            setCodingPhase('results');
            const snapshot: AnswerSnapshot = {
                ...evaluation,
                question: currentQuestion.question,
                answer: userApproach || userCode,
                approach_text: userApproach,
                code: userCode,
                type: 'coding',
                category: currentQuestion.category,
                difficulty: currentQuestion.difficulty,
                topic: currentQuestion.topic,
                question_family: currentQuestion.question_family,
                room_metrics: liveMetrics,
            };
            const nextEvaluations = [...evaluations, snapshot];
            setEvaluations(nextEvaluations);
            const nextIndex = mockIndex + 1;
            if (nextIndex >= mockPlan.length) {
                await completeRoom(nextEvaluations);
            } else {
                setMockIndex(nextIndex);
                await fetchQuestion(mockPlan[nextIndex], mockQuestions);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    const exportPdf = async () => {
        if (!reportRef.current || !reportBundle) return;
        const canvas = await html2canvas(reportRef.current, { backgroundColor: '#08121c', scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'pt', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = (canvas.height * pageWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
        pdf.save(`Interview_Report_${role.replace(/\s+/g, '_')}.pdf`);
    };

    const metricRows = [
        ['Eye Contact', liveMetrics.eye_contact],
        ['Confidence', liveMetrics.confidence],
        ['Speech Clarity', currentQuestion?.category === 'coding' ? liveMetrics.speech_clarity : liveMetrics.speech_clarity],
        ['Body Language', liveMetrics.body_language],
        ['Posture', liveMetrics.posture],
        ['Expression', liveMetrics.expression],
        ['Communication', liveMetrics.communication],
    ] as const;

    if (!config.role && !config.domain) {
        return (
            <div className="container fade-in" style={{ padding: '3rem 0' }}>
                <div className="glass-card" style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto', textAlign: 'center' }}>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 900 }}>Interview room needs setup details first</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.75rem', lineHeight: 1.7 }}>
                        Open the Interview Coach, choose the role/domain, and then launch the live room from there so we can personalise the questions and report.
                    </p>
                    <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => navigate('/assistant')}>
                        Back to Assistant
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="container fade-in" style={{ maxWidth: '1500px', paddingBottom: '3rem' }}>
            <div className="flex items-center justify-between" style={{ margin: '1rem 0 1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h1 style={{ fontSize: '1.9rem', fontWeight: 900 }}>AI Interview Room</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                        {role} · {domain} · {level}
                    </p>
                </div>
                <div className="flex items-center gap-md">
                    <span className="badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', borderColor: 'rgba(16,185,129,0.25)' }}>
                        LIVE {String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:{String(timerSeconds % 60).padStart(2, '0')}
                    </span>
                    <button className="btn btn-secondary" onClick={() => navigate('/assistant')}>Exit Room</button>
                </div>
            </div>

            {!roomStarted && !roomComplete && (
                <div className="glass-card" style={{ padding: '1.5rem', marginBottom: '1.5rem', border: '1px solid rgba(56,189,248,0.18)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1.2fr 1fr', gap: '1.5rem' }}>
                        <div>
                            <p style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem' }}>Room readiness checklist</p>
                            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                                This room will ask personalised interview questions, watch for one person only on camera, pause speech scoring during coding rounds, and produce an interview-readiness report at the end.
                            </p>
                            <div className="flex-col gap-sm" style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
                                <span>• Webcam and microphone should be enabled.</span>
                                <span>• Sit so your shoulders and head are visible.</span>
                                <span>• Keep one person in frame for the full interview.</span>
                                <span>• Resume-based questions will use your Interview Coach analysis when available.</span>
                            </div>
                            <button className="btn btn-primary" style={{ marginTop: '1.25rem' }} disabled={!roomReady} onClick={startInterview}>
                                {isLoading ? 'Starting…' : 'Start Live Interview'}
                            </button>
                        </div>
                        <div style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(8,18,28,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '1px' }}>System status</p>
                            <div className="flex-col gap-sm" style={{ marginTop: '1rem', fontSize: '0.92rem', color: panelTextSecondary }}>
                                <span>Camera & mic: {roomReady ? 'Ready' : 'Waiting for permission'}</span>
                                <span>MediaPipe analysis: {modelsReady ? 'Ready' : 'Loading / fallback mode'}</span>
                                <span>Resume context: {resumeResult ? 'Loaded' : 'No saved analysis passed in'}</span>
                                <span>Presence rule: exactly one person allowed</span>
                            </div>
                            <p style={{ marginTop: '1rem', fontSize: '0.82rem', color: panelTextPrimary }}>{presenceStatus}</p>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : '1.8fr 0.9fr', gap: '1.25rem' }} className="interview-room-grid">
                <div className="glass-card" style={{ padding: '1rem', background: '#07111a' }}>
                    <div style={{ position: 'relative', borderRadius: '28px', overflow: 'hidden', minHeight: '440px', background: 'linear-gradient(180deg, #101827 0%, #07111a 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', minHeight: '440px', objectFit: 'cover', transform: 'scaleX(-1)' }} />

                        <div style={{ position: 'absolute', inset: '18px 18px auto 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div className="badge" style={{ background: 'rgba(8,15,22,0.88)', color: '#f8fafc', borderColor: 'rgba(255,255,255,0.12)' }}>
                                LIVE ROOM
                            </div>
                            <div className="badge" style={{ background: 'rgba(8,15,22,0.88)', color: '#f8fafc', borderColor: 'rgba(255,255,255,0.12)' }}>
                                {presenceStatus}
                            </div>
                        </div>

                        {alerts.length > 0 && (
                            <div style={{ position: 'absolute', top: '64px', right: '18px', display: 'grid', gap: '0.45rem', maxWidth: '280px' }}>
                                {alerts.map(alert => (
                                    <div key={alert} style={{ padding: '0.65rem 0.8rem', borderRadius: '14px', background: 'rgba(239,68,68,0.16)', color: '#fecaca', border: '1px solid rgba(239,68,68,0.28)', fontSize: '0.78rem', fontWeight: 700 }}>
                                        {alert}
                                    </div>
                                ))}
                            </div>
                        )}

                        {currentQuestion && roomStarted && !roomComplete && (
                            <div style={{ position: 'absolute', left: '22px', right: '22px', bottom: '22px', padding: '1.25rem 1.35rem', borderRadius: '24px', background: 'rgba(8,15,22,0.78)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <div className="flex items-center justify-between" style={{ gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                    <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                        <span className="badge" style={{ background: 'rgba(99,102,241,0.2)', color: '#c7d2fe', borderColor: 'rgba(99,102,241,0.3)' }}>
                                            {currentQuestion.question_family || (currentQuestion.category === 'coding' ? 'Coding Challenge' : 'Interview Question')}
                                        </span>
                                        {currentQuestion.difficulty && (
                                            <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#bbf7d0', borderColor: 'rgba(16,185,129,0.24)' }}>
                                                {currentQuestion.difficulty} level
                                            </span>
                                        )}
                                        {currentQuestion.topic && (
                                            <span className="badge" style={{ background: 'rgba(56,189,248,0.14)', color: '#bae6fd', borderColor: 'rgba(56,189,248,0.2)' }}>
                                                {currentQuestion.topic}
                                            </span>
                                        )}
                                    </div>
                                    <span className="badge" style={{ background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.12)' }}>
                                        {progressLabel}
                                    </span>
                                </div>
                                {currentQuestion.category === 'coding' && currentQuestion.problem_title ? (
                                    <h3 style={{ fontSize: '1.2rem', color: '#f8fafc', fontWeight: 900, marginBottom: '0.55rem' }}>
                                        {currentQuestion.problem_title}
                                    </h3>
                                ) : null}
                                <p style={{ fontSize: '1.05rem', color: '#f8fafc', lineHeight: 1.65 }}>
                                    {currentQuestion.problem_statement || currentQuestion.question}
                                </p>
                                {interviewerFocus.length > 0 && (
                                    <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
                                        {interviewerFocus.map(item => (
                                            <span key={item} className="badge" style={{ background: 'rgba(255,255,255,0.06)', color: '#dbeafe', borderColor: 'rgba(255,255,255,0.12)' }}>
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {roomStarted && !roomComplete && (
                        <div className="glass-card" style={{ marginTop: '1rem', padding: '1.25rem', background: 'rgba(255,255,255,0.02)' }}>
                            {!currentQuestion ? (
                                <p style={{ color: 'var(--text-secondary)' }}>Generating your first question…</p>
                            ) : currentQuestion.category === 'coding' ? (
                                <div className="flex-col gap-md">
                                    <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                                        <p style={{ fontWeight: 800 }}>Coding round mode</p>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            Speech clarity is paused during coding. Confidence, posture, and body language still update live.
                                        </span>
                                    </div>

                                    <div style={{ padding: '1rem', borderRadius: '16px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.16)' }}>
                                        <div className="flex items-center justify-between" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                                            <div>
                                                <p style={{ fontSize: '0.78rem', fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase' }}>Problem statement</p>
                                                <p style={{ marginTop: '0.35rem', fontSize: '1.05rem', color: '#eff6ff', fontWeight: 800 }}>
                                                    {currentQuestion.problem_title || 'Coding challenge'}
                                                </p>
                                            </div>
                                            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                                {currentQuestion.difficulty && <span className="badge">{currentQuestion.difficulty}</span>}
                                                {currentQuestion.topic && <span className="badge">{currentQuestion.topic}</span>}
                                            </div>
                                        </div>
                                        <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                                            {currentQuestion.problem_statement || currentQuestion.question}
                                        </p>
                                        {codingConstraints.length ? (
                                            <div className="flex-col gap-xs" style={{ marginTop: '0.85rem', color: '#cbd5e1' }}>
                                                <p style={{ fontSize: '0.76rem', fontWeight: 800, color: '#bfdbfe', textTransform: 'uppercase' }}>Constraints</p>
                                                {codingConstraints.map(item => <span key={item}>• {item}</span>)}
                                            </div>
                                        ) : null}
                                    </div>

                                    {interviewerFocus.length > 0 && (
                                        <div style={{ padding: '1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                            <p style={{ fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>What interviewer is looking for</p>
                                            <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginTop: '0.7rem' }}>
                                                {interviewerFocus.map(item => (
                                                    <span key={item} className="badge" style={{ background: 'rgba(99,102,241,0.12)', color: '#c7d2fe', borderColor: 'rgba(99,102,241,0.18)' }}>
                                                        {item}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {codingExamples.length ? (
                                        <div className="flex-col gap-sm">
                                            {codingExamples.map((example, index) => (
                                                <div key={`${example.input}-${index}`} style={{ padding: '0.9rem 1rem', borderRadius: '14px', background: '#0f172a', border: '1px solid rgba(148,163,184,0.18)', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.82rem', color: '#e2e8f0' }}>
                                                    Input: {example.input} | Output: {example.output}
                                                    {example.explanation ? ` | ${example.explanation}` : ''}
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}

                                    <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                        {(['approach', 'code', 'results'] as const).map(phase => (
                                            <button key={phase} className={codingPhase === phase ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setCodingPhase(phase)} disabled={phase === 'results' && !codingEval}>
                                                {phase === 'approach' ? 'Explain Approach' : phase === 'code' ? 'Write Code' : 'Results'}
                                            </button>
                                        ))}
                                    </div>

                                    {codingPhase === 'approach' && (
                                        <div className="flex-col gap-sm">
                                            <textarea className="input-field" value={userApproach} onChange={event => setUserApproach(event.target.value)} style={{ minHeight: '130px', padding: '1rem' }} placeholder="Explain how you will solve this problem before you start coding." />
                                            <button className="btn btn-primary" disabled={userApproach.trim().length < 12} onClick={() => setCodingPhase('code')}>Continue to Code</button>
                                        </div>
                                    )}

                                    {codingPhase === 'code' && (
                                        <div className="flex-col gap-sm">
                                            <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                                                <p style={{ fontWeight: 700 }}>Solution editor</p>
                                                <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                                    <select className="input-field" style={{ width: 'auto', padding: '0.55rem 0.85rem' }} value={codingLanguage} onChange={event => setCodingLanguage(event.target.value)}>
                                                        {['python', 'javascript', 'java', 'cpp', 'go'].map(language => <option key={language} value={language}>{language.toUpperCase()}</option>)}
                                                    </select>
                                                    <button className="btn btn-secondary" type="button" onClick={() => setUserCode(codingStarterTemplate)} disabled={!codingStarterTemplate}>
                                                        Use Template
                                                    </button>
                                                </div>
                                            </div>
                                            {codingStarterTemplate ? (
                                                <div style={{ padding: '0.95rem 1rem', borderRadius: '14px', background: '#0f172a', border: '1px solid rgba(148,163,184,0.18)' }}>
                                                    <p style={{ fontSize: '0.76rem', fontWeight: 800, color: '#93c5fd', textTransform: 'uppercase' }}>Starter template</p>
                                                    {currentQuestion.starter_template_note ? (
                                                        <p style={{ marginTop: '0.45rem', color: '#cbd5e1', fontSize: '0.88rem' }}>
                                                            {currentQuestion.starter_template_note}
                                                        </p>
                                                    ) : null}
                                                    <pre style={{ marginTop: '0.75rem', color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace', fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>
                                                        {codingStarterTemplate}
                                                    </pre>
                                                </div>
                                            ) : null}
                                            <textarea className="input-field" value={userCode} onChange={event => setUserCode(event.target.value)} style={{ minHeight: '220px', padding: '1rem', fontFamily: '"JetBrains Mono", monospace' }} placeholder={codingStarterTemplate || 'Write your code here'} />
                                            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                                <button className="btn btn-secondary" disabled={!userCode.trim() || isLoading} onClick={runTests}>Run Tests</button>
                                                <button className="btn btn-secondary" disabled={isLoading} onClick={skipQuestion}>Skip Question</button>
                                                <button className="btn btn-primary" disabled={!userCode.trim() || isLoading} onClick={submitCodingAnswer}>Submit Coding Round</button>
                                            </div>
                                            {testResults && (
                                                <div style={{ padding: '0.9rem 1rem', borderRadius: '14px', background: 'rgba(15,23,42,0.9)', border: '1px solid rgba(99,102,241,0.18)', color: '#cbd5e1' }}>
                                                    Passed {testResults.passed}/{testResults.total} tests.
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {codingPhase === 'results' && codingEval && (
                                        <div className="flex-col gap-sm">
                                            <div style={{ padding: '1rem', borderRadius: '14px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.22)' }}>
                                                <p style={{ fontWeight: 800, color: '#34d399' }}>Coach feedback</p>
                                                <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{codingEval.advice || codingEval.mentor_feedback}</p>
                                            </div>
                                            {codingEval.mistakes_made?.length ? (
                                                <div style={{ padding: '1rem', borderRadius: '14px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)' }}>
                                                    <p style={{ fontWeight: 800, color: '#fca5a5' }}>Mistakes made</p>
                                                    <div className="flex-col gap-xs" style={{ marginTop: '0.6rem', color: 'var(--text-secondary)' }}>
                                                        {codingEval.mistakes_made.map((item: string) => <span key={item}>• {item}</span>)}
                                                    </div>
                                                </div>
                                            ) : null}
                                            {codingEval.skill_gaps?.length ? (
                                                <div style={{ padding: '1rem', borderRadius: '14px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}>
                                                    <p style={{ fontWeight: 800, color: '#fdba74' }}>Skill gaps</p>
                                                    <div className="flex-col gap-xs" style={{ marginTop: '0.6rem', color: 'var(--text-secondary)' }}>
                                                        {codingEval.skill_gaps.map((item: string) => <span key={item}>• {item}</span>)}
                                                    </div>
                                                </div>
                                            ) : null}
                                            {codingEval.optimal_solution && (
                                                <div style={{ padding: '1rem', borderRadius: '14px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.18)' }}>
                                                    <p style={{ fontWeight: 800, color: '#a5b4fc' }}>Optimal approach</p>
                                                    <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{codingEval.optimal_solution}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="flex-col gap-md">
                                    <div style={{ padding: '1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <div className="flex items-center justify-between" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                                            <p style={{ fontWeight: 800 }}>
                                                {currentQuestion.question_family || titleCase(currentQuestion.category)}
                                            </p>
                                            {currentQuestion.difficulty ? (
                                                <span className="badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#bbf7d0', borderColor: 'rgba(16,185,129,0.24)' }}>
                                                    {currentQuestion.difficulty} level
                                                </span>
                                            ) : null}
                                        </div>
                                        {interviewerFocus.length > 0 && (
                                            <>
                                                <p style={{ marginTop: '0.7rem', fontSize: '0.76rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>What interviewer is looking for</p>
                                                <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                                                    {interviewerFocus.map(item => (
                                                        <span key={item} className="badge" style={{ background: 'rgba(99,102,241,0.12)', color: '#c7d2fe', borderColor: 'rgba(99,102,241,0.18)' }}>
                                                            {item}
                                                        </span>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <p style={{ fontWeight: 800 }}>Answer the question</p>
                                        <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                                            <button className={`btn ${isListening ? 'btn-primary' : 'btn-secondary'}`} onClick={toggleListening}>
                                                {isListening ? 'Stop Recording' : 'Speak Answer'}
                                            </button>
                                            <button className="btn btn-secondary" onClick={skipQuestion} disabled={isLoading}>
                                                Skip Question
                                            </button>
                                        </div>
                                    </div>
                                    <textarea
                                        className="input-field"
                                        value={userAnswer}
                                        onChange={event => {
                                            const nextValue = event.target.value;
                                            speechCommittedRef.current = nextValue;
                                            setUserAnswer(nextValue);
                                        }}
                                        style={{
                                            minHeight: '180px',
                                            padding: '1rem',
                                            background: isListening ? 'rgba(239,68,68,0.07)' : 'rgba(8,18,28,0.88)',
                                            color: '#f8fafc',
                                            caretColor: '#f8fafc',
                                        }}
                                        placeholder="Answer naturally. Mention the situation, your action, and the impact."
                                    />
                                    <div style={{ display: 'grid', gap: '0.55rem' }}>
                                        <span style={{ fontSize: '0.82rem', color: isListening ? '#fca5a5' : 'var(--text-muted)' }}>
                                            {isListening ? 'Listening live… your speech will appear here as you talk.' : speechSupported ? 'Tip: click Speak Answer and start talking after the mic turns on.' : 'Live speech-to-text is not supported in this browser.'}
                                        </span>
                                        {speechInterimText ? (
                                            <div style={{ padding: '0.75rem 0.9rem', borderRadius: '14px', background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.18)', color: '#bae6fd', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                                <strong style={{ color: '#7dd3fc' }}>Live transcript:</strong> {speechInterimText}
                                            </div>
                                        ) : null}
                                        {speechError ? (
                                            <div style={{ padding: '0.75rem 0.9rem', borderRadius: '14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#fecaca', fontSize: '0.9rem', lineHeight: 1.6 }}>
                                                {speechError}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center justify-between" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                            Speech scoring updates only for spoken-answer rounds.
                                        </span>
                                        <button className="btn btn-primary" disabled={!userAnswer.trim() || isLoading} onClick={submitStandardAnswer}>
                                            {isLoading ? 'Evaluating…' : 'Submit Answer'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    <div style={{ marginTop: '1.4rem' }} className="flex-col gap-md">
                        <p style={{ fontWeight: 900, color: '#e5eef8', fontSize: '1.05rem' }}>Senior interviewer notes by round</p>
                        {evaluations.map((ev, index) => (
                            <div key={`${ev.question}-${index}`} style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <div className="flex items-start justify-between" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                                    <div>
                                        <p style={{ fontSize: '0.74rem', color: panelTextMuted, fontWeight: 800, textTransform: 'uppercase' }}>Round {index + 1} - {ev.question_family || ev.category || ev.type}</p>
                                        <p style={{ marginTop: '0.35rem', color: panelTextPrimary, fontWeight: 800 }}>{ev.question}</p>
                                    </div>
                                    {ev.overall_score != null && <span className="badge" style={{ color: getMetricColor(ev.overall_score * 10), borderColor: 'rgba(255,255,255,0.12)' }}>{ev.overall_score}/10</span>}
                                </div>
                                {ev.senior_feedback && <p style={{ marginTop: '0.9rem', color: panelTextSecondary, lineHeight: 1.7 }}>{ev.senior_feedback}</p>}
                                {(ev.answer_coverage?.covered?.length || ev.answer_coverage?.partially_covered?.length || ev.answer_coverage?.missed?.length) ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.9rem' }}>
                                        {[
                                            ['Covered', ev.answer_coverage?.covered || [], '#6ee7b7'],
                                            ['Partially covered', ev.answer_coverage?.partially_covered || [], '#fdba74'],
                                            ['Missed', ev.answer_coverage?.missed || [], '#fca5a5'],
                                        ].map(([label, items, color]) => (
                                            <div key={label as string} style={{ padding: '0.8rem', borderRadius: '14px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}>
                                                <p style={{ fontWeight: 800, color: color as string }}>{label as string}</p>
                                                <div className="flex-col gap-xs" style={{ marginTop: '0.5rem', color: panelTextSecondary }}>
                                                    {(items as string[]).length ? (items as string[]).map(item => <span key={item}>- {item}</span>) : <span>- None noted</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : null}
                                {ev.delivery_feedback && (
                                    <div style={{ marginTop: '0.9rem', padding: '0.8rem', borderRadius: '14px', background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.12)' }}>
                                        <p style={{ fontWeight: 800, color: '#7dd3fc' }}>Speaking and live delivery</p>
                                        <div className="flex-col gap-xs" style={{ marginTop: '0.5rem', color: panelTextSecondary }}>
                                            {ev.delivery_feedback.speaking_summary && <span>- {ev.delivery_feedback.speaking_summary}</span>}
                                            {ev.delivery_feedback.pace && <span>- Pace: {ev.delivery_feedback.pace}</span>}
                                            {ev.delivery_feedback.clarity && <span>- Clarity: {ev.delivery_feedback.clarity}</span>}
                                            {ev.delivery_feedback.confidence && <span>- Confidence: {ev.delivery_feedback.confidence}</span>}
                                        </div>
                                    </div>
                                )}
                                {ev.improved_answer && (
                                    <div style={{ marginTop: '0.9rem', padding: '0.8rem', borderRadius: '14px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.14)' }}>
                                        <p style={{ fontWeight: 800, color: '#c7d2fe' }}>Stronger answer version</p>
                                        <p style={{ marginTop: '0.5rem', color: panelTextSecondary, lineHeight: 1.7 }}>{ev.improved_answer}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass-card" style={{ padding: '1rem', background: '#08121c', color: panelTextPrimary }}>
                    <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: panelTextPrimary }}>AI Analysis</h3>
                        <span style={{ fontSize: '0.82rem', color: panelTextMuted }}>{modelsReady ? 'MediaPipe live' : 'Analysis unavailable'}</span>
                    </div>

                    <div className="flex gap-sm" style={{ marginBottom: '1rem' }}>
                        {(['metrics', 'coaching'] as const).map(tab => (
                            <button key={tab} className={viewTab === tab ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setViewTab(tab)} style={{ flex: 1 }}>
                                {tab === 'metrics' ? 'Metrics' : 'Coaching'}
                            </button>
                        ))}
                    </div>

                    {viewTab === 'metrics' ? (
                        <div className="flex-col gap-md">
                            {metricRows.map(([label, value]) => (
                                <div key={label} className="flex-col gap-xs">
                                    <div className="flex justify-between" style={{ fontSize: '0.88rem' }}>
                                        <span style={{ color: panelTextSecondary }}>{label}</span>
                                        <span style={{ color: getMetricColor(value), fontWeight: 800 }}>
                                            {label === 'Speech Clarity' && currentQuestion?.category === 'coding' ? 'Paused' : `${value}%`}
                                        </span>
                                    </div>
                                    <div style={{ height: '8px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${value}%`, borderRadius: '999px', background: `linear-gradient(90deg, ${getMetricColor(value)}, rgba(96,165,250,0.95))` }} />
                                    </div>
                                </div>
                            ))}

                            <div style={{ marginTop: '0.5rem', padding: '1rem', borderRadius: '18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <p style={{ fontSize: '0.74rem', color: panelTextMuted, fontWeight: 800, textTransform: 'uppercase' }}>Readiness snapshot</p>
                                <p style={{ fontSize: '2.4rem', lineHeight: 1, marginTop: '0.4rem', color: getMetricColor(liveMetrics.readiness), fontWeight: 900 }}>{liveMetrics.readiness}%</p>
                                <p style={{ marginTop: '0.6rem', color: panelTextSecondary, lineHeight: 1.6 }}>
                                    This score blends confidence, posture, body language, eye contact, and communication for the current moment.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-col gap-md">
                            <div style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                <p style={{ fontWeight: 800, color: panelTextPrimary }}>Live coaching cues</p>
                                <div className="flex-col gap-sm" style={{ marginTop: '0.8rem', color: panelTextSecondary }}>
                                    <span>• {liveMetrics.eye_contact < 60 ? 'Look slightly closer to the webcam to improve eye contact.' : 'Eye contact looks steady.'}</span>
                                    <span>• {liveMetrics.posture < 60 ? 'Roll shoulders back and sit taller for a stronger presence.' : 'Posture is helping your presence.'}</span>
                                    <span>• {liveMetrics.expression < 55 ? 'Relax the jaw and keep a small positive expression.' : 'Your expression feels engaged.'}</span>
                                    <span>• {liveMetrics.communication < 60 ? 'Use a cleaner structure: challenge, action, impact.' : 'Your communication structure is clear.'}</span>
                                </div>
                            </div>

                            <div style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.14)' }}>
                                <p style={{ fontWeight: 800, color: '#fca5a5' }}>Presence rules</p>
                                <div className="flex-col gap-xs" style={{ marginTop: '0.7rem', color: '#fecaca' }}>
                                    <span>• Exactly one person should remain in the frame.</span>
                                    <span>• Black screen, no-person, and multiple-person events are recorded in the final report.</span>
                                    <span>• Coding rounds pause only speech scoring, not confidence/posture tracking.</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {roomComplete && reportBundle && (
                <div ref={reportRef} className="glass-card fade-in" style={{ marginTop: '1.5rem', padding: '1.8rem', background: '#08121c', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-start justify-between" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                        <div>
                            <p style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '1px', color: '#38bdf8', textTransform: 'uppercase' }}>Interview readiness report</p>
                            <h2 style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.35rem' }}>{reportBundle.report.readiness_score}% overall readiness</h2>
                            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                                {role} · {domain} · {level} · {new Date(reportBundle.report.generated_at).toLocaleString()}
                            </p>
                        </div>
                        <div className="flex gap-sm">
                            <button className="btn btn-primary" onClick={exportPdf}>Export PDF</button>
                            <button className="btn btn-secondary" onClick={() => navigate('/assistant')}>Back to Assistant</button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.9rem', marginTop: '1.4rem' }}>
                        {Object.entries(reportBundle.report.metrics).filter(([name]) => name !== 'readiness').map(([name, value]) => (
                            <div key={name} style={{ padding: '1rem', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <p style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{name.replace('_', ' ')}</p>
                                <p style={{ fontSize: '1.8rem', fontWeight: 900, marginTop: '0.35rem', color: getMetricColor(value as number) }}>{value}%</p>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.4rem' }} className="report-grid">
                        <div style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.14)' }}>
                            <p style={{ fontWeight: 800, color: '#6ee7b7' }}>What went well</p>
                            <div className="flex-col gap-xs" style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
                                {reportBundle.report.strengths.length ? reportBundle.report.strengths.map(item => <span key={item}>• {item}</span>) : <span>• You completed the full interview flow and generated a readiness report.</span>}
                            </div>
                        </div>
                        <div style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.14)' }}>
                            <p style={{ fontWeight: 800, color: '#fca5a5' }}>Improvement areas</p>
                            <div className="flex-col gap-xs" style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
                                {reportBundle.report.improvements.length ? reportBundle.report.improvements.map(item => <span key={item}>• {item}</span>) : <span>• Keep practising for a longer answer sample to deepen the report.</span>}
                            </div>
                        </div>
                    </div>

                    <div style={{ marginTop: '1.4rem', padding: '1rem', borderRadius: '18px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
                        <p style={{ fontWeight: 800, color: '#c7d2fe' }}>Coaching plan</p>
                        <div className="flex-col gap-xs" style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
                            {reportBundle.report.coaching_tips.map(item => <span key={item}>• {item}</span>)}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.2rem' }} className="report-grid">
                        <div style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.14)' }}>
                            <p style={{ fontWeight: 800, color: '#fca5a5' }}>Mistakes you made</p>
                            <div className="flex-col gap-xs" style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
                                {reportBundle.report.mistakes_made.length ? reportBundle.report.mistakes_made.map(item => <span key={item}>• {item}</span>) : <span>• No repeated mistake pattern was detected strongly enough to flag here.</span>}
                            </div>
                        </div>
                        <div style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.14)' }}>
                            <p style={{ fontWeight: 800, color: '#fdba74' }}>Skill gaps</p>
                            <div className="flex-col gap-xs" style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
                                {reportBundle.report.skill_gaps.length ? reportBundle.report.skill_gaps.map(item => <span key={item}>• {item}</span>) : <span>• No clear skill gap cluster was detected from this session.</span>}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }} className="report-grid">
                        <div style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.14)' }}>
                            <p style={{ fontWeight: 800, color: '#7dd3fc' }}>Where you need to improve</p>
                            <div className="flex-col gap-xs" style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
                                {reportBundle.report.improvement_focus.length ? reportBundle.report.improvement_focus.map(item => <span key={item}>• {item}</span>) : <span>• Keep practising across fundamentals, scenarios, and communication depth for more targeted feedback.</span>}
                            </div>
                        </div>
                        <div style={{ padding: '1rem', borderRadius: '18px', background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
                            <p style={{ fontWeight: 800, color: '#c7d2fe' }}>What interviewers still wanted</p>
                            <div className="flex-col gap-xs" style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
                                {reportBundle.report.interviewer_expectations.length ? reportBundle.report.interviewer_expectations.map(item => <span key={item}>• {item}</span>) : <span>• Your answers generally covered the expected interviewer checkpoints.</span>}
                            </div>
                        </div>
                    </div>

                    {reportBundle.report.presence_alerts.length > 0 && (
                        <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '18px', background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.14)' }}>
                            <p style={{ fontWeight: 800, color: '#fdba74' }}>Presence events captured</p>
                            <div className="flex-col gap-xs" style={{ marginTop: '0.75rem', color: 'var(--text-secondary)' }}>
                                {reportBundle.report.presence_alerts.map(item => <span key={item}>• {item}</span>)}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @media (max-width: 1100px) {
                    .interview-room-grid, .report-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    );
};

export { InterviewRoom };
export default InterviewRoom;
