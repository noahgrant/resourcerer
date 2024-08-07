import Collection from "../lib/collection";
import Model from "../lib/model";
import { type SyncOptions } from "../lib/sync";

export class UserModel extends Model<{ anything: string }, { userId: string }> {
  key = "user";
  userId: string;

  url({ userId }) {
    return `/root/users/${userId}`;
  }

  static dependencies = ["fraudLevel", "userId", "id"];
}

export class AnalystsCollection extends Collection {
  key = "analysts";

  url() {
    return "/root/analysts";
  }
}

export class DecisionsCollection extends Collection {
  key = "decisions";

  url() {
    return "/root/decisions";
  }

  static dependencies = ["include_deleted"];
}

export class NotesModel extends Model<{ note: "note" }, { userId: string }> {
  key = "notes";

  url({ userId }) {
    return `/root/${userId}/notes`;
  }

  static dependencies = ["userId"];
}

export class SearchQueryModel extends Model {
  key = "search";

  fetch(options = {} as SyncOptions) {
    options = {
      ...options,
      contentType: "application/json",
      type: "POST",
    };

    return Model.prototype.fetch.call(this, options);
  }

  url() {
    return "/root/search";
  }

  static dependencies = ["type", "detailed", "filter", "sort", "limit", "from"];
}

export class SignalsCollection extends Collection {
  key = "signals";

  url() {
    return "/root/signals";
  }
}

export class ActionsCollection extends Collection {
  key = "actions";

  url() {
    return "/root/actions";
  }
}

export class DecisionLogsCollection extends Collection {
  key = "decisionLogs";

  url() {
    return "/root/decision_logs";
  }

  static dependencies = ["logs"];
}

// next three are unfetched resources
export class DecisionInstanceModel extends Model {
  static dependencies = ["entityType", "entityId"];
}

export class LabelInstanceModel extends Model {
  static dependencies = ["userId"];
}

export class AccountConfigModel extends Model {
  key = "accountConfig";

  url({ accountId }) {
    return `/root/accounts/${accountId}/config`;
  }
}
