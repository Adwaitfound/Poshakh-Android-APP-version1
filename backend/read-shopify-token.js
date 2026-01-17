#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import os from 'os';

// Shopify CLI stores credentials in ~/.shopify-cli/
const cliConfigDir = path.join(os.homedir(), '.shopify-cli');
const accountsFile = path.join(cliConfigDir, 'accounts.json');

try {
  if (fs.existsSync(accountsFile)) {
    const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf-8'));
    console.log('Shopify CLI Accounts found:');
    console.log(JSON.stringify(accounts, null, 2));
  } else {
    console.log('No accounts file found at', accountsFile);
  }

  // Also check for context/app files
  const contextFile = path.join(cliConfigDir, 'context.json');
  if (fs.existsSync(contextFile)) {
    console.log('\nContext file:');
    console.log(JSON.stringify(JSON.parse(fs.readFileSync(contextFile, 'utf-8')), null, 2));
  }
} catch (error) {
  console.error('Error reading Shopify CLI config:', error.message);
}
