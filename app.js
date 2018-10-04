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
app.use(cookieParser());


// mount the friend API under /antisocial
var antisocial = require('./index');


// Example database adaptor for persistant storage of users and friends
// adapt these abstract methods to your application data storage scheme

function dbHandler() {
  var self = this;

  self.collections = {
    'users': {},
    'friends': {},
    'invitations': {},
    'blocks': {}
  };

  // store an item after assigning an unique id
  this.newInstance = function (collectionName, data, cb) {
    data.id = uuid();
    self.collections[collectionName][data.id] = data;
    if (cb) {
      cb(null, data);
    }
    else {
      return data;
    }
  };

  // get an item by matching some property
  this.getInstances = function (collectionName, pairs, cb) {
    var found = [];
    for (var item in self.collections[collectionName]) {
      if (self.collections[collectionName].hasOwnProperty(item)) {
        var instance = self.collections[collectionName][item];

        var match = 0;
        for (var i = 0; i < pairs.length; i++) {
          var prop = pairs[i].property;
          var value = pairs[i].value;
          if (instance[prop] === value) {
            ++match;
          }
        }

        if (match == pairs.length) {
          found.push(instance);
        }
      }
    }
    if (cb) {
      cb(null, found);
    }
    else {
      return found;
    }
  };

  // update item properties by id
  this.updateInstance = function (collectionName, id, patch, cb) {
    var item = self.collections[collectionName][id];
    if (!item) {
      if (cb) {
        return cb('not found', null);
      }
      console.log('attempt to update a non existant instance %s.%s', collectionName, id);
      return;
    }
    for (var prop in patch) {
      if (patch.hasOwnProperty(prop)) {
        item[prop] = patch[prop];
      }
    }
    if (cb) {
      cb(null, item);
    }
    else {
      return item;
    }
  };

  this.deleteInstance = function (collectionName, id, cb) {
    var item = self.collections[collectionName][id];
    if (!item) {
      cb('not found', null);
    }
    delete self.collections[collectionName][id];
    if (cb) {
      cb(null);
    }
  };
}

var db = new dbHandler();


/*
	Example middleware adaptor to get the logged in user.
	exposes the current user on req.antisocialUser
	normally this would use a cookie via some sort of token
	to find the user in this case we use the 'token' property
	in the users collection
*/

function getAuthenticatedUser(req, res, next) {
  var token;

  if (req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (req.body && req.body.access_token) {
    token = req.body.access_token;
  }

  if (!token) {
    return next();
  }

  db.getInstances('users', [{
    'property': 'token',
    'value': token
  }], function (err, userInstances) {
    req.antisocialUser = userInstances[0];
    next();
  });
}

app.db = db;

// user register route for tests
var router = express.Router();
router.all('/register', function (req, res) {
  var params = req.method === 'GET' ? req.query : req.body;
  app.db.newInstance('users', {
    'name': params.name,
    'username': params.username,
    'token': uuid(),
    'id': uuid(),
    'community': params.community
  }, function (err, user) {
    res.cookie('access_token', user.token).send({
      'status': 'ok',
      'result': user
    });
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
