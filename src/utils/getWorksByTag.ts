import type { CollectionEntry } from "astro:content";
import getSortedWorks from "./getSortedWorks";
import { slugifyAll } from "./slugify";

const getWorksByTag = (works: CollectionEntry<"works">[], tag: string) =>
  getSortedWorks(
    works.filter(work => slugifyAll(work.data.tags).includes(tag))
  );

export default getWorksByTag;
