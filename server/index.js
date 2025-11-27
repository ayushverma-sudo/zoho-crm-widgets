/*
Copyright (c) 2017, ZOHO CORPORATION
License: MIT
*/
var fs = require('fs');
var path = require('path');
var express = require('express');
var bodyParser = require('body-parser');
var errorHandler = require('errorhandler');
var morgan = require('morgan');
var serveIndex = require('serve-index');
var https = require('https');
var chalk = require('chalk');

process.env.PWD = process.env.PWD || process.cwd();

var ROOT_DIR = path.join(__dirname, '..');
var APPS_DIR = path.join(ROOT_DIR, 'apps');
var SHARED_DIR = path.join(ROOT_DIR, 'shared');
var MANIFEST_PATH = path.join(ROOT_DIR, 'plugin-manifest.json');

var expressApp = express();
var port = 5000;

var readWidgetsFromManifest = function () {
  try {
    var manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return Array.isArray(manifest.widgets) ? manifest.widgets : [];
  } catch (err) {
    console.error(chalk.red('Unable to read plugin-manifest.json'), err);
    return [];
  }
};

var getDefaultWidgetDir = function () {
  var widgets = readWidgetsFromManifest();
  if (!widgets.length || !widgets[0].id) {
    return null;
  }
  return path.join(APPS_DIR, widgets[0].id);
};

var buildIndexHtml = function () {
  var widgets = readWidgetsFromManifest();
  var listItems = widgets.length
    ? widgets.map(function (widget) {
      var url = widget.url || '#';
      return '<li><a href="' + url + '">' + (widget.name || widget.id) + '</a></li>';
    }).join('')
    : '<li>No widgets registered yet. Run <code>npm run new-widget -- --name my-widget</code>.</li>';

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '  <meta charset="UTF-8"/>',
    '  <title>Widget Dev Server</title>',
    '  <style>',
    '    body { font-family: "Inter","Open Sans",sans-serif; margin: 0; padding: 2rem; background: #f8fafc; color: #0f172a; }',
    '    h1 { margin-top: 0; }',
    '    ul { padding-left: 1.25rem; }',
    '    a { color: #2563eb; text-decoration: none; }',
    '    a:hover { text-decoration: underline; }',
    '    code { background: #e2e8f0; padding: 0.1rem 0.35rem; border-radius: 4px; }',
    '  </style>',
    '</head>',
    '<body>',
    '  <h1>Available Widgets</h1>',
    '  <p>Click a widget to open it in the browser. Register the same URL inside Zoho CRM when testing.</p>',
    '  <ul>' + listItems + '</ul>',
    '</body>',
    '</html>'
  ].join('\n');
};

expressApp.set('port', port);
expressApp.use(morgan('dev'));
expressApp.use(bodyParser.json());
expressApp.use(bodyParser.urlencoded({ extended: false }));
expressApp.use(errorHandler());

expressApp.use('/', function (req, res, next) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

expressApp.get('/plugin-manifest.json', function (req, res) {
  res.sendFile(MANIFEST_PATH);
});

expressApp.use('/app', function (req, res, next) {
  var defaultWidgetDir = getDefaultWidgetDir();
  if (!defaultWidgetDir) {
    res.status(404).send('No widgets registered yet. Please run npm run new-widget first.');
    return;
  }
  express.static(defaultWidgetDir)(req, res, next);
});

expressApp.use('/app', function (req, res, next) {
  var defaultWidgetDir = getDefaultWidgetDir();
  if (!defaultWidgetDir) {
    res.status(404).send('No widgets registered yet. Please run npm run new-widget first.');
    return;
  }
  serveIndex(defaultWidgetDir)(req, res, next);
});

expressApp.use('/shared', express.static(SHARED_DIR));
expressApp.use('/apps', express.static(APPS_DIR));
expressApp.use('/apps', serveIndex(APPS_DIR));

expressApp.get('/', function (req, res) {
  res.send(buildIndexHtml());
});

var options = {
  key: fs.readFileSync('./key.pem'),
  cert: fs.readFileSync('./cert.pem')
};

https.createServer(options, expressApp).listen(port, function () {
  console.log(chalk.green('Zet running at https://127.0.0.1:' + port));
  console.log(chalk.bold.cyan("Note: Please enable the host (https://127.0.0.1:" + port + ") in a new tab and authorize the connection by clicking Advanced->Proceed to 127.0.0.1 (unsafe)."));
}).on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.log(chalk.bold.red(port + " port is already in use"));
  }
});
