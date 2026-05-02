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
  // Template mode: shows /docs page with setup guide & visual demos.
  // Set to false after you've configured your site.
  isTemplate: true,
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
  favicon: "/favicon.svg",                       // path to site favicon in public/
  // Background pattern: "dot-grid" | "none"
  // dot-grid: subtle repeating dot matrix (like santifer.io)
  backgroundPattern: "dot-grid" as "dot-grid" | "none",
  // Hero section background style:
  // "dot-grid"   — subtle dot matrix with tinted base (no gradient)
  // "dual-glow"  — soft accent+primary blobs on left/right
  // "mesh"       — multiple soft color blobs like a modern SaaS page
  // "aurora"     — horizontal northern-lights color bands
  // "spotlight"  — single bright glow from center, fading to edges
  // "sunset"     — warm-to-cool diagonal sweep
  // "frosted"    — very subtle single-tint frosted glass
  heroBackground: "dot-grid" as "dot-grid" | "dual-glow" | "mesh" | "aurora" | "spotlight" | "sunset" | "frosted" | "cyber" | "gradient-mesh" | "none",
  // Hero section canvas animation:
  // "snake"           — glowing lines traversing the dot grid
  // "aurora"          — slow-drifting translucent color blobs
  // "constellation"   — floating particles with connection lines
  // "wave-field"      — grid of dots rippling in sine waves
  // "mesh-gradient"   — animated color anchors with smooth fills
  // "noise-flow"      — particles streaming along noise currents
  // "geometric-pulse" — concentric rings expanding from center
  // "none"            — no animation
  heroAnimation: "neural-pulse" as "snake" | "aurora" | "constellation" | "wave-field" | "mesh-gradient" | "noise-flow" | "warp-starfield" | "neural-pulse" | "morph-blobs" | "silk-waves" | "floating-orbs" | "none",
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
  tagline: "Building production-grade intelligent systems — from research to deployment.",
  photo: "/profile-photo.svg",              // place your photo in public/ (.jpg, .png, or .svg)
  role: "AI Engineer",                      // current role / title (also used in SEO structured data)
  organization: "Acme AI",                  // current company or affiliation
  organizationUrl: "https://example.com",   // optional link
  location: "San Francisco, USA",           // city / region
  // SEO keywords for structured data (what you want to be found for)
  keywords: ["Machine Learning", "LLM", "MLOps", "Deep Learning", "NLP", "Fine-Tuning", "RAG", "AI Agents", "Model Deployment"],
  // Phrases that cycle with a typing animation as the main headline
  typedPhrases: [
    "AI Systems Builder",
    "ML Infrastructure Engineer",
    "Open Source Contributor",
    "LLM Applications Developer",
    "Agentic Workflows Designer",
  ],
  // First 3 keywords appear as bold headline text ("with X + Y + Z")
  // Remaining appear as subtle muted pills below
  trendingKeywords: ["Evals", "LLMOps", "HITL", "RAG", "Agents", "LoRA"],
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
  showAbout: true,
  showStartHere: true,
  showExperience: true,
  showSkills: true,
  showPublications: true,
  showStats: true,
  showOpenSource: true,
  showSpeaking: true,
  showFeaturedModels: true,
  showResources: true,
  showCuratedLists: true,
  showClients: true,
  showEducation: true,
  showAwards: true,
  showFAQ: true,
  showContact: false,
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

  // Type badge color mode:
  //   "colorful" — each work type gets a distinct badge color
  //   "uniform"  — all badges use the site accent color
  badgeStyle: "colorful" as "colorful" | "uniform",
} as const;

// ============================================================================
// USES — Tools, hardware, and setup (/uses page)
// ============================================================================
export const USES = {
  enabled: true,
  categories: [
    {
      name: "AI / ML Stack",
      items: [
        { name: "PyTorch", desc: "Primary deep learning framework" },
        { name: "HuggingFace Transformers", desc: "Model hub & training pipelines" },
        { name: "vLLM", desc: "High-throughput LLM inference" },
        { name: "LangGraph", desc: "Agentic workflow orchestration" },
        { name: "Weights & Biases", desc: "Experiment tracking & model registry" },
        { name: "Unsloth", desc: "Fast LoRA fine-tuning" },
      ],
    },
    {
      name: "Editor & Terminal",
      items: [
        { name: "VS Code", desc: "Primary editor with Vim keybindings" },
        { name: "Claude Code", desc: "AI pair programming in terminal" },
        { name: "Warp", desc: "Terminal with AI completions" },
        { name: "Tmux", desc: "Terminal multiplexer for remote sessions" },
      ],
    },
    {
      name: "Infrastructure",
      items: [
        { name: "Docker + K8s", desc: "Containerized deployments" },
        { name: "AWS (SageMaker, Lambda, ECS)", desc: "Cloud ML platform" },
        { name: "Terraform", desc: "Infrastructure as code" },
        { name: "GitHub Actions", desc: "CI/CD and model deployment pipelines" },
      ],
    },
    {
      name: "Hardware",
      items: [
        { name: "MacBook Pro M3 Max", desc: "Daily driver" },
        { name: "NVIDIA A100 (cloud)", desc: "Training & fine-tuning" },
        { name: "Mechanical keyboard", desc: "Keychron Q1 with brown switches" },
      ],
    },
  ],
} as const;

// ============================================================================
// TESTIMONIALS — Social proof quotes (shown on homepage)
// ============================================================================
export const TESTIMONIALS = {
  enabled: true,
  items: [
    {
      quote: "One of the most thoughtful engineers I've worked with. Takes complex ML problems and delivers clean, production-ready solutions.",
      author: "Jane Smith",
      role: "Engineering Manager, Acme AI",
      companyUrl: "https://example.com",
    },
    {
      quote: "Their open-source contributions to our inference pipeline saved us weeks of work. Clear code, excellent documentation.",
      author: "Alex Chen",
      role: "Staff Engineer, DataCorp",
      companyUrl: "https://example.com",
    },
    {
      quote: "Rare combination of deep ML knowledge and strong engineering fundamentals. Ships reliable systems, not just notebooks.",
      author: "Sam Patel",
      role: "CTO, TechStart",
    },
  ],
} as const;

// ============================================================================
// NEWSLETTER — Email signup (shown on homepage)
// ============================================================================
export const NEWSLETTER = {
  enabled: true,
  heading: "Stay in the loop",
  subheading: "Occasional thoughts on AI engineering, model deployment, and building intelligent systems.",
  // Supported: "buttondown", "substack", "convertkit", "custom"
  provider: "buttondown" as "buttondown" | "substack" | "convertkit" | "custom",
  // Your newsletter URL or form action
  action: "https://buttondown.email/api/emails/embed-subscribe/your-username",
} as const;

// ============================================================================
// READING — Curated reading list (/reading page)
// ============================================================================
export const READING = {
  enabled: true,
  categories: [
    {
      name: "Books",
      items: [
        { title: "Designing Machine Learning Systems", author: "Chip Huyen", url: "" },
        { title: "The Staff Engineer's Path", author: "Tanya Reilly", url: "" },
        { title: "Fundamentals of Data Engineering", author: "Joe Reis & Matt Housley", url: "" },
        { title: "Building LLMs for Production", author: "Shin & Alam", url: "" },
      ],
    },
    {
      name: "Papers",
      items: [
        { title: "Attention Is All You Need", author: "Vaswani et al., 2017", url: "https://arxiv.org/abs/1706.03762" },
        { title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP", author: "Lewis et al., 2020", url: "https://arxiv.org/abs/2005.11401" },
        { title: "LoRA: Low-Rank Adaptation of Large Language Models", author: "Hu et al., 2021", url: "https://arxiv.org/abs/2106.09685" },
        { title: "Constitutional AI", author: "Bai et al., 2022", url: "https://arxiv.org/abs/2212.08073" },
      ],
    },
    {
      name: "Blogs & Resources",
      items: [
        { title: "Lilian Weng's Blog", author: "OpenAI", url: "https://lilianweng.github.io" },
        { title: "The Batch", author: "DeepLearning.AI", url: "https://www.deeplearning.ai/the-batch/" },
        { title: "Chip Huyen's Blog", author: "", url: "https://huyenchip.com/blog/" },
      ],
    },
  ],
} as const;

// ============================================================================
// COLOPHON — How this site was built (shown in footer or /colophon)
// ============================================================================
export const COLOPHON = {
  enabled: false,
  text: "Built with Astro, Tailwind CSS, and TypeScript. Styled with semantic CSS. Search by Pagefind. Deployed on GitHub Pages.",
  stack: ["Astro v5", "Tailwind CSS v4", "TypeScript", "Pagefind", "GitHub Pages"],
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
  // Each line = own <p>. Decorators: **bold accent**, ~muted~, _italic_, ## big heading line
  bio: `## **4+** years building everything from scratch.
From fine-tuning LLMs to shipping **agentic workflows** handling real-world traffic — I've owned the full lifecycle.
~One day, I stopped chasing titles. I started chasing clarity.~
_What drives me doesn't fit on a resume._
## **Building systems that last.**
**12+ open-source contributions**. **3 production ML pipelines**. **Millions of inference requests** served.
Training, experiment tracking, inference at scale, and the tooling that holds it all together.
~Bigger problems. Harder systems. End-to-end.~
## **Ready for what's next.**`,
} as const;

// ============================================================================
// EXPERIENCE — Career timeline (shown only if SECTIONS.showExperience is true)
// ============================================================================
export interface CaseStudy {
  title: string;
  description: string;
  tech?: string[];
  url?: string;
}

export interface CompetencyArea {
  title: string;
  description: string;
}

export const COMPETENCY_AREAS: CompetencyArea[] = [
  {
    title: "LLM Application Development",
    description: "RAG pipelines, prompt engineering, multi-model orchestration, production inference",
  },
  {
    title: "Model Fine-Tuning & Training",
    description: "LoRA/QLoRA, domain adaptation, dataset curation, distributed training",
  },
  {
    title: "Agentic Workflows",
    description: "Multi-agent systems, tool use, HITL handoff, orchestration with LangGraph",
  },
  {
    title: "ML Infrastructure & MLOps",
    description: "Feature stores, experiment tracking, model registry, CI/CD for ML",
  },
  {
    title: "Production Inference",
    description: "vLLM, quantization, batching strategies, latency optimization, autoscaling",
  },
  {
    title: "Technical Leadership",
    description: "Architecture design, code review, mentoring, cross-team collaboration",
  },
];

export interface ExperienceEntry {
  role: string;
  company: string;
  companyUrl?: string;
  companyLogo?: string;
  startDate: string;
  endDate: string;
  description: string;
  achievements?: string[];
  caseStudies?: CaseStudy[];
  skills?: string[];
}

export const EXPERIENCE: ExperienceEntry[] = [
  {
    role: "AI Engineer",
    company: "Acme AI",
    companyUrl: "https://example.com",
    startDate: "Jan 2024",
    endDate: "Present",
    description:
      "Building LLM-powered applications and agentic workflows. Deploying inference pipelines on AWS.",
    achievements: [
      "Shipped 3 production LLM apps serving 100K+ daily users",
      "Reduced inference latency by 40% with custom vLLM deployment",
    ],
    caseStudies: [
      {
        title: "Multi-Agent Document Understanding",
        description: "Extracting structured data from unstructured documents using specialized LLM agents.",
        tech: ["LangGraph", "GPT-4", "FastAPI"],
      },
    ],
    skills: ["PyTorch", "vLLM", "LangGraph", "AWS SageMaker"],
  },
  {
    role: "ML Engineer",
    company: "DataCorp",
    companyUrl: "https://example.com",
    startDate: "Mar 2022",
    endDate: "Dec 2023",
    description:
      "Designed ML pipelines and built real-time feature stores serving 50M+ predictions/day.",
    achievements: [
      "Built real-time feature store serving 50M+ predictions/day",
      "Reduced model training time by 60% with distributed training",
    ],
    skills: ["MLflow", "DVC", "Ray", "Kubernetes"],
  },
  {
    role: "Software Engineer",
    company: "TechStart",
    startDate: "Jun 2020",
    endDate: "Feb 2022",
    description:
      "Full-stack development with Python and React. Led migration of monolith to microservices on Kubernetes.",
    achievements: [
      "Led monolith to microservices migration on Kubernetes",
      "Built CI/CD pipelines reducing deploy time from hours to minutes",
    ],
    skills: ["Python", "React", "Docker", "K8s"],
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
    category: "Programming",
    items: ["Python", "TypeScript", "Go", "SQL", "Bash", "C++"],
  },
  {
    category: "Infra & Cloud",
    items: ["Docker", "Kubernetes", "AWS", "GCP", "Terraform", "GitHub Actions", "FastAPI", "gRPC"],
  },
  {
    category: "Soft Skills",
    items: ["Technical Writing", "System Design", "Team Leadership", "Mentoring", "Cross-functional Collaboration", "Agile / Scrum"],
  },
  {
    category: "Spoken Languages",
    items: ["English (Fluent)", "Hindi (Native)"],
  },
];

// ============================================================================
// START HERE — Curated entry points for new visitors
// ============================================================================
export interface StartHereItem {
  label: string;
  description: string;
  workSlug?: string;
  url?: string;
}

export const START_HERE: StartHereItem[] = [
  {
    label: "My Most Popular OSS Project",
    description: "A HuggingFace Transformers contribution that powers thousands of inference pipelines.",
    workSlug: "huggingface-transformers",
  },
  {
    label: "How I Approach ML Systems",
    description: "A deep dive into building reliable, production-grade ML infrastructure.",
    workSlug: "sora-portfolio",
  },
  {
    label: "Read My Latest Writing",
    description: "Thoughts on practical AI engineering and shipping models to production.",
    url: "/tags",
  },
];

// ============================================================================
// PUBLICATIONS — Research papers, articles, citations
// ============================================================================
export interface Publication {
  title: string;
  venue: string;
  year: number;
  authors: string;
  url?: string;
  doi?: string;
}

export const PUBLICATIONS = {
  scholarUrl: "",
  items: [
    {
      title: "Efficient Multi-Agent Architectures for Document Understanding",
      venue: "arXiv preprint",
      year: 2024,
      authors: "John Doe, Alice Park, Bob Liu",
      url: "https://arxiv.org/abs/0000.00000",
    },
    {
      title: "Scaling Retrieval-Augmented Generation for Enterprise Knowledge Bases",
      venue: "NeurIPS Workshop",
      year: 2023,
      authors: "John Doe, Carol Zhang",
      url: "https://arxiv.org/abs/0000.00000",
    },
    {
      title: "Low-Rank Adaptation Strategies for Domain-Specific LLMs",
      venue: "EMNLP",
      year: 2023,
      authors: "Alice Park, John Doe, David Kim",
      url: "https://arxiv.org/abs/0000.00000",
    },
  ] as Publication[],
} as const;

// ============================================================================
// STATS — Key metrics and numbers (social proof)
// ============================================================================
export interface StatItem {
  value: string;
  label: string;
}

export const STATS: StatItem[] = [
  { value: "2K+", label: "GitHub Stars" },
  { value: "50+", label: "OSS Contributions" },
  { value: "15+", label: "Projects Shipped" },
  { value: "10K+", label: "Blog Readers" },
];

// ============================================================================
// OPEN SOURCE — Highlighted OSS contributions
// ============================================================================
export interface OpenSourceProject {
  name: string;
  description: string;
  stars?: string;
  forks?: string;
  language?: string;
  url: string;
  role: string;
}

export const OPEN_SOURCE: OpenSourceProject[] = [
  {
    name: "huggingface/transformers",
    description: "Added efficient batch decoding for streaming inference pipelines.",
    stars: "120K",
    forks: "24K",
    language: "Python",
    url: "https://github.com/huggingface/transformers",
    role: "Contributor",
  },
  {
    name: "vllm-project/vllm",
    description: "Implemented custom sampling strategies for domain-specific generation.",
    stars: "35K",
    forks: "5.2K",
    language: "Python",
    url: "https://github.com/vllm-project/vllm",
    role: "Contributor",
  },
  {
    name: "johndoe/ml-pipeline-kit",
    description: "Opinionated ML pipeline toolkit for rapid experimentation and deployment.",
    stars: "1.2K",
    forks: "180",
    language: "Python",
    url: "https://github.com/johndoe/ml-pipeline-kit",
    role: "Author",
  },
];

// ============================================================================
// SPEAKING — Talks, presentations, podcast appearances
// ============================================================================
export interface SpeakingEntry {
  title: string;
  event: string;
  date: string;
  type: "talk" | "podcast" | "workshop" | "panel";
  url?: string;
  videoUrl?: string;
  slidesUrl?: string;
}

export const SPEAKING: SpeakingEntry[] = [
  {
    title: "Building Reliable LLM Applications in Production",
    event: "AI Engineer Summit 2024",
    date: "Oct 2024",
    type: "talk",
    url: "",
    videoUrl: "",
    slidesUrl: "",
  },
  {
    title: "Fine-Tuning at Scale: Lessons from the Trenches",
    event: "MLOps Community Meetup",
    date: "Jul 2024",
    type: "talk",
    slidesUrl: "",
  },
  {
    title: "The Practical Guide to RAG Systems",
    event: "The ML Podcast",
    date: "May 2024",
    type: "podcast",
    url: "",
  },
];

// ============================================================================
// FEATURED MODELS — HuggingFace models, trained models showcase
// ============================================================================
export interface FeaturedModel {
  name: string;
  description: string;
  downloads?: string;
  task: string;
  url: string;
}

export const FEATURED_MODELS: FeaturedModel[] = [
  {
    name: "johndoe/llama3-medical-qa",
    description: "Llama 3 fine-tuned on medical QA datasets for clinical decision support.",
    downloads: "5K+",
    task: "Question Answering",
    url: "https://huggingface.co/johndoe/llama3-medical-qa",
  },
  {
    name: "johndoe/code-reviewer-7b",
    description: "7B parameter model fine-tuned for automated code review and suggestions.",
    downloads: "2K+",
    task: "Code Generation",
    url: "https://huggingface.co/johndoe/code-reviewer-7b",
  },
];

// ============================================================================
// RESOURCES — Curated learning paths and roadmaps
// ============================================================================
export interface ResourceGroup {
  name: string;
  items: { title: string; description: string; url: string }[];
}

export const RESOURCES: ResourceGroup[] = [
  {
    name: "Getting Started with LLMs",
    items: [
      { title: "LLM Fundamentals", description: "From transformers to RLHF — the essential building blocks.", url: "" },
      { title: "Prompt Engineering Guide", description: "Systematic techniques for reliable LLM outputs.", url: "" },
      { title: "Fine-Tuning Playbook", description: "When, why, and how to fine-tune open-weight models.", url: "" },
    ],
  },
  {
    name: "ML Engineering in Production",
    items: [
      { title: "ML System Design", description: "Patterns for building maintainable ML-powered products.", url: "" },
      { title: "Inference Optimization", description: "Quantization, batching, and serving at scale.", url: "" },
      { title: "Monitoring & Evaluation", description: "Keeping models honest after deployment.", url: "" },
    ],
  },
];

// ============================================================================
// CURATED LISTS — People, tools, papers you recommend
// ============================================================================
export interface CuratedList {
  name: string;
  items: { title: string; description?: string; url: string }[];
}

export const CURATED_LISTS: CuratedList[] = [
  {
    name: "People to Follow",
    items: [
      { title: "Andrej Karpathy", description: "AI education & research", url: "https://karpathy.ai" },
      { title: "Chip Huyen", description: "ML systems & MLOps", url: "https://huyenchip.com" },
      { title: "Simon Willison", description: "LLM tooling & open data", url: "https://simonwillison.net" },
    ],
  },
  {
    name: "Essential Tools",
    items: [
      { title: "vLLM", description: "High-throughput LLM serving", url: "https://github.com/vllm-project/vllm" },
      { title: "LangGraph", description: "Agentic workflow orchestration", url: "https://github.com/langchain-ai/langgraph" },
      { title: "Weights & Biases", description: "Experiment tracking", url: "https://wandb.ai" },
    ],
  },
];

// ============================================================================
// FAQ — Frequently asked questions
// ============================================================================
export interface FAQItem {
  question: string;
  answer: string;
}

export const FAQ: FAQItem[] = [
  {
    question: "Are you open to freelance or consulting work?",
    answer: "Yes — I take on select projects involving LLM applications, ML infrastructure, and AI strategy. Reach out via email to discuss.",
  },
  {
    question: "What's your tech stack for most projects?",
    answer: "Python + PyTorch for ML, HuggingFace for models, FastAPI for serving, Docker + K8s for deployment, and AWS for cloud infrastructure.",
  },
  {
    question: "Do you contribute to open source?",
    answer: "Actively. I contribute to HuggingFace Transformers, vLLM, and maintain a few of my own tools. Check the Open Source section above.",
  },
  {
    question: "How do I book time with you?",
    answer: "Use the Calendly link on the contact page, or send me an email. I typically respond within 48 hours.",
  },
];

// ============================================================================
// CLIENTS — Corporate clients / companies you've worked with
// ============================================================================
export interface Client {
  name: string;
  logo: string;
  url?: string;
  hideWordmark?: boolean;
}

export const CLIENTS = {
  heading: "Trusted By",
  items: [
    { name: "Google", logo: "/logos/google.svg", url: "https://google.com" },
    { name: "Microsoft", logo: "/logos/microsoft.svg", url: "https://microsoft.com", hideWordmark: true },
    { name: "Amazon", logo: "/logos/amazon.svg", url: "https://amazon.com", hideWordmark: true },
    { name: "HuggingFace", logo: "/logos/huggingface.svg", url: "https://huggingface.co" },
    { name: "NVIDIA", logo: "/logos/nvidia.svg", url: "https://nvidia.com" },
    { name: "Meta", logo: "/logos/meta.svg", url: "https://meta.com" },
  ] as Client[],
};

// ============================================================================
// EDUCATION — Academic background, bootcamps, courses
// ============================================================================
export interface EducationEntry {
  degree: string;
  institution: string;
  url?: string;
  year: string;
  description?: string;
}

export const EDUCATION: EducationEntry[] = [
  {
    degree: "M.S. Computer Science",
    institution: "Stanford University",
    url: "https://stanford.edu",
    year: "2020",
    description: "Focus on Machine Learning and Natural Language Processing.",
  },
  {
    degree: "B.Tech. Computer Science",
    institution: "IIT Delhi",
    url: "https://iitd.ac.in",
    year: "2018",
    description: "Graduated with honors. Thesis on deep learning for medical imaging.",
  },
  {
    degree: "AI Product Management Bootcamp",
    institution: "Maven",
    url: "https://maven.com",
    year: "2024",
    description: "Led by Dr. Marily Nika (ex-Google PM). Completed capstone project.",
  },
];

// ============================================================================
// AWARDS — Recognitions, competition wins, notable achievements
// ============================================================================
export interface AwardEntry {
  title: string;
  issuer: string;
  issuerUrl?: string;
  year: string;
  url?: string;
  description?: string;
}

export const AWARDS: AwardEntry[] = [
  {
    title: "Best AI Application — HuggingFace Hackathon",
    issuer: "HuggingFace",
    issuerUrl: "https://huggingface.co",
    year: "2024",
    description: "Built a multi-agent document understanding pipeline in 48 hours.",
  },
  {
    title: "Top 10 Open Source Contributors",
    issuer: "GitHub",
    issuerUrl: "https://github.com",
    year: "2023",
    description: "Recognized for sustained contributions to ML ecosystem projects.",
  },
  {
    title: "Outstanding Graduate Thesis Award",
    issuer: "IIT Delhi",
    issuerUrl: "https://iitd.ac.in",
    year: "2018",
  },
];

// ============================================================================
// HIGHLIGHTS — Spotlight cards (power user badges, certifications, etc.)
// ============================================================================
export interface HighlightCard {
  title: string;
  badge?: string;
  description: string;
  bullets?: string[];
  certLinks?: { label: string; url: string }[];
  icon?: "sparkles" | "terminal" | "rocket" | "brain";
}

export const HIGHLIGHTS: HighlightCard[] = [
  {
    title: "Claude Code Power User",
    badge: "High-Agency · AI-Fluency",
    icon: "terminal",
    description: "Building production systems with AI-assisted development — using Claude Code for architecture design, complex refactors, and shipping full-stack features from terminal to deployment.",
    bullets: [
      "Built this entire portfolio site with Claude Code as AI pair programmer",
      "Custom MCP servers, multi-agent workflows, and agentic tool chains",
      "Deep expertise in prompt engineering and AI-native development patterns",
    ],
    certLinks: [
      { label: "Claude Code", url: "https://claude.ai/code" },
      { label: "Anthropic API", url: "https://docs.anthropic.com" },
    ],
  },
];
