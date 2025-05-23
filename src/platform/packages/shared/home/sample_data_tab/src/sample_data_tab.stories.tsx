/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { Meta } from '@storybook/react';

import { SampleDataTab } from './sample_data_tab';

import mdx from '../README.mdx';
import { SampleDataTabProvider } from './services';
import { getStoryServices, getStoryArgTypes, Params } from './mocks';

export default {
  title: 'Sample Data/Tab Content',
  description: '',
  parameters: {
    docs: {
      page: mdx,
    },
  },
  decorators: [(Story) => <div style={{ width: 1200 }}>{Story()}</div>],
} as Meta<typeof SampleDataTab>;

export const TabContent = {
  render: (params: Params) => (
    <SampleDataTabProvider {...getStoryServices(params)}>
      <SampleDataTab />
    </SampleDataTabProvider>
  ),

  argTypes: getStoryArgTypes(),
};
