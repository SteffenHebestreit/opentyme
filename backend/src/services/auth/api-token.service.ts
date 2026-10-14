/**
 * @fileoverview Personal access tokens: creation, lookup and lifecycle.
 *
 * A token is `oty_pat_` + 40 random base62 characters (~238 bits) + a
 * 6-character CRC32 checksum. The prefix lets the auth middleware tell a token
 * from a Keycloak JWT and makes leaked tokens easy to find; the checksum
 * rejects typos and garbage before any database lookup.
 *
 * Only the SHA-256 hash is stored. With this much entropy a plain hash cannot
 * be reversed, so no server-side pepper is needed (and none can be lost or
 * rotated away). The plaintext is returned once — on create or regenerate.
 *
 * Lookups are cached in memory for a minute; every change to a token evicts
 * it at once, so revoking takes effect on the next request. A second backend
 * replica would need a shared invalidation channel (Redis pub/sub).
 *
 * @module services/auth/api-token.service
 */

import crypto from 'crypto';
import { getDbClient } from '../../utils/database';
import { logger } from '../../utils/logger';
import { BoundedLru } from '../../utils/bounded-lru';
import { keycloakService } from '../keycloak.service';
import { normalizePermissions } from './api-token-permissions';
import {
  ApiToken,
  ApiTokenOwner,
  AuthenticatedApiToken,
  CreateApiTokenDto,
  UpdateApiTokenDto,
} from '../../models/auth/api-token.model';

export const API_TOKEN_PREFIX = 'oty_pat_';
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const RANDOM_LENGTH = 40;
const CHECKSUM_LENGTH = 6; // 62^6 > 2^32, so any CRC32 fits
const TOKEN_PATTERN = new RegExp(`^${API_TOKEN_PREFIX}[0-9A-Za-z]{${RANDOM_LENGTH + CHECKSUM_LENGTH}}$`);
/** Shown in the UI so the user can match a token to a config file. */
const DISPLAY_PREFIX_LENGTH = API_TOKEN_PREFIX.length + 4;

export const MAX_TOKENS_PER_USER = 25;

const TOKEN_CACHE_TTL_MS = 60 * 1000;
const OWNER_CACHE_TTL_MS = 5 * 60 * 1000;
const MISSING_OWNER_CACHE_TTL_MS = 60 * 1000;
const LAST_USED_WRITE_INTERVAL_MS = 60 * 1000;

const PUBLIC_COLUMNS = `id, name, description, token_prefix, permissions, approval_mode, expires_at,
  last_used_at, last_used_ip, last_used_user_agent, created_at, updated_at`;

export class ApiTokenError extends Error {
  constructor(
    public readonly code: 'NAME_TAKEN' | 'LIMIT_REACHED',
    message: string
  ) {
    super(message);
    this.name = 'ApiTokenError';
  }
}

export type ApiTokenLookup =
  | { status: 'ok'; token: AuthenticatedApiToken }
  | { status: 'invalid' }
  | { status: 'expired' };

// ── Token format ─────────────────────────────────────────────────────────────

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(text: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) {
    crc = CRC32_TABLE[(crc ^ text.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBase62(value: number, width: number): string {
  let out = '';
  let n = value;
  for (let i = 0; i < width; i++) {
    out = BASE62[n % 62] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

function randomBase62(length: number): string {
  let out = '';
  while (out.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      // 248 = 4 × 62: dropping the top bytes keeps every character equally likely.
      if (byte < 248) out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** A new token secret with its hash and display prefix. */
export function generateApiToken(): { secret: string; hash: string; prefix: string } {
  const random = randomBase62(RANDOM_LENGTH);
  const secret = API_TOKEN_PREFIX + random + toBase62(crc32(random), CHECKSUM_LENGTH);
  return { secret, hash: hashApiToken(secret), prefix: secret.slice(0, DISPLAY_PREFIX_LENGTH) };
}

export function hashApiToken(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/** Bearer value looks like one of ours — decides which auth path a request takes. */
export function isApiToken(bearer: string): boolean {
  return bearer.startsWith(API_TOKEN_PREFIX);
}

/** Right shape and checksum. Says nothing about whether the token exists. */
export function hasValidApiTokenFormat(secret: string): boolean {
  if (!TOKEN_PATTERN.test(secret)) return false;
  const body = secret.slice(API_TOKEN_PREFIX.length);
  const random = body.slice(0, RANDOM_LENGTH);
  return body.slice(RANDOM_LENGTH) === toBase62(crc32(random), CHECKSUM_LENGTH);
}

// ── Service ──────────────────────────────────────────────────────────────────

function toPublic(row: any): ApiToken {
  return { ...row, permissions: normalizePermissions(row.permissions) };
}

function isExpired(expiresAt: Date | null): boolean {
  return expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
}

export class ApiTokenService {
  private tokenCache = new BoundedLru<{ token: AuthenticatedApiToken; until: number }>(1000);
  private ownerCache = new BoundedLru<{ owner: ApiTokenOwner | null; until: number }>(1000);
  private lastUsedWrites = new BoundedLru<number>(1000);

  async list(userId: string): Promise<ApiToken[]> {
    const { rows } = await getDbClient().query(
      `SELECT ${PUBLIC_COLUMNS} FROM api_tokens WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(toPublic);
  }

  async get(userId: string, id: string): Promise<ApiToken | null> {
    const { rows } = await getDbClient().query(
      `SELECT ${PUBLIC_COLUMNS} FROM api_tokens WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    return rows[0] ? toPublic(rows[0]) : null;
  }

  /** Creates a token. `secret` is the only time the plaintext exists outside the caller. */
  async create(userId: string, dto: CreateApiTokenDto): Promise<{ token: ApiToken; secret: string }> {
    const db = getDbClient();
    const { rows: countRows } = await db.query(
      'SELECT COUNT(*)::int AS count FROM api_tokens WHERE user_id = $1',
      [userId]
    );
    if (countRows[0].count >= MAX_TOKENS_PER_USER) {
      throw new ApiTokenError('LIMIT_REACHED', `You can have at most ${MAX_TOKENS_PER_USER} tokens.`);
    }

    const { secret, hash, prefix } = generateApiToken();
    try {
      const { rows } = await db.query(
        `INSERT INTO api_tokens (user_id, name, description, token_hash, token_prefix, permissions, approval_mode, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ${PUBLIC_COLUMNS}`,
        [
          userId,
          dto.name,
          dto.description ?? null,
          hash,
          prefix,
          JSON.stringify(normalizePermissions(dto.permissions)),
          dto.approval_mode ?? 'self',
          dto.expires_at ?? null,
        ]
      );
      return { token: toPublic(rows[0]), secret };
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  async update(userId: string, id: string, dto: UpdateApiTokenDto): Promise<ApiToken | null> {
    const sets: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (dto.name !== undefined) add('name', dto.name);
    if (dto.description !== undefined) add('description', dto.description);
    if (dto.permissions !== undefined) add('permissions', JSON.stringify(normalizePermissions(dto.permissions)));
    if (dto.approval_mode !== undefined) add('approval_mode', dto.approval_mode);
    if (sets.length === 0) return this.get(userId, id);

    values.push(id, userId);
    try {
      const { rows } = await getDbClient().query(
        `UPDATE api_tokens SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${values.length - 1} AND user_id = $${values.length}
         RETURNING ${PUBLIC_COLUMNS}, token_hash`,
        values
      );
      if (!rows[0]) return null;
      this.tokenCache.delete(rows[0].token_hash);
      const { token_hash: _hash, ...row } = rows[0];
      return toPublic(row);
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  /**
   * Replaces the secret, keeping name and permissions. The old secret stops
   * working immediately. This is also the only way to change the expiry, so a
   * leaked secret can never be given a longer life.
   */
  async regenerate(
    userId: string,
    id: string,
    expiresAt: Date | null
  ): Promise<{ token: ApiToken; secret: string } | null> {
    const { secret, hash, prefix } = generateApiToken();
    const { rows } = await getDbClient().query(
      `WITH old AS (SELECT token_hash FROM api_tokens WHERE id = $1 AND user_id = $2)
       UPDATE api_tokens t
          SET token_hash = $3, token_prefix = $4, expires_at = $5,
              last_used_at = NULL, last_used_ip = NULL, last_used_user_agent = NULL,
              updated_at = CURRENT_TIMESTAMP
         FROM old
        WHERE t.id = $1 AND t.user_id = $2
       RETURNING old.token_hash AS old_hash, ${PUBLIC_COLUMNS.split(',').map((c) => `t.${c.trim()}`).join(', ')}`,
      [id, userId, hash, prefix, expiresAt]
    );
    if (!rows[0]) return null;
    this.tokenCache.delete(rows[0].old_hash);
    const { old_hash: _old, ...row } = rows[0];
    return { token: toPublic(row), secret };
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const { rows } = await getDbClient().query(
      'DELETE FROM api_tokens WHERE id = $1 AND user_id = $2 RETURNING token_hash',
      [id, userId]
    );
    if (!rows[0]) return false;
    this.tokenCache.delete(rows[0].token_hash);
    return true;
  }

  /** Resolves a bearer secret to its token. Expiry is checked on every call, cached or not. */
  async lookup(secret: string): Promise<ApiTokenLookup> {
    if (!hasValidApiTokenFormat(secret)) return { status: 'invalid' };
    const hash = hashApiToken(secret);

    const cached = this.tokenCache.get(hash);
    let token = cached && cached.until > Date.now() ? cached.token : undefined;
    if (!token) {
      const { rows } = await getDbClient().query(
        `SELECT id, user_id, name, permissions, approval_mode, expires_at
           FROM api_tokens WHERE token_hash = $1`,
        [hash]
      );
      if (!rows[0]) return { status: 'invalid' };
      token = { ...rows[0], permissions: normalizePermissions(rows[0].permissions) } as AuthenticatedApiToken;
      this.tokenCache.set(hash, { token, until: Date.now() + TOKEN_CACHE_TTL_MS });
    }

    return isExpired(token.expires_at) ? { status: 'expired' } : { status: 'ok', token };
  }

  /**
   * The token's owner, or null when the account is gone or disabled — either
   * way the token must stop working. Throws when Keycloak can't be asked.
   */
  async resolveOwner(userId: string): Promise<ApiTokenOwner | null> {
    const cached = this.ownerCache.get(userId);
    if (cached && cached.until > Date.now()) return cached.owner;

    const user = await keycloakService.findUserById(userId);
    const owner: ApiTokenOwner | null =
      user && user.enabled !== false
        ? {
            id: userId,
            email: user.email ?? '',
            username: user.username ?? '',
            firstName: user.firstName,
            lastName: user.lastName,
            emailVerified: user.emailVerified ?? false,
          }
        : null;
    this.ownerCache.set(userId, {
      owner,
      until: Date.now() + (owner ? OWNER_CACHE_TTL_MS : MISSING_OWNER_CACHE_TTL_MS),
    });
    return owner;
  }

  /** Records use, at most once a minute per token. Never fails the request. */
  touch(tokenId: string, ip: string | undefined, userAgent: string | undefined): void {
    const last = this.lastUsedWrites.get(tokenId);
    if (last && Date.now() - last < LAST_USED_WRITE_INTERVAL_MS) return;
    this.lastUsedWrites.set(tokenId, Date.now());

    getDbClient()
      .query(
        `UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP, last_used_ip = $2, last_used_user_agent = $3
          WHERE id = $1`,
        [tokenId, ip?.slice(0, 64) ?? null, userAgent?.slice(0, 255) ?? null]
      )
      .catch((error) => logger.warn(`[ApiToken] Could not record use of token ${tokenId}: ${error.message}`));
  }

  private translateUniqueViolation(error: any): Error {
    if (error?.code === '23505' && String(error.constraint).includes('user_name')) {
      return new ApiTokenError('NAME_TAKEN', 'You already have a token with this name.');
    }
    return error;
  }
}

export const apiTokenService = new ApiTokenService();
