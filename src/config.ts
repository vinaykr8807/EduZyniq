const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';
export default API_BASE_URL;

// Wrapper that auto-adds ngrok bypass header so the warning page doesn't block API calls
export const apiFetch = (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    headers.set('ngrok-skip-browser-warning', 'true');
    return fetch(url, { ...options, headers });
};

