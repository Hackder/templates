export const bad = [
  <div style="color: red"></div>,
  <div style={"color: red"}></div>,
  <div style={`color: ${"red"}`}></div>,
];

export const good = [<div class="text-foreground"></div>];
