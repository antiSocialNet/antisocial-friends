debug // Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var events = require('events');
var VError = require('verror').VError;
var WError = require('verror').WError;
var uuid = require('uuid');
var async = require('async');
var debug = require('debug')('antisocial-im');

/*
	the originator is friends with everyone in the session. other memners are
	not nessesarily friends with eachother. In order to perform encryption
	the originator of the session is the only one that can send messages
	to everyone in the session so all messages have to flow through the originator.

	Only the originator can add users to the session.

	Any participant can drop out of the session at any time. If it is the originator
	the entire session is destroyed.

	Originator calls POST /im to make session

	Originator calls POST /im/sessionId/member to add friend to imsession
		Notify all imsession members that user has been added
			on each member's server
				if added user is self
					create an imsessions instance
				else
					add user to imsession

	Any imsession member call DELETE /im/sessionId/member to remove self from imsession
		Notify session members that user has been removed
			on each member's server
				if removed user is self
					delete imsessions instance
				else
					delete user from imsession

	Any session member call POST /im/sessionId
		create im
			if auhor is session originator bradcast it to members
			else send it to session originator for broadcast

*/

module.exports.init = function (antisocialApp, user, cb) {

	var router = antisocialApp.router;
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	/*
		POST /im - create a IM session

		post body
			name: name for IM session
	*/
	router.post('/im', authUserMiddleware, function (req, res) {


		// must be a logged in user
		var currentUser = req.antisocialUser;
		if (!currentUser) {
			debug('not logged in');
			return res.sendStatus(401);
		}

		var myEndPoint = config.publicHost + config.APIPrefix + '/' + currentUser.username;

		var data = {
			'uuid': uuid(),
			'name': req.body.name,
			'userId': currentUser.id,
			'originator': true,
			'originatorEndPoint': myEndPoint,
			'members': []
		};

		antisocialApp.db.newInstance('imsessions', data, function (err, sessionInstance) {
			if (err) {
				debug('could not create imsession', err);
				return res.sendStatus(500);
			}
			res.send({
				'status': 'ok',
				'session': sessionInstance.uuid
			});
		});
	});

	var imRegex = /^\/im\/([a-zA-Z0-9\-.]+)/;
	var imSessionRegex = /^\/im\/([a-zA-Z0-9\-.]+)\/friend/;

	/*
		IM session management

		POST /im/session/member - add member to session
		DELETE /im/session/member - delete member from session

		post body
			endpoint - endpoint of member
	*/
	router.post(imSessionRegex, authUserMiddleware, getSessionMiddleware(imRegex), function (req, res) {

		// must be a logged in user
		var currentUser = req.antisocialUser;
		if (!currentUser) {
			debug('not logged in');
			return res.sendStatus(401);
		}

		// session must exist
		if (!req.imSession) {
			debug('session not found');
			return res.sendStatus(404);
		}

		// must be originator of session
		if (!req.imSession.originator) {
			debug('not originator');
			return res.sendStatus(401);
		}

		// body.endpoint is required
		if (!req.body.endpoint) {
			debug('missing body.endpoint');
			return res.sendStatus(400);
		}

		// body.endpoint must be member of session
		if (req.imSession.friends.indexOf(req.body.endpoint) !== -1) {
			debug(req.body.endpoint + ' is already a member of imsession');
			return res.sendStatus(400);
		}

		antisocialApp.db.getInstances('friends', [{
			'property': 'remoteEndPoint',
			'value': req.body.endpoint
		}, {
			'property': 'userId',
			'value': user.id
		}], function (err, friendInstances) {
			if (err) {
				return res.sendStatus(500);
			}

			// must be a friend
			if (!friendInstances || !friendInstances.length) {
				return res.sendStatus(404);
			}

			var friend = friendInstances[0];
			req.imSession.friends.push(friend.remoteEndPoint);

			antisocialApp.db.updateInstance('imsessions', req.imSession.id, {
				'friends': req.imSession.friends
			}, function (err) {
				if (err) {
					return res.sendStatus(500);
				}

				res.send({
					'status': 'ok'
				});
			});
		});
	});

	router.delete(imSessionRegex, authUserMiddleware, getSessionMiddleware(imRegex), function (req, res) {
		// must be a logged in user
		var currentUser = req.antisocialUser;
		if (!currentUser) {
			debug('not logged in');
			return res.sendStatus(401);
		}

		// session must exist
		if (!req.imSession) {
			debug('session not found');
			return res.sendStatus(404);
		}

		// body.endpoint is required
		if (!req.body.endpoint) {
			debug('missing body.endpoint');
			return res.sendStatus(400);
		}

		// body.endpoint must be member of session
		if (req.imSession.friends.indexOf(req.body.endpoint) === -1) {
			debug(req.body.endpoint + ' is not a member of imsession');
			return res.sendStatus(404);
		}

		// update the imsession
		req.imSession.friends.splice(req.imSession.friends.indexOf(req.body.endpoint), 1);

		antisocialApp.db.updateInstance('imsessions', req.imSession.id, {
			'friends': req.imSession.friends
		}, function (err) {
			if (err) {
				return res.sendStatus(500);
			}
			res.send({
				'status': 'ok'
			});
		});
	});

	/*
		post messages to session

		POST /im/session

		post body
			message: markdown string
	*/
	router.post(imRegex, authUserMiddleware, getSessionMiddleware(imRegex), function (req, res) {

		// must be a logged in user
		var currentUser = req.antisocialUser;
		if (!currentUser) {
			debug('not logged in');
			return res.sendStatus(401);
		}

		if (!req.imSession) {
			debug('session not found');
			return res.sendStatus(404);
		}

		var myEndPoint = config.publicHost + config.APIPrefix + '/' + currentUser.username;

		var data = {
			'uuid': uuid(),
			'userId': currentUser.id,
			'sessionId': req.imSession.id,
			'source': myEndPoint,
			'body': req.body.body
		};

		antisocialApp.db.newInstance('ims', data, function (err, imInstance) {
			if (err) {
				debug('could not create im', err);
				return res.sendStatus(500);
			}
			res.send({
				'status': 'ok',
				'session': imInstance.uuid
			});
		});
	});

	function getSession(user, sessionId, cb) {
		antisocialApp.db.getInstances('imsessions', [{
			'property': 'uuid',
			'value': sessionId
		}, {
			'property': 'userId',
			'value': user.id
		}], function (err, sessionInstances) {
			if (err) {
				return cb(err);
			}
			if (!sessionInstances || !sessionInstances.length !== 1) {
				cb(new Error('session not found'));
			}
			cb(null, sessionInstances[0]);
		});
	}

	function getSessionMiddleware(pattern) {
		return function sessionMiddleware(req, res, next) {
			var currentUser = req.antisocialUser;
			if (!currentUser) {
				return next();
			}
			var matches = req.path.match(pattern);
			var sessionId = matches[1];
			getSession(currentUser, sessionId, function (err, session) {
				if (!err) {
					req.imSession = session;
				}
				next();
			});
		};
	}

	antisocialApp.on('update-imsession', function (data) {
		debug('db update event for imsession %s', data.id);
		if (data.originator) {
			async.waterfall([
				function getUser(cb) { // get user from imsession
					antisocialApp.db.getInstances('users', [{
						'property': 'id',
						'value': data.userId
					}], function (err, userInstances) {
						if (err) {};
						if (!userInstances || !userInstances.length === 1) {}
						cb(null, user);
					});
				},
				function getMembers(user, cb) {
					async.map(data.members, function (member, doneMap) {
						antisocialApp.db.getInstances('friends', [{
							'property': 'remoteEndPoint',
							'value': member
						}, {
							'property': 'userId',
							'value': user.id
						}], function (err, friendInstances) {
							doneMap(err, friendInstances);
						});
					}, function (err) {
						cb(err);
					});
				},
				function broadcast(user, friends, doneBroadcast) {
					async.map(friends, function (friend, doneMap) {
						var emitter = antisocialApp.getActivityEmitter(this.data.user, friend);
						if (emitter) {
							emitter('im', 'data', {
								'action': 'changed',
								'members': data.members
							});
						}
						doneMap();
					}, function (err) {
						doneBroadcast(err);
					});
				}
			], function (err) {
				// done processing update-imsession event
			});
		}
	});

	antisocialApp.on('delete-imsession', function (data) {
		debug('db delete event for imsession %s', data.id);
		// TODO
		// if originator send 'removed' to all
		// else send 'removed' to originator
	});

	antisocialApp.on('create-im', function (data) {
		debug('db create event for im %s', data.id);
	});

	antisocialApp.on('update-im', function (data) {
		debug('db update event for im %s', data.id);
	});

	antisocialApp.on('delete-im', function (data) {
		debug('db delete event for im %s', data.id);
	});

	/*
		im notification events

		data
			uuid
			action [changed|message]
			sessionId - the uuid of the session
			sessionName - the name of the session
			originator - the creator of the im session
			members - for 'changed' the endpoints of the members
			source - for message, the sender.
			message
	*/

	antisocialApp.on('notification-data-im', function (user, friend, data) {
		async.waterfall([
				function (cb) {
					// get session instance
					getSession(user, data.sessionId, function (err, session) {
						cb(err, session);
					});
				},
				function (session, cb) {
					// get my friend instance for the originator
					antisocialApp.db.getInstances('friends', [{
						'property': 'userId',
						'value': user.id
					}, {
						'property': 'remoteEndPoint',
						'value': data.originator
					}], function (err, friends) {
						if (err || !friends.length) {
							debug('originator not found in friends');
							return cb(new VError('originator no found in friends'));
						}
						return (null, session, friends[0]);
					});
				},
				function (session, originator, cb) {
					// originator not our friend? ignore.
					if (!originator) {
						return cb(null, session, originator);
					}

					var myEndPoint = config.publicHost + config.APIPrefix + '/' + user.username;
					var inSession = (data.members.indexOf(myEndPoint) === -1);

					// if we are in sthe ession members list but no session exists, create an imsession
					if (!session && inSession) {

						var data = {
							'uuid': data.sessionId,
							'name': data.sessionName,
							'userId': currentUser.id,
							'originator': false,
							'originatorEndPoint': data.originator,
							'members': data.members
						};

						antisocialApp.db.newInstance('imsessions', data, function (err, sessionInstance) {
							if (err) {
								debug('could not create imsession', err);
								cb(new Error('Could not create imsession'));
								return res.sendStatus(500);
							}
							cb(null, sessionInstance, originator)
						});
					}
					// we are not in the session members list but session exists so we sere, delete session
					else if (session && !inSession) {
						async.waterfall([
							function findIms(doneFindIms) {
								antisocialApp.db.getInstances('ims', [{
									'property': 'sessionId',
									'value': session.id
								}], function (err, ims) {
									if (err) {
										return doneFindIms(new VError(err, 'error finding ims'));
									}
									doneFindIms(null, ims);
								});
							},
							function deleteIms(ims, doneDeleteIms) {
								async.map(ims, function (im, doneMap) {
									antisocialApp.db.deleteInstance('ims', im.id, function (err) {
										if (err) {
											return doneMap(new VError(err, 'error deleting im'));
										}
										doneMap();
									})
								}, function (err) {
									if (err) {
										return doneMap(new VError(err, 'error deleting ims and sessions'));
									}
									doneDeleteIms();
								});
							},
							function deleteSession(doneDeleteSession) {
								antisocialApp.db.deleteInstance('imsessions', session.id, function (err) {
									if (err) {
										return doneDeleteSession(new VError(err, 'error deleting imsession'));
									}
									doneDeleteSession();
								})
							}
						], function (err) {
							if (err) {
								debug('error deleting im data');
								cb(new VError(err, 'error deleting im data'));
							}
							cb();
						})
					}
					else {
						//todo update session members
					}
				}
			],
			function (session, originator, err) {
				if (action === 'message') {
					if (session.originator) {
						async.map(session.members, function (friend, doneMap) {
							var emitter = antisocialApp.getActivityEmitter(this.data.user, {
								'remoteEndPoint': friend
							});
							if (emitter) {
								emitter('im', 'data', message);
							}
							doneMap();
						}, function (err) {
							// done broadcasting
						});
					}
					else {
						var emitter = antisocialApp.getActivityEmitter(this.data.user, {
							'remoteEndPoint': session.originatorEndPoint
						});
						if (emitter) {
							emitter('im', 'data', message);
						}
					}
				}
			});
	});

	antisocialApp.on('notification-backfill-im', function (user, friend, highwater, emitter) {

	});

};

/*
function activeChat(antisocialApp, user, originator, id) {
	events.EventEmitter.call(this);

	this.instance = null;
	this.messages = [];
	this.chatOriginator = originator; // friend who originated chat

	this.data = {
		'friends': [],
		'audiences': [],
		'userId': user.id,
		'originatorId': originator ? originator.id : null
	};

	antisocialApp.db.newInstance('chats', this.data, function (err, chatInstance) {
		if (err) {
			var e = new VError(err, 'imApp.createChat failed');
			return this.emit('error', e);
		}
		this.instance = chatInstance;

		// message from user
		// broadcast to everyone in chat
		antisocialApp.on('notification-data-im-' + chatInstance.id.toString(), function (user, data) {
			console.log('notification-data-im-' + chatInstance.id.toString() + ' user: %s data: %j', user.name, data);
			if (!this.chatOriginator) {
				this.broadcast(data);
			}
			else {
				this.sendToOriginator(data);
			}
		});

		// messages received from others in chat
		// broadcast to everyone in chat if we are the originator
		antisocialApp.on('activity-data-im-' + chatInstance.id.toString(), function (user, friend, data) {
			console.log('activity-data-im-' + chatInstance.id.toString() + ' user: %s data: %j', user.name, data);
			if (!this.chatOriginator) {
				this.broadcast(data);
			}
			var emitters = antisocialApp.getNotificationEmitters(this.data.user);
			for (var i = 0; i < emitters.length; i++) {
				emitters[i]('im', 'data', data);
			}
		});

		return this.emit('ready', e);
	});

	this.destroy = function () {
		console.log('ChatGroup.destroy not implemented');
	};

	this.addFriend = function (friend) {
		this.data.friends.push(friend);

		// todo - send activity to friend to initiate
	};

	this.removeFriend = function (friend) {
		var index = -1;
		for (var i = 0; i < this.data.friends.length; i++) {
			if (this.data.friends[i].id.toString() === friend.id.toString()) {
				index = i;
				break;
			}
		}
		if (index !== -1) {
			this.data.friends.splice(index, 1);
		}
	};

	this.addAudience = function (audience) {
		this.data.audiences.push(audience);
	};

	this.removeAudience = function (audience) {
		var index = this.data.audiences.indexOf(audience);
		if (index !== -1) {
			this.data.audiences.splice(index, 1);
		}
	};

	this.sendToOriginator = function (message) {

	}

	this.broadcast = function (message, cb) {
		this.messages.push(message);
		this.collectFriends(function (err, friends) {
			async.map(friends, function (friend, doneMap) {
				var emitter = antisocialApp.getActivityEmitter(this.data.user, friend);
				if (emitter) {
					emitter('im', 'data', message);
				}
				doneMap();
			}, function (err) {
				cb(err);
			});
		});
	};

	this.collectFriends = function (cb) {
		var targets = [];
		for (var i = 0; i < this.data.friends.length; i++) {
			targets.push(this.data.friends[i]);
		}
		async.series([
			function collectFriends(done) {
				async.map(this.data.audiences, function (audience, doneMap) {
					antisocialApp.db.getInstances('friends', [{
						'property': 'userId',
						'value': this.data.user.id
					}], function (err, friends) {
						for (var i = 0; i < friends.length; i++) {
							if (targets.indexOf(friends[i].remoteEndPoint) === -1) {
								if (friends[i].audiences.indexOf(audience) !== -1) {
									targets.push(this.data.friends[i]);
								}
							}
						}
						doneMap(null);
					});
				}, function (err) {
					done(err);
				});
			},

		], function (err) {
			cb(err, targets);
		});
	};

}
module.exports.activeChat = activeChat;
*/
