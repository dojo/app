'use strict';
// Explicit strict mode so this file can be loaded in Node.js v5.

define(() => {
	let factory = null;

	const wrapper = (registry) => {
		return factory(registry);
	};

	wrapper.stub = (stub) => {
		factory = stub;
	};

	return wrapper;
});
