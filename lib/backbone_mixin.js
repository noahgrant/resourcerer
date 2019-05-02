import _ from 'underscore';
import Backbone from 'backbone';
import {mixin} from './utils';

/**
 * This mixin force updates a React component when its associated Backbone models
 * (or collections) change. This is required because React doesn't know about
 * Backbone models the way it does about its own internal state.
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
 * such as "change", "sync", and "destroy". These event handlers are removed on
 * unmount.
 *
 * The best way to use this in conjunction with GlobalState#fetch, which returns
 * a promise instead of an un-fetched Backbone model (the way GlobalState#get
 * does) is to initialize your models in the component's constructor or cWM
 * method, and when the promise resolves, use Model#set or Collection#reset to
 * attach your models while still listening on their events:
 *
 *   @backboneMixin
 *   class MyComponent extends React.Component {
 *     componentWillMount() {
 *       Promise.all([
 *         GlobalState.fetch('myModel', MyModel)
 *         GlobalState.fetch('myCollection', MyCollection)
 *       ]).then((values) => {
 *         [this.myModel, this.myCollection] = values;
 *         this._attachModelListeners();
 *       });
 *   }
 *
 * It'd be really nice if we could rely on cDM to auto-attach the listeners as
 * in the non-promise case, but I can't think of a way to do that.
 *
 * Hence, we use `cDM` here for the components that don't use fetch (or maybe
 * don't use GlobalState at all, as in the SignalModal or WorkflowRoute
 * components), and the manual _attachModelListeners for those that do.
 *
 * Note that this will help us phase out the original BackboneMixin, which is
 * used similarly, but on the ES5 React factory instead of classes.
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

    // whenever there may be a change in the Backbone data, trigger a React update.
    modelsToAttach.forEach((model) =>
      model.on('change sync destroy', onModelEvent, this));

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
  return _.filter(
    component,
    (property) => property instanceof Backbone.Model || property instanceof Backbone.Collection
  );
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
  (this._attachedModels || []).forEach((model) =>
    model.off('change sync destroy', onModelEvent, this));
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
  return _.isFunction(component._getBackboneModels) ?
    component._getBackboneModels() :
    detectBackboneModels(component);
}

function onModelEvent() {
  this.forceUpdate();
}
