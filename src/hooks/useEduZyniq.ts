import { useState, useCallback, useEffect } from 'react';
import type { Mode, ChatMessage, StudentProfile, User } from '../types';
import API_BASE_URL, { apiFetch } from '../config';

export const useEduZyniq = () => {
    const [activeMode, setActiveMode] = useState<Mode>('ROUTER');

    // Get user from storage
    const getLocalUser = useCallback((): User | null => {
        const saved = localStorage.getItem('eduzyniq_user');
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            localStorage.removeItem('eduzyniq_user');
            return null;
        }
    }, []);

    const [profile, setProfile] = useState<StudentProfile | null>(() => {
        const saved = localStorage.getItem('eduzyniq_profile');
        if (!saved) return null;
        try {
            return JSON.parse(saved);
        } catch (e) {
            localStorage.removeItem('eduzyniq_profile');
            return null;
        }
    });

    const [progress, setProgress] = useState<{
        points: number;
        badges: string[];
        career_phase: string;
        milestones_completed: number;
        profile_completed: boolean;
    } | null>(null);

    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            id: '1',
            role: 'assistant',
            content: "Hello! I'm your Career Forge mentor. Which module shall we initialize today?",
            timestamp: new Date(),
            mode: 'ROUTER'
        }
    ]);
    const [isTyping, setIsTyping] = useState(false);
    const [stats, setStats] = useState<any>(null);

    const fetchProgress = useCallback(async () => {
        const user = getLocalUser();
        if (!user) return;
        try {
            const res = await apiFetch(`${API_BASE_URL}/student/progress?user_email=${user.email}`);
            const data = await res.json();
            setProgress(data);
        } catch (e) {
            console.error('Failed to fetch progress:', e);
        }
    }, [getLocalUser]);

    const fetchStats = useCallback(async () => {
        const user = getLocalUser();
        if (!user) return;
        try {
            const res = await apiFetch(`${API_BASE_URL}/performance-stats?user_email=${user.email}`);
            const data = await res.json();
            setStats(data);
        } catch (e) {
            console.error('Failed to fetch stats:', e);
        }
    }, [getLocalUser]);

    useEffect(() => {
        fetchProgress();
        fetchStats();
    }, [fetchProgress, fetchStats]);

    const updateProfile = useCallback(async (p: StudentProfile) => {
        setProfile(p);
        localStorage.setItem('eduzyniq_profile', JSON.stringify(p));

        const user = getLocalUser();
        if (!user) return;

        try {
            await apiFetch(`${API_BASE_URL}/save-profile?user_email=` + user.email, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(p)
            });
            fetchProgress();
            fetchStats();
        } catch (error) {
            console.error('Failed to sync profile:', error);
        }
    }, [getLocalUser, fetchProgress, fetchStats]);

    const sendMessage = useCallback(async (content: string) => {
        const user = getLocalUser();
        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content,
            timestamp: new Date(),
            mode: activeMode
        };

        setMessages(prev => [...prev, userMsg]);
        setIsTyping(true);

        try {
            const response = await apiFetch(`${API_BASE_URL}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: content,
                    mode: activeMode,
                    profile: profile,
                    user_email: user?.email
                }),
            });

            const data = await response.json();

            // If in ROUTER mode, the backend might suggest a better mode
            const modeMapping: Record<string, Mode> = {
                'coding': 'CODING_MENTOR',
                'interview': 'INTERVIEWER',
                'quiz': 'QUIZ',
                'career': 'ROADMAP',
                'motivation': 'MOTIVATION',
                'default': 'ROUTER'
            };

            const detectedMode = modeMapping[data.mode] || activeMode;
            if (activeMode === 'ROUTER' && detectedMode !== 'ROUTER') {
                setActiveMode(detectedMode);
            }

            const aiMsg: ChatMessage = {
                id: Date.now().toString(),
                role: 'assistant',
                content: data.response,
                timestamp: new Date(),
                mode: detectedMode
            };

            setMessages(prev => [...prev, aiMsg]);
            fetchProgress(); // Awarded points on chat, so refresh
            fetchStats();
        } catch (error) {
            console.error('Chat failed:', error);
        } finally {
            setIsTyping(false);
        }
    }, [activeMode, profile, getLocalUser, fetchProgress, fetchStats]);

    return {
        activeMode,
        setActiveMode,
        messages,
        isTyping,
        sendMessage,
        profile,
        updateProfile,
        progress,
        fetchProgress,
        stats,
        fetchStats
    };
};
