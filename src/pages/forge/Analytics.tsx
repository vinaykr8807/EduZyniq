import { useEffect } from 'react';
import { useResponsive } from '../../hooks/useResponsive';

export const Analytics = ({ stats, fetchStats }: any) => {
    const { isMobile } = useResponsive();

    useEffect(() => {
        if (fetchStats) fetchStats();
    }, [fetchStats]);

    // Use stats from props with fallback
    const domain_strength = stats?.domain_strength || { 'General': 50 };
    const quiz_accuracy = stats?.accuracy_trend || [0, 0, 0, 0];

    return (
        <div className="flex-col gap-xl">
            <header>
                <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>Intelligence Analytics</h2>
                <p style={{ color: 'var(--text-secondary)' }}>Detailed metrics and growth trajectory</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '2rem' }}>
                {/* Domain Strength Radar Simulation */}
                <div className="glass-card" style={{ padding: '2rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '2rem' }}>DOMAIN STRENGTH RADAR</h3>
                    <div className="flex-col gap-lg">
                        {Object.entries(domain_strength).map(([name, val]: any) => (
                            <div key={name} className="flex-col gap-xs">
                                <div className="flex justify-between" style={{ fontSize: '0.8rem' }}>
                                    <span style={{ fontWeight: 700 }}>{name}</span>
                                    <span style={{ color: 'var(--accent-blue)' }}>{val}%</span>
                                </div>
                                <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${val}%`,
                                        background: 'linear-gradient(90deg, var(--primary-600), var(--accent-blue))',
                                        boxShadow: '0 0 10px var(--accent-blue)44'
                                    }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Accuracy Trend */}
                <div className="glass-card" style={{ padding: '2rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '2rem' }}>ACCURACY TRAJECTORY (%)</h3>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: '240px', paddingBottom: '2rem', borderBottom: '1px solid var(--glass-border)' }}>
                        {(quiz_accuracy as number[]).map((val: number, i: number) => (
                            <div
                                key={i}
                                style={{
                                    flex: 1,
                                    height: `${val}%`,
                                    background: 'var(--accent-green)',
                                    opacity: 0.3 + (i * 0.15),
                                    borderRadius: '4px 4px 0 0',
                                    position: 'relative'
                                }}
                            >
                                <span style={{ position: 'absolute', top: '-25px', width: '100%', textAlign: 'center', fontSize: '0.7rem', fontWeight: 800 }}>{val}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-md" style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        <span>WEEK 1</span>
                        <span>WEEK 2</span>
                        <span>WEEK 3</span>
                        <span>CURRENT</span>
                    </div>
                </div>
            </div>

            <div className="glass-card" style={{ padding: '2rem', border: '1px solid var(--accent-green)', background: 'rgba(0,255,128,0.02)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1rem' }}>SYSTEM INSIGHT</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    "Your **Backend** mastery is in the top 5% of students. However, your **AIML** conceptual logic is trailing. We suggest taking more Theory-based quizzes in that domain to balance your radar."
                </p>
            </div>
        </div>
    );
};
