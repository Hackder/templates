import type { JSX } from "hono/jsx/jsx-runtime";
import type { PhosphorIconKinds } from "./iconsets/phosphor-icons";

export type IconKind = PhosphorIconKinds;

export type IconProps = {
  icon: IconKind;
  children?: JSX.Element;
  class?: string;
} & Omit<JSX.IntrinsicElements["i"], "class">;

export function Icon({ icon, children, class: className, ...rest }: IconProps) {
  return (
    // The wrapper is the one intentional owner of raw Phosphor classes.
    // oxlint-disable-next-line local/no-direct-phosphor-icons
    <i class={`ph-bold ph-${icon} ${className ?? ""}`} {...rest}>
      {children}
    </i>
  );
}
