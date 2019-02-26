const {
	check, validationResult
} = require('express-validator/check');

const uuid = require('uuid/v4');
const bcrypt = require('bcrypt');
const uid = require('uid2');
const debug = require('debug')('antisocial-user');
const VError = require('verror').VError;
const errorLog = require('debug')('errors');
const nodemailer = require('nodemailer');

const DEFAULT_TTL = 1209600; // 2 weeks in seconds
const DEFAULT_SALT_ROUNDS = 10;
const DEFAULT_TOKEN_LEN = 64;
const PASSWORD_RESET_TTL = 3600; // 1 hr

module.exports = function (app, db, authUserMiddleware) {

	debug('mounting user registration api');

	var getAuthUser = require('./getAuthenticatedUser.js')(db);

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
			done(err, user);
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
			done(err, user);
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
		.matches('[A-Z]').withMessage('password must have at least one uppercase character')
		.withMessage('password must contain a number'),

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

			createUser(req.body, function (err, user) {
				if (err) {
					return res.status(400).json({
						status: 'error',
						'errors': err.message
					});
				}

				createToken(user, {}, function (err, token) {
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
		}
	);

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

				passwordMatch(req.body.password, user, function (err, isMatch) {
					if (err) {
						return res.status(500).send(err.message);
					}

					if (!isMatch) {
						return res.status(401)
							.json({
								'status': 'error',
								'errors': 'password mismatch'
							});
					}

					createToken(user, {}, function (err, token) {
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
			});
		});

	// logout
	router.get('/logout', getAuthUser, function (req, res) {
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
						'html': '<p><a href="http://localhost:3000/change-password/' + token.token + '">Use this link</a> to reset your password.'
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

	// reset password if valid reset token
	router.post('/set-password', function (req, res) {

	});

	return router;
};
