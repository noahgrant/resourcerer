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
  UserModel,
} from "./model-mocks";
import { ModelMap, register } from "../lib/config";

declare module "resourcerer" {
  export interface ModelMap {
    accountConfig: new () => AccountConfigModel;
    actions: new () => ActionsCollection;
    analysts: new () => AnalystsCollection;
    decisionInstance: new () => DecisionInstanceModel;
    decisionLogs: new () => DecisionLogsCollection;
    decisions: new () => DecisionsCollection;
    labelInstance: new () => LabelInstanceModel;
    notes: new () => NotesModel;
    searchQuery: new () => SearchQueryModel;
    signals: new () => SignalsCollection;
    user: new () => UserModel;
  }
}

register({
  accountConfig: AccountConfigModel,
  actions: ActionsCollection,
  analysts: AnalystsCollection,
  decisionInstance: DecisionInstanceModel,
  decisionLogs: DecisionLogsCollection,
  decisions: DecisionsCollection,
  labelInstance: LabelInstanceModel,
  notes: NotesModel,
  searchQuery: SearchQueryModel,
  signals: SignalsCollection,
  user: UserModel,
});
