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
			trigger a 'new-friend' event for requestor application
		trigger a 'new-friend' event for requestee application
*/

module.exports = function (app, config, dbAdaptor, authUserMiddleware) {
	var router;

	if (app.loopback) {
		router = app.loopback.Router();
	}
	else {
		router = express.Router();
	}

	var antisocialApp = new events.EventEmitter();

	antisocialApp.router = router;
	antisocialApp.config = config;
	antisocialApp.db = dbAdaptor;
	antisocialApp.authUserMiddleware = authUserMiddleware;

	require('./routes/request-friend-cancel')(antisocialApp);
	require('./routes/request-friend')(antisocialApp);
	require('./routes/friend-request-accept')(antisocialApp);
	require('./routes/friend-request-decline')(antisocialApp);
	require('./routes/friend-request')(antisocialApp);
	require('./routes/friend-webhook')(antisocialApp);
	require('./routes/friend-update')(antisocialApp);
	require('./routes/friend-exchange-token')(antisocialApp);

	if (config.APIPrefix) {
		app.use(config.APIPrefix, router);
	}
	else {
		app.use(router);
	}

	app.antisocial = antisocialApp;

	return antisocialApp;
};
