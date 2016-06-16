define(function() {
	var factory = null;
	var wrapper = function(registry) {
		return factory(registry);
	};
	wrapper.stub = function(stub) {
		factory = stub;
	};
	return wrapper;
});
