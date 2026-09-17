import re

css = """
:root {
  --night: #02040a;
  --surface: #0a0e17;
  --surface-raised: #121826;
  --surface-border: rgba(255, 255, 255, 0.06);
  --hairline: rgba(255, 255, 255, 0.08);
  --bone: #f8fafc;
  --bone-dim: #94a3b8;
  --sodium: #f5a623;
  --sand: #ffdd88;
  --cobalt: #38bdf8;
  --validator: #0284c7;
  --ember: #ef4444;
  --rose: #f472b6;
  --display: "Geist", system-ui, sans-serif;
  --body: "Geist", system-ui, sans-serif;
  --mono: "Geist Mono", ui-monospace, monospace;
}

* { box-sizing: border-box; }

html {
  background: var(--night);
  scroll-behavior: smooth;
}

body {
  margin: 0;
  background: var(--night);
  color: var(--bone);
  font-family: var(--body);
  font-size: 1.0625rem;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
  position: relative;
}

/* Premium Noise Overlay */
body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 9999;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.04'/%3E%3C/svg%3E");
  opacity: 0.8;
}

a { color: inherit; text-decoration: none; }

:focus-visible {
  outline: 2px solid var(--sodium);
  outline-offset: 3px;
}

.wrap {
  width: 100%;
  max-width: 1240px;
  margin: 0 auto;
  padding: 0 clamp(1.5rem, 5vw, 3rem);
}

/* ---------- Top bar ---------- */

.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  background: rgba(2, 4, 10, 0.4);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--surface-border);
  transition: all 0.3s ease;
}

.topbar .wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 1.25rem;
  padding-bottom: 1.25rem;
}

.wordmark {
  font-family: var(--display);
  font-weight: 600;
  font-size: 1.4rem;
  letter-spacing: -0.04em;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.wordmark span { color: var(--sodium); }

.topbar nav { display: flex; gap: 2rem; align-items: center; }

.topbar nav a {
  position: relative;
  color: var(--bone-dim);
  font-size: 0.9rem;
  font-weight: 500;
  transition: color 0.2s ease;
}

.topbar nav a:hover { color: var(--bone); }

.topbar nav a.active:not(.nav-cta) {
  color: var(--bone) !important;
}

.topbar nav a.active:not(.nav-cta)::after {
  content: "";
  position: absolute;
  bottom: -22px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--sodium);
  border-radius: 2px 2px 0 0;
  box-shadow: 0 -2px 10px rgba(245, 166, 35, 0.6);
  animation: tabUnderlineIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes tabUnderlineIn {
  from { opacity: 0; transform: scaleX(0); }
  to { opacity: 1; transform: scaleX(1); }
}

.section-target-pulse {
  animation: sectionPulse 1.2s ease-out;
}

@keyframes sectionPulse {
  0% { box-shadow: 0 0 0 0 rgba(245, 166, 35, 0.2); }
  50% { box-shadow: 0 0 40px 10px rgba(245, 166, 35, 0.1); }
  100% { box-shadow: 0 0 0 0 rgba(245, 166, 35, 0); }
}

.topbar nav a.nav-cta {
  color: var(--night);
  background: var(--bone);
  padding: 0.6rem 1.1rem;
  border-radius: 99px;
  font-weight: 600;
  transition: all 0.25s ease;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.1);
}

.topbar nav a.nav-cta:hover { 
  background: #ffffff; 
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(255, 255, 255, 0.25); 
}

.topbar nav a.nav-cta.active {
  background: var(--sodium);
  color: var(--night);
  box-shadow: 0 4px 20px rgba(245, 166, 35, 0.4);
}

@media (max-width: 768px) {
  .topbar nav a:not(.nav-cta) { display: none; }
}

/* ---------- Hero ---------- */

.hero {
  position: relative;
  min-height: 100svh;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: radial-gradient(circle at 50% 0%, rgba(245, 166, 35, 0.08) 0%, transparent 60%),
              radial-gradient(circle at 80% 80%, rgba(56, 189, 248, 0.06) 0%, transparent 50%);
}

.hero canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  z-index: 1;
}

.hero-copy {
  position: relative;
  z-index: 2;
  margin-top: -5vh;
}

.hero h1 {
  font-family: var(--display);
  font-weight: 600;
  font-size: clamp(3.2rem, 8vw, 7.5rem);
  line-height: 1.05;
  letter-spacing: -0.05em;
  margin: 0 0 1.5rem;
  max-width: 12ch;
  background: linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 4px 24px rgba(0,0,0,0.5));
}

.hero .lede {
  max-width: 40ch;
  color: var(--bone-dim);
  font-size: clamp(1.1rem, 1.6vw, 1.3rem);
  line-height: 1.6;
  margin: 0 0 2.5rem;
  font-weight: 400;
}

.hero .lede strong { color: var(--bone); font-weight: 500; }

.hero-actions { display: flex; gap: 1.25rem; align-items: center; flex-wrap: wrap; }

.button-primary {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bone);
  color: var(--night);
  font-weight: 600;
  padding: 0.9rem 1.6rem;
  border-radius: 99px;
  font-size: 1.05rem;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.1), 0 8px 20px rgba(255,255,255,0.15);
}

.button-primary:hover { 
  background: #ffffff; 
  transform: translateY(-2px);
  box-shadow: 0 0 0 1px rgba(255,255,255,0.2), 0 12px 28px rgba(255,255,255,0.25);
}

.button-primary:active {
  transform: scale(0.97);
}

.button-quiet {
  color: var(--bone-dim);
  font-weight: 500;
  transition: color 0.2s ease;
  position: relative;
  padding: 0.5rem;
}

.button-quiet:hover { color: var(--bone); }
.button-quiet::after {
  content: '';
  position: absolute;
  bottom: 0.2rem;
  left: 0.5rem;
  right: 0.5rem;
  height: 1px;
  background: var(--surface-border);
  transition: background 0.2s ease;
}
.button-quiet:hover::after { background: var(--bone); }

/* Arc Canvas Annotations */
.arc-label {
  position: absolute;
  z-index: 3;
  padding-left: 1rem;
  border-left: 1px solid var(--hairline);
  font-family: var(--mono);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bone-dim);
  white-space: nowrap;
  opacity: 0;
  transition: opacity 700ms ease;
  backdrop-filter: blur(4px);
  background: linear-gradient(90deg, rgba(2,4,10,0.6) 0%, transparent 100%);
  padding: 0.5rem 1rem 0.5rem 1rem;
  border-radius: 0 8px 8px 0;
}

.arc-label strong {
  display: block;
  margin-top: 0.3rem;
  font-family: var(--body);
  font-size: 0.95rem;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--bone);
}

.arc-label.warm { border-left-color: var(--sodium); box-shadow: -1px 0 12px rgba(245, 166, 35, 0.2); }
.arc-label.cool { border-left-color: var(--cobalt); box-shadow: -1px 0 12px rgba(56, 189, 248, 0.2); }
.arc-label.is-visible { opacity: 1; }

/* ---------- Sections ---------- */

section.block { padding: clamp(6rem, 12vw, 10rem) 0; position: relative; }
section.block + section.block::before {
  content: '';
  position: absolute;
  top: 0;
  left: 10%;
  right: 10%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--surface-border), transparent);
}

.block h2 {
  font-family: var(--display);
  font-weight: 600;
  font-size: clamp(2.4rem, 5vw, 4rem);
  line-height: 1.1;
  letter-spacing: -0.04em;
  margin: 0 0 1.5rem;
  max-width: 18ch;
  color: var(--bone);
}

.block .intro {
  color: var(--bone-dim);
  font-size: 1.15rem;
  max-width: 52ch;
  line-height: 1.7;
  margin: 0 0 4rem;
}

/* ---------- Keeper log ---------- */

.keeper {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: clamp(3rem, 6vw, 6rem);
  align-items: center;
}

@media (max-width: 960px) {
  .keeper { grid-template-columns: 1fr; }
}

.terminal {
  background: rgba(10, 14, 23, 0.6);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--surface-border);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 30px 60px -15px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255,255,255,0.03) inset;
}

.terminal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--surface-border);
  background: rgba(255,255,255,0.02);
}

.terminal-head > span:first-child { 
  display: flex;
  align-items: center;
  font-size: 0.85rem;
  color: var(--bone);
  font-weight: 500;
}

.terminal ol {
  list-style: none;
  margin: 0;
  padding: 1.5rem;
  font-family: var(--mono);
  font-size: 0.85rem;
  line-height: 1.8;
  min-height: 20rem;
}

.terminal li {
  display: grid;
  grid-template-columns: 5.5rem minmax(0, 1fr);
  gap: 1rem;
  color: var(--bone);
  opacity: 0.9;
}

.terminal li .t { color: var(--bone-dim); }
.terminal li .warm { color: var(--sodium); text-shadow: 0 0 8px rgba(245, 166, 35, 0.4); }
.terminal li .cool { color: var(--cobalt); text-shadow: 0 0 8px rgba(56, 189, 248, 0.4); }
.terminal li[hidden] { display: none; }

.terminal .caret {
  display: inline-block;
  width: 0.6ch;
  height: 1.2em;
  background: var(--sodium);
  vertical-align: middle;
  animation: blink 1s steps(2, start) infinite;
}

@keyframes blink { to { visibility: hidden; } }

/* ---------- Steps ---------- */

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: clamp(2rem, 4vw, 3rem);
  counter-reset: step;
}

@media (max-width: 860px) {
  .steps { grid-template-columns: 1fr; gap: 3rem; }
}

.steps li {
  counter-increment: step;
  position: relative;
  padding-top: 2rem;
}

.steps li::before {
  content: "0" counter(step);
  position: absolute;
  top: 0;
  left: 0;
  font-family: var(--mono);
  font-weight: 600;
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  color: var(--sodium);
}

.steps li::after {
  content: "";
  position: absolute;
  top: 8px;
  left: 2rem;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, var(--surface-border), transparent);
}

.steps h3 { font-size: 1.35rem; font-weight: 500; letter-spacing: -0.02em; margin: 0 0 0.75rem; color: var(--bone); }
.steps p { color: var(--bone-dim); margin: 0; font-size: 1.05rem; line-height: 1.6; }

/* ---------- Split ---------- */

.split-figures {
  display: grid;
  grid-template-columns: 80fr 20fr;
  margin-bottom: 1.5rem;
}

.split-figures div { padding-right: 2rem; }

.split-figures .figure {
  display: block;
  font-family: var(--display);
  font-weight: 600;
  font-size: clamp(3rem, 7vw, 5.5rem);
  line-height: 1;
  letter-spacing: -0.05em;
  margin-bottom: 0.5rem;
}

.split-figures .cool { 
  color: var(--cobalt);
  text-shadow: 0 0 40px rgba(56, 189, 248, 0.3);
}
.split-figures .warm { 
  color: var(--sodium);
  text-shadow: 0 0 40px rgba(245, 166, 35, 0.3);
}

.split-figures .caption { display: block; color: var(--bone-dim); font-size: 1rem; line-height: 1.5; }

.split-bar { 
  display: flex; 
  height: 8px; 
  margin-bottom: 1rem;
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.05);
}
.split-bar .split-position { width: 80%; background: linear-gradient(90deg, var(--validator), var(--cobalt)); }
.split-bar .split-buyback { width: 20%; background: var(--sodium); margin-left: 2px; }

.split-scale {
  display: flex;
  justify-content: space-between;
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--bone-dim);
}

.note { color: var(--bone-dim); font-size: 1rem; max-width: 65ch; margin: 3rem 0 0; padding-top: 2rem; border-top: 1px solid var(--surface-border); }

/* ---------- Risk ---------- */

.risk-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 3rem 4rem;
}

.risk-list li {
  background: rgba(10, 14, 23, 0.4);
  border: 1px solid var(--surface-border);
  padding: 2rem;
  border-radius: 16px;
  transition: transform 0.3s ease, border-color 0.3s ease;
}

.risk-list li:hover {
  transform: translateY(-4px);
  border-color: rgba(244, 114, 182, 0.3); /* Rose hint */
}

.risk-list strong { 
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--bone); 
  font-size: 1.15rem;
  font-weight: 500; 
  margin-bottom: 1rem; 
}

.risk-list strong::before {
  content: "";
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--rose);
  box-shadow: 0 0 10px var(--rose);
}

.risk-list p { margin: 0; color: var(--bone-dim); font-size: 1rem; line-height: 1.6; }

/* ---------- Closing ---------- */

.closing { text-align: center; padding: 8rem 0 10rem; }
.closing h2 { max-width: none; font-size: clamp(3rem, 6vw, 4.5rem); margin-bottom: 2.5rem; }

footer {
  border-top: 1px solid var(--surface-border);
  padding: 3rem 0;
  color: var(--bone-dim);
  font-size: 0.95rem;
  background: rgba(2, 4, 10, 0.8);
}

footer .wrap { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }

/* ---------- Eyebrow ---------- */

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--mono);
  font-size: 0.85rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bone);
  margin: 0 0 1.5rem;
  padding: 0.4rem 1rem;
  border-radius: 99px;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--surface-border);
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
}

.eyebrow::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sodium);
  box-shadow: 0 0 8px var(--sodium);
}

/* ---------- Scroll Reveals ---------- */
.reveal-item {
  opacity: 0;
  transform: translateY(30px);
  transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.reveal-item.revealed {
  opacity: 1;
  transform: translateY(0);
}

/* ---------- Subpage Header & Shell ---------- */
.subpage-hero {
  padding: clamp(8rem, 16vh, 10rem) 0 3rem;
  position: relative;
  text-align: center;
}

.subpage-hero h1 {
  font-family: var(--display);
  font-size: clamp(2.8rem, 6vw, 5rem);
  font-weight: 600;
  letter-spacing: -0.04em;
  margin: 0 0 1.25rem;
  line-height: 1.1;
  background: linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subpage-hero p.sub-lede {
  color: var(--bone-dim);
  font-size: 1.25rem;
  max-width: 54ch;
  margin: 0 auto 2rem;
  line-height: 1.6;
}

/* ---------- Wizard / Slide System ---------- */
.wizard-card {
  background: rgba(10, 14, 23, 0.6);
  border: 1px solid var(--surface-border);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 40px 80px -20px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.02) inset;
  margin-bottom: 6rem;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

.wizard-progress {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--surface-border);
  padding: 1.5rem 2.5rem;
  background: rgba(2, 4, 10, 0.4);
  gap: 1.5rem;
  overflow-x: auto;
}

.progress-step {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  color: var(--bone-dim);
  font-size: 0.95rem;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;
  transition: color 0.3s ease;
}

.progress-step:hover { color: var(--bone); }

.step-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--surface-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--mono);
  font-size: 0.85rem;
  background: rgba(255,255,255,0.03);
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.progress-step.active {
  color: var(--bone);
}

.progress-step.active .step-num {
  border-color: var(--sodium);
  background: var(--sodium);
  color: var(--night);
  box-shadow: 0 0 16px rgba(245, 166, 35, 0.4);
}

.progress-step.completed .step-num {
  border-color: var(--cobalt);
  background: rgba(56, 189, 248, 0.15);
  color: var(--cobalt);
}

.progress-line {
  flex: 1;
  height: 2px;
  background: var(--surface-border);
  min-width: 24px;
  border-radius: 2px;
}

/* Track & Slides */
.wizard-viewport {
  overflow: hidden;
  position: relative;
  width: 100%;
}

.wizard-track {
  display: flex;
  width: 300%;
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

.wizard-slide {
  width: 33.333333%;
  padding: clamp(2rem, 5vw, 4rem);
  flex-shrink: 0;
}

/* Step Elements */
.slide-header {
  margin-bottom: 2.5rem;
}

.slide-header h2 {
  font-size: 1.8rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
  letter-spacing: -0.02em;
}

.slide-header p {
  color: var(--bone-dim);
  font-size: 1.05rem;
  margin: 0;
}

.form-group {
  margin-bottom: 2rem;
}

.form-group label {
  display: block;
  font-size: 0.95rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
  color: var(--bone);
}

.form-group .label-desc {
  font-size: 0.9rem;
  color: var(--bone-dim);
  margin-bottom: 0.75rem;
  display: block;
}

.input-field {
  width: 100%;
  background: rgba(2, 4, 10, 0.5);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  padding: 1rem 1.25rem;
  color: var(--bone);
  font-family: var(--mono);
  font-size: 1.05rem;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.input-field:focus {
  border-color: var(--sodium);
  box-shadow: 0 0 0 4px rgba(245, 166, 35, 0.15);
  outline: none;
  background: rgba(2, 4, 10, 0.8);
}

/* Token badge feedback */
.token-preview {
  margin-top: 1.25rem;
  padding: 1.25rem 1.5rem;
  background: rgba(10, 14, 23, 0.6);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  transition: all 0.3s ease;
}

.token-preview.is-found {
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(56, 189, 248, 0.05);
}

.token-preview .token-id {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.token-badge-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--surface-raised);
  border: 1px solid var(--surface-border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-family: var(--mono);
  color: var(--sodium);
  font-size: 1.1rem;
}

/* Asset Selector Chips */
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 0.85rem;
  margin-top: 1rem;
}

.asset-chip {
  background: rgba(10, 14, 23, 0.5);
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  padding: 0.85rem 0.5rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  color: var(--bone);
  font-family: var(--mono);
  font-size: 0.95rem;
  font-weight: 500;
}

.asset-chip:hover {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-2px);
}

.asset-chip.selected {
  border-color: var(--sodium);
  background: rgba(245, 166, 35, 0.1);
  color: var(--sodium);
  box-shadow: 0 4px 14px rgba(245, 166, 35, 0.15);
}

/* Direction Switch */
.direction-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.dir-btn {
  background: rgba(10, 14, 23, 0.5);
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  padding: 1rem;
  color: var(--bone-dim);
  font-weight: 600;
  font-size: 1.05rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  font-family: inherit;
}

.dir-btn:hover { color: var(--bone); border-color: rgba(255, 255, 255, 0.2); }

.dir-btn.selected[data-dir="long"] {
  border-color: var(--cobalt);
  background: rgba(56, 189, 248, 0.1);
  color: var(--cobalt);
  box-shadow: 0 8px 24px rgba(56, 189, 248, 0.2);
}

.dir-btn.selected[data-dir="short"] {
  border-color: var(--rose);
  background: rgba(244, 114, 182, 0.1);
  color: var(--rose);
  box-shadow: 0 8px 24px rgba(244, 114, 182, 0.2);
}

/* Leverage Slider & Dial */
.leverage-display {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.leverage-num {
  font-family: var(--mono);
  font-size: 2.8rem;
  font-weight: 600;
  color: var(--sodium);
  letter-spacing: -0.04em;
}

.leverage-calc {
  font-family: var(--mono);
  font-size: 0.95rem;
  color: var(--bone-dim);
  text-align: right;
}

.range-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  outline: none;
  margin: 1.5rem 0 2rem;
  --fill-pct: 20%;
  background: linear-gradient(
    90deg,
    var(--sodium) 0%,
    var(--sodium) var(--fill-pct),
    rgba(255, 255, 255, 0.08) var(--fill-pct)
  ) !important;
}

.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bone);
  border: 4px solid var(--sodium);
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(245, 166, 35, 0.6);
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.range-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.metric-meter {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.25rem;
  padding: 1.5rem;
  background: rgba(2, 4, 10, 0.4);
  border-radius: 12px;
  border: 1px solid var(--surface-border);
  margin-top: 1.5rem;
}

.metric-box span {
  display: block;
  font-size: 0.85rem;
  color: var(--bone-dim);
  margin-bottom: 0.4rem;
}

.metric-box strong {
  font-family: var(--mono);
  font-size: 1.15rem;
  color: var(--bone);
}

/* Wizard Navigation Row */
.wizard-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid var(--surface-border);
}

.btn-secondary {
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--surface-border);
  color: var(--bone);
  padding: 0.9rem 1.6rem;
  border-radius: 99px;
  font-family: inherit;
  font-size: 1.05rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.btn-secondary:hover {
  border-color: rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  transform: translateY(-1px);
}

/* Address & Confirmation Result */
.result-box {
  background: rgba(2, 4, 10, 0.6);
  border: 1px solid var(--sodium);
  border-radius: 16px;
  padding: 2rem;
  margin-bottom: 2rem;
  position: relative;
  box-shadow: 0 0 40px rgba(245, 166, 35, 0.1) inset;
}

.deposit-copy-row {
  display: flex;
  gap: 1rem;
  margin-top: 1rem;
  align-items: center;
}

.address-pill {
  flex: 1;
  background: rgba(0, 0, 0, 0.5);
  padding: 1rem 1.25rem;
  border-radius: 10px;
  font-family: var(--mono);
  font-size: 1.05rem;
  color: var(--sand);
  word-break: break-all;
  border: 1px solid rgba(245, 166, 35, 0.2);
}

.btn-copy {
  background: var(--sodium);
  color: var(--night);
  border: none;
  padding: 1rem 1.5rem;
  border-radius: 10px;
  font-weight: 600;
  font-family: inherit;
  font-size: 1rem;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  box-shadow: 0 4px 14px rgba(245, 166, 35, 0.3);
}

.btn-copy:hover { 
  background: #ffb84d; 
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(245, 166, 35, 0.4);
}

/* Launch Guide checklist */
.launch-guide {
  background: rgba(255,255,255,0.02);
  border: 1px solid var(--surface-border);
  border-radius: 16px;
  padding: 2rem;
  margin-top: 2rem;
}

.launch-guide h3 {
  margin: 0 0 1.25rem;
  font-size: 1.15rem;
  color: var(--bone);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.launch-steps {
  margin: 0;
  padding-left: 1.5rem;
  color: var(--bone-dim);
  font-size: 1rem;
  line-height: 1.7;
}

.launch-steps li {
  margin-bottom: 0.85rem;
}

.launch-steps li strong {
  color: var(--bone);
  font-weight: 500;
}

/* ---------- Simulator & Explorer Grid ---------- */
.sim-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 4rem;
  align-items: start;
  margin-bottom: 6rem;
}

@media (max-width: 960px) {
  .sim-grid { grid-template-columns: 1fr; }
}

.sim-controls {
  background: rgba(10, 14, 23, 0.5);
  border: 1px solid var(--surface-border);
  backdrop-filter: blur(20px);
  border-radius: 20px;
  padding: 2.5rem;
  box-shadow: 0 30px 60px -20px rgba(0,0,0,0.5);
}

.sim-display {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.sim-card {
  background: rgba(10, 14, 23, 0.5);
  border: 1px solid var(--surface-border);
  border-radius: 20px;
  padding: 2.5rem;
  position: relative;
  overflow: hidden;
  box-shadow: 0 30px 60px -20px rgba(0,0,0,0.5);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease;
}

.sim-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 40px 80px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.05) inset;
}

.sim-card::after {
  content: "";
  position: absolute;
  top: -50px;
  right: -50px;
  width: 250px;
  height: 250px;
  background: radial-gradient(circle, rgba(245, 166, 35, 0.1) 0%, transparent 70%);
  pointer-events: none;
}

.sim-stat-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-top: 1.5rem;
}

.sim-stat {
  background: rgba(2, 4, 10, 0.4);
  padding: 1.5rem;
  border-radius: 12px;
  border: 1px solid var(--surface-border);
}

.sim-stat .stat-label {
  font-size: 0.9rem;
  color: var(--bone-dim);
  display: block;
  margin-bottom: 0.5rem;
}

.sim-stat .stat-val {
  font-family: var(--mono);
  font-size: 1.8rem;
  font-weight: 600;
  color: var(--bone);
}

.sim-stat .stat-val.gold { color: var(--sodium); }
.sim-stat .stat-val.blue { color: var(--cobalt); }

/* Live Pairings Gallery */
.pairings-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 2rem;
  margin-top: 2rem;
}

.pairing-item {
  background: rgba(10, 14, 23, 0.5);
  border: 1px solid var(--surface-border);
  border-radius: 16px;
  padding: 2rem;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  backdrop-filter: blur(12px);
}

.pairing-item:hover {
  transform: translateY(-4px);
  border-color: rgba(245, 166, 35, 0.3);
  box-shadow: 0 20px 40px -10px rgba(0,0,0,0.5), 0 0 30px rgba(245, 166, 35, 0.05);
}

.pairing-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.25rem;
}

.pairing-token {
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--bone);
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.pairing-pill {
  font-family: var(--mono);
  font-size: 0.85rem;
  padding: 0.3rem 0.8rem;
  border-radius: 6px;
  background: rgba(56, 189, 248, 0.1);
  color: var(--cobalt);
  border: 1px solid rgba(56, 189, 248, 0.2);
  font-weight: 500;
}

.pairing-pill.short {
  background: rgba(244, 114, 182, 0.1);
  color: var(--rose);
  border-color: rgba(244, 114, 182, 0.2);
}

.pairing-address {
  font-family: var(--mono);
  font-size: 0.85rem;
  color: var(--bone-dim);
  background: rgba(0, 0, 0, 0.4);
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  word-break: break-all;
  margin-top: 1rem;
  border: 1px solid rgba(255,255,255,0.05);
}

/* =========================================================================
   Physics Drop-In & Stagger Animations
   ========================================================================= */

@keyframes dropIntoPlace {
  0% { opacity: 0; transform: translateY(30px); filter: blur(10px); }
  100% { opacity: 1; transform: translateY(0); filter: blur(0); }
}

.drop-in {
  animation: dropIntoPlace 1s cubic-bezier(0.16, 1, 0.3, 1) both;
  will-change: transform, opacity, filter;
}

.drop-d1 { animation-delay: 0.1s; }
.drop-d2 { animation-delay: 0.2s; }
.drop-d3 { animation-delay: 0.3s; }
.drop-d4 { animation-delay: 0.4s; }

/* =========================================================================
   Seamless Page Slide Transitions
   ========================================================================= */

.page-wrapper {
  position: relative;
  width: 100%;
  min-height: 100vh;
  overflow-x: hidden;
}

.slide-exit-to-left { animation: pageSlideOutLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards !important; pointer-events: none; }
.slide-enter-from-right { animation: pageSlideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards !important; }
.slide-exit-to-right { animation: pageSlideOutRight 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards !important; pointer-events: none; }
.slide-enter-from-left { animation: pageSlideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards !important; }

@keyframes pageSlideOutLeft {
  0% { opacity: 1; transform: translateX(0); filter: blur(0px); }
  100% { opacity: 0; transform: translateX(-15%); filter: blur(8px); }
}
@keyframes pageSlideInRight {
  0% { opacity: 0; transform: translateX(15%); filter: blur(8px); }
  100% { opacity: 1; transform: translateX(0); filter: blur(0px); }
}
@keyframes pageSlideOutRight {
  0% { opacity: 1; transform: translateX(0); filter: blur(0px); }
  100% { opacity: 0; transform: translateX(15%); filter: blur(8px); }
}
@keyframes pageSlideInLeft {
  0% { opacity: 0; transform: translateX(-15%); filter: blur(8px); }
  100% { opacity: 1; transform: translateX(0); filter: blur(0px); }
}

/* =========================================================================
   Ambient Live Marquee & Glow Motion
   ========================================================================= */

.marquee-bar {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
  background: rgba(2, 4, 10, 0.8);
  border-top: 1px solid var(--surface-border);
  border-bottom: 1px solid var(--surface-border);
  padding: 0.85rem 0;
  position: relative;
  z-index: 5;
  backdrop-filter: blur(12px);
}

.marquee-track {
  display: inline-flex;
  animation: marqueeLoop 30s linear infinite;
  gap: 4rem;
  will-change: transform;
}

.marquee-track:hover { animation-play-state: paused; }

.marquee-item {
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  font-family: var(--mono);
  font-size: 0.9rem;
  color: var(--bone-dim);
}

.marquee-item .highlight { color: var(--sodium); font-weight: 500; }
.marquee-item .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cobalt);
  box-shadow: 0 0 12px var(--cobalt);
}

@keyframes marqueeLoop { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }

@media (prefers-reduced-motion: reduce) {
  .drop-in, .marquee-track, .slide-exit-to-left, .slide-enter-from-right, .slide-exit-to-right, .slide-enter-from-left { animation: none !important; }
}

/* =========================================================================
   Raycast/Linear Style Spotlight Card Borders
   ========================================================================= */

.spotlight-card {
  position: relative;
  overflow: hidden;
  --mouse-x: 50%;
  --mouse-y: 50%;
}

.spotlight-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  background: radial-gradient(
    600px circle at var(--mouse-x) var(--mouse-y),
    rgba(255, 255, 255, 0.4),
    transparent 40%
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.5s ease;
  z-index: 2;
}

.spotlight-card:hover::before { opacity: 1; }

/* Tabular Precision */
.stat-val, .leverage-num, .sim-stat .stat-val, #out-total-exposure, #meter-liq, #meter-mult, .t {
  font-variant-numeric: tabular-nums;
}

.progress-line { position: relative; overflow: hidden; }
.progress-line::after {
  content: "";
  position: absolute;
  top: 0; bottom: 0; left: 0; width: 0%;
  background: var(--sodium);
  transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}
.progress-line.filled::after { width: 100%; }

.platform-scroll-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  overflow-x: auto;
  padding-bottom: 1rem;
  margin-top: 2rem;
  scrollbar-width: none;
}
.platform-scroll-row::-webkit-scrollbar { display: none; }

.platform-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  background: rgba(10, 14, 23, 0.6);
  border: 1px solid var(--surface-border);
  padding: 0.6rem 1.25rem;
  border-radius: 99px;
  font-size: 0.9rem;
  font-family: var(--mono);
  color: var(--bone);
  white-space: nowrap;
  backdrop-filter: blur(8px);
}

.platform-pill img, .platform-pill svg { width: 20px; height: 20px; border-radius: 50%; }

.hero-split-grid {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 5rem;
  align-items: center;
  padding: clamp(8rem, 16vh, 12rem) 0 5rem;
  position: relative;
  z-index: 2;
}

@media (max-width: 980px) {
  .hero-split-grid { grid-template-columns: 1fr; gap: 4rem; padding-top: 8rem; }
}

"""

with open("/Users/aske/Incentivise/site/landing.css", "w") as f:
    f.write(css)

print("CSS generated.")

