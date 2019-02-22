const uuid = require('uuid/v4');
const mysql = require('mysql');
const debug = require('debug')('antisocial-db');
const errorLog = require('debug')('errors');
const VError = require('verror').VError;
const moment = require('moment');

/*
	Example MYSQL database adaptor for persistant storage of antisocial data.
*/

const EventEmitter = require('events');

class dbHandler extends EventEmitter {

	constructor(options) {
		super();
		this.options = options;
		this.tableDefs = {};
		this.createPool();
	}

	createPool() {
		var options = this.options;
		debug('createPool %s %s', options.host, options.db);
		this.pool = mysql.createPool({
			connectionLimit: 100,
			host: options.host,
			user: options.user,
			password: options.password,
			database: options.db,
			debug: false,
			charset: options.charset
		});
	}

	defineTable(collectionName, schema, opts) {
		this.tableDefs[collectionName] = {
			spec: schema,
			options: opts
		};
	}

	getCreateTable(collectionName) {
		if (!this.tableDefs[collectionName]) {
			errorLog('getCreateTable table not defined');
			return;
		}

		var schema = this.tableDefs[collectionName];

		var cols = [];
		var indexSpec = [];

		for (var col in schema.spec) {
			var typespec = schema.spec[col].mySQLType;
			if (schema.spec[col].mySQLOpts) {
				for (var i = 0; i < schema.spec[col].mySQLOpts.length; i++) {
					var option = schema.spec[col].mySQLOpts[i];
					if (option === 'PRIMARY KEY') {
						indexSpec.push(option + ' ' + '(`' + col + '`)');
					}
					else if (option === 'UNIQUE KEY') {
						indexSpec.push(option + ' `' + col + '` ' + '(`' + col + '`)');
					}
					else {
						typespec += ' ' + option;
					}
				}
			}

			cols.push('`' + col + '`' + ' ' + typespec);
		}

		var sql = 'DROP TABLE ' + collectionName + ';CREATE TABLE `' + collectionName + '` (' + cols.join(',') + ',' + indexSpec.join(',') + ') ' + schema.options.join(' ');

		return sql;
	}

	queryDB(sql, args, done) {
		debug('queryDB %s %j', sql, args);
		this.pool.query(sql, args, function (err, rows) {
			if (err) {
				var e = new VError(err, 'queryDB error');
				errorLog(e.message);
				return done(e);
			}
			debug('rows: %j', rows.length);
			done(null, rows);
		});
	}

	/*
		do type coersion from javascript representation to mysql (dates)

		data expects an object { col: val, col: val }
	*/

	encodeTypes(collectionName, data) {
		var schema = this.tableDefs[collectionName];
		var vals = [];
		for (var col in data) {
			var typespec = schema.spec[col].mySQLType;
			var val = data[col];
			if (typespec.match(/^DATETIME/)) {
				val = moment(val).format('YYYY-MM-DD HH:mm:ss');
				debug('encodeTypes %s %s', col, val);
			}
			vals.push(val);
		}
		return vals;
	}

	/*
		do type coersion from mysql representation to javascript  (dates)

		rows expects an array of rowdata (from a select)
		rows [
			{ col: val, col: val },
			{ col: val, col: val }
		]
	*/
	decodeTypes(collectionName, rows) {
		var schema = this.tableDefs[collectionName];
		for (var i = 0; i < rows.length; i++) {
			for (var col in rows[i]) {
				var typespec = schema.spec[col].mySQLType;
				var val = rows[i][col];
				if (typespec.match(/^DATETIME/)) {
					val = moment(val, 'YYYY-MM-DD HH:mm:ss').toDate();
					debug('decodeTypes %s %j', col, val);
				}
				rows[i][col] = val;
			}
		}
	}

	// store an item after assigning an unique id
	newInstance(collectionName, data, cb) {
		data.id = uuid();

		var vals = this.encodeTypes(collectionName, data);
		var placeholders = [];
		var cols = [];
		for (var col in data) {
			cols.push(col);
			placeholders.push('?');
		}
		var sql = 'INSERT INTO ' + collectionName + '(' + cols.join(',') + ') values(' + placeholders.join(',') + ')';

		var self = this;

		this.queryDB(sql, vals, function (err, result) {
			if (err) {
				var e = new VError(err, 'newInstance error');
				errorLog(e.message);
				return cb(e);
			}
			self.emit('create-' + collectionName, data);
			cb(null, data);
		});
	}

	/*
	// get an item
	// expects pairs to be an array of { property: column name, value: value to find }
	// pairs are anded
	*/
	getInstances(collectionName, pairs, cb) {

		var clauses = [];
		var data = {};
		for (var i = 0; i < pairs.length; i++) {
			var col = pairs[i].property;
			var val = pairs[i].value;
			data[col] = val;
			clauses.push(col + ' = ?');
		}

		var vals = this.encodeTypes(collectionName, data);

		var sql = 'SELECT * FROM ' + collectionName + ' WHERE ' + clauses.join(' AND ');

		var self = this;
		this.queryDB(sql, vals, function (err, result) {
			if (err) {
				var e = new VError(err, 'newInstance error');
				errorLog(e.message);
				return cb(e);
			}

			self.decodeTypes(collectionName, result);
			cb(null, result);
		});
	}

	// update item properties by id
	updateInstance(collectionName, id, patch, cb) {
		var clauses = [];

		var vals = this.encodeTypes(collectionName, patch);

		for (var col in patch) {
			clauses.push(col + ' = ?');
		}

		vals.push(id);

		var sql = 'UPDATE ' + collectionName + ' SET (' + clauses.join(',') + ') WHERE id = ?;';

		var self = this;
		this.queryDB(sql, vals, function (err, result) {
			if (err) {
				var e = new VError(err, 'newInstance error');
				errorLog(e.message);
				return cb(e);
			}
			self.emit('update-' + collectionName, result[0]);
			cb(null, result[0]);
		});
	}

	deleteInstance(collectionName, id, cb) {

		var sql = 'SELECT * from ' + collectionName + ' WHERE id = ?;';

		var self = this;
		this.queryDB(sql, [id], function (err, results) {
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
	}
}

module.exports = dbHandler;
