import { LiveError, LivePreview, LiveProvider } from "react-live";
import {
  Box,
  ContactShadows,
  Environment,
  Float,
  MeshDistortMaterial,
  MeshTransmissionMaterial,
  OrbitControls,
  PerspectiveCamera,
  Sphere,
  Stars,
  Text,
} from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as React from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

/**
 * Globals available to model-generated TSX (no import statements).
 * Executes in the host JS context — same tradeoff as typical live code playgrounds.
 */
const r3fScope = {
  React,
  Canvas,
  useFrame,
  useThree,
  THREE,
  OrbitControls,
  Environment,
  Float,
  Text,
  ContactShadows,
  MeshDistortMaterial,
  Sphere,
  Box,
  PerspectiveCamera,
  MeshTransmissionMaterial,
  Stars,
};

function sanitizeLiveCode(code: string): string {
  const dropReExportOrList = /^\s*export\s*[{*]/u;
  /** `export type { ... }` lists are not covered by stripNamedDecl; dropping avoids invalid `type {`. */
  const dropTypeExportList = /^\s*export\s+type\s*\{/u;
  const stripNamedDecl = /^\s*export\s+(const|let|var|function|class|type|interface)\b/u;

  const body = code
    .split("\n")
    .filter((line) => !/^\s*import\s/u.test(line))
    .map((line) => {
      if (dropReExportOrList.test(line)) return null;
      if (dropTypeExportList.test(line)) return null;
      if (stripNamedDecl.test(line)) {
        return line.replace(/^\s*export\s+/u, "");
      }
      return line;
    })
    .filter((line): line is string => line !== null)
    .join("\n");

  return body.replace(/^\s*export\s+default\s+/mu, "").trim();
}

type R3fLivePreviewProps = {
  code: string;
  className?: string;
};

export function R3fLivePreview({ code, className }: R3fLivePreviewProps) {
  const sanitized = sanitizeLiveCode(code);
  return (
    <div
      className={cn(
        "my-2 w-full min-w-0 rounded-md border border-slate-200 bg-neutral-950",
        className,
      )}
    >
      <LiveProvider code={sanitized} scope={r3fScope} language="tsx" enableTypeScript>
        <div className="flex h-150 w-full min-h-[24rem] flex-col">
          <LivePreview className="h-full min-h-[24rem] w-full flex-1 [&>div]:h-full [&>div]:w-full" />
          <LiveError className="m-0 rounded-b-md bg-red-950 px-3 py-2 font-mono text-xs whitespace-pre-wrap text-red-100" />
        </div>
      </LiveProvider>
    </div>
  );
}
