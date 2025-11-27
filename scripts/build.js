#!/usr/bin/env node

/**
 * Build script that zips each widget found in plugin-manifest.json.
 * Each widget is expected to live under /apps/<widget-id>/ with its
 * entry file referenced by widget.url (e.g. /apps/<id>/widget.html).
 */

var path = require('path');
var fs = require('fs-extra');
var archiver = require('archiver');
var chalk = require('chalk');

var ROOT_DIR = path.join(__dirname, '..');
var APPS_DIR = path.join(ROOT_DIR, 'apps');
var DIST_DIR = path.join(ROOT_DIR, 'dist');
var MANIFEST_PATH = path.join(ROOT_DIR, 'plugin-manifest.json');

var readManifest = function () {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.error(chalk.red('Unable to read plugin-manifest.json'));
    throw err;
  }
};

var resolveWidgetDir = function (widget) {
  var widgetUrl = (widget.url || '').replace(/^\/+/, '');
  if (!widgetUrl) {
    throw new Error('Widget "' + widget.id + '" does not define a url in plugin-manifest.json');
  }
  var relativeDir = path.dirname(widgetUrl);
  return path.join(ROOT_DIR, relativeDir);
};

var zipWidget = function (widget) {
  return new Promise(function (resolve, reject) {
    var widgetDir = resolveWidgetDir(widget);
    if (!fs.existsSync(widgetDir)) {
      return reject(new Error('Widget directory missing: ' + widgetDir));
    }

    var outPath = path.join(DIST_DIR, widget.id + '.zip');
    var output = fs.createWriteStream(outPath);
    var archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', function () {
      console.log(chalk.green('✓ Bundled ' + widget.id + ' -> ' + outPath));
      resolve(outPath);
    });
    archive.on('error', reject);

    archive.pipe(output);
    // Preserve the legacy "app/" structure to stay compatible with the prior packaging flow.
    archive.directory(widgetDir, 'app');
    archive.finalize();
  });
};

var build = async function () {
  var manifest = readManifest();
  var widgets = Array.isArray(manifest.widgets) ? manifest.widgets : [];

  if (!widgets.length) {
    console.warn(chalk.yellow('No widgets defined in plugin-manifest.json. Nothing to build.'));
    return;
  }

  fs.ensureDirSync(APPS_DIR);
  fs.ensureDirSync(DIST_DIR);
  fs.emptyDirSync(DIST_DIR);

  for (var i = 0; i < widgets.length; i += 1) {
    var widget = widgets[i];
    if (!widget.id) {
      console.warn(chalk.yellow('Skipping widget without id at index ' + i));
      continue;
    }

    console.log(chalk.cyan('Bundling widget: ' + widget.id));
    await zipWidget(widget);
  }

  console.log(chalk.bold.green('All widgets have been bundled. Files are available in /dist.'));
};

build().catch(function (err) {
  console.error(chalk.red('Build failed'));
  console.error(err);
  process.exitCode = 1;
});
