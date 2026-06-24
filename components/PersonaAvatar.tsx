"use client";

import { useState } from "react";

interface PersonaAvatarProps {
  personaId: string;
  hasProfileImage: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-6 h-6",
  md: "w-10 h-10 md:w-11 md:h-11",
  lg: "w-16 h-16",
};

function DefaultAvatarSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} style={{ backgroundColor: "#c8d6df" }}>
      <ellipse cx="20" cy="16" rx="8" ry="9" fill="#a0b4c0" />
      <ellipse cx="20" cy="38" rx="14" ry="12" fill="#a0b4c0" />
    </svg>
  );
}

export { DefaultAvatarSvg };

export default function PersonaAvatar({
  personaId,
  hasProfileImage,
  size = "md",
  className = "",
}: PersonaAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = sizeClasses[size];
  const baseClass = `${sizeClass} rounded-md flex-shrink-0 ${className}`;

  if (!hasProfileImage || imgError) {
    return <DefaultAvatarSvg className={baseClass} />;
  }

  return (
    <img
      src={`/api/personas/${personaId}/image`}
      alt=""
      className={`${baseClass} object-cover`}
      onError={() => setImgError(true)}
    />
  );
}
