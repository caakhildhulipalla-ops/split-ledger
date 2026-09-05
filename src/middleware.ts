import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC = [
  '/signin',
  '/auth',
  '/join',
  '/privacy',
  '/terms',
  '/offline',
  '/manifest.webmanifest',
  '/sw.js',
  // Android verifies the TWA against this file; it must be reachable with no
  // session, no redirect and no cookie.
  '/.well-known',
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes an expiring session. Must run before any auth check.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + '/'));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    // Come back to where they were headed once signed in.
    if (path !== '/') url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  if (user && path === '/signin') {
    const url = request.nextUrl.clone();
    url.pathname = '/groups';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|.*\\.(?:png|svg|webmanifest)$).*)'],
};
