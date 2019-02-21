const events = require('events');
const util = require('util');
const uuid = require('uuid/v4');
const mysql = require('mysql');
const debug = require('debug')('antisocial-db');
const errorLog = require('debug')('errors');

const VError = require('verror').VError;
const moment = require('moment');

/*
	Example MYSQL database adaptor for persistant storage of antisocial data
	adapt these abstract methods to your application data storage scheme


DROP TABLE users; CREATE TABLE users (id VARCHAR(36), name VARCHAR(80), username VARCHAR(80), email VARCHAR(80), password VARCHAR(80), community CHAR(1), created DATETIME, PRIMARY KEY (id), UNIQUE KEY(username,email)) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8 COLLATE = utf8_general_ci;
DROP TABLE tokens; CREATE TABLE tokens (id VARCHAR(36), userId VARCHAR(80), token VARCHAR(64), ttl INT, created DATETIME, lastaccess DATETIME, community char(1), primary key (id), UNIQUE KEY(token)) ENGINE = InnoDB DEFAULT CHARACTER SET = utf8 COLLATE = utf8_general_ci;
*/

function dbHandler(options) {
	events.EventEmitter.call(this);

	debug('using mysql');

	this.options = options;

	var self = this;

	this.tableDefs = {};

	this.defineTable = function (collectionName, schema) {
		self.tableDefs[collectionName] = schema;
	};

	this.getCreateTable = function (collectionName) {
		var schema = self.tableDefs[collectionName];

		var sql = 'CREATE TABLE ' + collectionName + '()';
		var cols = [];
		for (var col in schema) {
			var columnDef = schema[col];
		}
	};

	this.typemap = {
		'users.created': 'datetime',
		'tokens.created': 'datetime',
		'tokens.lastaccess': 'datetime'
	};

	this.createPool = function (options) {
		debug('createPool %s %s', options.host, options.db);
		self.pool = mysql.createPool({
			connectionLimit: 100,
			host: options.host,
			user: options.user,
			password: options.password,
			database: options.db,
			debug: false,
			charset: options.charset
		});
	};

	this.createPool(options);

	this.queryDB = function (sql, args, done) {
		debug('queryDB %s %j', sql, args);
		self.pool.query(sql, args, function (err, rows) {
			if (err) {
				var e = new VError(err, 'queryDB error');
				errorLog(e.message);
				return done(e);
			}
			debug('rows: %j', rows.length);
			done(null, rows);
		});
	};

	// store an item after assigning an unique id
	this.newInstance = function (collectionName, data, cb) {
		data.id = uuid();

		var cols = [];
		var vals = [];
		var placeholders = [];

		for (var col in data) {
			var val = data[col];
			if (self.typemap[collectionName + '.' + col] === 'datetime') {
				val = moment(val).format('YYYY-MM-DD HH:mm:ss');
			}

			cols.push(col);
			placeholders.push('?');
			vals.push(val);
		}
		var sql = 'INSERT INTO ' + collectionName + '(' + cols.join(',') + ') values(' + placeholders.join(',') + ')';
		self.queryDB(sql, vals, function (err, result) {
			if (err) {
				var e = new VError(err, 'newInstance error');
				errorLog(e.message);
				return cb(e);
			}
			self.emit('create-' + collectionName, data);
			cb(null, data);
		});
	};

	// get an item by matching some property
	this.getInstances = function (collectionName, pairs, cb) {

		var clauses = [];
		var vals = [];
		for (var i = 0; i < pairs.length; i++) {
			var col = pairs[i].property;
			var val = pairs[i].value;
			if (self.typemap[collectionName + '.' + col] === 'datetime') {
				val = moment(val).format('YYYY-MM-DD HH:mm:ss');
			}
			vals.push(val);
			clauses.push(col + ' = ?');
		}

		var sql = 'SELECT * FROM ' + collectionName + ' WHERE ' + clauses.join(' AND ');

		self.queryDB(sql, vals, function (err, result) {
			if (err) {
				var e = new VError(err, 'newInstance error');
				errorLog(e.message);
				return cb(e);
			}
			cb(null, result);
		});
	};

	// update item properties by id
	this.updateInstance = function (collectionName, id, patch, cb) {
		var clauses = [];
		var vals = [];
		for (var col in patch) {
			var val = patch[col];
			if (self.typemap[collectionName + '.' + col] === 'datetime') {
				val = moment(val).format('YYYY-MM-DD HH:mm:ss');
			}
			clauses.push(col + ' = ?');
			vals.push(val);
		}
		vals.push(id);
		var sql = 'UPDATE ' + collectionName + ' SET (' + clauses.join(',') + ') WHERE id = ?;';
		self.queryDB(sql, vals, function (err, result) {
			if (err) {
				var e = new VError(err, 'newInstance error');
				errorLog(e.message);
				return cb(e);
			}
			self.emit('update-' + collectionName, result[0]);
			cb(null, result[0]);
		});
	};

	this.deleteInstance = function (collectionName, id, cb) {

		var sql = 'SELECT * from ' + collectionName + ' WHERE id = ?;';
		self.queryDB(sql, [id], function (err, results) {
			if (err) {
				var e = new VError(err, 'deleteInstance error');
				errorLog(e.message);
				return cb(e);
			}

			if (!results || !results.length) {
				return cb(new VError(err, 'deleteInstance id not found %s %s', collectionName, id));
			}
			var item = results[0];

			var sql = 'DELETE from ' + collectionName + ' WHERE id = ?;';
			self.queryDB(sql, [id], function (err, result) {
				if (err) {
					var e = new VError(err, 'newInstance error');
					errorLog(e.message);
					return cb(e);
				}
				self.emit('delete-' + collectionName, item);
				cb(null, result[0]);
			});
		});
	};
}

util.inherits(dbHandler, events.EventEmitter);

module.exports = dbHandler;
