import 'server-only'

export interface EmbeddingRateLimitConfig {
  rpmLimit: number
  tpmLimit: number
  rpmUtilization: number
  tpmUtilization: number
  windowMs: number
  waitMarginMs: number
}

export interface EmbeddingRateLimitTelemetry {
  logicalBatches: number
  httpAttempts: number
  estimatedTokensTotal: number
  throttleWaitCount: number
  throttleWaitMsTotal: number
  maxEstimatedTokensInWindow: number
  subBatchesCreated: number
}

interface RateEvent { timestamp: number; estimatedTokens: number }

export function createEmbeddingRateLimitTelemetry(): EmbeddingRateLimitTelemetry {
  return { logicalBatches: 0, httpAttempts: 0, estimatedTokensTotal: 0,
    throttleWaitCount: 0, throttleWaitMsTotal: 0, maxEstimatedTokensInWindow: 0, subBatchesCreated: 0 }
}

export function estimateEmbeddingInputTokens(text: string) {
  return Math.max(1, Math.ceil(new TextEncoder().encode(text).byteLength / 3))
}

export function estimateEmbeddingBatchTokens(texts: readonly string[]) {
  return texts.reduce((total, text) => total + estimateEmbeddingInputTokens(text), 0)
}

export function effectiveEmbeddingRateLimits(config: EmbeddingRateLimitConfig) {
  return {
    requests: Math.max(1, Math.floor(config.rpmLimit * config.rpmUtilization)),
    tokens: Math.max(1, Math.floor(config.tpmLimit * config.tpmUtilization)),
  }
}

export function splitEmbeddingBatchByTokenBudget<T>(items: readonly T[], estimate: (item: T) => number, tokenBudget: number): T[][] {
  if (!Number.isFinite(tokenBudget) || tokenBudget < 1) throw new Error('Budget de tokens inválido.')
  const batches: T[][] = []
  let current: T[] = []
  let currentTokens = 0
  for (const item of items) {
    const tokens = estimate(item)
    if (!Number.isFinite(tokens) || tokens < 1 || tokens > tokenBudget) throw new Error('Um input individual excede o budget operacional de tokens.')
    if (current.length > 0 && currentTokens + tokens > tokenBudget) {
      batches.push(current)
      current = []
      currentTokens = 0
    }
    current.push(item)
    currentTokens += tokens
  }
  if (current.length > 0) batches.push(current)
  return batches
}

export class EmbeddingSlidingWindowRateLimiter {
  private events: RateEvent[] = []
  readonly limits: ReturnType<typeof effectiveEmbeddingRateLimits>

  constructor(
    private readonly config: EmbeddingRateLimitConfig,
    private readonly telemetry: EmbeddingRateLimitTelemetry,
    private readonly now: () => number = Date.now,
    private readonly sleep: (delayMs: number) => Promise<void> = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  ) {
    this.limits = effectiveEmbeddingRateLimits(config)
  }

  private activeEvents(now: number) {
    this.events = this.events.filter((event) => now - event.timestamp < this.config.windowMs)
    return this.events
  }

  private fits(events: readonly RateEvent[], tokens: number) {
    return events.length + 1 <= this.limits.requests
      && events.reduce((total, event) => total + event.estimatedTokens, 0) + tokens <= this.limits.tokens
  }

  async acquire(estimatedTokens: number) {
    if (!Number.isFinite(estimatedTokens) || estimatedTokens < 1 || estimatedTokens > this.limits.tokens) {
      throw new Error('Request de embedding excede o budget operacional de tokens.')
    }
    let now = this.now()
    let events = this.activeEvents(now)
    if (!this.fits(events, estimatedTokens)) {
      const expirations = [...new Set(events.map((event) => event.timestamp + this.config.windowMs))].sort((a, b) => a - b)
      const allowedAt = expirations.find((time) => this.fits(events.filter((event) => event.timestamp + this.config.windowMs <= time ? false : true), estimatedTokens))
      const waitMs = Math.max(0, (allowedAt ?? now + this.config.windowMs) - now) + this.config.waitMarginMs
      this.telemetry.throttleWaitCount += 1
      this.telemetry.throttleWaitMsTotal += waitMs
      await this.sleep(waitMs)
      now = this.now()
      events = this.activeEvents(now)
      if (!this.fits(events, estimatedTokens)) throw new Error('O relógio do rate limiter não avançou após a espera.')
    }
    this.events.push({ timestamp: now, estimatedTokens })
    this.telemetry.httpAttempts += 1
    this.telemetry.estimatedTokensTotal += estimatedTokens
    const tokensInWindow = this.events.reduce((total, event) => total + event.estimatedTokens, 0)
    this.telemetry.maxEstimatedTokensInWindow = Math.max(this.telemetry.maxEstimatedTokensInWindow, tokensInWindow)
  }
}
