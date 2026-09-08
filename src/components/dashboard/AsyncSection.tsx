"use client";

import type { ReactNode } from "react";
import { ErrorState } from "@/components/ui/LoadingState";
import { SkeletonBlock } from "@/components/ui/LoadingState";

/**
 * Wraps one dashboard widget's own load/error/empty lifecycle so a failure
 * or slow response in one source never blocks the others — each section
 * gets its own skeleton (stable height, no layout jump), its own error +
 * "Try again", and only reaches `children` once real data exists.
 */
export function AsyncSection<T>({
  loading,
  error,
  data,
  onRetry,
  skeletonRows = 4,
  children,
}: {
  loading: boolean;
  error: Error | null;
  data: T | null;
  onRetry: () => void;
  skeletonRows?: number;
  children: (data: T) => ReactNode;
}) {
  if (error) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (loading && data === null) return <SkeletonBlock rows={skeletonRows} />;
  if (data === null) return null;
  return <>{children(data)}</>;
}
