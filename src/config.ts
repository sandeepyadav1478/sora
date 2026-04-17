// ============================================================================
// SITE — Template-level settings
// ============================================================================
export const SITE = {
  website: "https://johndoe.github.io/",
  author: "John Doe",
  profile: "https://johndoe.github.io/",
  desc: "Software engineer building tools for the web. Open source contributor and technical writer.",
  title: "John Doe",
  ogImage: "sora-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 6,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000,
  showArchives: false,
  showBackButton: false,
  editPost: {
    enabled: false,
    text: "",
    url: "",
  },
  dynamicOgImage: true,
  dir: "ltr",
  lang: "en",
  timezone: "America/New_York",
} as const;

// ============================================================================
// PROFILE — Your personal information (customize this)
// ============================================================================
export const PROFILE = {
  name: "John Doe",
  tagline: "Software engineer building tools for the web. Open source contributor and technical writer.",
  photo: "/profile-photo.svg", // replace with your photo in public/ (.jpg, .png, or .svg)
} as const;

// ============================================================================
// SECTIONS — Toggle optional homepage sections (set to true to show)
// ============================================================================
export const SECTIONS = {
  showAbout: true,
  showExperience: false,
  showSkills: true,
  showContact: true,
} as const;

// ============================================================================
// ABOUT — Short bio (shown on homepage only if SECTIONS.showAbout is true)
// ============================================================================
export const ABOUT = {
  bio: "I'm a full-stack engineer with a passion for developer tools, open source, and clean code. I've contributed to projects used by thousands of developers and love sharing what I learn through writing and talks. Currently based in New York.",
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
    role: "Senior Software Engineer",
    company: "Acme Corp",
    companyUrl: "https://example.com",
    startDate: "Mar 2022",
    endDate: "Present",
    description:
      "Leading the developer platform team. Built internal tooling that reduced deploy times by 40%.",
  },
  {
    role: "Software Engineer",
    company: "Startup Inc",
    companyUrl: "https://example.com",
    startDate: "Jun 2019",
    endDate: "Feb 2022",
    description:
      "Full-stack development on a SaaS analytics platform. Shipped the real-time dashboard feature used by 500+ customers.",
  },
  {
    role: "Junior Developer",
    company: "WebAgency",
    startDate: "Jan 2017",
    endDate: "May 2019",
    description:
      "Built client websites and internal tools. Introduced automated testing to the team's workflow.",
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
    category: "Languages",
    items: ["TypeScript", "Python", "Go", "Rust", "SQL"],
  },
  {
    category: "Frontend",
    items: ["React", "Astro", "Tailwind CSS", "Next.js"],
  },
  {
    category: "Backend",
    items: ["Node.js", "PostgreSQL", "Redis", "GraphQL"],
  },
  {
    category: "Tools & Cloud",
    items: ["Git", "Docker", "AWS", "GitHub Actions", "Terraform"],
  },
];
