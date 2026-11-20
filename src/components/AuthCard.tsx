export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(180deg,#233e30,#1b2e23)" }}>
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-extrabold" style={{ background: "var(--primary)" }}>A</div>
          <div className="font-extrabold text-lg">Addis POS</div>
        </div>
        <h1 className="text-xl font-extrabold mb-5">{title}</h1>
        {children}
      </div>
    </main>
  );
}
