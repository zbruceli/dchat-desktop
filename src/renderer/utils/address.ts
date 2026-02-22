/** Truncate an NKN address for display */
export function truncateAddress(addr: string, prefixLen = 8, suffixLen = 6): string {
  if (addr.length <= prefixLen + suffixLen + 3) return addr;
  return addr.substring(0, prefixLen) + "..." + addr.substring(addr.length - suffixLen);
}

/** Generate a consistent color class from a string (for avatar backgrounds) */
export function stringToColor(str: string): string {
  const colors = [
    "bg-blue-700", "bg-emerald-700", "bg-purple-700", "bg-amber-700",
    "bg-rose-700", "bg-cyan-700", "bg-indigo-700", "bg-teal-700",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
