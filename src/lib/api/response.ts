import { NextResponse } from "next/server"

export type ApiError = {
  error: string
  message: string
  details?: any
}

export type ApiSuccess<T = any> = {
  success: true
  data: T
  meta?: Record<string, any>
}

export function jsonSuccess<T>(data: T, meta?: Record<string, any>, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      ...(meta ? { meta } : {}),
    },
    { status }
  )
}

export function jsonError(error: string, message: string, status = 400, details?: any): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error,
      message,
      ...(details ? { details } : {}),
    },
    { status }
  )
}

export function jsonUnauthorized(message = "Unauthorized"): NextResponse<ApiError> {
  return jsonError("UNAUTHORIZED", message, 401)
}

export function jsonForbidden(message = "Forbidden"): NextResponse<ApiError> {
  return jsonError("FORBIDDEN", message, 403)
}

export function jsonNotFound(message = "Resource not found"): NextResponse<ApiError> {
  return jsonError("NOT_FOUND", message, 404)
}

export function jsonBadRequest(message = "Bad request", details?: any): NextResponse<ApiError> {
  return jsonError("BAD_REQUEST", message, 400, details)
}

export function jsonInternalError(message = "Internal server error"): NextResponse<ApiError> {
  return jsonError("INTERNAL_ERROR", message, 500)
}

export function handleApiError(error: unknown): NextResponse<ApiError> {
  console.error("[API Error]", error)
  
  if (error instanceof Error) {
    if (error.message.includes("Unique constraint")) {
      return jsonBadRequest("Resource already exists")
    }
    if (error.message.includes("Foreign key constraint")) {
      return jsonBadRequest("Invalid reference")
    }
    if (error.message.includes("Record to update not found")) {
      return jsonNotFound()
    }
  }
  
  return jsonInternalError()
}

export function withErrorHandling<T>(
  handler: (req: Request, context?: any) => Promise<NextResponse<T>>
) {
  return async (req: Request, context?: any): Promise<NextResponse> => {
    try {
      return await handler(req, context)
    } catch (error) {
      return handleApiError(error)
    }
  }
}

export function parseJsonBody<T>(req: Request): Promise<T> {
  return req.json().catch(() => {
    throw new Error("Invalid JSON body")
  })
}

export function getPaginationParams(req: Request) {
  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "10")))
  const skip = (page - 1) * limit
  
  return { page, limit, skip }
}

export function buildPaginationMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  }
}
