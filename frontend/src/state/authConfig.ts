/** Login entry flags. Older or unreachable backends never expose password registration. */
export interface AuthConfig {
  googleClientId: string | null;
  wechatEnabled: boolean;
  githubEnabled: boolean;
  passwordLogin: boolean;
  passwordSignup: boolean;
}

export const FALLBACK_AUTH_CONFIG: AuthConfig = {
  googleClientId: null,
  wechatEnabled: false,
  githubEnabled: false,
  passwordLogin: true,
  passwordSignup: false,
};

export function parseAuthConfig(body: Record<string, unknown>): AuthConfig {
  const passwordLogin = body.passwordLogin !== false;
  return {
    googleClientId: typeof body.googleClientId === 'string' && body.googleClientId ? body.googleClientId : null,
    wechatEnabled: body.wechatEnabled === true,
    githubEnabled: body.githubEnabled === true,
    passwordLogin,
    passwordSignup: passwordLogin && body.passwordSignup === true,
  };
}
