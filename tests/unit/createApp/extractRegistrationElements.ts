import { Handle } from 'dojo-core/interfaces';
import Promise from 'dojo-shim/Promise';
import createWidget from 'dojo-widgets/createWidget';
import * as registerSuite from 'intern!object';
import * as assert from 'intern/chai!assert';

import createApp, {
	ActionFactoryOptions,
	App,
	StoreLike,
	WidgetFactoryOptions
} from 'src/createApp';

import actionFixture from 'tests/fixtures/action-instance';
import storeFixture from 'tests/fixtures/store-instance';
import widgetFixture from 'tests/fixtures/widget-instance';
import * as actionExports from 'tests/fixtures/action-exports';
import * as storeExports from 'tests/fixtures/store-exports';
import * as widgetExports from 'tests/fixtures/widget-exports';
import { stub as stubActionFactory } from 'tests/fixtures/action-factory';
import { stub as stubStoreFactory } from 'tests/fixtures/store-factory';
import { stub as stubWidgetFactory } from 'tests/fixtures/widget-factory';
import {
	createAction,
	createStore,
	rejects,
	strictEqual
} from 'tests/support/createApp';
import stubDom from 'tests/support/stubDom';

let app: App = null;
let root: HTMLElement = null;
let stubbedGlobals: Handle = null;

registerSuite({
	name: 'createApp#realize (extract registration elements)',

	before() {
		stubbedGlobals = stubDom();
	},

	after() {
		stubbedGlobals.destroy();
	},

	beforeEach() {
		root = document.createElement('div');
		app = createApp();
	},

	'recognizes custom elements by tag name'() {
		root.innerHTML = '<app-action data-from="tests/fixtures/action-instance"></app-action>';
		return app.realize(root).then(() => {
			assert.isTrue(app.hasAction('action-instance'));
		});
	},

	'tag name comparisons are case-insensitive'() {
		root.innerHTML = '<aPp-AcTiOn data-from="tests/fixtures/action-instance"></aPp-AcTiOn>';
		return app.realize(root).then(() => {
			assert.isTrue(app.hasAction('action-instance'));
		});
	},

	'tag name takes precedence over `is` attribute'() {
		root.innerHTML = '<app-action is="app-store" data-from="tests/fixtures/action-instance"></app-action>';
		return app.realize(root).then(() => {
			assert.isTrue(app.hasAction('action-instance'));
		});
	},

	'`is` attribute comparison is case-insensitive'() {
		root.innerHTML = '<div is="aPp-AcTiOn" data-from="tests/fixtures/action-instance"></div>';
		return app.realize(root).then(() => {
			assert.isTrue(app.hasAction('action-instance'));
		});
	},

	'registration elements may be the root'() {
		root.innerHTML = '<app-action data-from="tests/fixtures/action-instance"></app-action>';
		return app.realize(root.firstElementChild).then(() => {
			assert.isTrue(app.hasAction('action-instance'));
		});
	},

	'registration elements may be nested'() {
		root.innerHTML = `
			<app-action data-import="member1" data-from="tests/fixtures/action-exports">
				<app-action data-import="member2" data-from="tests/fixtures/action-exports"></app-action>
			</app-action>
		`;
		return app.realize(root.firstElementChild).then(() => {
			assert.isTrue(app.hasAction('member1'));
			assert.isTrue(app.hasAction('member2'));
		});
	},

	'destroying the returned handle': {
		'deregisters the actions and stores'() {
			root.innerHTML = `
				<app-action data-from="tests/fixtures/action-instance"></app-action>
				<app-store id="store" data-factory="tests/fixtures/store-factory"></app-store>
			`;
			return app.realize(root).then((handle) => {
				assert.isTrue(app.hasAction('action-instance'));
				assert.isTrue(app.hasStore('store'));

				handle.destroy();
				assert.isFalse(app.hasAction('action-instance'));
				assert.isFalse(app.hasStore('store'));
			});
		},

		'a second time is a noop'() {
			root.innerHTML = `
				<app-action data-from="tests/fixtures/action-instance"></app-action>
				<app-store id="store" data-factory="tests/fixtures/store-factory"></app-store>
			`;
			return app.realize(root).then((handle) => {
				assert.isTrue(app.hasAction('action-instance'));
				assert.isTrue(app.hasStore('store'));

				handle.destroy();
				handle.destroy();
				assert.isFalse(app.hasAction('action-instance'));
				assert.isFalse(app.hasStore('store'));
			});
		}
	},

	'<app-action>': {
		'requires data-uid or id if data-factory is given'() {
			root.innerHTML = '<app-action data-factory="tests/fixtures/action-factory"></app-action>';
			return rejects(app.realize(root), Error, 'app-action requires data-uid or id attribute if data-factory is given');
		},

		'requires data-from if data-factory is not given'() {
			root.innerHTML = '<app-action></app-action>';
			return rejects(app.realize(root), Error, 'app-action requires data-from attribute if data-factory is not given');
		},

		'requires data-factory if data-state-from is given'() {
			root.innerHTML = '<app-action data-state-from="store" data-from="tests/fixtures/action-instance"></app-action>';
			return rejects(app.realize(root), Error, 'app-action requires data-factory attribute if data-state-from is given');
		},

		'requires data-factory if data-state is given'() {
			root.innerHTML = '<app-action data-state="{}" data-from="tests/fixtures/action-instance"></app-action>';
			return rejects(app.realize(root), Error, 'app-action requires data-factory attribute if data-state is given');
		},

		'without data-uid, id or data-import, the data-from must not end in a slash'() {
			root.innerHTML = '<app-action data-from="tests/fixtures/action-instance/"></app-action>';
			return rejects(app.realize(root), Error, 'Could not determine ID for app-action (from=tests/fixtures/action-instance/ and import=null)');
		},

		'is added to the registry under the data-uid value'() {
			root.innerHTML = '<app-action data-uid="foo" data-from="tests/fixtures/action-instance"></app-action>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasAction('foo'));
			});
		},

		'is added to the registry under the id value'() {
			root.innerHTML = '<app-action id="foo" data-from="tests/fixtures/action-instance"></app-action>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasAction('foo'));
			});
		},

		'data-uid takes precedence over id'() {
			root.innerHTML = '<app-action data-uid="foo" id="bar" data-from="tests/fixtures/action-instance"></app-action>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasAction('foo'));
			});
		},

		'is added to the registry under the data-import value (if no data-uid or id)'() {
			root.innerHTML = '<app-action data-import="member1" data-from="tests/fixtures/action-exports"></app-action>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasAction('member1'));
			});
		},

		'is added to the registry under file part of the data-from MID (if no data-uid, id or data-import)'() {
			root.innerHTML = '<app-action data-from="tests/fixtures/action-instance"></app-action>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasAction('action-instance'));
			});
		},

		'data-state-from': {
			'resolves store, passes to factory'() {
				const store = createStore();
				app.registerStore('store', store);

				const action = createAction();
				let received: StoreLike = null;
				stubActionFactory(({ stateFrom }) => {
					received = stateFrom;
					return action;
				});

				root.innerHTML = '<app-action id="foo" data-state-from="store" data-factory="tests/fixtures/action-factory"></app-action>';
				return app.realize(root).then(() => {
					return strictEqual(app.getAction('foo'), action);
				}).then(() => {
					assert.strictEqual(received, store);
				});
			},

			'takes precedence over default action store'() {
				const store = createStore();
				app.registerStore('store', store);

				app.defaultActionStore = createStore();

				const action = createAction();
				let received: StoreLike = null;
				stubActionFactory(({ stateFrom }) => {
					received = stateFrom;
					return action;
				});

				root.innerHTML = '<app-action id="foo" data-state-from="store" data-factory="tests/fixtures/action-factory"></app-action>';
				return app.realize(root).then(() => {
					return strictEqual(app.getAction('foo'), action);
				}).then(() => {
					assert.strictEqual(received, store);
				});
			}
		},

		'data-state': {
			'must be valid JSON'() {
				root.innerHTML = '<app-action data-state="{" id="foo" data-factory="tests/fixtures/action-factory"></app-action>';
				return rejects(app.realize(root), SyntaxError);
			},

			'must be an object'() {
				root.innerHTML = '<app-action data-state="42" id="foo" data-factory="tests/fixtures/action-factory"></app-action>';
				return rejects(app.realize(root), TypeError, 'Expected object from data-state (in "42")');
			},

			'is lazily added to the defined store before the action itself is resolved'() {
				let calls: string[] = [];
				let addArgs: any[][] = [];

				const store = createStore();
				(<any> store).add = (...args: any[]) => {
					calls.push('add');
					addArgs.push(args);
					return Promise.resolve();
				};

				stubActionFactory(() => {
					calls.push('factory');
					return createAction();
				});

				root.innerHTML = '<app-action data-state="{&quot;foo&quot;:42}" data-state-from="store" id="foo" data-factory="tests/fixtures/action-factory"></app-action>';
				app.registerStore('store', store);
				return app.realize(root).then(() => {
					assert.lengthOf(calls, 0);
					return app.getAction('foo');
				}).then(() => {
					assert.deepEqual(calls, ['add', 'factory']);
					assert.deepEqual(addArgs, [[{ foo: 42 }, { id: 'foo' }]]);
				});
			},

			'is lazily added to the default store before the action itself is resolved'() {
				let calls: string[] = [];
				let addArgs: any[][] = [];

				const store = createStore();
				(<any> store).add = (...args: any[]) => {
					calls.push('add');
					addArgs.push(args);
					return Promise.resolve();
				};

				stubActionFactory(() => {
					calls.push('factory');
					return createAction();
				});

				root.innerHTML = '<app-action data-state="{&quot;foo&quot;:42}" id="foo" data-factory="tests/fixtures/action-factory"></app-action>';
				app.defaultActionStore = store;
				return app.realize(root).then(() => {
					assert.lengthOf(calls, 0);
					return app.getAction('foo');
				}).then(() => {
					assert.deepEqual(calls, ['add', 'factory']);
					assert.deepEqual(addArgs, [[{ foo: 42 }, { id: 'foo' }]]);
				});
			},

			'the action is resolved even if adding state fails'() {
				let calls: string[] = [];

				const store = createStore();
				(<any> store).add = (...args: any[]) => {
					calls.push('add');
					return Promise.reject(new Error());
				};

				stubActionFactory(() => {
					calls.push('factory');
					return createAction();
				});

				root.innerHTML = '<app-action data-state="{&quot;foo&quot;:42}" id="foo" data-factory="tests/fixtures/action-factory"></app-action>';
				app.defaultActionStore = store;
				return app.realize(root).then(() => {
					assert.lengthOf(calls, 0);
					return app.getAction('foo');
				}).then(() => {
					assert.deepEqual(calls, ['add', 'factory']);
				});
			},

			'the action is resolved even if there is no store to add state to'() {
				let calls: string[] = [];

				stubActionFactory(() => {
					calls.push('factory');
					return createAction();
				});

				root.innerHTML = '<app-action data-state="{&quot;foo&quot;:42}" id="foo" data-factory="tests/fixtures/action-factory"></app-action>';
				return app.realize(root).then(() => {
					assert.lengthOf(calls, 0);
					return app.getAction('foo');
				}).then(() => {
					assert.deepEqual(calls, ['factory']);
				});
			}
		},

		'lazily resolves action instances': {
			'declared with data-from'() {
				root.innerHTML = '<app-action id="foo" data-from="tests/fixtures/action-instance"></app-action>';
				return app.realize(root).then(() => {
					return strictEqual(app.getAction('foo'), actionFixture);
				});
			},

			'declared with data-from, pointing at an AMD module'() {
				root.innerHTML = '<app-action id="foo" data-from="tests/fixtures/action-instance-amd"></app-action>';
				return app.realize(root).then(() => {
					return new Promise((resolve) => {
						require(['tests/fixtures/action-instance-amd'], resolve);
					}).then((expected) => {
						return strictEqual(app.getAction('foo'), expected);
					});
				});
			},

			'declared with data-import and data-from'() {
				root.innerHTML = '<app-action id="foo" data-import="member1" data-from="tests/fixtures/action-exports"></app-action>';
				return app.realize(root).then(() => {
					return strictEqual(app.getAction('foo'), actionExports['member1']);
				});
			},

			'declared with data-import and data-from, pointing at an AMD module'() {
				root.innerHTML = '<app-action id="foo" data-import="member1" data-from="tests/fixtures/action-exports-amd"></app-action>';
				return app.realize(root).then(() => {
					return new Promise((resolve) => {
						require(['tests/fixtures/action-exports-amd'], resolve);
					}).then((exports: any) => {
						return strictEqual(app.getAction('foo'), exports['member1']);
					});
				});
			},

			'declared with data-factory'() {
				app.defaultActionStore = createStore();

				const action = createAction();
				let options: ActionFactoryOptions = null;
				stubActionFactory((actual) => {
					options = actual;
					return action;
				});

				root.innerHTML = '<app-action id="foo" data-factory="tests/fixtures/action-factory"></app-action>';
				return app.realize(root).then(() => {
					assert.isNull(options);
					return strictEqual(app.getAction('foo'), action);
				}).then(() => {
					assert.strictEqual(options.registryProvider, app.registryProvider);
					assert.strictEqual(options.stateFrom, app.defaultActionStore);
				});
			},

			'declared with data-factory, pointing at an AMD module'() {
				app.defaultActionStore = createStore();

				const action = createAction();
				let options: ActionFactoryOptions = null;
				return new Promise((resolve) => {
					require(['tests/fixtures/generic-amd-factory'], (factory) => {
						factory.stub((actual: ActionFactoryOptions) => {
							options = actual;
							return action;
						});
						resolve();
					});
				}).then(() => {
					root.innerHTML = '<app-action id="foo" data-factory="tests/fixtures/generic-amd-factory"></app-action>';
					return app.realize(root).then(() => {
						assert.isNull(options);
						return strictEqual(app.getAction('foo'), action);
					}).then(() => {
						assert.strictEqual(options.registryProvider, app.registryProvider);
						assert.strictEqual(options.stateFrom, app.defaultActionStore);
					});
				});
			}
		},

		'is removed from the DOM'() {
			root.innerHTML = '<app-action data-from="tests/fixtures/action-instance"></app-action>';
			return app.realize(root).then(() => {
				assert.isFalse(root.hasChildNodes());
			});
		}
	},

	'<app-actions>': {
		'requires data-from'() {
			root.innerHTML = '<app-actions></app-actions>';
			return rejects(app.realize(root), Error, 'app-actions requires data-from attribute');
		},

		'adds all actions to the registry based on the exported members'() {
			root.innerHTML = '<app-actions data-from="tests/fixtures/action-exports"></app-actions>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasAction('member1'));
				assert.isTrue(app.hasAction('member2'));
			});
		},

		'resolves action instances'() {
			root.innerHTML = '<app-actions data-from="tests/fixtures/action-exports"></app-actions>';
			return app.realize(root).then(() => {
				return Promise.all([app.getAction('member1'), app.getAction('member2')]);
			}).then(([member1, member2]) => {
				assert.strictEqual(member1, actionExports['member1']);
				assert.strictEqual(member2, actionExports['member2']);
			});
		},

		'resolves action instances, from an AMD module'() {
			root.innerHTML = '<app-actions data-from="tests/fixtures/action-exports-amd"></app-actions>';
			return app.realize(root).then(() => {
				return Promise.all([app.getAction('member1'), app.getAction('member2')]);
			}).then(([member1, member2]) => {
				return new Promise((resolve) => {
					require(['tests/fixtures/action-exports-amd'], resolve);
				}).then((exports: any) => {
					assert.strictEqual(member1, exports['member1']);
					assert.strictEqual(member2, exports['member2']);
				});
			});
		},

		'imports nothing if the module has no exported members'() {
			root.innerHTML = '<app-actions data-from="tests/fixtures/no-instance-export"></app-actions>';
			return app.realize(root);
		},

		'does not import __esModule and default members from an AMD module'() {
			root.innerHTML = '<app-actions data-from="tests/fixtures/action-exports-amd"></app-actions>';
			return app.realize(root).then(() => {
				assert.isFalse(app.hasAction('__esModule'));
				assert.isFalse(app.hasAction('default'));
			});
		},

		'causes realize() to reject if accessing members fails'() {
			root.innerHTML = '<app-actions data-from="tests/fixtures/throwing-exports-amd"></app-actions>';
			return rejects(app.realize(root), Error, '🙊');
		},

		'is removed from the DOM'() {
			root.innerHTML = '<app-actions data-from="tests/fixtures/action-exports"></app-actions>';
			return app.realize(root).then(() => {
				assert.isFalse(root.hasChildNodes());
			});
		}
	},

	'<app-element>': {
		'requires data-name'() {
			root.innerHTML = '<app-element data-factory="tests/fixtures/widget-factory"></app-element>';
			return rejects(app.realize(root), Error, 'app-element requires data-name');
		},

		'requires data-factory'() {
			root.innerHTML = '<app-element data-name="valid-name"></app-element>';
			return rejects(app.realize(root), Error, 'app-element requires data-factory');
		},

		'validates data-name': {
			'must not be empty'() {
				root.innerHTML = '<app-element data-name="" data-factory="tests/fixtures/widget-factory"></app-element>';
				return rejects(app.realize(root), Error, 'app-element requires data-name');
			},

			'must start with a lowercase ASCII letter'() {
				root.innerHTML = '<app-element data-name="💩-" data-factory="tests/fixtures/widget-factory"></app-element>';
				return rejects(app.realize(root), SyntaxError, '\'💩-\' is not a valid custom element name');
			},

			'must contain a hyphen'() {
				root.innerHTML = '<app-element data-name="a" data-factory="tests/fixtures/widget-factory"></app-element>';
				return rejects(app.realize(root), SyntaxError, '\'a\' is not a valid custom element name');
			},

			'must not include uppercase ASCII letters'() {
				root.innerHTML = '<app-element data-name="a-A" data-factory="tests/fixtures/widget-factory"></app-element>';
				return rejects(app.realize(root), SyntaxError, '\'a-A\' is not a valid custom element name');
			},

			'must not be a reserved name'() {
				return Promise.all([
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
				].map((name) => {
					root.innerHTML = `<app-element data-name="${name}" data-factory="tests/fixtures/widget-factory"></app-element>`;
					return rejects(app.realize(root), Error, `'${name}' is not a valid custom element name`);
				}));
			}
		},

		'data-name must not case-insensitively match a previously registered element'() {
			app.registerCustomElementFactory('a-Ø', () => createWidget());
			root.innerHTML = '<app-element data-name="a-ø" data-factory="tests/fixtures/widget-factory"></app-element>';
			return rejects(app.realize(root), Error);
		},

		'is added to the registry under the data-name value'() {
			root.innerHTML = '<app-element data-name="foo-bar" data-factory="tests/fixtures/widget-factory"></app-element>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasCustomElementFactory('foo-bar'));
			});
		},

		'lazily resolves the factory when widgets are created': {
			'pointed at an ES module'() {
				let called = false;
				const widget = createWidget();
				stubWidgetFactory(() => {
					called = true;
					return widget;
				});

				root.innerHTML = '<app-element data-name="foo-bar" data-factory="tests/fixtures/widget-factory"></app-element>';
				return app.realize(root).then(() => {
					assert.isFalse(called);
					return strictEqual(Promise.resolve(app.getCustomElementFactory('foo-bar')()), widget).then(() => {
						assert.isTrue(called);
					});
				});
			},

			'pointed at an AMD module'() {
				let called = false;
				const widget = createWidget();
				return new Promise((resolve) => {
					require(['tests/fixtures/generic-amd-factory'], (factory) => {
						factory.stub(() => {
							called = true;
							return widget;
						});
						resolve();
					});
				}).then(() => {
					root.innerHTML = '<app-element data-name="foo-bar" data-factory="tests/fixtures/generic-amd-factory"></app-element>';
					return app.realize(root);
				}).then(() => {
					assert.isFalse(called);
					return strictEqual(Promise.resolve(app.getCustomElementFactory('foo-bar')()), widget).then(() => {
						assert.isTrue(called);
					});
				});
			}
		},

		'is removed from the DOM'() {
			root.innerHTML = '<app-element data-name="foo-bar" data-factory="tests/fixtures/widget-factory"></app-element>';
			return app.realize(root).then(() => {
				assert.isFalse(root.hasChildNodes());
			});
		}
	},

	'<app-store>': {
		'requires data-uid, id or data-type attribute if data-factory is given'() {
			root.innerHTML = '<app-store data-factory="tests/fixtures/store-factory"></app-store>';
			return rejects(app.realize(root), Error, 'app-store requires data-uid, id or data-type attribute if data-factory is given');
		},

		'requires data-from if data-factory is not given'() {
			root.innerHTML = '<app-store></app-store>';
			return rejects(app.realize(root), Error, 'app-store requires data-from attribute if data-factory is not given');
		},

		'without data-uid, id, data-type or data-import, the data-from must not end in a slash'() {
			root.innerHTML = '<app-store data-from="tests/fixtures/store-instance/"></app-store>';
			return rejects(app.realize(root), Error, 'Could not determine ID for app-store (from=tests/fixtures/store-instance/ and import=null)');
		},

		'data-type must not be provided with data-uid'() {
			root.innerHTML = '<app-store data-uid="foo" data-type="action" data-factory="tests/fixtures/store-factory"></app-store>';
			return rejects(app.realize(root), Error, 'data-type attribute must not be provided if app-store has data-uid or id attribute');
		},

		'data-type must not be provided with id'() {
			root.innerHTML = '<app-store data-uid="foo" data-type="action" data-factory="tests/fixtures/store-factory"></app-store>';
			return rejects(app.realize(root), Error, 'data-type attribute must not be provided if app-store has data-uid or id attribute');
		},

		'data-type, if provided, must be "action" or "widget"'() {
			root.innerHTML = '<app-store data-type="foo" data-factory="tests/fixtures/store-factory"></app-store>';
			return rejects(app.realize(root), Error, 'data-type attribute of app-store must have a value of \'action\' or \'widget\'');
		},

		'data-options': {
			'must be valid JSON'() {
				root.innerHTML = '<app-store data-options="{" id="foo" data-factory="tests/fixtures/store-factory"></app-store>';
				return rejects(app.realize(root), SyntaxError);
			},

			'must be an object'() {
				root.innerHTML = '<app-store data-options="42" id="foo" data-factory="tests/fixtures/store-factory"></app-store>';
				return rejects(app.realize(root), TypeError, 'Expected object from data-options (in "42")');
			},

			'requires data-factory'() {
				root.innerHTML = '<app-store data-options="{}" data-from="tests/fixtures/store-instance"></app-store>';
				return rejects(app.realize(root), Error, 'app-store requires data-factory attribute if data-options is given');
			},

			'is passed to the factory'() {
				const store = createStore();
				let received: any = null;
				stubStoreFactory((options: any) => {
					received = options;
					return store;
				});

				root.innerHTML = '<app-store data-options="{&quot;foo&quot;:42}" id="foo" data-factory="tests/fixtures/store-factory"></app-store>';
				return app.realize(root).then(() => {
					return strictEqual(app.getStore('foo'), store);
				}).then(() => {
					assert.deepEqual(received, { foo: 42 });
				});
			}
		},

		'is added to the registry under the data-uid value'() {
			root.innerHTML = '<app-store data-uid="foo" data-factory="tests/fixtures/store-factory"></app-store>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasStore('foo'));
			});
		},

		'is added to the registry under the id value'() {
			root.innerHTML = '<app-store id="foo" data-factory="tests/fixtures/store-factory"></app-store>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasStore('foo'));
			});
		},

		'data-uid takes precedence over id'() {
			root.innerHTML = '<app-store data-uid="foo" id="bar" data-factory="tests/fixtures/store-factory"></app-store>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasStore('foo'));
			});
		},

		'is added to the registry under the data-import value (if no data-uid, id or data-type)'() {
			root.innerHTML = '<app-store data-import="member1" data-from="tests/fixtures/store-exports"></app-store>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasStore('member1'));
			});
		},

		'is added to the registry under file part of the data-from MID (if no data-uid, id, data-type or data-import)'() {
			root.innerHTML = '<app-store data-from="tests/fixtures/store-instance"></app-store>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasStore('store-instance'));
			});
		},

		'lazily resolves store instances': {
			'declared with data-from'() {
				root.innerHTML = '<app-store id="foo" data-from="tests/fixtures/store-instance"></app-store>';
				return app.realize(root).then(() => {
					return strictEqual(app.getStore('foo'), storeFixture);
				});
			},

			'declared with data-from, pointing at an AMD module'() {
				root.innerHTML = '<app-store id="foo" data-from="tests/fixtures/store-instance-amd"></app-store>';
				return app.realize(root).then(() => {
					return new Promise((resolve) => {
						require(['tests/fixtures/store-instance-amd'], resolve);
					}).then((expected) => {
						return strictEqual(app.getStore('foo'), expected);
					});
				});
			},

			'declared with data-import and data-from'() {
				root.innerHTML = '<app-store id="foo" data-import="member1" data-from="tests/fixtures/store-exports"></app-store>';
				return app.realize(root).then(() => {
					return strictEqual(app.getStore('foo'), storeExports['member1']);
				});
			},

			'declared with data-import and data-from, pointing at an AMD module'() {
				root.innerHTML = '<app-store id="foo" data-import="member1" data-from="tests/fixtures/store-exports-amd"></app-store>';
				return app.realize(root).then(() => {
					return new Promise((resolve) => {
						require(['tests/fixtures/store-exports-amd'], resolve);
					}).then((exports: any) => {
						return strictEqual(app.getStore('foo'), exports['member1']);
					});
				});
			},

			'declared with data-factory'() {
				const store = createStore();
				let called = false;
				stubStoreFactory(() => {
					called = true;
					return store;
				});

				root.innerHTML = '<app-store id="foo" data-factory="tests/fixtures/store-factory"></app-store>';
				return app.realize(root).then(() => {
					assert.isFalse(called);
					return strictEqual(app.getStore('foo'), store);
				});
			},

			'declared with data-factory, pointing at an AMD module'() {
				const store = createStore();
				let called = false;
				return new Promise((resolve) => {
					require(['tests/fixtures/generic-amd-factory'], (factory) => {
						let called = false;
						factory.stub(() => {
							called = true;
							return store;
						});
						resolve();
					});
				}).then(() => {
					root.innerHTML = '<app-store id="foo" data-factory="tests/fixtures/generic-amd-factory"></app-store>';
					return app.realize(root).then(() => {
						assert.isFalse(called);
						return strictEqual(app.getStore('foo'), store);
					});
				});
			}
		},

		'with data-type': {
			'is immediately added as the default action store if data-type=action'() {
				const store = createStore();
				stubStoreFactory(() => store);

				root.innerHTML = '<app-store data-type="action" data-factory="tests/fixtures/store-factory"></app-store>';
				return app.realize(root).then(() => {
					assert.strictEqual(app.defaultActionStore, store);
				});
			},

			'is immediately added as the default widget store if data-type=widget'() {
				const store = createStore();
				stubStoreFactory(() => store);

				root.innerHTML = '<app-store data-type="widget" data-factory="tests/fixtures/store-factory"></app-store>';
				return app.realize(root).then(() => {
					assert.strictEqual(app.defaultWidgetStore, store);
				});
			},

			'causes realize() to reject if used more than once (with the same type)'() {
				const store = createStore();
				stubStoreFactory(() => store);

				root.innerHTML = `
					<app-store data-type="action" data-factory="tests/fixtures/store-factory"></app-store>;
					<app-store data-type="action" data-factory="tests/fixtures/store-factory"></app-store>
				`;
				return rejects(app.realize(root), Error);
			},

			'causes realize() to reject if there already is a corresponding default store'() {
				const store = createStore();
				stubStoreFactory(() => store);

				root.innerHTML = '<app-store data-type="action" data-factory="tests/fixtures/store-factory"></app-store>';
				app.defaultActionStore = createStore();
				return rejects(app.realize(root), Error);
			}
		},

		'is removed from the DOM'() {
			root.innerHTML = '<app-store id="foo" data-factory="tests/fixtures/store-factory"></app-store>';
			return app.realize(root).then(() => {
				assert.isFalse(root.hasChildNodes());
			});
		}
	},

	'<app-widget>': {
		beforeEach() {
			// The widgets are actually rendered. Hackily clean up so tests pass.
			delete widgetFixture.parent;
			delete widgetExports.member1.parent;
			delete widgetExports.member2.parent;
		},

		'requires data-uid or id if data-factory is given'() {
			root.innerHTML = '<app-projector><app-widget data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
			return rejects(app.realize(root), Error, 'app-widget requires data-uid or id attribute if data-factory is given');
		},

		'requires data-factory if data-state-from is given'() {
			root.innerHTML = '<app-projector><app-widget data-state-from="store" data-from="tests/fixtures/widget-instance"></app-widget></app-projector>';
			return rejects(app.realize(root), Error, 'app-widget requires data-factory attribute if data-state-from is given');
		},

		'requires data-factory if data-state is given'() {
			root.innerHTML = '<app-projector><app-widget data-state="{}" data-from="tests/fixtures/widget-instance"></app-widget></app-projector>';
			return rejects(app.realize(root), Error, 'app-widget requires data-factory attribute if data-state is given');
		},

		'without data-uid, id or data-import, the data-from must not end in a slash'() {
			root.innerHTML = '<app-projector><app-widget data-from="tests/fixtures/widget-instance/"></app-widget></app-projector>';
			return rejects(app.realize(root), Error, 'Could not determine ID for app-widget (from=tests/fixtures/widget-instance/ and import=null)');
		},

		'is added to the registry under the data-uid value'() {
			root.innerHTML = '<app-projector><app-widget data-uid="foo" data-from="tests/fixtures/widget-instance"></app-widget></app-projector>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasWidget('foo'));
			});
		},

		'is added to the registry under the id value'() {
			root.innerHTML = '<app-projector><app-widget id="foo" data-from="tests/fixtures/widget-instance"></app-widget></app-projector>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasWidget('foo'));
			});
		},

		'data-uid takes precedence over id'() {
			root.innerHTML = '<app-projector><app-widget data-uid="foo" id="bar" data-from="tests/fixtures/widget-instance"></app-widget></app-projector>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasWidget('foo'));
			});
		},

		'is added to the registry under the data-import value (if no data-uid or id)'() {
			root.innerHTML = '<app-projector><app-widget data-import="member1" data-from="tests/fixtures/widget-exports"></app-widget></app-projector>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasWidget('member1'));
			});
		},

		'is added to the registry under file part of the data-from MID (if no data-uid, id or data-import)'() {
			root.innerHTML = '<app-projector><app-widget data-from="tests/fixtures/widget-instance"></app-widget></app-projector>';
			return app.realize(root).then(() => {
				assert.isTrue(app.hasWidget('widget-instance'));
			});
		},

		'data-state-from': {
			'resolves store, passes to factory'() {
				const store = createStore();
				app.registerStore('store', store);

				const widget = createWidget();
				let received: StoreLike = null;
				stubWidgetFactory(({ stateFrom }) => {
					received = stateFrom;
					return widget;
				});

				root.innerHTML = '<app-projector><app-widget id="foo" data-state-from="store" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					assert.strictEqual(received, store);
					return strictEqual(app.getWidget('foo'), widget);
				});
			},

			'takes precedence over default widget store'() {
				const store = createStore();
				app.registerStore('store', store);

				app.defaultWidgetStore = createStore();

				const widget = createWidget();
				let received: StoreLike = null;
				stubWidgetFactory(({ stateFrom }) => {
					received = stateFrom;
					return widget;
				});

				root.innerHTML = '<app-projector><app-widget id="foo" data-state-from="store" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					assert.strictEqual(received, store);
					return strictEqual(app.getWidget('foo'), widget);
				});
			}
		},

		'data-listeners': {
			'must be valid JSON'() {
				root.innerHTML = '<app-projector><app-widget data-listeners="{" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return rejects(app.realize(root), SyntaxError);
			},

			'must be an object'() {
				root.innerHTML = '<app-projector><app-widget data-listeners="42" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return rejects(app.realize(root), TypeError, 'Expected object from data-listeners (in "42")');
			},

			'requires data-factory'() {
				root.innerHTML = '<app-projector><app-widget data-listeners="{}" data-from="tests/fixtures/widget-instance"></app-widget></app-projector>';
				return rejects(app.realize(root), Error, 'app-widget requires data-factory attribute if data-listeners is given');
			},

			'is passed to the factory'() {
				const widget = createWidget();
				let received: any = null;
				stubWidgetFactory((options: any) => {
					delete options.id;
					delete options.registryProvider;
					received = options;
					return widget;
				});

				const action = createAction();
				app.registerAction('action', action);

				root.innerHTML = '<app-projector><app-widget data-listeners="{&quot;foo&quot;:&quot;action&quot;}" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					assert.strictEqual(received.listeners.foo, action);
					return strictEqual(app.getWidget('foo'), widget);
				});
			}
		},

		'data-options': {
			'must be valid JSON'() {
				root.innerHTML = '<app-projector><app-widget data-options="{" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return rejects(app.realize(root), SyntaxError);
			},

			'must be an object'() {
				root.innerHTML = '<app-projector><app-widget data-options="42" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return rejects(app.realize(root), TypeError, 'Expected object from data-options (in "42")');
			},

			'requires data-factory'() {
				root.innerHTML = '<app-projector><app-widget data-options="{}" data-from="tests/fixtures/widget-instance"></app-widget></app-projector>';
				return rejects(app.realize(root), Error, 'app-widget requires data-factory attribute if data-options is given');
			},

			'is passed to the factory'() {
				const widget = createWidget();
				let received: any = null;
				stubWidgetFactory((options: any) => {
					delete options.id;
					delete options.registryProvider;
					received = options;
					return widget;
				});

				root.innerHTML = '<app-projector><app-widget data-options="{&quot;foo&quot;:42}" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					assert.deepEqual(received, { foo: 42 });
					return strictEqual(app.getWidget('foo'), widget);
				});
			}
		},

		'data-state': {
			'must be valid JSON'() {
				root.innerHTML = '<app-projector><app-widget data-state="{" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return rejects(app.realize(root), SyntaxError);
			},

			'must be an object'() {
				root.innerHTML = '<app-projector><app-widget data-state="42" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return rejects(app.realize(root), TypeError, 'Expected object from data-state (in "42")');
			},

			'is lazily added to the defined store before the widget itself is resolved'() {
				let calls: string[] = [];
				let addArgs: any[][] = [];

				const store = createStore();
				(<any> store).add = (...args: any[]) => {
					calls.push('add');
					addArgs.push(args);
					return Promise.resolve();
				};

				stubWidgetFactory(() => {
					calls.push('factory');
					return createWidget();
				});

				root.innerHTML = '<app-projector><app-widget data-state="{&quot;foo&quot;:42}" data-state-from="store" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				app.registerStore('store', store);
				return app.realize(root).then(() => {
					assert.deepEqual(calls, ['add', 'factory']);
					assert.deepEqual(addArgs, [[{ foo: 42 }, { id: 'foo' }]]);
				});
			},

			'is lazily added to the default store before the widget itself is resolved'() {
				let calls: string[] = [];
				let addArgs: any[][] = [];

				const store = createStore();
				(<any> store).add = (...args: any[]) => {
					calls.push('add');
					addArgs.push(args);
					return Promise.resolve();
				};

				stubWidgetFactory(() => {
					calls.push('factory');
					return createWidget();
				});

				root.innerHTML = '<app-projector><app-widget data-state="{&quot;foo&quot;:42}" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				app.defaultWidgetStore = store;
				return app.realize(root).then(() => {
					assert.deepEqual(calls, ['add', 'factory']);
					assert.deepEqual(addArgs, [[{ foo: 42 }, { id: 'foo' }]]);
				});
			},

			'the widget is resolved even if adding state fails'() {
				let calls: string[] = [];

				const store = createStore();
				(<any> store).add = (...args: any[]) => {
					calls.push('add');
					return Promise.reject(new Error());
				};

				stubWidgetFactory(() => {
					calls.push('factory');
					return createWidget();
				});

				root.innerHTML = '<app-projector><app-widget data-state="{&quot;foo&quot;:42}" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				app.defaultWidgetStore = store;
				return app.realize(root).then(() => {
					assert.deepEqual(calls, ['add', 'factory']);
				});
			},

			'the widget is resolved even if there is no store to add state to'() {
				let calls: string[] = [];

				stubWidgetFactory(() => {
					calls.push('factory');
					return createWidget();
				});

				root.innerHTML = '<app-projector><app-widget data-state="{&quot;foo&quot;:42}" id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					assert.deepEqual(calls, ['factory']);
				});
			}
		},

		'lazily resolves widget instances': {
			'declared with data-from'() {
				root.innerHTML = '<app-projector><app-widget id="foo" data-from="tests/fixtures/widget-instance"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					return strictEqual(app.getWidget('foo'), widgetFixture);
				});
			},

			'declared with data-from, pointing at an AMD module'() {
				root.innerHTML = '<app-projector><app-widget id="foo" data-from="tests/fixtures/widget-instance-amd"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					return new Promise((resolve) => {
						require(['tests/fixtures/widget-instance-amd'], resolve);
					}).then((expected) => {
						return strictEqual(app.getWidget('foo'), expected);
					});
				});
			},

			'declared with data-import and data-from'() {
				root.innerHTML = '<app-projector><app-widget id="foo" data-import="member1" data-from="tests/fixtures/widget-exports"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					return strictEqual(app.getWidget('foo'), widgetExports['member1']);
				});
			},

			'declared with data-import and data-from, pointing at an AMD module'() {
				root.innerHTML = '<app-projector><app-widget id="foo" data-import="member1" data-from="tests/fixtures/widget-exports-amd"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					return new Promise((resolve) => {
						require(['tests/fixtures/widget-exports-amd'], resolve);
					}).then((exports: any) => {
						return strictEqual(app.getWidget('foo'), exports['member1']);
					});
				});
			},

			'declared with data-factory'() {
				app.defaultWidgetStore = createStore();

				const widget = createWidget();
				let options: WidgetFactoryOptions = null;
				stubWidgetFactory((actual) => {
					options = actual;
					return widget;
				});

				root.innerHTML = '<app-projector><app-widget id="foo" data-factory="tests/fixtures/widget-factory"></app-widget></app-projector>';
				return app.realize(root).then(() => {
					assert.strictEqual(options.registryProvider, app.registryProvider);
					assert.strictEqual(options.stateFrom, app.defaultWidgetStore);
					return strictEqual(app.getWidget('foo'), widget);
				});
			},

			'declared with data-factory, pointing at an AMD module'() {
				app.defaultWidgetStore = createStore();

				const widget = createWidget();
				let options: WidgetFactoryOptions = null;
				return new Promise((resolve) => {
					require(['tests/fixtures/generic-amd-factory'], (factory) => {
						factory.stub((actual: WidgetFactoryOptions) => {
							options = actual;
							return widget;
						});
						resolve();
					});
				}).then(() => {
					root.innerHTML = '<app-projector><app-widget id="foo" data-factory="tests/fixtures/generic-amd-factory"></app-widget></app-projector>';
					return app.realize(root).then(() => {
						assert.strictEqual(options.registryProvider, app.registryProvider);
						assert.strictEqual(options.stateFrom, app.defaultWidgetStore);
						return strictEqual(app.getWidget('foo'), widget);
					});
				});
			}
		}
	}
});
