// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var express = require('express');
var cookieParser = require('cookie-parser');
var uuid = require('uuid');
var app = express();

app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser('someSecretThisIs'));

// mount the friend API under /antisocial
var antisocial = require('./index');
var imApp = require('./examples/im.js');

var dbHandler = require('./examples/db');
var db = new dbHandler();
var getAuthenticatedUser = require('./examples/getAuthenticatedUser')(db);

db.on('create-friends', function (data) {
  console.log('db create event friends %s', data.id);
});

db.on('update-friends', function (data) {
  console.log('db update event friends %s', data.id);
});

db.on('delete-friends', function (data) {
  console.log('db delete event friends %s', data.id);
});

app.db = db;

var MYSQLdbHandler = require('./examples/db-mysql');

var mysql = new MYSQLdbHandler({
  host: 'localhost',
  user: 'testuser',
  password: 'testpassword',
  db: 'testdb',
  charset: 'utf8',
  collation: 'utf8_general_ci'
});


var userAPI = require('./examples/api-reg-users')(express, mysql, getAuthenticatedUser);
app.use('/api/users', userAPI);

var router = express.Router();

router.post('/post', getAuthenticatedUser, function (req, res) {
  var post = req.body;
  post.userId = req.antisocialUser.id;
  app.db.newInstance('posts', post, function (err, postInstance) {
    res.send(postInstance);
  });
});

app.use(router);

var server = null;

app.start = function (port) {
  var http = require('http');
  server = http.createServer(app);
  var listener = server.listen(port);

  var config = {
    'APIPrefix': '/antisocial',
    'publicHost': 'http://127.0.0.1:3000',
    'port': 3000
  };

  var antisocialApp = antisocial(app, config, db, getAuthenticatedUser);

  imApp.init(antisocialApp);

  app.postIdMap = {};
  app.highwaterMap = {};

  antisocialApp.on('new-friend-request', function (user, friend) {
    console.log('antisocial new-friend-request %s %j', user.username, friend.remoteEndPoint);
  });

  antisocialApp.on('new-friend', function (user, friend) {
    console.log('antisocial new-friend %s %j', user.username, friend.remoteEndPoint);

    // simulate 10 'post' app items

    if (!app.highwaterMap[friend.id]) {
      app.highwaterMap[friend.id] = 0;
    }
    if (!app.postIdMap[user.id]) {
      app.postIdMap[user.id] = 10;
    }
  });

  antisocialApp.on('friend-updated', function (user, friend) {
    console.log('antisocial friend-updated %s %s', user.username, friend.remoteEndPoint);
  });

  antisocialApp.on('friend-deleted', function (user, friend) {
    console.log('antisocial friend-deleted %s %s', user.username, friend.remoteEndPoint);
  });

  antisocialApp.on('open-activity-connection', function (user, friend, emitter, info) {
    console.log('antisocial open-activity-connection %s<-%s', user.username, friend.remoteEndPoint);
    emitter('post', 'highwater', app.highwaterMap[friend.id] ? app.highwaterMap[friend.id] : 0);
  });

  antisocialApp.on('close-activity-connection', function (user, friend, reason, info) {
    console.log('antisocial close-activity-connection %s<-%s %s', user.username, friend.remoteEndpoint, reason);
  });

  antisocialApp.on('open-notification-connection', function (user, emitter, info) {
    console.log('antisocial open-notification-connection %s', user.username);
  });

  antisocialApp.on('close-notification-connection', function (user, reason, info) {
    console.log('antisocial close-notification-connection %s %s', user.username, reason);
  });

  antisocialApp.on('activity-data-test', function (user, friend, data) {
    console.log('antisocial activity-data-test user: %s friend: %s data: %j', user.name, friend.remoteEndPoint, data);
    if (data.postId > app.highwaterMap[friend.id]) {
      app.highwaterMap[friend.id] = data.postId;
    }
  });

  antisocialApp.on('activity-backfill-test', function (user, friend, highwater, emitter) {
    console.log('antisocial activity-backfill-test user: %s friend: %s highwater: %s', user.name, friend.remoteEndPoint, highwater);

    // send posts from requested highwater to end of posts
    for (var i = highwater + 1; i <= app.postIdMap[user.id]; i++) {
      emitter('test', 'data', {
        'backfill': true,
        'postId': i,
        'source': user.username
      });
    }
  });

  antisocialApp.on('notification-data-test', function (user, data) {
    console.log('notification-data-test user: %s data: %j', user.name, data);
  });

  antisocialApp.on('notification-backfill-test', function (user, highwater, emitter) {
    console.log('notification-backfill-test user: %s backfill: %s', user.username, highwater);
  });



  antisocialApp.listen(listener);
};

app.stop = function () {
  server.close();
};

if (require.main === module) {
  app.start(3000);
}

module.exports = app;
