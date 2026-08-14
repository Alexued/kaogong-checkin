const IMAGE_HOSTS = new Set(['fb.fenbike.cn', 'fb.fbstatic.cn']);

function imageUrl(source: URL, host: string, addClientKey: boolean): string {
  const next = new URL(source.toString());
  next.hostname = host;
  if (addClientKey) next.searchParams.set('client', 'kgc-webview');
  return next.toString();
}

export function questionImageCandidates(src: string): string[] {
  try {
    const parsed = new URL(src);
    if (!IMAGE_HOSTS.has(parsed.hostname)) return [src];
    const alternateHost = parsed.hostname === 'fb.fenbike.cn' ? 'fb.fbstatic.cn' : 'fb.fenbike.cn';
    return Array.from(new Set([
      imageUrl(parsed, parsed.hostname, true),
      src,
      imageUrl(parsed, alternateHost, true),
    ]));
  } catch {
    return [src];
  }
}
