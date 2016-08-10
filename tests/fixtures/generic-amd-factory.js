define(function() {
	var factory = null;
	var wrapper = function(registry, store) {
		return factory(registry, store);
	};
	wrapper.stub = function(stub) {
		factory = stub;
	};
	return wrapper;
});
