import { NextResponse, type NextRequest } from 'next/server';
import { asAnon } from '@/lib/db';

/** Public reference data for pickers and type-ahead (no personal data). */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const industryId = Number(sp.get('industry_id'));
  const q = (sp.get('skills') ?? '').trim().slice(0, 40);
  const headers = { 'Cache-Control': 'public, max-age=300' };
  if (Number.isInteger(industryId) && industryId > 0) {
    const specialisations = await asAnon((tx) => tx`select s.id, s.name, d.name as domain from specialisations s
      left join functional_domains d on d.id = s.domain_id where s.industry_id = ${industryId} and s.is_active order by d.name, s.name`);
    return NextResponse.json({ specialisations }, { headers });
  }
  if (q.length >= 2) {
    const rows = await asAnon((tx) => tx`select name from skills where is_active and name::text ilike ${'%' + q.replace(/[%_\\]/g, '') + '%'}
      order by (name::text ilike ${q.replace(/[%_\\]/g, '') + '%'}) desc, length(name::text) limit 8`);
    return NextResponse.json({ skills: rows.map((r) => r.name) }, { headers });
  }
  return NextResponse.json({ specialisations: [], skills: [] }, { headers });
}
