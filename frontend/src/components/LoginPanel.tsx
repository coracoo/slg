import { useEffect, useState, type FormEvent } from 'react';
import { useCopy } from '../i18n/bundle';
import type { ApiClient } from '../api/client';
import { useAuthConfig } from '../state/useAuthConfig';
import { validatePasswordSignup, type PasswordSignupValidationError } from '../api/passwordLogin';
import { WechatLoginTab } from './wechat/WechatLoginTab';
import { GoogleLoginSection } from './google/GoogleLoginSection';
import { GithubLoginButton } from './github/GithubLoginButton';

// 登录表单：仅未登录时由 App 渲染（登录后的账号信息与切换入口在顶栏）。
// v44：微信扫码分页与 Google 按钮按服务端 /auth/config 的开关显示（没配置就不显示）。
// v45：Google 按钮旁再加 GitHub 按钮（同样按开关显示）。

interface LoginPanelProps {
  booting: boolean;
  loginBusy: boolean;
  loginError: string | null;
  lastUsername: string;
  onLogin: (username: string, password: string, register?: boolean) => void;
  /** 微信扫码登录（v43）：建立（未登录）连接 / 拿到会话令牌后走令牌登录 */
  connectForWechat: () => Promise<ApiClient>;
  onWechatToken: (sessionToken: string) => void;
  /** Google 一键登录（v44）：GOOGLE_LOGIN 换到会话令牌后走令牌登录 */
  onGoogleToken: (sessionToken: string) => void;
}

type LoginTab = 'password' | 'wechat';

export function LoginPanel({ booting, loginBusy, loginError, lastUsername, onLogin, connectForWechat, onWechatToken, onGoogleToken }: LoginPanelProps) {
  const copy = useCopy();
  const { COPY, WECHAT_COPY, PASSWORD_SIGNUP_COPY } = copy;
  const { config } = useAuthConfig();
  const wechatEnabled = config?.wechatEnabled ?? false;
  const googleClientId = config?.googleClientId ?? null;
  // v47：国际站（服务端 /auth/config 的 passwordLogin=false）不显示用户名密码表单，
  // 登录页只剩 Google / GitHub 入口
  const passwordLoginEnabled = config?.passwordLogin ?? true;
  const passwordSignupEnabled = passwordLoginEnabled && config?.passwordSignup === true;
  const githubEnabled = config?.githubEnabled ?? false;
  const thirdPartyEnabled = googleClientId !== null || githubEnabled;
  const [tab, setTab] = useState<LoginTab>('password');
  const [username, setUsername] = useState(lastUsername);
  const [password, setPassword] = useState('');
  const [registerMode, setRegisterMode] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState<PasswordSignupValidationError | null>(null);
  const registering = registerMode && passwordSignupEnabled;

  function changeMode(register: boolean) {
    setRegisterMode(register);
    setPassword('');
    setConfirmPassword('');
    setValidationError(null);
  }

  useEffect(() => {
    if (registerMode && !passwordSignupEnabled) changeMode(false);
  }, [registerMode, passwordSignupEnabled]);

  // 入口按配置收起：正在的分页不再可用时回落到还开着的分页
  useEffect(() => {
    if (tab === 'wechat' && !wechatEnabled) {
      setTab(passwordLoginEnabled ? 'password' : 'wechat');
      return;
    }
    if (tab === 'password' && !passwordLoginEnabled) {
      setTab('wechat');
    }
  }, [tab, wechatEnabled, passwordLoginEnabled]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loginBusy) return;
    if (registering) {
      const error = validatePasswordSignup(username, password, confirmPassword);
      setValidationError(error);
      if (error) return;
      onLogin(username.trim(), password, true);
    } else {
      if (!username.trim() || !password) return;
      onLogin(username.trim(), password);
    }
    setPassword('');
    setConfirmPassword('');
  }

  const tabs: Array<[LoginTab, string, string]> = [];
  if (passwordLoginEnabled) {
    tabs.push(['password', WECHAT_COPY.login.tabPassword, '账号面板-分页-用户名密码']);
  }
  if (wechatEnabled) {
    tabs.push(['wechat', WECHAT_COPY.login.tabWechat, '账号面板-分页-微信扫码']);
  }

  /** 第三方登录入口（Google / GitHub），密码分页与「纯第三方站」两处共用 */
  const thirdPartyBlock = thirdPartyEnabled ? (
    <div className="mt-2.5 flex flex-col items-center gap-2" role="账号面板-第三方登录区">
      {googleClientId ? (
        <GoogleLoginSection clientId={googleClientId} connect={connectForWechat} onToken={onGoogleToken} />
      ) : null}
      {githubEnabled ? <GithubLoginButton connect={connectForWechat} /> : null}
    </div>
  ) : null;

  return (
    <section className="panel" role="账号面板">
      <div className="panel-head" role="账号面板-状态">
        <h2>{COPY.login.title}</h2>
        <span>{booting ? COPY.login.booting : COPY.login.loggedOut}</span>
      </div>

      {booting ? (
        <div className="flex items-center gap-2.5 py-2" role="账号面板-自动登录等待">
          <i className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          <p className="text-[13px] text-dim">{COPY.login.bootingBody}</p>
        </div>
      ) : tabs.length > 1 ? (
        <div role="账号面板-登录方式" aria-label={WECHAT_COPY.login.tabsLabel} className="mb-2 flex gap-1 border-b border-line-soft">
          {tabs.map(([key, label, role]) => (
            <button
              key={key}
              type="button"
              role={role}
              aria-pressed={tab === key}
              onClick={() => { changeMode(false); setTab(key); }}
              disabled={loginBusy}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-1.5 text-[13px] ${
                tab === key ? 'border-accent text-accent' : 'border-transparent text-dim hover:text-fg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {!booting && tab === 'wechat' && wechatEnabled ? (
        <WechatLoginTab active connect={connectForWechat} onToken={onWechatToken} />
      ) : null}

      {!booting && tab === 'password' && passwordLoginEnabled ? (
        <>
          {registering ? <h3 className="mb-2 text-[14px] text-fg" role="账号面板-注册标题">{PASSWORD_SIGNUP_COPY.title}</h3> : null}
          <form className="flex flex-wrap items-end gap-2" role={registering ? '账号面板-注册表单' : '账号面板-登录表单'} onSubmit={handleSubmit}>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[12px] text-faint">{COPY.login.username}</span>
              <input
                className="rounded border border-line-soft bg-panel-2 px-2 py-1.5 text-[14px] outline-none focus:border-accent-dim"
                name="username"
                autoComplete="username"
                placeholder={COPY.login.usernamePlaceholder}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[12px] text-faint">{COPY.login.password}</span>
              <input
                className="rounded border border-line-soft bg-panel-2 px-2 py-1.5 text-[14px] outline-none focus:border-accent-dim"
                name="password"
                autoComplete={registering ? 'new-password' : 'current-password'}
                placeholder={COPY.login.passwordPlaceholder}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {registering ? (
              <label className="flex flex-1 flex-col gap-1" role="账号面板-确认密码">
                <span className="text-[12px] text-faint">{PASSWORD_SIGNUP_COPY.confirmPassword}</span>
                <input
                  className="rounded border border-line-soft bg-panel-2 px-2 py-1.5 text-[14px] outline-none focus:border-accent-dim"
                  name="confirmPassword"
                  autoComplete="new-password"
                  placeholder={PASSWORD_SIGNUP_COPY.confirmPlaceholder}
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </label>
            ) : null}
            <button type="submit" className="btn px-3 py-1.5" role={registering ? '账号面板-注册按钮' : '账号面板-登录按钮'} disabled={loginBusy}>
              {registering ? (loginBusy ? PASSWORD_SIGNUP_COPY.busy : PASSWORD_SIGNUP_COPY.submit) : (loginBusy ? COPY.login.busy : COPY.login.submit)}
            </button>
            {registering ? (
              <button type="button" className="btn px-3 py-1.5" role="账号面板-取消注册" disabled={loginBusy} onClick={() => changeMode(false)}>
                {PASSWORD_SIGNUP_COPY.cancel}
              </button>
            ) : null}
          </form>
          {registering && validationError ? (
            <p className="mt-2 text-[12px] text-dim" role="账号面板-注册校验错误" aria-live="polite">{PASSWORD_SIGNUP_COPY[validationError]}</p>
          ) : null}
          {!registering && passwordSignupEnabled ? (
            <button type="button" className="btn mt-2 px-3 py-1.5" role="账号面板-注册入口" disabled={loginBusy} onClick={() => changeMode(true)}>
              {PASSWORD_SIGNUP_COPY.open}
            </button>
          ) : null}
          {!registering ? thirdPartyBlock : null}
        </>
      ) : null}

      {/* 国际站（密码登录关闭）：没有分页可切，直接展示 Google / GitHub 入口 */}
      {!booting && !passwordLoginEnabled ? thirdPartyBlock : null}
      {!booting && !passwordLoginEnabled && !thirdPartyEnabled ? (
        <p className="rounded border border-line-soft bg-panel-2 px-2 py-1.5 text-[12px] text-dim" role="账号面板-第三方未启用">
          {COPY.login.thirdPartyUnavailable}
        </p>
      ) : null}

      {loginError ? (
        <p className="mt-2 rounded border border-line-soft bg-panel-2 px-2 py-1.5 text-[12px] text-dim" role="账号面板-登录错误">
          {loginError}
        </p>
      ) : null}

      <p className="mt-2 text-[12px] text-faint" role="账号面板-说明">
        {passwordSignupEnabled ? PASSWORD_SIGNUP_COPY.note : (passwordLoginEnabled ? COPY.login.note : COPY.login.noteInternational)}
      </p>

      {/* 开源仓库入口（AISLG-137 海外推广）：未登录访客第一眼能看到；新标签打开避免断开游戏会话 */}
      <a
        className="mt-2 text-[12px] text-faint underline-offset-2 hover:text-accent hover:underline"
        role="账号面板-GitHub仓库"
        href="https://github.com/athlan20/slg"
        target="_blank"
        rel="noreferrer"
      >
        {COPY.login.repoLink} ↗
      </a>
    </section>
  );
}
