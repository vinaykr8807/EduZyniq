import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Breakpoint = 'mobile' | 'tablet' | 'desktop';

interface ResponsiveContextValue {
    width: number;
    breakpoint: Breakpoint;
    isMobile: boolean;
    isTablet: boolean;
    isDesktop: boolean;
}

const DEFAULT_WIDTH = typeof window !== 'undefined' ? window.innerWidth : 1440;

const ResponsiveContext = createContext<ResponsiveContextValue>({
    width: DEFAULT_WIDTH,
    breakpoint: 'desktop',
    isMobile: false,
    isTablet: false,
    isDesktop: true,
});

const getBreakpoint = (width: number): Breakpoint => {
    if (width <= 767) return 'mobile';
    if (width <= 1100) return 'tablet';
    return 'desktop';
};

export const ResponsiveProvider = ({ children }: { children: React.ReactNode }) => {
    const [width, setWidth] = useState(DEFAULT_WIDTH);

    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const value = useMemo(() => {
        const breakpoint = getBreakpoint(width);
        return {
            width,
            breakpoint,
            isMobile: breakpoint === 'mobile',
            isTablet: breakpoint === 'tablet',
            isDesktop: breakpoint === 'desktop',
        };
    }, [width]);

    return (
        <ResponsiveContext.Provider value={value}>
            {children}
        </ResponsiveContext.Provider>
    );
};

export const useResponsive = () => useContext(ResponsiveContext);
