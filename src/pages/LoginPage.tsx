import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API_BASE_URL, { apiFetch } from '../config';

export const LoginPage: React.FC = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [role, setRole] = useState<'student' | 'admin'>('student');
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [welcomeName, setWelcomeName] = useState('');
    const [showPopup, setShowPopup] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        // Migration logic: prevent logging out existing users after rename
        const oldUserStr = localStorage.getItem('edunovas_user');
        const newUserStr = localStorage.getItem('eduzyniq_user');
        if (oldUserStr && !newUserStr) {
            localStorage.setItem('eduzyniq_user', oldUserStr);
            localStorage.removeItem('edunovas_user');
        }

        const userStr = localStorage.getItem('eduzyniq_user');
        if (userStr) {
            try {
                const user = JSON.parse(userStr);
                if (user.full_name) {
                    setWelcomeName(user.full_name);
                    setShowPopup(true);
                    setTimeout(() => setShowPopup(false), 4000);

                    // Already logged in, redirect to dashboard
                    setTimeout(() => {
                        navigate(user.role === 'admin' ? '/admin' : '/assistant');
                    }, 1500);
                }
            } catch (e) {
                localStorage.removeItem('eduzyniq_user');
            }
        }
    }, [navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!isLogin && password !== confirmPassword) {
            setError("Passwords don't match");
            return;
        }

        setIsLoading(true);
        console.log(`Attempting ${isLogin ? 'login' : 'signup'} for ${email}...`);

        try {
            const controller = new AbortController();
            const timeoutMs = 30000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const targetUrl = `${API_BASE_URL}${isLogin ? '/login' : '/signup'}`;

            const response = await apiFetch(targetUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    role,
                    full_name: isLogin ? undefined : fullName
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();
            console.log("Response received:", data);

            if (response.ok) {
                localStorage.setItem('eduzyniq_user', JSON.stringify({
                    email: data.email,
                    role: data.role,
                    token: data.access_token,
                    full_name: data.full_name
                }));

                setWelcomeName(data.full_name || data.email);
                setShowPopup(true);

                // Small delay to show popup before navigation
                setTimeout(() => {
                    navigate(data.role === 'admin' ? '/admin' : '/assistant');
                }, 1000);
            } else {
                setError(data.detail || 'Authentication failed. Check your credentials.');
                setIsLoading(false);
            }
        } catch (err: any) {
            console.error("Fetch error:", err);
            const targetUrl = `${API_BASE_URL}${isLogin ? '/login' : '/signup'}`;
            if (err.name === 'AbortError') {
                setError(`Connection timed out at ${targetUrl} after 30s. The backend health check may be up, but auth or the database request did not finish.`);
            } else {
                setError(`Failed to connect to ${targetUrl}. Error: ${err.message || 'Unknown network error'}`);
            }
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center" style={{ minHeight: '100vh', padding: '1rem', background: 'var(--bg-primary)', position: 'relative', overflow: 'hidden' }}>
            {/* Background Accent Graphics */}
            <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '400px', height: '400px', background: 'var(--primary-500)', filter: 'blur(200px)', opacity: 0.15, borderRadius: '50%' }} />
            <div style={{ position: 'absolute', bottom: '-10%', right: '-10%', width: '400px', height: '400px', background: 'var(--accent-blue)', filter: 'blur(200px)', opacity: 0.15, borderRadius: '50%' }} />

            {/* Back to Home Button */}
            <button 
                onClick={() => navigate('/')} 
                className="btn btn-secondary" 
                style={{ position: 'absolute', top: '1.5rem', left: '1.5rem', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', zIndex: 10, fontSize: '0.85rem' }}
            >
                ← Back to Home
            </button>

            {/* Success Popup */}
            {showPopup && (
                <div style={{
                    position: 'fixed', top: '40px', left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--primary-500)', border: '1px solid var(--primary-400)',
                    padding: '1.25rem 2.5rem', borderRadius: 'var(--radius-lg)', color: 'white',
                    fontWeight: 700, fontSize: '1rem', boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)',
                    zIndex: 10000, animation: 'slideDown 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)'
                }}>
                    ✨ Hello, {welcomeName}!
                </div>
            )}

            <div className="glass-card" style={{ maxWidth: '420px', width: '100%', padding: '3rem 2.5rem', position: 'relative', zIndex: 5 }}>
                {/* Logo */}
                <div style={{ width: '48px', height: '48px', background: 'var(--primary-500)', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.5rem', fontWeight: 800, margin: '0 auto 1.5rem', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>E</div>
                
                {/* Headers */}
                <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 0.5rem', textAlign: 'center' }}>
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </h1>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 2rem' }}>
                    {isLogin ? 'Sign in to continue' : 'Join the platform to begin'}
                </p>

                {/* Role Toggle */}
                <div style={{ display: 'flex', background: 'rgba(0,0,0,0.1)', borderRadius: '12px', padding: '4px', marginBottom: '1.5rem', border: '1px solid var(--glass-border)' }}>
                    <button type="button" onClick={() => setRole('student')} style={{ flex: 1, padding: '0.6rem', border: 'none', background: role === 'student' ? 'var(--primary-500)' : 'transparent', color: role === 'student' ? 'white' : 'var(--text-secondary)', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>Student</button>
                    <button type="button" onClick={() => setRole('admin')} style={{ flex: 1, padding: '0.6rem', border: 'none', background: role === 'admin' ? 'var(--primary-500)' : 'transparent', color: role === 'admin' ? 'white' : 'var(--text-secondary)', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>Admin</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {!isLogin && (
                        <input type="text" className="input-field" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required={!isLogin} style={{ width: '100%', padding: '0.9rem 1.2rem' }} />
                    )}

                    <input type="email" className="input-field" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%', padding: '0.9rem 1.2rem' }} />

                    <div style={{ position: 'relative' }}>
                        <input type={showPassword ? "text" : "password"} className="input-field" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%', padding: '0.9rem 2.5rem 0.9rem 1.2rem' }} maxLength={72} />
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }} onClick={() => setShowPassword(!showPassword)}>
                            {showPassword ? (
                                <>
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                </>
                            ) : (
                                <>
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </>
                            )}
                        </svg>
                    </div>

                    {!isLogin && (
                        <div style={{ position: 'relative' }}>
                            <input type={showPassword ? "text" : "password"} className="input-field" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required={!isLogin} style={{ width: '100%', padding: '0.9rem 1.2rem' }} maxLength={72} />
                        </div>
                    )}

                    {error && (
                        <div style={{ padding: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', fontSize: '0.85rem', color: '#f87171', fontWeight: 500, textAlign: 'center' }}>
                            {error}
                        </div>
                    )}

                    <button type="submit" disabled={isLoading} className="btn btn-primary" style={{ width: '100%', padding: '0.9rem', fontSize: '0.95rem', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '0.5rem' }}>
                        {isLoading ? (
                            <div style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                        ) : (isLogin ? 'Login' : 'Sign Up')}
                    </button>
                    
                    <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '1rem 0 0' }}>
                        {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                        <span onClick={() => { setIsLogin(!isLogin); setError(''); }} style={{ color: 'var(--primary-400)', cursor: 'pointer', fontWeight: 700 }}>
                            {isLogin ? 'Sign Up' : 'Login'}
                        </span>
                    </p>
                </form>
            </div>

            <style>{`
                @keyframes slideDown { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};
