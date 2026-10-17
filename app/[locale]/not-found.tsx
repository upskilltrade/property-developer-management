import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <p className="font-mono text-sm text-muted">404</p>
        <h1 className="mt-1 text-xl font-semibold">Not found · ไม่พบหน้าที่ต้องการ</h1>
        <Link
          href="/th/workspace"
          className="mt-4 inline-block text-[13px] font-medium text-brand hover:underline"
        >
          ← DevPropertyPro
        </Link>
      </div>
    </main>
  );
}
