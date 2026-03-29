import { useRef, useEffect } from 'react';

interface KnowledgeNode {
    id: string;
    label: string;
    level: number; // 0 to 1
    status: 'done' | 'learning' | 'struggling' | 'idle';
}

export const KnowledgeGraph = ({ data }: { data: KnowledgeNode[] }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!canvasRef.current || !data || !Array.isArray(data)) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;

        // Simple Radar/Orbital Layout
        const width = canvasRef.current.width;
        const height = canvasRef.current.height;
        const centerX = width / 2;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        // Draw Rings
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        for (let i = 1; i <= 4; i++) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, (i * (width / 2)) / 4, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw Nodes
        const angleStep = data.length > 0 ? (Math.PI * 2) / data.length : 0;
        data.forEach((node, i) => {
            const angle = i * angleStep;
            // Defensive check for level
            const level = (node.level !== undefined && !isNaN(node.level) && isFinite(node.level)) ? node.level : 0;
            const radius = (level * (width / 2 - 40)) + 20;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;

            // Safety check for coordinates
            if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) return;

            // Gradient for node
            const color = node.status === 'done' ? '#34d399' : 
                          node.status === 'learning' ? '#3b82f6' : 
                          node.status === 'struggling' ? '#ef4444' : '#6b7280';
            
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, 10, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(node.label, x, y + 22);
        });

        // Connect nodes to center
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.15)';
        data.forEach((node, i) => {
            const angle = i * angleStep;
            const level = (node.level !== undefined && !isNaN(node.level) && isFinite(node.level)) ? node.level : 0;
            const radius = (level * (width / 2 - 40)) + 20;
            const x = centerX + Math.cos(angle) * radius;
            const y = centerY + Math.sin(angle) * radius;
            
            if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) return;

            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(x, y);
            ctx.stroke();
        });

    }, [data]);

    return (
        <div className="flex-col items-center">
            <canvas 
                ref={canvasRef} 
                width={400} 
                height={400} 
                style={{ maxWidth: '100%', height: 'auto' }}
            />
            <div className="flex gap-md mt-md">
                <div className="flex items-center gap-xs"><span style={{width:8,height:8,background:'#34d399',borderRadius:'50%'}}></span> <span style={{fontSize:'0.7rem'}}>Mastered</span></div>
                <div className="flex items-center gap-xs"><span style={{width:8,height:8,background:'#3b82f6',borderRadius:'50%'}}></span> <span style={{fontSize:'0.7rem'}}>Learning</span></div>
                <div className="flex items-center gap-xs"><span style={{width:8,height:8,background:'#ef4444',borderRadius:'50%'}}></span> <span style={{fontSize:'0.7rem'}}>Weak</span></div>
            </div>
        </div>
    );
};
