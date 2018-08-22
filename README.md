<img src="https://github.com/antiSocialNet/antiSocial/raw/master/assets/octocloud/logo.jpg" height="200">

# antiSocial

Building blocks for myAntiSocial.net

## antisocial-friends

This module mounts routes for any expressjs application that needs to support building and maintaining antisocial 'friend' relationships on the same server/application and/or across distributed servers and applications.

see tests/friend-protocol.js for example usage

```
var antisocial = require('antisocial-friends');
var antisocialApp = antisocial(app, config, db, getAuthenticatedUser);
```

### Parameters:

**app** is the express application

**config** is a javascript object with the following properties

```
var config = {
  'APIPrefix': '/antisocial', // where to mount the routes
  'publicHost': 'http://127.0.0.1:3000', // public protocol and host
  'port': 3000 // port this service is listening on (only used if behind a load balancer or reverse proxy)
}
```

**db** is an abstract data store that will be called when the app needs to
store or retrieve data from the database. For a simple example implementation
see app.js. Yours should implement the required methods to work within
your environment (mysql, mongo etc.)

This app uses the following data collections:

* users: username property is required to build urls
* friends: several properties maintained by the antisocial protocol
* invitations: use to simplify "be my friend" invitations
* blocks: list of blocked friends

friends, invitations and blocks are related to users by a foreign key userId
which is set to the user.id when created

**getAuthenticatedUser** is an express middleware function that gets the current
logged in user and exposes it on req.antisocialUser. This is application specific but typically would be a token cookie that can be used to look up a user. See simple example in app.js


This function returns an event emitter. You can handle the following events as needed. For example, to notify user about a friend request, start watching feeds etc.

```
antisocialApp.on('new-friend-request', function (e) {
  console.log('antisocial new-friend-request %j', e.friend.remoteEndPoint);
});

antisocialApp.on('friend-request-accepted', function (e) {
  console.log('antisocial friend-request-accepted %j', e.friend.remoteEndPoint);
});

antisocialApp.on('friend-updated', function (e) {
  console.log('antisocial friend-updated %j', e.friend.remoteEndPoint);
});

antisocialApp.on('friend-deleted', function (e) {
  console.log('antisocial friend-deleted %j', e.friend.remoteEndPoint);
});

```
