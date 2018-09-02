// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var express = require('express');
var cookieParser = require('cookie-parser');
var uuid = require('uuid');
var cryptography = require('antisocial-encryption');


var app = express();

app.use(express.json());
app.use(express.urlencoded({
  extended: false
}));
app.use(cookieParser());


// mount the friend API under /antisocial
var antisocial = require('./index');


// Example database adaptor for persistant storage of users and friends
// adapt these abstract methods to your application
// data storage scheme

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

function setupAntisocialEvents(antisocialApp) {
  antisocialApp.on('new-friend-request', function (e) {
    console.log('antisocial new-friend-request %s %j', e.info.user.username, e.info.friend.remoteEndPoint);
  });

  antisocialApp.on('new-friend', function (e) {
    console.log('antisocial new-friend %s %j', e.info.user.username, e.info.friend.remoteEndPoint);
  });

  antisocialApp.on('friend-updated', function (e) {
    console.log('antisocial friend-updated %s %j', e.info.user.username, e.info.friend.remoteEndPoint);
  });

  antisocialApp.on('friend-deleted', function (e) {
    console.log('antisocial friend-deleted %s %j', e.info.user.username, e.info.friend.remoteEndPoint);
  });

  antisocialApp.on('open-activity-connection', function (e) {
    var friend = e.info.friend;
    var user = e.info.user;
    var socket = e.socket;

    console.log('antisocial new-activity-connection %j', e.info.key);

    // set up data handler. will be called whenever data is received on socket
    socket.antisocial.setDataHandler(function (data) {
      console.log('antisocial activity-data from %s to %s %j', friend.remoteName, user.name, data);
    });

    var data = JSON.stringify({
      'hello': friend.remoteName
    });

    var message = cryptography.encrypt(friend.remotePublicKey, friend.keys.private, data);

    e.socket.emit('data', message);
  });

  antisocialApp.on('close-activity-connection', function (e) {
    console.log('antisocial new-activity-connection %j', e.info.key);
  });

  antisocialApp.on('open-notification-connection', function (e) {
    console.log('antisocial new-notification-connection %j', e.info.key);
    e.socket.emit('data', {
      'hello': 'world'
    });
  });

  antisocialApp.on('close-notification-connection', function (e) {
    console.log('antisocial new-notification-connection %j', e.info.key);
  });
}

// user register route for tests
var router = express.Router();
router.all('/register', function (req, res) {
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

  var antisocialApp = antisocial(app, config, db, getAuthenticatedUser, listener);

  setupAntisocialEvents(antisocialApp);
};

app.stop = function () {
  server.close();
};

if (require.main === module) {
  app.start(3000);
}

module.exports = app;
