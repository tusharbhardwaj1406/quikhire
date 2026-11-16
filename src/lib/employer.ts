import { cache } from 'react';
import { asUser } from './db';

export type EmployerContext = {
  employer: { id: string; name: string; verification_status: 'pending' | 'verified' | 'rejected' | 'suspended'; verification_notes: string | null; [k: string]: unknown } | null;
  designation: string | null;
  canSearch: boolean;
};
/** The recruiter's company, its verification state, and whether search is currently unlocked. */
export const getEmployerContext = cache(async (userId: string): Promise<EmployerContext> =>
  asUser(userId, async (tx) => {
    const [row] = await tx`select e.*, m.designation as member_designation from employers e join employer_members m on m.employer_id = e.id where m.user_id = ${userId}`;
    const [{ ok }] = await tx`select employer_can_search() as ok`;
    return { employer: (row as EmployerContext['employer']) ?? null, designation: row?.member_designation ?? null, canSearch: ok };
  }));
