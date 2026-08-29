import React from 'react';
import { AccountScreenBase } from './AccountScreenBase';

export default function CustomerAccountScreen(props) {
  return <AccountScreenBase {...props} role="customer" />;
}
