// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/*
	establish a connection to a friend and subscribe to antisocial events
*/

var debug = require('debug')('antisocial-friends');
var url = require('url');
var IOClient = require('socket.io-client');
var cryptography = require('antisocial-encryption');


module.exports.connect = function activityFeedSubscribeConnect(antisocialApp, currentUser, friend) {
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	if (!antisocialApp.openActivityListeners) {
		antisocialApp.openActivityListeners = {};
	}

	var key = currentUser.username + '<-' + friend.remoteEndPoint;

	var remoteEndPoint = url.parse(friend.remoteEndPoint);
	var endpoint = remoteEndPoint.protocol === 'https:' ? 'wss' : 'ws';
	endpoint += '://' + remoteEndPoint.host;

	debug('attempting to subscribe to ' + endpoint + '/antisocial-activity');

	// open websocket connection
	var socket = IOClient(endpoint, {
		'path': '/antisocial-activity'
	});

	// once connected hookup events and authenticate
	socket.on('connect', function () {
		debug('client connected');

		socket.on('unauthorized', function (err) {
			debug('client unauthorized', err.message);
		});

		socket.on('error', function () {
			debug('client error');
		});

		socket.on('unauthorized', function (err) {
			debug('client unauthorized', err.message);
		});

		socket.on('authenticated', function () {
			debug('client authenticated');

			socket.antisocial = {
				'key': key,
				'friend': friend,
				'user': currentUser,
				'setDataHandler': function setDataHandler(handler) {
					socket.antisocial.dataHandler = handler;
				}
			};

			antisocialApp.openActivityListeners[socket.antisocial.key] = socket;

			antisocialApp.emit('open-activity-connection', {
				'info': socket.antisocial,
				'socket': socket
			});

			socket.on('data', function (data) {
				var decrypted = cryptography.decrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, data);
				if (!decrypted.valid) { // could not validate signature
					console.log('WatchNewsFeedItem decryption signature validation error:', decrypted.invalidReason);
					return;
				}

				try {
					data = JSON.parse(decrypted.data);
				}
				catch (e) {
					data = decrypted.data;
				}

				if (socket.antisocial.dataHandler) {
					socket.antisocial.dataHandler(data);
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

			db.updateInstance('friends', socket.antisocial.friend.id, {
				'online': true
			});

		});

		// perform authentication protocol
		debug('authenticating');
		socket.emit('authentication', {
			'username': friend.remoteUsername,
			'friendAccessToken': friend.remoteAccessToken,
			'friendHighWater': friend.highWater
		});
	});
};

module.exports.disconnect = function activityFeedSubscribeDisconnect(antisocialApp, config, dbAdaptor, currentUser, friend) {
	for (var key in antisocialApp.openActivityListeners) {
		var socket = antisocialApp.openActivityListeners[key];
		if (socket.data.friend.id.toString() === friend.id.toString()) {
			debug('disconnect %s', socket.data.connectionKey);
			socket.disconnect(true);
			delete antisocialApp.openActivityListeners[key];
		}
	}
};
