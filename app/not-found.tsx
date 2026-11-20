import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card empty">
      <h1 className="page-title">That page is not on the desk</h1>
      <p className="muted">The address does not match an Under The Counter route.</p>
      <Link className="btn primary" href="/">Back to the overview</Link>
    </div>
  );
}
