import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw === "en" ? "en" : "th";
  const en = locale === "en";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: projects } = await supabase
    .from("projects")
    .select("id,code,name,status,units(id,code,name,status)")
    .order("created_at");

  const project = projects?.[0];
  const units = project?.units ?? [];

  return (
    <main className="app-shell">
      <header className="app-header">
        <div><span className="brand">PROPERTY DEVELOPMENT OS</span><strong>{en ? "Developer Operations" : "ระบบบริหารโครงการ"}</strong></div>
        <nav>
          <Link href={en ? "/th/app" : "/en/app"}>{en ? "TH" : "EN"}</Link>
          <form action={logout}><input type="hidden" name="locale" value={locale}/><button className="text-button">{en ? "Sign out" : "ออกจากระบบ"}</button></form>
        </nav>
      </header>
      <section className="dashboard">
        <p className="kicker">{en ? "PORTFOLIO OVERVIEW" : "ภาพรวมโครงการ"}</p>
        <h1 className="dashboard-title">{project?.name ?? (en ? "No accessible project" : "ยังไม่มีโครงการที่เข้าถึงได้")}</h1>
        <p className="muted">{project ? `${project.code} · ${project.status}` : (en ? "Your account needs an organization/project role." : "บัญชีนี้ยังต้องได้รับสิทธิ์ Organization / Project")}</p>
        <div className="metrics">
          <article><span>{en ? "Units" : "ยูนิต"}</span><strong>{units.length}</strong></article>
          <article><span>{en ? "Available" : "ว่าง"}</span><strong>{units.filter((u) => u.status === "AVAILABLE").length}</strong></article>
          <article><span>{en ? "Project status" : "สถานะโครงการ"}</span><strong className="status-text">{project?.status ?? "—"}</strong></article>
        </div>
        <section className="panel">
          <div className="panel-head"><h2>{en ? "Project 001 Units" : "ยูนิต Project 001"}</h2><span>{units.length}/5</span></div>
          <div className="unit-grid">
            {units.map((unit) => <article className="unit-card" key={unit.id}><span>{unit.code}</span><strong>{unit.name}</strong><small>{unit.status}</small></article>)}
          </div>
        </section>
      </section>
    </main>
  );
}
