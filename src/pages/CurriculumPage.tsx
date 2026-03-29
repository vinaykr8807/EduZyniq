import { useState, useEffect } from 'react';
import { useEdunovas } from '../hooks/useEdunovas';
import { CURRICULUM_DATA, type Roadmap } from '../data/curriculumData';

export const CurriculumPage = () => {
    const { profile } = useEdunovas();
    const [selectedRoadmap, setSelectedRoadmap] = useState<Roadmap>(CURRICULUM_DATA[0]);

    useEffect(() => {
        if (profile?.domain) {
            const found = CURRICULUM_DATA.find(r => r.title === profile.domain);
            if (found) setSelectedRoadmap(found);
        }
    }, [profile]);

    const handleDownloadPDF = async () => {
        try {
            const response = await fetch('http://127.0.0.1:8000/download-roadmap-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(selectedRoadmap)
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${selectedRoadmap.title.replace(/\s+/g, '_')}_Roadmap.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('PDF download failed:', error);
        }
    };

    return (
        <div className="fade-in" style={{ padding: '0 0 6rem', background: '#f8fafc', minHeight: '100vh' }}>
            <div 
                className="container"
                style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '320px 1fr', 
                    gap: '2.5rem',
                    alignItems: 'start',
                    maxWidth: '1440px'
                }}
            >
                {/* 1. 🛣️ SIDEBAR: ROADMAPS LIST */}
                <aside className="flex-col gap-lg">
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', paddingLeft: '0.5rem' }}>Roadmaps</h3>
                    <div className="flex-col gap-sm">
                        {CURRICULUM_DATA.map((roadmap) => (
                            <button
                                key={roadmap.id}
                                onClick={() => setSelectedRoadmap(roadmap)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    padding: '1.25rem',
                                    borderRadius: '16px',
                                    border: selectedRoadmap.id === roadmap.id ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                                    background: selectedRoadmap.id === roadmap.id ? '#eff6ff' : 'white',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    boxShadow: selectedRoadmap.id === roadmap.id ? '0 10px 20px rgba(59, 130, 246, 0.08)' : 'none'
                                }}
                            >
                                <div style={{ 
                                    width: '44px', height: '44px', borderRadius: '12px', background: '#f1f5f9',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
                                    color: '#3b82f6', flexShrink: 0
                                }}>
                                    {roadmap.icon}
                                </div>
                                <div className="flex-col gap-xs" style={{ flex: 1, minWidth: 0 }}>
                                    <h4 style={{ 
                                        fontSize: '0.95rem', fontWeight: 800, color: '#1e293b', 
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
                                    }}>
                                        {roadmap.title}
                                    </h4>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                                        {roadmap.difficulty} • {roadmap.duration}
                                    </span>
                                </div>
                            </button>
                        ))}
                    </div>
                </aside>

                {/* 2. 📄 MAIN AREA: ROADMAP CONTENT */}
                <div className="flex-col gap-xl">
                    {/* Roadmap Header Card */}
                    <div className="glass-card" style={{ 
                        padding: '3rem', borderRadius: '32px', boxShadow: '0 10px 40px rgba(0,0,0,0.03)',
                        background: 'white', border: '1px solid #f1f5f9', position: 'relative'
                    }}>
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-xl" style={{ flex: 1 }}>
                                <div style={{ 
                                    width: '80px', height: '80px', borderRadius: '20px', background: '#eff6ff',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem'
                                }}>
                                    {selectedRoadmap.icon}
                                </div>
                                <div className="flex-col gap-sm">
                                    <h2 style={{ fontSize: '2.4rem', fontWeight: 900, color: '#0f172a', letterSpacing: '-1.5px', margin: 0 }}>
                                        {selectedRoadmap.title}
                                    </h2>
                                    <p style={{ color: '#64748b', fontSize: '1.1rem', maxWidth: '600px', margin: 0 }}>
                                        {selectedRoadmap.description}
                                    </p>
                                </div>
                            </div>
                            <div className="flex-col items-end gap-md">
                                <div className="flex gap-sm">
                                    <span style={{ 
                                        background: '#eff6ff', color: '#3b82f6', padding: '0.5rem 1rem', 
                                        borderRadius: '100px', fontSize: '0.7rem', fontWeight: 800 
                                    }}>
                                        {selectedRoadmap.difficulty}
                                    </span>
                                    <span style={{ 
                                        color: '#64748b', fontSize: '0.85rem', fontWeight: 600, 
                                        display: 'flex', alignItems: 'center', gap: '6px' 
                                    }}>
                                        🕒 {selectedRoadmap.duration}
                                    </span>
                                </div>
                                <button onClick={handleDownloadPDF} className="btn btn-secondary" style={{ 
                                    padding: '0.6rem 1.25rem', fontSize: '0.85rem', borderRadius: '12px',
                                    border: '1px solid #e2e8f0', background: 'white', fontWeight: 700
                                }}>
                                    📥 PDF
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Timeline Path */}
                    <div className="flex-col gap-3xl" style={{ position: 'relative', marginTop: '1rem' }}>
                        {selectedRoadmap.phases.map((phase, pIdx) => (
                            <div key={phase.name} className="flex-col gap-xl">
                                {/* Vertical connector line wrapper */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', position: 'relative' }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%', background: '#3b82f6',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        color: 'white', fontWeight: 900, fontSize: '1rem', zIndex: 2,
                                        boxShadow: '0 0 0 8px #f8fafc'
                                    }}>
                                        {pIdx + 1}
                                    </div>
                                    <div style={{
                                        position: 'absolute',
                                        left: '19px',
                                        top: '40px',
                                        bottom: '-5rem',
                                        width: '2px',
                                        background: '#e2e8f0',
                                        zIndex: 1,
                                        display: pIdx === selectedRoadmap.phases.length - 1 ? 'none' : 'block'
                                    }}></div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>{phase.name}</h3>
                                </div>

                                <div className="grid-2 gap-lg" style={{ paddingLeft: '4.5rem' }}>
                                    {phase.milestones.map((m) => (
                                        <div key={m.title} className="glass-card" style={{ 
                                            padding: '2rem', borderRadius: '24px', background: 'white', 
                                            border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.01)',
                                            display: 'flex', flexDirection: 'column', gap: '1rem'
                                        }}>
                                            <div className="flex-col gap-xs">
                                                <h4 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>{m.title}</h4>
                                                <p style={{ fontSize: '0.95rem', color: '#64748b', lineHeight: 1.6, margin: 0 }}>{m.description}</p>
                                            </div>
                                            <div className="flex flex-wrap gap-xs">
                                                {m.skills.map(skill => (
                                                    <span key={skill} className="badge" style={{ 
                                                        background: '#eff6ff', border: '1px solid #dbeafe', 
                                                        color: '#3b82f6', fontSize: '0.7rem', padding: '0.25rem 0.75rem' 
                                                    }}>
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Bottom CTA Card */}
                    <div className="glass-card" style={{ 
                        marginTop: '2rem', padding: '4rem 2rem', borderRadius: '32px', 
                        textAlign: 'center', background: 'white', border: '1px solid #f1f5f9'
                    }}>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', marginBottom: '0.5rem' }}>Ready to begin?</h3>
                        <p style={{ color: '#64748b', marginBottom: '2.5rem' }}>
                            Start your journey in {selectedRoadmap.title} today.
                        </p>
                        <button className="btn btn-primary" style={{ padding: '1rem 3.5rem', borderRadius: '12px', fontWeight: 800, fontSize: '1rem' }}>
                            Start This Journey <span>→</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
