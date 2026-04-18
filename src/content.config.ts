import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

export const WORKS_PATH = "src/data/works";

const works = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: `./${WORKS_PATH}` }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      type: z.enum(["oss", "project", "writing", "talk", "certification", "experience"]),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      description: z.string(),
      featured: z.boolean().optional().default(false),
      draft: z.boolean().optional().default(false),
      tags: z.array(z.string()).default(["others"]),
      tech: z.array(z.string()).optional().default([]),
      links: z
        .array(z.object({ label: z.string(), url: z.string() }))
        .optional()
        .default([]),
      image: image().or(z.string()).optional(),
      organization: z.string().optional(),
      organizationUrl: z.string().optional(),
      role: z.string().optional(),
      endDatetime: z.date().optional().nullable(),
      ongoing: z.boolean().optional().default(false),
      status: z.enum(["active", "maintained", "archived", "in-production"]).optional(),
      highlights: z
        .array(z.object({ label: z.string(), value: z.string() }))
        .optional()
        .default([]),
      gallery: z
        .array(z.object({
          src: z.string(),
          caption: z.string().optional(),
          type: z.enum(["image", "video"]).optional().default("image"),
        }))
        .optional()
        .default([]),
      timeline: z
        .array(z.object({
          date: z.string(),
          title: z.string(),
          description: z.string().optional(),
        }))
        .optional()
        .default([]),
      ogImage: image().or(z.string()).optional(),
      canonicalURL: z.string().optional(),
      timezone: z.string().optional(),
    }),
});

export const collections = { works };
