import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from '../components/Navbar';

export const MainLayout = () => {
    const isHome = useLocation().pathname === '/';
    return (
        <div className="flex-col min-h-screen">
            <Navbar />
            <main className={isHome ? "" : "container"} style={{ flex: 1 }}>
                <Outlet />
            </main>
            {!isHome && (
                <footer style={{
                    marginTop: 'auto',
                    padding: '3rem 0',
                    borderTop: '1px solid var(--glass-border)',
                }} className="text-center">
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        © 2026 EduZyniq. All rights reserved.
                    </p>
                </footer>
            )}
        </div>
    );
};
