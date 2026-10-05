const labels = {
  th: {
    eyebrow: "PROPERTY DEVELOPMENT OS",
    title: "ระบบบริหารโครงการพัฒนาอสังหาริมทรัพย์",
    description:
      "ศูนย์กลางสำหรับโครงการ ยูนิต ลูกค้า งานออกแบบ การก่อสร้าง การเงิน เอกสาร และการส่งมอบ",
    status: "Release 0 · Foundation",
    next: "กำลังเตรียม Project 001",
  },
  en: {
    eyebrow: "PROPERTY DEVELOPMENT OS",
    title: "Property Development Management Platform",
    description:
      "One controlled source of truth for projects, units, customers, design, construction, finance, documents and handover.",
    status: "Release 0 · Foundation",
    next: "Preparing Project 001",
  },
};

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <div className="language">TH / EN</div>
        <p className="eyebrow">{labels.th.eyebrow}</p>
        <h1>{labels.th.title}</h1>
        <p className="lead">{labels.th.description}</p>
        <div className="status">
          <span>{labels.th.status}</span>
          <strong>{labels.th.next}</strong>
        </div>
        <div className="divider" />
        <h2>{labels.en.title}</h2>
        <p className="secondary">{labels.en.description}</p>
      </section>
    </main>
  );
}
