/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import React from 'react';
import { Subscription } from 'rxjs';
import { DataPublicPluginSetup, DataPublicPluginStart } from '../../data/public';
import { getSavedObjectFinder } from '../../saved_objects/public';
import { UiActionsSetup, UiActionsStart } from '../../ui_actions/public';
import { Start as InspectorStart } from '../../inspector/public';
import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  ScopedHistory,
  PublicAppInfo,
} from '../../../core/public';
import { EmbeddableFactoryRegistry, EmbeddableFactoryProvider } from './types';
import { bootstrap } from './bootstrap';
import {
  EmbeddableFactory,
  EmbeddableInput,
  EmbeddableOutput,
  defaultEmbeddableFactoryProvider,
  IEmbeddable,
  EmbeddablePanel,
} from './lib';
import { EmbeddableFactoryDefinition } from './lib/embeddables/embeddable_factory_definition';
import { EmbeddableStateTransfer } from './lib/state_transfer';

export interface EmbeddableSetupDependencies {
  data: DataPublicPluginSetup;
  uiActions: UiActionsSetup;
}

export interface EmbeddableStartDependencies {
  data: DataPublicPluginStart;
  uiActions: UiActionsStart;
  inspector: InspectorStart;
}

export interface EmbeddableSetup {
  registerEmbeddableFactory: <
    I extends EmbeddableInput,
    O extends EmbeddableOutput,
    E extends IEmbeddable<I, O> = IEmbeddable<I, O>
  >(
    id: string,
    factory: EmbeddableFactoryDefinition<I, O, E>
  ) => () => EmbeddableFactory<I, O, E>;
  setCustomEmbeddableFactoryProvider: (customProvider: EmbeddableFactoryProvider) => void;
}

export interface EmbeddableStart {
  getEmbeddableFactory: <
    I extends EmbeddableInput = EmbeddableInput,
    O extends EmbeddableOutput = EmbeddableOutput,
    E extends IEmbeddable<I, O> = IEmbeddable<I, O>
  >(
    embeddableFactoryId: string
  ) => EmbeddableFactory<I, O, E> | undefined;
  getEmbeddableFactories: () => IterableIterator<EmbeddableFactory>;
  EmbeddablePanel: EmbeddablePanelHOC;
  getEmbeddablePanel: (stateTransfer?: EmbeddableStateTransfer) => EmbeddablePanelHOC;
  getStateTransfer: (history?: ScopedHistory) => EmbeddableStateTransfer;
}

export type EmbeddablePanelHOC = React.FC<{ embeddable: IEmbeddable; hideHeader?: boolean }>;

export class EmbeddablePublicPlugin implements Plugin<EmbeddableSetup, EmbeddableStart> {
  private readonly embeddableFactoryDefinitions: Map<
    string,
    EmbeddableFactoryDefinition
  > = new Map();
  private readonly embeddableFactories: EmbeddableFactoryRegistry = new Map();
  private customEmbeddableFactoryProvider?: EmbeddableFactoryProvider;
  private outgoingOnlyStateTransfer: EmbeddableStateTransfer = {} as EmbeddableStateTransfer;
  private isRegistryReady = false;
  private appList?: ReadonlyMap<string, PublicAppInfo>;
  private appListSubscription?: Subscription;

  constructor(initializerContext: PluginInitializerContext) {}

  public setup(core: CoreSetup, { uiActions }: EmbeddableSetupDependencies) {
    bootstrap(uiActions);

    return {
      registerEmbeddableFactory: this.registerEmbeddableFactory,
      setCustomEmbeddableFactoryProvider: (provider: EmbeddableFactoryProvider) => {
        if (this.customEmbeddableFactoryProvider) {
          throw new Error(
            'Custom embeddable factory provider is already set, and can only be set once'
          );
        }
        this.customEmbeddableFactoryProvider = provider;
      },
    };
  }

  public start(
    core: CoreStart,
    { data, uiActions, inspector }: EmbeddableStartDependencies
  ): EmbeddableStart {
    this.embeddableFactoryDefinitions.forEach((def) => {
      this.embeddableFactories.set(
        def.type,
        this.customEmbeddableFactoryProvider
          ? this.customEmbeddableFactoryProvider(def)
          : defaultEmbeddableFactoryProvider(def)
      );
    });

    this.appListSubscription = core.application.applications$.subscribe((appList) => {
      this.appList = appList;
    });

    this.outgoingOnlyStateTransfer = new EmbeddableStateTransfer(
      core.application.navigateToApp,
      undefined,
      this.appList
    );
    this.isRegistryReady = true;

    const getEmbeddablePanelHoc = (stateTransfer?: EmbeddableStateTransfer) => ({
      embeddable,
      hideHeader,
    }: {
      embeddable: IEmbeddable;
      hideHeader?: boolean;
    }) => (
      <EmbeddablePanel
        hideHeader={hideHeader}
        embeddable={embeddable}
        stateTransfer={stateTransfer ? stateTransfer : this.outgoingOnlyStateTransfer}
        getActions={uiActions.getTriggerCompatibleActions}
        getEmbeddableFactory={this.getEmbeddableFactory}
        getAllEmbeddableFactories={this.getEmbeddableFactories}
        overlays={core.overlays}
        notifications={core.notifications}
        application={core.application}
        inspector={inspector}
        SavedObjectFinder={getSavedObjectFinder(core.savedObjects, core.uiSettings)}
      />
    );

    return {
      getEmbeddableFactory: this.getEmbeddableFactory,
      getEmbeddableFactories: this.getEmbeddableFactories,
      getStateTransfer: (history?: ScopedHistory) => {
        return history
          ? new EmbeddableStateTransfer(core.application.navigateToApp, history, this.appList)
          : this.outgoingOnlyStateTransfer;
      },
      EmbeddablePanel: getEmbeddablePanelHoc(),
      getEmbeddablePanel: getEmbeddablePanelHoc,
    };
  }

  public stop() {
    if (this.appListSubscription) {
      this.appListSubscription.unsubscribe();
    }
  }

  private getEmbeddableFactories = () => {
    this.ensureFactoriesExist();
    return this.embeddableFactories.values();
  };

  private registerEmbeddableFactory = <
    I extends EmbeddableInput = EmbeddableInput,
    O extends EmbeddableOutput = EmbeddableOutput,
    E extends IEmbeddable<I, O> = IEmbeddable<I, O>
  >(
    embeddableFactoryId: string,
    factory: EmbeddableFactoryDefinition<I, O, E>
  ): (() => EmbeddableFactory<I, O, E>) => {
    if (this.embeddableFactoryDefinitions.has(embeddableFactoryId)) {
      throw new Error(
        `Embeddable factory [embeddableFactoryId = ${embeddableFactoryId}] already registered in Embeddables API.`
      );
    }
    this.embeddableFactoryDefinitions.set(embeddableFactoryId, factory);

    return () => {
      return this.getEmbeddableFactory(embeddableFactoryId);
    };
  };

  private getEmbeddableFactory = <
    I extends EmbeddableInput = EmbeddableInput,
    O extends EmbeddableOutput = EmbeddableOutput,
    E extends IEmbeddable<I, O> = IEmbeddable<I, O>
  >(
    embeddableFactoryId: string
  ): EmbeddableFactory<I, O, E> => {
    if (!this.isRegistryReady) {
      throw new Error('Embeddable factories can only be retrieved after setup lifecycle.');
    }
    this.ensureFactoryExists(embeddableFactoryId);
    const factory = this.embeddableFactories.get(embeddableFactoryId);

    if (!factory) {
      throw new Error(
        `Embeddable factory [embeddableFactoryId = ${embeddableFactoryId}] does not exist.`
      );
    }

    return factory as EmbeddableFactory<I, O, E>;
  };

  // These two functions are only to support legacy plugins registering factories after the start lifecycle.
  private ensureFactoriesExist = () => {
    this.embeddableFactoryDefinitions.forEach((def) => this.ensureFactoryExists(def.type));
  };

  private ensureFactoryExists = (type: string) => {
    if (!this.embeddableFactories.get(type)) {
      const def = this.embeddableFactoryDefinitions.get(type);
      if (!def) return;
      this.embeddableFactories.set(
        type,
        this.customEmbeddableFactoryProvider
          ? this.customEmbeddableFactoryProvider(def)
          : defaultEmbeddableFactoryProvider(def)
      );
    }
  };
}
