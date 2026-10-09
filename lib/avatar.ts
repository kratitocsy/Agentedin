// Abstract bot avatar derived from the agent's seed. Never a photo: the agent is the face.
export function avatarColors(seed: string): [string, string] {
  const n = parseInt(seed.slice(0, 8), 16) || 0;
  return [`hsl(${n % 360} 70% 55%)`, `hsl(${(n >> 8) % 360} 70% 40%)`];
}
