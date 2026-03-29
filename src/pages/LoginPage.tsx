import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
        const userStr = localStorage.getItem('edunovas_user');
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
                localStorage.removeItem('edunovas_user');
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
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch(`http://127.0.0.1:8000${isLogin ? '/login' : '/signup'}`, {
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
                localStorage.setItem('edunovas_user', JSON.stringify({
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
            const targetUrl = `http://127.0.0.1:8000${isLogin ? '/login' : '/signup'}`;
            if (err.name === 'AbortError') {
                setError(`Connection timed out at ${targetUrl}. Is the backend slow?`);
            } else {
                setError(`Failed to connect to ${targetUrl}. Error: ${err.message || 'Unknown network error'}`);
            }
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center" style={{ minHeight: '100vh', padding: '1rem', background: 'linear-gradient(135deg, #eef2f6 0%, #f8fafc 100%)', position: 'relative' }}>
            {/* Success Popup */}
            {showPopup && (
                <div style={{
                    position: 'fixed', top: '40px', left: '50%', transform: 'translateX(-50%)',
                    background: '#2563eb',
                    padding: '1.25rem 2.5rem', borderRadius: '12px', color: 'white',
                    fontWeight: 700, fontSize: '1rem', boxShadow: '0 10px 30px rgba(37, 99, 235, 0.3)',
                    zIndex: 10000, animation: 'slideDown 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)'
                }}>
                    ✨ Hello, {welcomeName}!
                </div>
            )}

            <div style={{ maxWidth: '420px', width: '100%', background: 'white', borderRadius: '24px', padding: '3rem 2.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.04)' }}>
                {/* Logo */}
                <div style={{ width: '48px', height: '48px', background: '#2563eb', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '1.5rem', fontWeight: 800, margin: '0 auto 1.5rem' }}>E</div>
                
                {/* Headers */}
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '0 0 0.5rem', textAlign: 'center' }}>
                    {isLogin ? 'Welcome Back' : 'Create Account'}
                </h1>
                <p style={{ fontSize: '0.85rem', color: '#64748b', textAlign: 'center', margin: '0 0 2rem' }}>
                    {isLogin ? 'Sign in to continue' : 'Join the platform to begin'}
                </p>

                {/* Role Toggle */}
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '12px', padding: '4px', marginBottom: '1.5rem' }}>
                    <button type="button" onClick={() => setRole('student')} style={{ flex: 1, padding: '0.6rem', border: 'none', background: role === 'student' ? '#2563eb' : 'transparent', color: role === 'student' ? 'white' : '#64748b', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>Student</button>
                    <button type="button" onClick={() => setRole('admin')} style={{ flex: 1, padding: '0.6rem', border: 'none', background: role === 'admin' ? '#2563eb' : 'transparent', color: role === 'admin' ? 'white' : '#64748b', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>Admin</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {!isLogin && (
                        <input type="text" className="input-modern" placeholder="Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} required={!isLogin} />
                    )}

                    <input type="email" className="input-modern" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />

                    <div style={{ position: 'relative' }}>
                        <input type={showPassword ? "text" : "password"} className="input-modern" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ width: '100%' }} maxLength={72} />
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }} onClick={() => setShowPassword(!showPassword)}>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </div>

                    {!isLogin && (
                        <div style={{ position: 'relative' }}>
                            <input type={showPassword ? "text" : "password"} className="input-modern" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required={!isLogin} style={{ width: '100%' }} maxLength={72} />
                        </div>
                    )}

                    {error && (
                        <div style={{ padding: '0.8rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', fontSize: '0.85rem', color: '#ef4444', fontWeight: 500 }}>
                            {error}
                        </div>
                    )}

                    <button type="submit" disabled={isLoading} style={{ width: '100%', padding: '0.9rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 600, cursor: isLoading ? 'default' : 'pointer', marginTop: '0.5rem', transition: 'background 0.2s', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {isLoading ? (
                            <div style={{ width: '20px', height: '20px', border: '3px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                        ) : (isLogin ? 'Login' : 'Sign Up')}
                    </button>
                    
                    <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#94a3b8', margin: '1rem 0 0' }}>
                        {isLogin ? "Don't have an account?" : "Already have an account?"}{' '}
                        <span onClick={() => { setIsLogin(!isLogin); setError(''); }} style={{ color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}>
                            {isLogin ? 'Sign Up' : 'Login'}
                        </span>
                    </p>
                </form>
            </div>

            <style>{`
                @keyframes slideDown { from { transform: translate(-50%, -100%); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
                @keyframes spin { to { transform: rotate(360deg); } }
                .input-modern { 
                    width: 100%; 
                    padding: 0.9rem 1.2rem; 
                    border: 1px solid #e2e8f0; 
                    border-radius: 10px; 
                    font-size: 0.9rem; 
                    color: #334155; 
                    background: white;
                    transition: border-color 0.2s, box-shadow 0.2s;
                    box-sizing: border-box;
                }
                .input-modern::placeholder { color: #94a3b8; }
                .input-modern:focus { 
                    border-color: #2563eb; 
                    outline: none; 
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); 
                }
            `}</style>
        </div>
    );
};
