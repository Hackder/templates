declare const a: boolean, b: boolean, c: boolean, d: boolean;
declare const n: number, s: string, m: boolean | undefined;
declare function check(): boolean;

// allowed
if (a && b && c && !d) {
  check();
}
if (a || b || s === "" || n > 0) {
  check();
}
if (!(a && b) && c) {
  check();
}
if (!(a && b && c)) {
  check();
}
if (m ?? b ?? c) {
  check();
}
// flagged
if ((a && b) || c) {
  check();
}
if (a && (b || c)) {
  check();
}
if (a && !(b || c)) {
  check();
}
if (!((a && b) || c)) {
  check();
}
if (a && b && (c || d)) {
  check();
}
if ((m ?? b) || c) {
  check();
}
const chained = a && b && !c;
const mixed = a && (b || c);
const negatedMixed = !((a && b) || c);
