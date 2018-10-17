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
var refresh = require('./utilities').refresh;

module.exports = function (antisocialApp) {

	function activityFeedSubscribeConnect(currentUser, friend) {
		var db = antisocialApp.db;

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

				socket.antisocial.emitter = function (appId, eventType, data) {
					refresh(antisocialApp, socket, function (err) {
						if (err) {
							console.log('emitter socket data refresh error', err.message, err.cause().message);
							return;
						}

						var message = {
							'appId': appId,
							'data': data
						};
						debug('emitter (feed-subscribe)', eventType, message);
						message = cryptography.encrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, JSON.stringify(message));
						socket.emit(eventType, message);
					});
				};

				socket.on('highwater', function (data) {
					refresh(antisocialApp, socket, function (err) {
						if (err) {
							console.log('highwater event socket data refresh error', err.message, err.cause().message);
							return;
						}

						var decrypted = cryptography.decrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, data);
						if (!decrypted.valid) { // could not validate signature
							console.log('WatchNewsFeedItem decryption signature validation error:', decrypted.invalidReason);
							return;
						}

						data = decrypted.data;
						debug('%s subscribe got highwater from %s %s', socket.id, socket.antisocial.key, data);

						if (!decrypted.contentType || decrypted.contentType === 'application/json') {
							try {
								data = JSON.parse(decrypted.data);
							}
							catch (e) {
								data = decrypted.data;
							}
						}

						var appid = data.appId;
						antisocialApp.emit('activity-backfill-' + appid, socket.antisocial.user, socket.antisocial.friend, data.data, socket.antisocial.emitter);
					});
				});

				socket.on('data', function (data) {
					refresh(antisocialApp, socket, function (err) {
						if (err) {
							console.log('data event socket data refresh error', err.message, err.cause().message);
							return;
						}

						debug('%s /antisocial-activity data from %s', socket.id, socket.antisocial.key);

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

						var appid = data.appId;
						debug('%s emitting activity-data-' + appid, socket.id);
						antisocialApp.emit('activity-data-' + appid, socket.antisocial.user, socket.antisocial.friend, data.data);
					});
				});

				socket.on('disconnect', function (reason) {
					refresh(antisocialApp, socket, function (err) {
						if (err) {
							console.log('disconnect event socket data refresh error', err.message, err.cause().message);
							return;
						}

						antisocialApp.emit('close-activity-connection', socket.antisocial.user, socket.antisocial.friend, reason, socket.antisocial);

						/*
						db.updateInstance('friends', socket.antisocial.friend.id, {
							'online': false
						});
						*/

						delete antisocialApp.openActivityListeners[socket.antisocial.key];
					});
				});

				antisocialApp.emit('open-activity-connection', socket.antisocial.user, socket.antisocial.friend, socket.antisocial.emitter, socket.antisocial);

				/*
				db.updateInstance('friends', socket.antisocial.friend.id, {
					'online': true
				});
				*/
			});

			// perform authentication protocol
			debug('%s subscribe authenticating', socket.id);
			socket.emit('authentication', {
				'username': friend.remoteUsername,
				'friendAccessToken': friend.remoteAccessToken
			});
		});
	}

	function activityFeedSubscribeDisconnect(currentUser, friend, cb) {
		for (var key in antisocialApp.openActivityListeners) {
			var socket = antisocialApp.openActivityListeners[key];
			if (socket.antisocial.friend.id.toString() === friend.id.toString()) {
				debug('%s subscribe disconnect %s', socket.id, socket.antisocial.key);
				socket.disconnect(true);
				delete antisocialApp.openActivityListeners[key];
				return cb(null);
			}
		}
		return cb(new Error('activityFeedSubscribeDisconnect not connected'));
	}

	return {
		'connect': activityFeedSubscribeConnect,
		'disconnect': activityFeedSubscribeDisconnect
	};

};
