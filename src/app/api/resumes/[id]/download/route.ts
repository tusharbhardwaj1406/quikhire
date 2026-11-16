import { NextResponse, type NextRequest } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { asUser, db } from '@/lib/db';
import { signedDownloadUrl } from '@/lib/storage';

/** Authorises in the database (owner, or employer with the candidate's consent; every download logged), then issues a 60-second link. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const { id } = await params;
  if (!user || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 });
  const [{ path }] = await asUser(user.id, (tx) => tx`select authorize_resume_download(${id}) as path`);
  if (!path) return new NextResponse('This resume is not available for download.', { status: 403 });
  const [r] = await db()`select file_name from resumes where id = ${id}`;
  const url = await signedDownloadUrl(path, r?.file_name ?? 'resume', 60);
  return NextResponse.redirect(new URL(url, request.url), { status: 302 });
}
