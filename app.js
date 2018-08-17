var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var uuid = require('uuid');

var app = express();

app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());


// mount the friend API under /antisocial
var antisocial = require('./index');
var db = require('./lib/utilities').memoryDB;
var getAuthenticatedUser = require('./lib/utilities').authenticatedUserMiddleware(db);

app.db = db;

var antisocialApp = antisocial(app, {
  'APIPrefix': '/antisocial',
  'publicHost': 'http://127.0.0.1:3000',
  'port': 3000
}, db, getAuthenticatedUser);

antisocialApp.on('new-friend-request', function (e) {
  console.log('antisocial new-friend-request %j', e);
});

antisocialApp.on('friend-request-accepted', function (e) {
  console.log('antisocial friend-request-accepted %j', e);
});


// user register route for tests
var router = express.Router();
router.all('/register', function (req, res, next) {
  var params = req.method === 'GET' ? req.query : req.body;
  app.db.newInstance('users', {
    'name': params.name,
    'username': params.username,
    'token': uuid(),
    'id': uuid()
  }, function (err, user) {
    res.cookie('access_token', user.token).send({
      'status': 'ok',
      'result': user
    });
  });
});

app.use(router);

module.exports = app;
