import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from './env';
import { supabaseAdmin } from './supabase/server';

const BUCKET = 'resumes';
export const MAX_RESUME_BYTES = 4 * 1024 * 1024; // stays under the serverless request-body limit
const TYPES: Record<string, { ext: string; magic: number[] }> = {
  'application/pdf': { ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] },                                                            // %PDF
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', magic: [0x50, 0x4b, 0x03, 0x04] },   // zip
  'application/msword': { ext: 'doc', magic: [0xd0, 0xcf, 0x11, 0xe0] },                                                         // OLE2
};

/** Checks size, declared type and the file's leading bytes (a renamed executable is rejected). */
export function validateResume(file: { type: string; size: number }, head: Uint8Array): { ext: string } | { error: string } {
  const t = TYPES[file.type];
  if (!t) return { error: 'Please upload a PDF, DOC or DOCX file.' };
  if (file.size <= 0 || file.size > MAX_RESUME_BYTES) return { error: 'The file must be smaller than 4 MB.' };
  if (!t.magic.every((b, i) => head[i] === b)) return { error: 'This file does not look like a valid document.' };
  return { ext: t.ext };
}

const localRoot = () => path.resolve(process.cwd(), '.local-storage');
function localOnly() {
  if (process.env.VERCEL_ENV === 'production') throw new Error('STORAGE_DRIVER=local is for development and tests only.');
}
function sign(p: string, exp: number) { return createHmac('sha256', env.cronSecret || 'dev-only').update(`${p}:${exp}`).digest('hex'); }

export async function putObject(objectPath: string, bytes: Buffer, contentType: string): Promise<void> {
  if (env.storageDriver === 'local') {
    localOnly();
    const full = path.join(localRoot(), objectPath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, bytes);
    return;
  }
  const { error } = await supabaseAdmin().storage.from(BUCKET).upload(objectPath, bytes, { contentType, upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
}

export async function removeObject(objectPath: string): Promise<void> {
  if (env.storageDriver === 'local') { localOnly(); await rm(path.join(localRoot(), objectPath), { force: true }); return; }
  await supabaseAdmin().storage.from(BUCKET).remove([objectPath]);
}

/** Short-lived download link. The bucket is private; nothing is ever publicly addressable. */
export async function signedDownloadUrl(objectPath: string, downloadName: string, seconds = 60): Promise<string> {
  if (env.storageDriver === 'local') {
    localOnly();
    const exp = Math.floor(Date.now() / 1000) + seconds;
    return `/api/local-file?p=${encodeURIComponent(objectPath)}&e=${exp}&s=${sign(objectPath, exp)}&n=${encodeURIComponent(downloadName)}`;
  }
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(objectPath, seconds, { download: downloadName });
  if (error || !data) throw new Error(`Could not create download link: ${error?.message}`);
  return data.signedUrl;
}

export async function readLocalSigned(p: string, exp: number, sig: string): Promise<Buffer | null> {
  localOnly();
  const expected = sign(p, exp);
  if (exp < Date.now() / 1000 || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const full = path.join(localRoot(), p);
  if (!full.startsWith(localRoot() + path.sep)) return null;
  return readFile(full).catch(() => null);
}
