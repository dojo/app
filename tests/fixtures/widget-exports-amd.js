define(['dojo-widgets/createWidget'], function(createWidget) {
	return {
		member1: createWidget.default(),
		member2: createWidget.default(),

		// These should be ignored.
		__esModule: false,
		default: null
	}
});
