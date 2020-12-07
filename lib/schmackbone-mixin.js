import {Collection, Model} from 'schmackbone';
import {mixin} from './utils';

/**
 * This mixin force updates a React component when its associated Backbone models
 * (or collections) change. This single bridge is required because React doesn't
 * know about Backbone model state the way it does about its the state of its
 * components. By taking advantage of the fact that a model knows when it
 * changes and that we can link updates to Backbone's Event system, we can both
 * de-normalize our data (keeping it on the model instead of setting resource
 * responses at React state) and avoid making deep compares to know when a model
 * has changed. This also avoids the need for another library like ImmutableJS
 * to get around such deep compares.
 *
 * Backbone models can be associated with a component in one of two ways:
 *   1. Define a _getBackboneModels method on the component. This should return an
 *      array of models or collections that this mixin should know about.
 *   2. Define your models and collections as properties of the component in
 *      componentWillMount. These will be automatically detected and used by the
 *      mixin. This method is only used in the absence of a _getBackboneModels method
 *      on the component.
 *
 * Model changes are detected by listening for events triggered on the models
 * such as 'change', 'sync', and 'destroy'. These event handlers are removed on
 * unmount.
 *
 * Note that a component can also specify the context within which each
 * `forceUpdate` should be called by the `schmackboneContext` property. This allows
 * withResources to specify the `dataChild` component as the context, which will
 * update a component that may be defined as a PureComponent. By default, the
 * listeners are attached to the component on which backboneMixin is defined,
 * which would be the `dataCarrier` component for withResources. In that case,
 * the dataCarrier would update, but its PureComponent child would not.
 *
 * Use this in conjuction with `withResources` by adding a `listen: true` option
 * to a resource's config.
 */
export default mixin({
  componentDidMount() {
    this._attachModelListeners();
  },

  componentWillUnmount() {
    _unattachModelListeners.call(this);
  },

  _attachModelListeners() {
    var modelsToAttach = _getBackboneModels(this);

    // unattach any previously-attached listeners first
    _unattachModelListeners.call(this);

    // whenever there may be a change in the Backbone data, trigger a React
    // update. default component to force update is the component that
    // backboneMixin is applied to, but can be overridden by specifying a
    // `schmackboneContext` property.
    modelsToAttach.forEach((model) => model.on(
      'change sync destroy update reset',
      onModelEvent,
      this.schmackboneContext || this
    ));

    this._attachedModels = modelsToAttach;
  }
});

/**
 * Given a React component instance, return all properties of that component
 * which are instances of Backbone.Collection or Backbone.Model.
 *
 * @param {React.Component} Component to which to find Backbone models or
 *    collections as instance properties
 * @return {[Backbone.Model || Backbone.Collection]}
 */
function detectBackboneModels(component) {
  return Object.values(component).filter((value) =>
    value instanceof Model ||
    value instanceof Collection);
}

/**
 * Removes all backbone model event listeners from a component. This happens
 * automatically on componentWillUnmount, but also before any listeners are
 * manually attached.
 *
 * Making this private since no component should ever need to call this directly
 * the way they might need to call _attachModelListeners.
 */
function _unattachModelListeners() {
  // Ensure that we clean up any dangling references when the component is
  // destroyed.
  (this._attachedModels || []).forEach((model) => model.off(
    'change sync destroy update reset',
    onModelEvent,
    this.schmackboneContext || this
  ));
  this._attachedModels = null;
}

/**
 * Definitive source of Backbone models to be associated with the component for
 * use in the mixin. Uses the _getBackboneModels method if it's defined on the component.
 * Otherwise, models are detected by the mixin using detectBackboneModels.
 *
 * @param {React.Component} Component on which to call the `_getBackboneModels`
 *    method or from which to find models and collections as instance properties
 * @return {[Backbone.Model || Backbone.Collection]}
 */
function _getBackboneModels(component) {
  return typeof component._getBackboneModels === 'function' ?
    component._getBackboneModels() :
    detectBackboneModels(component);
}

function onModelEvent() {
  this.forceUpdate();
}
