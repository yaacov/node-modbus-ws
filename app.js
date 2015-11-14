/**
 * A small example express application
 * 
 */

var express = require('express');
var path = require('path');
var title = require(path.join(__dirname, 'package.json')).name;

// create an express server
var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// page router setup
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', function(req, res) {
  res.render('index', { title: title });
});

module.exports = app;
