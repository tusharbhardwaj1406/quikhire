import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { readLocalSigned } from '@/lib/storage';

/** Development/test stand-in for Supabase signed URLs. Disabled unless STORAGE_DRIVER=local. */
export async function GET(request: NextRequest) {
  if (env.storageDriver !== 'local') return new NextResponse('Not found', { status: 404 });
  const sp = request.nextUrl.searchParams;
  const bytes = await readLocalSigned(sp.get('p') ?? '', Number(sp.get('e')), sp.get('s') ?? '');
  if (!bytes) return new NextResponse('Link expired', { status: 403 });
  return new NextResponse(new Uint8Array(bytes), { headers: { 'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${(sp.get('n') ?? 'file').replace(/[^\w.\- ]/g, '_')}"`, 'Cache-Control': 'private, no-store' } });
}
