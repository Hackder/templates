export function Bad() {
  return <i class="ph ph-star" />;
}

export function BadTemplate(size: string) {
  return <i class={`ph-bold ph-star ${size}`} />;
}

export function BadTernary(active: boolean) {
  return <i class={active ? "ph-fill ph-star" : "other"} />;
}

export function Ok() {
  return <i class="phone" />;
}
