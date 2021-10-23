import Collection from '../lib/collection';
import Model from '../lib/model';

export class UserModel extends Model {
  key = 'user'

  initialize(attrs, options={}) {
    this.userId = options.userId;
    this.fraudLevel = options.fraudLevel;
  }

  url() {
    return `/root/users/${this.userId}`;
  }

  static cacheFields = ['fraudLevel', 'userId', 'id']
}

export class AnalystsCollection extends Collection {
  key = 'analysts'

  url() {
    return '/root/analysts';
  }
}

export class DecisionsCollection extends Collection {
  key = 'decisions'

  url() {
    return '/root/decisions';
  }

  static cacheFields = ['include_deleted']
}

export class NotesModel extends Model {
  key = 'notes'

  initialize(attributes, options={}) {
    this.userId = options.userId;
  }

  url() {
    return `/root/${this.userId}/notes`;
  }

  static cacheFields = ['userId']
}

export class SearchQueryModel extends Model {
  key = 'search'

  initialize(attributes, options={}) {
    this.userId = options.userId;
  }

  fetch(options={}) {
    options = {
      ...options,
      contentType: 'application/json',
      data: JSON.stringify(options.data),
      type: 'POST'
    };

    return Model.prototype.fetch.call(this, options);
  }

  url() {
    return '/root/search';
  }

  static cacheFields = ['type', 'detailed', 'filter', 'sort', 'limit', 'from']
}

export class SignalsCollection extends Collection {
  key = 'signals'

  url() {
    return '/root/signals';
  }
}

export class ActionsCollection extends Collection {
  key = 'actions'

  url() {
    return '/root/actions';
  }
}

export class DecisionLogsCollection extends Collection {
  key = 'decisionLogs'

  url() {
    return '/root/decision_logs';
  }

  static cacheFields = ['logs']
}

// next three are unfetched resources
export class DecisionInstanceModel extends Model {
  static cacheFields = ['entityType', 'entityId']
}

export class LabelInstanceModel extends Model {
  static cacheFields = ['userId']
}

export class AccountConfigModel extends Model {
  key = 'accountConfig'

  initialize(attrs, options={}) {
    this.accountId = options.accountId;
  }

  url() {
    return `/root/accounts/${this.accountId}/config`;
  }
}
