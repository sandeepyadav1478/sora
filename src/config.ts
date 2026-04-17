// ============================================================================
// SITE — Template-level settings
// ============================================================================
export const SITE = {
  website: "https://sandeepyadav1478.github.io/",
  author: "Sandeep Yadav",
  profile: "https://sandeepyadav1478.github.io/",
  desc: "Developer from New Delhi. Open source contributor, builder, writer.",
  title: "Sora",
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
  timezone: "Asia/Kolkata",
} as const;

// ============================================================================
// PROFILE — Your personal information (customize this)
// ============================================================================
export const PROFILE = {
  name: "Sandeep Yadav",
  tagline: "Developer from New Delhi. Open source contributor, builder, writer.",
  photo: "/profile-photo.svg", // replace with your photo in public/ (.jpg, .png, or .svg)
} as const;

// ============================================================================
// SECTIONS — Toggle optional homepage sections (set to false to hide)
// ============================================================================
export const SECTIONS = {
  showAbout: false,
  showExperience: false,
  showSkills: false,
  showContact: false,
} as const;

// ============================================================================
// ABOUT — Short bio (shown on homepage only if SECTIONS.showAbout is true)
// ============================================================================
export const ABOUT = {
  bio: "I contribute to open-source projects like HuggingFace Transformers, build developer tools, and write about ML and systems. Based in New Delhi, India.",
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
  // {
  //   role: "Software Developer",
  //   company: "Your Company",
  //   companyUrl: "https://example.com",
  //   startDate: "Jan 2023",
  //   endDate: "Present",
  //   description: "Describe your role and key contributions here.",
  // },
];

// ============================================================================
// SKILLS — Skill groups (shown only if SECTIONS.showSkills is true)
// ============================================================================
export interface SkillGroup {
  category: string;
  items: string[];
}

export const SKILLS: SkillGroup[] = [
  // {
  //   category: "Languages",
  //   items: ["Python", "TypeScript", "JavaScript"],
  // },
];
