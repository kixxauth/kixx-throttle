'use strict';

var type;
var createRandomHexCharacters;
var isNotFunction;
var isPromise;
var stringGt;
var numberInRange;
var findByProp;
var findById;
var reduce;
var add;
var sum;
var prop;
var map;
var pluck;

//
// Public
// Provided as public interface.
//
exports.enqueue = curry3(function enqueue(store, config, fn) {
	var pushAndTryLockItem;
	var tryLockItem;
	var removeItem;
	var qid;
	var intervalMs;
	var emitter;
	var promise;
	store = store || {};
	config = config || {};

	if (isNotFunction(store.pushAndTryLockItem))
		throw new Error(
			'store.pushAndTryLockItem must be a Function; not ' + type(store.pushAndTryLockItem) + '.'
		);

	if (isNotFunction(store.tryLockItem))
		throw new Error(
			'store.tryLockItem must be a Function; not ' + type(store.tryLockItem) + '.'
		);

	if (isNotFunction(store.removeItem))
		throw new Error(
			'store.removeItem must be a Function; not ' + type(store.removeItem) + '.'
		);

	if (!stringGt(8, config.qid))
		throw new Error(
			'config.qid must be a String at least 8 characters long; not ' + config.qid + '.'
		);

	if (!numberInRange(1, 60000, config.ratePerMinute))
		throw new Error(
			'config.ratePerMinute must be a number greater than 0 and less than 60,000; not ' + config.ratePerMinute + '.'
		);

	if (isNotFunction(fn))
		throw new Error(
			'Task fn supplied to enqueue() must be a Function; not ' + type(fn) + '.'
		);

	// Push a new item onto the queue and try to lock it at the same time.
	// Supplies the callback with an error if there is one, and the full queue otherwise.
	pushAndTryLockItem = store.pushAndTryLockItem;

	// Try to lock an item in the queue.
	// Supplies the callback with an error if there is one, and the full queue otherwise.
	tryLockItem = store.tryLockItem;

	// Remove an item from the queue.
	removeItem = store.removeItem;

	// The unique ID of the queue.
	qid = config.qid;

	// The interval at which we intend to fire off tasks on the queue.
	intervalMs = Math.ceil(60000 / config.ratePerMinute);

	// An event emitter used to report events to the caller.
	emitter = createEmitter();

	// Create a promise for queueing and executing the tasks which we'll return to the caller.
	promise = new Promise(function (resolve, reject) {
		var task = exports.createTask({qid: qid, delay: intervalMs});
		console.error('start task', task.id);

		// Remove the task from the queue; releasing the lock.
		function removeTask(delay) {
			delay = type(delay) === 'Number' ? delay : intervalMs;

			setTimeout(function removingTask() {
				try {
					removeItem(qid, task.id, function (err) {
						if (err) emitter.emit('error', err);
						emitter.close();
					});
				} catch (err) {
					emitter.emit('error', err);
					emitter.close();
				}
			}, delay);
		}

		// Execute the task; removing it and releasing the lock.
		function executeTask() {
			var result;
			removeTask();

			try {
				result = fn();
			} catch (err) {
				return reject(err);
			}

			if (isPromise(result)) return result.then(resolve, reject);

			resolve(result);
		}

		// Attempt to get a lock on the task.
		function tryLockTask() {
			try {
				tryLockItem(qid, task.id, handleQueueResponse);
			} catch (err) {
				removeTask(0);
				return reject(err);
			}
		}

		// Generalized handler for polling the store.
		function handleQueueResponse(err, queue) {
			console.error('current task.id %s', task.id);
			console.error('error', err);
			console.error('queue', queue);
			var queuedTask;
			var wait;

			if (err) {
				removeTask(0);
				return reject(err);
			}

			// Search the queue stack to find our task.
			queuedTask = findById(task.id, queue);

			if (!queuedTask) {
				removeTask(0);
				return reject(new Error(
					'Task id "' + + '" mysteriously disappeared from the queue'
				));
			}

			// If we were given a lock, it's time to execute.
			if (queuedTask.locked) return executeTask();

			// If we were not given a lock, add up the delay time on all the
			// items in front of us and try again.
			wait = sum(pluck('delay', queue));
			setTimeout(tryLockTask, wait);
		}

		// Kick things off by pushing our new task onto the queue in the store,
		// attempting to get a lock on it at the same time.
		try {
			pushAndTryLockItem(qid, task, handleQueueResponse);
		} catch (err) {
			console.error('FAILED to start', task.id, err.message);
			removeTask(0);
			return reject(err);
		}

		console.error('on its own', task.id);
	});

	// Provide a way for the caller to add event listeners.
	promise.on = emitter.on;

	// Return the promise for the queued task.
	return promise;
});

//
// Public
// Provided to override functionality.
//
exports.createTask = curry1(function createTask(spec) {
	var task = Object.create(null);

	Object.defineProperties(task, {
		qid: {
			enumerable: true,
			value: spec.quid
		},
		id: {
			enumerable: true,
			value: exports.createTaskId()
		},
		delay: {
			enumerable: true,
			value: spec.delay
		}
	});

	return task;
});

//
// Public
// Provided to override functionality.
//
exports.createTaskId = (function () {
	var counter = 0;

	return function createTaskId() {
		var now = new Date();
		var id = counter + '-' + now.getTime() + '-' + createRandomHexCharacters(16);
		counter += 1;
		return id;
	};
}());

//
// ---------------------------------------------------------------------------
//  Private
// ---------------------------------------------------------------------------
//

function curry1(fn) {
	return function f1(a) {
		if (arguments.length < 1) return f1;
		return fn(a);
	};
}

function curry2(fn) {
	return function f2(a, b) {
		if (arguments.length < 1) return f2;
		if (arguments.length < 2) return curry1(function(_b) { return fn(a, _b); });
		return fn(a, b);
	};
}

function curry3(fn) {
	return function f3(a, b, c) {
		if (arguments.length < 1) return f3;
		if (arguments.length < 2) return curry2(function(_b, _c) { return fn(a, _b, _c); });
		if (arguments.length < 3) return curry1(function(_c) { return fn(a, b, _c); });
		return fn(a, b, c);
	};
}

type = curry1(function (x) {
	if (x === null) return 'Null';
	if (typeof x === 'undefined') return 'Undefined';
	return Object.prototype.toString.call(x).slice(8, -1);
});

createRandomHexCharacters = curry1(function (n) {
	var str = '';
	var i;
	for (i = n - 1; i >= 0; i--)
		str += (Math.random() * 16 | 0).toString(16);

	return str;
});

isNotFunction = curry1(function (x) {
	return type(x) !== 'Function';
});

isPromise = curry1(function (x) {
	return x && type(x.then) === 'Function';
});

stringGt = curry2(function (n, str) {
	return type(str) === 'String' && str.length > n;
});

numberInRange = curry3(function (low, high, n) {
	return type(n) === 'Number' && n >= low && n <= high;
});

findByProp = curry3(function (prop, val, list) {
	var i;
	for (i = list.length - 1; i >= 0; i--)
		if (list[i] && list[i].id === val) return list[i];

	return null;
});

findById = findByProp('id');

reduce = curry3(function (reducer, start, list) {
	return list.reduce(reducer, start);
});

add = curry2(function (a, b) {
	return a + b;
});

sum = reduce(add, 0);

prop = curry2(function (key, obj) {
	return obj && obj[key];
});

map = curry2(function (mapper, list) {
	return list.map(mapper);
});

pluck = curry2(function (key, list) {
	return map(prop(key), list);
});

function createEmitter() {
	var emitter = Object.create(null);
	var handlers = {};

	Object.defineProperties(emitter, {
		on: {
			value: function emitter_on(event, handler) {
				var functions;

				if (!stringGt(0, event))
					throw new Error('The event name must be a String with length greater than 0.');

				if (isNotFunction(handler))
					throw new Error('The handler must be a Function.');

				functions = handlers[event];

				if (!functions) {
					functions = [];
					handlers[event] = functions;
				}

				functions.push(handler);
			}
		},
		emit: {
			value: function emitter_emit(event, payload) {
				var functions = handlers[event];
				var i;

				if (functions && functions.length)
					for (i = functions.length - 1; i >= 0; i--) functions[i](payload);
			}
		},
		close: {
			value: function emitter_close() {
				handlers = {};
			}
		}
	});

	return emitter;
}
