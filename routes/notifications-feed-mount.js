// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/*
	mount socket.io listener for incoming notifications connections (client)
*/

var debug = require('debug')('antisocial-friends');
var VError = require('verror').VError;
var IO = require('socket.io');
var IOAuth = require('socketio-auth');

module.exports = function notificationsFeedMount(antisocialApp, expressListener) {
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;


	if (!antisocialApp.openNotificationsListeners) {
		antisocialApp.openNotificationsListeners = {};
	}

	antisocialApp.ioNotifications = IO(expressListener, {
		'path': '/antisocial-notifications'
	});

	antisocialApp.ioNotifications.on('connect', function (e) {
		debug('/antisocial-notifications connect');
	});

	antisocialApp.ioNotifications.on('disconnect', function (e) {
		debug('/antisocial-notifications disconnect', e);
	});

	antisocialApp.ioNotifications.on('error', function (e) {
		debug('/antisocial-notifications error', e);
	});

	// user notification feed
	// authenticate with access_token cookie
	IOAuth(antisocialApp.ioNotifications, {
		'timeout': 60000,
		'authenticate': function (socket, data, callback) {
			debug('notificationsFeedMount authenticate');

			var cookie = require('cookie');
			var cookieParser = require('cookie-parser');

			if (!socket.handshake.headers.cookie) {
				return callback(null, false);
			}

			var cookies = cookie.parse(socket.handshake.headers.cookie);
			var signedCookies = cookieParser.signedCookies(cookies, config.secureCookiePassword);
			if (!signedCookies.access_token) {
				return callback(null, false);
			}

			var fakeReq = {
				'cookies': signedCookies
			};

			authUserMiddleware(fakeReq, null, function () {
				if (!fakeReq.antisocialUser) {
					return callback(new VError('not logged in'));
				}

				data.currentUser = fakeReq.antisocialUser;
				callback(null, true);
			});
		},
		'postAuthenticate': function (socket, data) {
			socket.antisocial = {
				'user': data.currentUser,
				'key': data.currentUser.username,
				'highwater': data.highwater || 0,
			};

			debug('notificationsFeedMount connection established %s', socket.antisocial.key);

			antisocialApp.openNotificationsListeners[socket.antisocial.key] = socket;

			antisocialApp.emit('open-notification-connection', {
				'info': socket.antisocial,
				'socket': socket
			});

			socket.on('data', function (data) {
				antisocialApp.emit('notification-data', {
					'info': socket.antisocial,
					'data': data
				});
			});

			socket.on('disconnect', function (reason) {
				debug('notificationsFeedMount disconnect %s %s', socket.antisocial.key, reason);
				antisocialApp.emit('close-notification-connection', {
					'info': socket.antisocial,
					'reason': reason
				});
				db.updateInstance('users', socket.antisocial.user.id, {
					'online': false
				});
				delete antisocialApp.openNotificationsListeners[socket.antisocial.key];
			});

			db.updateInstance('users', socket.antisocial.user.id, {
				'online': true
			});
		}
	});
};