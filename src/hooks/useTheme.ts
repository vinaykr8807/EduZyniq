import { useState, useEffect } from 'react';

export type Theme = 'cyan-dark' | 'light' | 'midnight';

const THEMES: Theme[] = ['cyan-dark', 'light', 'midnight'];

const THEME_META: Record<Theme, { label: string; icon: string }> = {
    'cyan-dark':  { label: 'Cyan Night',  icon: '🌊' },
    'light':      { label: 'Daylight',    icon: '☀️' },
    'midnight':   { label: 'Midnight',    icon: '🌙' },
};

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(() => {
        return (localStorage.getItem('eduzyniq_theme') as Theme) || 'cyan-dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('eduzyniq_theme', theme);
    }, [theme]);

    const cycleTheme = () => {
        setTheme((prev) => {
            const idx = THEMES.indexOf(prev);
            return THEMES[(idx + 1) % THEMES.length];
        });
    };

    return { theme, setTheme, cycleTheme, meta: THEME_META[theme] };
}
