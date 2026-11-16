import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54322/quikhire_e2e', { onnotice: () => {} });
const run = Date.now().toString(36);
const cand = { email: `asha.${run}@example.test`, password: 'correct-horse-battery', name: 'Asha Verma' };
const emp = { email: `hr.${run}@acmeinfra.test`, password: 'correct-horse-battery', name: 'Rohit Mehta', company: `Acme Infra ${run}` };
const admin = { email: `admin.${run}@quikhire.test`, password: 'correct-horse-battery' };
const SHOTS = process.env.SHOTS_DIR ?? 'test-results/shots';

async function login(page: Page, u: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Password').fill(u.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(/\/(candidate|employer|admin)/);
}
const logout = async (page: Page) => { await page.getByRole('button', { name: 'Sign out' }).click(); await page.waitForURL('http://localhost:3000/'); };
const card = (page: Page, id: string) => page.locator(`#${id}`);

test.describe.configure({ mode: 'serial' });
test.afterAll(() => sql.end());

test('public site is honest before launch and shows real pricing', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Available immediately?');
  await expect(page.getByText('We are just getting started.')).toBeVisible();          // no invented statistics
  await expect(page.getByText('Launch offer:')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choose your city' })).toBeVisible();
  for (const city of ['Mumbai', 'Pune', 'Delhi NCR', 'Bengaluru', 'Kolkata', 'Chennai', 'Hyderabad']) await expect(page.locator('#cities').getByText(city, { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-home-desktop.png`, fullPage: true });
  await page.goto('/pricing');
  await expect(page.getByText('₹149', { exact: true })).toBeVisible();
  await expect(page.getByText('₹1,499', { exact: true })).toBeVisible();
  const robots = await (await page.request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /candidate');
  expect((await page.request.get('/api/cron/daily')).status()).toBe(401);
  expect((await page.request.post('/api/webhooks/razorpay', { data: '{}' })).status()).toBeGreaterThanOrEqual(400);
});

test('portals are closed to signed-out visitors', async ({ page }) => {
  for (const p of ['/candidate', '/employer/search', '/admin']) { await page.goto(p); await expect(page).toHaveURL(/\/login\?next=/); }
});

test('candidate signs up, completes a profile and uploads a resume', async ({ page }) => {
  await page.goto('/signup/candidate');
  await page.getByLabel('Full name').fill(cand.name);
  await page.getByLabel('Mobile number').fill('9811122233');
  await page.getByLabel('Email').fill(cand.email);
  await page.getByLabel('Password').fill(cand.password);
  await page.getByLabel(/^Region/).selectOption({ label: 'Delhi NCR' });
  await page.getByLabel('City or locality').fill('Dwarka');
  await page.getByLabel('Total experience (years)').fill('11');
  await page.getByLabel(/^Industry/).selectOption({ label: 'Civil Engineering and Infrastructure' });
  await page.getByLabel(/^Specialisation/).selectOption({ label: 'Bridge Engineering' });
  await page.getByLabel('When can you join?').selectOption('immediate');
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole('button', { name: 'Create my account' }).click();
  await page.waitForURL(/\/candidate$/);
  await expect(page.getByText('Your profile is not in employer search yet')).toBeVisible();

  await page.goto('/candidate/profile');
  await card(page, 'basics').getByLabel('Current or most recent designation').fill('Senior Bridge Engineer');
  await card(page, 'basics').getByLabel('Professional summary').fill('Eleven years designing and checking prestressed concrete and cable-stayed bridges for metro and highway projects across India and the Gulf.');
  await card(page, 'basics').getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'basics').getByText('Saved.')).toBeVisible();

  await card(page, 'expertise').getByLabel('Cable-Stayed Bridges').check();
  await card(page, 'expertise').getByLabel('Technical skills').fill('mid');
  await card(page, 'expertise').getByRole('button', { name: 'MIDAS Civil' }).click();   // type-ahead suggestion from the taxonomy
  await card(page, 'expertise').getByLabel('Technical skills').fill('AASHTO');
  await card(page, 'expertise').getByLabel('Technical skills').press('Enter');
  await card(page, 'expertise').getByLabel('Technical skills').fill('Segmental erection');
  await card(page, 'expertise').getByLabel('Technical skills').press('Enter');           // a brand-new skill
  await card(page, 'expertise').getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'expertise').getByText('Saved.')).toBeVisible();

  await card(page, 'salary').getByLabel('Expected CTC (₹/year)').fill('3200000');
  await card(page, 'salary').getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'salary').getByText('Saved.')).toBeVisible();

  await card(page, 'experience').getByLabel('Employer', { exact: true }).fill('Systra India');
  await card(page, 'experience').getByLabel('Designation', { exact: true }).fill('Bridge Engineer');
  await card(page, 'experience').getByLabel('Start', { exact: true }).fill('2019-04');
  await card(page, 'experience').getByRole('button', { name: 'Add experience' }).click();
  await expect(card(page, 'experience').getByText('Bridge Engineer · Systra India')).toBeVisible();

  await page.goto('/candidate/resumes');
  await page.getByLabel(/^File/).setInputFiles({ name: 'asha-verma-cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% test resume\n') });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText('Resume uploaded.')).toBeVisible();
  await page.getByLabel(/^File/).setInputFiles({ name: 'malware.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MZ\x90\x00 not a pdf') });
  await page.getByRole('button', { name: 'Upload' }).click();
  await expect(page.getByText('does not look like a valid document')).toBeVisible();     // disguised file rejected

  await page.goto('/candidate');
  await expect(page.getByText('You are visible to verified employers')).toBeVisible();   // free launch period: listed without paying
  await expect(page.getByText('Free launch period')).toBeVisible();
  const [c] = await sql`select listed, onboarding_complete, profile_completeness from candidates c join profiles p on p.id = c.user_id where p.email = ${cand.email}`;
  expect(c).toMatchObject({ listed: true, onboarding_complete: true });
  expect(c.profile_completeness).toBeGreaterThanOrEqual(85);
  await page.goto('/candidate/billing');
  await expect(page.getByText('Free during our launch')).toBeVisible();                  // nothing to pay, no simulated payments
  await page.goto('/admin'); await expect(page).toHaveURL(/\/candidate$/);                // role isolation
  await logout(page);
});

test('employer registers a company and is locked out until verified and subscribed', async ({ page }) => {
  await page.goto('/signup/employer');
  await page.getByLabel('Your full name').fill(emp.name);
  await page.getByLabel('Mobile number').fill('9899900011');
  await page.getByLabel('Official business email').fill(emp.email);
  await page.getByLabel('Password').fill(emp.password);
  await page.getByLabel(/I agree to the/).check();
  await page.getByRole('button', { name: 'Create recruiter account' }).click();
  await page.waitForURL(/\/employer$/);
  await page.getByRole('link', { name: 'Add company details' }).click();
  await page.getByLabel('Company name').fill(emp.company);
  await page.getByLabel('Official website').fill('https://acmeinfra.test');
  await page.getByLabel('Office city').fill('Gurugram');
  await page.getByLabel('Registration type').selectOption('gstin');
  await page.getByLabel('Registration number').fill('06AAACA1234A1Z5');
  await page.getByRole('button', { name: 'Submit for verification' }).click();
  await expect(page.getByText('Company details saved.')).toBeVisible();
  await page.goto('/employer/search');
  await expect(page.getByText('Verification in progress')).toBeVisible();
  await expect(page.getByText('Search unlocks once your company is verified and subscribed')).toBeVisible();
  await page.goto('/candidate'); await expect(page).toHaveURL(/\/employer$/);
  await logout(page);
});

test('admin verifies the employer and grants pilot access', async ({ page }) => {
  // The first admin is created by SQL (as documented): sign up normally, then promote in the database.
  const res = await page.request.post('http://127.0.0.1:54321/auth/v1/signup', { data: { email: admin.email, password: admin.password, data: { full_name: 'Platform Admin' } } });
  expect(res.ok()).toBeTruthy();
  await sql`update profiles set role = 'admin' where email = ${admin.email}`;
  await login(page, admin);
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();

  await page.goto('/admin/employers');
  const row = page.locator('section', { hasText: emp.company });
  await expect(row.getByText('06AAACA1234A1Z5')).toBeVisible();
  await row.getByRole('button', { name: 'Record decision' }).click();
  await expect(row).toHaveCount(0);                                                       // leaves the pending queue
  await page.goto('/admin/employers?status=verified');
  await expect(page.getByText(emp.company)).toBeVisible();

  for (const email of [emp.email, cand.email]) {
    await page.goto(`/admin/users?q=${encodeURIComponent(email)}`);
    const u = page.locator('section', { hasText: email });
    await u.getByLabel('Action').selectOption('grant_access');
    await u.getByRole('button', { name: 'Apply' }).click();
    await expect(u.getByText('Done.')).toBeVisible();
  }
  await page.goto('/admin/trust');
  await expect(page.getByText('employer.verified')).toBeVisible();                       // audit trail
  await expect(page.getByText('user.grant_access').first()).toBeVisible();
  // walk-ins researched from public sources are imported with their source links
  await page.goto('/admin/walk-ins');
  await page.getByLabel('Walk-ins JSON').fill(readFileSync('supabase/seed/walkins-2026-11-16.json', 'utf8'));
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('Imported 12; 0 duplicate(s) skipped.')).toBeVisible();
  await page.getByLabel('Walk-ins JSON').fill(readFileSync('supabase/seed/walkins-2026-11-16.json', 'utf8'));
  await page.getByRole('button', { name: 'Import' }).click();
  await expect(page.getByText('Imported 0; 12 duplicate(s) skipped.')).toBeVisible();     // re-import is harmless
  await page.goto('/admin/settings');
  await expect(page.getByText('The launch clock has not started')).toBeVisible();
  await expect(page.getByText('Not connected: set RAZORPAY_KEY_ID')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-admin-settings.png`, fullPage: true });
  await logout(page);
  expect((await sql`select listed from candidates c join profiles p on p.id = c.user_id where p.email = ${cand.email}`)[0].listed).toBe(true);
});

test('employer finds the candidate, sees only consented data, and sends an enquiry', async ({ page }) => {
  await login(page, emp);
  await page.goto('/employer/search');
  await page.getByLabel('Describe who you are looking for').fill('immediately available bridge engineers in Delhi NCR with 8-12 years of experience and Midas Civil expertise');
  await page.getByRole('button', { name: 'Find', exact: true }).click();
  await page.waitForURL(/exp_min=8/);
  await expect(page.getByLabel('Min exp (yrs)')).toHaveValue('8');
  await expect(page.getByLabel(/^Region/)).toHaveValue('delhi-ncr');                      // “Delhi NCR” became the region, so Dwarka/Gurugram/Noida all match                        // NL query became visible, editable filters
  await expect(page.getByLabel('Skills', { exact: false }).first()).toHaveValue('MIDAS Civil');
  const result = page.locator('li', { hasText: 'Senior Bridge Engineer' }).first();
  await expect(result).toBeVisible();
  await expect(result.getByText(/Candidate QH-/)).toBeVisible();                          // name masked by default
  await expect(page.getByText(cand.name)).toHaveCount(0);
  await expect(result.getByText('Not shared')).toBeVisible();                             // salary masked by default
  await expect(result.getByText('Self-declared')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-employer-search.png`, fullPage: true });

  await page.goto('/employer/search?exp_min=20');                                         // filters really filter
  await expect(page.getByText('No candidates match these filters yet')).toBeVisible();
  await page.goto('/employer/search?region=pune');
  await expect(page.getByText('No candidates match these filters yet')).toBeVisible();
  await page.goto('/employer/search?region=delhi-ncr&availability=immediate');
  await page.locator('li', { hasText: 'Senior Bridge Engineer' }).first().getByRole('link', { name: 'View profile' }).click();
  await expect(page.getByText('Contact details are shared when the candidate accepts your enquiry.')).toBeVisible();
  await expect(page.getByText(cand.email)).toHaveCount(0);
  await expect(page.getByText('The candidate has not enabled resume downloads.')).toBeVisible();
  await page.getByLabel('Subject', { exact: true }).fill('Senior Bridge Engineer, Gurugram (immediate)');
  await page.getByLabel(/^Message/).fill('We are hiring for a metro viaduct package and would like to speak with you this week.');
  await page.getByRole('button', { name: 'Send to candidate' }).click();
  await expect(page.getByText('Enquiry sent. You will be notified')).toBeVisible();

  // a verified employer posts its own walk-in; it is public immediately and badged as verified
  await page.goto('/employer/walk-ins');
  await page.getByLabel(/^Region/).selectOption({ label: 'Delhi NCR' });
  await page.getByLabel('Role / position').fill('Site Engineer – Metro Viaduct');
  await page.getByLabel('First day').fill(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  await page.getByLabel('Timing').fill('10:00 am – 4:00 pm');
  await page.getByLabel('Venue name').fill('Acme Infra Project Office');
  await page.getByRole('button', { name: 'Publish walk-in' }).click();
  await expect(page.getByText('Published. It appears on the city page')).toBeVisible();
  await logout(page);
  await page.goto('/in/delhi-ncr');
  const posted = page.locator('article', { hasText: 'Site Engineer – Metro Viaduct' });
  await expect(posted.getByText('Verified employer')).toBeVisible();
  const imported = page.locator('article', { hasText: 'Info Edge' });
  await expect(imported.getByText('From the web · not verified')).toBeVisible();
  await expect(imported.getByRole('link', { name: /Original listing/ })).toHaveAttribute('href', /^https:\/\/thepowerhunt\.in/);
  await page.goto('/in/chennai');
  await expect(page.locator('article')).toHaveCount(4);
  await page.screenshot({ path: `${SHOTS}/09-region-chennai-walkins.png`, fullPage: true });
  await page.goto('/in/mumbai');
  await expect(page.getByText('No walk-ins are listed for Mumbai in the next 7 days yet.')).toBeVisible();   // nothing found → say so
});

test('candidate accepts; only then does the employer see contact details', async ({ page }) => {
  await login(page, cand);
  await expect(page.getByText('You are visible to verified employers')).toBeVisible();
  await expect(page.getByText(`New enquiry from ${emp.company}`)).toBeVisible();
  await expect(page.getByText('An employer viewed your profile')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-candidate-dashboard.png`, fullPage: true });
  await page.goto('/candidate/enquiries');
  await page.getByLabel('Accept and share my contact details').check();
  await page.getByRole('button', { name: 'Send reply' }).click();
  await expect(page.getByText('Accepted', { exact: true })).toBeVisible();
  const download = await page.request.get('/api/me/export');
  expect(download.ok()).toBeTruthy();
  expect(JSON.stringify(await download.json())).toContain('Senior Bridge Engineer');
  await logout(page);

  await login(page, emp);
  await page.goto('/employer/pipeline');
  await page.getByRole('link', { name: 'Senior Bridge Engineer' }).click();
  await expect(page.getByRole('link', { name: cand.email })).toBeVisible();
  await expect(page.getByText(cand.name).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-employer-candidate-profile.png`, fullPage: true });
});

test('mobile layout has no horizontal overflow', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true });
  const page = await ctx.newPage();
  for (const [path, shot] of [['/', '06-home-mobile'], ['/pricing', '07-pricing-mobile'], ['/signup/candidate', '08-signup-mobile'], ['/walk-ins', '10-walkins-mobile'], ['/in/hyderabad', '11-region-mobile']] as const) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `${SHOTS}/${shot}.png`, fullPage: true });
  }
  await ctx.close();
});
