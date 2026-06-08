import { useState, useEffect } from 'react';
import { useEduZyniq } from '../hooks/useEduZyniq';
import { PERSONAS } from '../data/personas';
import { ChatWindow } from '../components/ChatWindow';
import { ProfileDialog } from '../components/ProfileDialog';

// Forge Modules
import { ForgeDashboard } from './forge/Dashboard';
import { InterviewCoach } from './forge/InterviewCoach';
import { QuizMaster } from './forge/QuizMaster';
import { CodingMentor } from './forge/CodingMentor';
import { CareerPathfinder } from './forge/CareerPathfinder';
import { Teacher } from './forge/Teacher';
import { Analytics } from './forge/Analytics';

export const Assistant = () => {
    const { activeMode, setActiveMode, messages, isTyping, sendMessage, profile, updateProfile, progress, fetchProgress, stats, fetchStats } = useEduZyniq();
    const [showProfileDialog, setShowProfileDialog] = useState(false);

    // View state: 'dashboard' | 'chat' | 'interview' | 'quiz' | 'coding' | 'pathfinder'
    const [view, setView] = useState('dashboard');

    useEffect(() => {
        // Prevent showing if already shown in this session or if profile exists
        const hasDismissed = sessionStorage.getItem('eduzyniq_onboarding_dismissed');

        if (progress && progress.profile_completed === false && !profile && !hasDismissed) {
            setShowProfileDialog(true);
        }
    }, [profile, progress]);

    const handleProfileSave = (p: any) => {
        updateProfile(p);
        setShowProfileDialog(false);
        sessionStorage.setItem('eduzyniq_onboarding_dismissed', 'true');
    };

    const handleProfileClose = () => {
        setShowProfileDialog(false);
        sessionStorage.setItem('eduzyniq_onboarding_dismissed', 'true');
    };

    const handleModeSelect = (modeId: string) => {
        setActiveMode(modeId as any);
        if (modeId === 'INTERVIEWER') setView('interview');
        else if (modeId === 'QUIZ') setView('quiz');
        else if (modeId === 'CODING_MENTOR') setView('coding');
        else if (modeId === 'ROADMAP') setView('pathfinder');
        else if (modeId === 'TEACHER') setView('teacher');
        else if (modeId === 'STATS') setView('stats');
        else setView('chat');
    };

    const renderContent = () => {
        switch (view) {
            case 'interview':
                return <InterviewCoach onComplete={() => { fetchProgress(); fetchStats(); }} />;
            case 'quiz':
                return <QuizMaster onComplete={() => { fetchProgress(); fetchStats(); }} />;
            case 'coding':
                return <CodingMentor onComplete={() => { fetchProgress(); fetchStats(); }} />;
            case 'pathfinder':
                return <CareerPathfinder />;
            case 'teacher':
                return <Teacher />;
            case 'stats':
                return <Analytics stats={stats} fetchStats={fetchStats} />;
            case 'chat':
                return (
                    <div className="flex-col gap-md">
                        <div className="flex items-center justify-between glass-card" style={{ padding: '1rem 2rem' }}>
                            <div className="flex items-center gap-md">
                                <span style={{ fontSize: '2rem' }}>{PERSONAS[activeMode].icon}</span>
                                <div>
                                    <h3 style={{ fontSize: '1.25rem' }}>{PERSONAS[activeMode].name}</h3>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{PERSONAS[activeMode].tagline}</p>
                                </div>
                            </div>
                        </div>
                        <ChatWindow
                            messages={messages}
                            isTyping={isTyping}
                            onSendMessage={sendMessage}
                            activeMode={activeMode}
                        />
                    </div>
                );
            case 'dashboard':
            default:
                return (
                    <ForgeDashboard
                        profile={profile}
                        progress={progress}
                        stats={stats}
                        onSelectModule={handleModeSelect}
                    />
                );
        }
    };

    return (
        <div className="fade-in" style={{ padding: '40px 0 var(--spacing-2xl)', minHeight: '100vh' }}>
            {showProfileDialog && (
                    <ProfileDialog
                        title={profile ? "Update Your Profile" : "AI Onboarding: Core Details"}
                        initialProfile={profile}
                        onSave={handleProfileSave}
                        onClose={handleProfileClose}
                    />
                )}

                {view !== 'dashboard' && (
                    <div className="flex items-center gap-md mb-xl">
                        <button
                            onClick={() => setView('dashboard')}
                            className="btn btn-secondary"
                            style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
                        >
                            ← Back to Dashboard
                        </button>
                    </div>
                )}

                {renderContent()}

            <style>{`
                .hover-lift { transition: all 0.3s ease; }
                .hover-lift:hover { transform: translateY(-8px); border-color: var(--primary-400) !important; box-shadow: 0 20px 40px rgba(0,0,0,0.3); }
                .grid-launchpad { display: grid; gap: 1rem; }
            `}</style>
        </div>
    );
};
