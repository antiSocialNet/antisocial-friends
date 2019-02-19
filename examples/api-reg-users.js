var validate = require('express-validator/check');
var uuid = require('uuid');
var bcrypt = require('bcrypt');
var uid = require('uid2');
var debug = require('debug')('antisocial-user');

var DEFAULT_TTL = 1209600; // 2 weeks in seconds
var DEFAULT_SALT_ROUNDS = 10;
var DEFAULT_TOKEN_LEN = 64;

/*
	users schema:
	{
		'name': String - Name of user,
		'username': String - unique username,
		'email': String - unique email address,
		'password': String - salted hash,
		'created': Date - date created,
		'community': Boolean - true is account is an antisocial community, not a user
	}

	tokens schema:
	{
		'userId': String - id of user,
		'token': String - unique id (guid),
		'ttl': Integer - TTL in seconds since last access,
		'lastaccess': Date - last access,
		'created': Date - created
	}

*/

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
			'created': new Date().toISOString()
		}, function (err, user) {
			done(err, user);
		});
	}

	function createToken(user, done) {
		var guid = uid(DEFAULT_TOKEN_LEN);
		db.newInstance('tokens', {
			'userId': user.id,
			'token': guid,
			'ttl': DEFAULT_TTL,
			'lastaccess': new Date().toISOString(),
			'created': new Date().toISOString()
		}, function (err, user) {
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
		validate.check('email').isEmail(),

		validate.check('password').isLength({
			min: 8
		}).withMessage('password must be at least 8 characters')
		.matches('[0-9]').withMessage('password must contain a number')
		.matches('[a-z]').withMessage('password must have at least one lowercase character')
		.matches('[A-Z]').withMessage('password must have at least one uppercase character'),

		function (req, res) {

			var errors = validate.validationResult(req);
			if (!errors.isEmpty()) {
				console.log(errors.array());
				return res.status(422).json({
					errors: errors.array()
				});
			}

			createUser(req.body, function (err, user) {
				if (err) {
					return res.status(500).json(err);
				}

				createToken(user, function (err, token) {
					res.cookie('access-token', token.token, {
						'path': '/',
						'maxAge': token.ttl,
						'httpOnly': true,
						'signed': true
					}).send({
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
		validate.check('email').isEmail(),

		validate.check('password').isLength({
			min: 8
		}).withMessage('password must be at least 8 characters')
		.matches('[0-9]').withMessage('password must contain a number')
		.matches('[a-z]').withMessage('password must have at least one lowercase character')
		.matches('[A-Z]').withMessage('password must have at least one uppercase character'),

		function (req, res) {
			db.getInstances('users', [{
				'property': 'email',
				'value': req.body.email
			}], function (err, userInstances) {
				if (err) {
					return res.status(500).json({
						'status': err
					});
				}

				if (!userInstances || userInstances.length !== 1) {
					return res.status(401).json({
						'status': 'user not found'
					});
				}

				var user = userInstances[0];

				passwordMatch(req.body.password, user, function (err, isMatch) {
					if (err) {
						return res.status(500).json({
							'status': 'password match error ' + err
						});
					}
					if (!isMatch) {
						return res.status(401).json({
							'status': 'password mismatch'
						});
					}

					createToken(user, function (err, token) {
						res.cookie('access-token', token.token, {
							'path': '/',
							'maxAge': token.ttl,
							'httpOnly': true,
							'signed': true
						}).send({
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
				'status': 'must be logged in'
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
	router.post('/password-reset', function (req, res) {

	});

	// reset password if valid reset token
	router.post('/set-password', function (req, res) {

	});

	return router;
};
