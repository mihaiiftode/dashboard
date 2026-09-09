const CLASSES = [
  "bg-chip-1/15 text-chip-1 border-chip-1/30",
  "bg-chip-2/15 text-chip-2 border-chip-2/30",
  "bg-chip-3/15 text-chip-3 border-chip-3/30",
  "bg-chip-4/15 text-chip-4 border-chip-4/30",
  "bg-chip-5/15 text-chip-5 border-chip-5/30",
  "bg-chip-6/15 text-chip-6 border-chip-6/30",
  "bg-chip-7/15 text-chip-7 border-chip-7/30",
  "bg-chip-8/15 text-chip-8 border-chip-8/30",
]

export function chipClass(value: string): string {
  let h = 5381
  for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) | 0
  return CLASSES[Math.abs(h) % CLASSES.length]
}
