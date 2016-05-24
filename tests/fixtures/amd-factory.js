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
