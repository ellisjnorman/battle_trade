/**
 * Error handling utilities for Battle Trade API routes and server code.
 *
 * - ApiError: typed error class with HTTP status codes
 * - captureError: structured error logging (delegates to logger for Sentry)
 * - withErrorHandling: wrapper for Next.js API route handlers
 */

import { NextResponse } from 'next/server';
import { logger } from './logger';

// ---------------------------------------------------------------------------
// ApiError class
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly context: Record<string, unknown>;

  constructor(
    statusCode: number,
    message: string,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.context = context;
  }

  /** 400 Bad Request */
  static badRequest(message: string, context?: Record<string, unknown>) {
    return new ApiError(400, message, context);
  }

  /** 401 Unauthorized */
  static unauthorized(message = 'Unauthorized', context?: Record<string, unknown>) {
    return new ApiError(401, message, context);
  }

  /** 403 Forbidden */
  static forbidden(message = 'Forbidden', context?: Record<string, unknown>) {
    return new ApiError(403, message, context);
  }

  /** 404 Not Found */
  static notFound(message = 'Not found', context?: Record<string, unknown>) {
    return new ApiError(404, message, context);
  }

  /** 409 Conflict */
  static conflict(message: string, context?: Record<string, unknown>) {
    return new ApiError(409, message, context);
  }

  /** 429 Too Many Requests */
  static rateLimit(message = 'Too many requests', context?: Record<string, unknown>) {
    return new ApiError(429, message, context);
  }

  /** 500 Internal Server Error */
  static internal(message = 'Internal server error', context?: Record<string, unknown>) {
    return new ApiError(500, message, context);
  }
}

// ---------------------------------------------------------------------------
// captureError — structured logging with optional Sentry forwarding
// ---------------------------------------------------------------------------

export function captureError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  const message =
    error instanceof Error ? error.message : String(error);

  logger.error(message, context as Parameters<typeof logger.error>[1], error);
}

// ---------------------------------------------------------------------------
// withErrorHandling — wraps API route handlers
// ---------------------------------------------------------------------------

type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response> | Response;

/**
 * Wraps a Next.js App Router API handler with structured error handling.
 *
 * - ApiError instances return their status code + JSON body
 * - Unknown errors return 500 and are reported via captureError
 *
 * Usage:
 *   export const GET = withErrorHandling(async (req, ctx) => { ... });
 */
export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiError) {
        // Expected / operational error — return structured response
        captureError(error, {
          ...error.context,
          statusCode: error.statusCode,
          url: request.url,
          method: request.method,
        });

        return NextResponse.json(
          {
            error: error.message,
            ...(process.env.NODE_ENV !== 'production' && error.context
              ? { context: error.context }
              : {}),
          },
          { status: error.statusCode },
        );
      }

      // Unexpected / programmer error — always 500
      captureError(error, {
        url: request.url,
        method: request.method,
        context: 'unhandled-api-error',
      });

      const message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : error instanceof Error
            ? error.message
            : String(error);

      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
