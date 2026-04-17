import type { CollectionEntry } from "astro:content";

type GroupKey = string | number | symbol;

interface GroupFunction<T> {
  (item: T, index?: number): GroupKey;
}

const getWorksByGroupCondition = (
  works: CollectionEntry<"works">[],
  groupFunction: GroupFunction<CollectionEntry<"works">>
) => {
  const result: Record<GroupKey, CollectionEntry<"works">[]> = {};
  for (let i = 0; i < works.length; i++) {
    const item = works[i];
    const groupKey = groupFunction(item, i);
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
  }
  return result;
};

export default getWorksByGroupCondition;
