import { NextResponse, type NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const port = process.env.RFS_API_PORT;
  if (!port) {
    return new NextResponse(
      JSON.stringify({ code: 'API_PORT_MISSING', message: 'RFS_API_PORT is not set on the frontend process.' }),
      { status: 502, headers: { 'content-type': 'application/json' } }
    );
  }
  const target = 'http://127.0.0.1:' + port;
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, target);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/api/v1/:path*', '/health'],
};