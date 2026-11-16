import { requestAppPath, stripBasePath } from "../../shared/base-path";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getDb } from "../db/client";
import { apiKeys } from "../db/schema";
import { hashKey } from "./credentials";
import { DEVICE_COOKIE } from "./cookies";
import { AUTH_CREDENTIAL_INVALID_CODE } from "../../shared";

import { authenticationBackoff, sendAuthenticationBackoff } from "./throttle";

const PROVISION_PATH = "/api/auth/provision";

export function readDeviceCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1 || trimmed.slice(0, eqIdx) !== DEVICE_COOKIE) continue;
    const rawValue = trimmed.slice(eqIdx + 1);
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return undefined;
}

function readBearerKey(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) return undefined;
  const rawKey = authorization.slice("Bearer ".length);
  return rawKey.length > 0 ? rawKey : undefined;
}

export type ApiKeyLookup =
  { status: "active"; id: string } | { status: "unknown" | "revoked" | "expired" };

/** FR-004: hash the raw key and look up its record (no cache): it must exist, have
 * revoked_at NULL and expires_at NULL or in the future. */
export async function lookupApiKey(rawKey: string): Promise<ApiKeyLookup> {
  const orm = drizzle(getDb());
  const rows = await orm
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashKey(rawKey)))
    .limit(1);
  if (rows.length === 0) return { status: "unknown" };
  const keyRecord = rows[0];
  if (keyRecord.revokedAt !== null) return { status: "revoked" };
  if (keyRecord.expiresAt !== null && keyRecord.expiresAt <= Date.now()) {
    return { status: "expired" };
  }
  return { status: "active", id: keyRecord.id };
}

/** Classify a request for the `/api/*` boundary; `null` means it is not an API request.
 *
 * Fastify routes before any onRequest hook runs, so this looks at BOTH the route the request
 * matched and its decoded URL path, and treats the request as API if EITHER is under /api/.
 * The matched route decides which handler runs, and the router normalizes spellings the raw
 * URL does not show (it drops the `scheme://authority` of an absolute-form target, for one),
 * so a URL-only check can miss a request that still reaches an /api handler. The URL path
 * keeps unmatched /api/* requests failing closed. `path` is the routed path when a route
 * matched (the handler that will run) and the decoded URL path otherwise. */
export function classifyApiRequest(
  request: FastifyRequest,
  basePath: string
): { path: string; isApiRoute: boolean } | null {
  const routed = request.routeOptions.url;
  const routedPath = routed ? stripBasePath(routed, basePath) : null;
  const isApiRoute = routedPath?.startsWith("/api/") ?? false;
  const pathname = requestAppPath(request.url, basePath);
  if (!isApiRoute && !pathname?.startsWith("/api/")) return null;
  return { path: routedPath ?? pathname ?? "", isApiRoute };
}

/** Single app-wide Fastify preHandler that enforces auth by API key only.
 * FR-001 – API key is the sole backend authorization boundary.
 * FR-002 – Fail-closed: `/health` and `/auth/provision` are the only
 * unauthenticated routes (provision uses Authorization header,
 * not the cookie).
 * FR-003 – No credential → 401/403, deployment stays locked.
 * FR-004 – Per-request active-record lookup (no cache): key must exist,
 * revoked_at IS NULL, and (expires_at IS NULL OR expires_at > now).
 * FR-005 – Credential authority lives in the database; no sessions or cached authority.
 */
export async function authBoundary(app: FastifyInstance, basePath = ""): Promise<void> {
  const backoff = authenticationBackoff(app);
  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // FR-002: /health (GET) and /auth/provision (POST) are the only
    // unauthenticated routes — skip auth for these.
    // ADR-059 §1/§2: the API-key boundary covers exactly /api/*. Frontend routes, the SPA
    // catch-all, and root /health are NOT subject to it.
    const api = classifyApiRequest(request, basePath);
    if (!api) {
      return;
    }
    const { path: effectivePath, isApiRoute } = api;
    // Within /api/* provision authenticates the submitted raw key with no prior cookie.
    // Exact match (never a prefix, which would be fail-OPEN for /api/auth/provision-x).
    if (effectivePath === PROVISION_PATH && request.method === "POST") {
      return;
    }

    // The established cookie transport remains valid throughout `/api/*`. The browser management route additionally
    // admits a raw Authorization bearer only on the plugin-management subtree. Exactly one
    // source may be present there: choosing between identities would make authorization depend
    // on transport precedence.
    const isPluginManagementPath =
      effectivePath === "/api/plugins" || effectivePath.startsWith("/api/plugins/");
    const cookieKey = readDeviceCookie(request.headers.cookie);
    const bearerKey = isPluginManagementPath
      ? readBearerKey(request.headers.authorization)
      : undefined;
    if (cookieKey && bearerKey) {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Present exactly one API credential",
        code: AUTH_CREDENTIAL_INVALID_CODE,
      });
    }
    const rawKey = cookieKey ?? bearerKey;

    const rejectCredential = (status: number, message: string) => {
      // Unknown routes still fail closed, but are not credential guesses against an installed operation.
      const seconds = isApiRoute ? backoff.failure("api", request.ip) : 0;
      if (seconds) return sendAuthenticationBackoff(reply, seconds);
      return reply.code(status).send({
        error: status === 401 ? "unauthorized" : "forbidden",
        message,
        code: AUTH_CREDENTIAL_INVALID_CODE,
      });
    };

    // FR-003: Missing key → reject immediately.
    if (!rawKey) {
      return rejectCredential(401, "API key is required");
    }

    // FR-004: Per-request active-record lookup.
    const key = await lookupApiKey(rawKey);
    if (key.status !== "active") {
      if (key.status === "unknown") return rejectCredential(401, "Invalid API key");
      return rejectCredential(
        403,
        `API key has ${key.status === "revoked" ? "been revoked" : "expired"}`
      );
    }

    // FR-005: At this point the key is valid — attach it to the request so
    // downstream handlers can reference it. Do NOT store the raw key in any
    // response body (FR-006 / SC-004).
    const authenticatedRequest = request as FastifyRequest & {
      apiKeyId: string;
      apiKeyTransport: "cookie" | "bearer";
    };
    authenticatedRequest.apiKeyId = key.id;
    authenticatedRequest.apiKeyTransport = bearerKey ? "bearer" : "cookie";
  });
}
