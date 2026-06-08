import type { Context, Next } from "hono";

/**
 * Configuration for request limiting
 */
export interface LimitConfig {
  maxBodySize: number; // in bytes
  maxChatBodySize: number; // specific limit for /api/chat (can be larger)
  rateLimit: {
    enabled: boolean;
    windowMs: number; // milliseconds
    maxRequests: number; // requests per window
  };
}

/**
 * Default configuration
 */
export const DEFAULT_LIMIT_CONFIG: LimitConfig = {
  maxBodySize: 1024 * 50, // 50 KB for general endpoints
  maxChatBodySize: 1024 * 200, // 200 KB for chat (allows longer messages)
  rateLimit: {
    enabled: true,
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
  },
};

/**
 * In-memory token bucket rate limiter
 * Simple, lightweight, no external service required
 */
class TokenBucket {
  private tokens: number;
  private lastRefillTime: number;

  constructor(
    private capacity: number,
    private refillRate: number, // tokens per millisecond
  ) {
    this.tokens = capacity;
    this.lastRefillTime = Date.now();
  }

  /**
   * Try to consume tokens. Returns true if successful.
   */
  consume(amount: number = 1): boolean {
    this.refill();
    if (this.tokens >= amount) {
      this.tokens -= amount;
      return true;
    }
    return false;
  }

  /**
   * Get remaining tokens (after refill)
   */
  getRemaining(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  /**
   * Get time until next token is available (in milliseconds)
   */
  getRetryAfter(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil((1 - this.tokens) / this.refillRate);
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefillTime;
    this.tokens = Math.min(this.capacity, this.tokens + timePassed * this.refillRate);
    this.lastRefillTime = now;
  }
}

/**
 * Per-IP rate limiter using token buckets
 */
class RateLimiter {
  private buckets = new Map<string, TokenBucket>();
  private config: LimitConfig["rateLimit"];

  constructor(config: LimitConfig["rateLimit"]) {
    this.config = config;
  }

  /**
   * Check if a request from an IP should be allowed
   */
  isAllowed(ip: string): { allowed: boolean; retryAfter: number } {
    if (!this.config.enabled) return { allowed: true, retryAfter: 0 };

    let bucket = this.buckets.get(ip);
    if (!bucket) {
      // Create new bucket: capacity = maxRequests, refill = maxRequests per windowMs
      const refillRate = this.config.maxRequests / this.config.windowMs;
      bucket = new TokenBucket(this.config.maxRequests, refillRate);
      this.buckets.set(ip, bucket);
    }

    const allowed = bucket.consume(1);
    const retryAfter = allowed ? 0 : bucket.getRetryAfter();
    return { allowed, retryAfter };
  }

  /**
   * Clean up old buckets to prevent memory leak (call periodically)
   */
  cleanup(): void {
    // Remove buckets that are at capacity (idle) and haven't been used
    // We keep this simple: just prune if map gets too large
    if (this.buckets.size > 10000) {
      // Remove oldest 50% when we hit 10k entries
      const entriesToRemove = Math.floor(this.buckets.size * 0.5);
      let removed = 0;
      for (const [ip] of this.buckets) {
        if (removed >= entriesToRemove) break;
        this.buckets.delete(ip);
        removed++;
      }
    }
  }
}

// Global rate limiter instance
let globalRateLimiter: RateLimiter | null = null;

/**
 * Initialize the rate limiter (call once on app startup)
 */
export function initRateLimiter(config: LimitConfig): void {
  globalRateLimiter = new RateLimiter(config.rateLimit);

  // Periodic cleanup every 5 minutes
  setInterval(() => {
    globalRateLimiter?.cleanup();
  }, 5 * 60 * 1000);
}

/**
 * Extract client IP from request
 */
function getClientIp(c: Context): string {
  // Check common headers set by proxies
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "127.0.0.1";
  }

  const xClientIp = c.req.header("x-client-ip");
  if (xClientIp) return xClientIp;

  const cfConnectingIp = c.req.header("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  // Fallback: localhost for dev
  return "127.0.0.1";
}

/**
 * Middleware: Body size limit
 */
export function bodyLimitMiddleware(config: LimitConfig) {
  return async (c: Context, next: Next) => {
    const contentLength = c.req.header("content-length");
    if (!contentLength) {
      return next();
    }

    const length = parseInt(contentLength, 10);
    const maxSize = c.req.path.includes("/api/chat")
      ? config.maxChatBodySize
      : config.maxBodySize;

    if (length > maxSize) {
      return c.json(
        {
          error: `Request body too large. Maximum size: ${maxSize} bytes.`,
          maxSize,
          received: length,
        },
        413,
      );
    }

    return next();
  };
}

/**
 * Middleware: Rate limiting per IP
 */
export function rateLimitMiddleware(config: LimitConfig) {
  return async (c: Context, next: Next) => {
    if (!globalRateLimiter) {
      return next();
    }

    const ip = getClientIp(c);
    const { allowed, retryAfter } = globalRateLimiter.isAllowed(ip);

    if (!allowed) {
      // Set rate limit headers
      c.header("Retry-After", Math.ceil(retryAfter / 1000).toString());
      c.header("RateLimit-Limit", config.rateLimit.maxRequests.toString());
      c.header("RateLimit-Window", config.rateLimit.windowMs.toString());
      c.header(
        "RateLimit-Reset",
        new Date(Date.now() + retryAfter).toISOString(),
      );

      return c.json(
        {
          error: "Too many requests. Please slow down.",
          retryAfter: Math.ceil(retryAfter / 1000),
        },
        429,
      );
    }

    // Add rate limit info to response headers
    c.header("RateLimit-Limit", config.rateLimit.maxRequests.toString());
    c.header("RateLimit-Window", config.rateLimit.windowMs.toString());

    return next();
  };
}
