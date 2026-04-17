import type { CollectionEntry } from "astro:content";
import { SITE } from "@/config";

const workFilter = ({ data }: CollectionEntry<"works">) => {
  const isPublishTimePassed =
    Date.now() >
    new Date(data.pubDatetime).getTime() - SITE.scheduledPostMargin;
  return !data.draft && (import.meta.env.DEV || isPublishTimePassed);
};

export default workFilter;
