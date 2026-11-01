import type { APIRoute } from 'astro';
import { failure } from '../../../../lib/api';
export const prerender = false;
export const POST: APIRoute = async () => failure('NOT_SUPPORTED', 'Flag diverifikasi saat payload berhasil dijalankan.', 400);
