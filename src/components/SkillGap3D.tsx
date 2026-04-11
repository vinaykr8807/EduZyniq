import React, { useMemo } from 'react';

interface SkillGap3DProps {
    current: Record<string, number>;
    dream: Record<string, number>;
    labels: string[];
}

export const SkillGap3D: React.FC<SkillGap3DProps> = ({ current, dream, labels }) => {
    const size = 300;
    const center = size / 2;
    const radius = size * 0.4;

    const getCoordinates = (index: number, total: number, value: number) => {
        const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
        const x = center + radius * (value / 100) * Math.cos(angle);
        const y = center + radius * (value / 100) * Math.sin(angle);
        return { x, y };
    };

    const dreamPath = useMemo(() => {
        return labels.map((_, i) => {
            const val = dream[labels[i]] || 0;
            const { x, y } = getCoordinates(i, labels.length, val);
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ') + ' Z';
    }, [dream, labels]);

    const currentPath = useMemo(() => {
        return labels.map((_, i) => {
            const val = current[labels[i]] || 0;
            const { x, y } = getCoordinates(i, labels.length, val);
            return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
        }).join(' ') + ' Z';
    }, [current, labels]);

    return (
        <div style={{
            perspective: '1000px',
            width: '100%',
            height: '400px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Animated Background Glow */}
            <div style={{
                position: 'absolute',
                width: '300px',
                height: '300px',
                background: 'var(--primary-glow)',
                filter: 'blur(80px)',
                borderRadius: '50%',
                animation: 'pulseGlow 4s infinite ease-in-out'
            }} />

            <div style={{
                transformStyle: 'preserve-3d',
                transform: 'rotateX(45deg) rotateZ(0deg)',
                animation: 'rotateSlow 20s infinite linear',
                position: 'relative',
                width: `${size}px`,
                height: `${size}px`,
            }}>
                <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible' }}>
                    {/* Grid Rings */}
                    {[20, 40, 60, 80, 100].map(val => (
                        <circle
                            key={val}
                            cx={center}
                            cy={center}
                            r={radius * (val / 100)}
                            fill="none"
                            stroke="rgba(37,99,235,0.15)"
                            strokeWidth="1"
                            strokeDasharray="4 4"
                        />
                    ))}

                    {/* Axis Lines */}
                    {labels.map((label, i) => {
                        const { x, y } = getCoordinates(i, labels.length, 100);
                        return (
                            <g key={label}>
                                <line
                                    x1={center}
                                    y1={center}
                                    x2={x}
                                    y2={y}
                                    stroke="rgba(37,99,235,0.2)"
                                    strokeWidth="1"
                                />
                                <text
                                    x={x}
                                    y={y}
                                    fill="var(--text-muted)"
                                    fontSize="10"
                                    fontWeight="700"
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    style={{ transform: 'rotateX(-45deg)' }} // Counter-rotate text
                                >
                                    {label}
                                </text>
                            </g>
                        );
                    })}

                    {/* Dream Role Path (The "Target") */}
                    <path
                        d={dreamPath}
                        fill="rgba(56,183,248,0.1)"
                        stroke="rgba(56,183,248,0.4)"
                        strokeWidth="2"
                        strokeDasharray="5 5"
                        style={{ transition: 'all 0.8s ease' }}
                    />

                    {/* Current Skill Path (The "Progress") */}
                    <path
                        d={currentPath}
                        fill="url(#skillGradient)"
                        stroke="var(--primary-500)"
                        strokeWidth="3"
                        style={{ filter: 'drop-shadow(0 0 8px var(--primary-glow))', transition: 'all 1s ease' }}
                    />

                    <defs>
                        <linearGradient id="skillGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="var(--primary-400)" stopOpacity="0.6" />
                            <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0.3" />
                        </linearGradient>
                    </defs>

                    {/* Data Points */}
                    {labels.map((_, i) => {
                        const val = current[labels[i]] || 0;
                        const { x, y } = getCoordinates(i, labels.length, val);
                        return (
                            <circle
                                key={i}
                                cx={x}
                                cy={y}
                                r="4"
                                fill="var(--primary-500)"
                                style={{ filter: 'drop-shadow(0 0 5px var(--primary-glow))' }}
                            />
                        );
                    })}
                </svg>
            </div>

            {/* Legend / Overlay */}
            <div style={{
                position: 'absolute',
                bottom: '10px',
                right: '10px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                background: 'var(--glass-bg)',
                padding: '12px',
                borderRadius: '12px',
                border: '1px solid var(--glass-border)',
                backdropFilter: 'blur(10px)',
                fontSize: '0.75rem'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', background: 'var(--primary-500)', borderRadius: '3px' }} />
                    <span style={{ fontWeight: 700 }}>Current Capability</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '12px', height: '12px', border: '1px dashed rgba(56,183,248,0.6)', borderRadius: '3px' }} />
                    <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Dream Role Benchmark</span>
                </div>
            </div>

            <style>{`
                @keyframes rotateSlow {
                    from { transform: perspective(1000px) rotateX(45deg) rotateZ(0deg); }
                    to { transform: perspective(1000px) rotateX(45deg) rotateZ(360deg); }
                }
                @keyframes pulseGlow {
                    0%, 100% { transform: scale(1); opacity: 0.15; }
                    50% { transform: scale(1.2); opacity: 0.25; }
                }
            `}</style>
        </div>
    );
};
