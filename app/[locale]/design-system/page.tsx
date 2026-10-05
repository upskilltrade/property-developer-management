"use client";

import { useState } from "react";
import styles from "./design-system.module.css";

const tokens = [
  ["Primary", "#F4B400"], ["Charcoal", "#202124"], ["Canvas", "#F6F7F9"],
  ["Surface", "#FFFFFF"], ["Success", "#22A06B"], ["Info", "#3B82F6"],
  ["Warning", "#F59E0B"], ["Danger", "#DC4C4C"],
];

export default function DesignSystemPage() {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(false);
  const [loading, setLoading] = useState(false);

  const simulateSave = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setToast(true); setTimeout(() => setToast(false), 2600); }, 900);
  };

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div><span className={styles.brand}>DevPropertyPro</span><span className={styles.version}>MASTER UI · v1.0</span></div>
        <h1>Design System</h1>
        <p>Build · Manage · Grow — มาตรฐานกลางสำหรับทุกหน้าของระบบ</p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>01</span><h2>Foundation</h2></div><p>Warm Modern · สดใส · มืออาชีพ · ใช้งานได้นาน</p></div>
        <div className={styles.tokens}>{tokens.map(([name,hex]) => <article className={styles.token} key={name}><i style={{background:hex}}/><b>{name}</b><code>{hex}</code></article>)}</div>
        <div className={styles.typeGrid}><div><small>DISPLAY / 40</small><h3>Property development, clearly managed.</h3></div><div><small>BODY / 15</small><p>ออกแบบเพื่อข้อมูลจำนวนมาก โดยยังคงลำดับสายตาและพื้นที่หายใจที่ดี</p></div></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>02</span><h2>Actions</h2></div><p>ทุก action ต้องมี hover, focus, disabled และ loading</p></div>
        <div className={styles.row}>
          <button className={styles.primary} onClick={simulateSave} disabled={loading}>{loading ? "Saving…" : "+ New Project"}</button>
          <button className={styles.secondary} onClick={() => setModal(true)}>Open modal</button>
          <button className={styles.ghost} onClick={() => setDrawer(true)}>Open drawer →</button>
          <button className={styles.danger}>Delete</button>
          <button className={styles.secondary} disabled>Disabled</button>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>03</span><h2>Forms & status</h2></div><p>44px minimum controls · focus ring ชัดเจน</p></div>
        <div className={styles.formGrid}>
          <label>Project name<input defaultValue="Monteva Hua Hin" /></label>
          <label>Status<select defaultValue="active"><option value="active">Active</option><option>Planning</option></select></label>
          <label>Search<input placeholder="Search projects…" /></label>
        </div>
        <div className={styles.row}><span className={styles.success}>Active</span><span className={styles.warning}>Pending</span><span className={styles.info}>Reserved</span><span className={styles.error}>Overdue</span></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>04</span><h2>Cards & data</h2></div><p>Card radius 16 · subtle border · restrained shadow</p></div>
        <div className={styles.kpis}>
          <article><small>PROJECT VALUE</small><strong>฿345M</strong><em>↑ 12%</em></article>
          <article><small>UNITS SOLD</small><strong>15 / 27</strong><em>56%</em></article>
          <article><small>CONSTRUCTION</small><strong>68%</strong><div className={styles.progress}><i style={{width:"68%"}}/></div></article>
        </div>
        <div className={styles.tableWrap}><table><thead><tr><th>Project</th><th>Status</th><th>Progress</th><th>Value</th></tr></thead><tbody>
          <tr><td><b>Monteva Hua Hin</b><small>Residential</small></td><td><span className={styles.success}>Active</span></td><td>68%</td><td>฿62.9M</td></tr>
          <tr><td><b>The Valley Residence</b><small>Residential</small></td><td><span className={styles.warning}>Planning</span></td><td>32%</td><td>฿84.0M</td></tr>
        </tbody></table></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}><div><span>05</span><h2>Loading & empty states</h2></div><p>ให้ feedback ทันที ไม่ปล่อยหน้าจอนิ่ง</p></div>
        <div className={styles.states}><div className={styles.skeleton}><i/><i/><i/></div><div className={styles.empty}><b>ยังไม่มีข้อมูล</b><p>สร้างรายการแรกเพื่อเริ่มต้น</p><button className={styles.secondary}>Create item</button></div></div>
      </section>

      {modal && <div className={styles.overlay} onMouseDown={() => setModal(false)}><div className={styles.modal} onMouseDown={e=>e.stopPropagation()}><span className={styles.eyebrow}>CONFIRM ACTION</span><h2>สร้างโครงการใหม่?</h2><p>ตัวอย่าง Modal มาตรฐานสำหรับ action ที่ต้องการการยืนยัน</p><div className={styles.row}><button className={styles.primary} onClick={()=>{setModal(false);setToast(true)}}>Confirm</button><button className={styles.secondary} onClick={()=>setModal(false)}>Cancel</button></div></div></div>}
      <aside className={drawer ? styles.drawerOpen : styles.drawer}><button className={styles.close} onClick={()=>setDrawer(false)}>×</button><span className={styles.eyebrow}>QUICK PANEL</span><h2>Project details</h2><p>Drawer ใช้กับรายละเอียดหรือฟอร์มที่ไม่ควรพาผู้ใช้ออกจาก context เดิม</p></aside>
      {toast && <div className={styles.toast}><b>✓ Saved successfully</b><span>การเปลี่ยนแปลงถูกบันทึกแล้ว</span></div>}
    </main>
  );
}
