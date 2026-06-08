export const DOMAIN_ROLE_MAP: Record<string, string> = {
    'Full Stack Development': 'Fullstack Developer',
    'Generative AI & Machine Learning': 'ML Engineer',
    'Cyber Security': 'Cyber Security Analyst',
    'DevOps & Cloud Engineering': 'DevOps Engineer',
    'Cloud Solutions Architecture': 'Cloud Architect',
    'UI/UX Design': 'UI/UX Designer',
    'Core CS & Algorithms': 'Backend Engineer',
    'Data Engineering & MLOps': 'Data Scientist',
    'Quantum Computing': 'Quantum Computing Researcher'
};

export const ROLE_DOMAIN_MAP: Record<string, string> = Object.fromEntries(
    Object.entries(DOMAIN_ROLE_MAP).map(([domain, role]) => [role, domain])
);

export const TARGET_ROLES = Object.values(DOMAIN_ROLE_MAP);

export const getRoleForDomain = (domain?: string) => {
    return domain ? DOMAIN_ROLE_MAP[domain] || '' : '';
};

export const getDomainForRole = (role?: string) => {
    return role ? ROLE_DOMAIN_MAP[role] || '' : '';
};
