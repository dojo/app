import { remove } from 'dojo-dom/dom';
import { from as arrayFrom } from 'dojo-shim/array';
import Promise from 'dojo-shim/Promise';

import {
	ActionDefinition,
	ActionFactory,
	ActionLike,
	CustomElementDefinition,
	StoreDefinition,
	StoreFactory,
	StoreLike,
	WidgetDefinition,
	WidgetFactory,
	WidgetLike
} from '../createApp';
import { RESOLVE_CONTENTS, ResolveMid } from './moduleResolver';
import parseJsonAttribute from './parseJsonAttribute';

interface BaseTask {
	element: Element;
}

interface JsonObject {
	[key: string]: any;
}

interface ActionTask extends BaseTask {
	factory?: string;
	from?: string;
	id: string;
	importName: string;
	state?: JsonObject;
	stateFrom?: string;
	type: 'action';
}

interface ElementTask extends BaseTask {
	factory: string;
	name: string;
	type: 'element';
}

interface MultipleActionsTask extends BaseTask {
	from: string;
	type: 'multiple-actions';
}

interface StoreTask extends BaseTask {
	default?: 'action' | 'widget';
	factory: string;
	from?: string;
	id: string;
	importName: string;
	options?: JsonObject;
	type: 'store';
}

interface WidgetTask extends BaseTask {
	factory?: string;
	from?: string;
	id: string;
	importName: string;
	listeners?: JsonObject;
	options?: JsonObject;
	state?: JsonObject;
	stateFrom?: string;
	type: 'widget';
}

type Task = ActionTask | ElementTask | MultipleActionsTask | StoreTask | WidgetTask;

const parsers = Object.create(null, {
	'app-action': {
		value(element: Element): ActionTask {
			let id = element.getAttribute('data-uid') || element.getAttribute('id');
			const factory = element.getAttribute('data-factory');
			const from = element.getAttribute('data-from');
			const importName = element.getAttribute('data-import');
			const stateFrom = element.getAttribute('data-state-from');
			const stateJson = element.getAttribute('data-state');

			if (factory && !id) {
				throw new Error('app-action requires data-uid or id attribute if data-factory is given');
			}
			if (!factory && !from) {
				throw new Error('app-action requires data-from attribute if data-factory is not given');
			}
			if (stateFrom && !factory) {
				throw new Error('app-action requires data-factory attribute if data-state-from is given');
			}
			if (stateJson && !factory) {
				throw new Error('app-action requires data-factory attribute if data-state is given');
			}

			if (from && !id) {
				if (importName) {
					id = importName;
				}
				else {
					id = from.split('/').pop();
				}
			}

			if (!id) {
				throw new Error(`Could not determine ID for app-action (from=${from} and import=${importName})`);
			}

			const state = stateJson ? parseJsonAttribute<JsonObject>('data-state', stateJson) : null;

			return {
				element,
				factory,
				from,
				id,
				importName,
				state,
				stateFrom,
				type: 'action'
			};
		}
	},

	'app-actions': {
		value(element: Element): MultipleActionsTask {
			const from = element.getAttribute('data-from');
			if (!from) {
				throw new Error('app-actions requires data-from attribute');
			}

			return {
				element,
				from,
				type: 'multiple-actions'
			};
		}
	},

	'app-element': {
		value(element: Element): ElementTask {
			const factory = element.getAttribute('data-factory');
			const name = element.getAttribute('data-name');

			if (!factory) {
				throw new Error('app-element requires data-factory');
			}
			if (!name) {
				throw new Error('app-element requires data-name');
			}

			return {
				element,
				factory,
				name,
				type: 'element'
			};
		}
	},

	'app-store': {
		value(element: Element): StoreTask {
			let id = element.getAttribute('data-uid') || element.getAttribute('id');
			const factory = element.getAttribute('data-factory');
			const from = element.getAttribute('data-from');
			const importName = element.getAttribute('data-import');
			const type = element.getAttribute('data-type');
			const optionsJson = element.getAttribute('data-options');

			if (factory && !id && !type) {
				throw new Error('app-store requires data-uid, id or data-type attribute if data-factory is given');
			}
			if (!factory && !from) {
				throw new Error('app-store requires data-from attribute if data-factory is not given');
			}
			if (type && id) {
				throw new Error('data-type attribute must not be provided if app-store has data-uid or id attribute');
			}
			if (type && type !== 'action' && type !== 'widget') {
				throw new Error('data-type attribute of app-store must have a value of \'action\' or \'widget\'');
			}
			if (optionsJson && !factory) {
				throw new Error('app-store requires data-factory attribute if data-options is given');
			}

			if (from && !type && !id) {
				if (importName) {
					id = importName;
				}
				else {
					id = from.split('/').pop();
				}
			}

			if (!type && !id) {
				throw new Error(`Could not determine ID for app-store (from=${from} and import=${importName})`);
			}

			const options = optionsJson ? parseJsonAttribute<JsonObject>('data-options', optionsJson) : null;

			return {
				default: <'action' | 'widget'> type,
				factory,
				from,
				id,
				importName,
				element,
				options,
				type: 'store'
			};
		}
	},

	'app-widget': {
		value(element: Element): WidgetTask {
			let id = element.getAttribute('data-uid') || element.getAttribute('id');
			const factory = element.getAttribute('data-factory');
			const from = element.getAttribute('data-from');
			const importName = element.getAttribute('data-import');
			const listenersJson = element.getAttribute('data-listeners');
			const optionsJson = element.getAttribute('data-options');
			const stateFrom = element.getAttribute('data-state-from');
			const stateJson = element.getAttribute('data-state');

			if (stateFrom && !factory) {
				throw new Error('app-widget requires data-factory attribute if data-state-from is given');
			}
			if (listenersJson && !factory) {
				throw new Error('app-widget requires data-factory attribute if data-listeners is given');
			}
			if (optionsJson && !factory) {
				throw new Error('app-widget requires data-factory attribute if data-options is given');
			}
			if (stateJson && !factory) {
				throw new Error('app-widget requires data-factory attribute if data-state is given');
			}

			// Without factory or from, assume the widget has already been defined elsewhere.
			if (!factory && !from) {
				return null;
			}

			if (factory && !id) {
				throw new Error('app-widget requires data-uid or id attribute if data-factory is given');
			}

			if (from && !id) {
				if (importName) {
					id = importName;
				}
				else {
					id = from.split('/').pop();
				}
			}

			if (!id) {
				throw new Error(`Could not determine ID for app-widget (from=${from} and import=${importName})`);
			}

			const listeners = listenersJson ? parseJsonAttribute<JsonObject>('data-listeners', listenersJson) : null;
			const options = optionsJson ? parseJsonAttribute<JsonObject>('data-options', optionsJson) : null;
			const state = stateJson ? parseJsonAttribute<JsonObject>('data-state', stateJson) : null;

			return {
				element,
				factory,
				from,
				id,
				importName,
				listeners,
				options,
				state,
				stateFrom,
				type: 'widget'
			};
		}
	}
});

function getRegistrationTasks(root: Element): Task[] {
	const allElements: Element[] = arrayFrom(root.getElementsByTagName('*'));
	allElements.unshift(root); // Be inclusive!

	const tasks: Task[] = [];
	for (const element of allElements) {
		let name: string;

		const tagName = element.tagName.toLowerCase();
		if (parsers[tagName]) {
			name = tagName;
		}
		else {
			const attrIs = (element.getAttribute('is') || '').toLowerCase();
			if (parsers[attrIs]) {
				name = attrIs;
			}
		}

		if (name) {
			const task = parsers[name](element);
			if (task) {
				tasks.push(task);
			}
		}
	}

	return tasks;
}

function createActionDefinition(
	resolveMid: ResolveMid,
	{
		factory,
		from,
		id,
		importName,
		state,
		stateFrom
	}: ActionTask
): ActionDefinition {
	return {
		id,
		factory(options) {
			if (factory) {
				return resolveMid<ActionFactory>(factory).then((factory) => {
					return factory(options);
				});
			}
			else {
				return resolveMid<ActionLike>(from, importName || 'default');
			}
		},
		state,
		stateFrom
	};
}

function loadMultipleActions(
	resolveMid: ResolveMid,
	{ from }: MultipleActionsTask
): Promise<ActionDefinition[]> {
	return resolveMid<{ [member: string]: ActionLike }>(from, RESOLVE_CONTENTS).then((contents) => {
		return Object.keys(contents).map((member) => {
			return {
				id: member,
				instance: contents[member]
			};
		});
	});
}

function createCustomElementDefinition(
	resolveMid: ResolveMid,
	{
		factory,
		name
	}: ElementTask
): CustomElementDefinition {
	return {
		factory(options) {
			return resolveMid<WidgetFactory>(factory)
				.then((factory) => factory(options));
		},
		name
	};
}

function createStoreDefinition(
	resolveMid: ResolveMid,
	{
		factory,
		from,
		id,
		importName,
		options
	}: StoreTask
): StoreDefinition {
	return {
		id,
		factory(options: any) {
			if (factory) {
				return resolveMid<StoreFactory>(factory)
					.then((factory) => factory(options));
			}
			else {
				return resolveMid<StoreLike>(from, importName || 'default');
			}
		},
		options
	};
}

function createWidgetDefinition(
	resolveMid: ResolveMid,
	{
		factory,
		from,
		id,
		importName,
		listeners,
		options,
		state,
		stateFrom
	}: WidgetTask
): WidgetDefinition {
	return {
		id,
		factory(options) {
			if (factory) {
				return resolveMid<WidgetFactory>(factory)
					.then((factory) => factory(options));
			}
			else {
				return resolveMid<WidgetLike>(from, importName || 'default');
			}
		},
		listeners,
		options,
		state,
		stateFrom
	};
}

/**
 * Provides resulting definition objects that were extracted from the root element.
 */
export interface Result {
	/**
	 * Actions that should be loaded into the app.
	 */
	actions: ActionDefinition[];

	/**
	 * Custom elements that should be loaded into the app.
	 */
	customElements: CustomElementDefinition[];

	/**
	 * Default action and widget stores that should be loaded into the app.
	 */
	defaultStores: { type: 'action' | 'widget', definition: StoreDefinition }[];

	/**
	 * Stores that should be loaded into the app.
	 */
	stores: StoreDefinition[];

	/**
	 * Widgets that should be loaded into the app.
	 */
	widgets: WidgetDefinition[];
}

/**
 * Extract action, custom element, store and widget definitions that should be loaded into the app.
 *
 * @param resolveMid Function to asynchronously resolve a module identifier
 * @param root The element within which registration elements can be found
 * @return A promise for the definition objects
 */
export default function extractRegistrationElements(resolveMid: ResolveMid, root: Element): Promise<Result> {
	return new Promise((resolve, reject) => {
		const result: Result = {
			actions: [],
			customElements: [],
			defaultStores: [],
			stores: [],
			widgets: []
		};
		const promises: Promise<void>[] = [];

		for (const task of getRegistrationTasks(root)) {
			switch (task.type) {
				case 'action':
					result.actions.push(createActionDefinition(resolveMid, <ActionTask> task));
					break;

				case 'element':
					result.customElements.push(createCustomElementDefinition(resolveMid, <ElementTask> task));
					break;

				case 'multiple-actions': {
					const promise = loadMultipleActions(resolveMid, <MultipleActionsTask> task)
						.then((actions) => {
							result.actions.push(...actions);
						});
					promises.push(promise);
					break;
				}

				case 'store': {
					const { default: type } = <StoreTask> task;
					const definition = createStoreDefinition(resolveMid, <StoreTask> task);
					if (type) {
						result.defaultStores.push({ type, definition });
					}
					else {
						result.stores.push(definition);
					}
					break;
				}

				case 'widget':
					result.widgets.push(createWidgetDefinition(resolveMid, <WidgetTask> task));
					// Forcibly add the possibly derived ID to the element, so the <app-widget> can be realized.
					task.element.setAttribute('data-uid', (<WidgetTask> task).id);
					break;
			}

			if (task.type !== 'widget') {
				remove(task.element);
			}
		}

		if (promises.length > 0) {
			Promise.all(promises)
				.then(() => resolve(result))
				.catch(reject);
		}
		else {
			resolve(result);
		}
	});
}
