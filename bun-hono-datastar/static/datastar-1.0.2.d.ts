// Hand-written types for the vendored Datastar browser bundle. Datastar ships
// no types package for the standalone `datastar.js` build, so this shim exists
// instead of an `@types/*` dependency. It covers only the surface the scripts in
// this directory actually use — extend it when you reach for more of the API.

/** Signal root. Reading a key subscribes; assigning patches the signal. */
export const root: Record<string, unknown>;

export interface AttributeContext {
  /** The attribute's raw value, e.g. `/hot-reload` for `data-hotreload="/hot-reload"`. */
  value: string;
  /** Modifiers written after the attribute name, e.g. `data-push-url__ifdifferent`. */
  mods: Map<string, Set<string>>;
  /** The element carrying the attribute. */
  el: Element;
}

export interface AttributePlugin {
  name: string;
  /**
   * Whether the attribute takes a `key` (`data-name-key`) and a `value`.
   * `must` requires it, `denied` rejects it, `should` allows either.
   */
  requirement?: {
    key: "must" | "denied" | "should";
    value: "must" | "denied" | "should";
  };
  apply: (context: AttributeContext) => void | (() => void);
}

/** Registers a custom `data-*` attribute plugin. */
export function attribute(plugin: AttributePlugin): void;

/** What an action gets from the expression that called it. */
export interface ActionContext {
  /** The element whose attribute holds the expression. */
  el: Element;
  /** The event that ran the expression, for `data-on:*` handlers. */
  evt?: Event;
}

export interface ActionPlugin {
  name: string;
  /**
   * Called as `@name(...args)` from a Datastar expression. The first parameter
   * is Datastar's runtime context; the rest are the expression's arguments.
   */
  apply: (context: ActionContext, ...args: any[]) => unknown;
}

/** Registers a custom `@action()` usable in Datastar expressions. */
export function action(plugin: ActionPlugin): void;

/**
 * The registered actions by name, both Datastar's own (`post`, `get`, ...) and
 * those added with {@link action}, so one action can call another.
 */
export const actions: Record<
  string,
  ((context: ActionContext, ...args: any[]) => unknown) | undefined
>;
