<img src="https://github.com/antiSocialNet/antiSocial/raw/master/assets/octocloud/logo.jpg" height="200">

# antiSocial

## antisocial-friends

This module mounts routes for any expressjs application that needs to support building and maintaining antisocial 'friend' relationships.

```
	var antisocial = require('antisocial-friends');
	var config = {
	  'APIPrefix': '/antisocial', // where to mount the routes
	  'publicHost': 'http://127.0.0.1:3000', // public protocol and host
	  'port': 3000 // port this service is listening on (only used if behind a load balancer or reverse proxy)
	}

```

'db' is an abstract data store that will be called when the app needs to
store or retrieve data from the database. For a simple example implementation
see lib/utilites.js. Yours should implement the required methods to work within
your environment (mysql, mongo etc.)

This app uses the following data collections:
	users: username property is required to build urls
	friends: several properties maintained by the antisocial protocol
	invitations: use to simplify "be my friend" invitations
	blocks: list of blocked friends

	friends, invitations and blocks are related to users by a foreign key userId
	which is set to the user.id when created

'getAuthenticatedUser' is an express middleware function that gets the current
logged in user and exposes it on req.antisocialUser. This is application specific but typically would be a token cookie that can be used to look up a user. See simple example in lib/utilites.js

```
	var antisocialApp = antisocial(app, config, db, getAuthenticatedUser);
```

this returns an event emitter. You can handle the following events as needed:

```
	antisocialApp.on('new-friend-request', function (e) {
	  console.log('antisocial new-friend-request %j', e);
	});

	antisocialApp.on('friend-request-accepted', function (e) {
	  console.log('antisocial new-friend-request %j', e);
	});
```
