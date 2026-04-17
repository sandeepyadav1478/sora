import { WORKS_PATH } from "@/content.config";
import { slugifyStr } from "./slugify";

/**
 * Get full path of a work item
 * @param id - id of the work item (aka slug)
 * @param filePath - the work item full file location
 * @param includeBase - whether to include `/works` in return value
 * @returns work item path
 */
export function getPath(
  id: string,
  filePath: string | undefined,
  includeBase = true
) {
  const pathSegments = filePath
    ?.replace(WORKS_PATH, "")
    .split("/")
    .filter(path => path !== "")
    .filter(path => !path.startsWith("_"))
    .slice(0, -1)
    .map(segment => slugifyStr(segment));

  const basePath = includeBase ? "/works" : "";

  const workId = id.split("/");
  const slug = workId.length > 0 ? workId.slice(-1) : workId;

  if (!pathSegments || pathSegments.length < 1) {
    return [basePath, slug].join("/");
  }

  return [basePath, ...pathSegments, slug].join("/");
}
