import Link from "next/link";
import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
export default async function Finance({params}:{params:Promise<{locale:string,id:string}>}){
 const {locale:raw,id}=await params; const locale=raw==="en"?"en":"th";
 const s=await createClient(); const {data:{user}}=await s.auth.getUser(); if(!user)redirect("/"+locale+"/login");
 const {data:p}=await s.from("projects").select("id,code,name").eq("id",id).single();
 const {data:b}=await s.from("project_budgets").select("budget_amount,forecast_amount,cost_categories(code,name,category_type)").eq("project_id",id);
 const money=new Intl.NumberFormat(locale==="en"?"en-US":"th-TH",{maximumFractionDigits:0});
 const budget=(b??[]).reduce((n,x)=>n+Number(x.budget_amount||0),0),forecast=(b??[]).reduce((n,x)=>n+Number(x.forecast_amount||0),0);
 return <main style={{padding:40,maxWidth:1200,margin:"auto"}}><Link href={"/"+locale+"/app/projects/"+id}>← Project Workspace</Link><p>{p?.code}</p><h1>Project Financial Setup</h1><h2>{p?.name}</h2><section><b>Budget ฿{money.format(budget)}</b> · <b>Forecast ฿{money.format(forecast)}</b> · <b>Variance ฿{money.format(forecast-budget)}</b></section><hr/>{(b??[]).map((x:any,i)=><article key={i} style={{padding:"14px 0",borderBottom:"1px solid #e5e7eb"}}><small>{x.cost_categories?.category_type}</small><h3>{x.cost_categories?.name}</h3><span>Budget ฿{money.format(Number(x.budget_amount))} · Forecast ฿{money.format(Number(x.forecast_amount))}</span></article>)}</main>
}