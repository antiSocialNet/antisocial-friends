var express = require('express');
var events = require('events');

/*
	mount routes for building and maintaining 'friend' relationships.

	var antisocial = require('antisocial-friends');
	var config = {
	  'APIPrefix': '/antisocial', // where to mount the routes
	  'publicHost': 'http://127.0.0.1:3000', // public protocol and host
	  'port': 3000 // port this service is listening on (only used if behind a load balancer or reverse proxy)
	}

	'db' is an abstract data store that will be called when the app needs to
	store or retrieve data from the database. For a simple example implementation
	see utilites.js. Yours should implement the required methods to work within
	your enviroment (mysql, mongo etc.)

	This app uses the following data collections:
		users: username property is required to build urls
		friends: several properties maintained by the antisocial protocol
		invitations: use to simplify "be my friend" invitations
		blocks: list of blocked friends

		friends,invitations and blocks are related to users by a foreign key userId
		which is set to the user.id when created

	'getAuthenticatedUser' is an express middleware function that gets the current
	logged in user. This is application specific but typically would be a cookie
	that can be used to look up a user.

	var antisocialApp = antisocial(app, config, db, getAuthenticatedUser);

	this returns an event emitter. You can handle the following events as needed:

	antisocialApp.on('new-friend-request', function (e) {
	  console.log('antisocial new-friend-request %j', e);
	});

	antisocialApp.on('friend-request-accepted', function (e) {
	  console.log('antisocial new-friend-request %j', e);
	});

*/

module.exports = function (app, config, dbAdaptor, authUserMiddleware) {
	var router = express.Router();

	router.eventHandler = new events.EventEmitter();

	require('./routes/request-friend-cancel')(router, config, dbAdaptor, authUserMiddleware);
	require('./routes/request-friend')(router, config, dbAdaptor, authUserMiddleware);

	require('./routes/friend-request-accept')(router, config, dbAdaptor, authUserMiddleware);
	require('./routes/friend-request-decline')(router, config, dbAdaptor, authUserMiddleware);
	require('./routes/friend-request')(router, config, dbAdaptor, authUserMiddleware);

	require('./routes/friend-webhook')(router, config, dbAdaptor, authUserMiddleware);
	require('./routes/friend-update')(router, config, dbAdaptor, authUserMiddleware);

	require('./routes/friend-exchange-token')(router, config, dbAdaptor, authUserMiddleware);


	app.use(config.APIPrefix, router);

	return router.eventHandler;
}
