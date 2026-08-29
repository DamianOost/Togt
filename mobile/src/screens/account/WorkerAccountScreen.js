import React from 'react';
import { AccountScreenBase } from './AccountScreenBase';

export default function WorkerAccountScreen(props) {
  return <AccountScreenBase {...props} role="worker" />;
}
