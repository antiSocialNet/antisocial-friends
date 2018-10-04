// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var async = require('async');
var debug = require('debug')('antisocial-friends');
var VError = require('verror').VError;
var WError = require('verror').WError;

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
				debug('/exchange-token getUser');
				db.getInstances('users', [{
					'property': 'username',
					'value': username
				}], function (err, userInstances) {
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
				debug('/exchange-token findFriend');

				db.getInstances('friends', [{
					'property': 'localRequestToken',
					'value': requestToken
				}], function (err, friendInstances) {
					if (err) {
						return cb(new VError(err, 'error reading friend'));
					}

					for (var i = 0; i < friendInstances.length; i++) {
						var friend = friendInstances[i];
						if (friend.remoteEndPoint === endpoint && user.id === friend.userId) {
							return cb(null, user, friend);
						}
					}

					cb(new VError('friend not found'));
				});
			}
		], function (err, user, friend) {
			if (err) {
				var e = new WError(err, 'exchange token failed');
				return res.status(400).send(e.cause().message);
			}

			var payload = {
				'status': friend.status,
				'accessToken': friend.localAccessToken,
				'publicKey': friend.keys.public,
				'name': user.name,
				'username': user.username,
				'community': user.community
			};

			res.send(payload);
		});
	});

};
