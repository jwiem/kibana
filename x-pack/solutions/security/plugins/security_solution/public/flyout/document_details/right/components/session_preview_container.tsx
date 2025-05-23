/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { type FC, useCallback, useMemo } from 'react';
import { TimelineTabs } from '@kbn/securitysolution-data-table';
import { useDispatch } from 'react-redux';
import { FormattedMessage } from '@kbn/i18n-react';
import { useUiSetting$ } from '@kbn/kibana-react-plugin/public';
import { ENABLE_VISUALIZATIONS_IN_FLYOUT_SETTING } from '../../../../../common/constants';
import { useLicense } from '../../../../common/hooks/use_license';
import { SessionPreview } from './session_preview';
import { useSessionViewConfig } from '../../shared/hooks/use_session_view_config';
import { useInvestigateInTimeline } from '../../../../detections/components/alerts_table/timeline_actions/use_investigate_in_timeline';
import { useDocumentDetailsContext } from '../../shared/context';
import { ALERTS_ACTIONS } from '../../../../common/lib/apm/user_actions';
import { ExpandablePanel } from '../../../shared/components/expandable_panel';
import { SESSION_PREVIEW_TEST_ID } from './test_ids';
import { useStartTransaction } from '../../../../common/lib/apm/use_start_transaction';
import { setActiveTabTimeline } from '../../../../timelines/store/actions';
import { getScopedActions } from '../../../../helpers';
import { useNavigateToSessionView } from '../../shared/hooks/use_navigate_to_session_view';
import { SessionViewNoDataMessage } from '../../shared/components/session_view_no_data_message';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';

const timelineId = 'timeline-1';

/**
 * Checks if the SessionView component is available, if so render it or else render an error message
 */
export const SessionPreviewContainer: FC = () => {
  const {
    eventId,
    indexName,
    scopeId,
    dataAsNestedObject,
    getFieldsData,
    isPreview,
    isPreviewMode,
    dataFormattedForFieldBrowser,
  } = useDocumentDetailsContext();

  const [visualizationInFlyoutEnabled] = useUiSetting$<boolean>(
    ENABLE_VISUALIZATIONS_IN_FLYOUT_SETTING
  );

  // decide whether to show the session view or not
  const sessionViewConfig = useSessionViewConfig({ getFieldsData, dataFormattedForFieldBrowser });
  const isEnterprisePlus = useLicense().isEnterprise();
  const isEnabled = sessionViewConfig && isEnterprisePlus;

  const isNewNavigationEnabled = !useIsExperimentalFeatureEnabled(
    'newExpandableFlyoutNavigationDisabled'
  );

  const dispatch = useDispatch();
  const { startTransaction } = useStartTransaction();
  const scopedActions = getScopedActions(timelineId);
  const { investigateInTimelineAlertClick } = useInvestigateInTimeline({
    ecsRowData: dataAsNestedObject,
  });

  const goToSessionViewTab = useCallback(async () => {
    // open timeline
    await investigateInTimelineAlertClick();

    // open session view tab
    startTransaction({ name: ALERTS_ACTIONS.OPEN_SESSION_VIEW });
    if (sessionViewConfig !== null) {
      dispatch(setActiveTabTimeline({ id: timelineId, activeTab: TimelineTabs.session }));
      if (scopedActions) {
        dispatch(scopedActions.updateSessionViewConfig({ id: timelineId, sessionViewConfig }));
      }
    }
  }, [
    dispatch,
    investigateInTimelineAlertClick,
    scopedActions,
    sessionViewConfig,
    startTransaction,
  ]);

  const { navigateToSessionView } = useNavigateToSessionView({
    eventId,
    indexName,
    isFlyoutOpen: true,
    scopeId,
    isPreviewMode,
  });

  const iconType = useMemo(() => {
    const icon = visualizationInFlyoutEnabled ? 'arrowStart' : 'timeline';
    return !isPreviewMode ? icon : undefined;
  }, [visualizationInFlyoutEnabled, isPreviewMode]);

  const isNavigationEnabled = useMemo(() => {
    // if the session view is not enabled or in rule preview mode, the navigation is not enabled
    if (!isEnabled || isPreview) {
      return false;
    }
    // if the new navigation is enabled, the navigation is enabled (flyout or timeline)
    if (isNewNavigationEnabled) {
      return true;
    }
    // if the new navigation is not enabled, the navigation is enabled if the flyout is not in preview mode
    return !isPreviewMode;
  }, [isNewNavigationEnabled, isPreviewMode, isEnabled, isPreview]);

  return (
    <ExpandablePanel
      header={{
        title: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.right.visualizations.sessionPreview.sessionPreviewTitle"
            defaultMessage="Session viewer preview"
          />
        ),
        iconType,
        ...(isNavigationEnabled && {
          link: {
            callback: visualizationInFlyoutEnabled ? navigateToSessionView : goToSessionViewTab,
            tooltip: (
              <FormattedMessage
                id="xpack.securitySolution.flyout.right.visualizations.sessionPreview.sessionPreviewTooltip"
                defaultMessage="Investigate in timeline"
              />
            ),
          },
        }),
      }}
      data-test-subj={SESSION_PREVIEW_TEST_ID}
    >
      {isEnabled ? (
        <SessionPreview />
      ) : (
        <SessionViewNoDataMessage
          isEnterprisePlus={isEnterprisePlus}
          hasSessionViewConfig={sessionViewConfig !== null}
        />
      )}
    </ExpandablePanel>
  );
};
