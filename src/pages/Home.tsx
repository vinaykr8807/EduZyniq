import { Link } from 'react-router-dom';

export const Home = () => {
    return (
        <div className="fade-in" style={{ background: 'var(--bg-primary)', minHeight: '100vh', paddingBottom: '0', transition: 'background 0.4s ease' }}>
            {/* 1. 🚀 HERO SECTION */}
            <section style={{
                padding: '160px 0 100px',
                background: 'linear-gradient(180deg, rgba(var(--primary-rgb, 0,210,220), 0.05) 0%, transparent 100%)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div className="container" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', alignItems: 'center', gap: '4rem' }}>
                    <div>
                        <div style={{
                            display: 'inline-block',
                            padding: '0.4rem 1rem',
                            background: 'rgba(var(--primary-rgb, 0,210,220), 0.1)',
                            borderRadius: '100px',
                            color: 'var(--primary-400)',
                            fontSize: '0.65rem',
                            fontWeight: 800,
                            letterSpacing: '1px',
                            marginBottom: '1.5rem',
                            textTransform: 'uppercase',
                            border: '1px solid var(--glass-border)'
                        }}>
                            AI-Powered Learning
                        </div>
                        <h1 style={{
                            fontSize: 'clamp(3rem, 5vw, 4.5rem)',
                            fontWeight: 900,
                            lineHeight: 1.1,
                            color: 'var(--text-primary)',
                            marginBottom: '1.5rem',
                            letterSpacing: '-1.5px',
                            background: 'none',
                            WebkitTextFillColor: 'var(--text-primary)',
                        }}>
                            Master the machine.<br />
                            <span style={{ color: 'var(--primary-400)' }}>Forge your future.</span>
                        </h1>
                        <p style={{
                            fontSize: '1.15rem',
                            color: 'var(--text-secondary)',
                            maxWidth: '540px',
                            marginBottom: '2.5rem',
                            lineHeight: 1.6
                        }}>
                            An intelligent ecosystem for the modern engineer. 47.2% faster skill acquisition through AI-driven curriculum synthesis.
                        </p>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <Link to="/assistant" className="btn btn-primary" style={{
                                padding: '1rem 2.5rem',
                                borderRadius: '12px',
                                textDecoration: 'none',
                                fontWeight: 700,
                                fontSize: '0.95rem'
                            }}>
                                Launch Platform <span>→</span>
                            </Link>
                            <Link to="/curriculum" className="btn btn-secondary" style={{
                                padding: '1rem 2.5rem',
                                borderRadius: '12px',
                                textDecoration: 'none',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                            }}>
                                Explore Curriculum
                            </Link>
                        </div>
                    </div>

                    {/* Right Side Visual */}
                    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                         <div style={{
                             width: '450px', height: '450px',
                             background: 'radial-gradient(circle, rgba(0,210,220,0.1) 0%, transparent 70%)',
                             borderRadius: '50%',
                             display: 'flex', alignItems: 'center', justifyContent: 'center',
                             position: 'relative'
                         }}>
                             <div style={{
                                 width: '180px', height: '180px',
                                 background: 'var(--bg-tertiary)',
                                 borderRadius: '50%',
                                 display: 'flex', alignItems: 'center', justifyContent: 'center',
                                 boxShadow: '0 20px 40px var(--glass-shadow)',
                                 border: '4px solid var(--glass-border)'
                             }}>
                                 <span style={{ fontSize: '4.5rem' }}>✨</span>
                             </div>
                         </div>
                    </div>
                </div>
            </section>

            {/* 2. 🧩 INTELLIGENT LEARNING MODULES */}
            <section className="container" style={{ padding: '140px 4rem' }}>
                <div style={{ textAlign: 'center', marginBottom: '5.5rem' }}>
                    <h2 style={{ fontSize: '3.2rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1.5px' }}>
                        Intelligent Learning <span style={{ color: 'var(--primary-400)' }}>Modules</span>
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginTop: '1rem', maxWidth: '700px', margin: '1rem auto 0' }}>
                        Four AI-powered modules work in concert to accelerate your engineering mastery.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2rem' }}>
                    {[
                        { title: 'AI Technical Teacher', icon: '🎓', desc: 'Personalized explanations with adaptive depth, powered by advanced AI curriculum synthesis.' },
                        { title: 'Quiz Master', icon: '📋', desc: 'Adaptive assessments that identify knowledge gaps and build mastery through targeted repetition.' },
                        { title: 'Career Pathfinder', icon: '🗺️', desc: 'Data-driven career navigation with real-time market analysis and skill-gap mapping.' },
                        { title: 'Interview Simulation', icon: '💬', desc: 'AI-powered mock interviews with role-specific evaluation and performance analytics.' }
                    ].map((m, i) => (
                        <div key={i} style={{
                            background: 'var(--glass-bg)',
                            backdropFilter: 'blur(16px)',
                            padding: '3.5rem 2.5rem',
                            borderRadius: '32px',
                            boxShadow: 'var(--shadow-lg)',
                            border: '1px solid var(--glass-border)',
                            display: 'flex', flexDirection: 'column', gap: '2rem',
                            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            minHeight: '380px'
                        }}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-6px)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--primary-400)'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.borderColor = ''; }}
                        >
                            <div style={{
                                width: '72px', height: '72px', background: 'var(--bg-tertiary)', borderRadius: '18px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem',
                                border: '1px solid var(--glass-border)'
                            }}>{m.icon}</div>
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.2, letterSpacing: '-0.5px' }}>{m.title}</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.8 }}>{m.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* 3. 🌀 HYPER-LEARNING PATH */}
            <section className="container" style={{ padding: '80px 4rem 140px' }}>
                <div style={{ textAlign: 'center', marginBottom: '5.5rem' }}>
                    <h2 style={{ fontSize: '3.2rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1.5px' }}>
                        Hyper-Learning <span style={{ color: 'var(--primary-400)' }}>Path</span>
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', marginTop: '1rem', maxWidth: '700px', margin: '1rem auto 0' }}>
                        Three-phase methodology designed for accelerated technical mastery.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2.5rem' }}>
                    {[
                        { step: '01', sub: 'STEP 01', title: 'Analyze', desc: 'AI scans your profile, skills, and career goals to build a personalized learning blueprint.' },
                        { step: '02', sub: 'STEP 02', title: 'Synthesize', desc: 'Intelligent curriculum merges theory, practice, and market demands into optimized modules.' },
                        { step: '03', sub: 'STEP 03', title: 'Launch', desc: 'Track progress with real-time analytics as you master each milestone in your journey.' }
                    ].map((s, i) => (
                        <div key={i} style={{
                            background: 'var(--glass-bg)',
                            backdropFilter: 'blur(16px)',
                            padding: '4rem 3.5rem',
                            borderRadius: '32px',
                            boxShadow: 'var(--shadow-md)',
                            border: '1px solid var(--glass-border)',
                            position: 'relative', overflow: 'hidden',
                            minHeight: '320px', display: 'flex', flexDirection: 'column', justifyContent: 'center'
                        }}>
                            <div style={{ position: 'absolute', top: '15px', right: '2rem', fontSize: '6rem', fontWeight: 900, color: 'var(--primary-400)', opacity: 0.06, zIndex: 0 }}>{s.step}</div>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary-400)', background: 'var(--bg-tertiary)', padding: '6px 14px', borderRadius: '8px', width: 'fit-content', marginBottom: '2rem', textTransform: 'uppercase', letterSpacing: '0.5px', border: '1px solid var(--glass-border)' }}>{s.sub}</div>
                                <h3 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '1.25rem' }}>{s.title}</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: 1.75 }}>{s.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* 4. ⚙️ CORE ENGINE */}
            <section className="container" style={{ padding: '0 4rem 140px' }}>
                <div style={{ textAlign: 'center', marginBottom: '5.5rem' }}>
                    <h2 style={{ fontSize: '3.2rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1.5px' }}>
                        Core <span style={{ color: 'var(--primary-400)' }}>Engine</span>
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.15rem', marginTop: '1rem' }}>High-performance tools powering your learning journey.</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '2rem' }}>
                    {[
                        { title: 'CodeX Intelligence', icon: '⌨️', desc: 'Real-time code analysis, optimization suggestions, and mentor feedback loops.' },
                        { title: 'Precision Assessment', icon: '🎯', desc: 'Multi-dimensional evaluation across technical depth, clarity, and applied knowledge.' },
                        { title: 'Adaptive AI', icon: '📈', desc: 'Models that evolve with your learning style, pace, and domain expertise.' },
                        { title: 'Instant Feedback', icon: '⚡', desc: 'Sub-second analysis with actionable insights on every submission.' }
                    ].map((m, i) => (
                        <div key={i} style={{
                            background: 'var(--glass-bg)',
                            backdropFilter: 'blur(16px)',
                            padding: '3.5rem 2.5rem',
                            borderRadius: '24px',
                            boxShadow: 'var(--shadow-sm)',
                            border: '1px solid var(--glass-border)',
                            display: 'flex', flexDirection: 'column', gap: '1.5rem',
                            minHeight: '280px',
                            transition: 'all 0.3s ease'
                        }}>
                            <div style={{
                                width: '48px', height: '48px', background: 'var(--bg-tertiary)', borderRadius: '10px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem',
                                border: '1px solid var(--glass-border)'
                            }}>{m.icon}</div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)' }}>{m.title}</h3>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>{m.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* 5. 🤖 AI Mentorship */}
            <section className="container" style={{ padding: '0 4rem 140px' }}>
                <div style={{ textAlign: 'center', marginBottom: '5.5rem' }}>
                    <h2 style={{ fontSize: '3.2rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-1.5px' }}>
                        AI <span style={{ color: 'var(--primary-400)' }}>Mentorship</span>
                    </h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '2.5rem' }}>
                    <div style={{
                        background: 'var(--glass-bg)', backdropFilter: 'blur(16px)',
                        padding: '4.5rem 4rem', borderRadius: '36px',
                        boxShadow: 'var(--shadow-md)', border: '1px solid var(--glass-border)'
                    }}>
                        <h3 style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '3rem' }}>Platform Intelligence</h3>
                        <div className="flex-col" style={{ gap: '2rem' }}>
                            {[
                                { t: 'Domain-specific curriculum tailored to industry demands', icon: '📖' },
                                { t: 'AI mentors specialized across 9 engineering domains', icon: '🤝' },
                                { t: 'Real-time market skill tracking and gap analysis', icon: '📉' },
                                { t: 'Gamified progression with XP, badges, and streaks', icon: '🏅' }
                            ].map((f, i) => (
                                <div key={i} className="flex items-center" style={{ gap: '1.5rem' }}>
                                    <div style={{ width: '48px', height: '48px', background: 'var(--bg-tertiary)', borderRadius: '12px', display: 'grid', placeItems: 'center', fontSize: '1.3rem', border: '1px solid var(--glass-border)', flexShrink: 0 }}>{f.icon}</div>
                                    <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{f.t}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        {[
                            { val: '47.2%', label: 'Faster skill acquisition' },
                            { val: '9', label: 'Engineering domains' },
                            { val: '10K+', label: 'Active learners' },
                            { val: '98%', label: 'Satisfaction rate' }
                        ].map((m, i) => (
                            <div key={i} style={{
                                background: 'var(--glass-bg)', backdropFilter: 'blur(16px)',
                                padding: '3rem 2rem', borderRadius: '28px',
                                boxShadow: 'var(--shadow-sm)', border: '1px solid var(--glass-border)',
                                textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.75rem'
                            }}>
                                <h4 style={{ fontSize: '2.8rem', fontWeight: 900, color: 'var(--primary-400)', letterSpacing: '-1.5px' }}>{m.val}</h4>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 6. 🔥 FINAL CTA */}
            <section className="container" style={{ padding: '0 4rem 180px' }}>
                <div style={{
                    background: 'var(--glass-bg)', backdropFilter: 'blur(20px)',
                    padding: '6rem 2rem', borderRadius: '40px',
                    boxShadow: 'var(--shadow-xl)', border: '1px solid var(--glass-border)',
                    textAlign: 'center'
                }}>
                    <h2 style={{ fontSize: '2.8rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '1rem' }}>
                        Ready to <span style={{ color: 'var(--primary-400)' }}>Launch</span>?
                    </h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1rem', maxWidth: '500px', margin: '0 auto 2.5rem', lineHeight: 1.6 }}>
                        Join thousands of engineers accelerating their careers with AI-powered learning.
                    </p>
                    <Link to="/assistant" className="btn btn-primary" style={{
                        padding: '1.2rem 3.5rem', borderRadius: '12px',
                        textDecoration: 'none', fontWeight: 800, fontSize: '1rem'
                    }}>
                        Get Started <span>→</span>
                    </Link>
                </div>
            </section>

            {/* 7. FOOTER */}
            <footer style={{ padding: '4rem 0', borderTop: '1px solid var(--glass-border)', textAlign: 'center' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>© 2026 Edunovas. All rights reserved.</p>
            </footer>
        </div>
    );
};
