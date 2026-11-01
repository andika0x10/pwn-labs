import { getCollection, type CollectionEntry } from 'astro:content';

const isProduction = import.meta.env.PROD;
export type LevelEntry = CollectionEntry<'levels'>;
export type WorldEntry = CollectionEntry<'worlds'>;

export async function getPublishedLevels() {
  return (await getCollection('levels', ({ data }) => !(isProduction && data.draft)))
    .sort((a, b) => a.data.world.localeCompare(b.data.world) || a.data.order - b.data.order);
}

export async function getPublishedWorlds() {
  return (await getCollection('worlds', ({ data }) => !(isProduction && data.draft))).sort((a, b) => a.data.order - b.data.order);
}

export async function findLevel(world: string, id: string) {
  return (await getPublishedLevels()).find((entry) => entry.data.world === world && entry.data.id === id);
}
