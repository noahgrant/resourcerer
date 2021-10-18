var eventSplitter = /\s+/;

// Iterates over the standard `event, callback` (as well as the fancy multiple
// space-separated events `"change blur", callback` and jQuery-style event
// maps `{event: callback}`).
var eventsApi = function(iteratee, events, name, callback, opts) {
  var i = 0,
      names;

  if (name && typeof name === 'object') {
    // Handle event maps.
    if (callback !== undefined && 'context' in opts && opts.context === undefined) {
      opts.context = callback;
    }

    for (names = Object.keys(name); i < names.length; i++) {
      events = eventsApi(iteratee, events, names[i], name[names[i]], opts);
    }
  } else if (name && eventSplitter.test(name)) {
    // Handle space-separated event names by delegating them individually.
    for (names = name.split(eventSplitter); i < names.length; i++) {
      events = iteratee(events, names[i], callback, opts);
    }
  } else {
    // Finally, standard events.
    events = iteratee(events, name, callback, opts);
  }

  return events;
};

// The reducing API that adds a callback to the `events` object.
var onApi = function(events, name, callback, options) {
  if (callback) {
    let handlers = events[name] || (events[name] = []);
    let context = options.context,
        ctx = options.ctx;

    handlers.push({callback, context, ctx: context || ctx});
  }

  return events;
};

// The reducing API that removes a callback from the `events` object.
var offApi = function(events, name, callback, options) {
  var {context} = options,
      i = 0,
      names;

  if (!events) {
    return;
  }

  names = name ? [name] : Object.keys(events);

  for (; i < names.length; i++) {
    let handlers;

    name = names[i];
    handlers = events[name];

    // Bail out if there are no events stored.
    if (!handlers) {
      break;
    }

    // Find any remaining events.
    let remaining = [];

    for (let j = 0; j < handlers.length; j++) {
      let handler = handlers[j];

      if (
        callback && callback !== handler.callback &&
          callback !== handler.callback._callback ||
            context && context !== handler.context
      ) {
        remaining.push(handler);
      }
    }

    // Replace events if there are any remaining.  Otherwise, clean up.
    if (remaining.length) {
      events[name] = remaining;
    } else {
      delete events[name];
    }
  }

  return events;
};

// Trigger one or many events, firing all bound callbacks. Callbacks are
// passed the same arguments as `trigger` is, apart from the event name
// (unless you're listening on `"all"`, which will cause your callback to
// receive the true name of the event as the first argument).

// Handles triggering the appropriate event callbacks.
function triggerApi(objEvents, name, callback, args) {
  if (objEvents) {
    let events = objEvents[name];
    let allEvents = objEvents.all;

    if (events && allEvents) {
      allEvents = allEvents.slice();
    }

    if (events) {
      triggerEvents(events, args);
    }

    if (allEvents) {
      triggerEvents(allEvents, [name].concat(args));
    }
  }

  return objEvents;
}

// A difficult-to-believe, but optimized internal dispatch function for
// triggering events. Tries to keep the usual cases speedy (most internal
// Schmackbone events have 3 arguments).
function triggerEvents(events, args) {
  var ev,
      i = -1,
      len = events.length,
      [a1, a2, a3] = args;

  /* eslint-disable */
  switch (args.length) {
    case 0: while (++i < len) (ev = events[i]).callback.call(ev.ctx); return;
    case 1: while (++i < len) (ev = events[i]).callback.call(ev.ctx, a1); return;
    case 2: while (++i < len) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
    case 3: while (++i < len) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
    default: while (++i < len) (ev = events[i]).callback.apply(ev.ctx, args); return;
  }
  /* eslint-enable */
}

const Events = {
  trigger(name, ...args) {
    if (!this._events) {
      return this;
    }

    eventsApi(triggerApi, this._events, name, undefined, args);

    return this;
  },

  // Bind an event to a `callback` function. Passing `"all"` will bind
  // the callback to all events fired.
  on(name, callback, context) {
    this._events = eventsApi(onApi, this._events || {}, name, callback, {
      context,
      ctx: this
    });

    return this;
  },

  // Remove one or many callbacks. If `context` is null, removes all
  // callbacks with that function. If `callback` is null, removes all
  // callbacks for the event. If `name` is null, removes all bound
  // callbacks for all events.
  off(name, callback, context) {
    if (!this._events) {
      return this;
    }

    this._events = eventsApi(offApi, this._events, name, callback, {context});

    return this;
  }
};

export default Events;
