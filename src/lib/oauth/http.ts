import { NextResponse } from "next/server";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
};

export function corsJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: CORS });
}

export function corsOptions(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function oauthError(
  error: string,
  description: string,
  status = 400,
): NextResponse {
  return corsJson({ error, error_description: description }, status);
}
