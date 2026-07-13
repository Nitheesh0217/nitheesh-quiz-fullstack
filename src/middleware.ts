import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  const { pathname } = request.nextUrl;

  if (pathname === '/complete-profile') {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = parseJwt(token);
    if (payload?.onboarding_completed === true) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  }

  if (pathname.startsWith('/dashboard')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    const payload = parseJwt(token);
    if (!payload || !payload.role) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // A bare Google-OAuth signup has no real role/school yet - finish that
    // first, before any of the role-based guards below get a say.
    if (payload.onboarding_completed === false) {
      return NextResponse.redirect(new URL('/complete-profile', request.url));
    }

    const role = payload.role;

    // Route guards
    if (pathname.startsWith('/dashboard/teacher') && role !== 'teacher') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    if (pathname.startsWith('/dashboard/admin') && role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    if (pathname.startsWith('/dashboard/student') && role !== 'student') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/complete-profile'],
};
