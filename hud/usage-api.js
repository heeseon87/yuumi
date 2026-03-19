/**
 * Custom HUD - Usage API
 *
 * Mirrors OMC's auth flow while preserving the custom HUD's simple
 * return contract: usage data with optional _stale/_error metadata.
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  openSync,
  closeSync,
  statSync,
} from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import https from 'https';

const CACHE_TTL_SUCCESS_MS = 30 * 1000;
const CACHE_TTL_FAILURE_MS = 15 * 1000;
const CACHE_TTL_RATE_LIMITED_MS = 120 * 1000;
const MAX_RATE_LIMITED_BACKOFF_MS = 600 * 1000;
const API_TIMEOUT_MS = 10000;
const LOCK_POLL_INTERVAL_MS = 100;
const LOCK_WAIT_TIMEOUT_MS = 2500;
const STALE_LOCK_MS = 30 * 1000;
const TOKEN_REFRESH_URL_HOSTNAME = 'platform.claude.com';
const TOKEN_REFRESH_URL_PATH = '/v1/oauth/token';
const DEFAULT_OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

function getClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

function getCachePath() {
  return join(getClaudeConfigDir(), 'plugins', 'oh-my-claudecode', '.usage-cache.json');
}

function getLockPath() {
  return join(getClaudeConfigDir(), 'plugins', 'oh-my-claudecode', '.usage-cache.lock');
}

function ensureCacheDir() {
  const cacheDir = dirname(getCachePath());
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
}

function getKeychainServiceName() {
  const configDir = process.env.CLAUDE_CONFIG_DIR;
  if (configDir) {
    const hash = createHash('sha256').update(configDir).digest('hex').slice(0, 8);
    return `Claude Code-credentials-${hash}`;
  }
  return 'Claude Code-credentials';
}

function isZaiHost(urlString) {
  try {
    const url = new URL(urlString);
    const hostname = url.hostname.toLowerCase();
    return hostname === 'z.ai' || hostname.endsWith('.z.ai');
  } catch {
    return false;
  }
}

function readCache() {
  try {
    const cachePath = getCachePath();
    if (!existsSync(cachePath)) return null;

    const cache = JSON.parse(readFileSync(cachePath, 'utf-8'));
    const dateKeys = [
      'fiveHourResetsAt',
      'weeklyResetsAt',
      'sonnetWeeklyResetsAt',
      'opusWeeklyResetsAt',
      'monthlyResetsAt',
    ];

    if (cache.data) {
      for (const key of dateKeys) {
        if (cache.data[key]) {
          cache.data[key] = new Date(cache.data[key]);
        }
      }
    }

    return cache;
  } catch {
    return null;
  }
}

function writeCache(
  data,
  error = false,
  source,
  rateLimited = false,
  rateLimitedCount = 0,
  errorReason,
) {
  try {
    const cachePath = getCachePath();
    ensureCacheDir();

    const cache = {
      timestamp: Date.now(),
      data,
      error,
      errorReason,
      source,
      rateLimited: rateLimited || undefined,
      rateLimitedCount: rateLimitedCount > 0 ? rateLimitedCount : undefined,
    };

    writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch {
    // Ignore cache write failures.
  }
}

function isCacheValid(cache) {
  if (cache.rateLimited) {
    const count = cache.rateLimitedCount || 1;
    const backoffMs = Math.min(
      CACHE_TTL_RATE_LIMITED_MS * Math.pow(2, count - 1),
      MAX_RATE_LIMITED_BACKOFF_MS,
    );
    return Date.now() - cache.timestamp < backoffMs;
  }

  const ttl = cache.error ? CACHE_TTL_FAILURE_MS : CACHE_TTL_SUCCESS_MS;
  return Date.now() - cache.timestamp < ttl;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function isLockStale(lockPath) {
  try {
    const stat = statSync(lockPath);
    if (Date.now() - stat.mtimeMs < STALE_LOCK_MS) {
      return false;
    }

    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
      return !isPidAlive(lock.pid);
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

function tryAcquireUsageLock() {
  const lockPath = getLockPath();
  ensureCacheDir();

  try {
    const fd = openSync(lockPath, 'wx', 0o600);
    try {
      writeFileSync(
        fd,
        JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      try {
        unlinkSync(lockPath);
      } catch {
        // Ignore cleanup failures.
      }
      throw error;
    } finally {
      closeSync(fd);
    }

    return { acquired: true, lockPath };
  } catch (error) {
    if (error?.code === 'EEXIST' && isLockStale(lockPath)) {
      try {
        unlinkSync(lockPath);
      } catch {
        // Another process may have already cleaned it up.
      }

      return tryAcquireUsageLock();
    }

    return { acquired: false, lockPath };
  }
}

function releaseUsageLock(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch {
    // Ignore lock release failures.
  }
}

function readKeychainCredentials() {
  if (process.platform !== 'darwin') return null;

  try {
    const serviceName = getKeychainServiceName();
    const raw = execSync(
      `/usr/bin/security find-generic-password -s "${serviceName}" -w 2>/dev/null`,
      { encoding: 'utf-8', timeout: 2000 },
    ).trim();

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const creds = parsed.claudeAiOauth || parsed;

    if (creds.accessToken) {
      return {
        accessToken: creds.accessToken,
        expiresAt: creds.expiresAt,
        refreshToken: creds.refreshToken,
        source: 'keychain',
      };
    }
  } catch {
    // Keychain access failed.
  }

  return null;
}

function readFileCredentials() {
  try {
    const credPath = join(getClaudeConfigDir(), '.credentials.json');
    if (!existsSync(credPath)) return null;

    const parsed = JSON.parse(readFileSync(credPath, 'utf-8'));
    const creds = parsed.claudeAiOauth || parsed;

    if (creds.accessToken) {
      return {
        accessToken: creds.accessToken,
        expiresAt: creds.expiresAt,
        refreshToken: creds.refreshToken,
        source: 'file',
      };
    }
  } catch {
    // File read failed.
  }

  return null;
}

function getCredentials() {
  return readKeychainCredentials() || readFileCredentials();
}

function validateCredentials(creds) {
  if (!creds.accessToken) return false;
  if (creds.expiresAt != null && creds.expiresAt <= Date.now()) return false;
  return true;
}

function refreshAccessToken(refreshToken) {
  return new Promise((resolve) => {
    const clientId = process.env.CLAUDE_CODE_OAUTH_CLIENT_ID || DEFAULT_OAUTH_CLIENT_ID;
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    }).toString();

    const req = https.request(
      {
        hostname: TOKEN_REFRESH_URL_HOSTNAME,
        path: TOKEN_REFRESH_URL_PATH,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: API_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.access_token) {
                resolve({
                  accessToken: parsed.access_token,
                  refreshToken: parsed.refresh_token || refreshToken,
                  expiresAt: parsed.expires_in
                    ? Date.now() + parsed.expires_in * 1000
                    : parsed.expires_at,
                });
                return;
              }
            } catch {
              // Ignore parse failures.
            }
          }

          if (process.env.OMC_DEBUG) {
            console.error(`[custom-hud] Token refresh failed: HTTP ${res.statusCode}`);
          }
          resolve(null);
        });
      },
    );

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end(body);
  });
}

function fetchUsageFromApi(accessToken) {
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/api/oauth/usage',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'Content-Type': 'application/json',
        },
        timeout: API_TIMEOUT_MS,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve({ data: JSON.parse(data) });
            } catch {
              resolve({ data: null });
            }
          } else if (res.statusCode === 429) {
            resolve({ data: null, rateLimited: true });
          } else {
            resolve({ data: null });
          }
        });
      },
    );

    req.on('error', () => resolve({ data: null }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ data: null });
    });
    req.end();
  });
}

function fetchUsageFromZai() {
  return new Promise((resolve) => {
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    const authToken = process.env.ANTHROPIC_AUTH_TOKEN;

    if (!baseUrl || !authToken || !isZaiHost(baseUrl)) {
      resolve({ data: null });
      return;
    }

    try {
      const url = new URL(baseUrl);
      const quotaUrl = new URL('/api/monitor/usage/quota/limit', `${url.protocol}//${url.host}`);

      const req = https.request(
        {
          hostname: quotaUrl.hostname,
          path: quotaUrl.pathname,
          method: 'GET',
          headers: {
            Authorization: authToken,
            'Content-Type': 'application/json',
            'Accept-Language': 'en-US,en',
          },
          timeout: API_TIMEOUT_MS,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                resolve({ data: JSON.parse(data) });
              } catch {
                resolve({ data: null });
              }
            } else if (res.statusCode === 429) {
              resolve({ data: null, rateLimited: true });
            } else {
              resolve({ data: null });
            }
          });
        },
      );

      req.on('error', () => resolve({ data: null }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ data: null });
      });
      req.end();
    } catch {
      resolve({ data: null });
    }
  });
}

function writeBackCredentials(creds) {
  try {
    const credPath = join(getClaudeConfigDir(), '.credentials.json');
    if (!existsSync(credPath)) return;

    const parsed = JSON.parse(readFileSync(credPath, 'utf-8'));
    if (parsed.claudeAiOauth) {
      parsed.claudeAiOauth.accessToken = creds.accessToken;
      if (creds.expiresAt != null) parsed.claudeAiOauth.expiresAt = creds.expiresAt;
      if (creds.refreshToken) parsed.claudeAiOauth.refreshToken = creds.refreshToken;
    } else {
      parsed.accessToken = creds.accessToken;
      if (creds.expiresAt != null) parsed.expiresAt = creds.expiresAt;
      if (creds.refreshToken) parsed.refreshToken = creds.refreshToken;
    }

    const tmpPath = `${credPath}.tmp.${process.pid}`;
    try {
      writeFileSync(tmpPath, JSON.stringify(parsed, null, 2), { mode: 0o600 });
      renameSync(tmpPath, credPath);
    } catch (error) {
      try {
        if (existsSync(tmpPath)) {
          unlinkSync(tmpPath);
        }
      } catch {
        // Ignore cleanup failures.
      }
      throw error;
    }
  } catch {
    if (process.env.OMC_DEBUG) {
      console.error('[custom-hud] Failed to write refreshed credentials');
    }
  }
}

function clamp(value) {
  if (value == null || !isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function parseDate(dateStr) {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function parseUsageResponse(response) {
  const fiveHour = response.five_hour?.utilization;
  const sevenDay = response.seven_day?.utilization;

  if (fiveHour == null && sevenDay == null) return null;

  const usage = {
    fiveHourPercent: clamp(fiveHour),
    weeklyPercent: clamp(sevenDay),
    fiveHourResetsAt: parseDate(response.five_hour?.resets_at),
    weeklyResetsAt: parseDate(response.seven_day?.resets_at),
  };

  const sonnetSevenDay = response.seven_day_sonnet?.utilization;
  if (sonnetSevenDay != null) {
    usage.sonnetWeeklyPercent = clamp(sonnetSevenDay);
    usage.sonnetWeeklyResetsAt = parseDate(response.seven_day_sonnet?.resets_at);
  }

  const opusSevenDay = response.seven_day_opus?.utilization;
  if (opusSevenDay != null) {
    usage.opusWeeklyPercent = clamp(opusSevenDay);
    usage.opusWeeklyResetsAt = parseDate(response.seven_day_opus?.resets_at);
  }

  return usage;
}

function parseZaiResponse(response) {
  const limits = response.data?.limits;
  if (!limits || limits.length === 0) return null;

  const tokensLimit = limits.find((limit) => limit.type === 'TOKENS_LIMIT');
  const timeLimit = limits.find((limit) => limit.type === 'TIME_LIMIT');
  if (!tokensLimit && !timeLimit) return null;

  const parseResetTime = (timestamp) => {
    if (!timestamp) return null;
    try {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date;
    } catch {
      return null;
    }
  };

  return {
    fiveHourPercent: clamp(tokensLimit?.percentage),
    fiveHourResetsAt: parseResetTime(tokensLimit?.nextResetTime),
    monthlyPercent: timeLimit ? clamp(timeLimit.percentage) : undefined,
    monthlyResetsAt: timeLimit ? parseResetTime(timeLimit.nextResetTime) : undefined,
  };
}

function toCustomResult(data, errorReason, stale = false) {
  if (!data && !errorReason) return null;
  const result = data ? { ...data } : {};
  if (stale) result._stale = true;
  if (errorReason) result._error = errorReason;
  return result;
}

function getMatchingCacheData(cache, source) {
  return cache && cache.source === source ? cache.data : null;
}

function cacheToResult(cache) {
  if (!cache) return null;
  if (cache.rateLimited) {
    return toCustomResult(cache.data, 'rate_limited', true);
  }
  if (cache.error) {
    return toCustomResult(cache.data, cache.errorReason || 'network', true);
  }
  return toCustomResult(cache.data);
}

async function waitForSingleFlightResult(source, baselineTimestamp) {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  const lockPath = getLockPath();

  while (Date.now() < deadline) {
    await sleep(LOCK_POLL_INTERVAL_MS);

    const updatedCache = readCache();
    if (
      updatedCache
      && updatedCache.source === source
      && updatedCache.timestamp > baselineTimestamp
    ) {
      return cacheToResult(updatedCache);
    }

    if (!existsSync(lockPath)) {
      const releasedCache = readCache();
      if (
        releasedCache
        && releasedCache.source === source
        && releasedCache.timestamp > baselineTimestamp
      ) {
        return cacheToResult(releasedCache);
      }

      break;
    }
  }

  return null;
}

async function refreshUsage(cache, isZai, authToken) {
  if (isZai && authToken) {
    const result = await fetchUsageFromZai();
    const staleData = getMatchingCacheData(cache, 'zai');

    if (result.rateLimited) {
      const prevCount = cache?.source === 'zai' ? (cache.rateLimitedCount || 0) : 0;
      writeCache(staleData, true, 'zai', true, prevCount + 1, 'rate_limited');
      return toCustomResult(staleData, 'rate_limited', true);
    }

    if (!result.data) {
      writeCache(staleData, true, 'zai', false, 0, 'network');
      return toCustomResult(staleData, 'network', Boolean(staleData));
    }

    const usage = parseZaiResponse(result.data);
    writeCache(usage, !usage, 'zai', false, 0, !usage ? 'network' : undefined);
    return toCustomResult(usage);
  }

  let creds = getCredentials();
  const staleData = getMatchingCacheData(cache, 'anthropic');

  if (creds) {
    if (!validateCredentials(creds)) {
      if (creds.refreshToken) {
        const refreshed = await refreshAccessToken(creds.refreshToken);
        if (refreshed) {
          creds = { ...creds, ...refreshed };
          writeBackCredentials(creds);
        } else {
          writeCache(staleData, true, 'anthropic', false, 0, 'auth');
          return toCustomResult(staleData, 'auth', Boolean(staleData));
        }
      } else {
        writeCache(staleData, true, 'anthropic', false, 0, 'auth');
        return toCustomResult(staleData, 'auth', Boolean(staleData));
      }
    }

    const result = await fetchUsageFromApi(creds.accessToken);

    if (result.rateLimited) {
      const prevCount = cache?.source === 'anthropic' ? (cache.rateLimitedCount || 0) : 0;
      writeCache(staleData, true, 'anthropic', true, prevCount + 1, 'rate_limited');
      return toCustomResult(staleData, 'rate_limited', true);
    }

    if (!result.data) {
      writeCache(staleData, true, 'anthropic', false, 0, 'network');
      return toCustomResult(staleData, 'network', Boolean(staleData));
    }

    const usage = parseUsageResponse(result.data);
    writeCache(usage, !usage, 'anthropic', false, 0, !usage ? 'network' : undefined);
    return toCustomResult(usage);
  }

  writeCache(staleData, true, 'anthropic', false, 0, 'no_credentials');
  return toCustomResult(staleData, 'no_credentials', Boolean(staleData));
}

export async function getUsage() {
  const baseUrl = process.env.ANTHROPIC_BASE_URL;
  const authToken = process.env.ANTHROPIC_AUTH_TOKEN;
  const isZai = baseUrl != null && isZaiHost(baseUrl);
  const currentSource = isZai && authToken ? 'zai' : 'anthropic';

  const cache = readCache();
  if (cache && isCacheValid(cache) && cache.source === currentSource) {
    return cacheToResult(cache);
  }

  const baselineTimestamp = cache?.source === currentSource ? cache.timestamp : 0;
  const lock = tryAcquireUsageLock();

  if (!lock.acquired) {
    const waitedResult = await waitForSingleFlightResult(currentSource, baselineTimestamp);
    if (waitedResult) {
      return waitedResult;
    }

    const retryCache = readCache();
    if (retryCache && isCacheValid(retryCache) && retryCache.source === currentSource) {
      return cacheToResult(retryCache);
    }

    return refreshUsage(retryCache || cache, isZai, authToken);
  }

  try {
    const lockedCache = readCache();
    if (lockedCache && isCacheValid(lockedCache) && lockedCache.source === currentSource) {
      return cacheToResult(lockedCache);
    }

    return refreshUsage(lockedCache || cache, isZai, authToken);
  } finally {
    releaseUsageLock(lock.lockPath);
  }
}
