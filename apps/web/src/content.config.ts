import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// Dokumentasi alat dan referensi (statis). Skema level ditambahkan di fase konten.
const docs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    order: z.number().int().positive(),
  }),
});

const worlds = defineCollection({
  loader: glob({ pattern: '**/world.json', base: './src/content/worlds' }),
  schema: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1),
    description: z.string().min(1),
    order: z.number().int().positive(),
    draft: z.boolean().default(false),
    example: z.boolean().default(false),
  }),
});

const levels = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/levels' }),
  schema: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    world: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    order: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().min(1),
    points: z.number().int().positive(),
    arch: z.enum(['x86-32', 'x86-64']),
    binary: z.string().startsWith('/binaries/'),
    source: z.string().startsWith('/sources/').optional(),
    success: z.discriminatedUnion('type', [
      z.object({ type: z.literal('eip-reaches'), symbol: z.string() }),
      z.object({ type: z.literal('output-contains'), value: z.string() }),
    ]),
    symbols: z.record(z.string(), z.number().int().nonnegative()).default({}),
    hints: z.array(z.string().min(1)).default([]),
    requires: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    example: z.boolean().default(false),
  }),
});

export const collections = { docs, worlds, levels };
