import { ActionForm, SubmitButton } from '@/components/forms';
import { Badge, Card, EmptyState, Field, PageHeader } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { dateIN } from '@/lib/brand';
import { asUser } from '@/lib/db';
import { resumeAction, uploadResume } from '../actions';

export default async function ResumesPage() {
  const user = await requireRole('candidate');
  const { resumes, allow } = await asUser(user.id, async (tx) => ({
    resumes: await tx`select id, file_name, label, size_bytes, is_primary, created_at from resumes where candidate_id = ${user.id} order by is_primary desc, created_at desc`,
    allow: (await tx`select allow_resume_download from candidates where user_id = ${user.id}`)[0].allow_resume_download as boolean,
  }));
  return (
    <>
      <PageHeader title="Resumes" sub="Keep up to five versions. Files are stored privately and are never public." />
      <div className="space-y-6">
        <Card title="Upload a resume">
          <ActionForm action={uploadResume} submit="Upload" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="File" hint="PDF, DOC or DOCX, up to 4 MB."><input name="file" type="file" required accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="input" /></Field>
              <Field label="Label (optional)" hint="e.g. “Bridge design focus”."><input name="label" maxLength={60} className="input" /></Field>
            </div>
          </ActionForm>
        </Card>
        <Card title="Your resumes" action={<Badge tone={allow ? 'good' : 'neutral'}>{allow ? 'Employers may download' : 'Downloads switched off'}</Badge>}>
          {resumes.length === 0 ? <EmptyState title="No resume uploaded yet">Profiles with a resume receive more employer interest.</EmptyState> : (
            <ul className="divide-y divide-slate-100">
              {resumes.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div><p className="font-medium text-navy-900">{r.label ?? r.file_name} {r.is_primary && <Badge tone="info">Primary</Badge>}</p>
                    <p className="text-xs text-slate-500">{r.file_name} · {(r.size_bytes / 1024).toFixed(0)} KB · updated {dateIN(r.created_at)}</p></div>
                  <div className="flex items-center gap-2">
                    <a href={`/api/resumes/${r.id}/download`} className="text-sm font-medium text-accent-700 hover:underline">Preview / download</a>
                    {!r.is_primary && <form action={resumeAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value="primary" /><SubmitButton variant="outline" small>Make primary</SubmitButton></form>}
                    <form action={resumeAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value="delete" /><SubmitButton variant="danger" small confirm="Delete this resume permanently?">Delete</SubmitButton></form>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-slate-500">To replace a resume, upload the new version and delete the old one. Whether employers can download is controlled in Privacy &amp; settings.</p>
        </Card>
      </div>
    </>
  );
}
