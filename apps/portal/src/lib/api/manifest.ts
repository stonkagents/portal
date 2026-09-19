/**
 * Purpose: Fetch and parse the release manifest from the releases host.
 *          The host is NEXT_PUBLIC_DOWNLOAD_BASE_URL and nothing else: each
 *          deployment (dev, staging, production) sets its own. Handles the
 *          signed envelope format and extracts installer URLs by platform.
 */

import { appConfig } from '@/lib/config/app.config';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
/**
 * The releases host must answer within this, or the download button settles on
 * "Download unavailable, try again" instead of "Preparing your download" for as
 * long as the browser is willing to wait.
 */
export const MANIFEST_TIMEOUT_MS = 15_000;

/** The manifest on the configured releases host. */
const DEFAULT_MANIFEST_URL = `${appConfig.downloadBaseUrl.replace(/\/+$/, '')}/manifest.json`;

function getManifestUrl(): string {
  return DEFAULT_MANIFEST_URL;
}

/** Origin of the releases site we're using (set when fetching; used to resolve relative installer URLs). */
let currentReleasesOrigin = new URL(DEFAULT_MANIFEST_URL).origin;

/**
 * Ensures an installer URL is absolute. If the manifest has a relative path (e.g. /StonkAgents-Setup-0.3.1.exe),
 * the browser would resolve it against the current site. We always resolve against the releases origin.
 * There is no guessed filename anywhere: a manifest that names no installer means "download unavailable".
 */
function toAbsoluteInstallerUrl(url: string): string {
  if (!url) return url;
  const trimmed = url.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${currentReleasesOrigin}${path}`;
}

export type Platform = 'darwin/arm64' | 'darwin/amd64' | 'windows/amd64';

interface ArchiveInfo {
  url: string;
  sha256: string;
  size: number;
}

interface PlatformRelease {
  url: string;
  sha256: string;
  size: number;
  installer?: ArchiveInfo;
}

interface ManifestContent {
  schema_version: number;
  latest_version: string;
  min_supported: string;
  released: string;
  release_notes: string;
  platforms: Record<Platform, PlatformRelease>;
}

let cachedManifest: ManifestContent | null = null;
let cacheTimestamp: number = 0;

/**
 * Fetches the manifest (env-aware: dev/stg/prd releases host).
 * Handles both signed envelope format and direct content format.
 */
async function fetchManifest(): Promise<ManifestContent> {
  const manifestUrl = getManifestUrl();
  currentReleasesOrigin = new URL(manifestUrl).origin;

  const response = await fetch(manifestUrl, {
    cache: 'no-store', // Always fetch fresh, we handle caching ourselves
    headers: {
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch manifest: HTTP ${response.status}`);
  }

  const data = await response.json();

  // Check if it's a signed envelope format
  if (data.signed && data.content) {
    // The content field is json.RawMessage in Go, which serializes as a JSON string
    // when the envelope is marshaled. We need to parse it.
    if (typeof data.content === 'string') {
      return JSON.parse(data.content) as ManifestContent;
    }
    // If content is already an object (shouldn't happen with proper Go serialization, but handle it)
    return data.content as ManifestContent;
  }

  // Direct content format (backward compatibility - unsigned manifests)
  const content = data as ManifestContent;
  // Normalize platform keys: manifest may use "darwin-arm64" / "windows-amd64"; we use "darwin/arm64" / "windows/amd64"
  return normalizeManifestPlatforms(content);
}

/** Normalize platforms so both "darwin-arm64" and "darwin/arm64" work. */
function normalizeManifestPlatforms(manifest: ManifestContent): ManifestContent {
  const platforms = manifest.platforms as Record<string, PlatformRelease>;
  const normalized: Record<string, PlatformRelease> = { ...platforms };
  for (const key of Object.keys(platforms)) {
    const slashKey = key.replace(/-/, '/');
    if (slashKey !== key && !(slashKey in normalized)) {
      normalized[slashKey] = platforms[key];
    }
  }
  return { ...manifest, platforms: normalized as Record<Platform, PlatformRelease> };
}

/**
 * Gets the latest manifest, using cache if available and fresh
 */
async function getManifest(): Promise<ManifestContent> {
  const now = Date.now();

  // Return cached manifest if still valid
  if (cachedManifest && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedManifest;
  }

  try {
    const manifest = await fetchManifest();
    cachedManifest = manifest;
    cacheTimestamp = now;
    return manifest;
  } catch (error) {
    // If fetch fails and we have stale cache, return it
    if (cachedManifest) {
      console.warn('[Manifest] Fetch failed, using stale cache', error);
      return cachedManifest;
    }
    throw error;
  }
}

/**
 * Gets installer URL for macOS (checks both arm64 and amd64)
 * Prefers arm64 if available
 */
export async function getMacOSInstallerUrl(): Promise<string | undefined> {
  try {
    const manifest = await getManifest();

    // Prefer arm64, fallback to amd64
    const arm64Release = manifest.platforms['darwin/arm64'];
    if (arm64Release?.installer) {
      return toAbsoluteInstallerUrl(arm64Release.installer.url);
    }

    const amd64Release = manifest.platforms['darwin/amd64'];
    if (amd64Release?.installer) {
      return toAbsoluteInstallerUrl(amd64Release.installer.url);
    }

    return undefined;
  } catch (error) {
    console.error('[Manifest] Failed to get macOS installer URL', error);
    return undefined;
  }
}

/**
 * Gets installer URL for Windows
 */
export async function getWindowsInstallerUrl(): Promise<string | undefined> {
  try {
    const manifest = await getManifest();
    const release = manifest.platforms['windows/amd64'];
    const url = release?.installer?.url;
    return url ? toAbsoluteInstallerUrl(url) : undefined;
  } catch (error) {
    console.error('[Manifest] Failed to get Windows installer URL', error);
    return undefined;
  }
}

/**
 * Gets the latest version from manifest
 */
/** This site's own latest release: version, notes and the Windows installer link. */
export async function getSiteRelease(): Promise<{ version: string; releaseNotes: string; windowsInstallerUrl: string | undefined } | undefined> {
  try {
    const manifest = await getManifest();
    return {
      version: manifest.latest_version,
      releaseNotes: manifest.release_notes ?? '',
      windowsInstallerUrl: manifest.platforms['windows/amd64']?.installer?.url ?? manifest.platforms['windows/amd64']?.url,
    };
  } catch {
    return undefined;
  }
}

export async function getLatestVersion(): Promise<string | undefined> {
  try {
    const manifest = await getManifest();
    return manifest.latest_version;
  } catch (error) {
    console.error('[Manifest] Failed to get latest version', error);
    return undefined;
  }
}
