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

  const [{ data: projects }, { data: profile }, { data: portfolioRows }, { data: financeRows }] = await Promise.all([
    supabase.from("projects").select("id,code,name,status,currency_code,target_completion_date").order("created_at").limit(20),
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.rpc("get_portfolio_dashboard"),
    supabase.from("financial_documents").select("project_id,document_type,amount,status,settled_amount").in("status",["APPROVED","POSTED"]).limit(1000),
  ]);
  const allProjects = projects ?? [];
  const project = allProjects[0];
  const [{ data: featuredPlots }, { data: featuredUnits }] = project ? await Promise.all([
    supabase.from("plots").select("id,code,land_area_sqm").eq("project_id",project.id).order("code").limit(100),
    supabase.from("units").select("id,code,name,status,list_price,currency_code").eq("project_id",project.id).order("code").limit(100),
  ]) : [{data:[]},{data:[]}];
  const portfolio = (portfolioRows?.[0] ?? null) as null | {total_projects:number|string|null;total_plots:number|string|null;total_units:number|string|null;available_units:number|string|null;sold_contracted_units:number|string|null;priced_units:number|string|null;listed_value:number|string|null};
  const projectPlots = featuredPlots ?? [];
  const projectUnits = featuredUnits ?? [];
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
  const finance=financeRows??[];
  const cashIn=finance.filter(x=>x.document_type==="RECEIPT"&&x.status==="POSTED").reduce((a,x)=>a+Number(x.amount||0),0);
  const cashOut=finance.filter(x=>x.document_type==="PAYMENT"&&x.status==="POSTED").reduce((a,x)=>a+Number(x.amount||0),0);
  const committed=finance.filter(x=>x.document_type==="COMMITMENT").reduce((a,x)=>a+Number(x.amount||0),0);
  const ap=finance.filter(x=>x.document_type==="AP").reduce((a,x)=>a+Math.max(0,Number(x.amount||0)-Number(x.settled_amount||0)),0);
  const ar=finance.filter(x=>x.document_type==="AR").reduce((a,x)=>a+Math.max(0,Number(x.amount||0)-Number(x.settled_amount||0)),0);
  const netCash=cashIn-cashOut;

  return (
    <main className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}><i>DP</i><div><b>DevPropertyPro</b><small>Build · Manage · Grow</small></div></div>
        <nav>{nav.map((item,i)=><a className={i===0?styles.active:""} key={item} href={i===0?`/${locale}/app`:i===1?`/${locale}/app/projects`:i===8?`/${locale}/app/finance`:"#"}><span>{["⌂","▦","◇","⌑","฿","◫","↗","♙","◉","⬡","▤","◌"][i]}</span>{item}</a>)}</nav>
        <div className={styles.sideFoot}><Link href={`/${locale}/app/settings/access`}>⚙ {en?"People & Access":"บุคลากรและสิทธิ์"}</Link><Link href={`/${locale}/design-system`}>◈ Design System</Link><span>DevPropertyPro v0.1</span></div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.search}>⌕ <span>{en ? "Search projects, units, customers…" : "ค้นหาโครงการ ยูนิต ลูกค้า…"}</span></div>
          <div className={styles.topActions}><Link href={en?"/th/app":"/en/app"}>{en?"TH":"EN"}</Link><button className={styles.iconButton}>♢</button><div className={styles.avatar}>{displayName.slice(0,1).toUpperCase()}</div><div className={styles.user}><b>{displayName}</b><small>{en?"Project Developer":"ผู้พัฒนาโครงการ"}</small></div></div>
        </header>

        <div className={styles.content}>
          <div className={styles.heading}><div><p>{en?"PORTFOLIO OVERVIEW":"ภาพรวมพอร์ตโครงการ"}</p><h1>{en?"Good morning":"สวัสดี"}, {displayName}</h1><span>{en?"Here’s what’s happening across your development portfolio.":"ภาพรวมสิ่งที่กำลังเกิดขึ้นในโครงการของคุณ"}</span></div><div className={styles.headingActions}><span>{new Intl.DateTimeFormat(en?"en-GB":"th-TH",{dateStyle:"medium"}).format(new Date())}</span><Link className={styles.newProject} href={`/${locale}/app/projects#new`}>＋ {en?"New Project":"โครงการใหม่"}</Link></div></div>

          <section className={styles.executiveStrip}><div><small>{en?"EXECUTIVE COMMAND CENTER":"ศูนย์บัญชาการผู้บริหาร"}</small><strong>{en?"Portfolio health at a glance":"สถานะธุรกิจที่ต้องรู้วันนี้"}</strong></div><span className={netCash>=0?styles.healthGood:styles.healthWarn}>{netCash>=0?(en?"CASH POSITION HEALTHY":"สถานะเงินสดปกติ"):(en?"CASH ATTENTION":"ควรตรวจสอบเงินสด")}</span></section>
          <div className={styles.metrics}>
            <article><small>{en?"PORTFOLIO SALES VALUE":"มูลค่าขายรวม"}</small><strong>{pricedCount?`฿${fmt.format(value)}`:"—"}</strong><em>{totalProjects} {en?"projects":"โครงการ"}</em></article>
            <article><small>{en?"NET CASH MOVEMENT":"กระแสเงินสดสุทธิ"}</small><strong>{`฿${fmt.format(netCash)}`}</strong><em>{en?"Receipts less payments":"รับจริงหักจ่ายจริง"}</em></article>
            <article><small>{en?"COMMITTED COST":"ภาระผูกพัน"}</small><strong>{`฿${fmt.format(committed)}`}</strong><em>{en?"Approved commitments":"Commitment ที่อนุมัติแล้ว"}</em></article>
            <article><small>{en?"AP OUTSTANDING":"เจ้าหนี้คงค้าง"}</small><strong>{`฿${fmt.format(ap)}`}</strong><em>{en?"Requires cash planning":"ต้องวางแผนการจ่าย"}</em></article>
            <article><small>{en?"AR OUTSTANDING":"ลูกหนี้คงค้าง"}</small><strong>{`฿${fmt.format(ar)}`}</strong><em>{en?"Expected collection":"ยอดรอเรียกเก็บ"}</em></article>
          </div>
          <section className={styles.managementRow}><article><small>{en?"CASH CONTROL":"การควบคุมเงินสด"}</small><h3>{en?"Cash movement":"กระแสเงินสด"}</h3><div className={styles.moneyPair}><div><span>{en?"CASH IN":"เงินเข้า"}</span><b>฿{fmt.format(cashIn)}</b></div><div><span>{en?"CASH OUT":"เงินออก"}</span><b>฿{fmt.format(cashOut)}</b></div></div><Link href={`/${locale}/app/finance`}>{en?"Open Finance Center →":"เปิด Finance Center →"}</Link></article><article><small>{en?"PORTFOLIO CONTROL":"การควบคุมพอร์ต"}</small><h3>{en?"Development pipeline":"ภาพรวมโครงการ"}</h3><div className={styles.moneyPair}><div><span>{en?"PROJECTS":"โครงการ"}</span><b>{totalProjects}</b></div><div><span>{en?"UNITS":"ยูนิต"}</span><b>{totalUnits}</b></div></div><Link href={`/${locale}/app/projects`}>{en?"Review projects →":"ดูทุกโครงการ →"}</Link></article><article><small>{en?"MANAGEMENT ATTENTION":"รายการที่ต้องจับตา"}</small><h3>{en?"Decision queue":"สิ่งที่ต้องตัดสินใจ"}</h3><div className={styles.alertLine}><span>{ap>0?"!":"✓"}</span><div><b>{ap>0?(en?"Outstanding payables":"มีเจ้าหนี้คงค้าง"):(en?"No AP pressure":"ไม่มี AP คงค้าง")}</b><small>{ap>0?`฿${fmt.format(ap)}`:(en?"Cash obligations clear":"ภาระเงินสดปกติ")}</small></div></div><div className={styles.alertLine}><span>•</span><div><b>{portfolioAvailable} {en?"units available":"ยูนิตพร้อมขาย"}</b><small>{en?"Inventory requiring sales attention":"Inventory ที่ฝ่ายขายต้องติดตาม"}</small></div></div></article></section>
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
