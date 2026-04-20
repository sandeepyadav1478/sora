// ============================================================================
// SITE — Global site settings
// ============================================================================
export const SITE = {
  website: "https://johndoe.github.io/",       // your deployed URL
  author: "John Doe",                           // used in meta tags, RSS, structured data
  profile: "https://johndoe.github.io/",        // canonical profile URL
  desc: "AI Engineer building production-grade intelligent systems — from model training and fine-tuning to agentic workflows, ML infrastructure, and scalable inference.",
  title: "John Doe",                            // browser tab / site title
  ogImage: "sora-og.jpg",                       // default OG image in public/
  lightAndDarkMode: true,
  // "light" | "dark" | "" (empty = follow system preference)
  initialColorScheme: "" as "" | "light" | "dark",
  postPerIndex: 6,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000,
  showArchives: true,
  showBackButton: false,
  editPost: {
    enabled: false,
    text: "",
    url: "",
  },
  dynamicOgImage: true,
  dir: "ltr" as "ltr" | "rtl",
  lang: "en",
  timezone: "America/New_York",
} as const;

// ============================================================================
// PROFILE — Your personal information
// ============================================================================
export const PROFILE = {
  name: "John Doe",
  tagline: "AI Engineer building production intelligent systems — LLM applications, model fine-tuning, agentic workflows, and ML infrastructure. Open source contributor and technical writer.",
  photo: "/profile-photo.svg",              // place your photo in public/ (.jpg, .png, or .svg)
  role: "AI Engineer",                      // current role / title (also used in SEO structured data)
  organization: "Acme AI",                  // current company or affiliation
  organizationUrl: "https://example.com",   // optional link
  location: "San Francisco, USA",           // city / region
  // SEO keywords for structured data (what you want to be found for)
  keywords: ["Machine Learning", "LLM", "MLOps", "Deep Learning", "NLP", "Fine-Tuning", "RAG", "AI Agents", "Model Deployment"],
} as const;

// ============================================================================
// SOCIALS — Your social links (icons are mapped automatically)
// Supported names: "GitHub", "X", "LinkedIn", "Mail", "WhatsApp",
//   "Facebook", "Telegram", "Pinterest", "Calendly"
// ============================================================================
export const SOCIALS_CONFIG = [
  { name: "GitHub", url: "https://github.com/johndoe" },
  { name: "X", url: "https://x.com/johndoe" },
  { name: "LinkedIn", url: "https://www.linkedin.com/in/johndoe/" },
  { name: "Mail", url: "mailto:hello@johndoe.dev" },
] as const;

// ============================================================================
// SECTIONS — Toggle optional homepage sections (set to true to show)
// ============================================================================
export const SECTIONS = {
  showAbout: false,
  showExperience: true,
  showSkills: true,
  showContact: true,
} as const;

// ============================================================================
// BOARD — Works board layout & display options
// ============================================================================
export const BOARD = {
  // Change this value and run `pnpm dev` to preview each layout:
  //   "two-tier" — featured+recent as full cards, rest as compact rows
  //   "flat"     — every item as a full card
  //   "grid"     — responsive thumbnail grid
  //   "timeline" — vertical chronological timeline
  layout: "two-tier" as "two-tier" | "flat" | "grid" | "timeline",

  // How many recent items to promote to the first tier (two-tier layout only).
  // These are shown alongside featured items as full cards.
  recentCount: 6,

  // Tech stack display style in work modals:
  //   "muted-badges"    — subtle gray background, square corners (GitHub-style)
  //   "two-tone"        — light accent background, accent text
  //   "left-border"     — muted background with accent left border
  //   "outlined"        — accent border only, no fill
  //   "dot-separated"   — plain text joined by dots
  //   "comma-list"      — plain inline text with label prefix
  //   "filled-pills"    — solid accent background, white text
  techStyle: "left-border" as "muted-badges" | "two-tone" | "left-border" | "outlined" | "dot-separated" | "comma-list" | "filled-pills",
} as const;

// ============================================================================
// CONNECT — Calendly / booking embed (shown on /connect page)
// ============================================================================
export const CONNECT = {
  enabled: true,
  heading: "Book a 1:1",
  subheading: "Pick a time that works for you — happy to chat about roles, collaborations, or anything else.",
  // Replace with your Calendly (or Cal.com / SavvyCal) scheduling link
  calendlyUrl: "https://calendly.com/your-username/30min",
} as const;

// ============================================================================
// ABOUT — Short bio (shown on homepage only if SECTIONS.showAbout is true)
// ============================================================================
export const ABOUT = {
  bio: "I'm an AI Engineer focused on taking models from research to production. I work across the full ML lifecycle — training and fine-tuning, building agentic workflows, experiment tracking, and deploying scalable inference pipelines. I contribute to open-source ML tooling and write about practical AI engineering.",
} as const;

// ============================================================================
// EXPERIENCE — Career timeline (shown only if SECTIONS.showExperience is true)
// ============================================================================
export interface ExperienceEntry {
  role: string;
  company: string;
  companyUrl?: string;
  startDate: string;
  endDate: string;
  description: string;
}

export const EXPERIENCE: ExperienceEntry[] = [
  {
    role: "AI Engineer",
    company: "Acme AI",
    companyUrl: "https://example.com",
    startDate: "Jan 2024",
    endDate: "Present",
    description:
      "Building LLM-powered applications and agentic workflows. Fine-tuning domain-specific models with Unsloth and deploying inference pipelines on AWS.",
  },
  {
    role: "ML Engineer",
    company: "DataCorp",
    companyUrl: "https://example.com",
    startDate: "Mar 2022",
    endDate: "Dec 2023",
    description:
      "Designed ML pipelines with MLflow and DVC. Built real-time feature stores and model monitoring dashboards serving 50M+ predictions/day.",
  },
  {
    role: "Software Engineer",
    company: "TechStart",
    startDate: "Jun 2020",
    endDate: "Feb 2022",
    description:
      "Full-stack development with Python and React. Led migration of monolith to microservices on Kubernetes.",
  },
];

// ============================================================================
// SKILLS — Skill groups (shown only if SECTIONS.showSkills is true)
// ============================================================================
export interface SkillGroup {
  category: string;
  items: string[];
}

export const SKILLS: SkillGroup[] = [
  {
    category: "ML / AI",
    items: ["PyTorch", "HuggingFace", "LangChain", "LangGraph", "Unsloth", "vLLM", "ONNX", "LoRA / QLoRA", "RAG", "Agents"],
  },
  {
    category: "MLOps & Data",
    items: ["MLflow", "DVC", "Weights & Biases", "Ray", "Airflow", "Kubeflow", "Feature Stores", "Vector DBs"],
  },
  {
    category: "Languages",
    items: ["Python", "TypeScript", "Go", "SQL", "Bash", "C++"],
  },
  {
    category: "Infra & Cloud",
    items: ["Docker", "Kubernetes", "AWS", "GCP", "Terraform", "GitHub Actions", "FastAPI", "gRPC"],
  },
];
