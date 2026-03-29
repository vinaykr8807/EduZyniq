import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

export const Navbar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const userStr = localStorage.getItem('edunovas_user');
    let user = null;
    if (userStr) {
        try {
            user = JSON.parse(userStr);
        } catch (e) {
            localStorage.removeItem('edunovas_user');
        }
    }

    const navLinks = [
        { name: 'Home', path: '/' },
        { name: 'Curriculum', path: '/curriculum' },
    ];

    if (user?.role === 'student') {
        navLinks.push({ name: 'Career Forge', path: '/assistant' });
    }

    if (user?.role === 'admin') {
        navLinks.push({ name: 'Dashboard', path: '/admin' });
    }

    const handleLogout = () => {
        localStorage.removeItem('edunovas_user');
        localStorage.removeItem('edunovas_profile');
        navigate('/login');
    };

    return (
        <nav style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            zIndex: 100,
            background: 'rgba(255, 255, 255, 0.8)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(230, 235, 245, 0.6)',
            padding: '0.8rem 0'
        }}>
            <div className="container flex items-center justify-between" style={{ padding: '0 4rem', paddingTop: 0, maxWidth: '100%' }}>
                {/* Logo */}
                <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                        width: '32px',
                        height: '32px',
                        background: '#3b82f6',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        color: 'white',
                        fontSize: '1rem'
                    }}>E</div>
                    <span style={{
                        fontSize: '1.2rem',
                        fontWeight: 800,
                        color: '#1e293b',
                        letterSpacing: '-0.5px'
                    }}>Edunovas</span>
                </Link>

                {/* Centered Links */}
                <div className="flex items-center" style={{ gap: '2rem', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                    {navLinks.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            style={{
                                textDecoration: 'none',
                                color: location.pathname === link.path ? '#3b82f6' : '#64748b',
                                fontWeight: 500,
                                fontSize: '0.85rem',
                                transition: 'color 0.2s ease',
                                borderBottom: location.pathname === link.path ? '2px solid #3b82f6' : '2px solid transparent',
                                paddingBottom: '4px'
                            }}
                        >
                            {link.name}
                        </Link>
                    ))}
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-md">
                    {!user ? (
                        <Link to="/login" className="btn btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', background: '#3b82f6' }}>
                            Login
                        </Link>
                    ) : (
                        <>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }} className="mobile-hide">{user.email}</span>
                            <button onClick={handleLogout} className="flex items-center gap-xs" style={{ 
                                background: 'white', 
                                border: '1px solid #e2e8f0', 
                                padding: '0.5rem 1rem', 
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                color: '#475569',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}>
                                <span>Logout</span>
                                <span>🚪</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};
