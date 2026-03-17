#!/usr/bin/env node
/**
 * One-time Gmail OAuth2 setup.
 *
 * Prerequisites:
 * 1. Go to https://console.cloud.google.com/
 * 2. Create a project → Enable Gmail API → Create OAuth2 credentials (Desktop app)
 * 3. Download credentials JSON → save as credentials/gmail-credentials.json
 * 4. Run: node scripts/gmail-auth.js
 *
 * This will open a browser URL. Paste the resulting code back here.
 * Token saved to credentials/gmail-token.json — do not commit this file.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, '../credentials/gmail-credentials.json');
const TOKEN_PATH = path.join(__dirname, '../credentials/gmail-token.json');
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

if (!fs.existsSync(CREDENTIALS_PATH)) {
  console.error(`[ERROR] credentials/gmail-credentials.json not found.`);
  console.error(`\nSetup steps:`);
  console.error(`  1. Go to https://console.cloud.google.com/`);
  console.error(`  2. Create a project → Enable Gmail API`);
  console.error(`  3. Create OAuth2 credentials (Desktop app type)`);
  console.error(`  4. Download the JSON file → save as credentials/gmail-credentials.json`);
  console.error(`  5. Run this script again`);
  process.exit(1);
}

const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const authUrl = oAuth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
console.log('\nOpen this URL in your browser:\n');
console.log(authUrl);
console.log('');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('Paste the authorisation code here: ', (code) => {
  rl.close();
  oAuth2Client.getToken(code.trim(), (err, token) => {
    if (err) {
      console.error('[ERROR] Failed to retrieve token:', err.message);
      process.exit(1);
    }
    fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
    console.log(`\n[OK] Token saved to credentials/gmail-token.json`);
    console.log(`[OK] Gmail portal is now ready. Run: npm run scan`);
  });
});
