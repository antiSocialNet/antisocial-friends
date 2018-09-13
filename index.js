// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

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

	var antisocialApp = new events.EventEmitter();

	antisocialApp.router = router;
	antisocialApp.config = config;
	antisocialApp.db = dbAdaptor;
	antisocialApp.authUserMiddleware = authUserMiddleware;
	antisocialApp.activityFeed = require('./lib/activity-feed-subscribe')(antisocialApp);
	antisocialApp.behaviors = {};
	antisocialApp.addBehavior = function (id, behavior) {
		antisocialApp.behaviors[id] = behavior;
	};

	antisocialApp.listen = function (listener) {
		require('./routes/activity-feed-mount')(antisocialApp, listener);
		require('./routes/notifications-feed-mount')(antisocialApp, listener);
	};

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
