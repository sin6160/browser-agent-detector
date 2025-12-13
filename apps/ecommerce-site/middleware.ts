import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

function isExternalAccess(request: NextRequest) {
  const referer = request.headers.get('referer');
  const origin = request.nextUrl.origin;

  if (!referer) {
    return true;
  }

  try {
    const refererOrigin = new URL(referer).origin;
    return refererOrigin !== origin;
  } catch {
    return true;
  }
}

export function middleware(request: NextRequest) {
  const isAccountPath = request.nextUrl.pathname.startsWith('/account');
  const isPrefetch = request.headers.get('x-middleware-prefetch');

  if (!isAccountPath || isPrefetch) {
    return NextResponse.next();
  }

  if (isExternalAccess(request)) {
    const redirectUrl = new URL('/', request.url);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/account/:path*'],
};
