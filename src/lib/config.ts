// Centralized default/remote URLs so the browser app and the Node-side daily
// snapshot script (scripts/record-daily-snapshot.ts) agree on the same
// sheet and history source without duplicating the literals.

export const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTBIuqXFPsT877PFN1HiRva1Uw1pKx681DQJcMSEUymzTdIrKjRyNSmurR-QQ33NFJbw0qE9Auacr7W/pub?output=csv';

// Populated once a day by .github/workflows/daily-snapshot.yml, which force-
// pushes a fresh snapshots.json to the orphan "data" branch. That branch is
// kept separate from main/Pages on purpose: it has no branch protection to
// fight with, and pushing to it doesn't trigger a Pages deploy on every run.
export const REMOTE_SNAPSHOTS_URL =
  'https://raw.githubusercontent.com/jaake01/investment-dashboard/data/snapshots.json';
