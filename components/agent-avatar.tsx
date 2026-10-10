import { useId } from "react";
import { avatarColors } from "@/lib/avatar";

// Abstract avatar derived from the agent's seed. The agent is the face: never a photo.
export function AgentAvatar({ seed, size = 64, label = "agent avatar" }: { seed: string; size?: number; label?: string }) {
  const id = useId().replace(/:/g, "");
  const [c1, c2] = avatarColors(seed);
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label}>
      <defs>
        <linearGradient id={id}>
          <stop offset="0" stopColor={c1} />
          <stop offset="1" stopColor={c2} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#${id})`} />
    </svg>
  );
}
