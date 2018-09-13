// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/*
	establish a connection to a friend and subscribe to antisocial events
*/

var debug = require('debug')('antisocial-friends:activity');
var url = require('url');
var IOClient = require('socket.io-client');
var cryptography = require('antisocial-encryption');
var moment = require('moment');

module.exports = function (antisocialApp) {

	function activityFeedSubscribeConnect(currentUser, friend) {
		var config = antisocialApp.config;
		var db = antisocialApp.db;
		var authUserMiddleware = antisocialApp.authUserMiddleware;

		if (!antisocialApp.openActivityListeners) {
			antisocialApp.openActivityListeners = {};
		}

		var key = currentUser.username + '<-' + friend.remoteEndPoint;

		if (antisocialApp.openActivityListeners[key]) {
			debug('subscribe aborted, already connected %s', key);
			return;
		}

		var remoteEndPoint = url.parse(friend.remoteEndPoint);
		var endpoint = remoteEndPoint.protocol === 'https:' ? 'wss' : 'ws';
		endpoint += '://' + remoteEndPoint.host;

		debug('subscribe to ' + endpoint + '/antisocial-activity key:' + key);

		// open websocket connection, automatic reconnection disabled
		var socket = IOClient(endpoint, {
			'path': '/antisocial-activity',
			'reconnection': false
		});

		// once connected hookup events and authenticate
		socket.on('connect', function () {
			debug('%s subscribe client connected', socket.id);

			socket.on('unauthorized', function (err) {
				debug('%s subscribe client unauthorized', socket.id, err.message);
			});

			socket.on('error', function () {
				debug('%s subscribe client error', socket.id);
			});

			socket.on('authenticated', function () {
				debug('%s subscribe client authenticated', socket.id);

				socket.antisocial = {
					'key': key,
					'friend': friend,
					'user': currentUser
				};

				antisocialApp.openActivityListeners[socket.antisocial.key] = socket;

				socket.antisocial.emitter = function (data) {
					var message = cryptography.encrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, JSON.stringify(data));
					socket.emit('data', message);
				};

				antisocialApp.emit('open-activity-connection', socket.antisocial.user, socket.antisocial.friend, socket.antisocial.emitter, socket.antisocial);

				socket.on('highwater', function (highwater) {
					debug('%s subscribe got highwater from %s %s', socket.id, socket.antisocial.key, highwater);
					if (socket.antisocial.backfillHandler) {
						socket.antisocial.backfillHandler({
							'info': socket.antisocial,
							'highwater': highwater
						});
					}
				});

				socket.on('data', function (data) {
					var decrypted = cryptography.decrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, data);
					if (!decrypted.valid) { // could not validate signature
						console.log('WatchNewsFeedItem decryption signature validation error:', decrypted.invalidReason);
						return;
					}

					data = decrypted.data;

					if (!decrypted.contentType || decrypted.contentType === 'application/json') {
						try {
							data = JSON.parse(decrypted.data);
						}
						catch (e) {
							data = decrypted.data;
						}
					}

					for (var appid in antisocialApp.behaviors) {
						var app = antisocialApp.behaviors[appid];
						if (app.activityDataHandlerFactory) {
							app.activityDataHandlerFactory(socket.antisocial.user, socket.antisocial.friend)(data);
						}
					}
				});

				socket.on('disconnect', function (reason) {
					antisocialApp.emit('close-activity-connection', {
						'info': socket.antisocial,
						'reason': reason
					});

					db.updateInstance('friends', socket.antisocial.friend.id, {
						'online': false
					});

					delete antisocialApp.openActivityListeners[socket.antisocial.key];
				});

				socket.emit('highwater', socket.antisocial.friend.highWater ? socket.antisocial.friend.highWater : moment().subtract(7, 'd').toISOString());

				db.updateInstance('friends', socket.antisocial.friend.id, {
					'online': true
				});
			});

			// perform authentication protocol
			debug('%s subscribe authenticating', socket.id);
			socket.emit('authentication', {
				'username': friend.remoteUsername,
				'friendAccessToken': friend.remoteAccessToken
			});
		});
	}

	function activityFeedSubscribeDisconnect(currentUser, friend) {
		for (var key in antisocialApp.openActivityListeners) {
			var socket = antisocialApp.openActivityListeners[key];
			if (socket.antisocial.friend.id.toString() === friend.id.toString()) {
				debug('%s subscribe disconnect %s', socket.id, socket.antisocial.key);
				socket.disconnect(true);
				delete antisocialApp.openActivityListeners[key];
			}
		}
	}

	return {
		'connect': activityFeedSubscribeConnect,
		'disconnect': activityFeedSubscribeDisconnect
	};

};
