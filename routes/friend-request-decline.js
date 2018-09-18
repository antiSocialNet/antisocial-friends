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

module.exports = function mountFriendRequestDecline(antisocialApp) {

	var router = antisocialApp.router;
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	var declineRegex = /^\/([a-zA-Z0-9\-.]+)\/friend-request-decline$/;

	debug('mounting GET /username/friend-request-decline', declineRegex);

	router.post(declineRegex, authUserMiddleware, function handleFriendRequestDecline(req, res) {
		var matches = req.path.match(declineRegex);
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
				debug('/friend-request-decline findFriend');
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
				debug('/friend-request-decline callWebhook');

				var payload = {
					'accessToken': friend.remoteAccessToken,
					'action': 'friend-request-declined'
				};

				var options = {
					'url': fixIfBehindProxy(friend.remoteEndPoint + '/friend-webhook'),
					'form': payload,
					'json': true
				};

				request.post(options, function (err, response, body) {
					if (err) {
						return cb(new VError(err, '/friend-request-decline callWebhook failed'));
					}
					if (response.statusCode !== 200) {
						return cb(new VError('/friend-request-decline callWebhook http error ' + response.statusCode));
					}
					if (_.get(body, 'status') !== 'ok') {
						return cb(new VError('/friend-request-decline callWebhook unexpected result %j' + body));
					}

					cb(null, friend);
				});
			},
			function updateFriend(friend, cb) {

				db.deleteInstance('friends', friend.id, function (err) {
					if (err) {
						var e = new VError(err, '/friend-request-decline updateFriend error');
						return cb(e);
					}

					cb(null);
				});
			}
		], function (err) {
			if (err) {
				var e = new WError(err, '/friend-request-decline failed');
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
