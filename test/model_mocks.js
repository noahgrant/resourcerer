import Backbone from 'backbone';

export const UserModel = Backbone.Model.extend({
  initialize(attrs, options={}) {
    this.userId = options.userId;
  },

  url() {
    return `/root/users/${this.userId}`;
  }
}, {cacheFields: ['userId']});

export const AnalystsCollection = Backbone.Collection.extend({
  url() {
    return '/root/analysts';
  }
});

export const DecisionsCollection = Backbone.Collection.extend({
  url() {
    return '/root/decisions';
  }
}, {cacheFields: ['include_deleted']});

export const NotesModel = Backbone.Model.extend({
  initialize(attributes, options={}) {
    this.userId = options.userId;
  },

  url() {
    return `/root/${this.userId}/notes`;
  }
}, {cacheFields: ['userId']});

export const SearchQueryModel = Backbone.Model.extend({
  initialize(attributes, options={}) {
    this.userId = options.userId;
  },

  fetch(options={}) {
    options = {
      ...options,
      contentType: 'application/json',
      data: JSON.stringify(options.data),
      type: 'POST'
    };

    Backbone.Model.prototype.fetch.call(this, options);
  },

  url() {
    return '/root/search';
  }
}, {cacheFields: ['type', 'detailed', 'filter', 'sort', 'limit', 'from']});

export const SignalsCollection = Backbone.Collection.extend({
  url() {
    return '/root/signals';
  }
});

export const ActionsCollection = Backbone.Collection.extend({
  url() {
    return '/root/actions';
  }
});

export const DecisionLogsCollection = Backbone.Collection.extend({
  url() {
    return '/root/decision_logs';
  }
});

// next three are unfetched resources
export const DecisionInstanceModel = Backbone.Model.extend(
  {},
  {cacheFields: ['entityType', 'entityId']}
);

export const LabelInstanceModel = Backbone.Model.extend({}, {cacheFields: ['userId']});

export const AccountConfigModel = Backbone.Model.extend({
  initialize(attrs, options={}) {
    this.accountId = options.accountId;
  },

  url() {
    return `/root/accounts/${this.accountId}/config`;
  }
});
