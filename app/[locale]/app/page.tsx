import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import styles from "./dashboard.module.css";

const nav = ["Dashboard","Projects","Land Bank","Design & Plan","Cost & Budget","Construction","Sales & Marketing","Customers (CRM)","Finance","Suppliers","Documents","Reports"];

export default async function Dashboard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw === "en" ? "en" : "th";
  const en = locale === "en";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const [{ data: projects }, { data: profile }, { data: portfolioRows }] = await Promise.all([
    supabase.from("projects").select("id,code,name,status,currency_code,target_completion_date").order("created_at").limit(20),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_portfolio_dashboard"),
  ]);
  const allProjects = projects ?? [];
  const project = allProjects[0];
  const [{ data: plots }, { data: units }] = project ? await Promise.all([
    supabase.from("plots").select("id,code,land_area_sqm").eq("project_id",project.id).order("code").limit(100),
    supabase.from("units").select("id,code,name,status,list_price,currency_code").eq("project_id",project.id).order("code").limit(100),
  ]) : [{data:[]},{data:[]}];
  const portfolio = (portfolioRows?.[0] ?? null) as null | {total_projects:number|string|null;total_plots:number|string|null;total_units:number|string|null;available_units:number|string|null;sold_contracted_units:number|string|null;priced_units:number|string|null;listed_value:number|string|null};
  const projectPlots = plots ?? [];
  const projectUnits = units ?? [];
  const available = projectUnits.filter(u => u.status === "AVAILABLE").length;
  const totalProjects = Number(portfolio?.total_projects ?? allProjects.length);
  const totalPlots = Number(portfolio?.total_plots ?? 0);
  const totalUnits = Number(portfolio?.total_units ?? 0);
  const portfolioAvailable = Number(portfolio?.available_units ?? 0);
  const sold = Number(portfolio?.sold_contracted_units ?? 0);
  const pricedCount = Number(portfolio?.priced_units ?? 0);
  const value = Number(portfolio?.listed_value ?? 0);
  const plots = projectPlots;
  const units = projectUnits;
  const displayName = profile?.display_name || user.email?.split("@")[0] || (en ? "Developer" : "ผู้พัฒนาโครงการ");
  const fmt = new Intl.NumberFormat(en ? "en-US" : "th-TH", { maximumFractionDigits: 0 });

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}><i>DP</i><div><b>DevPropertyPro</b><small>Build · Manage · Grow</small></div></div>
        <nav>{nav.map((item,i)=><a className={i===0?styles.active:""} key={item} href={i===0?`/${locale}/app`:i===1?`/${locale}/app/projects`:i===8?`/${locale}/app/finance`:"#"}><span>{["⌂","▦","◇","⌑","฿","◫","↗","♙","◉","⬡","▤","◌"][i]}</span>{item}</a>)}</nav>
        <div className={styles.sideFoot}><Link href={`/${locale}/design-system`}>◈ Design System</Link><span>DevPropertyPro v0.1</span></div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.search}>⌕ <span>{en ? "Search projects, units, customers…" : "ค้นหาโครงการ ยูนิต ลูกค้า…"}</span></div>
          <div className={styles.topActions}><Link href={en?"/th/app":"/en/app"}>{en?"TH":"EN"}</Link><button className={styles.iconButton}>♢</button><div className={styles.avatar}>{displayName.slice(0,1).toUpperCase()}</div><div className={styles.user}><b>{displayName}</b><small>{en?"Project Developer":"ผู้พัฒนาโครงการ"}</small></div></div>
        </header>

        <div className={styles.content}>
          <div className={styles.heading}><div><p>{en?"PORTFOLIO OVERVIEW":"ภาพรวมพอร์ตโครงการ"}</p><h1>{en?"Good morning":"สวัสดี"}, {displayName}</h1><span>{en?"Here’s what’s happening across your development portfolio.":"ภาพรวมสิ่งที่กำลังเกิดขึ้นในโครงการของคุณ"}</span></div><div className={styles.headingActions}><span>{new Intl.DateTimeFormat(en?"en-GB":"th-TH",{dateStyle:"medium"}).format(new Date())}</span><Link className={styles.newProject} href={`/${locale}/app/projects#new`}>＋ {en?"New Project":"โครงการใหม่"}</Link></div></div>

          <div className={styles.metrics}>
            <article><small>{en?"TOTAL PROJECTS":"โครงการทั้งหมด"}</small><strong>{totalProjects}</strong><em>{project?.status ?? "—"}</em></article>
            <article><small>{en?"TOTAL PLOTS":"แปลงทั้งหมด"}</small><strong>{totalPlots}</strong><em>{en?"Across portfolio":"ทั้งพอร์ต"}</em></article>
            <article><small>{en?"TOTAL UNITS":"ยูนิตทั้งหมด"}</small><strong>{totalUnits}</strong><em>{portfolioAvailable} {en?"available":"ว่าง"}</em></article>
            <article><small>{en?"SOLD / CONTRACTED":"ขาย / ทำสัญญา"}</small><strong>{sold}</strong><em>{totalUnits?Math.round(sold/totalUnits*100):0}%</em></article>
            <article><small>{en?"LISTED VALUE":"มูลค่าราคาขาย"}</small><strong>{pricedCount ? `฿${fmt.format(value)}` : "—"}</strong><em>{pricedCount? `${pricedCount} priced units` : (en?"Prices not set":"ยังไม่ได้กำหนดราคา")}</em></article>
          </div>

          <div className={styles.grid}>
            <article className={styles.projectCard}>
              <div className={styles.cardHead}><div><small>{en?"FEATURED PROJECT":"โครงการหลัก"}</small><h2>{project?.name ?? (en?"No project":"ยังไม่มีโครงการ")}</h2><span>{project?.code ?? "—"}</span></div><span className={styles.status}>{project?.status ?? "—"}</span></div>
              <div className={styles.projectVisual}><div className={styles.building}>DPP</div><div className={styles.projectStats}><div><span>{en?"Plots":"แปลง"}</span><b>{plots.length}</b></div><div><span>{en?"Units":"ยูนิต"}</span><b>{units.length}</b></div><div><span>{en?"Available":"ว่าง"}</span><b>{available}</b></div></div></div>
            </article>

            <article className={styles.panel}><div className={styles.panelHead}><div><small>{en?"UNIT STATUS":"สถานะยูนิต"}</small><h3>{en?"Inventory overview":"ภาพรวม Inventory"}</h3></div><b>{units.length}</b></div><div className={styles.donut} style={{"--pct":`${units.length?available/units.length*100:0}%`} as React.CSSProperties}><div><b>{available}</b><span>{en?"Available":"ว่าง"}</span></div></div><div className={styles.legend}><span><i/> {en?"Available":"ว่าง"} <b>{available}</b></span><span><i/> {en?"Other":"อื่นๆ"} <b>{units.length-available}</b></span></div></article>

            <article className={styles.panelWide}><div className={styles.panelHead}><div><small>{en?"PROJECT INVENTORY":"INVENTORY โครงการ"}</small><h3>{project?.name ?? "—"}</h3></div><span>{units.length} {en?"units":"ยูนิต"}</span></div>
              <div className={styles.unitGrid}>{units.length?units.map(unit=><Link href={`/${locale}/app/projects/${project?.id}/units/${unit.id}`} className={styles.unit} key={unit.id}><div><small>{unit.code}</small><b>{unit.name || unit.code}</b></div><span className={unit.status==="AVAILABLE"?styles.available:styles.other}>{unit.status}</span><strong>{unit.list_price!==null?`฿${fmt.format(Number(unit.list_price))}`:"—"}</strong></Link>):<div className={styles.empty}>{en?"No units yet":"ยังไม่มียูนิต"}</div>}</div>
            </article>

            <article className={styles.panel}><div className={styles.panelHead}><div><small>{en?"LAND BANK":"LAND BANK"}</small><h3>{en?"Plot summary":"สรุปแปลง"}</h3></div><b>{plots.length}</b></div><div className={styles.plotList}>{plots.map(plot=><div key={plot.id}><span>{plot.code}</span><b>{plot.land_area_sqm ? `${fmt.format(Number(plot.land_area_sqm))} m²` : "—"}</b></div>)}</div></article>

            <article className={styles.panel}><div className={styles.panelHead}><div><small>{en?"TODAY":"วันนี้"}</small><h3>{en?"Next actions":"งานที่ควรทำต่อ"}</h3></div></div><div className={styles.tasks}><label><input type="checkbox"/> {en?"Complete unit pricing":"กำหนดราคาขายยูนิต"}</label><label><input type="checkbox"/> {en?"Add project target date":"เพิ่มวันเป้าหมายโครงการ"}</label><label><input type="checkbox"/> {en?"Review plot information":"ตรวจข้อมูลแปลง"}</label></div></article>

            <article className={styles.panel}><div className={styles.panelHead}><div><small>{en?"ACCOUNT":"บัญชี"}</small><h3>{en?"Workspace":"Workspace"}</h3></div></div><p className={styles.muted}>{user.email}</p><form action={logout}><input type="hidden" name="locale" value={locale}/><button className={styles.signout}>{en?"Sign out":"ออกจากระบบ"}</button></form></article>
          </div>
        </div>
      </section>
    </main>
  );
}
