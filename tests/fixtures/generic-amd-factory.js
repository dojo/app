define(function() {
	var factory = null;
	var wrapper = function(options) {
		return factory(options);
	};
	wrapper.stub = function(stub) {
		factory = stub;
	};
	return wrapper;
});
