const {
	check, validationResult
} = require('express-validator/check');

const bcrypt = require('bcrypt');
const uid = require('uid2');
const debug = require('debug')('antisocial-user');
const VError = require('verror').VError;
const errorLog = require('debug')('errors');
const nodemailer = require('nodemailer');
const async = require('async');

const DEFAULT_TTL = 1209600; // 2 weeks in seconds
const DEFAULT_SALT_ROUNDS = 10;
const DEFAULT_TOKEN_LEN = 64;
const PASSWORD_RESET_TTL = 3600; // 1 hr

module.exports = {
	mount: mount,
	validateToken: validateToken,
	getUserForRequestMiddleware: getUserForRequestMiddleware
};

function getUserForRequestMiddleware(db) {

	// get token from headers or cookies and resolve the logged in user
	// if found set req.antisocialToken and req.antisocialUser for later use
	return function getUserForRequest(req, res, next) {
		var token;

		if (req.cookies && req.cookies['access-token']) {
			token = req.cookies['access-token'];
		}

		if (req.signedCookies && req.signedCookies['access-token']) {
			token = req.signedCookies['access-token'];
		}

		if (req.body && req.body['access-token']) {
			token = req.body['access-token'];
		}

		if (!token) {
			debug('getAuthenticatedUser no token in headers or cookies');
			return next();
		}

		debug('getAuthenticatedUser found token in header or cookies', token);

		db.getInstances('tokens', {
			'token': token
		}, function (err, tokenInstances) {
			if (err) {
				debug('getAuthenticatedUser error finding token', err.message);
				return next();
			}
			if (!tokenInstances || tokenInstances.length !== 1) {
				debug('getAuthenticatedUser token not found', tokenInstances);
				return next();
			}

			debug('token: %j', tokenInstances[0]);

			validateToken(db, tokenInstances[0], function (err) {
				if (err) {
					return next(err);
				}

				db.getInstances('users', {
					'id': tokenInstances[0].userId
				}, function (err, userInstances) {
					if (err) {
						return next();
					}
					if (!userInstances || userInstances.length !== 1) {
						return next();
					}

					req.antisocialToken = tokenInstances[0];
					req.antisocialUser = userInstances[0];

					next();
				});

			});
		});
	};
}

// is the token valid?
function validateToken(db, token, cb) {
	var now = Date.now();
	var accessed = new Date(token.lastaccess).getTime();
	var elapsedSeconds = (now - accessed) / 1000;
	debug('validToken elapsed: %s ttl: %s', elapsedSeconds, token.ttl);
	if (elapsedSeconds < token.ttl) {
		touchToken(db, token, function (err) {
			cb(err);
		});
	}
	else {
		db.deleteInstance('tokens', token.id, function (err) {
			if (err) {
				return cb(new VError(err, 'token is expired'));
			}
			return cb(new VError('token is expired'));
		});
	}
}

// update lastaccess for rolling ttl
function touchToken(db, token, cb) {
	debug('touchToken %j', token);
	var now = Date.now();
	var accessed = new Date(token.lastaccess).getTime();
	var elapsedSeconds = (now - accessed) / 1000;

	// only update once an hr.
	if (elapsedSeconds < 3600) {
		return setImmediate(cb);
	}

	db.updateInstance('tokens', token.id, {
		'lastaccess': new Date()
	}, function (err) {
		if (err) {
			cb(new VError(err, 'touchToken failed'));
		}
		cb();
	});
}

function mount(app, db) {

	debug('mounting user registration api');

	function saltAndHash(plaintext) {
		var salt = bcrypt.genSaltSync(DEFAULT_SALT_ROUNDS);
		return bcrypt.hashSync(plaintext, salt);
	}

	function createUser(params, done) {
		db.newInstance('users', {
			'name': params.name,
			'username': params.username,
			'email': params.email,
			'password': saltAndHash(params.password),
			'community': params.community,
			'created': new Date()
		}, function (err, user) {
			if (err) {
				var e = new VError(err, 'Could not create user');
				errorLog(e.message);
				return done(e);
			}
			done(null, user);
		});
	}

	function createToken(user, options, done) {
		var guid = uid(DEFAULT_TOKEN_LEN);
		db.newInstance('tokens', {
			'userId': user.id,
			'token': guid,
			'ttl': options.ttl ? options.ttl : DEFAULT_TTL,
			'lastaccess': new Date(),
			'created': new Date()
		}, function (err, user) {
			if (err) {
				var e = new VError(err, 'Could not create token');
				errorLog(e.message);
				return done(e);
			}
			done(null, user);
		});
	}

	function passwordMatch(plaintext, user, done) {
		bcrypt.compare(plaintext, user.password, function (err, isMatch) {
			if (err) return done(err);
			done(null, isMatch);
		});
	}

	var router = app.Router();

	// create a new user
	router.post('/register',

		check('email').isEmail(),

		check('name').not().isEmpty().trim().withMessage('name is required'),
		check('username').not().isEmpty().trim().withMessage('username is required'),
		check('community').optional().isBoolean().withMessage('community is boolean'),

		check('password')
		.custom(value => !/\s/.test(value)).withMessage('No spaces are allowed in the password')
		.isLength({
			min: 8
		}).withMessage('password must be at least 8 characters')
		.matches('[0-9]').withMessage('password must have at least one number')
		.matches('[a-z]').withMessage('password must have at least one lowercase character')
		.matches('[A-Z]').withMessage('password must have at least one uppercase character'),

		function (req, res) {

			debug('/register', req.body);

			var errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(422)
					.json({
						status: 'error',
						errors: errors.array()
					});
			}

			async.waterfall([
				function (cb) {
					createUser(req.body, function (err, user) {
						cb(err, user);
					});
				},
				function (user, cb) {
					createToken(user, {}, function (err, token) {
						cb(err, user, token);
					});
				}
			], function (err, user, token) {
				if (err) {
					return res.status(400).json({
						status: 'error',
						'errors': err.message
					});
				}
				res.cookie('access-token', token.token, {
						'path': '/',
						'maxAge': token.ttl,
						'httpOnly': true,
						'signed': true
					})
					.json({
						'status': 'ok',
						'result': {
							'id': user.id,
							'name': user.name,
							'username': user.username,
							'email': user.email
						}
					});
			});
		});

	// login
	router.post('/login',
		check('email').isEmail(),

		check('password')
		.custom(value => !/\s/.test(value)).withMessage('No spaces are allowed in the password')
		.isLength({
			min: 8
		}).withMessage('password must be at least 8 characters')
		.matches('[0-9]').withMessage('password must contain a number')
		.matches('[a-z]').withMessage('password must have at least one lowercase character')
		.matches('[A-Z]').withMessage('password must have at least one uppercase character'),

		function (req, res) {

			var errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(422)
					.json({
						status: 'error',
						errors: errors.array()
					});
			}

			async.waterfall([
				function (cb) {
					db.getInstances('users', {
						'email': req.body.email
					}, function (err, userInstances) {
						if (err) {
							return cb(err);
						}

						if (!userInstances || userInstances.length !== 1) {
							return cb(new VError('user not found'));
						}

						var user = userInstances[0];
						cb(null, user);
					});
				},
				function (user, cb) {
					passwordMatch(req.body.password, user, function (err, isMatch) {
						if (err) {
							return cb(err);
						}

						if (!isMatch) {
							return cb(new VError('password mismatch'));
						}

						cb(null, user);
					});
				},
				function (user, cb) {
					createToken(user, {}, function (err, token) {
						cb(err, user, token);
					});
				}
			], function (err, user, token) {
				if (err) {
					return res.status(401).json({
						status: 'error',
						'errors': err.message
					});
				}

				res.cookie('access-token', token.token, {
						'path': '/',
						'maxAge': token.ttl,
						'httpOnly': true,
						'signed': true
					})
					.send({
						'status': 'ok',
						'result': {
							'id': user.id,
							'name': user.name,
							'username': user.username,
							'email': user.email
						}
					});
			});
		});

	// logout
	router.get('/logout', getUserForRequestMiddleware(db), function (req, res) {
		var currentUser = req.antisocialUser;
		if (!currentUser) {
			return res.status(401).json({
				'status': 'error',
				'errors': 'must be logged in'
			});
		}

		db.deleteInstance('tokens', req.antisocialToken.id, function (err) {
			res.clearCookie('access-token', {
				'path': '/',
				'httpOnly': true,
				'secure': true
			});

			res.json({
				'status': err ? err : 'ok'
			});
		});
	});

	// send pasword reset link to email
	// expects email address
	router.post('/password-reset', check('email').isEmail(), function (req, res) {
		db.getInstances('users', {
			'email': req.body.email
		}, function (err, token) {
			var errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(422)
					.json({
						status: 'error',
						errors: errors.array()
					});
			}

			db.getInstances('users', {
				'email': req.body.email
			}, function (err, userInstances) {
				if (err) {
					return res.status(500).json({
						status: 'error',
						'errors': err.message
					});
				}

				if (!userInstances || userInstances.length !== 1) {
					return res.status(401)
						.json({
							'status': 'user not found'
						});
				}

				var user = userInstances[0];

				createToken(user, {
					ttl: PASSWORD_RESET_TTL
				}, function (err, token) {

					console.log(token);

					var config = {
						host: process.env.OUTBOUND_MAIL_SMTP_HOST,
						port: process.env.OUTBOUND_MAIL_SMTP_PORT || 25,
						secure: process.env.OUTBOUND_MAIL_SMTP_SSL === 'true' ? true : false
					};

					if (process.env.OUTBOUND_MAIL_SMTP_USER && process.env.OUTBOUND_MAIL_SMTP_PASSWORD) {
						config.auth = {
							user: process.env.OUTBOUND_MAIL_SMTP_USER,
							pass: process.env.OUTBOUND_MAIL_SMTP_PASSWORD
						};
					}

					var transporter = nodemailer.createTransport(config);

					var options = {
						'to': user.email,
						'from': 'webmaster@datalounge.com',
						'subject': 'Password reset',
						'html': '<p>token ' + token.token + ' to reset your password.</p>'
					};

					transporter.sendMail(options, function (err, info) {
						if (err) {
							var e = new VError(err, 'could not send email');
							return res.status(500).json({
								status: 'error',
								errors: e.message
							});
						}
						res.json({
							'status': 'ok',
							'info': info
						});
					});
				});
			});
		});
	});

	// reset password with a valid reset token
	router.post('/set-password',

		check('email').isEmail(),

		check('token').isLength({
			min: 64
		}),

		check('password')
		.custom(value => !/\s/.test(value)).withMessage('No spaces are allowed in the password')
		.isLength({
			min: 8
		}).withMessage('password must be at least 8 characters')
		.matches('[0-9]').withMessage('password must have at least one number')
		.matches('[a-z]').withMessage('password must have at least one lowercase character')
		.matches('[A-Z]').withMessage('password must have at least one uppercase character'),

		function (req, res) {

			var errors = validationResult(req);
			if (!errors.isEmpty()) {
				return res.status(422)
					.json({
						status: 'error',
						errors: errors.array()
					});
			}

			if (!req.body.token) {
				return res.status(422)
					.json({
						status: 'error',
						errors: ['token is required']
					});
			}

			async.waterfall([
				function findToken(cb) {
					db.getInstances('tokens', {
						'token': req.body.token
					}, function (err, tokenInstances) {
						if (err) {
							return cb(new VError(err, 'error reading token'));
						}
						if (!tokenInstances || tokenInstances.length !== 1) {
							return cb(new VError('token not found'));
						}

						validateToken(db, tokenInstances[0], function (err) {
							if (err) {
								return cb(err);
							}
							cb(null, tokenInstances[0]);
						});
					});
				},
				function readUser(token, cb) {
					db.getInstances('users', {
						'id': token.userId
					}, function (err, userInstances) {
						if (err) {
							return cb(new VError('error reading user'));
						}
						if (!userInstances || userInstances.length !== 1) {
							return cb(new VError('user not found'));
						}

						if (userInstances[0].email !== req.body.email) {
							return cb(new VError('email mismatch'));
						}

						cb(null, userInstances[0]);
					});
				},
				function savePassword(user, cb) {
					db.updateInstance('users', user.id, {
						'password': saltAndHash(req.body.password)
					}, function (err, updated) {
						if (err) {
							return db(new VError('unable to save password'));
						}
						cb(null, updated);
					});
				}
			], function (err, user) {
				if (err) {
					return res.status(401).json({
						status: 'error',
						errors: err.message
					});
				}
				res.json({
					'status': 'ok'
				});
			});
		});

	return router;
}
