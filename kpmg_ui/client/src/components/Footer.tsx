export default function Footer() {
  return (
    <footer
      className="flex flex-wrap items-center justify-between gap-3 px-8 md:px-12 py-5"
      style={{ background: "#000000" }}
    >
      <div>
        <div
          className="font-extrabold text-[14px]"
          style={{ color: "rgba(255,255,255,0.6)", fontFamily: "Arial, sans-serif", letterSpacing: "0.2px" }}
        >
          KPMG TRACE
        </div>
        <div
          className="text-[11px] mt-0.5"
          style={{ color: "rgba(255,255,255,0.28)" }}
        >
          © 2026 KPMG LLP, a UK limited liability partnership and a member firm of the KPMG global organisation.
        </div>
      </div>
      <span
        className="text-[11px] font-medium uppercase tracking-[0.5px] rounded-full px-3 py-1"
        style={{
          color: "rgba(255,255,255,0.22)",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        Confidential
      </span>
    </footer>
  );
}
