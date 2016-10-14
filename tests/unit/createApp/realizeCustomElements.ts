import { Handle } from 'dojo-core/interfaces';
import global from 'dojo-core/global';
import Promise from 'dojo-shim/Promise';
import createActualWidget from 'dojo-widgets/createWidget';
import createContainer from 'dojo-widgets/createContainer';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';
import * as widgetProjector from 'dojo-widgets/projector';
import { match, spy, SinonSpy } from 'sinon';

import createApp, {
	App,
	ActionLike,
	RegistryProvider,
	StoreLike
} from 'src/createApp';

import {
	createAction,
	createStore,
	createWidget,
	rejects,
	strictEqual
} from '../../support/createApp';
import stubDom from '../../support/stubDom';

function opts (obj: any) {
	return JSON.stringify(obj).replace(/"/g, '&quot;');
}

let app: App;
let root: HTMLElement;
let projector: HTMLElement;
let stubbedGlobals: Handle;
let projectorSpy: SinonSpy;

registerSuite({
	name: 'createApp#realize (custom elements)',

	before() {
		stubbedGlobals = stubDom();
		global.cssTransitions = true;
	},

	after() {
		stubbedGlobals.destroy();
		delete global.cssTransitions;
	},

	beforeEach() {
		root = document.createElement('div');
		projector = document.createElement('app-projector');
		root.appendChild(projector);
		app = createApp();
		projectorSpy = spy(widgetProjector, 'createProjector');
	},

	afterEach() {
		projectorSpy && projectorSpy.restore();
	},

	'recognizes custom elements by tag name'() {
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = '<app-widget id="foo"></app-widget>';
		return app.realize(root).then(() => {
			assert.equal(projector.firstChild.nodeName, 'MARK');
		});
	},

	'tag name comparisons are case-insensitive'() {
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = '<aPp-WiDgEt id="foo"></aPp-WiDgEt>';
		return app.realize(root).then(() => {
			assert.equal(projector.firstChild.nodeName, 'MARK');
		});
	},

	'tag name takes precedence over `is` attribute'() {
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = '<app-widget is="app-projector" id="foo"></app-widget>';
		return app.realize(root).then(() => {
			assert.equal(root.firstChild.firstChild.nodeName, 'MARK');
		});
	},

	'`is` attribute comparison is case-insensitive'() {
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = '<div is="aPp-WiDgEt" id="foo"></div>';
		return app.realize(root).then(() => {
			assert.equal(projector.firstChild.nodeName, 'MARK');
		});
	},

	'skips unknown custom elements'() {
		root.innerHTML = '<custom-element></custom-element><div is="another-element"></div>';
		return app.realize(root).then(() => {
			assert.equal(root.firstChild.nodeName, 'CUSTOM-ELEMENT');
			assert.equal(root.lastChild.nodeName, 'DIV');
		});
	},

	'custom elements must be rooted in a app-projector'() {
		root.innerHTML = '<app-widget id="foo"/>';
		return rejects(app.realize(root), Error, 'Custom tags must be rooted in a app-projector');
	},

	'the app-projector element is left in the DOM'() {
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = '<app-widget id="foo"></app-widget>';
		return app.realize(root).then(() => {
			assert.strictEqual(root.firstChild, projector);
		});
	},

	'the app-projector element may be the root'() {
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = '<app-widget id="foo"></app-widget>';
		return app.realize(projector).then(() => {
			assert.equal(projector.firstChild.nodeName, 'MARK');
		});
	},

	'app-projector elements cannot contain other app-projector elements'() {
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = '<app-projector></app-projector>';
		return rejects(app.realize(root), Error, 'app-projector cannot contain another app-projector');
	},

	'realized elements are replaced'() {
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		app.registerWidget('bar', createActualWidget({ tagName: 'strong' }));
		projector.innerHTML = `
			before1
			<app-widget id="foo"></app-widget>
			<div>
				before2
				<app-widget id="bar"></app-widget>
				after2
			</div>
			after1
		`.trim();
		return app.realize(root).then(() => {
			const before1 = projector.firstChild;
			assert.equal(before1.nodeValue!.trim(), 'before1');
			const foo = <Element> before1.nextSibling;
			assert.equal(foo.nodeName, 'MARK');
			const div = foo.nextElementSibling;
			assert.equal(div.nodeName, 'DIV');
			const before2 = div.firstChild;
			assert.equal(before2.nodeValue!.trim(), 'before2');
			const bar = before2.nextSibling;
			assert.equal(bar.nodeName, 'STRONG');
			const after2 = bar.nextSibling;
			assert.equal(after2.nodeValue!.trim(), 'after2');
			const after1 = div.nextSibling;
			assert.equal(after1.nodeValue!.trim(), 'after1');
		});
	},

	'supports multiple projection projectors'() {
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		app.registerWidget('bar', createActualWidget({ tagName: 'strong' }));
		root.innerHTML = `
			<app-projector><app-widget id="foo"></app-widget></app-projector>
			<app-projector><app-widget id="bar"></app-widget></app-projector>
		`.trim();
		return app.realize(root).then(() => {
			assert.equal(root.firstChild.firstChild.nodeName, 'MARK');
			assert.equal(root.lastChild.firstChild.nodeName, 'STRONG');
		});
	},

	'<app-widget> custom elements': {
		'data-uid takes precedence over id'() {
			app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
			projector.innerHTML = '<app-widget id="bar" data-uid="foo"></app-widget>';
			return app.realize(root).then(() => {
				assert.equal(projector.firstChild.nodeName, 'MARK');
			});
		},

		'an ID is required'() {
			projector.innerHTML = '<app-widget></app-widget>';
			return rejects(app.realize(root), Error, 'app-widget requires data-uid or id attribute');
		},

		'the ID must resolve to a widget instance'() {
			projector.innerHTML = '<app-widget id="foo"></app-widget>';
			return rejects(app.realize(root), Error, 'Could not find a value for identity \'foo\'');
		}
	},

	'realizes registered custom elements'() {
		app.registerCustomElementFactory('foo-bar', () => createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = '<foo-bar></foo-bar>';
		return app.realize(root).then(() => {
			assert.equal(projector.firstChild.nodeName, 'MARK');
		});
	},

	'child nodes of custom elements that are not custom elements themselves are discarded'() {
		app.registerCustomElementFactory('foo-bar', () => createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = '<foo-bar>oh noes</foo-bar>';
		return app.realize(root).then(() => {
			assert.equal(projector.firstChild.nodeName, 'MARK');
			assert.isFalse(projector.firstChild.hasChildNodes());
		});
	},

	'the rendered widget hierarchy reflects the nesting of custom elements'() {
		app.registerCustomElementFactory('container-here', () => createContainer());
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		app.registerWidget('bar', createActualWidget({ tagName: 'strong' }));
		root.innerHTML = `
			<app-projector>
				<container-here>
					<app-widget id="foo"></app-widget>
				</container-here>
			</app-projector>
			<app-projector>
				<container-here>
					<app-widget id="bar"></app-widget>
				</container-here>
			</app-projector>
		`.trim();
		return app.realize(root).then(() => {
			const first = root.firstElementChild.firstElementChild;
			assert.equal(first.nodeName, 'DOJO-CONTAINER');
			assert.equal(first.firstChild.nodeName, 'MARK');

			const second = root.lastElementChild.firstElementChild;
			assert.equal(second.nodeName, 'DOJO-CONTAINER');
			assert.equal(second.firstChild.nodeName, 'STRONG');
		});
	},

	'the rendered widget hierarchy ignores non-custom elements'() {
		app.registerCustomElementFactory('container-here', () => createContainer());
		app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
		projector.innerHTML = `
			<container-here>
				<div>
					<app-widget id="foo"></app-widget>
				</div>
			</container-here>
		`.trim();
		return app.realize(root).then(() => {
			const container = projector.firstElementChild;
			assert.equal(container.nodeName, 'DOJO-CONTAINER');
			assert.equal(container.firstChild.nodeName, 'MARK');
		});
	},

	'a widget cannot be attached multiple times in the same projector'() {
		const widget = createActualWidget({ tagName: 'mark' });
		app.registerCustomElementFactory('foo-1', () => widget);
		app.registerCustomElementFactory('foo-2', () => widget);
		projector.innerHTML = `
			<foo-1></foo-1>
			<foo-2></foo-2>
		`;
		return rejects(app.realize(root), Error, 'Cannot attach a widget multiple times');
	},

	'a widget cannot be attached in multiple projectors'() {
		const widget = createActualWidget({ tagName: 'mark' });
		app.registerCustomElementFactory('foo-bar', () => widget);
		root.innerHTML = `
			<app-projector><foo-bar></foo-bar></app-projector>
			<app-projector><foo-bar></foo-bar></app-projector>
		`;
		return rejects(app.realize(root), Error, 'Cannot attach a widget multiple times');
	},

	'a widget cannot be attached in multiple realizations'() {
		const widget = createActualWidget({ tagName: 'mark' });
		app.registerCustomElementFactory('foo-bar', () => widget);
		projector.innerHTML = '<foo-bar></foo-bar>';
		const clone = <Element> projector.cloneNode(true);
		return rejects(
			Promise.all([
				app.realize(projector),
				app.realize(clone)
			]),
			Error,
			'Cannot attach a widget multiple times'
		);
	},

	'a widget cannot be attached if it already has a parent'() {
		const widget = createActualWidget({ tagName: 'mark' });
		createContainer().append(widget);
		app.registerWidget('foo', widget);
		projector.innerHTML = '<app-widget id="foo"></app-widget>';
		return rejects(app.realize(root), Error, 'Cannot attach a widget that already has a parent');
	},

	'custom elements are created with options': {
		'options come from the data-options attribute'() {
			let fooBar: { [p: string]: any };
			let bazQux: { [p: string]: any };
			app.registerCustomElementFactory('foo-bar', (options) => {
				fooBar = options!;
				return createActualWidget({ tagName: 'mark' });
			});
			app.loadDefinition({
				customElements: [
					{
						name: 'baz-qux',
						factory(options) {
							bazQux = options!;
							return createActualWidget({ tagName: 'strong' });
						}
					}
				]
			});
			projector.innerHTML = `
				<foo-bar data-options="${opts({ foo: 'bar', baz: 5 })}"></foo-bar>
				<baz-qux data-options="${opts({ qux: 'quux', thud: 42 })}"></baz-qux>
			`;
			return app.realize(root).then(() => {
				assert.isOk(fooBar);
				assert.equal(fooBar['foo'], 'bar');
				assert.equal(fooBar['baz'], 5);
				assert.isOk(bazQux);
				assert.equal(bazQux['qux'], 'quux');
				assert.equal(bazQux['thud'], 42);
			});
		},

		'realization fails if the data-options value is not valid JSON'() {
			app.registerCustomElementFactory('foo-bar', createWidget);
			projector.innerHTML = `<foo-bar data-options="${opts({}).slice(1)}"></foo-bar>`;
			return rejects(app.realize(root), SyntaxError).then((err) => {
				assert.match(err.message, /^Invalid data-options:/);
				assert.match(err.message, / \(in "}"\)$/);
			});
		},

		'realization fails if the data-options value does not encode an object'() {
			app.registerCustomElementFactory('foo-bar', createWidget);
			projector.innerHTML = `<foo-bar data-options="${opts(null)}"></foo-bar>`;
			return rejects(app.realize(root), TypeError, 'Expected object from data-options (in "null")').then(() => {
				projector.innerHTML = `<foo-bar data-options="${opts(42)}"></foo-bar>`;
				return rejects(app.realize(root), TypeError, 'Expected object from data-options (in "42")');
			});
		},

		'the "id" option must not be present in data-options'() {
			app.registerCustomElementFactory('foo-bar', createWidget);
			projector.innerHTML = `<foo-bar data-options="${opts({ id: {} })}"></foo-bar>`;
			return rejects(app.realize(root), Error, 'Unexpected id value in data-options (in "{\\"id\\":{}}")');
		},

		'the "registryProvider" option must not be present in data-options'() {
			app.registerCustomElementFactory('foo-bar', createWidget);
			projector.innerHTML = `<foo-bar data-options="${opts({ registryProvider: {} })}"></foo-bar>`;
			return rejects(app.realize(root), Error, 'Unexpected registryProvider value in data-options (in "{\\"registryProvider\\":{}}")');
		},

		'the "registryProvider" option is provided to the factory'() {
			let actual: { registryProvider: RegistryProvider };
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			projector.innerHTML = `<foo-bar></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.strictEqual(actual.registryProvider, app.registryProvider);
			});
		},

		'the "state" option must not be present in data-options'() {
			app.registerCustomElementFactory('foo-bar', createWidget);
			projector.innerHTML = `<foo-bar data-options="${opts({ state: {} })}"></foo-bar>`;
			return rejects(app.realize(root), Error, 'Unexpected state value in data-options (in "{\\"state\\":{}}")');
		},

		'the "stateFrom" option must not be present in data-options'() {
			app.registerCustomElementFactory('foo-bar', createWidget);
			projector.innerHTML = `<foo-bar data-options="${opts({ stateFrom: {} })}"></foo-bar>`;
			return rejects(app.realize(root), Error, 'Unexpected stateFrom value in data-options (in "{\\"stateFrom\\":{}}")');
		},

		'the "listeners" option must not be present in data-options'() {
			app.registerCustomElementFactory('foo-bar', createWidget);
			projector.innerHTML = `<foo-bar data-options="${opts({ listeners: {} })}"></foo-bar>`;
			return rejects(app.realize(root), Error, 'Unexpected listeners value in data-options (in "{\\"listeners\\":{}}")');
		},

		'the "listeners" option is derived from the data-listeners attribute': {
			'realization fails if the data-listeners value is not valid JSON'() {
				app.registerCustomElementFactory('foo-bar', createWidget);
				projector.innerHTML = `<foo-bar data-listeners="${opts({}).slice(1)}"></foo-bar>`;
				return rejects(app.realize(root), SyntaxError).then((err) => {
					assert.match(err.message, /^Invalid data-listeners:/);
					assert.match(err.message, / \(in "}"\)$/);
				});
			},

			'realization fails if the data-listeners value does not encode an object'() {
				app.registerCustomElementFactory('foo-bar', createWidget);
				projector.innerHTML = `<foo-bar data-listeners="${opts(null)}"></foo-bar>`;
				return rejects(app.realize(root), TypeError, 'Expected object from data-listeners (in "null")').then(() => {
					projector.innerHTML = `<foo-bar data-listeners="${opts(42)}"></foo-bar>`;
					return rejects(app.realize(root), TypeError, 'Expected object from data-listeners (in "42")');
				});
			},

			'property values must be strings or arrays of strings'() {
				app.registerCustomElementFactory('foo-bar', createWidget);
				projector.innerHTML = `<foo-bar data-listeners="${opts({
					type: 5
				})}"></foo-bar>`;
				return rejects(
					app.realize(root),
					TypeError,
					'Expected data-listeners to be a widget listeners map with action identifiers (in "{\\"type\\":5}")'
				).then(() => {
					projector.innerHTML = `<foo-bar data-listeners="${opts({
						type: [true]
					})}"></foo-bar>`;
					return rejects(
						app.realize(root),
						TypeError,
						'Expected data-listeners to be a widget listeners map with action identifiers (in "{\\"type\\":[true]}")'
					);
				});
			},

			'the strings must identify registered actions'() {
				app.registerCustomElementFactory('foo-bar', createWidget);
				projector.innerHTML = `<foo-bar data-listeners="${opts({
					type: 'action'
				})}"></foo-bar>`;
				return rejects(app.realize(root), Error);
			},

			'causes the custom element factory to be called with a listeners map for the actions'() {
				let actual: { listeners: { [type: string]: ActionLike | ActionLike[] } };
				app.registerCustomElementFactory('foo-bar', (options) => {
					actual = <any> options;
					return createActualWidget({ tagName: 'mark' });
				});
				const expected1 = createAction();
				const expected2 = createAction();
				app.registerAction('action1', expected1);
				app.registerAction('action2', expected2);
				projector.innerHTML = `<foo-bar data-listeners="${opts({
					string: 'action1',
					array: ['action1', 'action2']
				})}"></foo-bar>`;
				return app.realize(root).then(() => {
					assert.isNotNull(actual);
					assert.strictEqual(actual.listeners['string'], expected1);
					assert.lengthOf(actual.listeners['array'], 2);
					assert.strictEqual((<ActionLike[]> actual.listeners['array'])[0], expected1);
					assert.strictEqual((<ActionLike[]> actual.listeners['array'])[1], expected2);
				});
			}
		}
	},

	'non-projector data-state-from attribute': {
		'is ignored if empty'() {
			let actual: { stateFrom: StoreLike };
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			projector.innerHTML = `<foo-bar data-state-from="" id="foo"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.notProperty(actual, 'stateFrom');
			});
		},

		'must identify a registered store'() {
			app.registerCustomElementFactory('foo-bar', createWidget);
			projector.innerHTML = `<foo-bar data-state-from="store" id="foo"></foo-bar>`;
			return rejects(app.realize(root), Error);
		},

		'if the element has an ID, causes the custom element factory to be called with a stateFrom option set to the store'() {
			let actual: { stateFrom: StoreLike };
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			const expected = createStore();
			app.registerStore('store', expected);
			projector.innerHTML = `<foo-bar data-state-from="store" id="foo"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.strictEqual(actual.stateFrom, expected);
			});
		},

		'takes precedence over <app-projector data-state-from>'() {
			let actual: { stateFrom: StoreLike };
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			const expected = createStore();
			app.registerStore('store', expected);
			app.registerStore('otherStore', createStore());
			projector.setAttribute('data-state-from', 'otherStore');
			projector.innerHTML = `<foo-bar data-state-from="store" id="foo"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.strictEqual(actual.stateFrom, expected);
			});
		},

		'takes precedence over the default widget store'() {
			let actual: { stateFrom: StoreLike };
			const app = createApp({ defaultWidgetStore: createStore() });
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			const expected = createStore();
			app.registerStore('store', expected);
			projector.innerHTML = `<foo-bar data-state-from="store" id="foo"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.strictEqual(actual.stateFrom, expected);
			});
		},

		'is ignored if the element does not have an ID'() {
			let actual: { stateFrom: StoreLike };
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			app.registerStore('store', createStore());
			projector.innerHTML = `<foo-bar data-state-from="store" data-options="{}"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.notProperty(actual, 'stateFrom');
			});
		}
	},

	'<app-projector data-css-transition> attribute': {
		'is false if empty'() {
			return app.realize(root).then(() => {
				assert.isTrue(projectorSpy.calledWith( match({ cssTransitions: false })));
			});
		},
		'is passed to the widget projector when explicitly set to false'() {
			projector.setAttribute('data-css-transitions', 'false');
			return app.realize(root).then(() => {
				assert.isTrue(projectorSpy.calledWith( match({ cssTransitions: false })));
			});
		},
		'is passed to the widget projector when explicitly set to true'() {
			projector.setAttribute('data-css-transitions', 'true');
			return app.realize(root).then(() => {
				assert.isTrue(projectorSpy.calledWith( match({ cssTransitions: true })));
			});
		},
		'is passed to the widget projector when attribute node exists without a value'() {
			projector.setAttribute('data-css-transitions', '');
			return app.realize(root).then(() => {
				assert.isTrue(projectorSpy.calledWith( match({ cssTransitions: true })));
			});
		}
	},

	'<app-projector data-state-from> attribute': {
		'is ignored if empty'() {
			let actual: { stateFrom: StoreLike };
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			projector.setAttribute('data-state-from', '');
			projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.notProperty(actual, 'stateFrom');
			});
		},

		'must identify a registered store'() {
			app.registerCustomElementFactory('foo-bar', createWidget);
			projector.setAttribute('data-state-from', 'store');
			projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
			return rejects(app.realize(root), Error);
		},

		'if descendant elements have an ID, causes their custom element factory to be called with a stateFrom option set to the store'() {
			let actual: { stateFrom: StoreLike };
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			const expected = createStore();
			app.registerStore('store', expected);
			projector.setAttribute('data-state-from', 'store');
			projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.strictEqual(actual.stateFrom, expected);
			});
		},

		'takes precedence over the default widget store'() {
			let actual: { stateFrom: StoreLike };
			const app = createApp({ defaultWidgetStore: createStore() });
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			const expected = createStore();
			app.registerStore('store', expected);
			projector.setAttribute('data-state-from', 'store');
			projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.strictEqual(actual.stateFrom, expected);
			});
		},

		'is ignored for descendant elements that do not have an ID'() {
			let actual: { stateFrom: StoreLike };
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			app.registerStore('store', createStore());
			projector.setAttribute('data-state-from', '');
			projector.innerHTML = `<foo-bar data-options="{}"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.notProperty(actual, 'stateFrom');
			});
		}
	},

	'the app has a default widget store': {
		'if the element has an ID, causes the custom element factory to be called with a stateFrom option set to the store'() {
			let actual: { stateFrom: StoreLike };
			const expected = createStore();
			const app = createApp({ defaultWidgetStore: expected });
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = <any> options;
				return createActualWidget({ tagName: 'mark' });
			});
			projector.innerHTML = `<foo-bar id="foo"></foo-bar>`;
			return app.realize(root).then(() => {
				assert.isOk(actual);
				assert.strictEqual(actual.stateFrom, expected);
			});
		}
	},

	'data-state attribute': {
		'realization fails if the data-state value is not valid JSON'() {
			app.registerCustomElementFactory('foo-bar', createActualWidget);
			app.registerStore('store', createStore());
			projector.innerHTML = '<foo-bar id="widget" data-state-from="store" data-state=\'}\'></foo-bar>';
			return rejects(app.realize(root), SyntaxError).then((err) => {
				assert.match(err.message, /^Invalid data-state:/);
				assert.match(err.message, / \(in "}"\)$/);
			});
		},

		'realization fails if the data-state value does not encode an object'() {
			app.registerCustomElementFactory('foo-bar', createActualWidget);
			app.registerStore('store', createStore());
			projector.innerHTML = '<foo-bar id="widget" data-state-from="store" data-state=\'null\'></foo-bar>';
			return rejects(app.realize(root), TypeError, 'Expected object from data-state (in "null")').then(() => {
				projector.innerHTML = '<foo-bar id="widget" data-state-from="store" data-state=\'42\'></foo-bar>';
				return rejects(app.realize(root), TypeError, 'Expected object from data-state (in "42")');
			});
		},

		'for widgets with an ID and stateFrom, add the state to the store before creating the widget'() {
			let calls: string[] = [];
			let addArgs: any[][] = [];

			const store = createStore();
			(<any> store).add = (...args: any[]) => {
				calls.push('add');
				addArgs.push(args);
				return Promise.resolve();
			};

			app.registerCustomElementFactory('foo-bar', () => {
				calls.push('factory');
				return createActualWidget();
			});
			app.registerStore('store', store);

			projector.innerHTML = '<foo-bar id="widget" data-state-from="store" data-state=\'{"foo":"bar"}\'></foo-bar>';
			return app.realize(root).then(() => {
				assert.deepEqual(calls, ['add', 'factory']);
				assert.deepEqual(addArgs, [[{ foo: 'bar' }, { id: 'widget' }]]);
			});
		},

		'creates the widget even if adding state fails'() {
			let calls: string[] = [];

			const store = createStore();
			(<any> store).add = (...args: any[]) => {
				calls.push('add');
				return Promise.reject(new Error());
			};

			app.registerCustomElementFactory('foo-bar', () => {
				calls.push('factory');
				return createActualWidget();
			});
			app.registerStore('store', store);

			projector.innerHTML = '<foo-bar id="widget" data-state-from="store" data-state=\'{"foo":"bar"}\'></foo-bar>';
			return app.realize(root).then(() => {
				assert.deepEqual(calls, ['add', 'factory']);
			});
		}
	},

	'destroying the returned handle': {
		'leaves the rendered elements in the DOM'() {
			app.registerCustomElementFactory('foo-bar', () => createActualWidget({ tagName: 'mark' }));
			root.innerHTML = '<app-projector><foo-bar></foo-bar></app-projector>';
			return app.realize(root).then((handle) => {
				handle.destroy();
				return new Promise((resolve) => { setTimeout(resolve, 50); });
			}).then(() => {
				assert.equal(root.firstChild.firstChild.nodeName, 'MARK');
			});
		},

		'destroys managed widgets'() {
			const managedWidget = createActualWidget({ tagName: 'mark' });
			const attachedWidget = createActualWidget({ tagName: 'strong' });
			app.registerCustomElementFactory('managed-widget', () => managedWidget);
			app.registerWidget('attached', attachedWidget);

			let destroyedManaged = false;
			managedWidget.own({ destroy() { destroyedManaged = true; }});
			let destroyedAttached = false;
			attachedWidget.own({ destroy() { destroyedAttached = true; }});

			projector.innerHTML = '<managed-widget></managed-widget><app-widget id="attached></app-widget>';
			return app.realize(root).then((handle) => {
				handle.destroy();

				assert.isTrue(destroyedManaged);
				assert.isFalse(destroyedAttached);
			});
		},

		'deregisters custom element instances'() {
			const managedWidget = createActualWidget({ tagName: 'mark' });
			app.registerCustomElementFactory('managed-widget', () => managedWidget);

			projector.innerHTML = '<managed-widget id="foo"></managed-widget>';
			return app.realize(root).then((handle) => {
				return app.hasWidget('foo').then((result) => {
					assert.isTrue(result);
					assert.equal(app.identifyWidget(managedWidget), 'foo');
					handle.destroy();
					return app.hasWidget('foo').then((result) => {
						assert.isFalse(result);
						assert.throws(() => app.identifyWidget(managedWidget));
					});
				});
			});
		},

		'a second time is a noop'() {
			app.registerWidget('foo', createActualWidget({ tagName: 'mark' }));
			projector.innerHTML = '<app-widget id="foo"></app-widget>';
			return app.realize(root).then((handle) => {
				handle.destroy();
				handle.destroy();
				return new Promise((resolve) => { setTimeout(resolve, 50); });
			}).then(() => {
				assert.equal(root.firstChild.firstChild.nodeName, 'MARK');
			});
		}
	},

	'identifying and retrieving widgets': {
		'via data-uid'() {
			const fooBar = createActualWidget();
			app.registerCustomElementFactory('foo-bar', () => fooBar);
			projector.innerHTML = '<foo-bar data-uid="fooBar"></foo-bar>';
			return app.realize(root).then(() => {
				assert.equal(app.identifyWidget(fooBar), 'fooBar');
			});
		},

		'via the id attribute'() {
			const fooBar = createActualWidget();
			app.registerCustomElementFactory('foo-bar', () => fooBar);
			projector.innerHTML = '<foo-bar id="fooBar"></foo-bar>';
			return app.realize(root).then(() => {
				assert.equal(app.identifyWidget(fooBar), 'fooBar');
			});
		},

		'data-uid takes precedence over id'() {
			const bazQux = createActualWidget();
			app.registerCustomElementFactory('baz-qux', () => bazQux);
			projector.innerHTML = '<baz-qux id="fooBar" data-uid="bazQux"></baz-qux>';
			return app.realize(root).then(() => {
				assert.equal(app.identifyWidget(bazQux), 'bazQux');
			});
		},

		'ID from data-uid is added to the creation options'() {
			let actual: string;
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = (<any> options).id;
				return createActualWidget();
			});
			projector.innerHTML = '<foo-bar data-uid="the-id"></foo-bar>';
			return app.realize(root).then(() => {
				assert.equal(actual, 'the-id');
			});
		},

		'ID from id is added to the creation options'() {
			let actual: string;
			app.registerCustomElementFactory('foo-bar', (options) => {
				actual = (<any> options).id;
				return createActualWidget();
			});
			projector.innerHTML = '<foo-bar id="the-id" data-options="{}"></foo-bar>';
			return app.realize(root).then(() => {
				assert.equal(actual, 'the-id');
			});
		},

		'IDs must be unique within the application'() {
			app.registerCustomElementFactory('foo-bar', () => createActualWidget());
			app.registerAction('unique', createAction());
			projector.innerHTML = `
				<foo-bar id="unique"></foo-bar>
			`;
			return rejects(app.realize(root), Error, '\'unique\' has already been used as an identifier');
		},

		'widgets without IDs can still be identified'() {
			const widget = createActualWidget();
			app.registerCustomElementFactory('foo-bar', () => widget);
			projector.innerHTML = '<foo-bar></foo-bar>';
			return app.realize(root).then(() => {
				const id = app.identifyWidget(widget);
				assert(id && typeof id === 'string');
			});
		},

		'hasWidget() returns true for custom element instances'() {
			const widget = createActualWidget();
			app.registerCustomElementFactory('foo-bar', () => widget);
			projector.innerHTML = '<foo-bar id="foo"></foo-bar>';
			return app.realize(root).then(() => {
				return app.hasWidget('foo').then((result) => {
					assert.isTrue(result);
				});
			});
		},

		'getWidget() returns custom element instances'() {
			const widget = createActualWidget();
			app.registerCustomElementFactory('foo-bar', () => widget);
			projector.innerHTML = '<foo-bar id="foo"></foo-bar>';
			return app.realize(root).then(() => {
				return strictEqual(app.getWidget('foo'), widget);
			});
		}
	}
});
