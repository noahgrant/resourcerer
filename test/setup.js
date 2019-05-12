/**
 * This file includes all test setup--setup mocked as it would normally be
 * mocked within a real app, adding resource keys, models, and unfetched
 * resources.
 */
import {
  AccountConfigModel,
  ActionsCollection,
  AnalystsCollection,
  DecisionInstanceModel,
  DecisionLogsCollection,
  DecisionsCollection,
  LabelInstanceModel,
  NotesModel,
  SearchQueryModel,
  SignalsCollection,
  UserModel
} from './model-mocks';
import {addModels, addResourceKeys, addUnfetchedResources} from '../lib/config';

addResourceKeys({
  ACCOUNT_CONFIG: 'accountConfig',
  ACTIONS: 'actions',
  ANALYSTS: 'analysts',
  DECISION_LOGS: 'decisionLogs',
  DECISION_INSTANCE: 'decisionInstance',
  DECISIONS: 'decisions',
  LABEL_INSTANCE: 'labelInstance',
  NOTES: 'notes',
  SEARCH_QUERY: 'searchQuery',
  SIGNALS: 'signals',
  USER: 'user'
});

addModels((ResourceKeys) => ({
  [ResourceKeys.ACCOUNT_CONFIG]: AccountConfigModel,
  [ResourceKeys.ACTIONS]: ActionsCollection,
  [ResourceKeys.ANALYSTS]: AnalystsCollection,
  [ResourceKeys.DECISION_INSTANCE]: DecisionInstanceModel,
  [ResourceKeys.DECISION_LOGS]: DecisionLogsCollection,
  [ResourceKeys.DECISIONS]: DecisionsCollection,
  [ResourceKeys.LABEL_INSTANCE]: LabelInstanceModel,
  [ResourceKeys.NOTES]: NotesModel,
  [ResourceKeys.SEARCH_QUERY]: SearchQueryModel,
  [ResourceKeys.SIGNALS]: SignalsCollection,
  [ResourceKeys.USER]: UserModel
}));

addUnfetchedResources(({ACCOUNT_CONFIG, DECISION_INSTANCE, LABEL_INSTANCE}) => [
  ACCOUNT_CONFIG,
  DECISION_INSTANCE,
  LABEL_INSTANCE
]);

let context = require.context('./', true, /.jsx?$/);

context.keys().forEach(context);
