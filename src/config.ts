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
  bio: "I contribute to open-source projects like HuggingFace Transformers, build developer tools, and write about ML and systems. Based in New Delhi, India.",
  photo: "/profile-photo.jpg", // place your photo in public/
  location: "New Delhi, India",
} as const;

// ============================================================================
// EXPERIENCE — Your career timeline (customize this)
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
    role: "Software Developer",
    company: "Your Company",
    companyUrl: "https://example.com",
    startDate: "Jan 2023",
    endDate: "Present",
    description: "Describe your role and key contributions here.",
  },
  // Add more entries...
];

// ============================================================================
// SKILLS — Your skill groups (customize this)
// ============================================================================
export interface SkillGroup {
  category: string;
  items: string[];
}

export const SKILLS: SkillGroup[] = [
  {
    category: "Languages",
    items: ["Python", "TypeScript", "JavaScript", "C"],
  },
  {
    category: "ML / AI",
    items: ["PyTorch", "HuggingFace Transformers", "ONNX"],
  },
  {
    category: "Web",
    items: ["Astro", "React", "Tailwind CSS", "Node.js"],
  },
  {
    category: "Tools & Cloud",
    items: ["Git", "Docker", "AWS", "GitHub Actions", "Linux"],
  },
];
