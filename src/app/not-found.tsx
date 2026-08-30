import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-full min-h-[70vh] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-5xl font-black text-kvm-yellow-dark">404</div>
      <h1 className="text-lg font-bold text-kvm-ink">Page not found</h1>
      <p className="max-w-sm text-sm text-gray-500">
        The page you&apos;re looking for doesn&apos;t exist in the Scouting Hub.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-sm bg-kvm-red px-4 py-2 text-sm font-semibold text-white"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
