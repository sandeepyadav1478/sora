import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

export const WORKS_PATH = "src/data/works";

const works = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: `./${WORKS_PATH}` }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      type: z.enum(["oss", "project", "writing", "talk", "certification"]),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      description: z.string(),
      featured: z.boolean().optional().default(false),
      draft: z.boolean().optional().default(false),
      tags: z.array(z.string()).default(["others"]),
      links: z
        .array(z.object({ label: z.string(), url: z.string() }))
        .optional()
        .default([]),
      image: image().or(z.string()).optional(),
      organization: z.string().optional(),
      ogImage: image().or(z.string()).optional(),
      canonicalURL: z.string().optional(),
      timezone: z.string().optional(),
    }),
});

export const collections = { works };
