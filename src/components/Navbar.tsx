import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useResponsive } from '../hooks/useResponsive';

export const Navbar: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { theme, cycleTheme, meta } = useTheme();
    const { isMobile, isTablet } = useResponsive();

    const userStr = localStorage.getItem('eduzyniq_user');
    let user = null;
    if (userStr) {
        try { user = JSON.parse(userStr); }
        catch (e) { localStorage.removeItem('eduzyniq_user'); }
    }

    const navLinks = [
        { name: 'Home', path: '/' },
        { name: 'Curriculum', path: '/curriculum' },
    ];
    if (user?.role === 'student') navLinks.push({ name: 'Career Forge', path: '/assistant' });
    if (user?.role === 'admin')   navLinks.push({ name: 'Dashboard', path: '/admin' });

    const handleLogout = () => {
        localStorage.removeItem('eduzyniq_user');
        localStorage.removeItem('eduzyniq_profile');
        navigate('/login');
    };

    const isLight = theme === 'light';

    return (
        <nav style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100%',
            zIndex: 100,
            background: 'var(--nav-bg)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            borderBottom: '1px solid var(--nav-border)',
            padding: '0.75rem 0',
            transition: 'background 0.4s ease, border-color 0.4s ease',
        }}>
            <div
                className="container"
                style={{
                    padding: isMobile ? '0 1rem' : isTablet ? '0 1.5rem' : '0 3rem',
                    maxWidth: '100%',
                }}
            >
                <div
                    className="flex items-center justify-between"
                    style={{
                        gap: '1rem',
                        flexWrap: isMobile ? 'wrap' : 'nowrap',
                        width: '100%',
                    }}
                >

                {/* Logo */}
                <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{
                        width: '30px', height: '30px',
                        background: 'linear-gradient(135deg, var(--primary-500), var(--secondary-500))',
                        borderRadius: '8px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 900, color: 'white', fontSize: '0.95rem',
                        boxShadow: '0 0 12px rgba(0,210,220,0.3)',
                    }}>E</div>
                    <span style={{
                        fontSize: '1.15rem', fontWeight: 800,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.5px',
                    }}>EduZyniq</span>
                </Link>

                {/* Centered Links */}
                <div
                    className="flex items-center"
                    style={{
                        gap: isTablet ? '1rem' : '2rem',
                        position: isMobile ? 'static' : 'absolute',
                        left: isMobile ? undefined : '50%',
                        transform: isMobile ? undefined : 'translateX(-50%)',
                        order: isMobile ? 3 : undefined,
                        width: isMobile ? '100%' : 'auto',
                        justifyContent: isMobile ? 'center' : 'flex-start',
                        flexWrap: 'wrap',
                    }}
                >
                    {navLinks.map((link) => (
                        <Link
                            key={link.path}
                            to={link.path}
                            style={{
                                textDecoration: 'none',
                                color: location.pathname === link.path ? 'var(--nav-active)' : 'var(--nav-text)',
                                fontWeight: 600,
                                fontSize: '0.84rem',
                                transition: 'color 0.2s ease',
                                borderBottom: location.pathname === link.path ? '2px solid var(--nav-active)' : '2px solid transparent',
                                paddingBottom: '3px',
                            }}
                        >
                            {link.name}
                        </Link>
                    ))}
                </div>

                {/* Right Actions */}
                <div className="flex items-center" style={{ gap: '0.75rem', marginLeft: isMobile ? 'auto' : undefined }}>
                    {/* ─── Theme Cycle Button ─── */}
                    <button
                        onClick={cycleTheme}
                        className="theme-toggle"
                        title={`Switch theme (current: ${meta.label})`}
                        aria-label="Switch theme"
                    >
                        <span style={{ fontSize: '1rem' }}>{meta.icon}</span>
                        <span className="mobile-hide">{meta.label}</span>
                    </button>

                    {!user ? (
                        <Link to="/login" className="btn btn-primary" style={{ padding: '0.45rem 1.1rem', fontSize: '0.83rem' }}>
                            Login
                        </Link>
                    ) : (
                        <>
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }} className="mobile-hide">
                                {user.email}
                            </span>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-xs"
                                style={{
                                    background: isLight ? 'white' : 'var(--glass-bg)',
                                    border: '1px solid var(--glass-border)',
                                    padding: '0.45rem 1rem',
                                    borderRadius: '8px',
                                    fontSize: '0.78rem',
                                    color: 'var(--nav-text)',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    backdropFilter: 'blur(8px)',
                                }}
                            >
                                <span>Logout</span>
                                <span>🚪</span>
                            </button>
                        </>
                    )}
                </div>
                </div>
            </div>
        </nav>
    );
};
