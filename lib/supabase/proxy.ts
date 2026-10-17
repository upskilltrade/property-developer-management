import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Refreshes the Supabase session cookie on every request so Server Components see a valid user. */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Without config the proxy would throw on every request and 500 the whole site, login included.
  if (!url || !key) {
    console.error("Supabase env vars missing; skipping session refresh");
    return response;
  }
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  try {
    await supabase.auth.getUser();
  } catch (error) {
    // A Supabase outage should not take down pages that can render without a session.
    console.error("Supabase session refresh failed", error);
  }
  return response;
}
