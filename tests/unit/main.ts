import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import * as main from 'src/main';
import createApp from 'src/createApp';

registerSuite({
	name: 'main',

	'#createApp': {
		'is the same as dojo-app/createApp'() {
			assert.strictEqual(main.createApp, createApp);
		}
	}
});
