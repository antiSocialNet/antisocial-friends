var express = require('express');
var events = require('events');

/*
	protocol for making a friend request
  ------------------------------------
	requester sets up pending Friend on server (/request-friend)
		requester call requestee with requestToken
			requestee sets up pending Friend record on requestee's server (/friend-request)
			requestee call requester to exchange the requestToken for accessToken and publicKey (/friend-exchange-token)
			requestee returns requestToken to requester
			requestee triggers 'new-friend-request' event for requestee application
		requester calls requestee to exchange requestToken for accessToken and publicKey (/friend-exchange-token)

	protocol for accepting a friend request
	---------------------------------------
	requestee marks requester as accepted and grants access to 'public' and 'friends' (/friend-request-accept)
		requestee calls requester to update status (/friend-webhook action=friend-request-accepted)
			requester marks requestee as accepted and grants access to 'public' and 'friends'
			trigger a 'friend-request-accepted' event for requestor application
*/

module.exports = function (app, config, dbAdaptor, authUserMiddleware) {
	var router;

	if (app.loopback) {
		router = app.loopback.Router();
	}
	else {
		router = express.Router();
	}

	router.eventHandler = new events.EventEmitter();

	require('./routes/request-friend-cancel')(router, config, dbAdaptor, authUserMiddleware);
	require('./routes/request-friend')(router, config, dbAdaptor, authUserMiddleware);

	require('./routes/friend-request-accept')(router, config, dbAdaptor, authUserMiddleware);
	require('./routes/friend-request-decline')(router, config, dbAdaptor, authUserMiddleware);
	require('./routes/friend-request')(router, config, dbAdaptor, authUserMiddleware);

	require('./routes/friend-webhook')(router, config, dbAdaptor, authUserMiddleware);
	require('./routes/friend-update')(router, config, dbAdaptor, authUserMiddleware);

	require('./routes/friend-exchange-token')(router, config, dbAdaptor, authUserMiddleware);


	if (config.APIPrefix) {
		app.use(config.APIPrefix, router);
	}
	else {
		app.use(router);
	}

	return router.eventHandler;
}
