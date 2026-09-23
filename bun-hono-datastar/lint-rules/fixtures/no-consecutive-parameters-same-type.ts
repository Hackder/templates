export function ok(min: number, max: number, label: string) {
  return `${label}${min}${max}`;
}

export function bad(a: number, b: number, c: number) {
  return a + b + c;
}

export function badLater(label: string, from: number, to: number) {
  return `${label}${from}${to}`;
}

export function okAliased(label: string, width: number, height: string) {
  return `${label}${width}${height}`;
}

export type Bad = (a: string, b: string, c: string) => void;

export function okThis(this: string, a: string, b: string) {
  return this + a + b;
}

export function badDefaults(label: string, from = 1, to = 2) {
  return `${label}${from}${to}`;
}
