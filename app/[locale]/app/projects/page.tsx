import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createProject, updateProject } from "./actions";
import styles from "./projects.module.css";

export default async function ProjectsPage({params,searchParams}:{params:Promise<{locale:string}>,searchParams:Promise<Record<string,string|undefined>>}) {
 const {locale:raw}=await params; const locale=raw==="en"?"en":"th"; const en=locale==="en"; const query=await searchParams;
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect(`/${locale}/login`);
 const {data:projects}=await supabase.from("projects").select("id,code,name,status,currency_code,target_completion_date,plots(id),units(id,status,list_price)").order("created_at");
 const rows=projects??[];
 return <main className={styles.page}>
   <header className={styles.top}><div><Link href={`/${locale}/app`}>← {en?"Dashboard":"แดชบอร์ด"}</Link><p>DEVPROPERTYPRO · PROJECTS</p><h1>{en?"Projects":"โครงการ"}</h1><span>{en?"Create and manage every development from one workspace.":"สร้างและบริหารทุกโครงการจาก Workspace เดียว"}</span></div><a className={styles.newButton} href="#new">＋ {en?"New Project":"สร้างโครงการ"}</a></header>
   {(query.created||query.updated)&&<div className={styles.success}>✓ {query.created?(en?"Project created successfully":"สร้างโครงการเรียบร้อย"):(en?"Project updated successfully":"บันทึกการแก้ไขแล้ว")}</div>}
   {query.error&&<div className={styles.error}>! {en?"The action could not be completed. Check your permission or data.":"ดำเนินการไม่สำเร็จ กรุณาตรวจสอบข้อมูลหรือสิทธิ์ของบัญชี"}</div>}
   <section className={styles.stats}><article><small>{en?"TOTAL PROJECTS":"โครงการทั้งหมด"}</small><b>{rows.length}</b></article><article><small>{en?"ACTIVE":"กำลังดำเนินการ"}</small><b>{rows.filter(p=>p.status==="ACTIVE").length}</b></article><article><small>{en?"TOTAL UNITS":"ยูนิตทั้งหมด"}</small><b>{rows.reduce((n,p)=>n+(p.units?.length??0),0)}</b></article><article><small>{en?"TOTAL PLOTS":"แปลงทั้งหมด"}</small><b>{rows.reduce((n,p)=>n+(p.plots?.length??0),0)}</b></article></section>
   <section className={styles.list}>
    <div className={styles.listHead}><div><small>PORTFOLIO</small><h2>{en?"All projects":"โครงการทั้งหมด"}</h2></div><span>{rows.length} {en?"projects":"โครงการ"}</span></div>
    {rows.map(p=>{const available=p.units?.filter(u=>u.status==="AVAILABLE").length??0; return <details className={styles.project} key={p.id}>
      <summary><div className={styles.mark}>{p.code.slice(0,2)}</div><div className={styles.identity}><small>{p.code}</small><b>{p.name}</b></div><span className={styles.badge}>{p.status}</span><div className={styles.mini}><span>{p.plots?.length??0}<small>{en?"Plots":"แปลง"}</small></span><span>{p.units?.length??0}<small>{en?"Units":"ยูนิต"}</small></span><span>{available}<small>{en?"Available":"ว่าง"}</small></span></div><i>⌄</i></summary>
      <form action={updateProject} className={styles.form}><input type="hidden" name="locale" value={locale}/><input type="hidden" name="id" value={p.id}/>
       <label>{en?"Project code":"รหัสโครงการ"}<input name="code" defaultValue={p.code} required/></label>
       <label>{en?"Project name":"ชื่อโครงการ"}<input name="name" defaultValue={p.name} required/></label>
       <label>{en?"Status":"สถานะ"}<select name="status" defaultValue={p.status}>{["PLANNING","ACTIVE","ON_HOLD","COMPLETED","ARCHIVED"].map(s=><option key={s}>{s}</option>)}</select></label>
       <label>{en?"Target completion":"กำหนดแล้วเสร็จ"}<input type="date" name="target_completion_date" defaultValue={p.target_completion_date??""}/></label>
       <div className={styles.formActions}><button type="submit">{en?"Save changes":"บันทึกการแก้ไข"}</button></div>
      </form>
    </details>})}
    {!rows.length&&<div className={styles.empty}>{en?"No projects yet. Create your first project below.":"ยังไม่มีโครงการ สร้างโครงการแรกได้ด้านล่าง"}</div>}
   </section>
   <section id="new" className={styles.create}><div><small>NEW DEVELOPMENT</small><h2>{en?"Create a project":"สร้างโครงการใหม่"}</h2><p>{en?"Start with the core project information. Plots, phases and units can be added next.":"เริ่มจากข้อมูลหลักของโครงการ แล้วค่อยเพิ่ม Phase, Plot และ Unit ในขั้นต่อไป"}</p></div>
    <form action={createProject} className={styles.form}><input type="hidden" name="locale" value={locale}/>
      <label>{en?"Project code":"รหัสโครงการ"}<input name="code" placeholder="PROJECT-002" required/></label>
      <label>{en?"Project name":"ชื่อโครงการ"}<input name="name" placeholder={en?"Project name":"ชื่อโครงการ"} required/></label>
      <label>{en?"Status":"สถานะ"}<select name="status" defaultValue="PLANNING"><option>PLANNING</option><option>ACTIVE</option><option>ON_HOLD</option></select></label>
      <label>{en?"Target completion":"กำหนดแล้วเสร็จ"}<input type="date" name="target_completion_date"/></label>
      <div className={styles.formActions}><button type="submit">＋ {en?"Create Project":"สร้างโครงการ"}</button></div>
    </form>
   </section>
 </main>
}
