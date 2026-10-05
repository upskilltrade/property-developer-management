import Link from "next/link";
import { login } from "./actions";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale: raw } = await params;
  const { error } = await searchParams;
  const locale = raw === "en" ? "en" : "th";
  const en = locale === "en";
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="topline">
          <span className="brand">PROPERTY DEVELOPMENT OS</span>
          <Link href={en ? "/th/login" : "/en/login"}>{en ? "TH" : "EN"}</Link>
        </div>
        <p className="kicker">RELEASE 0 · FOUNDATION</p>
        <h1 className="auth-title">{en ? "Sign in" : "เข้าสู่ระบบ"}</h1>
        <p className="muted">{en ? "Developer Operations" : "ระบบบริหารโครงการ"}</p>
        {error && <div className="error">{en ? "Email or password is incorrect." : "อีเมลหรือรหัสผ่านไม่ถูกต้อง"}</div>}
        <form action={login} className="form">
          <input type="hidden" name="locale" value={locale} />
          <label>{en ? "Email" : "อีเมล"}<input name="email" type="email" required autoComplete="email" /></label>
          <label>{en ? "Password" : "รหัสผ่าน"}<input name="password" type="password" required autoComplete="current-password" /></label>
          <button type="submit">{en ? "Sign in" : "เข้าสู่ระบบ"}</button>
        </form>
      </section>
    </main>
  );
}
