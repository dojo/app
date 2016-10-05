import Promise from 'dojo-shim/Promise';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import createApp, { WidgetFactoryOptions } from 'src/createApp';

import { stub as stubWidgetFactory } from '../../fixtures/widget-factory';
import {
	createWidget,
	rejects,
	strictEqual
} from '../../support/createApp';

const { toAbsMid } = require;

registerSuite({
	name: 'createApp (custom elements)',

	'#getCustomElementFactory': {
		'no registered custom element'() {
			assert.throws(() => createApp().getCustomElementFactory('foo-bar'), Error);
		},

		'provides a wrapper for the registered factory'() {
			let receivedOptions: Object | undefined;
			const expectedReturnValue = createWidget();

			const app = createApp();
			app.registerCustomElementFactory('foo-bar', (options) => {
				receivedOptions = options;
				return expectedReturnValue;
			});

			const wrapper = app.getCustomElementFactory('foo-bar');
			const expectedOptions = <WidgetFactoryOptions> {};
			const receivedReturnValue = wrapper(expectedOptions);
			assert.strictEqual(receivedOptions, expectedOptions);
			assert.strictEqual(receivedReturnValue, expectedReturnValue);
		}
	},

	'#hasCustomElementFactory': {
		'no registered custom element'() {
			assert.isFalse(createApp().hasCustomElementFactory('foo-bar'));
		},

		'registered custom element'() {
			const app = createApp();
			app.registerCustomElementFactory('foo-bar', createWidget);

			assert.isTrue(app.hasCustomElementFactory('foo-bar'));
		}
	},

	'#registerCustomElementFactory': {
		'hasCustomElementFactory returns true after'() {
			const app = createApp();
			app.registerCustomElementFactory('foo-bar', createWidget);

			assert.isTrue(app.hasCustomElementFactory('foo-bar'));
		},

		'destroying the returned handle': {
			'deregister the factory'() {
				const app = createApp();
				const handle = app.registerCustomElementFactory('foo-bar', createWidget);
				handle.destroy();

				assert.isFalse(app.hasCustomElementFactory('foo-bar'));
			},

			'a second time is a noop'() {
				const app = createApp();
				const handle = app.registerCustomElementFactory('foo-bar', createWidget);
				handle.destroy();
				handle.destroy();

				assert.isFalse(app.hasCustomElementFactory('foo-bar'));
			}
		},

		'validates the name': {
			'must not be empty'() {
				assert.throws(() => {
					createApp().registerCustomElementFactory('', createWidget);
				}, SyntaxError, '\'\' is not a valid custom element name');
			},

			'must start with a lowercase ASCII letter'() {
				assert.throws(() => {
					createApp().registerCustomElementFactory('💩-', createWidget);
				}, SyntaxError, '\'💩-\' is not a valid custom element name');
			},

			'must contain a hyphen'() {
				assert.throws(() => {
					createApp().registerCustomElementFactory('a', createWidget);
				}, SyntaxError, '\'a\' is not a valid custom element name');
			},

			'must not include uppercase ASCII letters'() {
				assert.throws(() => {
					createApp().registerCustomElementFactory('a-A', createWidget);
				}, SyntaxError, '\'a-A\' is not a valid custom element name');
			},

			'must not be a reserved name'() {
				[
					'annotation-xml',
					'color-profile',
					'font-face',
					'font-face-src',
					'font-face-uri',
					'font-face-format',
					'font-face-name',
					'missing-glyph',
					'app-action',
					'app-actions',
					'app-element',
					'app-projector',
					'app-store',
					'app-widget'
				].forEach((name) => {
					assert.throws(() => {
						createApp().registerCustomElementFactory(name, createWidget);
					}, Error, `'${name}' is not a valid custom element name`);
				});
			}
		},

		'the name must not case-insensitively match a previously registered element'() {
			const app = createApp();
			app.registerCustomElementFactory('a-Ø', () => createWidget());
			assert.throws(() => {
				app.registerCustomElementFactory('a-ø', () => createWidget());
			}, Error);
		}
	},

	'#loadDefinition': {
		'registers multiple'() {
			const expected = {
				'foo-bar': createWidget(),
				'baz-qux': createWidget()
			};

			const app = createApp();
			app.loadDefinition({
				customElements: [
					{
						name: 'foo-bar',
						factory: () => expected['foo-bar']
					},
					{
						name: 'baz-qux',
						factory: () => expected['baz-qux']
					}
				]
			});

			assert.isTrue(app.hasCustomElementFactory('foo-bar'));
			assert.isTrue(app.hasCustomElementFactory('baz-qux'));

			return Promise.all([
				app.getCustomElementFactory('foo-bar')(),
				app.getCustomElementFactory('baz-qux')()
			]).then(([fooBar, bazQux]) => {
				assert.strictEqual(fooBar, expected['foo-bar']);
				assert.strictEqual(bazQux, expected['baz-qux']);
			});
		},

		'factory can be a module identifier'() {
			const expected = createWidget();
			stubWidgetFactory(() => expected);

			const app = createApp({ toAbsMid });
			app.loadDefinition({
				customElements: [
					{
						name: 'foo-bar',
						factory: '../../fixtures/widget-factory'
					}
				]
			});

			return strictEqual(Promise.resolve(app.getCustomElementFactory('foo-bar')()), expected);
		},

		'cannot create widget if identified module has no default factory export'() {
			const app = createApp({ toAbsMid });
			app.loadDefinition({
				customElements: [
					{
						name: 'foo-bar',
						factory: '../../fixtures/no-factory-export'
					}
				]
			});

			return rejects(Promise.resolve(app.getCustomElementFactory('foo-bar')()), Error, 'Could not resolve \'../../fixtures/no-factory-export\' to a widget factory function');
		},

		'registered factory': {
			'returns a promise while the factory is being resolved'() {
				const app = createApp();
				app.loadDefinition({
					customElements: [
						{
							name: 'foo-bar',
							factory: createWidget
						}
					]
				});

				const factory = app.getCustomElementFactory('foo-bar');
				const first = factory();
				const second = factory();
				assert.instanceOf(first, Promise);
				assert.instanceOf(second, Promise);
			},

			// "may" because this depends on the factory
			'may return a widget when called again'() {
				const app = createApp();
				app.loadDefinition({
					customElements: [
						{
							name: 'foo-bar',
							factory: createWidget
						}
					]
				});

				const factory = app.getCustomElementFactory('foo-bar');
				return Promise.resolve(factory()).then(() => {
					assert.notInstanceOf(factory(), Promise);
				});
			}
		}
	}
});
