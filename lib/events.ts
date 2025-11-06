type CallbackEntry<Args extends any[]> = {
  callback: (...args: Args) => void;
  context: NonNullable<unknown>;
};

/*
export interface Events {
  triggerUpdate: () => void;
  onUpdate: (callback: CallbackEntry["callback"], context: CallbackEntry["context"]) => void;
  offUpdate: (ctx: CallbackEntry["context"]) => void;
}
*/

/**
 * Very basic events module that gets mixed into the Model and Collection classes. Since all we
 * care about is whether we want to re-render our react components, we don't actually even care
 * about event names, nor event arguments. On every trigger, we're going to fire all callbacks.
 * And when removing the listener, all we need is the context (which is the component).
 */
export default class Events<Args extends any[] = []> {
  _callbacks: CallbackEntry<Args>[] = [];

  triggerUpdate(...args: Args) {
    this._callbacks?.forEach(({ callback, context }) => callback.call(context, ...args));
  }

  onUpdate(callback: CallbackEntry<Args>["callback"], context: CallbackEntry<Args>["context"]) {
    this._callbacks = (this._callbacks || []).concat({ callback, context });
  }

  offUpdate(ctx: CallbackEntry<Args>["context"]) {
    this._callbacks = (this._callbacks || []).filter(({ context }) => context !== ctx);
  }
}
