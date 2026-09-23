export function ok(enabled: boolean, label: string) {
  return `${label}${enabled}`;
}

export function bad(enabled: boolean, label: string, visible: boolean) {
  return `${label}${enabled}${visible}`;
}

export function badOptional(enabled: boolean, visible?: boolean) {
  return enabled && visible;
}

export function badNullable(enabled: boolean, visible: boolean | undefined) {
  return enabled && visible;
}

export function badDefault(enabled: boolean, visible = false) {
  return enabled && visible;
}

export function badLiteral(enabled: true, visible: false) {
  return enabled && visible;
}

export type Bad = { run(enabled: boolean, visible: boolean): void };
