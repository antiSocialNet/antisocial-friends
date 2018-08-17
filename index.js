var express = require('express');
var events = require('events');


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
