# Edunovas Frontend — UI Recreation Prompt

## Stack
React 19 + TypeScript + Vite + React Router v6. Backend at `http://127.0.0.1:8000`.

---

## Design System

**Light glassmorphism theme with soft blue accents, matching the reference screenshots:**

```css
--bg-base: #eef4fb;
--bg-surface: rgba(255,255,255,0.52);
--bg-elevated: rgba(255,255,255,0.72);
--primary: #2563eb;
--primary-strong: #1d4ed8;
--primary-soft: #dbeafe;
--primary-glow: rgba(37,99,235,0.18);
--accent-sky: #38bdf8;
--accent-navy: #1e3a8a;
--text-primary: #111827;
--text-secondary: #526581;
--text-muted: #7b8ba5;
--border: rgba(148,163,184,0.26);
--border-active: rgba(37,99,235,0.34);
--shadow-soft: 0 12px 40px rgba(148,163,184,0.18);
--shadow-glow: 0 10px 35px rgba(37,99,235,0.14);
```

**Visual rules:**
- Overall look: airy, bright, elegant portfolio aesthetic with frosted glass panels and subtle blue illumination
- Backgrounds: layered off-white to pale-blue gradients with very soft radial blue glows; avoid dark sections, heavy textures, and saturated neon
- Glass surfaces: `background: linear-gradient(135deg, rgba(255,255,255,0.60), rgba(255,255,255,0.32))` + `border: 1px solid rgba(255,255,255,0.55)` + `backdrop-filter: blur(18px)` + soft shadow
- Hover/active treatment: crisp blue underline, light border emphasis, restrained glow such as `box-shadow: 0 0 0 1px rgba(37,99,235,0.18), 0 12px 30px rgba(37,99,235,0.12)`
- Section spacing: roomy and minimal, with lots of breathing space similar to a premium personal portfolio
- Fonts: **Inter** or **Manrope** for body + **Sora** or **Space Grotesk** for headings; keep typography clean, bold, and highly legible
- Imagery: circular profile image with soft blue halo; icons sit inside pale blue rounded-square containers
- UI tone: polished and professional; avoid emoji-heavy labels, playful badges, or flashy microcopy that breaks the calm portfolio feel

---

## Routes

```
/login        → LoginPage (public)
/             → MainLayout > Home
/curriculum   → MainLayout > CurriculumPage
/assistant    → MainLayout > Assistant  [ProtectedRoute: role=student]
/admin        → MainLayout > AdminDashboard  [ProtectedRoute: role=admin]
```

Auth: read `localStorage.edunovas_user` → `{ email, role, token, full_name }`. Missing → `/login`. Role mismatch → `/`.

---

## Page Specs

---

### LoginPage `/login`

Full-screen centered frosted-glass card on a soft light-blue gradient background.

**Features:**
- Role toggle pill (Student / Admin) with sliding indicator
- Fields: Full Name (signup), Email, Password, Confirm Password (signup)
- Show/Hide password toggle
- Success toast slides from top: `"Welcome, {full_name}"`
- Error banner (red left border)
- Loading spinner in submit button
- Toggle Login ↔ Sign Up

**API:**
- `POST /login` → `{ email, password, role }`
- `POST /signup` → `{ email, password, role, full_name }`
- Store `{ email, role, token, full_name }` in `localStorage.edunovas_user`
- Redirect: admin → `/admin`, student → `/assistant`

---

### Navbar (fixed, all routes except `/login`)

- Style: translucent light glass bar with blur, thin border, and subtle bottom shadow
- Logo: clean blue mark + "Edunovas" wordmark
- Links: Home, Curriculum + "Career Forge" (student) or "Dashboard" (admin)
- Active link: `--primary` color with slim underline, matching the screenshots
- Right: Login button (guest) OR email + Logout button
- Mobile: collapse neatly and keep the glass effect intact

---

### Home `/`

**Hero:** full-width light gradient background with subtle blue blur glows, fixed glass navbar, compact uppercase badge, bold black/navy headline with selective blue emphasis, calm supporting paragraph, and optional circular portrait/image with blue halo on the right. Overall composition should feel very close to the provided screenshots: minimal, spacious, and premium.

**Feature cards (4, auto-fit minmax 320px):** AI Technical Teacher, Quiz Master, Career Pathfinder, Interview Simulation. Each card uses glassmorphism, rounded corners, pale blue icon tile, subtle border, and restrained hover lift.

**Hyper-Learning Path (3 steps):** present as elegant glass cards or timeline panels, not dark product cards. Use small uppercase step labels, blue micro-accents, and clean explanatory text.

**Core Engine (4 cards):** glass cards with light iconography, slim borders, soft blur, and blue accent highlights.

**AI Mentorship split:** Left frosted panel with 4 bullet features + right stats grid in matching glass tiles. Keep numbers bold and blue, surfaces bright, and spacing generous.

**Final CTA:** full-width light glass panel with a strong blue primary button and understated secondary text.

**Important visual direction for all home sections:**
- Prefer white, ice-blue, and slate text tones over dark-theme contrast
- Use blue as the only major accent family
- Keep shadows soft and diffused
- Avoid purple neon, cyberpunk styling, dense gradients, or overly game-like UI
- Match the screenshot mood: polished personal-portfolio style, not SaaS dashboard chrome

---

### CurriculumPage `/curriculum`

Two-column: sidebar (300px) + main.

**Sidebar:** Roadmap buttons in light glass cards with icon, title, difficulty, duration. Selected: blue border + soft tint + `translateX(10px)`.

**Main panel:**
- Header: icon + title + description + badge + PDF download + duration inside a frosted glass surface
- Timeline: vertical blue gradient line + numbered phase nodes with soft glow
- Milestone cards grid (auto-fit minmax 300px): title, description, skill badges in airy glass cards
- CTA: `"Start This Journey"` with blue primary styling

**API:** `POST /download-roadmap-pdf` → roadmap JSON → blob download

**Data:** 9 roadmaps from `CURRICULUM_DATA` (Core CS, Data Engineering, Full Stack, GenAI/ML, Cyber Security, DevOps, Cloud Architecture, Quantum Computing, UI/UX Design)

---

### Assistant `/assistant`

Shell page. `view` state controls active module: `dashboard | chat | interview | quiz | coding | pathfinder | teacher | stats`

**Top bar:** Back button (non-dashboard) + `SYSTEM_STATUS: OPERATIONAL` badge inside a compact glass strip.

**Profile Dialog (modal, first visit):** Shown if `progress.profile_completed === false`. Fields: Degree, Year, Domain, Branch. Optional resume upload → `POST /upload-resume`. Save → `POST /save-profile?user_email=`. Dismissed via `sessionStorage.edunovas_onboarding_dismissed`. Modal should use bright glassmorphism, pale blue field backgrounds, soft blur, and clean professional spacing.

**Module map:**
| view | Component |
|------|-----------|
| dashboard | ForgeDashboard |
| interview | InterviewCoach |
| quiz | QuizMaster |
| coding | CodingMentor |
| pathfinder | CareerPathfinder |
| teacher | Teacher |
| stats | Analytics |
| chat | ChatWindow |

**Hook `useEdunovas`:** manages activeMode, messages, isTyping, profile, progress, stats. All fetches to `http://127.0.0.1:8000`.

---

### ForgeDashboard

Two-column: main (1fr) + sidebar (320px).

**Header:** "Forge Launchpad" bold title with blue emphasis + domain subtitle + Level/XP pill in glass.

**Metrics (3 cards):** Quiz Accuracy %, Interview Readiness %, Code Optimization % in frosted cards with blue-tinted progress bars and subtle highlights.

**Module cards (5, auto-fill minmax 280px):**
- Interview Coach → `INTERVIEWER` (blue)
- AI Teacher → `TEACHER` (royal blue)
- Quiz Master → `QUIZ` (sky blue)
- Coding Mentor → `CODING_MENTOR` (steel blue)
- Career Pathfinder → `ROADMAP` (cyan-blue)

Each: icon box, name, tag, description, arrow circle. Click → `onSelectModule(id)`.

Each card should use pale icon tiles, soft border, light shadow, and restrained hover lift.

**Sidebar:** RoadmapSelector widget + Rewards card (badges + streak) + Next Objective card, all styled as layered glass panels.

---

### InterviewCoach

Two-column: config (320px) + results.

**Config panel:** Role select, Domain select, Level select, resume drag-drop, 4 action buttons (Analyze Resume, Pro Mentor, Market Analytics, Start Mock Interview) inside a sticky light glass card.

**Results tabs (shown when data exists):** Skill Gap | Roadmap | Market Trends | Pro Mentor | Mock Interview | ATS Audit. Use slim blue underline for active tab, not dark segmented controls.

**Skill Gap:** Readiness score + resume skills badges + matching/missing market skills grid + strong domains + missing skills list in white/blue glass cards.

**ATS Audit:** Score (colored ≥80/≥50/<50) + 5 breakdown bars + keywords found/missing + improvement suggestions. Use blue for positive emphasis, amber for caution, red only for critical gaps.

**Roadmap:** 4 phases with left-border blue sections and soft frosted containers.

**Market Trends:** Demand bar chart + market pulse card + historical bar chart (2021–2025) on bright card surfaces with thin grid lines.

**Pro Mentor:** Guide title + summary + numbered phases + soft skills + trends badges with clean portfolio-style spacing.

**Mock Interview:**
- Active: question card + textarea + voice button (soft pulsing accent) + Submit
- Complete: per-question score, strengths/weaknesses/improved answer, Retake button in consistent light-glass cards

**API:** `/analyze-resume`, `/teacher/market-skills`, `/coach/beginner-guide`, `/coach/mock-interview/plan`, `/coach/mock-interview/question`, `/coach/mock-interview/evaluate`, `/save-interview-session`, `/student/profile`, `/coach/historical-trends`

---

### QuizMaster

**Toggle:** Curriculum / Custom Topic (pill top-right).

**Config (left panel):**
- Curriculum: Roadmap → Phase → Milestone (cascading selects)
- Custom: Subject + Topic inputs
- Difficulty: Easy / Medium / Hard toggle
- Start button

**Mode cards (right, 2-col):** Ultimate Assessment, Teach the AI, Adaptive Recovery. Present them as premium glass cards with pale icon tiles and blue active states.

**Teach the AI:** Textarea (min 300px) + topic display + `"AI EVALUATE ME →"` button on light surfaces.

**Teach result:** accuracy/10 + clarity/10 + mentor feedback + missing concepts badges in soft glass sections.

**Active quiz (2-col: question + sidebar):**
- Question + optional image + optional code block
- MCQ options (A/B/C/D letter index, selected state) as rounded glass choices with blue selected fill/tint
- Matching type: Terms column ↔ Descriptions column + Link button
- Confidence slider (Guessing → Certain)
- Next / Finish button
- Sidebar: Adaptive Stats + Sensei Analysis quote in stacked frosted cards

**Results:** Score % + KnowledgeGraph canvas + Weak Areas card + Hyper-Learning Path card + question review list, all on bright glassmorphism panels.

**API:** `/generate-quiz`, `/student/targeted-quiz`, `/student/weak-areas`, `/submit-quiz`, `/quiz-feedback`, `/evaluate-explanation`, `/student/profile`

---

### CodingMentor — "CodeX Intelligence"

**Header:** Title + language label + Run + Mentor Feedback + language dropdown in a light glass toolbar.

**7 tabs:** Problem | Editor | Sandbox | Analysis | References | Tests | Enhance

**Problem tab:** Dataset (datalist input) or Custom (text input). Selected problem preview. "Start Coding →".

**Editor tab (2-col):**
- Editor uses a softer light-surface code workspace while preserving code readability; avoid full dark-theme chrome around the entire page
- Editor shell: glass frame, filename row, textarea/code area (JetBrains Mono), execution status in toolbar
- Action row: Run, Mentor Feedback, References, Gen Tests, Enhance
- Live analysis panel: alignment banner + OK/Warn/Error counters + issues list

**Sandbox tab:** terminal/output card may remain darker for contrast, but it should sit inside the overall light glassmorphism layout. Keep stdout readable, stderr red, metadata row subtle.

**Analysis tab:** Bug list + insight paragraph + optimized code block + metrics grid in clean bordered cards.

**References tab:** reference cards with code previews, blue links, and frosted panels.

**Tests tab:** Input/Expected/Actual cards with pass/fail pills and light backgrounds.

**Enhance tab:** Performance note + key changes + AI code block + Compare button + side-by-side time/memory bars using blue data accents.

**Languages:** python, javascript, java, cpp, go, rust, php, ruby

**API:** `/codex/problems`, `/execute-code`, `/analyze-code`, `/codex/analyze-lines`, `/codex/check-alignment`, `/codex/references`, `/codex/generate-tests`, `/codex/enhance`, `/codex/compare`

---

### CareerPathfinder

Two-column: inputs (minmax 280px) + results.

**Inputs:** Role select, Level select, City input, resume drag-drop, Analyze button, AI Job Agent subscribe section within a sticky glass panel.

**Results (sequential cards):**
1. Suitability score (large %, soft blue glow)
2. Capability grid: Resume Match, Quiz Capability, Interview Skill
3. Skill Gap: market skills + missing skills (use red only for missing-gap emphasis, otherwise keep blue-neutral styling)
4. Guide To Proceed: Immediate / Short Term / Mid Term / Long Term
5. Roadmap: Foundation / Job Readiness / Interview Prep / Projects
6. Risk Assessment (conditional): level + bar + reasons
7. Historical Market chart (conditional): 2021–2025 bars + top companies
8. Live Job Demand: clickable job cards with suitability %, snippet, skill badges

All result blocks should feel like airy, elevated glass cards with generous padding and subtle blue separators.

**API:** `/career-pathfinder`, `/resume-status`, `/job-agent/subscribe`

---

### Teacher

**Domain picker (no roadmap selected):** Grid of domain cards (auto-fill minmax 260px). Icon, title, description, badges. "MY DOMAIN" tag if matches profile. Use light glass cards with blue icon tiles.

**Main view (2-col: nav 260px + content):**

**Left nav (sticky):** Phase cards with milestone buttons inside translucent panels. Status: pending, learning, done with subtle chips rather than emoji-heavy styling.

**Header:** Back button + roadmap title + progress bar + Recovery Lounge button, all integrated into a polished glass header.

**Recovery Lounge modal:** Weak areas badges + Launch Targeted Quiz + Back buttons in a bright frosted modal.

**Content:**
1. Topic header: phase label, title, description, skill badges, Mark Done button, Download Notes PDF button
2. AI Explanation: Regenerate button + optional image/video + formatted content
3. Doubt chat: bubble UI (user right/blue, assistant left/glass) + voice button + attach button + input + send
4. Notes Library: collapsible grid of saved PDF cards

**Explanation renderer (markdown-like):**
- ` ```d2/graphviz/mermaid ``` ` → DiagramBlock (Kroki API SVG)
- ` ``` ` → readable code block using a slightly deeper panel for contrast while keeping the surrounding layout light
- `### ## #` → headings
- `| table |` → HTML table
- `* - •` → bullets
- `1.` → numbered list
- `**bold**` → strong, `` `code` `` → inline chip

**DiagramBlock:** `POST https://kroki.io/{engine}/svg` → render SVG in a light blue blueprint canvas with crisp borders and subtle grid texture.

**API:** `/teacher/explain`, `/teacher/ask-multimodal`, `/teacher/generate-notes`, `/save-teacher-progress`, `/student/notes`, `/student/profile`, `/student/weak-areas`

---

### Analytics

Two-column grid + full-width insight card.

- Domain Strength: labeled progress bars with blue gradient fill
- Accuracy Trajectory: 4-bar chart (Week 1–3 + Current) with value labels on glass card surfaces
- System Insight: bordered insight card with calm blue-accent styling instead of dark dashboard treatment

Data from props: `stats.domain_strength` (object), `stats.accuracy_trend` (number[4]).

---

### AdminDashboard `/admin`

**Header:** "Admin Console" + icon + `SYSTEM OPERATIONAL` badge in a glass header bar.

**Stats row (6 cards):** Total Students, Total XP, Topics Completed, Interview Sessions, Avg Readiness, Avg Code Optimization in elevated frosted cards with blue numeric emphasis.

**Tabs:** Overview | Student Performance | Market Insights with slim underlines and light surfaces.

**Overview (2-col):** Domain Activity bars + Top Skills badges + Interview Readiness grid + Platform Insight bullets in clean glass sections.

**Market Insights:** Trending Roles bars + Emerging Domains bars + total searches card + Long-term Analysis (2021–2025 bar chart + domain list) + Risk Intelligence (industries list + fraud roles badges), all using light chart containers and blue-led accents.

**Student Performance:** Search input + expandable student cards (avatar, name, email, domain badges, quick stats, expanded detail panels for Teacher/Interview/Coding/Domains) in airy frosted panels.

**API (parallel on mount):** `/admin/analytics`, `/admin/student-performance`, `/admin/market-insights`, `/admin/historical-market-overview`, `/admin/risk-overview`

---

## Shared Components

### ChatWindow
700px height. Mode status bar (persona icon + name). Scrollable messages (user: right/soft blue, assistant: left/glass). Typing dots. Input + blue send button. Keep the control row clean and icon usage minimal.

### KnowledgeGraph (Canvas 400×400)
Orbital layout. Nodes by angle + level radius. Colors: done=`#2563eb`, learning=`#60a5fa`, struggling=`#f59e0b`, idle=`#94a3b8`. Center lines. Concentric rings. Legend.

### ProfileDialog (modal)
Degree, Year, Domain, Branch selects/inputs. Resume upload → auto-fill. Save button (disabled until required fields filled). Use bright glass modal styling and pale blue input surfaces.

### RoadmapSelector (sidebar widget)
List of roadmap buttons → expand to phase/milestone tree + PDF download inside a compact frosted widget.

### ModeCard
Glass card with icon, name, tagline. Active state: blue border + subtle glow dot + light tint.

---

## Global CSS Classes Required

```
.glass-card        light frosted glass surface
.btn               base button
.btn-primary       solid blue or soft blue gradient button with restrained glow
.btn-secondary     transparent glass border button
.input-field       light input with glass background and blue focus ring
.badge             pill badge
.gradient-text     navy→blue gradient clip
.fade-in           fadeIn animation (translateY 20px → 0)
.slide-in          slideIn animation (translateX -20px → 0)
.container         max-width 1400px, centered, padding-top 100px
.flex .flex-col .items-center .justify-between .justify-center
.gap-xs/sm/md/lg/xl
.grid-2 .grid-3 .grid-4  (collapse at 640px → 1col, 1024px → 2col)
.text-center .gradient-text .tracking-tight
```

**Animations:** `fadeIn`, `slideIn`, `pulse`, `spin`, `backgroundFloat`

**Scrollbar:** thin, pale track with blue thumb.

---

## Key Behaviors

| # | Rule |
|---|------|
| 1 | Profile dialog: once per session via `sessionStorage.edunovas_onboarding_dismissed` |
| 2 | Teacher/InterviewCoach/QuizMaster auto-select domain from `profile.domain` on mount |
| 3 | CodingMentor resets all state on language change |
| 4 | CodingMentor debounces line analysis 1200ms after code edit |
| 5 | Mock interview uses Web Speech API (continuous, interim results) |
| 6 | Teacher doubt supports image file attachments (multimodal endpoint) |
| 7 | Admin fetches all 5 endpoints in parallel on mount |
| 8 | All user emails from `JSON.parse(localStorage.edunovas_user || '{}').email` |
| 9 | Quiz confidence slider persists per question index |
| 10 | Navbar shows role-specific links based on `user.role` |

---

## Data Constants

**PERSONAS (8):** ROUTER, INTERVIEWER, QUIZ, ROADMAP, MOTIVATION, CODING_MENTOR, TEACHING, SUPPORT — each with `{ id, name, tagline, icon, color, prompt }`. Keep persona colors within the blue/slate spectrum; reserve amber/red only for warnings and errors.

**CURRICULUM_DATA (9 roadmaps):** Each with `{ id, title, icon, color, description, difficulty, duration, phases[] }` where each phase has `{ name, milestones[] }` and each milestone has `{ title, description, skills[] }`. Roadmap colors should use light blue variants rather than a multicolor rainbow palette.

**StudentProfile type:** `{ degree, branch, year, domain, skills[] }`

**ChatMessage type:** `{ id, role: 'user'|'assistant', content, timestamp, mode? }`
