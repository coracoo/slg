interface WsUrlOptions {
  sameOrigin: boolean;
  location?: Pick<Location, 'protocol' | 'host' | 'hostname'>;
  byHost: Record<string, string>;
  localOverride: string | null;
  apiPort: number;
}

/** Same-origin is an explicit deployment choice; otherwise preserve legacy routing. */
export function resolveWsUrl({ sameOrigin, location, byHost, localOverride, apiPort }: WsUrlOptions): string {
  if (sameOrigin && location) {
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  }
  const mapped = location ? byHost[location.hostname] : undefined;
  if (mapped) return mapped;
  return localOverride ?? `ws://127.0.0.1:${apiPort}/ws`;
}
