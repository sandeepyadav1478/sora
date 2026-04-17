import type { CollectionEntry } from "astro:content";
import getSortedWorks from "./getSortedWorks";

type WorkType = CollectionEntry<"works">["data"]["type"];

const getWorksByType = (works: CollectionEntry<"works">[], type: WorkType) =>
  getSortedWorks(works.filter(work => work.data.type === type));

export default getWorksByType;
