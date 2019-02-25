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
			if (!typespec) {
				switch (schema.spec[col].type) {

				case 'boolean':
					typespec = 'CHAR(1)';
					break;
				case 'id':
					typespec = 'VARCHAR(64)';
					break;
				case 'token':
					typespec = 'VARCHAR(64)';
					break;
				case 'text':
					typespec = 'TEXT';
					break;
				case 'array':
					typespec = 'TEXT';
					break;
				case 'object':
					typespec = 'TEXT';
					break;
				case 'datetime':
					typespec = 'DATETIME';
					break;
				default:
					typespec = 'VARCHAR(128)';
					break;
				}
			}

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

		var sql = 'DROP TABLE ' + collectionName + ';CREATE TABLE `' + collectionName + '` (' + cols.join(',') + ',' + indexSpec.join(',') + ') ' + schema.options.join(' ') + ';';

		return sql;
	}

	queryDB(sql, args, done) {
		debug('queryDB %s %j', sql, args);
		this.pool.query(sql, args, function (err, result, fields) {
			if (err) {
				var e = new VError(err, 'queryDB error');
				return done(e);
			}
			if (sql.match(/^SELECT /i)) {
				debug('queryDB rows found: %s', result.length);
			}
			else {
				debug('queryDB insertId: %s, affectedRows: %s, changedRows: %s, warningCount: %s', result.insertId, result.affectedRows, result.changedRows, result.warningCount);
			}

			done(null, result);
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
			if (!schema.spec[col]) {
				errorLog('encodeTypes unknown column %s %s', collectionName, col);
			}
			var typespec = schema.spec[col].type;
			var val = data[col];
			if (val) {
				if (typespec === 'datetime') {
					val = moment(val).format('YYYY-MM-DD HH:mm:ss');
				}
				if (typespec === 'boolean') {
					val = val ? '1' : null;
				}
				if (typespec === 'array') {
					val = JSON.stringify(val);
				}
				if (typespec === 'object') {
					val = JSON.stringify(val);
				}
			}
			vals.push(val);
		}
		return vals;
	}

	/*
		do type coersion from mysql representation to javascript
	*/
	decodeTypes(collectionName, rows) {
		var schema = this.tableDefs[collectionName];
		for (var i = 0; i < rows.length; i++) {
			for (var col in rows[i]) {
				if (!schema.spec[col]) {
					errorLog('decodeTypes unknown column %s %s', collectionName, col);
				}
				var typespec = schema.spec[col].type;
				var val = rows[i][col];
				if (val) {
					if (typespec === 'datetime') {
						val = moment(val, 'YYYY-MM-DD HH:mm:ss').toDate();
					}
					if (typespec === 'boolean') {
						val = val ? true : false;
					}
					if (typespec === 'array') {
						val = JSON.parse(val);
					}
					if (typespec === 'object') {
						val = JSON.parse(val);
					}
				}
				rows[i][col] = val;
			}
		}
	}

	/*
		store an item after assigning an unique id
	*/
	newInstance(collectionName, data, cb) {
		if (!cb) {
			console.trace('newInstance no callback!');
		}

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
				return cb(e);
			}

			sql = 'SELECT * FROM ' + collectionName + ' WHERE id = ?';
			self.queryDB(sql, [data.id], function (err, fullrow) {
				if (err) {
					var e = new VError(err, 'newInstance read fullrow error');
					return cb(e);
				}
				if (!fullrow || fullrow.length !== 1) {
					var e = new VError(err, 'newInstance read fullrow not found');
					return cb(e);
				}
				self.emit('create-' + collectionName, fullrow[0]);
				cb(null, fullrow[0]);
			});
		});
	}

	/*
		get an item
		expects pairs to be an object of { column: value to find, column: value to find }
		pairs are anded
	*/
	getInstances(collectionName, pairs, cb) {
		if (!cb) {
			console.trace('getInstances no callback!');
		}
		var clauses = [];
		for (var col in pairs) {
			clauses.push(col + ' = ?');
		}

		var vals = this.encodeTypes(collectionName, pairs);

		var sql = 'SELECT * FROM ' + collectionName + ' WHERE ' + clauses.join(' AND ');

		var self = this;
		this.queryDB(sql, vals, function (err, result) {
			if (err) {
				var e = new VError(err, 'getInstances error');
				return cb(e);
			}

			self.decodeTypes(collectionName, result);
			cb(null, result);
		});
	}

	/*
		update item properties by id
	*/
	updateInstance(collectionName, id, patch, cb) {
		if (!cb) {
			console.trace('updateInstance no callback!');
		}
		var clauses = [];

		var vals = this.encodeTypes(collectionName, patch);

		for (var col in patch) {
			clauses.push(col + ' = ?');
		}

		vals.push(id);

		var sql = 'UPDATE ' + collectionName + ' SET ' + clauses.join(',') + ' WHERE id = ?';

		var self = this;
		this.queryDB(sql, vals, function (err, result) {
			if (err) {
				var e = new VError(err, 'updateInstance error');
				return cb(e);
			}

			sql = 'SELECT * FROM ' + collectionName + ' WHERE id = ?';
			self.queryDB(sql, [id], function (err, fullrow) {
				if (err) {
					var e = new VError(err, 'updateInstance read fullrow error');
					return cb(e);
				}
				if (!fullrow || fullrow.length !== 1) {
					var e = new VError(err, 'updateInstance read fullrow not found');
					return cb(e);
				}
				self.emit('update-' + collectionName, fullrow[0]);
				cb(null, fullrow[0]);
			});
		});
	}

	deleteInstance(collectionName, id, cb) {
		if (!cb) {
			console.trace('deleteInstance no callback!');
		}
		var sql = 'SELECT * from ' + collectionName + ' WHERE id = ?';

		var self = this;
		this.queryDB(sql, [id], function (err, results) {
			if (err) {
				var e = new VError(err, 'deleteInstance error');
				return cb(e);
			}

			if (!results || !results.length) {
				return cb(new VError(err, 'deleteInstance id not found %s %s', collectionName, id));
			}
			var item = results[0];

			var sql = 'DELETE from ' + collectionName + ' WHERE id = ?';

			self.queryDB(sql, [id], function (err, result) {
				if (err) {
					var e = new VError(err, 'deleteInstance error');
					return cb(e);
				}
				self.emit('delete-' + collectionName, item);
				cb(null, result[0]);
			});
		});
	}
}

module.exports = dbHandler;
