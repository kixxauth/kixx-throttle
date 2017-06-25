/*global process */
/*eslint no-console: ["error", { allow: ["error"] }] */
'use strict';

var assert = require('assert');
var sinon = require('sinon');
var fakeredis = require('fakeredis');
var kixxThrottle = require('../');

var tests = [];

it('checks store interface for pushAndTryLockItem()', function (next) {
	var store = {
		tryLockItem: function () {},
		removeItem: function () {}
	};

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 5
	};

	var enqueue = kixxThrottle.enqueue(store, config);

	assert.throws(function () {
		enqueue(noop);
	}, /pushAndTryLockItem must be a Function/);

	next();
});

it('checks store interface for tryLockItem()', function (next) {
	var store = {
		pushAndTryLockItem: function () {},
		removeItem: function () {}
	};

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 5
	};

	var enqueue = kixxThrottle.enqueue(store, config);

	assert.throws(function () {
		enqueue(noop);
	}, /tryLockItem must be a Function/);

	next();
});

it('checks store interface for removeItem()', function (next) {
	var store = {
		pushAndTryLockItem: function () {},
		tryLockItem: function () {}
	};

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 5
	};

	var enqueue = kixxThrottle.enqueue(store, config);

	assert.throws(function () {
		enqueue(noop);
	}, /removeItem must be a Function/);

	next();
});

it('checks for config.qid String', function (next) {
	var store = {
		pushAndTryLockItem: function () {},
		tryLockItem: function () {},
		removeItem: function () {}
	};

	var config = null;

	var createEnqueue = kixxThrottle.enqueue(store);
	var enqueue = createEnqueue(config);

	assert.throws(function () {
		enqueue(noop);
	}, /config\.qid must be a String/);

	next();
});

it('checks for config.ratePerMinute Number', function (next) {
	var store = {
		pushAndTryLockItem: function () {},
		tryLockItem: function () {},
		removeItem: function () {}
	};

	var config = {
		qid: 'qid-test-000'
	};

	var createEnqueue = kixxThrottle.enqueue(store);

	// ratePerMinute === undefined
	assert.throws(function () {
		var enqueue = createEnqueue(config);
		enqueue(noop);
	}, /config\.ratePerMinute must be a number greater than 0 and less than 60,000/);

	// ratePerMinute === 0
	assert.throws(function () {
		var enqueue = createEnqueue(Object.assign(config, {
			ratePerMinute: 0
		}));
		enqueue(noop);
	}, /config\.ratePerMinute must be a number greater than 0 and less than 60,000/);

	// ratePerMinute === 60001
	assert.throws(function () {
		var enqueue = createEnqueue(Object.assign(config, {
			ratePerMinute: 60001
		}));
		enqueue(noop);
	}, /config\.ratePerMinute must be a number greater than 0 and less than 60,000/);

	next();
});

it('checks for the task function', function (next) {
	var store = createFakeStore({});

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 5
	};

	var createEnqueue = kixxThrottle.enqueue(store);
	var enqueue = createEnqueue(config);

	assert.throws(function () {
		enqueue(null);
	}, /Task fn supplied to enqueue\(\) must be a Function/);

	next();
});

it('rejects if pushAndTryLockItem fails synchronously', function (next) {
	var store = createFakeStore({
		pushAndTryLockItem: function () {
			throw new Error('pushAndTryLockItem sync error');
		}
	});

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 5
	};

	var createEnqueue = kixxThrottle.enqueue(store);
	var enqueue = createEnqueue(config);

	enqueue(noop)
		.then(function () {
			assert.fail(true, false, '.then() handler was not supposed to be called');
		})
		.catch(function (err) {
			assert.equal(err.message, 'pushAndTryLockItem sync error');
			next();
		})
		.catch(next);
});

it('calls removeItem if pushAndTryLockItem fails synchronously', function (next) {
	var store = createFakeStore({
		pushAndTryLockItem: function () {
			throw new Error('pushAndTryLockItem sync error');
		}
	});

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 5
	};

	var createEnqueue = kixxThrottle.enqueue(store);
	var enqueue = createEnqueue(config);

	sinon.spy(store, 'removeItem');

	enqueue(noop).catch(noop);

	return delay(10, function () {
		assert.equal(store.removeItem.callCount, 1);
	}).then(next, next);
});

it('rejects if pushAndTryLockItem fails asynchronously', function (next) {
	var store = createFakeStore({
		pushAndTryLockItem: function (_a, _b, cb) {
			return cb(new Error('pushAndTryLockItem async error'));
		}
	});

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 5
	};

	var createEnqueue = kixxThrottle.enqueue(store);
	var enqueue = createEnqueue(config);

	enqueue(noop)
		.then(function () {
			assert.fail(true, false, '.then() handler was not supposed to be called');
		})
		.catch(function (err) {
			assert.equal(err.message, 'pushAndTryLockItem async error');
			next();
		})
		.catch(next);
});

it('calls removeItem if pushAndTryLockItem fails asynchronously', function (next) {
	var store = createFakeStore({
		pushAndTryLockItem: function (_a, _b, cb) {
			return cb(new Error('pushAndTryLockItem async error'));
		}
	});

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 5
	};

	var createEnqueue = kixxThrottle.enqueue(store);
	var enqueue = createEnqueue(config);

	sinon.spy(store, 'removeItem');

	enqueue(noop).catch(noop);

	return delay(10, function () {
		assert.equal(store.removeItem.callCount, 1);
	}).then(next, next);
});

it('emits an error if removeItem fails synchronously', function (next) {
	var store = createFakeStore({
		removeItem: function () {
			throw new Error('removeItem sync error');
		}
	});

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 60000 // So we attempt remove in 1ms
	};

	var createEnqueue = kixxThrottle.enqueue(store);
	var enqueue = createEnqueue(config);
	var returnValue = {TEST: true};
	var resultHandler = sinon.spy();

	var promise = enqueue(always(returnValue));

	promise.on('error', function (err) {
		assert.equal(err.message, 'removeItem sync error');
		assert.equal(resultHandler.callCount, 1, 'result handler called once');
		assert.equal(resultHandler.firstCall.args[0], returnValue);
		next();
	});

	promise.then(resultHandler).catch(next);
});

it('emits an error if removeItem fails asynchronously', function (next) {
	var store = createFakeStore({
		removeItem: function (_a, _b, cb) {
			return cb(new Error('removeItem async error'));
		}
	});

	var config = {
		qid: 'qid-test-000',
		ratePerMinute: 60000 // So we attempt remove in 1ms
	};

	var createEnqueue = kixxThrottle.enqueue(store);
	var enqueue = createEnqueue(config);
	var returnValue = {TEST: true};
	var resultHandler = sinon.spy();

	var promise = enqueue(always(returnValue));

	promise.on('error', function (err) {
		assert.equal(err.message, 'removeItem async error');
		assert.equal(resultHandler.callCount, 1, 'result handler called once');
		assert.equal(resultHandler.firstCall.args[0], returnValue);
		next();
	});

	promise.then(resultHandler).catch(next);
});

// ---------------------------------------------------------------------------
//  Utilties
// ---------------------------------------------------------------------------

function noop() {}

function always(x) {
	return function () {
		return x;
	};
}

function delay(ms, fn) {
	return new Promise(function (resolve, reject) {
		setTimeout(function () {
			var result;

			try {
				result = fn();
			} catch (err) {
				return reject(err);
			}

			return resolve(result);
		}, ms);
	});
}

function findIndex(list, guard) {
	var i;

	for (i = list.length - 1; i >= 0; i--)
		if (guard(list[i])) return list[i];

	return null;
}

function createFakeId(len) {
	var str = '';
	var i;
	len = len || 9;

	for (i = len - 1; i >= 0; i--)
		str += (Math.random() * 16 | 0).toString(16);

	return str;
}

function createFakeStore(mixin) {
	var redis = fakeredis.createClient(createFakeId());
	var store;
	var KEY_PREFIX = 'kixx-throttle';
	var LOCK_KEY_PREFIX = KEY_PREFIX + ':lock:';
	var LIST_KEY_PREFIX = KEY_PREFIX + ':queue:';

	store = {
		pushAndTryLockItem: function pushAndTryLockItem(qid, item, cb) {
			var itemJSON = JSON.stringify(item);
			var id = item.id;

			// Make the Redis key expiration a bit longer than the
			// delay set on this item.
			var lockExp = item.delay + 700;
			var lockKey = LOCK_KEY_PREFIX + qid;

			var listKey = LIST_KEY_PREFIX + qid;

			var commands = [
				// Push this item onto the queue.
				['rpush', listKey, itemJSON],

				// Attempt to set this item as the locked item:
				// EX sets the expiration date, and NX is the flag which will only allow
				// us to set this key if it does not already exist.
				['set', lockKey, id, 'EX', lockExp, 'NX'],

				// Get all the items in the queue.
				['lrange', listKey, 0, -1],

				// Get the currently locked item.
				['get', lockKey]
			];

			redis.multi(commands).exec(function (err, results) {
				var items;
				var lockedId;

				if (err) return cb(err);

				items = JSON.parse('[' + results[2].join(',') + ']');
				lockedId = results[3];

				items = items.map(function (item) {
					if (item.id === lockedId) item.locked = true;

					return item;
				});

				cb(null, items);
			});
		},

		tryLockItem: function tryLockItem(qid, item, cb) {
			var id = item.id;

			// Make the Redis key expiration a bit longer than the
			// delay set on this item.
			var lockExp = item.delay + 700;
			var lockKey = LOCK_KEY_PREFIX + qid;

			var listKey = LIST_KEY_PREFIX + qid;

			var commands = [
				// Attempt to set this item as the locked item:
				// EX sets the expiration date, and NX is the flag which will only allow
				// us to set this key if it does not already exist.
				['set', lockKey, id, 'EX', lockExp, 'NX'],

				// Get all the items in the queue.
				['lrange', listKey, 0, -1],

				// Get the currently locked item.
				['get', lockKey]
			];

			redis.multi(commands).exec(function (err, results) {
				var items;
				var lockedId;

				if (err) return cb(err);

				items = JSON.parse('[' + results[1].join(',') + ']');
				lockedId = results[2];

				items = items.map(function (item) {
					if (item.id === lockedId) item.locked = true;

					return item;
				});

				cb(null, items);
			});
		},

		removeItem: function removeItem(qid, id, cb) {
			var lockKey = LOCK_KEY_PREFIX + qid;
			var listKey = LIST_KEY_PREFIX + qid;

			var commands = [
				// Get the currently locked item.
				['get', lockKey],

				// Get all the items in the queue.
				['lrange', listKey, 0, -1]
			];

			redis.multi(commands).exec(function (err, results) {
				var stringItems;
				var parsedItems;
				var lockedId;
				var index;
				var value;
				var commands = [];

				if (err) return cb(err);

				lockedId = results[0];
				stringItems = results[1];
				parsedItems = JSON.parse('[' + stringItems.join(',') + ']');

				// Check through the parsed items to see which one has
				// the ID we're looking for.
				index = findIndex(parsedItems, function (item) {
					return item.id === id;
				});

				// Get the String value for the item if it exists.
				value = index === null ? null : stringItems[index];

				if (value) commands.push(['lrem', listKey, 99, value]);

				if (lockedId === id) commands.push(['del', lockKey]);

				if (commands.length < 1) return cb(null);

				redis.multi(commands).exec(function (err) {
					if (err) return cb(err);
					return cb(null);
				});
			});
		}
	};

	if (mixin) return Object.assign(store, mixin);

	return store;
}

function it(description, fn, timeLimit) {
	timeLimit = timeLimit || 5000;

	function reportError(err) {
		console.error('Test Failure:');
		console.error('in "it %s"', description);
		console.error(err.stack || err.message || err);
		process.exit(1);
	}

	tests.push(function executeTest(next) {
		var timer = setTimeout(function () {
			reportError(new Error(
				'Test execution of "' + description + '" failed to call next within ' + timeLimit + 'ms.'
			));
		}, timeLimit);

		try {
			fn(function reportNext(err) {
				clearTimeout(timer);
				if (err) reportError(err);
				next();
			});
		} catch (err) {
			clearTimeout(timer);
			reportError(err);
		}
	});
}

function runTests() {
	var count = 0;

	var composed = tests.reduceRight(function (next, fn) {
		return function () {
			fn(next);
			return count += 1;
		};
	}, function () { console.error('completed %d tests', count); });

	return composed();
}

if (require.main === module) runTests();
