var express = require('express');
var events = require('events');

module.exports = function (app, config, dbAdaptor, authUserMiddleware, listener) {
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

	if (listener) {
		require('./routes/websockets-activity-mount')(antisocialApp, listener);
	}

	if (config.APIPrefix) {
		app.use(config.APIPrefix, router);
	}
	else {
		app.use(router);
	}

	app.antisocial = antisocialApp;

	return antisocialApp;
};
