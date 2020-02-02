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
import {ModelMap, ResourceKeys, ResourcesConfig, UnfetchedResources} from '../lib/config';
import React from 'react';

window.React = React;

ResourceKeys.add({
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

ModelMap.add({
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
});

UnfetchedResources
    .add(ResourceKeys.ACCOUNT_CONFIG)
    .add(ResourceKeys.DECISION_INSTANCE)
    .add(ResourceKeys.LABEL_INSTANCE);

class Loader extends React.Component {
  render() {
    return <div className='Loader' />;
  }
}

ResourcesConfig.set({Loader});

let context = require.context('./', true, /.jsx?$/);

context.keys().forEach(context);
