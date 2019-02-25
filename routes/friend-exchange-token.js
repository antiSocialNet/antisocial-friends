// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

const async = require('async');
const debug = require('debug')('antisocial-friends');
const errorLog = require('debug')('errors');
const VError = require('verror').VError;
const WError = require('verror').WError;

module.exports = function mountFriendExchangeToken(antisocialApp) {

	var router = antisocialApp.router;
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	var exchangeRegex = /^\/([a-zA-Z0-9\-.]+)\/exchange-token$/;

	debug('mounting GET /username/exchange-token', exchangeRegex);

	router.post(exchangeRegex, function (req, res) {
		var matches = req.path.match(exchangeRegex);
		var username = matches[1];

		var endpoint = req.body.endpoint;
		var requestToken = req.body.requestToken;

		async.waterfall([
			function getUser(cb) {
				debug('/exchange-token getUser %s', username);
				db.getInstances('users', {
					'username': username
				}, function (err, userInstances) {
					if (err) {
						return cb(new VError(err, 'user not found'));
					}

					if (userInstances.length > 1) {
						return cb(new VError('more than one user matching username'));
					}

					cb(err, userInstances[0]);
				});
			},
			function findFriend(user, cb) {

				var query = {
					'userId': user.id.toString(),
					'localRequestToken': requestToken,
					'remoteEndPoint': endpoint
				};

				debug('/exchange-token findFriend %j', query);

				db.getInstances('friends', query, function (err, friendInstances) {
					if (err) {
						return cb(new VError(err, 'error reading friend'));
					}

					if (!friendInstances || !friendInstances.length) {
						return cb(new VError('friend not found'));
					}

					cb(null, user, friendInstances[0]);
				});
			}
		], function (err, user, friend) {
			if (err) {
				errorLog('/exchange-token error %s', err.message);
				var e = new WError(err, 'exchange token failed');
				return res.status(400).json(e.cause().message);
			}

			var payload = {
				'status': friend.status,
				'accessToken': friend.localAccessToken,
				'publicKey': friend.keypair.public,
				'name': user.name,
				'username': user.username,
				'community': user.community
			};

			res.json(payload);
		});
	});

};
