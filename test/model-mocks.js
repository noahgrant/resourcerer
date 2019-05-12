import Schmackbone from 'schmackbone';

export const UserModel = Schmackbone.Model.extend({
  initialize(attrs, options={}) {
    this.userId = options.userId;
  },

  url() {
    return `/root/users/${this.userId}`;
  }
}, {cacheFields: ['userId']});

export const AnalystsCollection = Schmackbone.Collection.extend({
  url() {
    return '/root/analysts';
  }
});

export const DecisionsCollection = Schmackbone.Collection.extend({
  url() {
    return '/root/decisions';
  }
}, {cacheFields: ['include_deleted']});

export const NotesModel = Schmackbone.Model.extend({
  initialize(attributes, options={}) {
    this.userId = options.userId;
  },

  url() {
    return `/root/${this.userId}/notes`;
  }
}, {cacheFields: ['userId']});

export const SearchQueryModel = Schmackbone.Model.extend({
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

    Schmackbone.Model.prototype.fetch.call(this, options);
  },

  url() {
    return '/root/search';
  }
}, {cacheFields: ['type', 'detailed', 'filter', 'sort', 'limit', 'from']});

export const SignalsCollection = Schmackbone.Collection.extend({
  url() {
    return '/root/signals';
  }
});

export const ActionsCollection = Schmackbone.Collection.extend({
  url() {
    return '/root/actions';
  }
});

export const DecisionLogsCollection = Schmackbone.Collection.extend({
  url() {
    return '/root/decision_logs';
  }
});

// next three are unfetched resources
export const DecisionInstanceModel = Schmackbone.Model.extend(
  {},
  {cacheFields: ['entityType', 'entityId']}
);

export const LabelInstanceModel = Schmackbone.Model.extend({}, {cacheFields: ['userId']});

export const AccountConfigModel = Schmackbone.Model.extend({
  initialize(attrs, options={}) {
    this.accountId = options.accountId;
  },

  url() {
    return `/root/accounts/${this.accountId}/config`;
  }
});
