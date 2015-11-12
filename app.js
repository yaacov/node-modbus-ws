/**
 * A small example express application
 * 
 */

var express = require('express');
var path = require('path');
var appInfo = require(path.join(__dirname, 'package.json'));

// create an express server
var app = express();

// locale variables setup
app.locals.appTitle = 'Modbus-WS';
app.locals.appInfo = appInfo;
app.locals.tcpport = 3000;

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// page router setup
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', function(req, res) {
  res.render('index', { title: app.locals.appTitle });
});

module.exports = app;
