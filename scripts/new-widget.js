#!/usr/bin/env node

/**
 * Scaffolds a new widget under /apps and adds it to plugin-manifest.json.
 *
 * Usage:
 *   npm run new-widget -- --name email-tracker --title "Email Tracker"
 *     --module Leads --placement crm.detail.button --scope ZohoCRM.modules.all
 */

var path = require('path');
var fs = require('fs-extra');
var chalk = require('chalk');
var minimist = require('minimist');

var ROOT_DIR = path.join(__dirname, '..');
var APPS_DIR = path.join(ROOT_DIR, 'apps');
var MANIFEST_PATH = path.join(ROOT_DIR, 'plugin-manifest.json');

var args = minimist(process.argv.slice(2), {
  string: ['name', 'title', 'module', 'placement', 'scope'],
  alias: { n: 'name', t: 'title' }
});

var rawName = args.name || args._[0];

if (!rawName) {
  console.error(chalk.red('Please provide a widget name. Example: npm run new-widget -- --name my-widget'));
  process.exit(1);
}

var slugify = function (value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
};

var toTitleCase = function (value) {
  return value.replace(/(^|\s|-)\w/g, function (match) {
    return match.toUpperCase();
  }).replace(/-/g, ' ');
};

var widgetId = slugify(rawName);
var widgetTitle = args.title || toTitleCase(widgetId);
var moduleName = args.module || 'Leads';
var placement = args.placement || 'crm.detail.button';
var scope = args.scope || 'ZohoCRM.modules.all';

var widgetDir = path.join(APPS_DIR, widgetId);

if (fs.existsSync(widgetDir)) {
  console.error(chalk.red('A widget with id "' + widgetId + '" already exists.'));
  process.exit(1);
}

var manifest;

try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
} catch (err) {
  console.error(chalk.red('Unable to read plugin-manifest.json'));
  console.error(err);
  process.exit(1);
}

manifest.widgets = Array.isArray(manifest.widgets) ? manifest.widgets : [];
var alreadyInManifest = manifest.widgets.some(function (widget) { return widget.id === widgetId; });

if (alreadyInManifest) {
  console.error(chalk.red('plugin-manifest.json already contains widget id "' + widgetId + '".'));
  process.exit(1);
}

var templateHtml = [
  '<!DOCTYPE html>',
  '<html>',
  '<head>',
  '  <meta charset="UTF-8" />',
  '  <title>' + widgetTitle + '</title>',
  '  <style>',
  '    body { font-family: "Inter","Open Sans",sans-serif; margin: 0; padding: 1.5rem; background: #f8fafc; color: #0f172a; }',
  '    h1 { margin-top: 0; font-size: 1.25rem; }',
  '  </style>',
  '  <script src="https://live.zwidgets.com/js-sdk/1.4/ZohoEmbededAppSDK.min.js"></script>',
  '</head>',
  '<body>',
  '  <h1>' + widgetTitle + '</h1>',
  '  <p>Edit <code>/apps/' + widgetId + '/widget.html</code> to build your UI.</p>',
  '  <script>',
  '    ZOHO.embeddedApp.on("PageLoad", function (data) {',
  '      console.log("Widget [' + widgetId + '] loaded", data);',
  '    });',
  '    ZOHO.embeddedApp.init();',
  '  </script>',
  '</body>',
  '</html>',
  ''
].join('\n');

fs.ensureDirSync(widgetDir);
fs.writeFileSync(path.join(widgetDir, 'widget.html'), templateHtml, 'utf8');
fs.ensureDirSync(path.join(widgetDir, 'translations'));
fs.writeFileSync(path.join(widgetDir, 'translations/en.json'), '{}\n', 'utf8');

manifest.widgets.push({
  name: widgetTitle,
  id: widgetId,
  url: '/apps/' + widgetId + '/widget.html',
  location: {
    [placement]: [moduleName]
  },
  scope: [scope]
});

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(chalk.green('Widget scaffolded at ' + widgetDir));
console.log(chalk.green('Remember to customize plugin-manifest.json if you need advanced placement or scopes.'));
