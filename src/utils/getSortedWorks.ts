import type { CollectionEntry } from "astro:content";
import workFilter from "./workFilter";

const getSortedWorks = (works: CollectionEntry<"works">[]) => {
  return works
    .filter(workFilter)
    .sort(
      (a, b) =>
        Math.floor(
          new Date(b.data.modDatetime ?? b.data.pubDatetime).getTime() / 1000
        ) -
        Math.floor(
          new Date(a.data.modDatetime ?? a.data.pubDatetime).getTime() / 1000
        )
    );
};

export default getSortedWorks;
