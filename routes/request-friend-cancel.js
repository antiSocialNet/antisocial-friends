// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var fixIfBehindProxy = require('../lib/utilities').fixIfBehindProxy;
var debug = require('debug')('antisocial-friends');
var VError = require('verror').VError;
var WError = require('verror').WError;
var async = require('async');
var request = require('request');
var _ = require('lodash');

module.exports = function mountRequestFriendCancel(antisocialApp) {

	var router = antisocialApp.router;
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	var cancelRegex = /^\/([a-zA-Z0-9\-.]+)\/request-friend-cancel$/;

	debug('mounting GET /username/request-friend-cancel', cancelRegex);

	router.post(cancelRegex, authUserMiddleware, function handleRequestFriendCancel(req, res) {
		var matches = req.path.match(cancelRegex);
		var username = matches[1];

		var endpoint = req.body.endpoint;

		if (!endpoint) {
			debug('endpoint not supplied');
			return res.status(400).send('endpoint not supplied');
		}

		if (!endpoint.match(/(^|\s)((https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)/gi)) {
			debug('endpoint not a valid url');
			return res.status(400).send('endpoint not a valid url');
		}

		// must be a logged in user
		var currentUser = req.antisocialUser;
		if (!currentUser) {
			debug('not logged in');
			return res.sendStatus(401);
		}

		// by convention expects user to match username
		if (currentUser.username !== username) {
			debug('username mismatch');
			return res.status(400).send('username mismatch');
		}

		async.waterfall([
			function findFriend(cb) {
				debug('/request-friend-cancel findFriend');
				db.getInstances('friends', [{
					'property': 'userId',
					'value': currentUser.id
				}, {
					'property': 'remoteEndPoint',
					'value': req.body.endpoint
				}], function (err, friendInstances) {
					if (err) {
						return cb(new VError(err, 'error reading friends'));
					}

					if (friendInstances.length !== 1) {
						return cb(new VError(err, 'friend request not found'));
					}

					cb(null, friendInstances[0]);
				});
			},
			function callWebHook(friend, cb) {
				debug('/request-friend-cancel callWebhook');

				var payload = {
					'accessToken': friend.remoteAccessToken,
					'action': 'request-friend-cancel'
				};

				var options = {
					'url': fixIfBehindProxy(antisocialApp, friend.remoteEndPoint + '/friend-webhook'),
					'form': payload,
					'json': true
				};

				request.post(options, function (err, response, body) {
					if (err) {
						return cb(new VError(err, '/request-friend-cancel callWebhook failed'));
					}
					if (response.statusCode !== 200) {
						return cb(new VError('/request-friend-cancel callWebhook http error ' + response.statusCode));
					}
					if (_.get(body, 'status') !== 'ok') {
						return cb(new VError('/request-friend-cancel callWebhook unexpected result %j', body));
					}

					cb(null, friend);
				});
			},
			function updateFriend(friend, cb) {
				db.deleteInstance('friends', friend.id, function (err) {
					if (err) {
						var e = new VError(err, '/request-friend-cancel updateFriend error');
						return cb(e);
					}

					cb(null);
				});
			}
		], function (err) {
			if (err) {
				var e = new WError(err, '/request-friend-cancel failed');
				return res.send({
					'status': 'error',
					'reason': e.message,
					'details': e.cause().message
				});
			}

			res.send({
				'status': 'ok'
			});
		});
	});
};
