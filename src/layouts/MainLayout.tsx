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
                    borderTop: '1px solid #f1f5f9',
                }} className="text-center">
                    <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                        © 2026 Edunovas. All rights reserved.
                    </p>
                </footer>
            )}
        </div>
    );
};
