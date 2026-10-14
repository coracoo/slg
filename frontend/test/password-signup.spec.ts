import { expect, test, type Page } from '@playwright/test';
import { Op } from '../src/api/protocol';

const role = (page: Page, name: string) => page.locator(`[role="${name}"]`);
const signupButton = (page: Page) => role(page, '账号面板-注册入口');
const signupForm = (page: Page) => role(page, '账号面板-注册表单');

async function openLogin(page: Page, config: Record<string, unknown> = { passwordSignup: true }, error?: { code: string; message: string }) {
  const requests: Array<{ op: number; seq: number; data: Record<string, unknown> }> = [];
  await page.route('**/auth/config', (route) => route.fulfill({ json: config }));
  await page.routeWebSocket(/\/ws$/, (ws) => {
    ws.onMessage((message) => {
      const request = JSON.parse(String(message));
      requests.push(request);
      if (error) ws.send(JSON.stringify({ op: request.op, seq: request.seq, ok: false, error }));
    });
  });
  const fetched = page.waitForResponse('**/auth/config');
  await page.goto('/');
  await fetched;
  return requests;
}

async function fillSignup(page: Page, username = '  new-player  ', password = 'safe-password', confirm = password) {
  const form = signupForm(page);
  await form.locator('[name="username"]').fill(username);
  await form.locator('[name="password"]').fill(password);
  await form.locator('[name="confirmPassword"]').fill(confirm);
}

test('normal login sends no registration flag, even when signup is open', async ({ page }) => {
  const requests = await openLogin(page, { passwordSignup: true }, { code: 'INVALID_CREDENTIALS', message: 'bad password' });
  const form = role(page, '账号面板-登录表单');
  await form.locator('[name="username"]').fill('  existing-player  ');
  await form.locator('[name="password"]').fill('safe-password');
  await role(page, '账号面板-登录按钮').click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].data).toEqual({ username: 'existing-player', password: 'safe-password', asAgent: false });
  await expect(role(page, '账号面板-登录错误')).toHaveText('Incorrect username or password');
});

for (const [name, config] of [
  ['old backend', {}],
  ['explicitly closed', { passwordSignup: false }],
  ['non-boolean flag', { passwordSignup: 'true' }],
  ['disabled password login', { passwordLogin: false, passwordSignup: true }],
] as const) {
  test(`registration is hidden with ${name}`, async ({ page }) => {
    await openLogin(page, config);
    await expect(signupButton(page)).toHaveCount(0);
    await expect(signupForm(page)).toHaveCount(0);
  });
}

test('failed auth configuration fetch safely leaves signup closed', async ({ page }) => {
  await page.route('**/auth/config', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
  const fetched = page.waitForResponse('**/auth/config');
  await page.goto('/');
  await fetched;
  await expect(signupButton(page)).toHaveCount(0);
  await expect(role(page, '账号面板-登录表单')).toBeVisible();
});

test('explicit registration confirms password and sends one register:true request', async ({ page }) => {
  const requests = await openLogin(page);
  await signupButton(page).click();
  await expect(signupForm(page)).toBeVisible();
  await expect(signupForm(page).locator('[name="password"]')).toHaveAttribute('autocomplete', 'new-password');
  await fillSignup(page);
  await signupForm(page).evaluate((form: HTMLFormElement) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].data).toEqual({ username: 'new-player', password: 'safe-password', asAgent: false, register: true });
  await expect(role(page, '账号面板-注册按钮')).toBeDisabled();
  await expect(role(page, '账号面板-取消注册')).toBeDisabled();
  // Submitting the form again while busy must not duplicate requests.
  await signupForm(page).evaluate((form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(requests).toHaveLength(1);
});

test('successful registration enters the latest game shell and only persists the session token', async ({ page }) => {
  const ops: number[] = [];
  await page.route('**/auth/config', (route) => route.fulfill({ json: { passwordSignup: true } }));
  await page.routeWebSocket(/\/ws$/, (ws) => {
    ws.onMessage((message) => {
      const request = JSON.parse(String(message));
      ops.push(request.op);
      const data = request.op === Op.LOGIN
        ? { accountId: 'signup-test-account', username: 'new-player', role: 'player', sessionToken: 'signup-test-session', expiresAt: '2099-01-01T00:00:00.000Z' }
        : request.op === Op.GET_ANNOUNCEMENTS ? { announcements: [], unreadCount: 0 } : undefined;
      ws.send(JSON.stringify({ op: request.op, seq: request.seq, ok: data !== undefined, data }));
    });
  });
  await page.goto('/');
  await signupButton(page).click();
  await fillSignup(page);
  await role(page, '账号面板-注册按钮').click();
  await expect(role(page, '导航布局')).toBeVisible();
  await expect(role(page, '账号面板')).toHaveCount(0);
  await expect.poll(() => ops.includes(Op.GET_ANNOUNCEMENTS)).toBe(true);
  const stored = await page.evaluate(() => ({ ...localStorage }));
  expect(stored['slg.sessionToken']).toBe('signup-test-session');
  expect(stored['slg.lastUsername']).toBe('new-player');
  expect(JSON.stringify(stored)).not.toContain('safe-password');
});

test('invalid registration input never sends a request', async ({ page }) => {
  const requests = await openLogin(page);
  await signupButton(page).click();
  for (const [username, password, confirm, error] of [
    ['   ', '123456', '123456', 'Username must be 1–32 characters after trimming, with no spaces or control characters.'],
    ['p'.repeat(33), '123456', '123456', 'Username must be 1–32 characters after trimming, with no spaces or control characters.'],
    ['player name', '123456', '123456', 'Username must be 1–32 characters after trimming, with no spaces or control characters.'],
    ['p', '12345', '12345', 'Password must be 6–64 characters.'],
    ['p', 'p'.repeat(65), 'p'.repeat(65), 'Password must be 6–64 characters.'],
    ['p', '123456', '654321', 'Passwords do not match.'],
  ]) {
    await fillSignup(page, username, password, confirm);
    await role(page, '账号面板-注册按钮').click();
    await expect(role(page, '账号面板-注册校验错误')).toHaveText(error);
  }
  expect(requests).toHaveLength(0);
});

test('switching modes clears passwords and returns to ordinary login', async ({ page }) => {
  const requests = await openLogin(page);
  await role(page, '账号面板-登录表单').locator('[name="password"]').fill('old-password');
  await signupButton(page).click();
  await expect(signupForm(page).locator('[name="password"]')).toHaveValue('');
  await fillSignup(page, 'player', '123456', '654321');
  await role(page, '账号面板-注册按钮').click();
  await role(page, '账号面板-取消注册').click();
  await expect(role(page, '账号面板-登录表单').locator('[name="password"]')).toHaveValue('');
  await signupButton(page).click();
  await expect(signupForm(page).locator('[name="password"]')).toHaveValue('');
  await expect(signupForm(page).locator('[name="confirmPassword"]')).toHaveValue('');
  await expect(role(page, '账号面板-注册校验错误')).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

test('changing login tabs clears registration and its passwords', async ({ page }) => {
  await openLogin(page, { passwordSignup: true, wechatEnabled: true });
  await signupButton(page).click();
  await fillSignup(page);
  await role(page, '账号面板-分页-微信扫码').click();
  await role(page, '账号面板-分页-用户名密码').click();
  await expect(role(page, '账号面板-登录表单')).toBeVisible();
  await expect(role(page, '账号面板-登录表单').locator('[name="password"]')).toHaveValue('');
});

test('duplicate and rate-limit failures are shown for registration', async ({ page }) => {
  await openLogin(page, { passwordSignup: true }, { code: 'INVALID_CREDENTIALS', message: 'Username already exists. Please log in.' });
  await signupButton(page).click();
  await fillSignup(page);
  await role(page, '账号面板-注册按钮').click();
  await expect(role(page, '账号面板-登录错误')).toHaveText('That username already exists. Log in or choose another name.');
  await expect(role(page, '账号面板-注册按钮')).toBeEnabled();
});

test('registration rate limiting uses the localized standard retry message', async ({ page }) => {
  await openLogin(page, { passwordSignup: true }, { code: 'RATE_LIMITED', message: 'server rate limit' });
  await signupButton(page).click();
  await fillSignup(page);
  await role(page, '账号面板-注册按钮').click();
  await expect(role(page, '账号面板-登录错误')).toHaveText('Too many attempts. Please try again later.');
});

test('registration closed after config was loaded is shown without logging in', async ({ page }) => {
  await openLogin(page, { passwordSignup: true }, { code: 'SIGNUP_CLOSED', message: 'signup is closed' });
  await signupButton(page).click();
  await fillSignup(page);
  await role(page, '账号面板-注册按钮').click();
  await expect(role(page, '账号面板-登录错误')).toHaveText('Password registration is not enabled on this server. Use an existing account or a third-party login.');
  await expect(signupForm(page)).toBeVisible();
  await expect(role(page, '账号面板-注册按钮')).toBeEnabled();
});

test('registration has Chinese copy and fits a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('slg-lang', 'zh'));
  await openLogin(page);
  await expect(signupButton(page)).toHaveText('注册新账号');
  await signupButton(page).click();
  await expect(signupForm(page)).toContainText('确认密码');
  await expect(role(page, '账号面板-取消注册')).toHaveText('返回登录');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
