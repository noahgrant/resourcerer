export default {
  triggerUpdate() {
    this._events?.forEach((event) => event.callback.call(event.context));
  },

  onUpdate(callback, context) {
    this._events = (this._events || []).concat({callback, context});
  },

  offUpdate(ctx) {
    this._events = (this._events || []).filter(({context}) => context !== ctx);
  }
};
