/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as Either from 'fp-ts/Either';
import * as TaskEither from 'fp-ts/TaskEither';
import * as Option from 'fp-ts/Option';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import {
  catchRetryableEsClientErrors,
  type RetryableEsClientError,
} from './catch_retryable_es_client_errors';

/** @internal */
export interface ReindexResponse {
  taskId: string;
}

/** @internal */
export interface ReindexParams {
  client: ElasticsearchClient;
  sourceIndex: string;
  targetIndex: string;
  reindexScript: Option.Option<string>;
  requireAlias: boolean;
  /* When reindexing we use a source query to exclude saved objects types which
   * are no longer used. These saved objects will still be kept in the outdated
   * index for backup purposes, but won't be available in the upgraded index.
   */
  excludeOnUpgradeQuery: QueryDslQueryContainer;
  /** Number of documents Elasticsearch will read/write in each batch */
  batchSize: number;
}

/**
 * Reindex documents from the `sourceIndex` into the `targetIndex`. Returns a
 * task ID which can be tracked for progress.
 *
 * @remarks This action is idempotent allowing several Kibana instances to run
 * this in parallel. By using `op_type: 'create', conflicts: 'proceed'` there
 * will be only one write per reindexed document.
 */
export const reindex =
  ({
    client,
    sourceIndex,
    targetIndex,
    reindexScript,
    requireAlias,
    excludeOnUpgradeQuery,
    batchSize,
  }: ReindexParams): TaskEither.TaskEither<RetryableEsClientError, ReindexResponse> =>
  () => {
    return client
      .reindex({
        // Require targetIndex to be an alias. Prevents a new index from being
        // created if targetIndex doesn't exist.
        require_alias: requireAlias,
        // Ignore version conflicts from existing documents
        conflicts: 'proceed',
        source: {
          index: sourceIndex,
          // Set reindex batch size
          size: batchSize,
          // Exclude saved object types
          query: excludeOnUpgradeQuery,
        },
        dest: {
          index: targetIndex,
          // Don't override existing documents, only create if missing
          op_type: 'create',
        },
        script: Option.fold<string, undefined | { source: string; lang: 'painless' }>(
          () => undefined,
          (script) => ({
            source: script,
            lang: 'painless',
          })
        )(reindexScript),
        // force a refresh so that we can query the target index
        refresh: true,
        // Create a task and return task id instead of blocking until complete
        wait_for_completion: false,
      })
      .then(({ task: taskId }) => {
        return Either.right({ taskId: String(taskId) });
      })
      .catch(catchRetryableEsClientErrors);
  };
