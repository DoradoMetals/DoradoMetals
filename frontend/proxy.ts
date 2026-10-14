import { NextResponse, type NextRequest } from 'next/server'

import { SESSION_COOKIE_NAMES } from '@/shared/utils/sessionCookie'
import { signInHref } from '@/shared/utils/returnTo'

export function proxy(request: NextRequest) {
  const signedIn = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name))
  if (signedIn) return NextResponse.next()

  const { pathname, search } = request.nextUrl
  const target = new URL(signInHref(`${pathname}${search}`), request.url)
  return NextResponse.redirect(target)
}

export const config = {
  matcher: ['/admin/:path*', '/account/:path*'],
}
