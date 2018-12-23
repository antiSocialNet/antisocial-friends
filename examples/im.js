// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var events = require('events');
var VError = require('verror').VError;
var WError = require('verror').WError;
var uuid = require('uuid');
var async = require('async');
var debug = require('debug')('antisocial-im');

/*
	the originator is friends with everyone in the session. other members are
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

module.exports.init = function (antisocialApp) {

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

	var imRegex = /^\/im\/([a-zA-Z0-9\-.]+)$/;

	/*
		IM session management

		PUT /im/session - add member to session
		DELETE /im/session - delete member from session

		post body
			endpoint - endpoint of member
	*/
	router.put(imRegex, authUserMiddleware, getSessionMiddleware(imRegex), function (req, res) {

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
		if (req.imSession.members.indexOf(req.body.endpoint) !== -1) {
			debug(req.body.endpoint + ' is already a member of imsession');
			return res.sendStatus(400);
		}

		antisocialApp.db.getInstances('friends', [{
			'property': 'remoteEndPoint',
			'value': req.body.endpoint
		}, {
			'property': 'userId',
			'value': currentUser.id
		}], function (err, friendInstances) {
			if (err) {
				return res.sendStatus(500);
			}

			// must be a friend
			if (!friendInstances || !friendInstances.length) {
				return res.sendStatus(404);
			}

			var friend = friendInstances[0];
			req.imSession.members.push(friend.remoteEndPoint);

			antisocialApp.db.updateInstance('imsessions', req.imSession.id, {
				'members': req.imSession.members
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

	router.delete(imRegex, authUserMiddleware, getSessionMiddleware(imRegex), function (req, res) {
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
		req.imSession.members.splice(req.imSession.members.indexOf(req.body.endpoint), 1);

		antisocialApp.db.updateInstance('imsessions', req.imSession.id, {
			'members': req.imSession.members
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

	antisocialApp.db.on('update-imsessions', function (data) {
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
						cb(null, userInstances[0]);
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
							doneMap(err, friendInstances[0]);
						});
					}, function (err, friends) {
						cb(err, user, friends);
					});
				},
				function broadcast(user, friends, doneBroadcast) {
					async.map(friends, function (friend, doneMap) {
						var emitter = antisocialApp.getActivityEmitter(user, friend);
						if (emitter) {
							var message = {
								'action': 'changed',
								'sessionId': data.uuid,
								'sessionName': data.name,
								'members': data.members,
								'originatorEndPoint': data.originatorEndPoint
							};
							debug('broadcasting %j %s %j', message, friend.remoteEndPoint, data);

							emitter('im', 'data', message);
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

	antisocialApp.db.on('delete-imsessions', function (data) {
		debug('db delete event for imsession %s', data.id);
		// TODO
		// if originator send 'removed' to all
		// else send 'removed' to originator
	});

	antisocialApp.db.on('create-ims', function (data) {
		debug('db create event for im %j', data);
		async.waterfall([
			function getUser(cb) { // get user
				debug('looking for user: %j', data.userId);
				antisocialApp.db.getInstances('users', [{
					'property': 'id',
					'value': data.userId
				}], function (err, userInstances) {
					if (err) {
						return cb(new VError(err, 'error finding user'));
					}
					if (!userInstances || !userInstances.length === 1) {
						return cb(new VError('user %s not found', data.userId));
					}
					cb(null, userInstances[0]);
				});
			},
			function getSessionFromId(user, cb) {
				debug('looking for session: %j %j', user.id, data.sessionId)
				var query = [{
					'property': 'id',
					'value': data.sessionId
				}, {
					'property': 'userId',
					'value': user.id
				}];

				debug('getSession %j', query);

				antisocialApp.db.getInstances('imsessions', query, function (err, sessionInstances) {
					if (err) {
						return cb(err);
					}
					if (!sessionInstances || sessionInstances.length !== 1) {
						return cb(new Error('session not found'));
					}
					cb(null, user, sessionInstances[0]);
				});
			},
			function getMembers(user, session, cb) {
				async.map(session.members, function (member, doneMap) {
					antisocialApp.db.getInstances('friends', [{
						'property': 'remoteEndPoint',
						'value': member
					}, {
						'property': 'userId',
						'value': user.id
					}], function (err, friendInstances) {
						doneMap(err, friendInstances[0]);
					});
				}, function (err, friends) {
					cb(err, user, session, friends);
				});
			},
			function broadcast(user, session, friends, doneBroadcast) {
				if (!session.originator) {
					debug('not originator, send to originator');
					// TODO: send to originator
				}
				else {
					debug('broadcasting to friends %s', friends.length);

					async.map(friends, function (friend, doneMap) {
						var emitter = antisocialApp.getActivityEmitter(user, friend);
						if (!emitter) {
							debug('emitter not found for %s', friend.remoteEndPoint);
						}
						if (emitter) {
							var message = {
								'action': 'message',
								'sessionId': session.uuid,
								'sessionName': session.name,
								'originatorEndPoint': session.originatorEndPoint,
								'members': session.members,
								'source': data.source,
								'body': data.body,
								'broadcast': true
							};

							debug('emitting activity %s %j', friend.remoteEndPoint, message);

							emitter('im', 'data', message);
						}
						doneMap();
					}, function (err) {
						doneBroadcast(err);
					});
				}
			}
		], function (err) {
			debug('done processing create-ims %j', err);
			// done processing create-ims event
		});

	});

	antisocialApp.db.on('update-ims', function (data) {
		debug('db update event for im %s', data.id);
	});

	antisocialApp.db.on('delete-ims', function (data) {
		debug('db delete event for im %s', data.id);
	});

	/*
		im notification events

		data
			uuid
			action [changed|message]
			sessionId - the uuid of the session
			sessionName - the name of the session
			originatorEndpoint - the creator of the im session.
			members - for 'changed' the endpoints of the members
			source - for message, the sender.
			body
	*/

	antisocialApp.on('activity-data-im', function (user, friend, data) {
		debug('got activity-data-im data: %j', data);
		async.waterfall([
				function (cb) {
					// get session instance
					getSession(user, data.sessionId, function (err, session) {
						cb(null, session);
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
						return cb(null, session, friends[0]);
					});
				},
				function (session, originator, cb) {
					var myEndPoint = config.publicHost + config.APIPrefix + '/' + user.username;
					var inSession = (data.members.indexOf(myEndPoint) !== -1);

					debug('if we are in the session members list but no session exists, create an imsessions');
					if (!session && inSession) {

						var sessionData = {
							'uuid': data.sessionId,
							'name': data.sessionName,
							'userId': user.id,
							'originator': false,
							'originatorEndPoint': data.originator,
							'members': data.members
						};

						antisocialApp.db.newInstance('imsessions', sessionData, function (err, sessionInstance) {
							if (err) {
								debug('could not create imsession', err);
								return cb(new Error('Could not create imsession'));
							}
							cb(null, sessionInstance, originator);
						});
					}
					else if (session && !inSession) {
						debug('we are not in the session members list but session exists so we sere, delete session');

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
									});
								}, function (err) {
									if (err) {
										return doneDeleteIms(new VError(err, 'error deleting ims and sessions'));
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
								});
							}
						], function (err) {
							if (err) {
								debug('error deleting im data');
								cb(new VError(err, 'error deleting im data'));
							}
							cb(null, session, originator);
						});
					}
					else {
						debug('todo update session members');
						cb(null, session, originator);
					}
				}
			],
			function (err, session, originator) {
				if (err) {
					return debug('error resolving', err);
				}

				if (data.action === 'message') {
					var myEndPoint = config.publicHost + config.APIPrefix + '/' + user.username;
					if (data.source === myEndPoint) {
						console.log('i sent message');
						return;
					}
					if (data.broadcast) {
						console.log('recieved from originator');
						return;
					}
					if (session.originator) {
						debug('broadcast message to members %s', session);
						async.map(session.members, function (friend, doneMap) {
							var emitter = antisocialApp.getActivityEmitter(this.data.user, {
								'remoteEndPoint': friend
							});
							if (emitter) {
								emitter('im', 'data', data);
							}
							doneMap();
						}, function (err) {
							debug('done broadcasting', err);
						});
					}
					else {
						debug('forward message to originator %j', session);

						var emitter = antisocialApp.getActivityEmitter(user, {
							'remoteEndPoint': session.originatorEndPoint
						});
						if (emitter) {
							emitter('im', 'data', data);
						}
					}
				}
			});
	});

	antisocialApp.on('notification-backfill-im', function (user, friend, highwater, emitter) {

	});

	function getSession(user, sessionId, cb) {
		var query = [{
			'property': 'uuid',
			'value': sessionId
		}, {
			'property': 'userId',
			'value': user.id
		}];

		debug('getSession %j', query);

		antisocialApp.db.getInstances('imsessions', query, function (err, sessionInstances) {
			if (err) {
				return cb(err);
			}
			if (!sessionInstances || sessionInstances.length !== 1) {
				return cb(new Error('session not found'));
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
};
