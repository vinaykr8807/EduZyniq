import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, Mode } from '../types';
import { PERSONAS } from '../data/personas';

interface ChatWindowProps {
    messages: ChatMessage[];
    isTyping: boolean;
    onSendMessage: (content: string) => void;
    activeMode: Mode;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ messages, isTyping, onSendMessage, activeMode }) => {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isTyping]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (input.trim()) {
            onSendMessage(input);
            setInput('');
        }
    };

    return (
        <div className="flex-col" style={{ height: '700px', width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
            {/* Mode Status Bar */}
            <div className="glass-card" style={{
                padding: '1rem 2rem',
                marginBottom: '1.5rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: '1.5rem',
                border: `1px solid ${PERSONAS[activeMode].color}22`,
                background: `linear-gradient(90deg, ${PERSONAS[activeMode].color}11, transparent)`
            }}>
                <span style={{ fontSize: '1.5rem' }}>{PERSONAS[activeMode].icon}</span>
                <div>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: PERSONAS[activeMode].color }}>{PERSONAS[activeMode].name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: '0.75rem' }}>Personalized Active</span>
                </div>
            </div>

            {/* Messages Area */}
            <div className="glass-card flex-col" style={{
                flex: 1,
                overflowY: 'auto',
                padding: '2rem',
                marginBottom: '1rem',
                gap: '1.5rem',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`fade-in message ${msg.role === 'user' ? 'user' : 'assistant'}`}
                        style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            maxWidth: '80%',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.5rem'
                        }}
                    >
                        <div style={{
                            background: msg.role === 'user' ? 'var(--primary-600)' : 'rgba(255, 255, 255, 0.05)',
                            padding: '1rem 1.25rem',
                            borderRadius: msg.role === 'user' ? '1.25rem 1.25rem 0 1.25rem' : '0 1.25rem 1.25rem 1.25rem',
                            border: msg.role === 'user' ? 'none' : '1px solid var(--glass-border)',
                            color: 'var(--text-primary)',
                            boxShadow: msg.role === 'user' ? 'var(--shadow-md)' : 'none',
                            whiteSpace: 'pre-wrap'
                        }}>
                            {msg.content}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                ))}
                {isTyping && (
                    <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '4px', padding: '1rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '1rem' }}>
                        <div className="dot" style={{ width: '8px', height: '8px', background: 'var(--text-muted)', borderRadius: '50%', animation: 'pulse 1s infinite' }}></div>
                        <div className="dot" style={{ width: '8px', height: '8px', background: 'var(--text-muted)', borderRadius: '50%', animation: 'pulse 1s infinite 0.2s' }}></div>
                        <div className="dot" style={{ width: '8px', height: '8px', background: 'var(--text-muted)', borderRadius: '50%', animation: 'pulse 1s infinite 0.4s' }}></div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
                <input
                    className="input-field"
                    placeholder="Ask EduZyniq anything..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isTyping}
                    style={{ paddingRight: '4rem' }}
                />
                <button
                    type="submit"
                    className="btn"
                    style={{
                        position: 'absolute',
                        right: '0.5rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        padding: '0.5rem 1rem',
                        background: 'transparent',
                        color: 'var(--primary-500)',
                        border: 'none',
                        fontSize: '1.5rem'
                    }}
                >
                    🚀
                </button>
            </form>
        </div>
    );
};

