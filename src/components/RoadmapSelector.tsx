import { useState } from 'react';
import { CURRICULUM_DATA, type Roadmap } from '../data/curriculumData';

interface RoadmapSelectorProps {
    onSelect?: (roadmap: Roadmap) => void;
}

export const RoadmapSelector = ({ onSelect }: RoadmapSelectorProps) => {
    const [selectedRoadmap, setSelectedRoadmap] = useState<Roadmap | null>(null);

    const handleDownloadPDF = async (roadmap: Roadmap) => {
        try {
            const response = await fetch('http://127.0.0.1:8000/download-roadmap-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(roadmap)
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${roadmap.title.replace(/\s+/g, '_')}_Roadmap.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('PDF download failed:', error);
        }
    };

    const handleSetActive = (roadmap: Roadmap) => {
        if (onSelect) onSelect(roadmap);
    };

    return (
        <div className="glass-card" style={{ padding: '1.5rem', background: 'white', border: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: '0.8rem', fontWeight: 900, color: '#0f172a', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🛣️ Roadmaps
            </h3>
            
            {!selectedRoadmap ? (
                <div className="flex-col gap-sm">
                    {CURRICULUM_DATA.map((roadmap) => (
                        <button
                            key={roadmap.id}
                            onClick={() => setSelectedRoadmap(roadmap)}
                            className="glass-card flex items-center gap-md hover-lift"
                            style={{
                                padding: '0.75rem 1rem',
                                cursor: 'pointer',
                                border: '1px solid #f1f5f9',
                                textAlign: 'left',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                            }}
                        >
                            <span style={{ fontSize: '1.2rem' }}>{roadmap.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roadmap.title}</h4>
                                <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>{roadmap.difficulty} • {roadmap.duration}</span>
                            </div>
                        </button>
                    ))}
                </div>
            ) : (
                <div className="flex-col gap-md slide-in">
                    <div style={{ borderLeft: `3px solid #3b82f6`, paddingLeft: '1rem' }}>
                        <div className="flex items-center gap-sm mb-xs">
                            <span style={{ fontSize: '1.5rem' }}>{selectedRoadmap.icon}</span>
                            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>{selectedRoadmap.title}</h4>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem', lineHeight: 1.4 }}>
                            {selectedRoadmap.description}
                        </p>
                        <div className="flex gap-sm">
                            <span style={{ background: '#eff6ff', color: '#3b82f6', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800 }}>{selectedRoadmap.difficulty}</span>
                            <span style={{ background: '#f1f5f9', color: '#64748b', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 800 }}>{selectedRoadmap.duration}</span>
                        </div>
                    </div>

                    <div className="flex-col gap-sm" style={{ maxHeight: '250px', overflowY: 'auto', paddingRight: '4px' }}>
                        {selectedRoadmap.phases.map((phase, idx) => (
                            <div key={idx} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '12px' }}>
                                <h5 style={{ fontSize: '0.75rem', color: '#3b82f6', marginBottom: '0.4rem', fontWeight: 800 }}>
                                    {idx + 1}. {phase.name}
                                </h5>
                                <div className="flex-col gap-xs">
                                    {phase.milestones.map((m, i) => (
                                        <div key={i} style={{ fontSize: '0.7rem', color: '#475569', paddingLeft: '0.5rem' }}>
                                            • {m.title}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex-col gap-sm">
                        <div className="flex gap-sm">
                            <button 
                                className="btn btn-secondary" 
                                style={{ flex: 1, fontSize: '0.7rem', padding: '0.5rem', borderRadius: '8px' }}
                                onClick={() => setSelectedRoadmap(null)}
                            >
                                ← Back
                            </button>
                            <button 
                                className="btn btn-secondary" 
                                style={{ flex: 1, fontSize: '0.7rem', padding: '0.5rem', borderRadius: '8px' }}
                                onClick={() => handleDownloadPDF(selectedRoadmap)}
                            >
                                📥 PDF
                            </button>
                        </div>
                        <button 
                            className="btn btn-primary" 
                            style={{ width: '100%', fontSize: '0.75rem', padding: '0.6rem', borderRadius: '8px', fontWeight: 800 }}
                            onClick={() => handleSetActive(selectedRoadmap)}
                        >
                            Set as Active Path 🚀
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
