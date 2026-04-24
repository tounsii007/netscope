import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <div className="text-7xl font-bold text-brand">404</div>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-fg-muted">The page you're looking for doesn't exist.</p>
      <Link href="/" className="btn mt-6">Back home</Link>
    </div>
  );
}
